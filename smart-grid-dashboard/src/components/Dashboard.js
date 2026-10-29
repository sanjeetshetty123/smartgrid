import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Zap, ShieldCheck, ShieldAlert,
  Wifi, WifiOff, Volume2, VolumeX, Radio,
  TrendingUp, TrendingDown, Minus, Database,
  GitBranch, Server, Power,
  Fan, Snowflake, WashingMachine, Sun,
} from 'lucide-react';
import RupeeInsightsSection from './RupeeInsights';

// ── Theme ─────────────────────────────────────────────────────────────────────
const THEME = {
  ok: {
    accent:     '#facc15',
    accent2:    '#d97706',
    textCls:    'text-yellow-400',
    subCls:     'text-amber-500/70',
    borderCls:  'border-yellow-500/18',
    glow:       '0 0 28px rgba(250,204,21,0.35)',
    cardShadow: '0 0 40px rgba(234,179,8,0.07), inset 0 1px 0 rgba(255,255,255,0.04)',
    numFilter:  'drop-shadow(0 0 18px rgba(250,204,21,0.85))',
    sparkColor: '#facc15',
    badgeCls:   'border-amber-500/40 bg-amber-950/30 text-amber-300',
    badgeShadow:'0 0 16px rgba(234,179,8,0.25)',
    dotGrid:    'rgba(250,204,21,0.055)',
  },
  trip: {
    accent:     '#f87171',
    accent2:    '#dc2626',
    textCls:    'text-red-400',
    subCls:     'text-red-400/65',
    borderCls:  'border-red-500/25',
    glow:       '0 0 28px rgba(248,113,113,0.42)',
    cardShadow: '0 0 40px rgba(239,68,68,0.10), inset 0 1px 0 rgba(255,255,255,0.03)',
    numFilter:  'drop-shadow(0 0 18px rgba(248,113,113,0.9))',
    sparkColor: '#f87171',
    badgeCls:   'border-red-500/50 bg-red-950/40 text-red-400',
    badgeShadow:'0 0 20px rgba(239,68,68,0.38)',
    dotGrid:    'rgba(239,68,68,0.06)',
  },
};

// ── Load metadata ──────────────────────────────────────────────────────────────
const LOAD_META = {
  fan:    { label: 'Fan',    Icon: Fan,           color: '#38bdf8', ctrl: true  },
  ac:     { label: 'AC',     Icon: Snowflake,     color: '#818cf8', ctrl: true  },
  washer: { label: 'Washer', Icon: WashingMachine, color: '#f472b6', ctrl: true  },
  solar:  { label: 'Solar',  Icon: Sun,           color: '#fbbf24', ctrl: false },
};
const LOAD_ORDER = ['fan', 'ac', 'washer', 'solar'];

function voltageColor(v) {
  if (v == null) return '#94a3b8';
  if (v < 245) return '#4ade80';
  if (v <= 250) return '#fbbf24';
  return '#f87171';
}

