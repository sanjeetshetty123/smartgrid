"""
GridMind Backend v2.1 - protection brain + Telegram alerts + per-load LCD status
Watches all telemetry (real + virtual), automatically:
  - detects overload faults per load -> trips that load only
  - detects overvoltage -> sheds low-priority loads first
  - feeds the ESP32's LCD with live totals AND per-load ON/OFF status
  - sends every alert to your phone via Telegram
  - logs everything to telemetry_log.csv for ML training

Run:  python backend.py     (with broker + virtual house already running)
"""

import csv
import json
import os
import threading
import time
import urllib.parse
import urllib.request

import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883

# ======== set these as environment variables (same values that worked in test_telegram.py) ========
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "PASTE_YOUR_TELEGRAM_TOKEN_HERE")
TELEGRAM_CHAT_IDS = [c for c in os.environ.get("TELEGRAM_CHAT_IDS", "").split(",") if c] or ["PASTE_YOUR_CHAT_ID"]
# =====================================================================================================

# ---------------- Protection settings ----------------
POWER_LIMITS = {"fan": 150, "ac": 2000, "washer": 2500}
OVERVOLT_TRIP = 250.0
OVERVOLT_CLEAR = 240.0
SHED_ORDER = ["washer", "ac"]        # least important first; fan = essential

CSV_FILE = "telemetry_log.csv"
SUMMARY_EVERY = 2

loads = {}
tripped = set()
shed = []
overvolt_active = False
last_summary = 0


def now():
    return time.strftime("%H:%M:%S")


# ---------------- Telegram ----------------

def send_telegram(msg):
    if "PASTE_YOUR" in TELEGRAM_TOKEN:
        print(f"[{now()}] (Telegram not configured - skipping)")
        return
    for chat_id in TELEGRAM_CHAT_IDS:
        url = (f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage?"
               f"chat_id={chat_id}&text=" + urllib.parse.quote(msg))
        try:
            urllib.request.urlopen(url, timeout=10)
            print(f"[{now()}] Telegram sent to {chat_id}")
        except Exception as e:
            print(f"[{now()}] Telegram FAILED for {chat_id}: {e}")


def alert(client, msg, detail=""):
    """Alert -> real buzzer + LCD + console + Telegram phone message."""
    print(f"[{now()}] *** ALERT: {msg}")
    client.publish("home1/alerts", msg)            # short: fits the 16x2 LCD
    full = f"⚡ GridMind Alert\n{msg}\n{detail}\nTime: {now()}"
    threading.Thread(target=send_telegram, args=(full,), daemon=True).start()


# ---------------- CSV logging ----------------

def log_csv(node, name, d):
    new = not os.path.exists(CSV_FILE)
    with open(CSV_FILE, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["ts", "node", "load", "v", "i", "p", "state"])
        w.writerow([d.get("ts"), node, name, d.get("v"),
                    d.get("i"), d.get("p"), d.get("state")])


# ---------------- Protection logic ----------------

def trip_load(client, name, reason, detail=""):
    if name in tripped:
        return
    tripped.add(name)
    client.publish(f"home1/virtual/{name}/cmd/auto", "OFF")
    alert(client, f"{reason}: {name.upper()} CUT", detail)


def clear_trip(name):
    """Re-arm protection for one load (called when it's manually switched back ON)."""
    tripped.discard(name)
    if name in shed:
        shed.remove(name)
    print(f"[{now()}] {name.upper()} manually restored - protection re-armed")


def check_overload(client, name, p):
    limit = POWER_LIMITS.get(name)
    if limit and abs(p) > limit and name not in tripped:
        print(f"[{now()}] Overload on '{name}': {p:.0f} W > {limit} W limit")
        trip_load(client, name, "OVERLOAD",
                  f"{name} was drawing {p:.0f} W (limit {limit} W).\n"
                  f"Load auto-disconnected. Other loads unaffected.")


def check_voltage(client, v):
    global overvolt_active
    if v > OVERVOLT_TRIP and not overvolt_active:
        overvolt_active = True
        print(f"[{now()}] OVERVOLTAGE {v:.0f} V - shedding non-essential loads")
        alert(client, f"HIGH VOLT {v:.0f}V",
              "Priority shedding active: non-essential loads disconnected, "
              "essential loads kept running.")
        for name in SHED_ORDER:
            if name in loads and loads[name].get("state") == 1:
                shed.append(name)
                client.publish(f"home1/virtual/{name}/cmd/auto", "OFF")
                print(f"[{now()}]   shed -> {name}")
    elif v < OVERVOLT_CLEAR and overvolt_active:
        overvolt_active = False
        print(f"[{now()}] Voltage normal ({v:.0f} V) - restoring shed loads")
        alert(client, "VOLT NORMAL", "Grid voltage back to safe range. "
              "Shed loads restored automatically.")
        while shed:
            name = shed.pop()
            client.publish(f"home1/virtual/{name}/cmd/auto", "ON")
            print(f"[{now()}]   restore -> {name}")


# ---------------- MQTT ----------------

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[{now()}] Backend connected to broker ({reason_code})")
    client.subscribe("home1/+/+/telemetry")
    client.subscribe("home1/virtual/+/cmd/manual")   # re-arm on manual ON
    client.subscribe("home1/reset")                  # full demo reset


def on_message(client, userdata, msg):
    global overvolt_active
    topic = msg.topic
    payload = msg.payload.decode()

    if topic == "home1/reset":
        tripped.clear()
        shed.clear()
        overvolt_active = False
        print(f"[{now()}] System reset - all loads re-armed")
        alert(client, "System reset - all loads re-armed")
        return

    if topic.startswith("home1/virtual/") and topic.endswith("/cmd/manual"):
        name = topic.split("/")[2]
        if payload.upper() == "ON":
            clear_trip(name)
        return

    parts = topic.split("/")
    if len(parts) != 4 or parts[3] != "telemetry":
        return
    _, node, name, _ = parts
    try:
        d = json.loads(payload)
    except json.JSONDecodeError:
        return
    loads[name] = d
    log_csv(node, name, d)
    check_overload(client, name, d.get("p", 0))
    check_voltage(client, d.get("v", 230))


def main():
    global last_summary
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id="backend-brain")
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(BROKER, PORT, 60)
    client.loop_start()
    print("Backend brain v2.1 running (with Telegram + LCD load status). Watching all loads...\n")
    send_telegram("✅ GridMind backend started at " + now())

    while True:
        time.sleep(0.2)
        if time.time() - last_summary > SUMMARY_EVERY:
            last_summary = time.time()
            total = sum(d.get("p", 0) for d in loads.values())
            active = sum(1 for d in loads.values() if d.get("state") == 1)

            # Per-load ON/OFF status for the ESP32's LCD (4th screen) and
            # for the "load just turned ON" confirmation beep.
            # Format: "FAN:ON|AC:ON|WAS:OFF"  (solar excluded - it's generation)
            status_str = "|".join(
                f"{n[:3].upper()}:{'ON' if d.get('state') == 1 else 'OFF'}"
                for n, d in sorted(loads.items()) if n != "solar"
            )
            client.publish("home1/summary", f"P:{total:.0f}|L:{active}|S:{status_str}")

            status = " ".join(f"{n}:{d.get('p', 0):.0f}W"
                              for n, d in sorted(loads.items()))
            flags = ""
            if tripped: flags += f"  TRIPPED:{','.join(tripped)}"
            if overvolt_active: flags += "  OVERVOLT!"
            print(f"[{now()}] total {total:7.0f} W | {status}{flags}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBackend stopped.")
