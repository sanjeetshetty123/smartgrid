"""
Smart Grid - AI Brain (Tier 1)
==============================================================
A self-contained AI layer that sits ON TOP of your existing system.
It does NOT modify backend.py, virtual_house.py, or your dashboard.

What it does
------------
1. CHAT ASSISTANT  - a chatbox (open http://localhost:5005) where a judge
   can ask things like "why did my power spike?" or "how do I save energy?"
   and the LLM answers using the home's LIVE state + recent history.

2. ANOMALY EXPLAINER - when your ml_backend.py flags an anomaly, this turns
   the raw "ANOMALY!" flag into a plain-English explanation + recommended
   action, and publishes it back on MQTT (home1/ai/explanation) so any
   dashboard can show it.

How it stays live
-----------------
It subscribes to the MQTT topics your system already publishes:
   home1/summary        -> "P:1543|L:4|S:FAN:ON|AC:ON|WAS:OFF"
   home1/alerts         -> alert text
   home1/ml/analysis    -> JSON from ml_backend.py
   home1/ml/nilm_event  -> JSON NILM detections
...and keeps a rolling in-memory history, so the LLM always has context.

Run
---
   pip install flask flask-cors paho-mqtt requests
   set GROQ_API_KEY=your_key_here        (Windows CMD)
   python ai_brain.py
   then open http://localhost:5005
"""

import os
import json
import time
import threading
from collections import deque
from datetime import datetime

import requests
import paho.mqtt.client as mqtt
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

# =================== CONFIG ===================
BROKER = "localhost"
PORT = 1883
WEB_PORT = 5005

# Get a free key at https://console.groq.com  -> API Keys
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "PASTE_YOUR_GROQ_KEY_HERE")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
# Known-good CHAT models, in order of preference. The resolver only ever
# picks from THIS allowlist (so it never grabs a TTS/audio model by mistake).
# llama-3.1-8b-instant is first: fast, free, no terms acceptance needed.
GROQ_MODEL_PREFS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama3-8b-8192",
    "llama3-70b-8192",
    "gemma2-9b-it",
]
# Safe default if the /models lookup fails for any reason.
GROQ_MODEL = "llama-3.1-8b-instant"
# ==============================================

app = Flask(__name__)
CORS(app)

# ---------------- Live state (updated by MQTT) ----------------
live = {
    "total_power": None,
    "active_count": None,
    "loads": {},            # {"FAN": "ON", "AC": "OFF", ...}
    "last_alert": "none",
    "is_anomaly": False,
    "anomaly_score": None,
    "fault": False,
    "updated": None,
}
power_history = deque(maxlen=120)   # last ~2 min of (time, watts)
event_log = deque(maxlen=40)        # recent alerts + NILM detections
last_explanation = {"text": "", "ts": 0}

mqtt_client = None


def log_event(text):
    stamp = datetime.now().strftime("%H:%M:%S")
    event_log.append(f"[{stamp}] {text}")


# ---------------- MQTT ----------------
def parse_summary(msg):
    """ 'P:1543|L:4|S:FAN:ON|AC:ON|WAS:OFF' -> update live state """
    try:
        parts = msg.split("|")
        for p in parts:
            if p.startswith("P:"):
                live["total_power"] = float(p[2:])
            elif p.startswith("L:"):
                live["active_count"] = int(p[2:])
        s_idx = msg.find("S:")
        if s_idx >= 0:
            status = msg[s_idx + 2:]
            loads = {}
            for seg in status.split("|"):
                if ":" in seg:
                    k, v = seg.split(":", 1)
                    loads[k.strip()] = v.strip()
            live["loads"] = loads
        live["updated"] = time.time()
        if live["total_power"] is not None:
            power_history.append((time.time(), live["total_power"]))
    except Exception as e:
        print("parse_summary error:", e)


def on_connect(c, u, f, rc, props=None):
    print(f"AI Brain connected to broker ({rc})")
    c.subscribe("home1/summary")
    c.subscribe("home1/alerts")
    c.subscribe("home1/ml/analysis")
    c.subscribe("home1/ml/nilm_event")


