import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Activity, WifiOff } from 'lucide-react';

// ── Autonomous Agent + Load Forecast panels ──────────────────────────────────
// Fully additive, self-contained section. Each panel polls its own local
// Python service directly over HTTP (CORS already enabled on both) — no
// MQTT, no shared state with Dashboard.js / AiEnginePanel.js / App.js.
//   Panel 1: GET http://localhost:5006/state  (autonomous shedding agent)
//   Panel 2: GET http://localhost:5007/state  (short-horizon load forecast)
// Degrades gracefully to a "service offline" note per-panel on fetch failure.

const AGENT_URL    = process.env.REACT_APP_AGENT_URL    || 'http://localhost:5006/state';
const FORECAST_URL = process.env.REACT_APP_FORECAST_URL || 'http://localhost:5007/state';
const POLL_MS = 1500;

// ── Shared polling hook ───────────────────────────────────────────────────────
function usePolledJson(url) {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;

    const tick = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);

  return { data, offline };
}

function OfflineNote({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-[11px] text-white/35">
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-white/25" />
      service offline — waiting for {label}
    </div>
  );
}

// ── Panel shell (shared chrome) ───────────────────────────────────────────────
function PanelShell({ accent, border, glow, cardShadow, icon, title, badge, children }) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl border bg-black/78 backdrop-blur-xl ${border}`}
      style={{ boxShadow: cardShadow }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }} />

      <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 ${border}`}>
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="font-mono text-sm font-black uppercase tracking-[0.3em] text-white/85"
            style={{ textShadow: glow }}>
            {title}
          </h2>
        </div>
        {badge}
      </div>

      <div className="p-6">{children}</div>
    </motion.div>
  );
}

// ── Decision row (Panel 1) ────────────────────────────────────────────────────
function DecisionRow({ d }) {
  const bad = d.action === 'SHED' || d.action === 'DELAY';
  const colorCls = bad ? 'text-red-400' : 'text-emerald-400';
  const label = `${d.action}${d.target ? ' ' + d.target : ''}`;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className={`font-mono text-[12px] font-black uppercase tracking-wide ${colorCls}`}>{label}</p>
      <p className="mt-1 font-mono text-[11px] text-white/60">{d.reason}</p>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-white/28">
        {d.time} · load was {d.load_at_decision} W · {d.mode} mode
      </p>
    </div>
  );
}

// ── Panel 1: Autonomous Agent ─────────────────────────────────────────────────
function AutonomousAgentPanel() {
  const { data, offline } = usePolledJson(AGENT_URL);
  const decisions = data?.decisions ?? [];
  const newestFirst = decisions.slice().reverse();

  return (
    <PanelShell
      accent="#a78bfa"
      border="border-violet-500/22"
      glow="0 0 24px rgba(167,139,250,0.3)"
      cardShadow="0 0 40px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,0.04)"
      icon={<Cpu className="h-5 w-5 text-violet-300" strokeWidth={2.2}
        style={{ filter: 'drop-shadow(0 0 10px rgba(167,139,250,0.9))' }} />}
      title="🤖 Autonomous Energy Agent"
      badge={
        <span className="rounded-full border border-violet-500/40 bg-violet-950/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-violet-300">
          {data?.mode || '—'} mode
        </span>
      }
    >
      {offline ? (
        <OfflineNote label="localhost:5006" />
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {newestFirst.length === 0 ? (
            <p className="py-6 text-center font-mono text-[11px] text-white/30">
              Waiting for high load — agent acts above 1700 W
            </p>
          ) : (
            newestFirst.map((d, i) => (
              <DecisionRow key={`${d.time}-${d.action}-${d.target}-${i}`} d={d} />
            ))
          )}
        </div>
      )}
    </PanelShell>
  );
}

