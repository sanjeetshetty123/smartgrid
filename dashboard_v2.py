"""
GridMind Dashboard v2 - "Mission Control" edition
Reads live data from telemetry_log.csv (written by backend.py) and sends
control commands over MQTT. Read-only w.r.t. the CSV: this file never
writes to telemetry_log.csv, it only tails it.

Run:   streamlit run dashboard_v2.py
Needs: broker + virtual_house.py + backend.py already running

NOTE: dashboard.py (the original/basic dashboard) is left untouched.
This is a separate, additive file.
"""

import os
import time

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from streamlit_autorefresh import st_autorefresh
import paho.mqtt.publish as publish

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CSV_FILE = "telemetry_log.csv"
BROKER = "localhost"
WINDOW_ROWS = 5000          # how much history to tail from the CSV
CHART_MINUTES = 15          # how much of that history to actually plot
STALE_AFTER = 10            # seconds since last CSV write -> STATUS badge flips

LOAD_ICONS = {"fan": "🌀", "ac": "❄️", "washer": "🧺", "solar": "☀️"}
LOAD_COLORS = {
    "fan": "#22d3ee",     # cyan
    "ac": "#818cf8",      # indigo
    "washer": "#f472b6",  # pink
    "solar": "#fbbf24",   # amber
}


def _rgba(hex_color, alpha):
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{alpha})"

st.set_page_config(page_title="GridMind Mission Control", page_icon="🛰️", layout="wide")
st_autorefresh(interval=2000, key="refresh")

# ---------------------------------------------------------------------------
# Theme (dark control-room CSS)
# ---------------------------------------------------------------------------

