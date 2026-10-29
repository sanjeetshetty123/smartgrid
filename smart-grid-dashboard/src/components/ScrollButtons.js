import React from 'react';
import { motion } from 'framer-motion';
import { Zap, ArrowRight, Info } from 'lucide-react';

const scrollTo = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ── ScrollButtons ─────────────────────────────────────────────────────────────
// "Explore Now" scrolls to #live-dashboard; "About Us" scrolls to #about-section.
// Both buttons use Framer Motion scale animations on hover and tap.
export default function ScrollButtons() {
  return (
    <motion.div
      className="flex items-center justify-center gap-4"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.55, duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
    >

      {/* ── EXPLORE NOW (primary) ── */}
      <motion.button
        type="button"
        onClick={() => scrollTo('live-dashboard')}
        className="group relative overflow-hidden rounded-2xl border border-yellow-500/45 bg-yellow-500/10 px-8 py-4 font-mono text-sm font-black uppercase tracking-[0.2em] text-yellow-400 backdrop-blur-xl"
        style={{
          boxShadow:
            '0 0 16px rgba(250,204,21,0.16), 0 0 5px rgba(250,204,21,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
        whileHover={{
          scale: 1.048,
          borderColor: 'rgba(250,204,21,0.90)',
          boxShadow:
            '0 0 58px rgba(250,204,21,0.80), 0 0 24px rgba(250,204,21,0.48), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
        whileTap={{ scale: 0.97 }}
      >
        {/* GPU-safe pulsing glow (opacity only) */}
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: '0 0 40px rgba(250,204,21,0.40), 0 0 16px rgba(250,204,21,0.22)' }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Shimmer sweep on hover */}
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-yellow-300/20 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
        <span className="relative flex items-center gap-2.5">
          <Zap className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          EXPLORE NOW
          <ArrowRight
            className="h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-2"
            strokeWidth={2.5}
          />
        </span>
      </motion.button>

      {/* ── ABOUT US (secondary) ── */}
      <motion.button
        type="button"
        onClick={() => scrollTo('about-section')}
        className="group relative overflow-hidden rounded-2xl border border-white/18 bg-transparent px-8 py-4 font-mono text-sm font-black uppercase tracking-[0.2em] text-white/52 backdrop-blur-xl"
        whileHover={{
          scale: 1.048,
          borderColor: 'rgba(255,255,255,0.55)',
          backgroundColor: 'rgba(255,255,255,0.058)',
          color: 'rgba(255,255,255,0.96)',
          boxShadow: '0 0 28px rgba(255,255,255,0.10)',
        }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {/* GPU-safe pulsing white glow */}
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: '0 0 22px rgba(255,255,255,0.14)' }}
          animate={{ opacity: [0.2, 0.85, 0.2] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
        />
        {/* Shimmer sweep on hover */}
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/12 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
        <span className="relative flex items-center gap-2.5">
          <motion.span
            animate={{ rotate: [0, 14, -14, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 2.0 }}
          >
            <Info className="h-4 w-4 shrink-0" strokeWidth={2} />
          </motion.span>
          ABOUT US
        </span>
      </motion.button>

    </motion.div>
  );
}
