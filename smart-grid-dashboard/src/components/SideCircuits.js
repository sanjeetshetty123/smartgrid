import React from 'react';
import { motion } from 'framer-motion';

// ── Node positions (% from top) ───────────────────────────────────────────────
const L_NODES = [12, 28, 46, 64, 80];
const R_NODES = [18, 36, 52, 70, 86];

// ── Data packet configs ───────────────────────────────────────────────────────
const L_PKTS = [
  { delay: 0,    dur: 4.2 },
  { delay: 2.6,  dur: 3.8 },
  { delay: 5.8,  dur: 4.5 },
];
const R_PKTS = [
  { delay: 1.1,  dur: 4.0 },
  { delay: 3.8,  dur: 3.6 },
  { delay: 7.0,  dur: 4.8 },
];

// ── Circuit node: pulsing ring + center diamond ───────────────────────────────
function Node({ pct, color, tickDir, delay }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2" style={{ top: `${pct}%`, marginTop: -6 }}>
      {/* Pulse ring */}
      <motion.div
        className="absolute rounded-full border"
        style={{ width: 16, height: 16, top: -4, left: -4, borderColor: color, borderWidth: 1 }}
        animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, delay, ease: 'easeOut' }}
      />
      {/* Horizontal tick branch */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-px"
        style={{
          width: 10,
          background: color,
          opacity: 0.55,
          [tickDir]: '100%',
        }}
      />
      {/* Diamond (rotated square) */}
      <motion.div
        className="relative w-2 h-2 rounded-sm"
        style={{
          background: color,
          transform: 'rotate(45deg)',
          boxShadow: `0 0 8px ${color}`,
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2 + delay * 0.4, repeat: Infinity, ease: 'easeInOut', delay }}
      />
    </div>
  );
}

// ── Data packet: a glowing pill traveling along the line ──────────────────────
function Packet({ color, delay, dur, direction }) {
  const down = direction === 'down';
  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 rounded-full"
      style={{
        width: 3,
        height: 10,
        background: `linear-gradient(to bottom, transparent, ${color}, transparent)`,
        boxShadow: `0 0 6px ${color}bb`,
      }}
      initial={{ top: down ? '3%' : '95%' }}
      animate={{
        top: down ? ['3%', '97%'] : ['97%', '3%'],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        top:     { duration: dur, delay, repeat: Infinity, ease: 'linear', repeatDelay: 2 },
        opacity: { duration: dur, delay, repeat: Infinity, times: [0, 0.05, 0.92, 1], repeatDelay: 2 },
      }}
    />
  );
}

