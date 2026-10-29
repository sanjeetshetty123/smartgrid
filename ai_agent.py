"""
Smart Grid - Autonomous Energy Agent (Tier 2)
==============================================================
An LLM-powered AGENT that watches the home and, when power approaches the
safety limit, DECIDES the smartest action (which load to shed or delay) based
on load priorities + available solar, then ACTS on it and explains why.

This is different from backend.py's fixed rule ("overload -> cut fan").
The agent reasons about the WHOLE situation and picks the optimal move.

Modes (set MODE below):
  "advisory" : agent decides + explains, but does NOT send commands (safe).
  "active"   : agent also PUBLISHES the shed command to control the load.

Dashboard: open http://localhost:5006 to watch the agent think live.

Run:  python ai_agent.py   (needs the broker + virtual_house + backend running)
"""

import os
import json
import time
import threading
from collections import deque
from datetime import datetime

import requests
import paho.mqtt.client as mqtt
from flask import Flask, jsonify, Response
from flask_cors import CORS

# =================== CONFIG ===================
BROKER = "localhost"
PORT = 1883
WEB_PORT = 5006

MODE = "active"              # "advisory" (only recommends) or "active" (acts)
SAFETY_LIMIT_W = 2000        # the grid's max safe load
TRIGGER_W = 1700             # agent starts reasoning when load crosses this
RESTORE_W = 1200             # agent restores shed loads when load drops below this
DECISION_COOLDOWN = 12       # seconds between agent actions (avoid spamming)

# ---- Load priorities the agent reasons with ----
# tier: 1=essential (never shed), 2=comfort, 3=deferrable (ok to delay)
LOAD_INFO = {
    "FAN": {"name": "Fan",          "watts": 70,   "tier": 2},
    "AC":  {"name": "Air Conditioner","watts": 1500, "tier": 2},
    "WAS": {"name": "Washing Machine","watts": 2000, "tier": 3},
}

# ---- Control wiring (matches your virtual_house.py exactly) ----
# virtual_house listens on home1/virtual/<name>/cmd/manual for "ON"/"OFF".
# The summary status uses 3-letter keys (WAS), so map them to real names.
CONTROL_TOPIC_TMPL = "home1/virtual/{load}/cmd/manual"
LOAD_CMD_NAME = {"FAN": "fan", "AC": "ac", "WAS": "washer"}
SHED_PAYLOAD = "OFF"
RESTORE_PAYLOAD = "ON"
# Washer is a cycle, not a steady load: restoring it would restart a 2000W
# heating phase, so the agent DELAYS (cancels) it and does not auto-restore it.
NO_AUTO_RESTORE = {"WAS"}

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "PASTE_YOUR_GROQ_KEY_HERE")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
GROQ_MODEL = "llama-3.1-8b-instant"
# ==============================================

app = Flask(__name__)
CORS(app)

live = {"total_power": None, "loads": {}, "solar": 0, "updated": None}
decisions = deque(maxlen=30)     # agent's decision log
agent_shed = set()               # loads the AGENT shed (so it can restore them)
last_action_time = 0
mqtt_client = None

_NON_CHAT = ("whisper", "tts", "orpheus", "playai", "audio", "guard",
             "embed", "vision", "moderation", "rerank", "speech")
_CHAT_PREF = ("llama-3.1-8b", "gpt-oss-20", "gemma2", "llama-3.3-70b",
              "llama-4-scout", "qwen3", "kimi", "deepseek",
              "gpt-oss-120", "llama-4-maverick", "llama-3", "llama",
              "mixtral", "compound")


def resolve_model():
    global GROQ_MODEL
    if GROQ_API_KEY.startswith("PASTE_"):
        return
    try:
        r = requests.get(GROQ_MODELS_URL,
                         headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                         timeout=15)
        r.raise_for_status()
        avail = [m["id"] for m in r.json().get("data", [])]
        chat = [m for m in avail if not any(x in m.lower() for x in _NON_CHAT)]
        chosen = None
        for sub in _CHAT_PREF:
            for m in chat:
                if sub in m.lower():
                    chosen = m; break
            if chosen: break
        if chosen is None and chat:
            chosen = chat[0]
        if chosen:
            GROQ_MODEL = chosen
        print(">>> Agent using Groq model:", GROQ_MODEL)
    except Exception as e:
        print("model resolve failed:", e)


def call_groq(messages, max_tokens=400):
    if GROQ_API_KEY.startswith("PASTE_"):
        return None
    for attempt in range(4):
        try:
            r = requests.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": GROQ_MODEL, "messages": messages,
                      "temperature": 0.2, "max_tokens": max_tokens},
                timeout=30)
            if r.status_code == 429:
                wait = 2.0
                try:
                    import re
                    m = re.search(r"try again in ([\d.]+)s", r.text)
                    if m:
                        wait = min(float(m.group(1)) + 0.3, 8)
                except Exception:
                    pass
                time.sleep(wait)
                continue
            if r.status_code != 200:
                print("LLM error:", r.text[:200]); return None
            return r.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            print("LLM exception:", e); return None
    print("LLM rate-limited after retries"); return None


