import React, { useCallback, useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';
import { motion, AnimatePresence } from 'framer-motion';
import IntroSequence from './components/IntroSequence';
import LoginPage from './components/LoginPage';
import HeroPage from './components/HeroPage';
import AboutPage from './components/AboutPage';
import Dashboard from './components/Dashboard';
import SideCircuits from './components/SideCircuits';
import AiEnginePanel from './components/AiEnginePanel';
import AgentForecastSection from './components/AgentForecastPanels';

const MQTT_URL      = process.env.REACT_APP_MQTT_URL      || 'ws://localhost:9001/mqtt';
const BROKER_LABEL  = process.env.REACT_APP_BROKER_LABEL  || 'local mosquitto';
const MQTT_USERNAME = process.env.REACT_APP_MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.REACT_APP_MQTT_PASSWORD || '';
const HISTORY_MAX   = parseInt(process.env.REACT_APP_HISTORY_MAX || '450', 10); // ~15 min @ 2s
const SNAPSHOT_MS    = 2000;          // matches virtual_house.py's publish cadence

// ── Topics (fixed schema — matches backend.py / virtual_house.py) ─────────────
const TELEMETRY_WILDCARD = 'home1/+/+/telemetry';
const ALERTS_TOPIC  = 'home1/alerts';   // backend.py's alert() — the ONLY source of trip/alarm state
const cmdTopic  = (load) => `home1/virtual/${load}/cmd/manual`;
const FAULT_TOPIC   = 'home1/real/fault/inject';
const VOLTAGE_TOPIC = 'home1/sim/voltage';

const LOADS      = ['fan', 'ac', 'washer', 'solar'];
const CTRL_LOADS = ['fan', 'ac', 'washer'];   // solar has no ON/OFF command

// ── AI Engine (NILM) — matches ml_backend.py, fully additive/independent ──────
// Set to false to hide the "AI Engine — NILM" section with no other changes.
const SHOW_AI_ENGINE_PANEL = true;
const ML_ANALYSIS_TOPIC = 'home1/ml/analysis';
const ML_EVENT_TOPIC    = 'home1/ml/nilm_event';
const ML_CONTROL_TOPIC  = 'home1/ml/control';
const AI_APPLIANCES = ['LED Light', 'Fan', 'Kettle', 'Refrigerator', 'Laptop Charger'];

// ── Web Audio alarm ───────────────────────────────────────────────────────────
// Accepts an optional pre-created (and suspended) AudioContext so browsers
// that enforce the autoplay policy don't block the alarm sound.
// The context is created on the first user gesture (intro complete / button click).
function playAlarm(existingCtx, durationSeconds = 5) {
  try {
    const ctx = existingCtx || new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();   // no-op if already running; unblocks a suspended context

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    for (let t = 0; t < durationSeconds; t++) {
      osc.frequency.setValueAtTime(700,  ctx.currentTime + t);
      osc.frequency.linearRampToValueAtTime(1100, ctx.currentTime + t + 0.5);
      osc.frequency.linearRampToValueAtTime(700,  ctx.currentTime + t + 1.0);
    }
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.setValueAtTime(0.28, ctx.currentTime + durationSeconds - 0.3);
    gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + durationSeconds);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSeconds);

    return ctx;
  } catch (e) {
    console.warn('Web Audio API unavailable:', e);
    return null;
  }
}

// ── LightningField ────────────────────────────────────────────────────────────
function LightningField({ tripped }) {
  const [flashOn, setFlashOn] = useState(false);
  const FLASH = {
    healthy: 'rgba(234, 179, 8, 0.12)',
    tripped: 'rgba(239, 68, 68, 0.14)',
  };

  useEffect(() => {
    let cancelled = false;
    let nextId, flashEndId;

    const schedule = () => {
      nextId = window.setTimeout(() => {
        if (cancelled) return;
        setFlashOn(true);
        flashEndId = window.setTimeout(() => {
          if (cancelled) return;
          setFlashOn(false);
          schedule();
        }, 100);
      }, 1800 + Math.random() * 5200);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(nextId);
      window.clearTimeout(flashEndId);
    };
  }, []);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[4]"
      aria-hidden
      animate={{ opacity: flashOn ? 1 : 0 }}
      transition={{ duration: 0.05 }}
      style={{ backgroundColor: tripped ? FLASH.tripped : FLASH.healthy }}
    />
  );
}