def on_message(c, u, msg):
    topic = msg.topic
    payload = msg.payload.decode(errors="ignore")

    if topic == "home1/summary":
        parse_summary(payload)

    elif topic == "home1/alerts":
        live["last_alert"] = payload
        log_event(f"ALERT: {payload}")

    elif topic == "home1/ml/analysis":
        try:
            data = json.loads(payload)
            was_anom = live["is_anomaly"]
            live["is_anomaly"] = bool(data.get("is_anomaly"))
            live["anomaly_score"] = data.get("anomaly_score")
            live["fault"] = bool(data.get("fault"))
            live["total_power"] = data.get("total_power", live["total_power"])
            # Fire the explainer only on a NEW anomaly (rising edge)
            if live["is_anomaly"] and not was_anom:
                threading.Thread(target=explain_anomaly, daemon=True).start()
        except Exception as e:
            print("analysis parse error:", e)

    elif topic == "home1/ml/nilm_event":
        try:
            ev = json.loads(payload)
            log_event(f"NILM: {ev.get('actual')} {ev.get('action')} "
                      f"(detected {ev.get('detected')}, "
                      f"{ev.get('confidence')}%)")
        except Exception:
            pass


def start_mqtt():
    global mqtt_client
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                              client_id="ai-brain")
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    # Keep retrying until the broker is up, so start order doesn't matter.
    while True:
        try:
            mqtt_client.connect(BROKER, PORT, 60)
            break
        except Exception as e:
            print(f"Broker not ready ({e}) - retrying in 3s. "
                  f"Start mosquitto, this will connect automatically.")
            time.sleep(3)
    mqtt_client.loop_forever()


# ---------------- LLM ----------------
# Substrings that mark a model as NOT a chat model (never pick these).
_NON_CHAT = ("whisper", "tts", "orpheus", "playai", "audio", "guard",
             "embed", "vision", "moderation", "rerank", "speech")
# Preferred chat-model substrings, best first. The resolver picks the
# available model matching the earliest substring here.
# Lighter/faster models first: they use fewer tokens and have higher free
# rate limits, so the demo doesn't hit the 8000 tokens-per-minute wall.
_CHAT_PREF = ("llama-3.1-8b", "gpt-oss-20", "gemma2", "llama-3.3-70b",
              "llama-4-scout", "qwen3", "kimi", "deepseek",
              "gpt-oss-120", "llama-4-maverick", "llama-3", "llama",
              "mixtral", "compound")

available_models = []


def resolve_model():
    """Ask Groq which models this key can use and auto-pick the best CHAT
    model from whatever is actually available (works with any catalog)."""
    global GROQ_MODEL, available_models
    if GROQ_API_KEY.startswith("PASTE_"):
        return
    try:
        r = requests.get(GROQ_MODELS_URL,
                         headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                         timeout=15)
        r.raise_for_status()
        available_models = [m["id"] for m in r.json().get("data", [])]
        print("Groq models available to your key:")
        for m in available_models:
            print("   -", m)

        # keep only chat-capable models
        chat = [m for m in available_models
                if not any(x in m.lower() for x in _NON_CHAT)]

        chosen = None
        for sub in _CHAT_PREF:                       # best match by preference
            for m in chat:
                if sub in m.lower():
                    chosen = m
                    break
            if chosen:
                break
        if chosen is None and chat:                  # any chat model at all
            chosen = chat[0]

        if chosen:
            GROQ_MODEL = chosen
        print("\n>>> Using Groq model:", GROQ_MODEL, "\n")
    except Exception as e:
        print(f"Could not list Groq models ({e}); using default {GROQ_MODEL}")


def call_groq(messages, max_tokens=500):
    if GROQ_API_KEY.startswith("PASTE_"):
        return ("[No API key set. Set GROQ_API_KEY and restart. "
                "Get a free key at console.groq.com]")
    if GROQ_MODEL is None:
        resolve_model()
    if GROQ_MODEL is None:
        return "[Could not find a usable Groq model for your key. Check the terminal.]"
    for attempt in range(4):            # retry a few times on rate limits
        try:
            r = requests.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": GROQ_MODEL, "messages": messages,
                      "temperature": 0.4, "max_tokens": max_tokens},
                timeout=30,
            )
            if r.status_code == 429:
                # rate limited: wait the suggested time (or ~2s) and retry
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
                return f"[LLM error {r.status_code}: {r.text[:300]}]"
            return r.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            return f"[LLM error: {e}]"
    return "[The AI is busy (rate limit). Please ask again in a few seconds.]"