# ---------------- MQTT in ----------------
def parse_summary(msg):
    try:
        for p in msg.split("|"):
            if p.startswith("P:"):
                live["total_power"] = float(p[2:])
        s = msg.find("S:")
        if s >= 0:
            loads = {}
            for seg in msg[s + 2:].split("|"):
                if ":" in seg:
                    k, v = seg.split(":", 1)
                    loads[k.strip()] = v.strip()
            live["loads"] = loads
        live["updated"] = time.time()
    except Exception as e:
        print("parse err:", e)


def on_connect(c, u, f, rc, props=None):
    print(f"Agent connected to broker ({rc}) | MODE = {MODE}")
    c.subscribe("home1/summary")
    c.subscribe("home1/virtual/solar/telemetry")   # real solar generation


def on_message(c, u, msg):
    if msg.topic == "home1/summary":
        parse_summary(msg.payload.decode(errors="ignore"))
    elif msg.topic == "home1/virtual/solar/telemetry":
        try:
            d = json.loads(msg.payload.decode())
            p = d.get("p", 0)          # solar p is negative = generation
            live["solar"] = round(abs(p)) if p < 0 else 0
        except Exception:
            pass


# ---------------- The agent brain ----------------
def agent_prompt():
    on_loads = [k for k, v in live["loads"].items() if v == "ON"]
    lines = []
    for k in on_loads:
        info = LOAD_INFO.get(k, {"name": k, "watts": "?", "tier": 2})
        tiername = {1: "ESSENTIAL", 2: "comfort", 3: "deferrable"}[info["tier"]]
        lines.append(f"  - {k} ({info['name']}): ~{info['watts']}W, {tiername}")
    loads_desc = "\n".join(lines) or "  (none)"
    return (
        f"SITUATION:\n"
        f"- Total load now: {live['total_power']} W\n"
        f"- Safety limit: {SAFETY_LIMIT_W} W\n"
        f"- Solar available: {live['solar']} W\n"
        f"- Loads currently ON:\n{loads_desc}\n\n"
        f"You are the home grid's autonomous energy agent. The load is near or "
        f"over the safety limit and you must act to protect the grid.\n"
        f"Rules: NEVER shed ESSENTIAL loads. Prefer to shed/delay the load that "
        f"brings the most relief with least disruption. Deferrable loads "
        f"(washing machine) are best to delay. Shedding one big comfort load "
        f"(AC) may be enough.\n\n"
        f"Decide ONE action. Respond ONLY with JSON:\n"
        f'{{"action": "SHED" | "DELAY" | "KEEP_ALL", '
        f'"target": "<load key e.g. AC, or null>", '
        f'"reason": "<one sentence>"}}'
    )


def log_decision(d):
    d["time"] = datetime.now().strftime("%H:%M:%S")
    decisions.append(d)
    print(f"[{d['time']}] AGENT: {d.get('action')} {d.get('target') or ''} "
          f"-> {d.get('reason')}")


def act_shed(target_key):
    """Active mode: physically shed/delay the chosen load."""
    if MODE != "active" or not target_key or not mqtt_client:
        return
    name = LOAD_CMD_NAME.get(target_key)
    if not name:
        print(f"   -> unknown load '{target_key}', not acting")
        return
    topic = CONTROL_TOPIC_TMPL.format(load=name)
    mqtt_client.publish(topic, SHED_PAYLOAD)
    agent_shed.add(target_key)
    print(f"   -> ACTIVE: published '{SHED_PAYLOAD}' to {topic}")


def act_restore(target_key):
    """Bring back a load the agent previously shed."""
    if MODE != "active" or not mqtt_client:
        return
    name = LOAD_CMD_NAME.get(target_key)
    if not name:
        return
    topic = CONTROL_TOPIC_TMPL.format(load=name)
    mqtt_client.publish(topic, RESTORE_PAYLOAD)
    agent_shed.discard(target_key)
    d = {"action": "RESTORE", "target": target_key, "mode": MODE,
         "load_at_decision": live.get("total_power"),
         "reason": f"Load dropped below {RESTORE_W}W and solar/headroom is "
                   f"available, so {LOAD_INFO[target_key]['name']} is safe to "
                   f"bring back."}
    log_decision(d)
    mqtt_client.publish("home1/ai/decision", json.dumps(d))


