"""
Virtual House Simulator - Layer 2 of the GridMind project
Simulates: ceiling fan, AC unit, solar panel, washing machine
Publishes realistic telemetry to the same MQTT broker as the real ESP32 node,
using the identical topic schema, so the backend cannot tell them apart (HIL).

Run:  python virtual_house.py
Stop: Ctrl + C
"""

import json
import math
import random
import time

import paho.mqtt.client as mqtt

BROKER = "localhost"        # broker runs on this same laptop
PORT = 1883
PUBLISH_EVERY = 2           # seconds between telemetry updates
SPEED = 60                  # simulation speed: 60 => 1 real second = 1 sim minute
                            # (a full solar "day" passes in 24 minutes)

# ----------------------------------------------------------------------
# Load models - each returns power in watts for the current sim time
# ----------------------------------------------------------------------

class Fan:
    """Ceiling fan: ~70 W steady, small wobble. Fault mode: current creeps up."""
    def __init__(self):
        self.on = True
        self.fault = False
        self.fault_start = 0

    def power(self, t):
        if not self.on:
            return 0.0
        p = 70 + random.uniform(-3, 3)
        if self.fault:
            # overload grows over 20 s -> gives anomaly detection something to catch
            p += min(180, (time.time() - self.fault_start) * 9)
        return p


class AC:
    """AC unit: compressor cycles ~8 sim-minutes on, 4 off. 1500 W when running."""
    def __init__(self):
        self.on = True

    def power(self, sim_minutes):
        if not self.on:
            return 0.0
        phase = sim_minutes % 12
        running = phase < 8
        return (1500 + random.uniform(-40, 40)) if running else 90.0  # 90 W idle


class Solar:
    """Solar panel: bell curve peaking ~1200 W at sim noon, with cloud dips.
       Publishes NEGATIVE power = generation (net metering convention)."""
    def __init__(self):
        self.cloud_until = 0
        self.cloud_factor = 1.0

    def power(self, sim_hours):
        # daylight 6h - 18h
        if sim_hours < 6 or sim_hours > 18:
            return 0.0
        base = 1200 * math.sin(math.pi * (sim_hours - 6) / 12) ** 2
        now = time.time()
        if now > self.cloud_until and random.random() < 0.01:
            self.cloud_until = now + random.uniform(4, 10)     # cloud for 4-10 s
            self.cloud_factor = random.uniform(0.3, 0.6)
        factor = self.cloud_factor if now < self.cloud_until else 1.0
        return -round(base * factor + random.uniform(-15, 15), 1)


class Washer:
    """Washing machine: off until commanded. 30 sim-minute cycle with phases."""
    def __init__(self):
        self.started_at = None   # sim_minutes when started

    def start(self, sim_minutes):
        if self.started_at is None:
            self.started_at = sim_minutes
            print(">> Washer cycle started")

    def power(self, sim_minutes):
        if self.started_at is None:
            return 0.0
        elapsed = sim_minutes - self.started_at
        if elapsed > 30:
            self.started_at = None
            print(">> Washer cycle finished")
            return 0.0
        if elapsed < 5:   return 2000 + random.uniform(-50, 50)   # heating water
        if elapsed < 20:  return 400 + random.uniform(-100, 100)  # wash agitate
        if elapsed < 25:  return 150 + random.uniform(-20, 20)    # drain
        return 800 + random.uniform(-80, 80)                      # spin


fan, ac, solar, washer = Fan(), AC(), Solar(), Washer()
loads = {"fan": fan, "ac": ac, "solar": solar, "washer": washer}
VOLTAGE = 230.0
grid_voltage = VOLTAGE      # can be swelled via MQTT command for overvoltage demos

# ----------------------------------------------------------------------
# MQTT plumbing
# ----------------------------------------------------------------------

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected to broker ({reason_code})")
    client.subscribe("home1/virtual/+/cmd")            # legacy, back-compat
    client.subscribe("home1/virtual/+/cmd/manual")      # user-initiated (silent)
    client.subscribe("home1/virtual/+/cmd/auto")        # backend-initiated (alarms)
    client.subscribe("home1/real/fault/inject")
    client.subscribe("home1/sim/voltage")        # e.g. payload "260" = swell
    client.publish("home1/virtual/status", "online", retain=True)


def on_message(client, userdata, msg):
    global grid_voltage
    topic, payload = msg.topic, msg.payload.decode()
    print(f"<< {topic} = {payload}")

    if topic == "home1/real/fault/inject":
        # the REAL button press lands here -> break the virtual fan
        fan.fault = True
        fan.fault_start = time.time()
        print(">> FAULT INJECTED into virtual fan (from real button!)")

    elif topic == "home1/sim/voltage":
        try:
            grid_voltage = float(payload)
            print(f">> Grid voltage set to {grid_voltage} V")
        except ValueError:
            pass

    elif topic.startswith("home1/virtual/"):
        load_name = topic.split("/")[2]
        if load_name in loads:
            if payload.upper() == "OFF":
                if load_name == "fan":
                    fan.on = False
                    fan.fault = False          # tripping clears the fault
                elif load_name == "ac":
                    ac.on = False
                elif load_name == "washer":
                    washer.started_at = None
                print(f">> {load_name.upper()} switched OFF")
            elif payload.upper() == "ON":
                if load_name == "fan":
                    fan.on = True
                elif load_name == "ac":
                    ac.on = True
                elif load_name == "washer":
                    washer.start(sim_minutes())
                print(f">> {load_name.upper()} switched ON")


start_time = time.time()

def sim_minutes():
    return (time.time() - start_time) * SPEED / 60.0

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id="virtual-house")
    client.on_connect = on_connect
    client.on_message = on_message
    client.will_set("home1/virtual/status", "offline", retain=True)
    client.connect(BROKER, PORT, 60)
    client.loop_start()

    print("Virtual house running. Sim clock: 1 real sec =", SPEED, "sim secs")
    print("A full solar day passes every", int(24 * 60 / SPEED), "real minutes\n")

    while True:
        sm = sim_minutes()
        sim_h = (sm / 60.0 + 8) % 24        # simulation starts at 08:00
        readings = {
            "fan": fan.power(sm),
            "ac": ac.power(sm),
            "solar": solar.power(sim_h),
            "washer": washer.power(sm),
        }
        for name, p in readings.items():
            i = round(abs(p) / grid_voltage, 3)
            payload = json.dumps({
                "ts": round(time.time(), 1),
                "v": round(grid_voltage + random.uniform(-1.5, 1.5), 1),
                "i": i,
                "p": round(p, 1),
                "state": 1 if abs(p) > 1 else 0,
            })
            client.publish(f"home1/virtual/{name}/telemetry", payload)

        total = sum(v for v in readings.values())
        print(f"simtime {int(sim_h):02d}:{int(sm % 60):02d}  "
              f"fan {readings['fan']:6.1f}  ac {readings['ac']:7.1f}  "
              f"solar {readings['solar']:8.1f}  washer {readings['washer']:7.1f}  "
              f"net {total:8.1f} W")
        time.sleep(PUBLISH_EVERY)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nVirtual house stopped.")
