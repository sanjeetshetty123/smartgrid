"""
GridMind - Predictive Load Forecasting (Tier 3)
==============================================================
Turns the system from REACTIVE into PREDICTIVE. Instead of only responding
once an overload happens, it forecasts the load a short time ahead and raises
an EARLY WARNING before the grid crosses the safety limit.

Two layers:
  1. TRAINED MODEL  - at startup it trains a forecasting model on your logged
     telemetry_log.csv (the file backend.py writes) and reports its accuracy
     (MAE in watts). This is your quotable "we trained a forecaster" result.
  2. LIVE FORECAST  - in real time it fits the recent power trend and projects
     ~20 s ahead, estimates time-to-overload, and publishes a warning on
     home1/ai/forecast so the dashboard (and the agent) can pre-empt it.

Dashboard: http://localhost:5007  (live actual-vs-forecast chart + warning)

Run:  python ai_forecast.py   (needs the broker + virtual_house + backend)
"""

import csv
import json
import time
import threading
from collections import deque, defaultdict

import numpy as np
import paho.mqtt.client as mqtt
from flask import Flask, jsonify, Response
from flask_cors import CORS

# =================== CONFIG ===================
BROKER = "localhost"
PORT = 1883
WEB_PORT = 5007

SAFETY_LIMIT_W = 2000      # grid safety limit
HORIZON_S = 20             # how many seconds ahead we forecast
WINDOW = 15                # recent samples used to fit the live trend
CSV_FILE = "telemetry_log.csv"
# ==============================================

app = Flask(__name__)
CORS(app)

history = deque(maxlen=90)       # (t, total_power) live series
pending = deque(maxlen=90)       # (predict_for_time, predicted_value) to score later
errors = deque(maxlen=60)        # recent |predicted - actual| for live MAE
forecast_state = {
    "now": None, "predicted": None, "horizon_s": HORIZON_S,
    "will_overload": False, "eta_s": None, "live_mae": None,
    "model_mae": None, "model_samples": 0,
}
mqtt_client = None
csv_model = {"w": None, "b": None}   # simple linear model from CSV (lag features)


# ---------------- 1. Train a model on logged data ----------------
def train_from_csv():
    """Build a total-power time series from telemetry_log.csv and train a
    small lag-based linear forecaster. Reports MAE. Best-effort."""
    try:
        totals = defaultdict(float)
        with open(CSV_FILE, newline="") as f:
            for row in csv.DictReader(f):
                try:
                    ts = round(float(row["ts"]))        # group readings per second
                    totals[ts] += float(row["p"])
                except (ValueError, TypeError, KeyError):
                    continue
        series = [totals[k] for k in sorted(totals)]
        if len(series) < 40:
            print(f"Forecast: only {len(series)} samples in {CSV_FILE} - "
                  f"skipping model training (need ~40). Live forecast still works.")
            return
        series = np.array(series, dtype=float)

        # lag features: predict p[t] from [p[t-1], p[t-2], p[t-3]]
        X, y = [], []
        for i in range(3, len(series)):
            X.append([series[i-1], series[i-2], series[i-3]])
            y.append(series[i])
        X, y = np.array(X), np.array(y)

        # train/test split
        n = len(X); cut = int(n * 0.8)
        Xtr, ytr, Xte, yte = X[:cut], y[:cut], X[cut:], y[cut:]

        # least-squares linear regression with bias term
        A = np.hstack([Xtr, np.ones((len(Xtr), 1))])
        coef, *_ = np.linalg.lstsq(A, ytr, rcond=None)
        w, b = coef[:3], coef[3]

        Ate = np.hstack([Xte, np.ones((len(Xte), 1))])
        pred = Ate @ np.append(w, b)
        mae = float(np.mean(np.abs(pred - yte))) if len(yte) else 0.0

        csv_model["w"], csv_model["b"] = w, b
        forecast_state["model_mae"] = round(mae, 1)
        forecast_state["model_samples"] = len(series)
        print(f"Forecast model trained on {len(series)} samples "
              f"| test MAE = {mae:.1f} W")
    except FileNotFoundError:
        print(f"Forecast: {CSV_FILE} not found yet - run backend.py to log data. "
              f"Live forecast still works.")
    except Exception as e:
        print("Forecast training error:", e)