def context_snapshot():
    """Build a compact text picture of the home for the LLM."""
    loads_str = ", ".join(f"{k}={v}" for k, v in live["loads"].items()) or "unknown"
    # recent power trend
    trend = "no data"
    if len(power_history) >= 2:
        recent = [w for _, w in list(power_history)[-10:]]
        trend = f"{recent[0]:.0f}W -> {recent[-1]:.0f}W (last {len(recent)} samples)"
    events = "; ".join(list(event_log)[-6:]) or "none"
    return (
        f"LIVE HOME STATE (updated {int(time.time()-(live['updated'] or time.time()))}s ago):\n"
        f"- Total power now: {live['total_power']} W\n"
        f"- Appliances on: {live['active_count']}\n"
        f"- Per-load status: {loads_str}\n"
        f"- Recent power trend: {trend}\n"
        f"- Anomaly active: {live['is_anomaly']} (score {live['anomaly_score']})\n"
        f"- Fault injected: {live['fault']}\n"
        f"- Last protection alert: {live['last_alert']}\n"
        f"- Recent events: {events}\n"
        f"NOTE: overload safety limit is ~2000 W. FAN~70W, AC~1200W, "
        f"WASHER~500W, KETTLE~1500W, FRIDGE~150W, LED~10W (approx)."
    )


SYSTEM_PROMPT = (
    "You are the AI assistant inside an AI-Powered Smart Grid home energy "
    "management system (a student engineering project). You can see the "
    "home's live electrical state. Answer the user's questions about their "
    "energy use clearly and briefly, like a helpful energy advisor. Use the "
    "numbers in the LIVE HOME STATE. If asked why something happened, reason "
    "from the loads and the power trend. Keep answers to 2-4 sentences unless "
    "asked for detail. Never invent data you don't have."
)


def explain_anomaly():
    """Auto-called on a new anomaly: produce a plain-English explanation."""
    time.sleep(0.5)  # let the state settle
    prompt = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": (
            context_snapshot() +
            "\n\nAn ANOMALY was just detected. In 2-3 sentences: explain in "
            "plain English what is likely abnormal, the probable cause, and "
            "the recommended action. Be specific about the appliances/power.")},
    ]
    text = call_groq(prompt, max_tokens=250)
    last_explanation["text"] = text
    last_explanation["ts"] = time.time()
    log_event(f"AI EXPLAINED ANOMALY")
    print("\n--- AI ANOMALY EXPLANATION ---\n" + text + "\n")
    if mqtt_client:
        mqtt_client.publish("home1/ai/explanation", text)


# ---------------- Web API ----------------
@app.route("/state")
def state():
    return jsonify({
        "live": live,
        "events": list(event_log)[-10:],
        "explanation": last_explanation,
    })


@app.route("/chat", methods=["POST"])
def chat():
    q = (request.json or {}).get("message", "").strip()
    if not q:
        return jsonify({"reply": "Ask me something about your home's energy."})
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": context_snapshot() +
         f"\n\nUser question: {q}"},
    ]
    reply = call_groq(messages)
    return jsonify({"reply": reply})


@app.route("/")
def home():
    return Response(PAGE, mimetype="text/html")


