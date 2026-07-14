/**
 * LifeCyclePage
 *
 * Tracks per-component degradation across thousands of flight hours.
 * Identifies the part that will fail first — that part dictates the
 * overall engine life limit.
 *
 * Data is derived from the cumulative flight history in the store.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGTSUStore } from '../store/useGTSUStore';
import type { ComponentWearRecord, ComponentCategory } from '../types/engine';
import { accumulateWear } from '../lib/flightSimulator';

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  'turbine':      'Turbine',
  'compressor':   'Compressor',
  'combustor':    'Combustor',
  'fuel-system':  'Fuel System',
  'control-unit': 'Control Unit',
  'bearing':      'Bearing',
};

const CATEGORY_COLORS: Record<ComponentCategory, string> = {
  'turbine':      '#f97316',
  'compressor':   '#06b6d4',
  'combustor':    '#dc2626',
  'fuel-system':  '#a855f7',
  'control-unit': '#10b981',
  'bearing':      '#f59e0b',
};

export default function LifeCyclePage() {
  const navigate = useNavigate();
  const flights = useGTSUStore(s => s.flights);
  const wear    = useGTSUStore(s => s.wear);

  // Sort components by failure risk (highest first) — the "fail-first" component
  const sortedWear = useMemo(
    () => wear.slice().sort((a, b) => b.failureRisk - a.failureRisk),
    [wear],
  );

  const failFirst = sortedWear[0];

  // Wear progression chart: simulate cumulative wear per component flight-by-flight
  const wearProgression = useMemo(() => {
    if (flights.length === 0 || wear.length === 0) return null;
    const series: Record<string, { x: number; y: number }[]> = {};
    let acc: ComponentWearRecord[] | null = null;
    for (let i = 0; i < flights.length; i++) {
      acc = accumulateWear(acc, [flights[i]]);
      for (const w of acc) {
        if (!series[w.id]) series[w.id] = [];
        series[w.id].push({ x: i + 1, y: w.wearPct });
      }
    }
    return series;
  }, [flights, wear]);

  // Engine life limit = min remaining life across all components
  const engineLifeRemaining = useMemo(() => {
    if (!sortedWear.length) return null;
    return sortedWear.reduce((min, w) => Math.min(min, w.remainingLifeHrs), Infinity);
  }, [sortedWear]);

  // How many more "average" flights before fail-first hits 100 %?
  const flightsUntilFailFirst = useMemo(() => {
    if (!failFirst || flights.length === 0) return null;
    const avgFlightHrs = flights.reduce((a, f) => a + f.durationHrs, 0) / flights.length;
    const wearPerFlight = failFirst.wearPct / flights.length;
    if (wearPerFlight <= 0) return null;
    const remainingPct = 100 - failFirst.wearPct;
    return {
      flights:  Math.ceil(remainingPct / wearPerFlight),
      hrs:      Math.ceil((remainingPct / wearPerFlight) * avgFlightHrs),
    };
  }, [failFirst, flights]);

  // ── Empty state ─────────────────────────────────────────────────────────
  if (flights.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Life Cycle & Reliability" subtitle="Tracks per-component degradation and identifies the engine life limit" />

        <div className="ds-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏱</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cwm-text)', marginBottom: 8 }}>
            No wear data yet
          </h2>
          <p style={{ fontSize: 13, color: 'var(--cwm-text-muted)', maxWidth: 540, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Component wear accumulates as flights are analyzed. Run one or more flight simulations
            from the Post-Flight Analysis page to build the wear history.
          </p>
          <button onClick={() => navigate('/')} style={primaryBtn}>GO TO POST-FLIGHT ANALYSIS →</button>
        </div>
      </div>
    );
  }

  const totalHrs = flights.reduce((a, f) => a + f.durationHrs, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Life Cycle & Reliability"
        subtitle={`Cumulative wear across ${flights.length} flight${flights.length > 1 ? 's' : ''} · ${totalHrs.toFixed(0)} hrs total operation`}
      />

      {/* ── Engine life summary ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="ds-panel" style={{ padding: 20, gridColumn: 'span 2 / span 2' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--cwm-danger-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--cwm-danger)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 24 }}>⚠</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em' }}>LIFE-LIMITING COMPONENT</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cwm-text)', marginTop: 4 }}>{failFirst?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cwm-text-muted)', marginTop: 2 }}>
                Primary stressor: {failFirst?.primaryStressor}
              </div>
              <div style={{ marginTop: 14 }}>
                <WearBar pct={failFirst?.wearPct ?? 0} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6, color: 'var(--cwm-text-muted)' }}>
                  <span>{failFirst?.wearPct.toFixed(1)}% consumed</span>
                  <span style={{ fontWeight: 700, color: 'var(--cwm-text)' }}>{failFirst?.remainingLifeHrs.toLocaleString()} hrs remaining</span>
                </div>
              </div>
            </div>
          </div>

          {flightsUntilFailFirst && (
            <div style={{ marginTop: 18, padding: 12, background: 'var(--cwm-accent-bg)', border: '1px solid var(--cwm-accent-border)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--cwm-accent)', fontWeight: 700, letterSpacing: '0.04em' }}>FORECAST</div>
              <div style={{ fontSize: 13, color: 'var(--cwm-text)', marginTop: 4, lineHeight: 1.55 }}>
                At the current usage rate, <b>{failFirst.name}</b> will reach its life limit in approximately{' '}
                <b style={{ color: 'var(--cwm-accent)' }}>{flightsUntilFailFirst.flights} more flights</b>{' '}
                (~{flightsUntilFailFirst.hrs.toLocaleString()} flight hours).
                The engine's overall life limit is dictated by this component.
              </div>
            </div>
          )}
        </div>

        <div className="ds-panel" style={{ padding: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em' }}>ENGINE LIFE LIMIT</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--cwm-text)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {engineLifeRemaining !== null && engineLifeRemaining !== Infinity
              ? engineLifeRemaining.toLocaleString()
              : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cwm-text-muted)', marginTop: 2 }}>flight hours remaining</div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cwm-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cwm-text-muted)' }}>
              <span>Flights analyzed</span>
              <span style={{ color: 'var(--cwm-text)', fontWeight: 700 }}>{flights.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cwm-text-muted)', marginTop: 6 }}>
              <span>Operating hours</span>
              <span style={{ color: 'var(--cwm-text)', fontWeight: 700 }}>{totalHrs.toFixed(0)} hr</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cwm-text-muted)', marginTop: 6 }}>
              <span>Start cycles</span>
              <span style={{ color: 'var(--cwm-text)', fontWeight: 700 }}>{flights.reduce((a, f) => a + f.cycles.length, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Total life & service periods ──────────────────────── */}
      <TotalLifePanel components={sortedWear} lifeLimiting={failFirst} />

      {/* ── Component wear table ──────────────────────────────── */}
      <div className="ds-panel" style={{ padding: 18 }}>
        <SectionHead title="Component Wear Inventory" subtitle="Ranked by failure risk · fail-first at top" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedWear.map((w, i) => (
            <ComponentRow key={w.id} record={w} rank={i + 1} isFirst={i === 0} />
          ))}
        </div>
      </div>

      {/* ── Wear progression chart ────────────────────────────── */}
      {flights.length > 1 && wearProgression && (
        <div className="ds-panel" style={{ padding: 18 }}>
          <SectionHead title="Wear Progression" subtitle="Cumulative wear per component over flight history" />
          <div style={{ height: 260, position: 'relative' }}>
            <WearMultiLine series={wearProgression} wear={wear} />
          </div>
        </div>
      )}

      {/* ── Reliability summary by category ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Object.entries(groupByCategory(sortedWear)).map(([cat, recs]) => (
          <div key={cat} className="ds-panel" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: CATEGORY_COLORS[cat as ComponentCategory] }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text)', letterSpacing: '0.05em' }}>
                {CATEGORY_LABELS[cat as ComponentCategory]}
              </span>
            </div>
            {recs.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 11 }}>
                <span style={{ color: 'var(--cwm-text-muted)' }}>{r.name}</span>
                <span style={{ color: 'var(--cwm-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {r.wearPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="ds-panel px-5 py-4">
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cwm-text)', letterSpacing: '-0.01em' }}>{title}</h2>
      <p style={{ fontSize: 12, color: 'var(--cwm-text-muted)', marginTop: 4 }}>{subtitle}</p>
    </div>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2, letterSpacing: '0.02em' }}>{subtitle}</div>}
    </div>
  );
}

function WearBar({ pct }: { pct: number }) {
  const color =
    pct > 80 ? 'var(--cwm-danger)' :
    pct > 60 ? '#f97316' :
    pct > 40 ? 'var(--cwm-warning)' :
               'var(--cwm-success)';
  return (
    <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, transition: 'width 0.3s ease' }} />
    </div>
  );
}

function ComponentRow({ record, rank, isFirst }: { record: ComponentWearRecord; rank: number; isFirst: boolean }) {
  const riskColor = record.failureRisk > 70 ? 'var(--cwm-danger)' : record.failureRisk > 35 ? 'var(--cwm-warning)' : 'var(--cwm-success)';
  return (
    <div style={{
      padding: 12, borderRadius: 6,
      background: isFirst ? 'var(--cwm-danger-bg)' : 'rgba(255,255,255,0.02)',
      border: isFirst ? '1px solid var(--cwm-danger-border)' : '1px solid var(--cwm-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          minWidth: 28, height: 28, borderRadius: 14,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: isFirst ? 'var(--cwm-danger)' : 'var(--cwm-text-muted)',
        }}>{rank}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>{record.name}</span>
            <span style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3, color: 'var(--cwm-text-faint)', letterSpacing: '0.05em' }}>
              {CATEGORY_LABELS[record.category].toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2 }}>{record.primaryStressor}</div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', letterSpacing: '0.04em' }}>FAILURE RISK</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: riskColor, fontVariantNumeric: 'tabular-nums' }}>{record.failureRisk.toFixed(1)}%</div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <WearBar pct={record.wearPct} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 4, color: 'var(--cwm-text-faint)' }}>
          <span>{record.wearPct.toFixed(1)}% consumed · {record.consumedHrs.toFixed(0)} hrs accrued</span>
          <span>{record.remainingLifeHrs.toLocaleString()} hrs remaining</span>
        </div>
      </div>
    </div>
  );
}

function WearMultiLine({ series, wear }: { series: Record<string, { x: number; y: number }[]>; wear: ComponentWearRecord[] }) {
  // Render all components on one chart using SVG (avoid Canvas state per-chart)
  const allPoints = Object.values(series).flat();
  if (!allPoints.length) return null;
  const maxX = Math.max(...allPoints.map(p => p.x));
  const maxY = Math.min(100, Math.max(...allPoints.map(p => p.y), 10));
  const minY = 0;
  const w = 100, h = 100;
  const pad = { left: 10, right: 5, top: 5, bottom: 12 };
  const sx = (x: number) => pad.left + ((x - 1) / Math.max(1, maxX - 1)) * (w - pad.left - pad.right);
  const sy = (y: number) => pad.top + (1 - (y - minY) / Math.max(0.01, maxY - minY)) * (h - pad.top - pad.bottom);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i}
          x1={pad.left} y1={pad.top + p * (h - pad.top - pad.bottom)}
          x2={w - pad.right} y2={pad.top + p * (h - pad.top - pad.bottom)}
          stroke="rgba(255,255,255,0.06)" strokeWidth="0.2"
        />
      ))}
      {Object.entries(series).map(([id, pts]) => {
        const color = CATEGORY_COLORS[wear.find(w => w.id === id)?.category ?? 'turbine'];
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ');
        return <path key={id} d={d} stroke={color} strokeWidth="0.5" fill="none" />;
      })}
      <g fontSize="3" fill="rgba(255,255,255,0.5)">
        <text x={pad.left} y={h - 2}>flight 1</text>
        <text x={w - pad.right - 10} y={h - 2}>flight {maxX}</text>
        <text x={1} y={pad.top + 2}>{maxY.toFixed(0)}%</text>
        <text x={1} y={h - pad.bottom - 1}>0%</text>
      </g>

      {/* Legend */}
      <g>
        {wear.slice(0, 6).map((w, i) => (
          <g key={w.id} transform={`translate(${w === wear[0] ? pad.left : pad.left + i * 16}, ${pad.top + 2})`}>
            <rect width="3" height="0.8" fill={CATEGORY_COLORS[w.category]} y="1.2" />
            <text x="4" y="2.5" fontSize="2.4" fill="rgba(255,255,255,0.7)">{w.name.length > 14 ? w.name.slice(0, 12) + '…' : w.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ── Total engine life split into overall service periods ────────────────────

const SERVICE_PERIODS = [
  { label: 'Run-in',      color: '#16a34a' },
  { label: 'Mid-life',    color: '#84cc16' },
  { label: 'Hot-section', color: '#f59e0b' },
  { label: 'Overhaul',    color: '#dc2626' },
];

/** Segmented "out of total" life bar — total design life divided into the four
 *  overall service periods, with a playhead at the consumed fraction. */
function LifeSegmentBar({ consumedFrac, height = 30 }: { consumedFrac: number; height?: number }) {
  const n = SERVICE_PERIODS.length;
  const fillPct = Math.min(100, Math.max(0, consumedFrac * 100));
  return (
    <div style={{ position: 'relative', height, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cwm-border)', display: 'flex' }}>
      {SERVICE_PERIODS.map((p, i) => (
        <div key={i} style={{ flex: 1, background: p.color, opacity: 0.16, borderRight: i < n - 1 ? '1px solid rgba(255,255,255,0.18)' : 'none' }} />
      ))}
      {/* consumed overlay */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`,
        background: 'linear-gradient(90deg, rgba(22,163,74,0.55), rgba(245,158,11,0.55) 70%, rgba(220,38,38,0.55))',
        transition: 'width 0.3s ease' }} />
      {/* period labels */}
      {SERVICE_PERIODS.map((p, i) => (
        <span key={`l${i}`} style={{ position: 'absolute', left: `calc(${(i / n) * 100}% + 6px)`, top: '50%', transform: 'translateY(-50%)',
          fontSize: 8.5, fontWeight: 700, letterSpacing: '0.03em', color: 'var(--cwm-text)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{p.label}</span>
      ))}
      {/* playhead */}
      <div style={{ position: 'absolute', left: `${fillPct}%`, top: 0, bottom: 0, width: 2, background: 'var(--cwm-text)', boxShadow: '0 0 6px rgba(0,0,0,0.6)' }} />
    </div>
  );
}

function TotalLifePanel({ components, lifeLimiting }: { components: ComponentWearRecord[]; lifeLimiting?: ComponentWearRecord }) {
  if (!lifeLimiting) return null;
  const totalLifeHrs = lifeLimiting.designLifeHrs;
  const consumedFrac = lifeLimiting.wearPct / 100;
  const consumedHrs  = Math.round(consumedFrac * totalLifeHrs);
  const remainingHrs = lifeLimiting.remainingLifeHrs;
  const period = Math.min(SERVICE_PERIODS.length - 1, Math.floor(consumedFrac * SERVICE_PERIODS.length));

  return (
    <div className="ds-panel" style={{ padding: 18 }}>
      <SectionHead title="Total Engine Life — service periods" subtitle="Total design life split into overall periods · playhead marks life consumed so far" />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums' }}>{consumedHrs.toLocaleString()}</span>
        <span style={{ fontSize: 13, color: 'var(--cwm-text-muted)' }}>hrs consumed <b style={{ color: 'var(--cwm-text-faint)' }}>out of</b> {totalLifeHrs.toLocaleString()} hrs total design life</span>
        <span className="status-chip status-chip-accent" style={{ marginLeft: 'auto' }}>Current period · {SERVICE_PERIODS[period].label}</span>
      </div>

      <LifeSegmentBar consumedFrac={consumedFrac} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 6 }}>
        <span>0 hrs · new</span>
        <span style={{ color: remainingHrs < totalLifeHrs * 0.2 ? 'var(--cwm-danger)' : 'var(--cwm-text-muted)', fontWeight: 700 }}>{remainingHrs.toLocaleString()} hrs remaining</span>
        <span>{totalLifeHrs.toLocaleString()} hrs · life limit</span>
      </div>

      {/* Per-component "out of total" segmented life */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Per-component life consumed (out of design life)</div>
        {components.map(c => {
          const frac = c.wearPct / 100;
          const cons = Math.round(frac * c.designLifeHrs);
          const col = c.wearPct > 80 ? 'var(--cwm-danger)' : c.wearPct > 60 ? '#f97316' : c.wearPct > 40 ? 'var(--cwm-warning)' : 'var(--cwm-success)';
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--cwm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, c.wearPct)}%`, height: '100%', background: col, transition: 'width 0.3s ease' }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {cons.toLocaleString()} / {c.designLifeHrs.toLocaleString()} hrs
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByCategory(records: ComponentWearRecord[]): Record<string, ComponentWearRecord[]> {
  return records.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, ComponentWearRecord[]>);
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
  background: 'var(--cwm-accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
};