// ── MiniSparkline ─────────────────────────────────────────────────────────────
function MiniSparkline({ data, valueKey, color }) {
  const pts = useMemo(() => {
    if (!data || data.length < 2) return null;
    const slice  = data.slice(-40);
    const vals   = slice.map(d => d[valueKey]).filter((v) => typeof v === 'number');
    if (vals.length < 2) return null;
    const lo     = Math.min(...vals);
    const hi     = Math.max(...vals);
    const range  = hi - lo || 1;
    const W = 110, H = 30, PAD = 3;
    return slice.map((d, i) => ({
      x: (i / (slice.length - 1)) * W,
      y: H - PAD - (((d[valueKey] ?? lo) - lo) / range) * (H - PAD * 2),
    }));
  }, [data, valueKey]);

  if (!pts) return <div className="h-8 mt-1" />;

  const W = 110, H = 30;
  const pl = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `0,${H} ${pl} ${W},${H}`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
      preserveAspectRatio="none" className="mt-2">
      <defs>
        <linearGradient id={`sg-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${valueKey})`} />
      <polyline points={pl} fill="none" stroke={color}
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <motion.circle cx={last.x} cy={last.y} r={2.5} fill={color}
        animate={{ r: [2, 4, 2], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
    </svg>
  );
}

// ── TrendBadge ────────────────────────────────────────────────────────────────
function TrendBadge({ cur, prev, unit, tripped }) {
  if (prev == null || cur == null || isNaN(cur)) return null;
  const delta = cur - prev;
  const abs   = Math.abs(delta);
  const up    = delta > 0.5;
  const down  = delta < -0.5;
  const Icon  = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls   = up
    ? (tripped ? 'text-red-300/80' : 'text-yellow-300')
    : down ? 'text-white/38' : 'text-white/22';

  return (
    <span className={`flex items-center gap-1 font-mono text-[10px] ${cls}`}>
      <Icon className="h-3 w-3" strokeWidth={2.2} />
      {abs < 0.5 ? 'stable' : `${up ? '+' : '−'}${abs.toFixed(0)}${unit}`}
    </span>
  );
}

// ── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ title, Icon, value, unit, sparkData, sparkKey, curNum, prevNum, prevUnit, th, accentOverride }) {
  const display = value ?? '---';
  const accent = accentOverride || th.accent;
  const numFilter = accentOverride
    ? `drop-shadow(0 0 18px ${accentOverride}99)`
    : th.numFilter;
  return (
    <motion.div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-black/80 backdrop-blur-xl ${th.borderCls}`}
      style={{ boxShadow: th.cardShadow }}
      whileHover={{ y: -5, transition: { type: 'spring', stiffness: 350, damping: 24 } }}
    >
      <div className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 85% 45% at 50% -8%, ${accentOverride ? accentOverride + '18' : 'rgba(234,179,8,0.08)'}, transparent 58%)` }} />

      <div className="relative flex flex-col gap-1.5 p-5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.4em] ${th.subCls}`}>
            {title}
          </span>
          <span style={{ color: accent }}>
            <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
          </span>
        </div>

        <div className="flex items-end gap-2 pt-0.5">
          <motion.span
            key={display}
            className="font-mono text-[2.6rem] font-black tabular-nums leading-none"
            style={{ color: accent, filter: numFilter }}
            initial={{ opacity: 0.4, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {display}
          </motion.span>
          {unit && (
            <span className="mb-[3px] font-mono text-lg font-semibold text-white/28">{unit}</span>
          )}
        </div>

        <TrendBadge cur={curNum} prev={prevNum} unit={prevUnit} tripped={false} />
        <MiniSparkline data={sparkData} valueKey={sparkKey} color={accent} />
      </div>
    </motion.div>
  );
}

// ── VoltageGauge ───────────────────────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end   = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}
const V_MIN = 200, V_MAX = 280;
const valueToAngle = (v) => -90 + ((Math.max(V_MIN, Math.min(V_MAX, v)) - V_MIN) / (V_MAX - V_MIN)) * 180;

