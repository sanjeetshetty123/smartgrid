"""
GridMind Backend v2.2 - protection brain + Twilio Voice Call alerts + per-load LCD status
Watches all telemetry (real + virtual), automatically:
  - detects overload faults per load -> trips that load only
  - detects overvoltage -> sheds low-priority loads first
  - feeds the ESP32's LCD with live totals AND per-load ON/OFF status
  - triggers automated emergency voice call alerts to your phone via Twilio
  - logs everything to telemetry_log.csv for ML training

Run:  python backend.py     (with broker + virtual house already running)
"""

import csv
import json
import os
import sys
import threading
import time

# Ensure UTF-8 output if supported
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import paho.mqtt.client as mqtt

try:
    from twilio.rest import Client as TwilioClient
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False

BROKER = "localhost"
PORT = 1883

# ======== Twilio Voice Call Settings ========
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "AC86d18a00ece430acd64bbf0bb66fa96b")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "6e16975d0fb2ec5a7476a26272407cfe")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "+16318007291")

raw_to_numbers = os.environ.get("TWILIO_TO_PHONE_NUMBER", "") or os.environ.get("ALERT_PHONE_NUMBER", "")
TWILIO_TO_PHONE_NUMBERS = [n.strip() for n in raw_to_numbers.split(",") if n.strip()]

twilio_client = None
if TWILIO_AVAILABLE and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    except Exception as e:
        print(f"Failed to initialize Twilio: {e}")
# ============================================

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

last_call_time = 0
CALL_COOLDOWN_SECONDS = 30  # Debounce: avoid placing calls more than once every 30s


def now():
    return time.strftime("%H:%M:%S")


# ---------------- Twilio Voice Alerts ----------------

def trigger_voice_call(msg, detail=""):
    """Initiates an automated emergency voice phone call via Twilio."""
    global last_call_time
    now_ts = time.time()
    if now_ts - last_call_time < CALL_COOLDOWN_SECONDS:
        print(f"[{now()}] Voice call cooldown active ({int(CALL_COOLDOWN_SECONDS - (now_ts - last_call_time))}s left) - skipping duplicate call")
        return

    if not twilio_client:
        print(f"[{now()}] (Twilio client not initialized or SDK missing - skipping voice call)")
        return

    if not TWILIO_TO_PHONE_NUMBERS:
        print(f"[{now()}] (Twilio voice alert not dispatched: TWILIO_TO_PHONE_NUMBER not set in .env)")
        return

    # Clean text for TwiML voice synthesis
    spoken_text = f"Attention. GridMind Emergency Alert. {msg}. {detail}. Please check your microgrid system immediately."
    spoken_text = spoken_text.replace("&", "and").replace("<", "").replace(">", "").replace('"', "")

    twiml = (
        f"<Response>"
        f"<Say voice=\"alice\" loop=\"2\">"
        f"{spoken_text}"
        f"</Say>"
        f"<Pause length=\"1\"/>"
        f"<Say voice=\"alice\">Repeating alert. {msg}.</Say>"
        f"</Response>"
    )

    last_call_time = now_ts
    for to_number in TWILIO_TO_PHONE_NUMBERS:
        try:
            # Ensure number starts with +
            dest = to_number if to_number.startswith("+") else ("+91" + to_number if len(to_number) == 10 else "+" + to_number)
            call = twilio_client.calls.create(
                twiml=twiml,
                to=dest,
                from_=TWILIO_PHONE_NUMBER
            )
            print(f"[{now()}] [CALL] Twilio voice call initiated to {dest} (Call SID: {call.sid})")
        except Exception as e:
            print(f"[{now()}] [ERROR] Twilio voice call FAILED to {to_number}: {e}")


def alert(client, msg, detail=""):
    """Alert -> real buzzer + LCD + console + Twilio phone voice call."""
    print(f"[{now()}] *** ALERT: {msg}")
    client.publish("home1/alerts", msg)            # short: fits the 16x2 LCD
    threading.Thread(target=trigger_voice_call, args=(msg, detail), daemon=True).start()


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
    
    print("Backend brain v2.2 running (with Twilio Voice Call Alerts + LCD load status). Watching all loads...")
    dest_str = ', '.join(TWILIO_TO_PHONE_NUMBERS) if TWILIO_TO_PHONE_NUMBERS else '[Set TWILIO_TO_PHONE_NUMBER in .env]'
    print(f"[{now()}] Twilio Voice Alerts armed: From {TWILIO_PHONE_NUMBER} -> To {dest_str}\n")

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