// ── Forecast chart (canvas) ───────────────────────────────────────────────────
function ForecastChart({ history, limit, predicted }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const W = rect.width, H = rect.height;
    const padL = 6, padR = 46, padT = 14, padB = 8;
    const plotW = Math.max(1, W - padL - padR);
    const plotH = Math.max(1, H - padT - padB);

    const hasHistory = Array.isArray(history) && history.length > 0;
    const hasForecast = typeof predicted === 'number';

    const vals = [limit, 0, ...(hasHistory ? history : [])];
    if (hasForecast) vals.push(predicted);
    const hi = Math.max(...vals) * 1.08;
    const lo = Math.min(...vals, 0);
    const range = hi - lo || 1;
    const yFor = (v) => padT + plotH - ((v - lo) / range) * plotH;

    const n = hasHistory ? history.length : 0;
    const slots = Math.max(n, 1);
    const step = plotW / slots;
    const xFor = (i) => padL + i * step;

    // limit line (dashed red)
    const limitY = yFor(limit);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(248,113,113,0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, limitY);
    ctx.lineTo(padL + plotW, limitY);
    ctx.stroke();
    ctx.restore();
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(248,113,113,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(`${limit}W`, padL + plotW + 4, limitY + 3);

    if (hasHistory) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      history.forEach((v, i) => {
        const x = xFor(i), y = yFor(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (hasForecast) {
        const lastX = xFor(n - 1), lastY = yFor(history[n - 1]);
        const fx = Math.min(padL + plotW, xFor(n));
        const fy = yFor(predicted);

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(250,204,21,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = 'rgba(250,204,21,0.9)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }, [history, limit, predicted]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  return (
    <div className="relative h-40 w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function fmtW(v) {
  return typeof v === 'number' ? `${v.toFixed(1)} W` : 'n/a';
}
function fmtMae(v) {
  return typeof v === 'number' ? `±${v.toFixed(1)} W` : 'n/a';
}

// ── Panel 2: Load Forecast ────────────────────────────────────────────────────
function LoadForecastPanel() {
  const { data, offline } = usePolledJson(FORECAST_URL);
  const fc = data?.fc;
  const history = data?.history ?? [];
  const limit = data?.limit ?? 2000;

  const overloadText = fc?.will_overload
    ? `⚠ PREDICTED OVERLOAD${fc.eta_s != null ? ` — limit in ~${fc.eta_s}s` : ''}. Forecast ${fc.predicted}W exceeds ${limit}W.`
    : null;

  return (
    <PanelShell
      accent="#38bdf8"
      border="border-sky-500/22"
      glow="0 0 24px rgba(56,189,248,0.3)"
      cardShadow="0 0 40px rgba(14,165,233,0.08), inset 0 1px 0 rgba(255,255,255,0.04)"
      icon={<Activity className="h-5 w-5 text-sky-300" strokeWidth={2.2}
        style={{ filter: 'drop-shadow(0 0 10px rgba(56,189,248,0.9))' }} />}
      title="🔮 Load Forecast"
      badge={null}
    >
      {offline ? (
        <OfflineNote label="localhost:5007" />
      ) : (
        <div className="space-y-4">
          {fc?.will_overload ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-2.5 font-mono text-[11px] font-bold text-red-300">
              {overloadText}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2.5 font-mono text-[11px] font-bold text-emerald-300">
              Load within safe range
            </div>
          )}

          <ForecastChart history={history} limit={limit} predicted={fc?.predicted} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-sky-500/20 bg-black/50 p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-sky-400/60">Now</p>
              <p className="mt-1 font-mono text-sm font-bold text-white/85">{fmtW(fc?.now)}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-black/50 p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-sky-400/60">Predicted +20s</p>
              <p className="mt-1 font-mono text-sm font-bold text-white/85">{fmtW(fc?.predicted)}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-black/50 p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-sky-400/60">Live MAE</p>
              <p className="mt-1 font-mono text-sm font-bold text-white/85">{fmtMae(fc?.live_mae)}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-black/50 p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-sky-400/60">Model MAE</p>
              <p className="mt-1 font-mono text-sm font-bold text-white/85">{fmtMae(fc?.model_mae)}</p>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

// ── Section wrapper (default export) ──────────────────────────────────────────
export default function AgentForecastSection() {
  return (
    <div className="px-4 pb-16 md:px-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AutonomousAgentPanel />
        <LoadForecastPanel />
      </div>
    </div>
  );
}
