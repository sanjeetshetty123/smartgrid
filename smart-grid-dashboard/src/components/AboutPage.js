import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, User, Shield, Cpu, Activity } from 'lucide-react';

const PUB = process.env.PUBLIC_URL + '/';
const image1 = PUB + 'image1.jpg';
const image2 = PUB + 'imag2.jpeg';
const image3 = PUB + 'image3.jpeg';
const image4 = PUB + 'image4.jpeg';

// ── Floating ambient particles (GPU: y + opacity only) ─────────────────────────
const PARTICLE_DATA = [
  { x:  8, s: 2.5, dur: 11, delay:    0 },
  { x: 18, s: 1.5, dur:  8, delay:   -3 },
  { x: 28, s:   3, dur: 13, delay:   -7 },
  { x: 38, s:   2, dur:  9, delay: -1.5 },
  { x: 48, s: 1.5, dur: 12, delay:   -5 },
  { x: 55, s: 2.5, dur: 10, delay:   -9 },
  { x: 63, s:   2, dur:  8, delay:   -2 },
  { x: 72, s:   3, dur: 14, delay:   -6 },
  { x: 80, s: 1.5, dur: 11, delay:   -4 },
  { x: 88, s:   2, dur:  9, delay:   -8 },
  { x: 13, s: 1.5, dur: 15, delay:  -11 },
  { x: 33, s:   2, dur: 10, delay: -0.5 },
  { x: 58, s: 1.5, dur: 13, delay: -3.5 },
  { x: 92, s: 2.5, dur: 11, delay: -6.5 },
];

function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLE_DATA.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-yellow-400"
          style={{ width: p.s, height: p.s, left: `${p.x}%`, bottom: 0 }}
          animate={{ y: [0, -900], opacity: [0, 0.28, 0.28, 0] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

// ── Sonar pulse rings (around guide avatar) ────────────────────────────────────
function PulseRings() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute rounded-full border border-yellow-400"
          style={{
            width:      152 + i * 56,
            height:     152 + i * 56,
            top:        '50%',
            left:       '50%',
            marginTop:  -(152 + i * 56) / 2,
            marginLeft: -(152 + i * 56) / 2,
          }}
          animate={{ scale: [1, 1.55], opacity: [0.45, 0] }}
          transition={{ duration: 2.4, delay: i * 0.82, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </>
  );
}

// ── Neural connector SVG ───────────────────────────────────────────────────────
function NeuralConnector() {
  const PATHS = [
    'M 300 0 C 300 40 100 40 100 80',
    'M 300 0 C 300 40 300 40 300 80',
    'M 300 0 C 300 40 500 40 500 80',
  ];
  return (
    <div className="pointer-events-none relative mx-auto w-full max-w-2xl" style={{ height: 60 }}>
      <svg viewBox="0 0 600 80" width="100%" height="60" preserveAspectRatio="none">
        <defs>
          <filter id="nc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {PATHS.map((d, i) => (
          <path key={`bg-${i}`} d={d} fill="none" stroke="rgba(250,204,21,0.07)" strokeWidth="1" />
        ))}
        {PATHS.map((d, i) => (
          <motion.path
            key={`p-${i}`}
            d={d}
            fill="none"
            stroke="rgba(250,204,21,0.42)"
            strokeWidth="1.5"
            strokeLinecap="round"
            filter="url(#nc-glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.55 + i * 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        <motion.circle cx="300" cy="2" r="4" fill="rgba(250,204,21,0.85)"
          filter="url(#nc-glow)"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }} />
        {[100, 300, 500].map((cx, i) => (
          <motion.circle key={i} cx={cx} cy="78" r="3.5" fill="rgba(250,204,21,0.70)"
            filter="url(#nc-glow)"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.9 + i * 0.18, duration: 0.3 }} />
        ))}
      </svg>
    </div>
  );
}

// ── Card scan line (GPU: translateY, clipped by overflow-hidden on card) ────────
function ScanLine({ delay = 0 }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 z-10 h-[2px]"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.6) 50%, transparent)',
        top: 0,
      }}
      animate={{ y: [-4, 320] }}
      transition={{ duration: 2.6, delay, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
    />
  );
}