// ── Corner bracket ────────────────────────────────────────────────────────────
function Bracket({ corner, color }) {
  const borders = {
    'top-left':     'border-t border-l',
    'top-right':    'border-t border-r',
    'bottom-left':  'border-b border-l',
    'bottom-right': 'border-b border-r',
  }[corner];
  const pos = {
    'top-left':     'top-6 left-2',
    'top-right':    'top-6 right-2',
    'bottom-left':  'bottom-6 left-2',
    'bottom-right': 'bottom-6 right-2',
  }[corner];
  const radius = {
    'top-left':     'rounded-tl',
    'top-right':    'rounded-tr',
    'bottom-left':  'rounded-bl',
    'bottom-right': 'rounded-br',
  }[corner];

  return (
    <motion.div
      className={`absolute w-5 h-5 ${borders} ${pos} ${radius}`}
      style={{ borderColor: color, opacity: 0.55 }}
      animate={{ opacity: [0.45, 0.75, 0.45] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

// ── Vertical text helper ──────────────────────────────────────────────────────
function VText({ label, color, flip = false }) {
  return (
    <span
      className="font-mono text-[8.5px] uppercase tracking-[0.45em] whitespace-nowrap"
      style={{
        writingMode: 'vertical-rl',
        transform: flip ? 'rotate(180deg)' : 'none',
        color,
      }}
    >
      {label}
    </span>
  );
}

// ── Signal bar stack (like WiFi bars, vertical) ───────────────────────────────
function SignalBars({ color, active }) {
  const heights = [4, 7, 10, 14];
  return (
    <div className="flex items-end gap-[2px]">
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: h,
            background: color,
            opacity: active ? (i < 3 ? 1 : 0.4) : 0.15,
          }}
          animate={active ? { opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SideCircuits({ readings, status, isBrokerConnected }) {
  const tripped = status === 'TRIPPED';
  const accent  = tripped ? '#f87171' : '#facc15';
  const ca      = (a) =>
    tripped ? `rgba(248,113,113,${a})` : `rgba(250,204,21,${a})`;

  const latest  = readings[readings.length - 1];
  const voltage = latest ? latest.voltage.toFixed(1) : null;
  const current = latest ? latest.current.toFixed(2) : null;
  const count   = readings.length;

  const lineGrad = {
    background: `linear-gradient(to bottom, transparent 0%, ${ca(0.42)} 12%, ${ca(0.42)} 88%, transparent 100%)`,
  };

  const base = 'fixed top-0 bottom-0 z-[15] hidden xl:flex flex-col items-center pointer-events-none select-none overflow-hidden';

  return (
    <>
      {/* ══════════════ LEFT PANEL ══════════════ */}
      <div className={`${base} left-0 w-14`}>

        {/* Vertical spine */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2" style={lineGrad} />
        {/* Blur glow copy */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 blur-[3px]" style={lineGrad} />

        {/* Corner brackets */}
        <Bracket corner="top-left"    color={accent} />
        <Bracket corner="bottom-left" color={accent} />

        {/* Data packets flowing DOWN */}
        {L_PKTS.map((p, i) => (
          <Packet key={i} color={accent} delay={p.delay} dur={p.dur} direction="down" />
        ))}

        {/* Circuit nodes */}
        {L_NODES.map((pct, i) => (
          <Node key={i} pct={pct} color={accent} tickDir="left" delay={i * 0.45} />
        ))}

        {/* Top area: "GRID MONITOR" label */}
        <div className="absolute top-[22%] flex justify-center">
          <VText label="GRID MONITOR" color={ca(0.38)} flip />
        </div>

        {/* Middle: voltage readout */}
        <div className="absolute top-[50%] -translate-y-1/2 flex flex-col items-center gap-1.5">
          <motion.span
            className="font-mono text-[8px] uppercase tracking-[0.35em]"
            style={{ color: ca(0.28) }}
          >
            V
          </motion.span>
          <motion.span
            key={voltage}
            className="font-mono text-[11px] font-bold"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: ca(0.72) }}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {voltage ?? '---'}
          </motion.span>
        </div>

        {/* Bottom area: MQTT indicator */}
        <div className="absolute bottom-[18%] flex flex-col items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{
              background: isBrokerConnected ? '#34d399' : ca(0.55),
              boxShadow: isBrokerConnected
                ? '0 0 8px rgba(52,211,153,0.85)'
                : `0 0 6px ${ca(0.55)}`,
            }}
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: isBrokerConnected ? 1.4 : 0.7, repeat: Infinity }}
          />
          <VText label={isBrokerConnected ? 'MQTT' : 'WAIT'} color={ca(0.3)} flip />
        </div>

      </div>

      {/* ══════════════ RIGHT PANEL ══════════════ */}
      <div className={`${base} right-0 w-14`}>

        {/* Vertical spine */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2" style={lineGrad} />
        <div className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 blur-[3px]" style={lineGrad} />

        {/* Corner brackets */}
        <Bracket corner="top-right"    color={accent} />
        <Bracket corner="bottom-right" color={accent} />

        {/* Data packets flowing UP */}
        {R_PKTS.map((p, i) => (
          <Packet key={i} color={accent} delay={p.delay} dur={p.dur} direction="up" />
        ))}

        {/* Circuit nodes */}
        {R_NODES.map((pct, i) => (
          <Node key={i} pct={pct} color={accent} tickDir="right" delay={i * 0.55 + 0.3} />
        ))}

        {/* Top area: status indicator + label */}
        <div className="absolute top-[16%] flex flex-col items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{
              background: tripped ? '#f87171' : '#34d399',
              boxShadow: tripped
                ? '0 0 10px rgba(248,113,113,0.9)'
                : '0 0 10px rgba(52,211,153,0.9)',
            }}
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: tripped ? 0.65 : 2, repeat: Infinity }}
          />
          <VText label={status} color={ca(0.35)} />
        </div>

        {/* Middle: current readout */}
        <div className="absolute top-[50%] -translate-y-1/2 flex flex-col items-center gap-1.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.35em]" style={{ color: ca(0.28) }}>
            I
          </span>
          <motion.span
            key={current}
            className="font-mono text-[11px] font-bold"
            style={{ writingMode: 'vertical-rl', color: ca(0.72) }}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {current ? `${current}A` : '---'}
          </motion.span>
        </div>

        {/* "LIVE TRACE" label */}
        <div className="absolute top-[70%] flex justify-center">
          <VText label="LIVE TRACE" color={ca(0.38)} />
        </div>

        {/* Bottom: signal bars + sample count */}
        <div className="absolute bottom-[14%] flex flex-col items-center gap-2.5">
          <SignalBars color={accent} active={isBrokerConnected} />
          <motion.span
            key={count}
            className="font-mono text-[9px]"
            style={{ color: ca(0.32) }}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            #{count}
          </motion.span>
        </div>

      </div>
    </>
  );
}