def agent_loop():
    global last_action_time
    while True:
        time.sleep(2)
        tp = live["total_power"]
        if tp is None:
            continue
        if time.time() - last_action_time < DECISION_COOLDOWN:
            continue

        # --- RESTORE: load has dropped and we have loads we shed earlier ---
        if tp < RESTORE_W and agent_shed:
            # restore one at a time, skipping washer (would restart its cycle)
            restorable = [k for k in agent_shed if k not in NO_AUTO_RESTORE]
            if restorable:
                act_restore(restorable[0])
                last_action_time = time.time()
            else:
                agent_shed.difference_update(NO_AUTO_RESTORE)  # forget washer
            continue

        # --- SHED: only reason when load is high ---
        if tp < TRIGGER_W:
            continue

        raw = call_groq([
            {"role": "system", "content": "You are a precise energy-management "
             "agent. Output only valid JSON, nothing else."},
            {"role": "user", "content": agent_prompt()},
        ])
        if not raw:
            continue
        try:
            start = raw.find("{"); end = raw.rfind("}") + 1
            d = json.loads(raw[start:end])
        except Exception:
            d = {"action": "KEEP_ALL", "target": None,
                 "reason": "could not parse decision"}

        target = d.get("target")
        # Guard: only act if the chosen load is actually ON right now.
        if d.get("action") in ("SHED", "DELAY") and target:
            if live["loads"].get(target) != "ON":
                d["action"] = "KEEP_ALL"
                d["reason"] = (f"{target} is already off; no further safe "
                               f"shedding available.")
                target = None

        d["load_at_decision"] = tp
        d["mode"] = MODE
        log_decision(d)

        if d.get("action") in ("SHED", "DELAY") and target:
            act_shed(target)
            if mqtt_client:
                mqtt_client.publish("home1/ai/decision", json.dumps(d))

        last_action_time = time.time()


def start_mqtt():
    global mqtt_client
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                              client_id="ai-agent")
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    while True:
        try:
            mqtt_client.connect(BROKER, PORT, 60); break
        except Exception as e:
            print(f"Broker not ready ({e}) - retry 3s"); time.sleep(3)
    mqtt_client.loop_forever()


# ---------------- Web ----------------
@app.route("/state")
def state():
    return jsonify({"live": live, "mode": MODE,
                    "decisions": list(decisions)[-15:]})


@app.route("/")
def home():
    return Response(PAGE, mimetype="text/html")


PAGE = """
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autonomous Energy Agent</title><style>
 :root{--bg:#0d1117;--card:#161b22;--line:#30363d;--txt:#e6edf3;
       --accent:#bb6bd9;--ok:#3fb950;--warn:#f85149;--mut:#8b949e}
 *{box-sizing:border-box;font-family:system-ui,Segoe UI,sans-serif}
 body{margin:0;background:var(--bg);color:var(--txt);padding:24px}
 h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);margin-bottom:20px;font-size:13px}
 .row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
       padding:16px 18px;min-width:160px}
 .k{color:var(--mut);font-size:11px;text-transform:uppercase}
 .v{font-size:26px;font-weight:700;margin-top:4px}
 .mode{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;
       border:1px solid var(--accent);color:var(--accent)}
 .feed{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px}
 .dec{border-left:3px solid var(--accent);padding:10px 14px;margin:8px;border-radius:4px;
      background:var(--bg)}
 .dec .act{font-weight:700;color:var(--accent)}
 .dec .why{color:var(--txt);font-size:14px;margin-top:4px}
 .dec .meta{color:var(--mut);font-size:11px;margin-top:4px}
 .shed{border-left-color:var(--warn)}.shed .act{color:var(--warn)}
 .keep{border-left-color:var(--ok)}.keep .act{color:var(--ok)}
 .empty{color:var(--mut);padding:20px;text-align:center}
</style></head><body>
 <h1>🤖 Autonomous Energy Agent</h1>
 <div class="sub">An LLM agent that decides how to protect the grid — live reasoning below.</div>
 <div class="row">
   <div class="card"><div class="k">Total Load</div><div class="v" id="pw">—</div></div>
   <div class="card"><div class="k">Safety Limit</div><div class="v">2000 W</div></div>
   <div class="card"><div class="k">Mode</div><div class="v"><span class="mode" id="mode">—</span></div></div>
 </div>
 <div class="k" style="margin:0 0 8px">AGENT DECISION FEED</div>
 <div class="feed" id="feed"><div class="empty">Waiting for high load... (agent acts above 1700 W)</div></div>
<script>
async function tick(){
 try{const r=await fetch('/state');const d=await r.json();
  document.getElementById('pw').innerText=(d.live.total_power??'—')+' W';
  document.getElementById('mode').innerText=d.mode;
  const f=document.getElementById('feed');
  if(!d.decisions.length){return;}
  f.innerHTML=d.decisions.slice().reverse().map(x=>{
    const cls=x.action==='KEEP_ALL'?'keep':(x.action==='SHED'?'shed':'');
    return `<div class="dec ${cls}">
      <span class="act">${x.action} ${x.target||''}</span>
      <div class="why">${x.reason||''}</div>
      <div class="meta">${x.time} · load was ${x.load_at_decision} W · ${x.mode} mode</div>
    </div>`;}).join('');
 }catch(e){}
}
setInterval(tick,1500);tick();
</script></body></html>
"""

if __name__ == "__main__":
    resolve_model()
    threading.Thread(target=start_mqtt, daemon=True).start()
    threading.Thread(target=agent_loop, daemon=True).start()
    print(f"\n  Agent running ({MODE} mode) -> http://localhost:{WEB_PORT}\n")
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False)