// ── Animation variants ─────────────────────────────────────────────────────────
const teamContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15, delayChildren: 0.52 } },
};
const teamCard = {
  hidden: { opacity: 0, y: 42, filter: 'blur(6px)' },
  show:   { opacity: 1, y: 0,  filter: 'blur(0px)',
             transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const CARD_HOVER = {
  scale: 1.04,
  boxShadow: '0 0 32px rgba(250,204,21,0.55), 0 0 80px rgba(250,204,21,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
  borderColor: 'rgba(250,204,21,0.55)',
};

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ src, name, large = false }) {
  const [failed, setFailed] = useState(false);
  const sz = large ? 'h-32 w-32' : 'h-28 w-28';
  const initials = name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <motion.div
      className="relative shrink-0"
      whileHover={{ scale: 1.1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ borderRadius: '50%', boxShadow: '0 0 22px rgba(250,204,21,0.32)' }}
    >
      {!failed ? (
        <img
          src={src}
          alt={name}
          className={`${sz} rounded-full border-2 border-yellow-500/45 object-cover`}
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        <div
          className={`${sz} flex items-center justify-center rounded-full border-2 border-yellow-500/45`}
          style={{ background: 'radial-gradient(circle at 40% 35%, rgba(120,53,15,0.55), rgba(0,0,0,0.8) 70%)' }}
        >
          {initials ? (
            <span
              className="select-none font-mono text-2xl font-black text-yellow-400"
              style={{ textShadow: '0 0 18px rgba(250,204,21,0.8)' }}
            >
              {initials}
            </span>
          ) : (
            <User className="h-10 w-10 text-yellow-500/60" strokeWidth={1.5} />
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.12),transparent_55%)]" />
    </motion.div>
  );
}

// ── PersonCard (overflow-hidden clips scan line) ────────────────────────────────
function PersonCard({ image, name, role, variants, scanDelay = 0 }) {
  return (
    <motion.div
      variants={variants}
      className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-yellow-500/20 bg-black/75 p-6 backdrop-blur-xl"
      style={{ boxShadow: '0 0 40px rgba(234,179,8,0.10), inset 0 1px 0 rgba(255,255,255,0.05)' }}
      whileHover={CARD_HOVER}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(250,204,21,0.09),transparent_55%)]" />
      <ScanLine delay={scanDelay} />
      <Avatar src={image} name={name} />
      <div className="relative text-center">
        {role && (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.38em] text-yellow-500/60">
            {role}
          </p>
        )}
        <p
          className="font-mono text-sm font-bold tracking-wide text-white"
          style={{ textShadow: '0 0 16px rgba(255,255,255,0.18)' }}
        >
          {name}
        </p>
      </div>
    </motion.div>
  );
}

// ── Project metrics strip ──────────────────────────────────────────────────────
const METRICS = [
  { icon: Activity, label: 'TRIP LIMIT',  value: '20 A'       },
  { icon: Cpu,      label: 'ALGORITHM',   value: 'LSTM + RoC' },
  { icon: Shield,   label: 'SELF-HEAL',   value: '5 reads'    },
  { icon: Zap,      label: 'LATENCY',     value: '< 80 ms'    },
];

