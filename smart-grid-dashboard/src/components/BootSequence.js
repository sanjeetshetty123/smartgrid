import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const PHASE1_MS = 2000;
const FLASH_MS = 100;
const EXIT_START_MS = 2200;

function LightningBurst({ visible }) {
  if (!visible) return null;
  const paths = [
    'M 10 5 L 35 45 L 28 45 L 55 95 L 40 50 L 52 50 L 70 5',
    'M 90 10 L 65 50 L 78 50 L 45 100 L 55 55 L 42 55 L 25 15',
    'M 50 0 L 62 40 L 52 38 L 72 88 L 58 48 L 68 48 L 88 8',
  ];
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="50%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a5f3fc" />
        </linearGradient>
        <filter id="bolt-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke="url(#boltGrad)"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#bolt-glow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.12, delay: i * 0.03 }}
        />
      ))}
    </svg>
  );
}

export default function BootSequence({ onComplete }) {
  const onDoneRef = useRef(onComplete);
  useEffect(() => {
    onDoneRef.current = onComplete;
  }, [onComplete]);

  const [phase, setPhase] = useState(1);
  const [flash, setFlash] = useState(false);
  const [showBolts, setShowBolts] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const tThunder = setTimeout(() => {
      setPhase(2);
      setFlash(true);
      setShowBolts(true);
    }, PHASE1_MS);

    const tFlashEnd = setTimeout(() => {
      setFlash(false);
    }, PHASE1_MS + FLASH_MS);

    const tExit = setTimeout(() => {
      setPhase(3);
      setExiting(true);
      setShowBolts(false);
    }, EXIT_START_MS);

    const tDone = setTimeout(() => {
      onDoneRef.current?.();
    }, EXIT_START_MS + 750);

    return () => {
      clearTimeout(tThunder);
      clearTimeout(tFlashEnd);
      clearTimeout(tExit);
      clearTimeout(tDone);
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
    >
      {flash && (
        <div className="absolute inset-0 z-[110] bg-white" aria-hidden />
      )}

      <div className="absolute inset-0 z-[102] opacity-40">
        <LightningBurst visible={showBolts} />
      </div>

      <motion.div
        className="relative z-[105] flex flex-col items-center gap-10"
        animate={
          exiting
            ? { scale: 2.2, opacity: 0, filter: 'blur(8px)' }
            : { scale: 1, opacity: 1, filter: 'blur(0px)' }
        }
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="relative h-36 w-36 rounded-full"
          animate={{
            boxShadow: [
              '0 0 40px rgba(34, 211, 238, 0.45), 0 0 80px rgba(34, 211, 238, 0.25), inset 0 0 40px rgba(165, 243, 252, 0.15)',
              '0 0 60px rgba(34, 211, 238, 0.75), 0 0 120px rgba(34, 211, 238, 0.4), inset 0 0 50px rgba(165, 243, 252, 0.22)',
              '0 0 40px rgba(34, 211, 238, 0.45), 0 0 80px rgba(34, 211, 238, 0.25), inset 0 0 40px rgba(165, 243, 252, 0.15)',
            ],
            scale: phase >= 2 ? [1, 1.08, 1] : [1, 1.04, 1],
          }}
          transition={{
            duration: phase >= 2 ? 0.25 : 2,
            repeat: phase >= 2 ? 0 : Infinity,
            ease: 'easeInOut',
          }}
        >
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-cyan-300/40 via-cyan-500/30 to-slate-900/80 backdrop-blur-md" />
          <div className="absolute inset-6 rounded-full bg-cyan-400/25 blur-xl" />
          <motion.div
            className="absolute inset-0 rounded-full border border-cyan-300/40"
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>

        <div className="text-center">
          <motion.p
            className="font-mono text-sm tracking-[0.25em] text-cyan-300/90 md:text-base"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            Gathering Edge Telemetry...
          </motion.p>
          <p className="mt-3 font-mono text-[10px] text-slate-500">SECURE UPLINK · EDGE NODE</p>
        </div>
      </motion.div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.08),transparent_55%)]" />
    </motion.div>
  );
}
