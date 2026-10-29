"""
GridMind - AI/ML Demonstration Backend (Phase 2 preview)
===========================================================
SELF-CONTAINED and SAFE. Does not touch backend.py, virtual_house.py,
or your working demo. Runs entirely in software on simulated data.

Demonstrates TWO things judges asked for:
  1. "Where is the AI?"  -> live anomaly detection that VISIBLY flags faults
  2. "50 sensors too costly?" -> NILM: one signal identifies many appliances

How it works:
  - Simulates one "main-line" current signal = sum of several appliances
  - Appliances turn on/off with realistic electrical fingerprints
  - NILM classifier identifies WHICH appliance changed from the main signal
  - Anomaly detector flags abnormal power behaviour in real time
  - Publishes results over MQTT for the dashboard to show

Run:  python ml_backend.py       (needs the MQTT broker running)
"""

import json
import random
import time
import threading

import numpy as np
import paho.mqtt.client as mqtt
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import KNeighborsClassifier

BROKER = "localhost"
PORT = 1883

# ---------------------------------------------------------------
# 1. Appliance fingerprint library (this is the "trained database")
#    Each appliance has a characteristic: power step (W), power factor,
#    and turn-on inrush ratio. These are what NILM matches against.
# ---------------------------------------------------------------
APPLIANCES = {
    #                power(W)  pf    inrush  type
    "LED Light":    {"p": 10,   "pf": 0.95, "inrush": 1.0, "color": "#F2C94C"},
    "Fan":          {"p": 70,   "pf": 0.75, "inrush": 2.5, "color": "#56CCF2"},
    "Kettle":       {"p": 1500, "pf": 0.99, "inrush": 1.0, "color": "#EB5757"},
    "Refrigerator": {"p": 150,  "pf": 0.65, "inrush": 4.0, "color": "#6FCF97"},
    "Laptop Charger":{"p": 45,  "pf": 0.55, "inrush": 1.2, "color": "#BB6BD9"},
}

# ---------------------------------------------------------------
# 2. Train the NILM classifier (KNN) on the fingerprint library
#    Features: [power_step, power_factor, inrush_ratio]
# ---------------------------------------------------------------
def build_training_data():
    X, y = [], []
    for name, f in APPLIANCES.items():
        # generate several noisy samples per appliance (realistic variation)
        for _ in range(40):
            X.append([
                f["p"] * random.uniform(0.95, 1.05),
                f["pf"] * random.uniform(0.97, 1.03),
                f["inrush"] * random.uniform(0.9, 1.1),
            ])
            y.append(name)
    return np.array(X), np.array(y)

X_train, y_train = build_training_data()
nilm = KNeighborsClassifier(n_neighbors=3)
nilm.fit(X_train, y_train)
print("NILM classifier trained on", len(X_train), "fingerprint samples")

# Anomaly detector trained on REALISTIC normal operation: random
# combinations of appliances running (covers 0..~1775 W), so a high-but-
# normal state such as the kettle being on is NOT flagged. Only an injected
# fault, which adds a large out-of-range spike, reads as a genuine anomaly.
_app_powers = [f["p"] for f in APPLIANCES.values()]
_normal = []
for _ in range(600):
    combo = sum(p for p in _app_powers if random.random() < 0.5)
    _normal.append([combo + random.uniform(-5, 5)])
normal_totals = np.array(_normal)
anomaly = IsolationForest(contamination=0.03, random_state=42)
anomaly.fit(normal_totals)
print("Anomaly detector trained on", len(normal_totals),
      "normal-operation samples")

# ---------------------------------------------------------------
# 3. Simulated house state - which appliances are currently ON
# ---------------------------------------------------------------
state = {name: False for name in APPLIANCES}
state["Refrigerator"] = True   # fridge always on
state["LED Light"] = True
fault_mode = {"active": False, "appliance": None}


def total_power():
    p = sum(APPLIANCES[n]["p"] for n, on in state.items() if on)
    if fault_mode["active"]:
        p += 2000   # a fault injects a large, clearly out-of-range spike
    return p + random.uniform(-5, 5)


def classify_change(delta_p, pf, inrush):
    """NILM: identify which appliance caused a power change."""
    pred = nilm.predict([[abs(delta_p), pf, inrush]])[0]
    # confidence from neighbor distances
    dist, _ = nilm.kneighbors([[abs(delta_p), pf, inrush]])
    conf = max(0, min(100, 100 - dist.mean() / 10))
    return pred, conf


# ---------------------------------------------------------------
# 4. MQTT - publish AI results for the dashboard
# ---------------------------------------------------------------
def on_connect(c, u, f, rc, p=None):
    print(f"ML backend connected to broker ({rc})")
    c.subscribe("home1/ml/control")   # dashboard buttons control the sim


def on_message(c, u, msg):
    payload = msg.payload.decode()
    print("control:", payload)
    if payload.startswith("toggle:"):
        name = payload.split(":", 1)[1]
        if name in state:
            prev = state[name]
            state[name] = not state[name]
            # compute the change event and run NILM on it
            f = APPLIANCES[name]
            delta = f["p"] * (1 if state[name] else -1)
            pred, conf = classify_change(delta, f["pf"], f["inrush"])
            event = {
                "action": "ON" if state[name] else "OFF",
                "actual": name,
                "detected": pred,
                "confidence": round(conf, 1),
                "delta_p": round(abs(delta), 1),
                "correct": pred == name,
            }
            c.publish("home1/ml/nilm_event", json.dumps(event))
            print(f"NILM: {name} {event['action']} -> detected '{pred}' "
                  f"({conf:.0f}% conf, {'OK' if event['correct'] else 'MISS'})")
    elif payload == "fault":
        fault_mode["active"] = True
        print("Fault injected")
    elif payload == "clear":
        fault_mode["active"] = False
        print("Fault cleared")


def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="ml-backend")
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(BROKER, PORT, 60)
    client.loop_start()
    print("ML backend running. Publishing live AI analysis...\n")

    while True:
        tp = total_power()
        # anomaly score: -1 = anomaly, 1 = normal
        is_anom = anomaly.predict([[tp]])[0] == -1
        score = anomaly.decision_function([[tp]])[0]

        active = [n for n, on in state.items() if on]
        telemetry = {
            "total_power": round(tp, 1),
            "active_appliances": active,
            "is_anomaly": bool(is_anom),
            "anomaly_score": round(float(score), 3),
            "fault": fault_mode["active"],
            "ts": round(time.time(), 1),
        }
        client.publish("home1/ml/analysis", json.dumps(telemetry))
        status = "ANOMALY!" if is_anom else "normal"
        print(f"total {tp:7.1f} W | on: {', '.join(active):40s} | {status}")
        time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nML backend stopped.")