st.markdown("""
<style>
    .stApp {
        background: radial-gradient(circle at 20% 0%, #0f1b2d 0%, #060a12 60%);
        color: #e2e8f0;
    }
    #MainMenu, footer, header {visibility: hidden;}

    .mc-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 22px;
        background: linear-gradient(180deg, #0d1626 0%, #0a1120 100%);
        border: 1px solid #1e2b42;
        border-radius: 12px;
        margin-bottom: 18px;
    }
    .mc-title {
        font-size: 1.55rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        color: #f1f5f9;
        margin: 0;
    }
    .mc-subtitle {
        font-size: 0.78rem;
        color: #64748b;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-top: 2px;
    }
    .mc-clock {
        font-size: 1.4rem;
        font-weight: 600;
        color: #38bdf8;
        font-variant-numeric: tabular-nums;
        text-align: right;
    }
    .mc-badge {
        display: inline-block;
        padding: 5px 14px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin-top: 6px;
    }
    .badge-online { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid #16a34a; }
    .badge-stale  { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid #dc2626; }

    div[data-testid="stMetric"] {
        background: linear-gradient(180deg, #0d1626 0%, #0a1120 100%);
        border: 1px solid #1e2b42;
        border-radius: 12px;
        padding: 14px 16px 8px 16px;
    }
    div[data-testid="stMetricLabel"] {
        color: #64748b !important;
        font-size: 0.72rem !important;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    div[data-testid="stMetricValue"] {
        font-size: 1.7rem !important;
        color: #f1f5f9 !important;
    }

    .load-card {
        background: linear-gradient(180deg, #0d1626 0%, #0a1120 100%);
        border: 1px solid #1e2b42;
        border-radius: 14px;
        padding: 16px 18px;
        text-align: center;
        margin-bottom: 6px;
    }
    .load-icon { font-size: 2.2rem; line-height: 1; }
    .load-name {
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: #cbd5e1;
        margin-top: 4px;
    }
    .load-reading {
        font-size: 1.3rem;
        font-weight: 700;
        color: #f1f5f9;
        margin-top: 6px;
    }
    .load-sub { font-size: 0.78rem; color: #64748b; }
    .glow-on {
        display: inline-block; margin-top: 8px; padding: 3px 12px;
        border-radius: 999px; font-size: 0.72rem; font-weight: 700;
        background: rgba(34,197,94,0.15); color: #4ade80;
        border: 1px solid #16a34a; box-shadow: 0 0 12px rgba(34,197,94,0.5);
    }
    .glow-off {
        display: inline-block; margin-top: 8px; padding: 3px 12px;
        border-radius: 999px; font-size: 0.72rem; font-weight: 700;
        background: rgba(248,113,113,0.15); color: #f87171;
        border: 1px solid #dc2626; box-shadow: 0 0 12px rgba(239,68,68,0.5);
    }

    section[data-testid="stVerticalBlock"] div.stButton > button {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #1e2b42;
        background: #0f1b2d;
        color: #e2e8f0;
        font-weight: 600;
    }
    section[data-testid="stVerticalBlock"] div.stButton > button:hover {
        border-color: #38bdf8;
        color: #38bdf8;
    }

    .event-row {
        padding: 8px 12px;
        border-radius: 8px;
        margin-bottom: 6px;
        font-size: 0.85rem;
        border-left: 3px solid #334155;
        background: #0d1626;
    }
    .event-crit { border-left-color: #ef4444; color: #fca5a5; }
    .event-warn { border-left-color: #f59e0b; color: #fcd34d; }
    .event-ok   { border-left-color: #22c55e; color: #86efac; }
    .event-ts   { color: #64748b; font-size: 0.75rem; margin-right: 8px; }

    h3 { color: #cbd5e1 !important; font-size: 1rem !important; letter-spacing: 0.04em; }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# MQTT helper
# ---------------------------------------------------------------------------

def send(topic, msg):
    try:
        publish.single(topic, msg, hostname=BROKER)
    except Exception as e:
        st.toast(f"MQTT publish failed: {e}", icon="⚠️")


# ---------------------------------------------------------------------------
# Data loading - robust to the file being mid-write by backend.py
# ---------------------------------------------------------------------------

def load_data():
    if not os.path.exists(CSV_FILE):
        return None
    try:
        df = pd.read_csv(CSV_FILE)
        if len(df) > WINDOW_ROWS:
            df = df.tail(WINDOW_ROWS)
        df = df.dropna(subset=["ts", "load"])
        df["time"] = pd.to_datetime(df["ts"], unit="s")
        return df
    except Exception:
        return None


if "last_good_df" not in st.session_state:
    st.session_state.last_good_df = None

_new_df = load_data()
if _new_df is not None and not _new_df.empty:
    st.session_state.last_good_df = _new_df

df = st.session_state.last_good_df

# ---------------------------------------------------------------------------
# Waiting-for-data screen
# ---------------------------------------------------------------------------

if df is None or df.empty:
    st.markdown("""
    <div class="mc-header">
        <div>
            <div class="mc-title">🛰️ GRIDMIND MISSION CONTROL</div>
            <div class="mc-subtitle">AI-Powered GridMind Optimization System</div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    st.warning(
        "Waiting for telemetry... `telemetry_log.csv` not found yet. "
        "Make sure the broker, `virtual_house.py`, and `backend.py` are all running."
    )
    st.stop()

# ---------------------------------------------------------------------------
# Derived state
# ---------------------------------------------------------------------------

latest = df.groupby("load").last()
last_ts = df["ts"].max()
data_age = time.time() - last_ts
is_online = data_age < STALE_AFTER

total_p = latest[latest.index != "solar"]["p"].sum() if "solar" in latest.index else latest["p"].sum()
solar_p = -latest.loc["solar", "p"] if "solar" in latest.index else 0.0
net_p = latest["p"].sum()
voltage = latest["v"].mean()

if voltage < 245:
    v_color = "#4ade80"
elif voltage <= 250:
    v_color = "#fbbf24"
else:
    v_color = "#f87171"

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

badge_class = "badge-online" if is_online else "badge-stale"
badge_text = "● ONLINE" if is_online else "● STALE"

st.markdown(f"""
<div class="mc-header">
    <div>
        <div class="mc-title">🛰️ GRIDMIND MISSION CONTROL</div>
        <div class="mc-subtitle">AI-Powered GridMind Optimization System</div>
        <div class="mc-badge {badge_class}">{badge_text}</div>
    </div>
    <div>
        <div class="mc-clock">{time.strftime('%H:%M:%S')}</div>
        <div class="mc-subtitle" style="text-align:right;">local time</div>
    </div>
</div>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# KPI row
# ---------------------------------------------------------------------------

k1, k2, k3, k4 = st.columns(4)
k1.metric("Total Consumption", f"{total_p:.0f} W")
k2.metric("Solar Generation", f"{solar_p:.0f} W")
k3.metric("Net Grid Draw", f"{net_p:.0f} W")
k4.metric("Grid Voltage", f"{voltage:.1f} V", delta=f"{voltage - 230:.1f} V vs nominal",
          delta_color="inverse")

st.markdown("")

# ---------------------------------------------------------------------------
# Chart + gauge row
# ---------------------------------------------------------------------------

chart_col, gauge_col = st.columns([2.2, 1])

with chart_col:
    st.markdown("### Live Power Draw")
    window_start = df["ts"].max() - CHART_MINUTES * 60
    windowed = df[df["ts"] >= window_start]
    pivot = windowed.pivot_table(index="time", columns="load", values="p", aggfunc="last").ffill()

    fig = go.Figure()
    for load in pivot.columns:
        color = LOAD_COLORS.get(load, "#94a3b8")
        fig.add_trace(go.Scatter(
            x=pivot.index, y=pivot[load],
            name=load.upper(),
            mode="lines",
            line=dict(color=color, width=2, shape="spline"),
            fill="tozeroy",
            fillcolor=_rgba(color, 0.08),
        ))
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        height=380,
        margin=dict(l=10, r=10, t=10, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0,
                    bgcolor="rgba(0,0,0,0)"),
        xaxis=dict(showgrid=False, title=None),
        yaxis=dict(showgrid=True, gridcolor="#1e2b42", title="Watts"),
        hovermode="x unified",
    )
    st.plotly_chart(fig, width="stretch")

with gauge_col:
    st.markdown("### Grid Voltage")
    gauge = go.Figure(go.Indicator(
        mode="gauge+number",
        value=voltage,
        number={"suffix": " V", "font": {"color": v_color, "size": 36}},
        gauge={
            "axis": {"range": [200, 280], "tickcolor": "#64748b"},
            "bar": {"color": v_color},
            "bgcolor": "rgba(0,0,0,0)",
            "borderwidth": 1,
            "bordercolor": "#1e2b42",
            "steps": [
                {"range": [200, 245], "color": "rgba(34,197,94,0.15)"},
                {"range": [245, 250], "color": "rgba(251,191,36,0.15)"},
                {"range": [250, 280], "color": "rgba(248,113,113,0.15)"},
            ],
            "threshold": {"line": {"color": "#f87171", "width": 3}, "thickness": 0.8, "value": 250},
        },
    ))
    gauge.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        height=280,
        margin=dict(l=20, r=20, t=30, b=10),
    )
    st.plotly_chart(gauge, width="stretch")

st.markdown("")

# ---------------------------------------------------------------------------
# Load cards
# ---------------------------------------------------------------------------

st.markdown("### Loads")
load_names = [n for n in latest.index]
cols = st.columns(len(load_names)) if load_names else []
for col, name in zip(cols, load_names):
    row = latest.loc[name]
    on = row["state"] == 1
    icon = LOAD_ICONS.get(name, "🔌")
    glow_class = "glow-on" if on else "glow-off"
    glow_text = "● ON" if on else "● OFF"
    with col:
        st.markdown(f"""
        <div class="load-card">
            <div class="load-icon">{icon}</div>
            <div class="load-name">{name.upper()}</div>
            <div class="load-reading">{abs(row['p']):.0f} W</div>
            <div class="load-sub">{row['i']:.2f} A</div>
            <div class="{glow_class}">{glow_text}</div>
        </div>
        """, unsafe_allow_html=True)
        if name != "solar":
            b1, b2 = st.columns(2)
            if b1.button("ON", key=f"on_{name}"):
                send(f"home1/virtual/{name}/cmd", "ON")
            if b2.button("OFF", key=f"off_{name}"):
                send(f"home1/virtual/{name}/cmd", "OFF")

st.markdown("")

# ---------------------------------------------------------------------------
# Event log + demo controls
# ---------------------------------------------------------------------------

log_col, demo_col = st.columns([1.6, 1])

with log_col:
    st.markdown("### Event Log")
    events = []

    for name, g in df.groupby("load"):
        g = g.sort_values("ts")
        prev_state = None
        for _, r in g.iterrows():
            state = r["state"]
            if prev_state is not None and state != prev_state:
                if prev_state == 1 and state == 0:
                    events.append((r["ts"], "warn", f"{name.upper()} TRIPPED / OFF"))
                elif prev_state == 0 and state == 1:
                    events.append((r["ts"], "ok", f"{name.upper()} RESTORED / ON"))
            prev_state = state

    v_series = df.sort_values("ts")[["ts", "v"]].drop_duplicates(subset="ts")
    was_over = False
    for _, r in v_series.iterrows():
        over = r["v"] > 250
        if over and not was_over:
            events.append((r["ts"], "crit", f"OVERVOLTAGE — {r['v']:.0f} V"))
        was_over = over

    events.sort(key=lambda e: e[0], reverse=True)
    events = events[:20]

    if not events:
        st.caption("No events yet — system nominal.")
    else:
        for ts, sev, text in events:
            css = {"crit": "event-crit", "warn": "event-warn", "ok": "event-ok"}[sev]
            ts_str = time.strftime("%H:%M:%S", time.localtime(ts))
            st.markdown(
                f'<div class="event-row {css}"><span class="event-ts">{ts_str}</span>{text}</div>',
                unsafe_allow_html=True,
            )

with demo_col:
    st.markdown("### Demo Controls")
    if st.button("💥 Inject fan fault"):
        send("home1/real/fault/inject", "overload_fan")
    if st.button("⚡ Voltage swell (262 V)"):
        send("home1/sim/voltage", "262")
    if st.button("✅ Voltage normal (230 V)"):
        send("home1/sim/voltage", "230")

st.caption(f"Rows in window: {len(df)} · Last CSV write: "
           f"{time.strftime('%H:%M:%S', time.localtime(last_ts))} "
           f"({data_age:.1f}s ago)")