# ---------------- Chat UI (single page) ----------------
PAGE = """
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Smart Grid - AI Assistant</title>
<style>
 :root{--bg:#0d1117;--card:#161b22;--line:#30363d;--txt:#e6edf3;
       --accent:#58a6ff;--ok:#3fb950;--warn:#f85149;--mut:#8b949e;}
 *{box-sizing:border-box;font-family:system-ui,Segoe UI,Roboto,sans-serif}
 body{margin:0;background:var(--bg);color:var(--txt);display:flex;height:100vh}
 .side{width:320px;background:var(--card);border-right:1px solid var(--line);
       padding:16px;overflow:auto}
 .main{flex:1;display:flex;flex-direction:column}
 h1{font-size:18px;margin:0 0 2px} .sub{color:var(--mut);font-size:12px;margin-bottom:16px}
 .stat{background:var(--bg);border:1px solid var(--line);border-radius:8px;
       padding:10px 12px;margin-bottom:8px}
 .stat .k{color:var(--mut);font-size:11px;text-transform:uppercase}
 .stat .v{font-size:20px;font-weight:600}
 .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;margin:2px}
 .on{background:rgba(63,185,80,.15);color:var(--ok);border:1px solid var(--ok)}
 .off{background:rgba(139,148,158,.1);color:var(--mut);border:1px solid var(--line)}
 .anom{background:rgba(248,81,73,.15);color:var(--warn);border:1px solid var(--warn)}
 .explain{border:1px solid var(--warn);background:rgba(248,81,73,.08);
          border-radius:8px;padding:10px;font-size:13px;margin-top:8px;display:none}
 .chat{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
 .msg{max-width:75%;padding:10px 14px;border-radius:12px;line-height:1.45;font-size:14px}
 .me{align-self:flex-end;background:var(--accent);color:#04121f}
 .ai{align-self:flex-start;background:var(--card);border:1px solid var(--line)}
 .bar{display:flex;gap:8px;padding:14px;border-top:1px solid var(--line);background:var(--card)}
 input{flex:1;background:var(--bg);border:1px solid var(--line);border-radius:8px;
       padding:12px;color:var(--txt);font-size:14px}
 button{background:var(--accent);border:0;border-radius:8px;padding:0 18px;
        color:#04121f;font-weight:600;cursor:pointer}
 .chips{padding:0 14px 10px;display:flex;gap:8px;flex-wrap:wrap}
 .chip{font-size:12px;color:var(--accent);border:1px solid var(--line);
       border-radius:14px;padding:5px 10px;cursor:pointer;background:var(--bg)}
 .ev{font-size:11px;color:var(--mut);margin:2px 0}
</style></head><body>
<div class="side">
  <h1>⚡ AI Assistant</h1><div class="sub">Live home energy brain</div>
  <div class="stat"><div class="k">Total Power</div><div class="v" id="pw">—</div></div>
  <div class="stat"><div class="k">Appliances</div><div id="loads">—</div></div>
  <div class="stat"><div class="k">Status</div><div class="v" id="status">—</div></div>
  <div class="explain" id="explain"></div>
  <div class="k" style="color:var(--mut);font-size:11px;margin-top:14px">RECENT EVENTS</div>
  <div id="events"></div>
</div>
<div class="main">
  <div class="chat" id="chat">
    <div class="msg ai">Hi! I can see your home's live power. Ask me anything —
       why a spike happened, how to save energy, what's running now.</div>
  </div>
  <div class="chips">
    <div class="chip" onclick="ask(this.innerText)">Why is my power high right now?</div>
    <div class="chip" onclick="ask(this.innerText)">How can I reduce my bill?</div>
    <div class="chip" onclick="ask(this.innerText)">What's running and how much does each cost?</div>
    <div class="chip" onclick="ask(this.innerText)">Explain the last alert</div>
  </div>
  <div class="bar">
    <input id="q" placeholder="Ask about your home's energy..."
           onkeydown="if(event.key==='Enter')send()">
    <button onclick="send()">Send</button>
  </div>
</div>
<script>
async function refresh(){
  try{
    const r=await fetch('/state'); const d=await r.json(); const L=d.live;
    document.getElementById('pw').innerText=(L.total_power??'—')+' W';
    let loads=''; for(const k in L.loads){
      const on=L.loads[k]==='ON';
      loads+=`<span class="pill ${on?'on':'off'}">${k} ${L.loads[k]}</span>`;}
    document.getElementById('loads').innerHTML=loads||'—';
    const st=document.getElementById('status');
    if(L.is_anomaly){st.innerHTML='<span class="pill anom">⚠ ANOMALY</span>';}
    else{st.innerHTML='<span class="pill on">Normal</span>';}
    const ex=document.getElementById('explain');
    if(d.explanation&&d.explanation.text){ex.style.display='block';
      ex.innerHTML='<b>⚠ AI:</b> '+d.explanation.text;}
    document.getElementById('events').innerHTML=
      (d.events||[]).slice().reverse().map(e=>`<div class="ev">${e}</div>`).join('');
  }catch(e){}
}
setInterval(refresh,1500); refresh();
function add(t,cls){const c=document.getElementById('chat');
  const m=document.createElement('div');m.className='msg '+cls;m.innerText=t;
  c.appendChild(m);c.scrollTop=c.scrollHeight;return m;}
function ask(t){document.getElementById('q').value=t;send();}
async function send(){
  const i=document.getElementById('q');const t=i.value.trim();if(!t)return;
  i.value='';add(t,'me');const w=add('…','ai');
  try{const r=await fetch('/chat',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t})});
    const d=await r.json();w.innerText=d.reply;}
  catch(e){w.innerText='Error reaching AI.';}
}
</script></body></html>
"""


if __name__ == "__main__":
    resolve_model()   # pick a working model from your Groq account
    threading.Thread(target=start_mqtt, daemon=True).start()
    print(f"\n  AI Brain running -> open http://localhost:{WEB_PORT}\n")
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False)
