import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PRE_THUNDER_MS = 2000;
const FLASH_MS = 100;
const LOADER_START_MS = 2200;
const EXIT_START_MS = 4000;
const DONE_MS = 4800;

function GoldLightningBurst({ visible }) {
  if (!visible) return null;
  const paths = [
    'M 8 4 L 32 48 L 24 48 L 58 98 L 38 52 L 50 52 L 72 2',
    'M 92 8 L 68 52 L 80 50 L 42 100 L 52 58 L 40 58 L 22 12',
    'M 48 0 L 60 42 L 50 40 L 74 92 L 58 46 L 68 46 L 90 6',
  ];
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="goldBoltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="40%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <filter id="goldBoltGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
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
          stroke="url(#goldBoltGrad)"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#goldBoltGlow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.14, delay: i * 0.04 }}
        />
      ))}
    </svg>
  );
}

export default function IntroSequence({ onComplete }) {
  const doneRef = useRef(onComplete);
  const finishedRef = useRef(false);

  useEffect(() => {
    doneRef.current = onComplete;
  }, [onComplete]);

  const [phase, setPhase] = useState('charge');
  const [flash, setFlash] = useState(false);
  const [showBolts, setShowBolts] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const tThunder = setTimeout(() => {
      setFlash(true);
      setShowBolts(true);
    }, PRE_THUNDER_MS);

    const tFlashEnd = setTimeout(() => setFlash(false), PRE_THUNDER_MS + FLASH_MS);

    const tLoader = setTimeout(() => {
      setPhase('loader');
      setShowLoader(true);
      setShowBolts(false);
    }, LOADER_START_MS);

    const tExit = setTimeout(() => {
      setPhase('exit');
      setExiting(true);
    }, EXIT_START_MS);

    const tDone = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      doneRef.current?.();
    }, DONE_MS);

    return () => {
      clearTimeout(tThunder);
      clearTimeout(tFlashEnd);
      clearTimeout(tLoader);
      clearTimeout(tExit);
      clearTimeout(tDone);
    };
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setExiting(true);
    setShowLoader(true);
    setShowBolts(false);
    setPhase('exit');
    window.setTimeout(() => doneRef.current?.(), 400);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-black"
      initial={{ opacity: 1 }}
      animate={{
        opacity: exiting ? 0 : 1,
        scale: exiting ? 1.08 : 1,
      }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={finish}
        className="absolute right-4 top-4 z-[230] rounded-full border border-yellow-500/30 bg-black/60 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-500/80 backdrop-blur-md transition hover:border-yellow-400/60 hover:text-yellow-400"
      >
        Skip intro
      </button>

      {flash && <div className="absolute inset-0 z-[210] bg-white" aria-hidden />}

      <div className="absolute inset-0 z-[205] opacity-50">
        <GoldLightningBurst visible={showBolts} />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 100% 70% at 50% 30%, rgba(180, 83, 9, 0.35), transparent 55%), radial-gradient(ellipse 80% 50% at 80% 80%, rgba(113, 63, 18, 0.25), transparent 50%)',
        }}
      />

      <AnimatePresence mode="wait">
        {phase === 'charge' && !showLoader && (
          <motion.div
            key="charge"
            className="relative z-[220] flex flex-col items-center gap-10 px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              className="relative h-40 w-40 md:h-44 md:w-44"
              animate={{
                boxShadow: [
                  '0 0 50px rgba(250, 204, 21, 0.35), 0 0 100px rgba(234, 179, 8, 0.2), inset 0 0 40px rgba(253, 224, 71, 0.12)',
                  '0 0 70px rgba(250, 204, 21, 0.55), 0 0 140px rgba(234, 179, 8, 0.35), inset 0 0 55px rgba(253, 224, 71, 0.18)',
                  '0 0 50px rgba(250, 204, 21, 0.35), 0 0 100px rgba(234, 179, 8, 0.2), inset 0 0 40px rgba(253, 224, 71, 0.12)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-yellow-300/35 via-amber-600/25 to-black/90 backdrop-blur-md" />
              <div className="absolute inset-8 rounded-full bg-yellow-400/20 blur-2xl" />
              <motion.div
                className="absolute inset-0 rounded-full border border-yellow-400/35"
                animate={{ rotate: 360 }}
                transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
              />
            </motion.div>
            <div>
              <p className="font-mono text-sm tracking-[0.35em] text-yellow-400/90 md:text-base">
                Charging atmospheric nodes…
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.5em] text-white/35">
                Thunder sync imminent
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showLoader && (
        <motion.div
          className="relative z-[220] flex w-full max-w-lg flex-col items-center gap-8 px-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: exiting ? 0 : 1, y: exiting ? -20 : 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex w-full max-w-[min(100%,42rem)] justify-center px-2">
            <motion.h1
              className="font-black uppercase tracking-tight text-yellow-400 [text-shadow:0_0_28px_rgba(250,204,21,0.45)] text-3xl leading-tight sm:text-4xl md:text-5xl lg:text-6xl"
              style={{ wordBreak: 'keep-all' }}
              initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="block whitespace-nowrap text-center">
                GRIDMIND
              </span>
            </motion.h1>
          </div>

          <p className="font-mono text-xs uppercase tracking-[0.45em] text-amber-500/80">
            Cyber-physical core · Initializing live trace
          </p>

          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-200"
              style={{ boxShadow: '0 0 18px rgba(250, 204, 21, 0.55)' }}
              animate={{ x: ['-120%', '320%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <motion.p
            className="font-mono text-[11px] text-white/40"
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            Mapping voltage & current streams…
          </motion.p>
        </motion.div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.06),transparent_60%)]" />
    </motion.div>
  );
}
