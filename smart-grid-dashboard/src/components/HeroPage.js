import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import ScrollButtons from './ScrollButtons';

// ── Lightning spark paths ── origin: SVG center (0,0); viewBox −180..180 ──────
const SPARKS = [
  { id: 'n',  d: 'M0,0 L5,-18 L-4,-30 L7,-46 L2,-58 L11,-88',      delay: 0,    dur: 1.4 },
  { id: 'ne', d: 'M0,0 L14,-10 L20,-4 L34,-18 L40,-12 L66,-30',     delay: 0.55, dur: 1.2 },
  { id: 'e',  d: 'M0,0 L18,5 L28,-2 L44,7 L54,2 L84,9',             delay: 1.1,  dur: 1.5 },
  { id: 'se', d: 'M0,0 L14,12 L20,6 L34,20 L40,14 L64,32',          delay: 1.65, dur: 1.3 },
  { id: 's',  d: 'M0,0 L-4,18 L4,30 L-6,46 L-1,58 L-9,86',         delay: 2.2,  dur: 1.4 },
  { id: 'sw', d: 'M0,0 L-14,10 L-20,4 L-34,18 L-40,12 L-64,28',    delay: 2.75, dur: 1.2 },
  { id: 'w',  d: 'M0,0 L-18,-4 L-28,3 L-44,-5 L-54,0 L-82,-7',     delay: 3.3,  dur: 1.5 },
  { id: 'nw', d: 'M0,0 L-14,-12 L-20,-6 L-34,-20 L-40,-14 L-62,-32', delay: 3.85, dur: 1.3 },
];

// [radius, rotDuration, direction(+CW/−CCW), strokeDasharray, opacity, strokeWidth]
const RINGS = [
  [162, 52,  1, '5 9',   0.11, 1.0],
  [140, 32, -1, '13 5',  0.20, 1.5],
  [114, 20,  1, '3 11',  0.28, 1.0],
  [82,  13, -1, '2 8',   0.40, 1.5],
];

// Circumference ≈ 2π×r; racing dot: 9px lit, rest dark
const RACING_DOTS = [
  { r: 140, circ: 880,  duration: 4.5, dir:  1, color: 'rgba(250,204,21,0.95)', sw: 2.5 },
  { r: 162, circ: 1018, duration: 7,   dir: -1, color: 'rgba(250,204,21,0.65)', sw: 1.8 },
];

// ── Lightning spark ────────────────────────────────────────────────────────────
function LightningSpark({ d, delay, dur }) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="rgba(250,204,21,0.88)"
      strokeWidth="1.2"
      strokeLinecap="round"
      filter="url(#hero-spark-glow)"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 1, 0.55, 0] }}
      transition={{ duration: dur, delay, repeat: Infinity, repeatDelay: 3.8, ease: 'easeOut' }}
    />
  );
}