// ── AboutPage ──────────────────────────────────────────────────────────────────
export default function AboutPage() {
  return (
    <motion.div
      className="relative min-h-screen w-full overflow-x-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Floating ambient particles */}
      <FloatingParticles />

      {/* Background gradients */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 85% 55% at 50% 30%, rgba(120,53,15,0.28), transparent 62%)',
            'radial-gradient(ellipse 48% 38% at 50% 50%, rgba(250,204,21,0.045), transparent 68%)',
            'radial-gradient(ellipse 100% 32% at 50% 100%, rgba(91,35,0,0.20), transparent 55%)',
          ].join(', '),
        }}
      />

      {/* Scanline texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.022]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.65) 2px, rgba(255,255,255,0.65) 3px)',
          backgroundSize: '100% 3px',
        }}
      />

      {/* Page content */}
      <div className="relative z-10 mx-auto max-w-4xl px-5 pb-20 pt-20 md:px-10">

        {/* Eyebrow */}
        <motion.div
          className="mb-5 flex items-center justify-center gap-2"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-yellow-500/45" />
          <Zap className="h-3 w-3 text-yellow-500/55" strokeWidth={2.5} />
          <span className="font-mono text-[9px] uppercase tracking-[0.52em] text-yellow-500/50">
            GridMind · Cyber-Physical System
          </span>
          <Zap className="h-3 w-3 text-yellow-500/55" strokeWidth={2.5} />
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-yellow-500/45" />
        </motion.div>

        {/* Heading */}
        <motion.h1
          className="mb-14 select-none text-center font-mono text-3xl font-black uppercase tracking-tight text-yellow-400 md:text-5xl"
          style={{ textShadow: '0 0 32px rgba(250,204,21,0.55), 0 0 72px rgba(234,179,8,0.22)' }}
          initial={{ opacity: 0, y: -24, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.2, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
        >
          About the Core Team
        </motion.h1>

        {/* Section: Project Guide */}
        <motion.p
          className="mb-5 text-center font-mono text-[10px] uppercase tracking-[0.45em] text-yellow-500/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          Project Guide
        </motion.p>

        <div className="mb-8 flex justify-center">
          <div className="w-full max-w-xs">
            <motion.div
              className="relative flex flex-col items-center gap-4 rounded-2xl border border-yellow-500/20 bg-black/75 p-8 backdrop-blur-xl"
              style={{ boxShadow: '0 0 48px rgba(234,179,8,0.12), inset 0 1px 0 rgba(255,255,255,0.06)' }}
              initial={{ opacity: 0, y: -40, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.32, duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
              whileHover={CARD_HOVER}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(250,204,21,0.10),transparent_55%)]" />
              {/* Sonar pulse rings — expands outside card (no overflow-hidden on guide card) */}
              <PulseRings />

              <Avatar src={image1} name="Dr. SADANANDA L" large />

              <div className="relative text-center">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.38em] text-yellow-500/58">
                  Faculty Guide
                </p>
                <p
                  className="font-mono text-base font-bold tracking-wide text-white"
                  style={{ textShadow: '0 0 16px rgba(255,255,255,0.20)' }}
                >
                  Dr. SADANANDA L
                </p>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Neural connector (guide → team) */}
        <NeuralConnector />

        {/* Divider */}
        <motion.div
          className="my-8 flex items-center gap-4"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-yellow-500/20" />
          <span className="font-mono text-[9px] uppercase tracking-[0.45em] text-yellow-500/40">Team Members</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-yellow-500/20" />
        </motion.div>

        {/* Team members grid */}
        <motion.div
          className="grid grid-cols-1 gap-5 sm:grid-cols-3"
          variants={teamContainer}
          initial="hidden"
          animate="show"
        >
          <PersonCard image={image2} name="B SANJEET SHETTY" role="Team Member" variants={teamCard} scanDelay={0.8} />
          <PersonCard image={image3} name="ADVAITH ACHARYA"  role="Team Member" variants={teamCard} scanDelay={2.4} />
          <PersonCard image={image4} name="BHUVAN S KUMAR"   role="Team Member" variants={teamCard} scanDelay={4.0} />
        </motion.div>

        {/* Project metrics strip */}
        <motion.div
          className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {METRICS.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-xl border border-yellow-500/12 bg-black/50 py-4 backdrop-blur-xl"
            >
              <Icon className="h-4 w-4 text-yellow-500/55" strokeWidth={1.8} />
              <span className="font-mono text-[8px] uppercase tracking-[0.38em] text-yellow-500/45">{label}</span>
              <span
                className="font-mono text-sm font-black text-yellow-400"
                style={{ textShadow: '0 0 12px rgba(250,204,21,0.55)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Footer note */}
        <motion.p
          className="mt-14 text-center font-mono text-[9px] uppercase tracking-[0.42em] text-white/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.8 }}
        >
          3rd-Year Engineering Major Project · GridMind Cyber-Physical System
        </motion.p>
      </div>
    </motion.div>
  );
}
