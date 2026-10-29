import React, { useEffect, useRef, useState } from 'react';
import { IndianRupee, Sun } from 'lucide-react';

// ── Rupee Insights ────────────────────────────────────────────────────────────
// PURE DISPLAY MATH on power readings we already have (the `history` array
// built by App.js's chart-snapshot effect). This file never touches MQTT,
// backend.py, virtual_house.py, or any trip/alert state — it only reads
// wattage numbers that already exist for the charts. If something here
// breaks, the ErrorBoundary at the bottom swallows it so the rest of the
// dashboard keeps working.
//
// To hide this panel for a demo, flip this one flag:
const SHOW_RUPEE_INSIGHTS = true;

const RATE_PER_UNIT = 5.90; // Rs per kWh - EDIT to match actual bill
const FIXED_CHARGE  = 65;   // Rs per month, flat rate structure

const COST_LOADS = ['fan', 'ac', 'washer']; // non-solar loads only
const LOAD_LABEL = { fan: 'Fan', ac: 'AC', washer: 'Washer' };
const LOAD_COLOR = { fan: '#38bdf8', ac: '#818cf8', washer: '#f472b6' };

const rupee = (n) => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Energy accumulator ─────────────────────────────────────────────────────
// Integrates Wh per load from the `history` snapshots (already sampled every
// ~2s by App.js). Uses a ref so old samples being trimmed off `history`
// (HISTORY_MAX cap, for chart purposes) never erases the running total —
// this keeps accumulating for the whole session regardless of chart window.
function useEnergyAccumulator(history) {
  const kwhRef      = useRef({ fan: 0, ac: 0, washer: 0 });
  const solarWhRef  = useRef(0);
  const lastTRef    = useRef(null);
  const [, bump]    = useState(0);

  useEffect(() => {
    if (!history || history.length === 0) return;
    const last = history[history.length - 1];
    if (typeof last.t !== 'number') return;

    if (lastTRef.current === null) {
      lastTRef.current = last.t;       // first sample just sets the baseline
      return;
    }
    if (last.t === lastTRef.current) return;   // no new sample yet

    const dtHours = (last.t - lastTRef.current) / 1000 / 3600;
    lastTRef.current = last.t;

    // Guard against huge gaps (tab backgrounded/suspended) skewing totals.
    if (dtHours <= 0 || dtHours > 1) return;

    COST_LOADS.forEach((l) => {
      const watts = last[l];
      if (typeof watts === 'number') {
        kwhRef.current[l] += (watts * dtHours) / 1000;
      }
    });
    if (typeof last.solar === 'number' && last.solar > 0) {
      solarWhRef.current += last.solar * dtHours;   // Wh; /1000 at display time
    }

    bump((n) => n + 1);   // trigger a re-render to reflect the new totals
  }, [history]);

  return { kwhByLoad: kwhRef.current, solarWh: solarWhRef.current };
}

// ── Presentational bits ─────────────────────────────────────────────────────
function CostBar({ name, cost, share }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wider text-white/45">
        {LOAD_LABEL[name]}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(share, 2)}%`, background: LOAD_COLOR[name] }}
        />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] font-bold text-white/75">
        {rupee(cost)}
      </span>
    </div>
  );
}

function RupeeInsightsPanel({ history }) {
  const { kwhByLoad, solarWh } = useEnergyAccumulator(history);

  const costs = COST_LOADS.reduce((acc, l) => {
    acc[l] = (kwhByLoad[l] || 0) * RATE_PER_UNIT;
    return acc;
  }, {});
  const totalCost = COST_LOADS.reduce((sum, l) => sum + costs[l], 0);
  const maxCost = Math.max(...COST_LOADS.map((l) => costs[l]), 0.0001);

  const hasData = !!(history && history.length);
  const avgTotalWatts = hasData
    ? history.reduce((sum, row) => sum + COST_LOADS.reduce((s, l) => s + (row[l] || 0), 0), 0) / history.length
    : 0;
  const projectedMonthly = (avgTotalWatts * 24 * 30) / 1000 * RATE_PER_UNIT + FIXED_CHARGE;

  const solarOffset = (solarWh / 1000) * RATE_PER_UNIT;
  const solarGeneratingNow = hasData && (history[history.length - 1].solar || 0) > 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/18 bg-black/78 p-5 backdrop-blur-xl"
      style={{ boxShadow: '0 0 40px rgba(234,179,8,0.06), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.35), transparent)' }} />

      <div className="mb-4 flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-yellow-400" strokeWidth={2} />
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.42em] text-amber-500/70">
          Rupee Insights
        </h2>
      </div>

      {!hasData && (
        <p className="py-4 text-center font-mono text-[11px] text-white/25">
          Waiting for telemetry to start tracking cost…
        </p>
      )}

      {hasData && (<>
        <div className="mb-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-white/30">
            Total cost · since dashboard started
          </p>
          <p className="font-mono text-3xl font-black tabular-nums text-yellow-400"
            style={{ filter: 'drop-shadow(0 0 14px rgba(250,204,21,0.5))' }}>
            {rupee(totalCost)}
          </p>
        </div>

        <div className="mb-5 space-y-2.5">
          {COST_LOADS.map((l) => (
            <CostBar key={l} name={l} cost={costs[l]} share={(costs[l] / maxCost) * 100} />
          ))}
        </div>

        <div className="mb-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/30">
            Projected if this usage pattern continued
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white/80">
            ~{rupee(projectedMonthly)} <span className="text-[10px] font-normal text-white/30">/ month</span>
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-white/22">
            Rough estimate from current average load — not a bill.
          </p>
        </div>

        {solarGeneratingNow && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5">
            <Sun className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <p className="font-mono text-[11px] text-emerald-300">
              Solar offset today: <span className="font-bold">{rupee(solarOffset)}</span>
            </p>
          </div>
        )}
      </>)}
    </div>
  );
}

// ── Fault isolation ──────────────────────────────────────────────────────────
// A bug in this panel must never take down the live telemetry dashboard.
class RupeeInsightsBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('Rupee Insights panel crashed (isolated — rest of dashboard unaffected):', error, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function RupeeInsightsSection({ history }) {
  if (!SHOW_RUPEE_INSIGHTS) return null;
  return (
    <RupeeInsightsBoundary>
      <RupeeInsightsPanel history={history} />
    </RupeeInsightsBoundary>
  );
}