// ── Orbiting node (div-based so we avoid SVG transform-origin headaches) ───────
function OrbitNode({ orbitSize, duration, delay, size = 6, color = 'rgba(250,204,21,0.9)' }) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        width: orbitSize, height: orbitSize,
        top: '50%', left: '50%',
        marginTop: -orbitSize / 2, marginLeft: -orbitSize / 2,
        borderRadius: '50%',
      }}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
    >
      <motion.div
        style={{
          position: 'absolute',
          width: size, height: size,
          top: -size / 2, left: '50%', marginLeft: -size / 2,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 ${size * 2.5}px ${color}, 0 0 ${size * 6}px ${color}44`,
        }}
        animate={{ scale: [1, 1.8, 1], opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut', delay: delay * 0.4 }}
      />
    </motion.div>
  );
}

// ── Character stagger variants ─────────────────────────────────────────────────
const titleCharVar = {
  hidden: { opacity: 0, y: -38, filter: 'blur(7px)' },
  show: (i) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { delay: 0.28 + i * 0.038, duration: 0.58, ease: [0.22, 1, 0.36, 1] },
  }),
};
const subCharVar = {
  hidden: { opacity: 0, y: 22, filter: 'blur(4px)' },
  show: (i) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { delay: 0.84 + i * 0.03, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

const TITLE    = 'GRIDMIND'.split('');
const SUBTITLE = 'CYBER-PHYSICAL CORE'.split('');

// ── HeroPage ──────────────────────────────────────────────────────────────────
// Props
//   nodeId   — displayed in the HUD corner (default 'node_01')
//   onExplore — called when user clicks EXPLORE NOW  → navigate to dashboard
//   onAbout   — called when user clicks ABOUT US     → navigate to about section
export default function HeroPage({ nodeId = 'node_01' }) {
  const hudItems = [
    { label: 'NODE',     value: nodeId.toUpperCase(),  corner: 'top-2 left-3',    align: 'items-start', ix: -20, iy: -20 },
    { label: 'PROTOCOL', value: 'MQTT / QoS-1',        corner: 'top-2 right-3',   align: 'items-end',   ix:  20, iy: -20 },
    { label: 'MODEL',    value: 'LSTM + RoC',           corner: 'bottom-2 left-3', align: 'items-start', ix: -20, iy:  20 },
    { label: 'STATUS',   value: 'ONLINE',               corner: 'bottom-2 right-3',align: 'items-end',   ix:  20, iy:  20, green: true },
  ];

  return (
    <motion.div
      className="relative flex h-screen w-full flex-col items-center justify-between overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
    >

      {/* ── Background: layered radial gradients ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 85% 55% at 50% 50%, rgba(120,53,15,0.3), transparent 62%)',
            'radial-gradient(ellipse 48% 38% at 50% 52%, rgba(250,204,21,0.055), transparent 68%)',
            'radial-gradient(ellipse 100% 32% at 50% 100%, rgba(91,35,0,0.22), transparent 55%)',
            'radial-gradient(ellipse 55% 22% at 18% 18%, rgba(78,35,0,0.14), transparent 50%)',
            'radial-gradient(ellipse 55% 22% at 82% 14%, rgba(78,35,0,0.14), transparent 50%)',
          ].join(', '),
        }}
      />

      {/* Slow breathing pulse (GPU: opacity only on static gradient) */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 62% 46% at 50% 50%, rgba(250,204,21,0.088), transparent 68%)' }}
        animate={{ opacity: [0.36, 1, 0.36] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Scanline texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.024]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.65) 2px, rgba(255,255,255,0.65) 3px)',
          backgroundSize: '100% 3px',
        }}
      />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ TITLE ━━━━━━━━━━━ */}
      <div className="relative z-10 pt-14 text-center md:pt-16">

        {/* Eyebrow line */}
        <motion.div
          className="mb-4 flex items-center justify-center gap-2"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-yellow-500/50" />
          <Zap className="h-3 w-3 text-yellow-500/60" strokeWidth={2.5} />
          <span className="font-mono text-[9px] uppercase tracking-[0.52em] text-yellow-500/55">
            Cyber-Physical Security Gate
          </span>
          <Zap className="h-3 w-3 text-yellow-500/60" strokeWidth={2.5} />
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-yellow-500/50" />
        </motion.div>

        {/* Main title — char-by-char stagger */}
        <h1
          className="select-none font-mono text-4xl font-black uppercase md:text-5xl lg:text-6xl xl:text-7xl"
          aria-label="GRIDMIND"
        >
          {TITLE.map((ch, i) => (
            <motion.span
              key={i} custom={i} variants={titleCharVar} initial="hidden" animate="show"
              className="inline-block"
              style={ch === ' '
                ? { width: '0.35em' }
                : { color: '#facc15', textShadow: '0 0 26px rgba(250,204,21,0.72), 0 0 58px rgba(234,179,8,0.28)' }}
            >
              {ch === ' ' ? ' ' : ch}
            </motion.span>
          ))}
        </h1>

        {/* Colon divider */}
        <motion.div
          className="my-2 flex items-center justify-center gap-2"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.78, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-yellow-500/32" />
          <span className="font-mono text-sm text-yellow-500/40">:</span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-yellow-500/32" />
        </motion.div>

        {/* Subtitle */}
        <h2
          className="select-none font-mono text-lg font-bold uppercase tracking-[0.22em] md:text-xl lg:text-2xl xl:text-3xl"
          aria-label="CYBER-PHYSICAL CORE"
        >
          {SUBTITLE.map((ch, i) => (
            <motion.span
              key={i} custom={i} variants={subCharVar} initial="hidden" animate="show"
              className="inline-block"
              style={ch === ' '
                ? { width: '0.3em' }
                : ch === '-'
                ? { color: 'rgba(250,204,21,0.42)' }
                : { color: 'rgba(255,255,255,0.82)', textShadow: '0 0 14px rgba(255,255,255,0.22)' }}
            >
              {ch === ' ' ? ' ' : ch}
            </motion.span>
          ))}
        </h2>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ CORE ━━━━━━━━━━━ */}
      <div className="relative z-10 flex items-center justify-center">
        <div
          className="relative scale-[0.72] sm:scale-90 md:scale-100"
          style={{ width: 360, height: 360 }}
        >
          {/* SVG: rings, sparks, ticks, orb */}
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="-180 -180 360 360"
            aria-hidden
          >
            <defs>
              <filter id="hero-spark-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.8" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="hero-ring-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="hero-orb-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="11" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="hero-orb-fill" cx="42%" cy="32%" r="65%">
                <stop offset="0%"   stopColor="rgba(254,249,195,0.92)" />
                <stop offset="48%"  stopColor="rgba(250,204,21,0.68)" />
                <stop offset="100%" stopColor="rgba(120,53,15,0.08)" />
              </radialGradient>
            </defs>

            {/* Faint crosshair guides */}
            <line x1="-170" y1="0"    x2="170" y2="0"    stroke="rgba(250,204,21,0.05)" strokeWidth="0.5" />
            <line x1="0"    y1="-170" x2="0"   y2="170"  stroke="rgba(250,204,21,0.05)" strokeWidth="0.5" />
            <line x1="-120" y1="-120" x2="120" y2="120"  stroke="rgba(250,204,21,0.03)" strokeWidth="0.5" />
            <line x1="120"  y1="-120" x2="-120" y2="120" stroke="rgba(250,204,21,0.03)" strokeWidth="0.5" />

            {/* Tick marks at r=162 — every 15°, major every 90° */}
            {Array.from({ length: 24 }, (_, i) => {
              const a  = (i * 15 * Math.PI) / 180;
              const r1 = 158;
              const r2 = i % 6 === 0 ? 145 : 152;
              return (
                <line key={i}
                  x1={Math.cos(a) * r1} y1={Math.sin(a) * r1}
                  x2={Math.cos(a) * r2} y2={Math.sin(a) * r2}
                  stroke={i % 6 === 0 ? 'rgba(250,204,21,0.55)' : 'rgba(250,204,21,0.18)'}
                  strokeWidth={i % 6 === 0 ? 1.5 : 0.8}
                />
              );
            })}

            {/* Rotating dashed rings */}
            {RINGS.map(([r, dur, dir, dash, op, sw], i) => (
              <motion.circle
                key={i}
                cx="0" cy="0" r={r}
                fill="none"
                stroke={`rgba(250,204,21,${op})`}
                strokeWidth={sw}
                strokeDasharray={dash}
                style={{ transformOrigin: 'center' }}
                animate={{ rotate: dir * 360 }}
                transition={{ duration: dur, repeat: Infinity, ease: 'linear' }}
              />
            ))}

            {/* Racing radar dots on rings 1 & 2 */}
            {RACING_DOTS.map((dot, i) => (
              <motion.circle
                key={`dot-${i}`}
                cx="0" cy="0" r={dot.r}
                fill="none"
                stroke={dot.color}
                strokeWidth={dot.sw}
                strokeDasharray={`9 ${dot.circ - 9}`}
                strokeLinecap="round"
                filter="url(#hero-ring-glow)"
                style={{ transformOrigin: 'center' }}
                animate={{ rotate: dot.dir * 360 }}
                transition={{ duration: dot.duration, repeat: Infinity, ease: 'linear' }}
              />
            ))}

            {/* Lightning sparks (8 directions) */}
            {SPARKS.map((s) => (
              <LightningSpark key={s.id} d={s.d} delay={s.delay} dur={s.dur} />
            ))}

            {/* Core orb — outer glow ring */}
            <motion.circle
              cx="0" cy="0" r="62"
              fill="rgba(250,204,21,0.025)"
              stroke="rgba(250,204,21,0.52)"
              strokeWidth="1.5"
              filter="url(#hero-orb-glow)"
              animate={{ r: [60, 66, 60], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Core orb fill */}
            <motion.circle
              cx="0" cy="0" r="50"
              fill="url(#hero-orb-fill)"
              animate={{ opacity: [0.10, 0.20, 0.10], r: [48, 53, 48] }}
              transition={{ duration: 3.0, repeat: Infinity, ease: 'easeInOut' }}
            />
          </svg>

          {/* Orbiting nodes — 3 tracks, 8 total */}
          {/* Outer  r=138px → diameter 276 */}
          <OrbitNode orbitSize={276} duration={15}   delay={0}     size={7} color="rgba(250,204,21,0.92)" />
          <OrbitNode orbitSize={276} duration={15}   delay={5}     size={5} color="rgba(250,204,21,0.60)" />
          <OrbitNode orbitSize={276} duration={15}   delay={10}    size={4} color="rgba(250,204,21,0.38)" />
          {/* Middle r=112px → diameter 224 */}
          <OrbitNode orbitSize={224} duration={9.5}  delay={0}     size={6} color="rgba(254,240,138,0.88)" />
          <OrbitNode orbitSize={224} duration={9.5}  delay={3.17}  size={4} color="rgba(251,191,36,0.70)" />
          <OrbitNode orbitSize={224} duration={9.5}  delay={6.33}  size={4} color="rgba(245,158,11,0.58)" />
          {/* Inner  r=80px  → diameter 160 */}
          <OrbitNode orbitSize={160} duration={5.5}  delay={0}     size={5} color="rgba(250,204,21,1.0)"  />
          <OrbitNode orbitSize={160} duration={5.5}  delay={2.75}  size={3} color="rgba(250,204,21,0.65)" />

          {/* Central Zap icon inside glowing orb */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="relative flex h-[102px] w-[102px] items-center justify-center rounded-full"
              style={{
                border: '1.5px solid rgba(250,204,21,0.88)',
                background:
                  'radial-gradient(circle at 40% 32%, rgba(254,249,195,0.10), rgba(250,204,21,0.04) 58%, transparent 80%)',
                boxShadow:
                  '0 0 32px rgba(250,204,21,0.25), 0 0 68px rgba(250,204,21,0.08), inset 0 0 22px rgba(250,204,21,0.06)',
              }}
            >
              {/* GPU-safe pulsing glow overlay (opacity only) */}
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  boxShadow:
                    '0 0 68px rgba(250,204,21,0.58), 0 0 138px rgba(250,204,21,0.24), inset 0 0 46px rgba(250,204,21,0.18)',
                }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
              >
                <Zap
                  className="h-12 w-12 text-yellow-300"
                  strokeWidth={2.5}
                  style={{
                    filter:
                      'drop-shadow(0 0 12px rgba(250,204,21,1)) drop-shadow(0 0 30px rgba(250,204,21,0.55))',
                  }}
                />
              </motion.div>
            </div>
          </div>

          {/* HUD corner labels */}
          {hudItems.map((hud, i) => (
            <motion.div
              key={hud.label}
              className={`absolute ${hud.corner} flex flex-col ${hud.align}`}
              initial={{ opacity: 0, x: hud.ix, y: hud.iy }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: 1.28 + i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="font-mono text-[8px] uppercase tracking-[0.38em] text-yellow-500/38">
                {hud.label}
              </span>
              <span
                className="font-mono text-[10px] font-bold"
                style={
                  hud.green
                    ? { color: 'rgba(52,211,153,0.95)', textShadow: '0 0 10px rgba(52,211,153,0.62)' }
                    : { color: 'rgba(250,204,21,0.76)' }
                }
              >
                {hud.value}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ BUTTONS ━━━━━━━━━━━ */}
      <div className="relative z-10 pb-12 text-center md:pb-16">

        {/* Tagline */}
        <motion.p
          className="mb-6 font-mono text-[10px] uppercase tracking-[0.44em] text-white/28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.75, duration: 0.9 }}
        >
          Predictive protection · Edge AI · Real-time telemetry
        </motion.p>

        <ScrollButtons />
      </div>
    </motion.div>
  );
}
