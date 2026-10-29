import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, User, Lock, AlertTriangle, ShieldCheck } from 'lucide-react';

// Demo credentials — change for production deployment.
const USERS = { admin: 'grid2025' };

export default function LoginPage({ nodeId, onLogin }) {
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState(false);
  const passRef = useRef(null);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (loading || success) return;

    setError('');
    setLoading(true);

    // Simulate a brief auth handshake
    setTimeout(() => {
      if (USERS[username.trim()] === password) {
        setSuccess(true);
        setTimeout(onLogin, 900);   // brief success flash before transition
      } else {
        setError('ACCESS DENIED — Invalid operator credentials');
        setLoading(false);
        setPassword('');
        passRef.current?.focus();
      }
    }, 700);
  }, [username, password, loading, success, onLogin]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(8px)', scale: 0.97 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Ambient radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 55%, rgba(120,53,15,0.28), transparent 65%), ' +
            'radial-gradient(ellipse 40% 30% at 50% 50%, rgba(250,204,21,0.06), transparent 70%)',
        }}
      />

      {/* Subtle corner bolts */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-20" aria-hidden>
        <line x1="0"   y1="0"   x2="18%" y2="35%" stroke="rgba(250,204,21,0.3)" strokeWidth="0.5" />
        <line x1="100%" y1="0" x2="82%" y2="35%" stroke="rgba(250,204,21,0.3)" strokeWidth="0.5" />
        <line x1="0"   y1="100%" x2="22%" y2="68%" stroke="rgba(250,204,21,0.2)" strokeWidth="0.4" />
        <line x1="100%" y1="100%" x2="78%" y2="68%" stroke="rgba(250,204,21,0.2)" strokeWidth="0.4" />
      </svg>

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-sm px-4"
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-black/75 px-8 py-10 shadow-[0_0_80px_rgba(234,179,8,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">

          {/* Top inner glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(250,204,21,0.11),transparent_55%)]" />

          <div className="relative">

            {/* Logo block */}
            <div className="mb-8 flex flex-col items-center gap-3">
              <motion.div
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-500/35 bg-yellow-500/8 shadow-[0_0_32px_rgba(250,204,21,0.28)]"
                animate={{
                  boxShadow: [
                    '0 0 24px rgba(250,204,21,0.22)',
                    '0 0 52px rgba(250,204,21,0.48)',
                    '0 0 24px rgba(250,204,21,0.22)',
                  ],
                }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <AnimatePresence mode="wait">
                  {success ? (
                    <motion.div key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                      <ShieldCheck className="h-8 w-8 text-emerald-400" strokeWidth={2.5} />
                    </motion.div>
                  ) : (
                    <motion.div key="zap"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}>
                      <Zap className="h-8 w-8 text-yellow-400" strokeWidth={2.5} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <div className="text-center">
                <h1
                  className="font-mono text-xl font-black uppercase tracking-[0.22em] text-yellow-400"
                  style={{ textShadow: '0 0 28px rgba(250,204,21,0.45)' }}
                >
                  GridMind
                </h1>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.4em] text-white/35">
                  Cyber-Physical Security Gate
                </p>
              </div>

              <div className="mt-1 rounded-full border border-yellow-500/15 bg-yellow-500/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-yellow-500/60">
                Node: {nodeId}
              </div>
            </div>

            {/* Form */}
            <AnimatePresence mode="wait">
              {!success ? (
                <motion.form
                  key="form"
                  onSubmit={handleSubmit}
                  className="space-y-3"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Username */}
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-yellow-500/40" />
                    <input
                      type="text"
                      placeholder="OPERATOR ID"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && passRef.current?.focus()}
                      autoComplete="username"
                      spellCheck={false}
                      className="w-full rounded-xl border border-yellow-500/15 bg-white/4 py-3 pl-10 pr-4 font-mono text-sm text-yellow-100 placeholder-yellow-500/30 outline-none transition-all duration-200 focus:border-yellow-400/50 focus:bg-white/6 focus:shadow-[0_0_18px_rgba(250,204,21,0.18)]"
                    />
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-yellow-500/40" />
                    <input
                      ref={passRef}
                      type="password"
                      placeholder="ACCESS CODE"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-yellow-500/15 bg-white/4 py-3 pl-10 pr-4 font-mono text-sm text-yellow-100 placeholder-yellow-500/30 outline-none transition-all duration-200 focus:border-yellow-400/50 focus:bg-white/6 focus:shadow-[0_0_18px_rgba(250,204,21,0.18)]"
                    />
                  </div>

                  {/* Error message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        key="err"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-2 overflow-hidden rounded-lg border border-red-500/25 bg-red-950/25 px-3 py-2.5"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                        <p className="font-mono text-[11px] text-red-400">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={loading || !username || !password}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    className="mt-1 w-full rounded-xl border border-yellow-500/35 bg-yellow-500/10 py-3.5 font-mono text-sm font-black uppercase tracking-[0.18em] text-yellow-400 shadow-[0_0_22px_rgba(250,204,21,0.18)] transition-all duration-200 hover:border-yellow-400/60 hover:bg-yellow-500/18 hover:shadow-[0_0_32px_rgba(250,204,21,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-yellow-400/30 border-t-yellow-400"
                        />
                        AUTHENTICATING…
                      </span>
                    ) : (
                      '⚡ INITIALIZE ACCESS'
                    )}
                  </motion.button>

                  {/* Demo hint */}
                  <p className="pt-1 text-center font-mono text-[9px] text-white/18">
                    demo · admin / grid2025
                  </p>
                </motion.form>
              ) : (
                <motion.div
                  key="success"
                  className="flex flex-col items-center gap-3 py-4"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="font-mono text-sm font-bold uppercase tracking-widest text-emerald-400"
                    style={{ textShadow: '0 0 20px rgba(52,211,153,0.5)' }}>
                    Access Granted
                  </p>
                  <p className="font-mono text-[11px] text-white/40">Initialising grid interface…</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