// ── AmbientLightningBolts ─────────────────────────────────────────────────────
function AmbientLightningBolts({ tripped }) {
  const stroke = tripped ? 'rgba(248, 113, 113, 0.35)' : 'rgba(250, 204, 21, 0.28)';
  const bolts = [
    'M 4 8 L 22 42 L 16 42 L 38 88 L 28 48 L 36 48 L 62 4',
    'M 88 12 L 58 48 L 72 46 L 36 96 L 48 52 L 38 52 L 18 18',
    'M 48 0 L 56 36 L 48 34 L 68 82 L 54 44 L 64 44 L 84 6',
  ];
  return (
    <div className="pointer-events-none fixed inset-0 z-[2] overflow-hidden opacity-70" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <filter id="ambient-bolt-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {bolts.map((d, i) => (
          <motion.path
            key={i} d={d} fill="none" stroke={stroke}
            strokeWidth="0.55" strokeLinecap="round" strokeLinejoin="round"
            filter="url(#ambient-bolt-blur)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.9, 0.6, 0] }}
            transition={{ duration: 3.2 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.9 }}
          />
        ))}
      </svg>
    </div>
  );
}

// ── TripBanner ────────────────────────────────────────────────────────────────
function TripBanner({ visible, text }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="trip-banner"
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="fixed left-0 right-0 top-0 z-[90] border-b border-red-400/50 bg-black/90 px-4 py-3 text-center shadow-[0_16px_48px_rgba(220,38,38,0.55)] backdrop-blur-xl"
        >
          <p className="font-mono text-sm font-black uppercase tracking-[0.2em] text-white md:text-base">
            <span className="text-red-500">CRITICAL:</span>{' '}
            <span className="text-red-400">{text}</span>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── MQTT hook ─────────────────────────────────────────────────────────────────
// Subscribes to every load's telemetry (home1/{node}/{load}/telemetry, node is
// "virtual" or "real" — matches backend.py's home1/+/+/telemetry wildcard) and
// exposes a publishCommand() helper for control topics.
function useGridMqtt(onTelemetry, onAlert, onMlAnalysis, onMlEvent) {
  const clientRef      = useRef(null);
  const onTelemetryRef = useRef(onTelemetry);
  const onAlertRef     = useRef(onAlert);
  const onMlAnalysisRef = useRef(onMlAnalysis);   // AI Engine (NILM) — additive
  const onMlEventRef    = useRef(onMlEvent);      // AI Engine (NILM) — additive
  const [connected, setConnected] = useState(false);

  useEffect(() => { onTelemetryRef.current = onTelemetry; }, [onTelemetry]);
  useEffect(() => { onAlertRef.current = onAlert; }, [onAlert]);
  useEffect(() => { onMlAnalysisRef.current = onMlAnalysis; }, [onMlAnalysis]);
  useEffect(() => { onMlEventRef.current = onMlEvent; }, [onMlEvent]);

  useEffect(() => {
    const opts = {
      clientId: `grid_web_${Math.random().toString(16).slice(2, 12)}`,
      clean: true,
      reconnectPeriod: 4000,
    };
    if (MQTT_USERNAME) {
      opts.username = MQTT_USERNAME;
      opts.password = MQTT_PASSWORD;
    }

    const client = mqtt.connect(MQTT_URL, opts);
    clientRef.current = client;

    const handleMessage = (topic, message) => {
      if (topic === ALERTS_TOPIC) {
        onAlertRef.current?.(message.toString());
        return;
      }

      // AI Engine (NILM) — additive routing, does not touch telemetry/alert logic below.
      if (topic === ML_ANALYSIS_TOPIC) {
        try { onMlAnalysisRef.current?.(JSON.parse(message.toString())); } catch { /* malformed JSON — ignore */ }
        return;
      }
      if (topic === ML_EVENT_TOPIC) {
        try { onMlEventRef.current?.(JSON.parse(message.toString())); } catch { /* malformed JSON — ignore */ }
        return;
      }

      const parts = topic.split('/');           // home1 / node / load / telemetry
      if (parts.length !== 4 || parts[3] !== 'telemetry') return;
      const [, node, load] = parts;
      if (!LOADS.includes(load)) return;

      try {
        const payload = JSON.parse(message.toString());
        onTelemetryRef.current(load, node, payload);
      } catch {
        /* malformed JSON — ignore */
      }
    };

    client.on('connect', () => {
      setConnected(true);
      client.subscribe(TELEMETRY_WILDCARD, { qos: 0 }, (err) => {
        if (err) console.error('Subscribe error', err);
      });
      client.subscribe(ALERTS_TOPIC, { qos: 0 }, (err) => {
        if (err) console.error('Subscribe error (alerts)', err);
      });
      // AI Engine (NILM) — additive subscriptions, same client/connection.
      client.subscribe(ML_ANALYSIS_TOPIC, { qos: 0 }, (err) => {
        if (err) console.error('Subscribe error (ml analysis)', err);
      });
      client.subscribe(ML_EVENT_TOPIC, { qos: 0 }, (err) => {
        if (err) console.error('Subscribe error (ml event)', err);
      });
    });
    client.on('reconnect', () => setConnected(false));
    client.on('close',     () => setConnected(false));
    client.on('offline',   () => setConnected(false));
    client.on('error',     (e) => console.error('MQTT error', e));
    client.on('message',   handleMessage);

    return () => {
      try { client.removeListener('message', handleMessage); client.end(true); } catch { /* noop */ }
      clientRef.current = null;
    };
  }, []);

  const publish = useCallback((topic, payload) => {
    const c = clientRef.current;
    if (!c) return;
    c.publish(topic, String(payload), { qos: 1 }, (err) => {
      if (err) console.error('MQTT publish error', err);
    });
  }, []);

  return { isBrokerConnected: connected, publish };
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Intro & auth ─────────────────────────────────────────────────────────
  const [introDone, setIntroDone] = useState(false);
  const [loggedIn,  setLoggedIn]  = useState(false);
  const audioCtxRef = useRef(null);   // primed on first user gesture

  const handleIntroComplete = useCallback(() => {
    setIntroDone(true);
    try {
      if (!audioCtxRef.current) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.suspend();
        audioCtxRef.current = ctx;
      }
    } catch { /* Safari / restricted env — alarm will fail silently */ }
  }, []);

  // ── Grid state ────────────────────────────────────────────────────────────
  const [loads, setLoads]         = useState({});   // { fan: {p,v,i,state,ts,node}, ... }
  const [history, setHistory]     = useState([]);   // rolling snapshot rows for charts
  const [events, setEvents]       = useState([]);   // derived event log, newest first
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [tripped, setTripped]     = useState(false);   // driven ONLY by home1/alerts, see onAlert
  const [tripReason, setTripReason] = useState('');

  // ── AI Engine (NILM) state — fed by ml_backend.py, fully additive ────────
  const [mlAnalysis, setMlAnalysis] = useState(null);   // latest home1/ml/analysis payload
  const [nilmEvent, setNilmEvent]   = useState(null);   // latest home1/ml/nilm_event payload

  const loadsRef        = useRef({});
  const prevStateRef    = useRef({});   // load -> last known state (0|1)
  const alarmActiveRef  = useRef(false);
  const alarmCtxRef     = useRef(null);
  const tripClearTimerRef = useRef(null);   // fallback auto-clear if no recovery alert arrives

  const pushEvent = useCallback((sev, text, ts) => {
    setEvents((prev) => [{ id: `${ts}-${text}`, ts, sev, text }, ...prev].slice(0, 20));
  }, []);

  // ── Telemetry handler ─────────────────────────────────────────────────────
  // Purely informational now — updates live readings and logs neutral
  // state-transition entries. Does NOT drive the alarm/TRIPPED status;
  // that comes exclusively from home1/alerts via onAlert() below.
  const onTelemetry = useCallback((load, node, payload) => {
    loadsRef.current = { ...loadsRef.current, [load]: { ...payload, node } };
    setLoads(loadsRef.current);

    // State-transition events (1->0 / 0->1) — neutral, no alarm icon.
    const prev = prevStateRef.current[load];
    if (prev !== undefined && payload.state !== prev) {
      if (prev === 1 && payload.state === 0) {
        pushEvent('info', `${load.toUpperCase()} switched off`, payload.ts);
      } else if (prev === 0 && payload.state === 1) {
        pushEvent('info', `${load.toUpperCase()} switched on`, payload.ts);
      }
    }
    prevStateRef.current[load] = payload.state;
  }, [pushEvent]);

  // ── Alert handler (home1/alerts) ──────────────────────────────────────────
  // This is the ONLY thing that drives tripped/status/alarm. backend.py
  // publishes here exclusively from its real overload/overvoltage detection
  // (trip_load() / check_voltage()) — never for manual UI commands.
  const ALERT_AUTO_CLEAR_MS = 9000;   // fallback so the banner can't get stuck forever

  const onAlert = useCallback((text) => {
    const ts = Date.now() / 1000;

    if (tripClearTimerRef.current) {
      clearTimeout(tripClearTimerRef.current);
      tripClearTimerRef.current = null;
    }

    const isRecovery = /normal/i.test(text);   // matches backend.py's "VOLT NORMAL"
    if (isRecovery) {
      pushEvent('ok', text, ts);
      setTripped(false);
      setTripReason('');
      return;
    }

    pushEvent('warn', text, ts);
    setTripReason(text);
    setTripped(true);

    if (!alarmActiveRef.current) {
      alarmActiveRef.current = true;
      alarmCtxRef.current = playAlarm(audioCtxRef.current, 5);
      if (alarmCtxRef.current) setAudioEnabled(true);
      setTimeout(() => { alarmActiveRef.current = false; }, 5000);
    }

    // No recovery alert guaranteed for every trip type — auto-clear the
    // banner so it never stays stuck TRIPPED indefinitely.
    tripClearTimerRef.current = window.setTimeout(() => {
      setTripped(false);
      tripClearTimerRef.current = null;
    }, ALERT_AUTO_CLEAR_MS);
  }, [pushEvent]);

  // ── AI Engine (NILM) handlers — just store the latest payload, nothing else ──
  const onMlAnalysis = useCallback((payload) => setMlAnalysis(payload), []);
  const onMlEvent    = useCallback((payload) => setNilmEvent(payload), []);

  const { isBrokerConnected, publish } = useGridMqtt(onTelemetry, onAlert, onMlAnalysis, onMlEvent);

  // ── Periodic snapshot for charts (matches virtual_house.py's 2s cadence) ──
  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = loadsRef.current;
      const hasAny = LOADS.some((l) => cur[l]);
      if (!hasAny) return;

      const vVals = LOADS.map((l) => cur[l]?.v).filter((x) => typeof x === 'number');
      const fan    = cur.fan    ? Math.abs(cur.fan.p)    : 0;
      const ac     = cur.ac     ? Math.abs(cur.ac.p)     : 0;
      const washer = cur.washer ? Math.abs(cur.washer.p) : 0;
      const solar  = cur.solar  ? Math.abs(cur.solar.p)  : 0;
      const row = {
        t: Date.now(),
        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        fan, ac, washer, solar,
        consumption: fan + ac + washer,
        netDraw: fan + ac + washer - solar,
        voltage: vVals.length ? vVals.reduce((a, b) => a + b, 0) / vVals.length : 0,
        totalCurrent: LOADS.reduce((sum, l) => sum + (cur[l]?.i || 0), 0),
      };
      setHistory((prev) => {
        const next = [...prev, row];
        return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
      });
    }, SNAPSHOT_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived KPIs ───────────────────────────────────────────────────────────
  const totalConsumption = CTRL_LOADS.reduce((sum, l) => sum + Math.abs(loads[l]?.p || 0), 0);
  const solarGeneration  = Math.abs(loads.solar?.p || 0);
  const netGridDraw      = LOADS.reduce((sum, l) => sum + (loads[l]?.p || 0), 0);
  const gridVoltage      = (() => {
    const vs = LOADS.map((l) => loads[l]?.v).filter((x) => typeof x === 'number');
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  })();

  // Overall alarm condition — ties into the trip banner / lightning FX.
  // `tripped`/`tripReason` are state set exclusively by onAlert() above,
  // driven by home1/alerts — never inferred from raw telemetry.
  const status = tripped ? 'TRIPPED' : 'HEALTHY';

  useEffect(() => () => { alarmCtxRef.current?.close().catch(() => {}); }, []);

  // ── Control handlers ──────────────────────────────────────────────────────
  const primeAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.suspend();
        audioCtxRef.current = ctx;
      }
    } catch { /* noop */ }
  }, []);

  const handleLoadCmd = useCallback((load, cmd) => {
    primeAudio();
    publish(cmdTopic(load), cmd);
  }, [publish, primeAudio]);

  const handleRestoreAll = useCallback(() => {
    primeAudio();
    CTRL_LOADS.forEach((l) => publish(cmdTopic(l), 'ON'));
    publish(VOLTAGE_TOPIC, '230');
  }, [publish, primeAudio]);

  const handleTripAll = useCallback(() => {
    primeAudio();
    CTRL_LOADS.forEach((l) => publish(cmdTopic(l), 'OFF'));
  }, [publish, primeAudio]);

  const handleDemo = useCallback((action) => {
    primeAudio();
    if (action === 'fault')  publish(FAULT_TOPIC, 'overload_fan');
    if (action === 'swell')  publish(VOLTAGE_TOPIC, '262');
    if (action === 'normal') publish(VOLTAGE_TOPIC, '230');
  }, [publish, primeAudio]);

  // ── AI Engine (NILM) controls — publishes to home1/ml/control only ───────
  const handleAiToggleAppliance = useCallback((name) => {
    publish(ML_CONTROL_TOPIC, `toggle:${name}`);
  }, [publish]);
  const handleAiInjectFault = useCallback(() => {
    publish(ML_CONTROL_TOPIC, 'fault');
  }, [publish]);
  const handleAiClearFault = useCallback(() => {
    publish(ML_CONTROL_TOPIC, 'clear');
  }, [publish]);

  // ── Render ────────────────────────────────────────────────────────────────
  const sideReadings = history.map((r) => ({ voltage: r.voltage, current: r.totalCurrent }));

  return (
    <div className="relative min-h-full overflow-x-hidden bg-black font-sans text-white">
      {!introDone && <IntroSequence onComplete={handleIntroComplete} />}

      <AnimatePresence mode="wait">
        {introDone && !loggedIn && (
          <LoginPage key="login" nodeId="home1" onLogin={() => setLoggedIn(true)} />
        )}
      </AnimatePresence>

      {loggedIn && (<>
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-[1]" style={{
        background: 'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(120,53,15,0.35), transparent 55%), radial-gradient(ellipse 80% 60% at 100% 50%, rgba(69,26,3,0.25), transparent 50%), radial-gradient(ellipse 60% 50% at 0% 80%, rgba(113,63,18,0.2), transparent 45%)',
      }} />
      <LightningField tripped={tripped} />
      <div className="hidden md:block">
        <AmbientLightningBolts tripped={tripped} />
      </div>
      <motion.div
        className="pointer-events-none fixed inset-0 z-[3]"
        style={{ boxShadow: tripped ? 'inset 0 0 160px rgba(220,38,38,0.45)' : 'inset 0 0 140px rgba(234,179,8,0.28)' }}
        animate={{ opacity: [0.04, 0.10, 0.04] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <TripBanner visible={tripped} text={tripReason} />

      {/* ── Side circuit decorations (xl+ screens only) ── */}
      <SideCircuits
        readings={sideReadings}
        status={status}
        isBrokerConnected={isBrokerConnected}
      />

      {/* ── SECTION 1: Hero ── */}
      <section id="hero-section" className="relative z-10">
        <HeroPage nodeId="home1" />
      </section>

      {/* ── SECTION 2: About ── */}
      <section id="about-section" className="relative z-10">
        <AboutPage />
      </section>

      {/* ── SECTION 3: Live Dashboard ── */}
      <section id="live-dashboard" className="relative z-10 mx-auto max-w-6xl">
        <Dashboard
          loads={loads}
          history={history}
          events={events}
          status={status}
          isBrokerConnected={isBrokerConnected}
          audioEnabled={audioEnabled}
          onRestoreAll={handleRestoreAll}
          onTripAll={handleTripAll}
          onLoadCmd={handleLoadCmd}
          onDemo={handleDemo}
          brokerLabel={BROKER_LABEL}
          historyMax={HISTORY_MAX}
          totalConsumption={totalConsumption}
          solarGeneration={solarGeneration}
          netGridDraw={netGridDraw}
          gridVoltage={gridVoltage}
        />
      </section>

      {/* ── SECTION 4: AI Engine (NILM) — additive, independent of telemetry/alarm logic above ── */}
      {SHOW_AI_ENGINE_PANEL && (
        <section id="ai-engine-section" className="relative z-10 mx-auto max-w-6xl">
          <AiEnginePanel
            analysis={mlAnalysis}
            event={nilmEvent}
            appliances={AI_APPLIANCES}
            onToggleAppliance={handleAiToggleAppliance}
            onInjectFault={handleAiInjectFault}
            onClearFault={handleAiClearFault}
            isBrokerConnected={isBrokerConnected}
          />
        </section>
      )}

      {/* ── SECTION 5: Autonomous Agent + Load Forecast — additive, each panel polls its own local HTTP service independently ── */}
      <section id="agent-forecast-section" className="relative z-10 mx-auto max-w-6xl">
        <AgentForecastSection />
      </section>
      </>)}
    </div>
  );
}