# ---------------- 2. Live trend forecast ----------------
def forecast_now():
    if len(history) < 5:
        return
    t_now, p_now = history[-1]

    pts = list(history)[-WINDOW:]
    ts = np.array([p[0] for p in pts])
    ps = np.array([p[1] for p in pts])
    ts = ts - ts[0]                       # seconds since window start

    # linear trend: p = slope*t + intercept
    slope, intercept = np.polyfit(ts, ps, 1)
    t_future = ts[-1] + HORIZON_S
    p_future = slope * t_future + intercept

    # time until we cross the safety limit (if rising toward it)
    eta = None
    if slope > 1 and p_now < SAFETY_LIMIT_W:
        eta = (SAFETY_LIMIT_W - p_now) / slope
        if eta < 0 or eta > 120:
            eta = None

    will_overload = (p_future > SAFETY_LIMIT_W) or (p_now > SAFETY_LIMIT_W)

    forecast_state.update({
        "now": round(p_now, 1),
        "predicted": round(float(p_future), 1),
        "will_overload": bool(will_overload),
        "eta_s": round(eta, 1) if eta is not None else None,
    })

    # remember this prediction so we can score it HORIZON_S later
    pending.append((t_now + HORIZON_S, float(p_future)))

    # publish for the dashboard / agent
    if mqtt_client:
        mqtt_client.publish("home1/ai/forecast", json.dumps({
            "now": forecast_state["now"],
            "predicted": forecast_state["predicted"],
            "horizon_s": HORIZON_S,
            "will_overload": forecast_state["will_overload"],
            "eta_s": forecast_state["eta_s"],
        }))


def score_predictions():
    """Compare past predictions against what actually happened -> live MAE."""
    if not history:
        return
    t_now, p_now = history[-1]
    while pending and pending[0][0] <= t_now:
        _, predicted = pending.popleft()
        errors.append(abs(predicted - p_now))
    if errors:
        forecast_state["live_mae"] = round(float(np.mean(errors)), 1)


# ---------------- MQTT ----------------
def parse_summary(msg):
    for p in msg.split("|"):
        if p.startswith("P:"):
            try:
                history.append((time.time(), float(p[2:])))
            except ValueError:
                pass


def on_connect(c, u, f, rc, props=None):
    print(f"Forecast connected to broker ({rc})")
    c.subscribe("home1/summary")


def on_message(c, u, msg):
    if msg.topic == "home1/summary":
        parse_summary(msg.payload.decode(errors="ignore"))
        score_predictions()
        forecast_now()


def start_mqtt():
    global mqtt_client
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                              client_id="ai-forecast")
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
    hist = [round(p, 1) for _, p in list(history)[-60:]]
    return jsonify({"fc": forecast_state, "history": hist,
                    "limit": SAFETY_LIMIT_W, "horizon": HORIZON_S})


@app.route("/")
def home():
    return Response(PAGE, mimetype="text/html")


