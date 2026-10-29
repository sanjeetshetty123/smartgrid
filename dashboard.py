"""
GridMind Dashboard - the visual face of the project
Reads live data from telemetry_log.csv (written by backend.py)
and sends control commands over MQTT.

Run:   streamlit run dashboard.py
Needs: broker + virtual_house.py + backend.py already running
"""

import os
import time

import pandas as pd
import streamlit as st
from streamlit_autorefresh import st_autorefresh
import paho.mqtt.publish as publish

CSV_FILE = "telemetry_log.csv"
BROKER = "localhost"
WINDOW_ROWS = 4000          # how much history to load from the CSV tail

st.set_page_config(page_title="GridMind", page_icon="⚡", layout="wide")
st_autorefresh(interval=2000, key="refresh")     # refresh every 2 s

st.title("⚡ GridMind — Live Dashboard")


# ---------------- helpers ----------------

def send(topic, msg):
    publish.single(topic, msg, hostname=BROKER)


@st.cache_data(ttl=1.5)
def load_data():
    if not os.path.exists(CSV_FILE):
        return pd.DataFrame()
    df = pd.read_csv(CSV_FILE)
    if len(df) > WINDOW_ROWS:
        df = df.tail(WINDOW_ROWS)
    df["time"] = pd.to_datetime(df["ts"], unit="s")
    return df


df = load_data()
if df.empty:
    st.warning("No data yet — make sure backend.py is running and writing telemetry_log.csv")
    st.stop()

latest = df.groupby("load").last()           # newest reading per load
fresh = df[df["ts"] > df["ts"].max() - 12]   # loads seen in last 12 s

# ---------------- top metrics ----------------
total_p = latest[latest.index != "solar"]["p"].sum()
solar_p = -latest.loc["solar", "p"] if "solar" in latest.index else 0
net_p = latest["p"].sum()
voltage = latest["v"].mean()

c1, c2, c3, c4 = st.columns(4)
c1.metric("Consumption", f"{total_p:.0f} W")
c2.metric("Solar generation", f"{solar_p:.0f} W")
c3.metric("Net grid draw", f"{net_p:.0f} W")
c4.metric("Grid voltage", f"{voltage:.1f} V",
          delta=f"{voltage - 230:.1f} V", delta_color="inverse")

if voltage > 250:
    st.error(f"⚠️ OVERVOLTAGE: {voltage:.0f} V — priority shedding active")

st.divider()

# ---------------- load cards + controls ----------------
st.subheader("Loads")
cols = st.columns(len(latest))
for col, (name, row) in zip(cols, latest.iterrows()):
    with col:
        on = row["state"] == 1
        icon = {"fan": "🌀", "ac": "❄️", "washer": "🧺", "solar": "☀️"}.get(name, "🔌")
        st.markdown(f"### {icon} {name.upper()}")
        st.markdown(f"**{abs(row['p']):.0f} W**  ·  {row['i']:.2f} A")
        st.markdown("🟢 ON" if on else "🔴 OFF")
        if name != "solar":
            b1, b2 = st.columns(2)
            if b1.button("ON", key=f"on_{name}"):
                send(f"home1/virtual/{name}/cmd", "ON")
            if b2.button("OFF", key=f"off_{name}"):
                send(f"home1/virtual/{name}/cmd", "OFF")

st.divider()

# ---------------- live chart ----------------
st.subheader("Power over time")
chart_df = df.pivot_table(index="time", columns="load",
                          values="p", aggfunc="last").ffill()
st.line_chart(chart_df, height=320)

# ---------------- demo controls ----------------
st.divider()
st.subheader("Demo controls")
d1, d2, d3 = st.columns(3)
if d1.button("💥 Inject fan fault"):
    send("home1/real/fault/inject", "overload_fan")
if d2.button("⚡ Voltage swell (262 V)"):
    send("home1/sim/voltage", "262")
if d3.button("✅ Voltage normal (230 V)"):
    send("home1/sim/voltage", "230")

st.caption(f"Rows in log: {len(df)} (window) · "
           f"Last update: {time.strftime('%H:%M:%S')}")
