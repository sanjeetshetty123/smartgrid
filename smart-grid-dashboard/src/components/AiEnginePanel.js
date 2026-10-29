import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Activity, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ShieldAlert,
} from 'lucide-react';

// ── AI Engine (NILM) panel ───────────────────────────────────────────────────
// Fully additive, self-contained section fed by ml_backend.py over MQTT:
//   home1/ml/analysis    -> `analysis` prop (republished every ~1s)
//   home1/ml/nilm_event  -> `event` prop (on each appliance toggle)
// Publishes "toggle:<name>" / "fault" / "clear" to home1/ml/control via the
// callback props below. Does not read from or write to any existing
// telemetry/alarm state — App.js owns that separately.

const THEME = {
  ok: {
    border: 'border-cyan-500/20',
    text: 'text-cyan-300',
    sub: 'text-cyan-400/60',
    glow: '0 0 28px rgba(34,211,238,0.3)',
    cardShadow: '0 0 40px rgba(34,211,238,0.07), inset 0 1px 0 rgba(255,255,255,0.04)',
    accent: '#22d3ee',
  },
  anomaly: {
    border: 'border-red-500/30',
    text: 'text-red-400',
    sub: 'text-red-400/65',
    glow: '0 0 28px rgba(248,113,113,0.42)',
    cardShadow: '0 0 40px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.03)',
    accent: '#f87171',
  },
};

export default function AiEnginePanel({
  analysis, event, appliances, onToggleAppliance, onInjectFault, onClearFault, isBrokerConnected,
}) {
  const hasAnalysis = !!analysis;
  const isAnomaly = hasAnalysis && (analysis.is_anomaly || analysis.fault);
  const th = isAnomaly ? THEME.anomaly : THEME.ok;

  return (
    <div className="px-4 pb-16 md:px-8">
      <motion.div
        className={`relative overflow-hidden rounded-2xl border bg-black/78 backdrop-blur-xl ${th.border}`}
        style={{ boxShadow: th.cardShadow }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${th.accent}55, transparent)` }} />

        {/* Header */}
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 ${th.border}`}>
          <div className="flex items-center gap-3">
            <Cpu className={`h-5 w-5 ${th.text}`} strokeWidth={2.2}
              style={{ filter: `drop-shadow(0 0 10px ${th.accent}99)` }} />
            <h2 className={`font-mono text-sm font-black uppercase tracking-[0.3em] ${th.text}`}
              style={{ textShadow: th.glow }}>
              AI Engine — NILM
            </h2>
            <span className="hidden sm:inline-flex items-center rounded-md border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.28em] text-white/32">
              ml_backend.py
            </span>
          </div>
          <motion.div
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-xs font-bold ${
              isAnomaly
                ? 'border-red-500/50 bg-red-950/40 text-red-400'
                : 'border-emerald-500/40 bg-emerald-950/25 text-emerald-300'
            }`}
            animate={{ scale: isAnomaly ? [1, 1.045, 1] : [1, 1.01, 1] }}
            transition={{ duration: isAnomaly ? 1.1 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            {isAnomaly
              ? <ShieldAlert className="h-4 w-4" strokeWidth={2.5} />
              : <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />}
            {isAnomaly ? '⚠ ANOMALY DETECTED' : 'Healthy'}
          </motion.div>
        </div>

        <div className="space-y-6 p-6">

          {/* ── Health + total power row ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={`rounded-xl border bg-black/50 p-4 ${th.border}`}>
              <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.35em] ${th.sub}`}>
                Total Power (AI feed)
              </p>
              <p className="mt-1 font-mono text-3xl font-black tabular-nums text-white">
                {hasAnalysis ? analysis.total_power.toFixed(1) : '---'}
                <span className="ml-1 text-base font-semibold text-white/30">W</span>
              </p>
              {hasAnalysis && analysis.active_appliances?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {analysis.active_appliances.map((name) => (
                    <span key={name}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-white/50">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={`rounded-xl border bg-black/50 p-4 ${th.border}`}>
              <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.35em] ${th.sub}`}>
                Anomaly Score
              </p>
              <p className="mt-1 font-mono text-3xl font-black tabular-nums" style={{ color: th.accent }}>
                {hasAnalysis ? analysis.anomaly_score.toFixed(3) : '---'}
              </p>
              <p className="mt-2 font-mono text-[10px] text-white/35">
                {hasAnalysis ? `fault flag: ${analysis.fault ? 'true' : 'false'}` : 'awaiting home1/ml/analysis…'}
              </p>
            </div>
          </div>

          {/* ── NILM detection ── */}
          <div className={`rounded-xl border bg-black/50 p-5 ${th.border}`}>
            <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.35em] ${th.sub}`}>
              Non-Intrusive Load Monitor
            </p>
            <AnimatePresence mode="wait">
              {event ? (
                <motion.div
                  key={`${event.ts ?? ''}-${event.detected}-${event.action}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mt-2 flex flex-wrap items-center gap-4"
                >
                  <div className="flex items-center gap-2">
                    {event.correct
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-400" strokeWidth={2.3} />
                      : <XCircle className="h-6 w-6 text-red-400" strokeWidth={2.3} />}
                    <p className="font-mono text-xl font-black uppercase tracking-tight text-white">
                      AI DETECTED: <span style={{ color: th.accent }}>{event.detected}</span>
                    </p>
                  </div>
                  <span className="font-mono text-xs text-white/45">
                    actual: <span className="text-white/75">{event.actual}</span> · {event.action}
                  </span>
                  <span className="font-mono text-xs text-white/45">
                    confidence: <span className="text-white/80">{event.confidence}%</span>
                  </span>
                  <span className="font-mono text-xs text-white/45">
                    Δp: <span className="text-white/80">{event.delta_p} W</span>
                  </span>
                </motion.div>
              ) : (
                <p className="mt-2 font-mono text-xs text-white/30">
                  No NILM events yet — toggle an appliance below.
                </p>
              )}
            </AnimatePresence>
          </div>

          {/* ── Controls ── */}
          <div>
            <p className={`mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.35em] ${th.sub}`}>
              Appliance Toggles (home1/ml/control)
            </p>
            <div className="flex flex-wrap gap-2">
              {appliances.map((name) => (
                <button key={name} type="button" disabled={!isBrokerConnected}
                  onClick={() => onToggleAppliance(name)}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-300 transition hover:border-cyan-400/60 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Toggle {name}
                </button>
              ))}
              <button type="button" disabled={!isBrokerConnected} onClick={onInjectFault}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/5 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-red-300 transition hover:border-red-400/60 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Inject Fault
              </button>
              <button type="button" disabled={!isBrokerConnected} onClick={onClearFault}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/5 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Activity className="h-3.5 w-3.5" /> Clear Fault
              </button>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