PAGE = """
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Load Forecasting</title><style>
 :root{--bg:#0d1117;--card:#161b22;--line:#30363d;--txt:#e6edf3;
       --accent:#56ccf2;--ok:#3fb950;--warn:#f85149;--mut:#8b949e;--pred:#f2c94c}
 *{box-sizing:border-box;font-family:system-ui,Segoe UI,sans-serif}
 body{margin:0;background:var(--bg);color:var(--txt);padding:24px}
 h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);font-size:13px;margin-bottom:18px}
 .row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:18px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
       padding:14px 18px;min-width:150px}
 .k{color:var(--mut);font-size:11px;text-transform:uppercase}
 .v{font-size:24px;font-weight:700;margin-top:4px}
 .warn-banner{display:none;background:rgba(248,81,73,.12);border:1px solid var(--warn);
   color:var(--warn);border-radius:10px;padding:14px 18px;margin-bottom:16px;
   font-size:15px;font-weight:600}
 .ok-banner{background:rgba(63,185,80,.1);border:1px solid var(--ok);color:var(--ok);
   border-radius:10px;padding:12px 18px;margin-bottom:16px;font-size:14px}
 canvas{background:var(--card);border:1px solid var(--line);border-radius:10px;width:100%}
 .legend{display:flex;gap:18px;margin-top:10px;font-size:12px;color:var(--mut)}
 .dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:middle}
</style></head><body>
 <h1>🔮 Predictive Load Forecasting</h1>
 <div class="sub">Forecasts the grid load ~20 s ahead and warns before an overload.</div>
 <div class="warn-banner" id="warn"></div>
 <div class="ok-banner" id="okb">Monitoring — load within safe range.</div>
 <div class="row">
   <div class="card"><div class="k">Load Now</div><div class="v" id="now">—</div></div>
   <div class="card"><div class="k">Predicted (+20s)</div><div class="v" id="pred" style="color:var(--pred)">—</div></div>
   <div class="card"><div class="k">Safety Limit</div><div class="v">2000 W</div></div>
   <div class="card"><div class="k">Live accuracy (MAE)</div><div class="v" id="lmae">—</div></div>
   <div class="card"><div class="k">Model MAE (trained)</div><div class="v" id="mmae">—</div></div>
 </div>
 <canvas id="c" width="1000" height="320"></canvas>
 <div class="legend">
   <span><span class="dot" style="background:#56ccf2"></span>Actual load</span>
   <span><span class="dot" style="background:#f2c94c"></span>Forecast (+20s)</span>
   <span><span class="dot" style="background:#f85149"></span>Safety limit</span>
 </div>
<script>
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
function draw(hist,pred,limit){
 const W=cv.width,H=cv.height,pad=40;
 ctx.clearRect(0,0,W,H);
 const all=hist.concat([pred]).filter(x=>x!=null);
 let mx=Math.max(limit*1.1,...all.map(Math.abs),100), mn=Math.min(0,...all);
 const X=i=>pad+(i/(Math.max(hist.length,1)))*(W-2*pad);
 const Y=v=>H-pad-((v-mn)/(mx-mn))*(H-2*pad);
 // grid + limit line
 ctx.strokeStyle='#30363d';ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(pad,Y(0));ctx.lineTo(W-pad,Y(0));ctx.stroke();
 ctx.strokeStyle='#f85149';ctx.setLineDash([6,4]);
 ctx.beginPath();ctx.moveTo(pad,Y(limit));ctx.lineTo(W-pad,Y(limit));ctx.stroke();
 ctx.setLineDash([]);
 ctx.fillStyle='#f85149';ctx.font='12px system-ui';
 ctx.fillText('limit '+limit+'W',W-pad-80,Y(limit)-6);
 // actual line
 ctx.strokeStyle='#56ccf2';ctx.lineWidth=2;ctx.beginPath();
 hist.forEach((v,i)=>{i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v));});
 ctx.stroke();
 // forecast point + dashed connector
 if(pred!=null&&hist.length){
   ctx.strokeStyle='#f2c94c';ctx.setLineDash([5,4]);ctx.beginPath();
   ctx.moveTo(X(hist.length-1),Y(hist[hist.length-1]));
   ctx.lineTo(X(hist.length),Y(pred));ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle='#f2c94c';ctx.beginPath();ctx.arc(X(hist.length),Y(pred),5,0,7);ctx.fill();
 }
}
async function tick(){
 try{const r=await fetch('/state');const d=await r.json();const f=d.fc;
  document.getElementById('now').innerText=(f.now??'—')+' W';
  document.getElementById('pred').innerText=(f.predicted??'—')+' W';
  document.getElementById('lmae').innerText=f.live_mae!=null?('±'+f.live_mae+' W'):'—';
  document.getElementById('mmae').innerText=f.model_mae!=null?('±'+f.model_mae+' W'):'n/a';
  const warn=document.getElementById('warn'),okb=document.getElementById('okb');
  if(f.will_overload){warn.style.display='block';okb.style.display='none';
    warn.innerText='⚠ PREDICTED OVERLOAD'+(f.eta_s!=null?(' — limit in ~'+f.eta_s+'s'):'')
      +'. Forecast '+f.predicted+'W exceeds 2000W. Pre-emptive shedding advised.';}
  else{warn.style.display='none';okb.style.display='block';}
  draw(d.history,f.predicted,d.limit);
 }catch(e){}
}
setInterval(tick,1500);tick();
</script></body></html>
"""

if __name__ == "__main__":
    train_from_csv()
    threading.Thread(target=start_mqtt, daemon=True).start()
    print(f"\n  Forecast running -> http://localhost:{WEB_PORT}\n")
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False)