function VoltageGauge({ value, th }) {
  const hasValue = typeof value === 'number';
  const angle = hasValue ? valueToAngle(value) : -90;
  const color = voltageColor(value);
  const cx = 110, cy = 110, r = 88;

  return (
    <div className={`relative flex flex-col items-center overflow-hidden rounded-2xl border bg-black/78 p-5 backdrop-blur-xl ${th.borderCls}`}
      style={{ boxShadow: th.cardShadow }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${th.accent}44, transparent)` }} />
      <h2 className={`mb-1 self-start font-mono text-[11px] font-bold uppercase tracking-[0.42em] ${th.subCls}`}>
        Grid Voltage
      </h2>
      <svg viewBox="0 0 220 150" className="w-full max-w-[260px]">
        <path d={describeArc(cx, cy, r, -90, valueToAngle(245))} stroke="#22c55e" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={describeArc(cx, cy, r, valueToAngle(245), valueToAngle(250))} stroke="#f59e0b" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={describeArc(cx, cy, r, valueToAngle(250), 90)} stroke="#ef4444" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />
        {hasValue && (
          <motion.line
            x1={cx} y1={cy} x2={cx} y2={cy - r + 16}
            stroke="#f8fafc" strokeWidth="3" strokeLinecap="round"
            style={{ transformOrigin: `${cx}px ${cy}px`, filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.65))' }}
            animate={{ rotate: angle }}
            transition={{ type: 'spring', stiffness: 90, damping: 14 }}
          />
        )}
        <circle cx={cx} cy={cy} r="7" fill="#0f172a" stroke="#f8fafc" strokeWidth="2" />
        <text x={cx - r + 4} y={cy + 24} className="font-mono" fontSize="9" fill="rgba(255,255,255,0.3)">200V</text>
        <text x={cx + r - 30} y={cy + 24} className="font-mono" fontSize="9" fill="rgba(255,255,255,0.3)">280V</text>
      </svg>
      <motion.p key={value} className="-mt-3 font-mono text-3xl font-black tabular-nums"
        style={{ color, filter: `drop-shadow(0 0 16px ${color}99)` }}
        initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        {hasValue ? value.toFixed(1) : '---'}<span className="ml-1 text-base font-semibold text-white/30">V</span>
      </motion.p>
    </div>
  );
}

// ── ChartTooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, th }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`rounded-xl border px-4 py-3 backdrop-blur-2xl ${th.borderCls} bg-black/95`}
      style={{ boxShadow: th.glow }}>
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.38em] text-white/28">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-mono text-[11px]" style={{ color: p.color }}>
          {p.name}  {p.value?.toFixed(0)} W
        </p>
      ))}
    </div>
  );
}

// ── WaitingOverlay ────────────────────────────────────────────────────────────
function WaitingOverlay({ isBrokerConnected, brokerLabel }) {
  return (
    <motion.div key="wait"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(4px)' }}
      transition={{ duration: 0.32 }}
      className="absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-yellow-500/22 bg-black/65 px-8 py-9 backdrop-blur-xl"
        style={{ boxShadow: '0 0 48px rgba(234,179,8,0.12), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(250,204,21,0.10),transparent_55%)]" />
        <div className="relative flex flex-col items-center text-center gap-4">
          <motion.div
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-500/30 bg-yellow-500/6"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
            <motion.div animate={{ rotate: [0, 12, -12, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
              <Radio className="h-7 w-7 text-yellow-400" strokeWidth={2} />
            </motion.div>
          </motion.div>
          <motion.p className="font-mono text-sm font-bold tracking-wider text-yellow-400"
            style={{ textShadow: '0 0 18px rgba(250,204,21,0.55)' }}
            animate={{ opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 2, repeat: Infinity }}>
            Awaiting edge telemetry…
          </motion.p>
          <div className="w-full rounded-xl border border-white/8 bg-black/50 px-4 py-3 text-left font-mono text-[11px] space-y-2 text-white/55">
            <div className="flex items-center gap-2">
              <span className="text-white/30">Broker</span>
              <span className="text-white/80">{brokerLabel}</span>
              <span className={`h-2 w-2 rounded-full shrink-0 ${isBrokerConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-yellow-400/50'}`} />
            </div>
            <div><span className="text-white/30">Topic </span><span className="text-yellow-400/75 break-all">home1/+/+/telemetry</span></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── TelemetryStrip ────────────────────────────────────────────────────────────
function TelemetryStrip({ samples, activeLoads, brokerLabel, th }) {
  const items = [
    { Icon: Database,  label: 'Samples',      val: samples },
    { Icon: Power,     label: 'Active Loads', val: `${activeLoads}/4` },
    { Icon: GitBranch, label: 'Protocol',     val: 'MQTT / QoS-1' },
    { Icon: Server,    label: 'Broker',       val: brokerLabel },
  ];
  return (
    <div className={`mb-7 grid grid-cols-2 gap-2 rounded-2xl border bg-black/60 p-3 backdrop-blur-xl sm:grid-cols-4 ${th.borderCls}`}
      style={{ boxShadow: th.cardShadow }}>
      {items.map(({ Icon, label, val }) => (
        <div key={label} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Icon className={`h-4 w-4 shrink-0 ${th.textCls}`} strokeWidth={1.8}
            style={{ filter: th.numFilter, opacity: 0.7 }} />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/28">{label}</p>
            <p className={`font-mono text-[11px] font-bold ${th.textCls}`}>{val}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── LoadCard ───────────────────────────────────────────────────────────────────
function LoadCard({ name, data, onCmd, th }) {
  const meta = LOAD_META[name];
  const hasData = !!data;
  const on = hasData && data.state === 1;
  const watts = hasData ? Math.abs(data.p).toFixed(0) : '---';
  const amps  = hasData ? data.i.toFixed(2) : '---';
  const onLabel  = name === 'solar' ? 'GENERATING' : 'ON';
  const offLabel = name === 'solar' ? 'IDLE' : 'OFF';

  return (
    <motion.div
      className={`relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-black/78 p-5 text-center backdrop-blur-xl ${th.borderCls}`}
      style={{ boxShadow: th.cardShadow }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 350, damping: 24 } }}
    >
      <div className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 90% 40% at 50% -6%, ${meta.color}14, transparent 60%)` }} />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border"
        style={{ borderColor: `${meta.color}55`, background: `${meta.color}10` }}>
        <meta.Icon className="h-6 w-6" style={{ color: meta.color, filter: `drop-shadow(0 0 8px ${meta.color}99)` }} strokeWidth={2} />
      </div>
      <p className="relative font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-white/70">{meta.label}</p>
      <p className="relative font-mono text-2xl font-black tabular-nums text-white">
        {watts}<span className="ml-1 text-sm font-semibold text-white/30">W</span>
      </p>
      <p className="relative font-mono text-[11px] text-white/35">{amps} A</p>
      <span className={`relative mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-bold ${
        !hasData ? 'border-white/10 bg-white/5 text-white/30'
        : on ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.4)]'
             : 'border-red-500/40 bg-red-500/10 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${!hasData ? 'bg-white/30' : on ? 'bg-emerald-400' : 'bg-red-400'}`} />
        {!hasData ? 'NO DATA' : on ? onLabel : offLabel}
      </span>

      {meta.ctrl && (
        <div className="relative mt-2 grid w-full grid-cols-2 gap-2">
          <button type="button" onClick={() => onCmd(name, 'ON')}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/15">
            ON
          </button>
          <button type="button" onClick={() => onCmd(name, 'OFF')}
            className="rounded-lg border border-red-500/30 bg-red-500/5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-300 transition hover:border-red-400/60 hover:bg-red-500/15">
            OFF
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── EventLog ───────────────────────────────────────────────────────────────────
const SEV_STYLE = {
  crit: { border: 'border-red-500/40',    bg: 'bg-red-950/25',    text: 'text-red-300',    dot: 'bg-red-400' },
  warn: { border: 'border-amber-500/35',  bg: 'bg-amber-950/20',  text: 'text-amber-300',  dot: 'bg-amber-400' },
  ok:   { border: 'border-emerald-500/35',bg: 'bg-emerald-950/20',text: 'text-emerald-300',dot: 'bg-emerald-400' },
  info: { border: 'border-white/10',      bg: 'bg-white/[0.03]',  text: 'text-white/45',   dot: 'bg-white/30' },
};

function EventLog({ events, th }) {
  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-black/78 backdrop-blur-xl ${th.borderCls}`}
      style={{ boxShadow: th.cardShadow }}>
      <div className={`flex items-center gap-3 border-b px-6 py-4 ${th.borderCls}`}>
        <Radio className={`h-4 w-4 ${th.textCls}`} strokeWidth={2} />
        <h2 className={`font-mono text-[11px] font-bold uppercase tracking-[0.42em] ${th.subCls}`}>Event Log</h2>
      </div>
      <div className="max-h-80 flex-1 space-y-2 overflow-y-auto p-4">
        {events.length === 0 && (
          <p className="py-6 text-center font-mono text-[11px] text-white/25">No events yet — system nominal.</p>
        )}
        <AnimatePresence initial={false}>
          {events.map((ev) => {
            const s = SEV_STYLE[ev.sev] || SEV_STYLE.ok;
            const timeStr = ev.ts ? new Date(ev.ts * 1000).toLocaleTimeString([], { hour12: false }) : '--:--:--';
            return (
              <motion.div
                key={ev.id}
                layout
                initial={{ opacity: 0, x: -12, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${s.border} ${s.bg}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                <span className="shrink-0 font-mono text-[10px] text-white/35">{timeStr}</span>
                <span className={`font-mono text-[11px] font-semibold ${s.text}`}>{ev.text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── DemoControls ─────────────────────────────────────────────────────────────
function DemoControls({ onDemo, th }) {
  const btns = [
    { key: 'fault',  label: '💥 Inject Fan Fault',       sub: 'home1/real/fault/inject' },
    { key: 'swell',  label: '⚡ Voltage Swell (262V)',   sub: 'home1/sim/voltage = 262' },
    { key: 'normal', label: '✅ Voltage Normal (230V)',  sub: 'home1/sim/voltage = 230' },
  ];
  return (
    <div className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-black/78 p-5 backdrop-blur-xl ${th.borderCls}`}
      style={{ boxShadow: th.cardShadow }}>
      <h2 className={`font-mono text-[11px] font-bold uppercase tracking-[0.42em] ${th.subCls}`}>Demo Controls</h2>
      {btns.map((b) => (
        <motion.button
          key={b.key} type="button" onClick={() => onDemo(b.key)}
          whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
          className="flex flex-col items-start rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-yellow-400/40 hover:bg-yellow-500/5"
        >
          <span className="font-mono text-[12px] font-bold text-white/85">{b.label}</span>
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-white/25">{b.sub}</span>
        </motion.button>
      ))}
    </div>
  );
}

// ── Dashboard (default export) ────────────────────────────────────────────────
export default function Dashboard({
  loads, history, events, status, isBrokerConnected, audioEnabled,
  onRestoreAll, onTripAll, onLoadCmd, onDemo,
  brokerLabel, historyMax,
  totalConsumption, solarGeneration, netGridDraw, gridVoltage,
}) {
  const tripped = status === 'TRIPPED';
  const th      = tripped ? THEME.trip : THEME.ok;
  const hasData = history.length > 0;
  const activeLoads = LOAD_ORDER.filter((l) => loads[l]).length;

  const lastRow = history[history.length - 1];
  const prevRow = history[history.length - 2];

  const axisCol = tripped ? 'rgba(248,113,113,0.18)' : 'rgba(234,179,8,0.18)';
  const tickCol = tripped ? 'rgba(254,202,202,0.42)' : 'rgba(250,204,21,0.52)';

  return (
    <div
      className="relative min-h-screen px-4 pb-16 pt-10 md:px-8"
      style={{
        backgroundImage: `radial-gradient(circle, ${th.dotGrid} 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      }}
    >

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="mb-7">
        <motion.div
          className={`relative overflow-hidden rounded-2xl border bg-black/75 px-6 py-5 backdrop-blur-xl ${th.borderCls}`}
          style={{ boxShadow: th.cardShadow }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${th.accent}55, transparent)` }} />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 14, -6, 0] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}>
                <Zap className={`h-7 w-7 shrink-0 ${th.textCls}`} strokeWidth={2.5}
                  style={{ filter: th.numFilter }} />
              </motion.div>
              <div>
                <h1 className={`font-mono text-2xl font-black uppercase tracking-tight md:text-3xl ${th.textCls}`}
                  style={{ textShadow: th.glow }}>
                  GridMind
                </h1>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.36em] text-white/30">
                  Cyber-Physical Core · Home1 · 4-Load Live Telemetry
                </p>
              </div>
              <div className={`hidden sm:flex ml-2 items-center rounded-md border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.28em] text-white/32 ${th.borderCls}`}>
                Edge AI
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] text-white/38">
                {audioEnabled
                  ? <Volume2 className="h-3 w-3 text-yellow-400/60" />
                  : <VolumeX  className="h-3 w-3 text-white/22" />}
                {audioEnabled ? 'AUDIO ON' : 'AUDIO READY'}
              </div>

              <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                isBrokerConnected
                  ? 'border-emerald-500/32 bg-emerald-500/[0.06] text-emerald-300'
                  : 'border-red-500/45 bg-red-500/[0.07] text-red-300'
              }`}>
                {isBrokerConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isBrokerConnected ? 'MQTT LIVE' : 'MQTT DOWN'}
                <motion.span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: isBrokerConnected ? '#34d399' : '#f87171',
                    boxShadow: isBrokerConnected
                      ? '0 0 6px rgba(52,211,153,0.85)'
                      : '0 0 6px rgba(248,113,113,0.9)',
                  }}
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: isBrokerConnected ? 1.1 : 0.6, repeat: Infinity }}
                />
              </div>

              <motion.div
                className={`flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm font-bold ${th.badgeCls}`}
                style={{ boxShadow: th.badgeShadow }}
                animate={{ scale: tripped ? [1, 1.045, 1] : [1, 1.012, 1] }}
                transition={{ duration: tripped ? 1.1 : 2.8, repeat: Infinity, ease: 'easeInOut' }}>
                {tripped
                  ? <ShieldAlert className="h-4 w-4" strokeWidth={2.5} />
                  : <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />}
                {status}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </header>

      {/* ── TELEMETRY STRIP ─────────────────────────────────────────────────── */}
      <TelemetryStrip samples={history.length} activeLoads={activeLoads} brokerLabel={brokerLabel} th={th} />

      {/* ── KPI ROW ──────────────────────────────────────────────────────────── */}
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Consumption" Icon={Zap}
          value={hasData ? totalConsumption.toFixed(0) : null} unit="W"
          sparkData={history} sparkKey="consumption"
          curNum={totalConsumption} prevNum={prevRow?.consumption} prevUnit=" W" th={th} />
        <KpiCard title="Solar Generation" Icon={Sun}
          value={hasData ? solarGeneration.toFixed(0) : null} unit="W"
          sparkData={history} sparkKey="solar"
          curNum={solarGeneration} prevNum={prevRow?.solar} prevUnit=" W" th={th}
          accentOverride="#fbbf24" />
        <KpiCard title="Net Grid Draw" Icon={GitBranch}
          value={hasData ? netGridDraw.toFixed(0) : null} unit="W"
          sparkData={history} sparkKey="netDraw"
          curNum={netGridDraw} prevNum={prevRow?.netDraw} prevUnit=" W" th={th} />
        <KpiCard title="Grid Voltage" Icon={Zap}
          value={typeof gridVoltage === 'number' ? gridVoltage.toFixed(1) : null} unit="V"
          sparkData={history} sparkKey="voltage"
          curNum={gridVoltage} prevNum={prevRow?.voltage} prevUnit=" V" th={th}
          accentOverride={voltageColor(gridVoltage)} />
      </div>

      {/* ── CHART + GAUGE ───────────────────────────────────────────────────── */}
      <div className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <motion.div
          layout
          className={`relative overflow-hidden rounded-2xl border bg-black/78 backdrop-blur-xl ${th.borderCls}`}
          style={{ boxShadow: th.cardShadow }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${th.accent}44, transparent)` }} />

          <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 ${th.borderCls}`}>
            <div className="flex items-center gap-3">
              <motion.div
                className="h-2 w-2 rounded-full"
                style={{ background: th.accent, boxShadow: `0 0 8px ${th.accent}cc` }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: hasData ? 0.9 : 2.2, repeat: Infinity }} />
              <h2 className={`font-mono text-[11px] font-bold uppercase tracking-[0.42em] ${th.subCls}`}>
                Live Power Draw
              </h2>
            </div>
            <span className="font-mono text-[10px] text-white/22">
              ~15 min window · {historyMax} sample cap{hasData && ` · ${history.length} received`}
            </span>
          </div>

          <div className="relative h-72 px-2 pt-4 pb-2 md:h-[340px]">
            <AnimatePresence mode="wait">
              {!hasData && (
                <WaitingOverlay isBrokerConnected={isBrokerConnected} brokerLabel={brokerLabel} />
              )}
            </AnimatePresence>

            {hasData && (
              <motion.div className="h-full w-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <defs>
                      {LOAD_ORDER.map((l) => (
                        <linearGradient key={l} id={`grad-${l}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={LOAD_META[l].color} stopOpacity={0.35} />
                          <stop offset="92%" stopColor={LOAD_META[l].color} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis dataKey="time"
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 9, fontFamily: 'ui-monospace' }}
                      axisLine={{ stroke: axisCol }} tickLine={false}
                      minTickGap={40} />
                    <YAxis
                      tick={{ fill: tickCol, fontSize: 9, fontFamily: 'ui-monospace' }}
                      axisLine={{ stroke: axisCol }} tickLine={false} width={46} />
                    <Tooltip content={(props) => <ChartTooltip {...props} th={th} />} />
                    <Legend
                      wrapperStyle={{ fontFamily: 'ui-monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}
                      formatter={(v) => v.toUpperCase()} />
                    {LOAD_ORDER.map((l) => (
                      <Area key={l} type="monotone" dataKey={l} name={LOAD_META[l].label}
                        stroke={LOAD_META[l].color} strokeWidth={2}
                        fill={`url(#grad-${l})`}
                        isAnimationActive={false} strokeLinecap="round" connectNulls />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>

          <div className={`flex items-center justify-between border-t px-6 py-2.5 ${th.borderCls}`}>
            <span className="font-mono text-[10px] text-white/20">Rolling window · {historyMax} samples max</span>
            <span className="font-mono text-[10px] text-white/20">
              {lastRow ? `Last sample: ${lastRow.time}` : 'No data yet'}
            </span>
          </div>
        </motion.div>

        <VoltageGauge value={gridVoltage} th={th} />
      </div>

      {/* ── LOAD CARDS ───────────────────────────────────────────────────────── */}
      <div className="mb-7">
        <h2 className={`mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.42em] ${th.subCls}`}>Loads</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {LOAD_ORDER.map((name) => (
            <LoadCard key={name} name={name} data={loads[name]} onCmd={onLoadCmd} th={th} />
          ))}
        </div>
      </div>

      {/* ── RUPEE INSIGHTS (isolated — see RupeeInsights.js) ────────────────── */}
      <div className="mb-7">
        <RupeeInsightsSection history={history} />
      </div>

      {/* ── EVENT LOG + DEMO CONTROLS ───────────────────────────────────────── */}
      <div className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <EventLog events={events} th={th} />
        <DemoControls onDemo={onDemo} th={th} />
      </div>

      {/* ── CONTROL PANEL ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* RESTORE ALL */}
        <motion.button
          type="button" onClick={onRestoreAll} disabled={!isBrokerConnected}
          className="group relative overflow-hidden rounded-2xl border border-yellow-500/32 bg-black/72 backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-45"
          style={{ boxShadow: '0 0 22px rgba(250,204,21,0.10)' }}
          whileHover={{ scale: 1.013, boxShadow: '0 0 50px rgba(250,204,21,0.42)' }}
          whileTap={{ scale: 0.987 }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
          <div className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 28% 50%, rgba(250,204,21,0.06), transparent 55%)' }} />
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-yellow-300/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

          <div className="relative flex items-center gap-5 px-7 py-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/7"
              style={{ boxShadow: '0 0 20px rgba(250,204,21,0.10)' }}>
              <motion.div
                animate={{ rotate: [0, 16, -8, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
                <Zap className="h-7 w-7 text-yellow-400" strokeWidth={2.5}
                  style={{ filter: 'drop-shadow(0 0 9px rgba(250,204,21,0.85))' }} />
              </motion.div>
            </div>
            <div className="text-left">
              <p className="font-mono text-lg font-black uppercase tracking-[0.13em] text-yellow-400"
                style={{ textShadow: '0 0 22px rgba(250,204,21,0.58)' }}>
                RESTORE ALL LOADS
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.26em] text-white/30">
                Fan · AC · Washer ON · Voltage normal
              </p>
            </div>
          </div>
        </motion.button>

        {/* CUT ALL */}
        <motion.button
          type="button" onClick={onTripAll} disabled={!isBrokerConnected}
          className="group relative overflow-hidden rounded-2xl border border-red-500/42 bg-red-950/18 backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-45"
          style={{ boxShadow: '0 0 28px rgba(239,68,68,0.20)' }}
          whileHover={{ scale: 1.013, boxShadow: '0 0 58px rgba(239,68,68,0.58)' }}
          whileTap={{ scale: 0.987 }}
        >
          <motion.div className="pointer-events-none absolute inset-0 rounded-2xl border border-red-500/18"
            animate={{ opacity: [0, 0.7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/48 to-transparent" />
          <div className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 28% 50%, rgba(239,68,68,0.09), transparent 55%)' }} />
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-red-400/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

          <div className="relative flex items-center gap-5 px-7 py-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/7"
              style={{ boxShadow: '0 0 20px rgba(239,68,68,0.15)' }}>
              <motion.div
                animate={{ scale: [1, 1.18, 1] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}>
                <ShieldAlert className="h-7 w-7 text-red-400" strokeWidth={2.5}
                  style={{ filter: 'drop-shadow(0 0 9px rgba(248,113,113,0.92))' }} />
              </motion.div>
            </div>
            <div className="text-left">
              <p className="font-mono text-lg font-black uppercase tracking-[0.13em] text-red-400"
                style={{ textShadow: '0 0 22px rgba(248,113,113,0.58)' }}>
                CUT ALL LOADS
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.26em] text-white/30">
                Fan · AC · Washer OFF · Manual safety stop
              </p>
            </div>
          </div>
        </motion.button>

      </div>
    </div>
  );
}
