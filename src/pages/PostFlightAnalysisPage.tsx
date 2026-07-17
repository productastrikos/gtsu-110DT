/**
 * PostFlightAnalysisPage
 *
 * Landing page. Empty until the engineer runs a flight simulation.
 * Simulates 50-100 flight hours of GTSU-110 operation, then breaks down
 * every 40s start cycle: which failed, why, and how to improve.
 *
 * This is the source of data for all other pages.
 */

import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGTSUStore } from '../store/useGTSUStore';
import { FAULT_LABELS, accumulateWear } from '../lib/flightSimulator';
import { buildPostFlightHotspots } from '../lib/engineHotspots';
import type { StartCycle, CycleStatus, FaultReason, FlightRecord, BackendFlight, ComponentWearRecord } from '../types/engine';
import { LineChart } from '../components/LineChart';
import { EngineModel3D } from '../components/EngineModel3D';
import {
  deriveN2, deriveSectionRatios, comparePressureRatio, NOMINAL_P2P1, MAX_NPT_RPM,
} from '../lib/engineDerived';

const STATUS_COLORS: Record<CycleStatus, string> = {
  success:  'var(--cwm-success)',
  degraded: 'var(--cwm-warning)',
  faulty:   '#f97316',
  aborted:  'var(--cwm-danger)',
};

const STATUS_LABELS: Record<CycleStatus, string> = {
  success:  'SUCCESS',
  degraded: 'DEGRADED',
  faulty:   'FAULTY',
  aborted:  'ABORTED',
};

export default function PostFlightAnalysisPage() {
  const navigate = useNavigate();
  const flights              = useGTSUStore(s => s.flights);
  const wear                 = useGTSUStore(s => s.wear);
  const isRunning            = useGTSUStore(s => s.isFlightSimRunning);
  const progress             = useGTSUStore(s => s.flightSimProgress);
  const runFlightSim         = useGTSUStore(s => s.runFlightSimulation);
  const selectCycle          = useGTSUStore(s => s.selectCycle);
  const clearAll             = useGTSUStore(s => s.clearAll);

  // Backend flight library
  const backendFlights       = useGTSUStore(s => s.backendFlights);
  const backendStatus        = useGTSUStore(s => s.backendFlightsStatus);
  const loadingFlightId      = useGTSUStore(s => s.loadingFlightId);
  const fetchBackendFlights  = useGTSUStore(s => s.fetchBackendFlights);
  const loadBackendFlight    = useGTSUStore(s => s.loadBackendFlight);

  const [durationHrs, setDurationHrs] = useState(75);
  const [statusFilter, setStatusFilter] = useState<CycleStatus | 'all'>('all');
  const [libraryOpen, setLibraryOpen] = useState(true);

  // Fetch flight library on mount
  useEffect(() => {
    if (backendStatus === 'idle') fetchBackendFlights();
  }, [backendStatus, fetchBackendFlights]);

  const latestFlight = flights[flights.length - 1] ?? null;

  const filteredCycles = useMemo(
    () => latestFlight
      ? (statusFilter === 'all' ? latestFlight.cycles : latestFlight.cycles.filter(c => c.status === statusFilter))
      : [],
    [latestFlight, statusFilter],
  );

  const faultBreakdown = useMemo(() => {
    if (!latestFlight) return [];
    const counts: Record<string, number> = {};
    for (const c of latestFlight.cycles) {
      if (c.faultReason) counts[c.faultReason] = (counts[c.faultReason] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([reason, count]) => ({ reason: reason as FaultReason, count }))
      .sort((a, b) => b.count - a.count);
  }, [latestFlight]);

  const efficiencyOverTime = useMemo(() => {
    if (!latestFlight) return [];
    return latestFlight.cycles.map(c => ({ x: c.cycleNumber, y: c.efficiency }));
  }, [latestFlight]);

  const peakTgtOverTime = useMemo(
    () => latestFlight ? latestFlight.cycles.map(c => ({ x: c.cycleNumber, y: c.peakJpt1 })) : [],
    [latestFlight],
  );
  const n1MaxOverTime = useMemo(
    () => latestFlight ? latestFlight.cycles.map(c => ({ x: c.cycleNumber, y: c.maxNggPct })) : [],
    [latestFlight],
  );
  const fuelOverTime = useMemo(
    () => latestFlight ? latestFlight.cycles.map(c => ({ x: c.cycleNumber, y: c.fuelUsedKg })) : [],
    [latestFlight],
  );

  // Wear AS-OF the previous flight (used to compute per-component delta)
  const previousWear = useMemo(() => {
    if (flights.length < 2) return null;
    return accumulateWear(null, flights.slice(0, -1));
  }, [flights]);

  const hotspots = useMemo(
    () => buildPostFlightHotspots(wear, latestFlight, previousWear),
    [wear, latestFlight, previousWear],
  );

  // Worst-case frame approximation for thermal tint: use the latest flight's
  // most stressful cycle (highest peak TGT). Falls back to a neutral state.
  const headlineFrame = useMemo(() => {
    if (!latestFlight) return null;
    const worst = latestFlight.cycles
      .slice()
      .sort((a, b) => b.peakJpt1 - a.peakJpt1)[0];
    return worst?.trace[Math.floor(worst.trace.length * 0.7)] ?? null;
  }, [latestFlight]);

  const onRun = async () => {
    await runFlightSim(durationHrs);
  };

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!latestFlight && !isRunning) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Post-Flight Analysis"
          subtitle="Lab-mode digital twin · ingest landed-aircraft GTSU-110 data and analyze every 40 s start cycle"
        />

        {/* ── Flight Library ──────────────────────────────────────── */}
        <div className="ds-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', cursor: 'pointer', gap: 12,
              borderBottom: libraryOpen ? '1px solid var(--cwm-border)' : 'none',
            }}
            onClick={() => setLibraryOpen(o => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>📁 Flight Library</span>
              <DbStatusBadge status={backendStatus} count={backendFlights.length} />
            </div>
            <span style={{ color: 'var(--cwm-text-muted)', fontSize: 12 }}>{libraryOpen ? '▲' : '▼'}</span>
          </div>

          {libraryOpen && (
            <div style={{ padding: 16 }}>
              {backendStatus === 'loading' && (
                <p style={{ color: 'var(--cwm-text-muted)', fontSize: 12, margin: 0 }}>Loading flights from database…</p>
              )}
              {backendStatus === 'error' && (
                <div style={{ color: 'var(--cwm-danger)', fontSize: 12 }}>
                  <b>Database offline.</b> Start the backend: <code style={{ fontSize: 11 }}>cd backend &amp;&amp; uvicorn main:app --reload --port 8000</code>
                  <button
                    onClick={(e) => { e.stopPropagation(); fetchBackendFlights(); }}
                    style={{ marginLeft: 10, padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                      background: 'transparent', border: '1px solid var(--cwm-border)',
                      borderRadius: 4, color: 'var(--cwm-accent)' }}
                  >RETRY</button>
                </div>
              )}
              {backendStatus === 'loaded' && backendFlights.length === 0 && (
                <p style={{ color: 'var(--cwm-text-muted)', fontSize: 12, margin: 0 }}>
                  No flights in database. Run: <code>python generate_flight_csv.py</code>
                </p>
              )}
              {backendStatus === 'loaded' && backendFlights.length > 0 && (
                <FlightLibraryGrid
                  flights={backendFlights}
                  loadingId={loadingFlightId}
                  onAnalyse={async (id) => {
                    await loadBackendFlight(id);
                    navigate('/simulator');
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Manual simulation ───────────────────────────────────── */}
        <div className="ds-panel" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)', marginBottom: 4 }}>⚙ Manual Simulation</div>
          <p style={{ fontSize: 12, color: 'var(--cwm-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Generate a synthetic flight with built-in fault injection, wear drift, and Gaussian telemetry noise.
            Uses the in-browser GTSU-110 simulator — no backend required.
          </p>
          <FlightControl
            durationHrs={durationHrs}
            onDurationChange={setDurationHrs}
            onRun={onRun}
            isRunning={isRunning}
            progress={progress}
            primary
          />
        </div>
      </div>
    );
  }

  // ── Running state ──────────────────────────────────────────────────────
  if (isRunning) {
    return (
      <div className="space-y-5">
        <PageHeader title="Post-Flight Analysis" subtitle="Ingesting GTSU recorder · decoding cycles" />
        <div className="ds-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cwm-accent)', marginBottom: 16 }}>
            SIMULATING FLIGHT · {durationHrs} HRS
          </div>
          <ProgressBar value={progress} />
          <p style={{ fontSize: 12, color: 'var(--cwm-text-faint)', marginTop: 12 }}>
            Generating start cycles, fault traces, and component wear...
          </p>
        </div>
      </div>
    );
  }

  // ── Results state ──────────────────────────────────────────────────────
  const flight = latestFlight!;
  const cumStats = computeCumulative(flights);
  const failFirst = wear.slice().sort((a, b) => b.failureRisk - a.failureRisk)[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Post-Flight Analysis"
        subtitle={`Flight ${flights.length} · ${flight.durationHrs} hrs · ${flight.cycles.length} start cycles · ${flight.startTime.toLocaleString('en-GB')}`}
      />

      <div className="ds-panel" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <FlightControl
          durationHrs={durationHrs}
          onDurationChange={setDurationHrs}
          onRun={onRun}
          isRunning={isRunning}
          progress={progress}
        />
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { clearAll(); }}
          style={{
            padding: '7px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
            color: 'var(--cwm-danger)', background: 'var(--cwm-danger-bg)',
            border: '1px solid var(--cwm-danger-border)', borderRadius: 6, cursor: 'pointer',
          }}
        >
          CLEAR ALL DATA
        </button>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPI label="Total Cycles" value={flight.cycles.length.toString()} />
        <KPI label="Success Rate" value={`${pct(flight.successCount / flight.cycles.length)}%`} tone={flight.successCount / flight.cycles.length > 0.85 ? 'good' : 'warn'} />
        <KPI label="Faulty / Aborted" value={(flight.faultyCount + flight.abortCount).toString()} tone={flight.abortCount > 0 ? 'bad' : 'warn'} />
        <KPI label="Avg Cycle" value={`${flight.avgCycleSec.toFixed(1)}s`} subtitle="nominal 40 s" />
        <KPI label="Fuel Used" value={`${flight.totalFuelKg.toFixed(1)} kg`} />
        <KPI label="Avg Efficiency" value={`${flight.avgEfficiency.toFixed(0)}%`} tone={flight.avgEfficiency > 80 ? 'good' : flight.avgEfficiency > 65 ? 'warn' : 'bad'} />
      </div>

      {/* ── Pre-Flight Readiness quick-look ───────────────────── */}
      <PreFlightReadiness wear={wear} latestFlight={flight} onSeeLifeCycle={() => navigate('/life-cycle')} />

      {/* ── Peak-Cycle Engineering Parameters ─────────────────── */}
      <PeakTelemetryPanel flight={flight} />

      {/* ── 3D twin: component status from accumulated wear ────── */}
      <div className="ds-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 6px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>GTSU-110 Engine — Component Status</div>
            <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2, letterSpacing: '0.02em' }}>
              Free-turbine turboshaft · labelled by section · wear per component (cumulative) · delta vs previous flight
            </div>
          </div>
        </div>
        <div style={{ height: 380, position: 'relative' }}>
          <EngineModel3D frame={headlineFrame} hotspots={hotspots} />
        </div>
      </div>

      {/* ── Top row: efficiency trend + fault breakdown ────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="ds-panel xl:col-span-2" style={{ padding: 16 }}>
          <SectionHead title="Efficiency Across Cycles" subtitle={`Cycle-by-cycle composite efficiency · improvement potential ${flight.improvementPotPct} %`} />
          <div style={{ height: 240 }}>
            <LineChart data={efficiencyOverTime} color="var(--cwm-accent)" yAxisLabel="Efficiency %" xAxisLabel="Cycle #" height={220} />
          </div>
        </div>

        <div className="ds-panel" style={{ padding: 16 }}>
          <SectionHead title="Fault Reasons" subtitle="Breakdown of failed and degraded cycles" />
          <FaultBreakdown items={faultBreakdown} />
        </div>
      </div>

      {/* ── Cycle trend graphs ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="ds-panel" style={{ padding: 16 }}>
          <SectionHead title="Peak TGT per Cycle" subtitle="Turbine gas temp · limit 900°C ground" compact />
          <div style={{ height: 200, marginTop: 8 }}>
            <LineChart data={peakTgtOverTime} color="#f97316" yAxisLabel="TGT °C" xAxisLabel="Cycle #" height={190} />
          </div>
        </div>
        <div className="ds-panel" style={{ padding: 16 }}>
          <SectionHead title="Max N1 per Cycle" subtitle="Gas-generator spool speed %" compact />
          <div style={{ height: 200, marginTop: 8 }}>
            <LineChart data={n1MaxOverTime} color="#5b8de0" yAxisLabel="N1 %" xAxisLabel="Cycle #" height={190} />
          </div>
        </div>
        <div className="ds-panel" style={{ padding: 16 }}>
          <SectionHead title="Fuel per Cycle" subtitle="Fuel consumed per start (kg)" compact />
          <div style={{ height: 200, marginTop: 8 }}>
            <LineChart data={fuelOverTime} color="#38bdf8" yAxisLabel="kg" xAxisLabel="Cycle #" height={190} />
          </div>
        </div>
      </div>

      {/* ── Cycle table ────────────────────────────────────────── */}
      <div className="ds-panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <SectionHead title="Start Cycle Log" subtitle={`${filteredCycles.length} cycles · click to replay in 3D Process Simulator`} compact />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'success', 'degraded', 'faulty', 'aborted'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '5px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                  background: statusFilter === s ? 'var(--cwm-accent-bg)' : 'transparent',
                  color: statusFilter === s ? 'var(--cwm-accent)' : 'var(--cwm-text-muted)',
                  border: `1px solid ${statusFilter === s ? 'var(--cwm-accent-border)' : 'var(--cwm-border)'}`,
                  borderRadius: 5, cursor: 'pointer', textTransform: 'uppercase',
                }}
              >{s}</button>
            ))}
          </div>
        </div>

        <CycleTable
          cycles={filteredCycles}
          onReplay={(id) => {
            selectCycle(id);
            navigate('/simulator');
          }}
        />
      </div>

      {/* ── Flight Records / Event Log ─────────────────────────── */}
      <FlightRecordsPanel flights={flights} />

      {/* ── Cumulative context + life cycle hint ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="ds-panel" style={{ padding: 16 }}>
          <SectionHead title="Cumulative Lab Operation" subtitle={`${flights.length} flight${flights.length > 1 ? 's' : ''} analyzed`} />
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Stat label="Total flight hrs"     value={`${cumStats.totalHrs.toFixed(1)} hr`} />
            <Stat label="Total cycles"          value={cumStats.totalCycles.toString()} />
            <Stat label="Aborted cycles"        value={cumStats.totalAborts.toString()} tone="bad" />
            <Stat label="Avg fleet efficiency"  value={`${cumStats.avgEff.toFixed(1)}%`} />
          </dl>
        </div>

        <div className="ds-panel" style={{ padding: 16 }}>
          <SectionHead title="Life-Limiting Component" subtitle="Drives the overall engine life limit" />
          {failFirst ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)', marginBottom: 4 }}>{failFirst.name}</div>
              <div style={{ fontSize: 11, color: 'var(--cwm-text-muted)', marginBottom: 12 }}>
                {failFirst.primaryStressor} · {failFirst.remainingLifeHrs} hrs remaining
              </div>
              <ProgressBar value={failFirst.wearPct / 100} tone={failFirst.wearPct > 70 ? 'bad' : failFirst.wearPct > 40 ? 'warn' : 'good'} label={`${failFirst.wearPct.toFixed(0)}% wear`} />
              <button
                onClick={() => navigate('/life-cycle')}
                style={{
                  marginTop: 12, padding: '6px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                  background: 'var(--cwm-accent-bg)', color: 'var(--cwm-accent)',
                  border: '1px solid var(--cwm-accent-border)', borderRadius: 5, cursor: 'pointer',
                }}
              >SEE FULL LIFE-CYCLE BREAKDOWN →</button>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--cwm-text-faint)' }}>No wear data yet.</p>
          )}
        </div>
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

function FlightControl({
  durationHrs, onDurationChange, onRun, isRunning, progress, primary,
}: {
  durationHrs: number;
  onDurationChange: (h: number) => void;
  onRun: () => void;
  isRunning: boolean;
  progress: number;
  primary?: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cwm-text-muted)', letterSpacing: '0.05em' }}>FLIGHT DURATION</span>
        <input
          type="range"
          min={50}
          max={100}
          step={5}
          value={durationHrs}
          onChange={e => onDurationChange(Number(e.target.value))}
          disabled={isRunning}
          style={{ width: 180 }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-accent)', minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>
          {durationHrs} hrs
        </span>
      </label>
      <button
        onClick={onRun}
        disabled={isRunning}
        style={{
          padding: primary ? '12px 28px' : '8px 18px',
          fontSize: primary ? 13 : 11, fontWeight: 700, letterSpacing: '0.06em',
          background: 'var(--cwm-btn)', color: 'var(--cwm-btn-text, #fff)',
          border: 'none', borderRadius: 6, cursor: isRunning ? 'wait' : 'pointer',
          opacity: isRunning ? 0.6 : 1,
        }}
      >
        {isRunning ? `RUNNING ${(progress * 100).toFixed(0)}%` : '▶ RUN FLIGHT SIMULATION'}
      </button>
    </div>
  );
}

function ProgressBar({ value, tone = 'good', label }: { value: number; tone?: 'good' | 'warn' | 'bad'; label?: string }) {
  const color = tone === 'bad' ? 'var(--cwm-danger)' : tone === 'warn' ? 'var(--cwm-warning)' : 'var(--cwm-accent)';
  return (
    <div>
      <div style={{ height: 6, background: 'var(--cwm-surface-soft, rgba(255,255,255,0.05))', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value * 100)}%`, height: '100%', background: color, transition: 'width 0.2s ease' }} />
      </div>
      {label && (
        <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 4, letterSpacing: '0.04em' }}>{label}</div>
      )}
    </div>
  );
}

function KPI({ label, value, subtitle, tone }: { label: string; value: string; subtitle?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--cwm-danger)' : tone === 'warn' ? 'var(--cwm-warning)' : tone === 'good' ? 'var(--cwm-success)' : 'var(--cwm-text)';
  return (
    <div className="ds-panel" style={{ padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {subtitle && <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function SectionHead({ title, subtitle, compact }: { title: string; subtitle?: string; compact?: boolean }) {
  return (
    <div style={{ marginBottom: compact ? 0 : 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2, letterSpacing: '0.02em' }}>{subtitle}</div>}
    </div>
  );
}

// ── Engineering parameter panel (all 6 mandatory metrics) ──────────────────

function PeakTelemetryPanel({ flight }: { flight: FlightRecord }) {
  const worst = flight.cycles.slice().sort((a, b) => b.peakJpt1 - a.peakJpt1)[0];
  const frame  = worst?.trace[Math.floor(worst.trace.length * 0.7)];
  if (!frame) return null;

  const milHex = `0x${(frame.milBusWord ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
  const n1Rpm = Math.round(worst.maxNggPct / 100 * 22000);
  const n2 = deriveN2(frame);
  const ratios = deriveSectionRatios(frame);
  const pressure = comparePressureRatio(frame);

  const jptStatus = worst.peakJpt1 > 900 ? 'bad' : worst.peakJpt1 > 870 ? 'warn' : 'good';
  const p2Status  = worst.minP2p1 < 3.5 || worst.minP2p1 > 4.1 ? 'bad'
                  : worst.minP2p1 < 3.65 || worst.minP2p1 > 4.0 ? 'warn' : 'good';
  const nggStatus = worst.maxNggPct > 95 ? 'bad' : worst.maxNggPct > 90 ? 'warn' : 'good';
  const n2Status: 'good' | 'warn' | 'bad' = n2.pct > 98 ? 'bad' : n2.pct > 92 ? 'warn' : 'good';
  const oatStatus: 'good' | 'warn' | 'bad' = frame.oat > 50 || frame.oat < -40 ? 'warn' : 'good';
  const stpStatus: 'good' | 'warn' | 'bad' = (frame.stepperPos ?? 0) > 240 ? 'warn' : 'good';
  const secStatus: 'good' | 'warn' | 'bad' = frame.secuHealthy ? (frame.bitPass ? 'good' : 'warn') : 'bad';

  return (
    <div className="ds-panel" style={{ padding: 16 }}>
      <SectionHead
        title="Peak-Cycle Engineering Parameters"
        subtitle={`Cycle #${worst.cycleNumber} (highest TGT) · TGT 900°C ground / 1020°C flight · N1 light-up >12,625 RPM · N2 free turbine`}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <ParamCard
          label="TGT (Turbine Gas Temp)"
          value={`${worst.peakJpt1.toFixed(0)}°C`}
          limit="≤900°C ground · ≤1020°C flight"
          status={jptStatus}
        />
        <ParamCard
          label="N1 · Gas Generator"
          value={`${worst.maxNggPct.toFixed(1)}% / ${n1Rpm.toLocaleString()} RPM`}
          limit="Light-up >12,625 RPM · self-sustain >57.4%"
          status={nggStatus}
        />
        <ParamCard
          label="N2 · Power Turbine"
          value={`${n2.pct.toFixed(1)}% / ${n2.rpm.toLocaleString()} RPM`}
          limit={`Free turbine · ref ${MAX_NPT_RPM.toLocaleString()} RPM`}
          status={n2Status}
        />
        <ParamCard
          label="Pressure Ratio P2/P1"
          value={`${worst.minP2p1.toFixed(3)}:1`}
          limit={`Nominal ${NOMINAL_P2P1} (surge margin)`}
          status={p2Status}
        />
        <ParamCard
          label="OAT (Env. / ADU)"
          value={`${frame.oat?.toFixed(1) ?? '—'}°C`}
          limit="Range −100 to +300°C · ISA std 15°C"
          status={oatStatus}
        />
        <ParamCard
          label="Stepper / Fuel Flow"
          value={`${frame.stepperPos ?? '—'} steps`}
          limit={`≈ ${frame.fuelFlow.toFixed(2)} kg/h · max 255 steps`}
          status={stpStatus}
        />
        <ParamCard
          label="SECU Health / BIT"
          value={frame.secuHealthy ? (frame.bitPass ? 'BIT PASS' : 'BIT FAIL') : 'SECU FAULT'}
          limit={`MIL-STD-1553B: ${milHex}`}
          status={secStatus}
        />
      </div>

      {/* ── P2/P1 normal vs current ─────────────────────────── */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--cwm-border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Compressor Pressure Ratio · Normal vs Current (peak cycle)
        </div>
        <PressureCompareInline pressure={pressure} />
      </div>

      {/* ── Section temperature ratios ──────────────────────── */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--cwm-border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Temperature Ratios · inlet/outlet per section (absolute K)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ratios.map(r => (
            <div key={r.key} className="gtsu-metric">
              <div className="m-label">{r.label}</div>
              <div className="m-value" style={{ color: 'var(--cwm-accent)' }}>
                {r.ratio.toFixed(3)}<span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', fontWeight: 600 }}> ratio</span>
              </div>
              <div className="m-sub">{r.inLabel} {r.inC.toFixed(0)}°C → {r.outLabel} {r.outC.toFixed(0)}°C</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParamCard({ label, value, limit, status }: {
  label: string; value: string; limit: string; status: 'good' | 'warn' | 'bad';
}) {
  const col = { good: 'var(--cwm-success)', warn: 'var(--cwm-warning)', bad: 'var(--cwm-danger)' }[status];
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid var(--cwm-border)` }}>
      <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>{limit}</div>
    </div>
  );
}

function PressureCompareInline({ pressure }: { pressure: ReturnType<typeof comparePressureRatio> }) {
  const col = pressure.status === 'bad' ? 'var(--cwm-danger)' : pressure.status === 'warn' ? 'var(--cwm-warning)' : 'var(--cwm-success)';
  const scale = (v: number) => Math.min(100, (v / 4.5) * 100);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      <div>
        <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Normal (design)</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums' }}>{pressure.nominal.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--cwm-text-faint)' }}> :1</span></div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 5 }}>
          <div style={{ width: `${scale(pressure.nominal)}%`, height: '100%', background: 'var(--cwm-text-faint)' }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Current (peak)</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums' }}>
          {pressure.current.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--cwm-text-faint)' }}> :1</span>
          <span style={{ fontSize: 11, marginLeft: 8 }}>{pressure.deltaPct > 0 ? '+' : ''}{pressure.deltaPct}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 5 }}>
          <div style={{ width: `${scale(pressure.current)}%`, height: '100%', background: col, transition: 'width 0.25s ease' }} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--cwm-danger)' : tone === 'warn' ? 'var(--cwm-warning)' : 'var(--cwm-text)';
  return (
    <div>
      <dt style={{ fontSize: 10, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</dt>
      <dd style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
    </div>
  );
}

function FaultBreakdown({ items }: { items: { reason: FaultReason; count: number }[] }) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--cwm-text-faint)' }}>No faults this flight — all cycles nominal.</p>;
  }
  const max = items[0].count;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(({ reason, count }) => (
        <div key={reason}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--cwm-text-muted)' }}>{FAULT_LABELS[reason]}</span>
            <span style={{ color: 'var(--cwm-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: 'var(--cwm-warning)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CycleTable({ cycles, onReplay }: { cycles: StartCycle[]; onReplay: (id: string) => void }) {
  if (cycles.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--cwm-text-faint)', padding: '8px 0' }}>No cycles match the current filter.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--cwm-border)' }}>
            {['#', 'Flight Hr', 'Status', 'Duration', 'Peak TGT', 'Max N1', 'Fuel', 'Eff %', 'Reason', 'Improvement', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 8px', fontSize: 10, fontWeight: 600, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cycles.slice(0, 200).map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={cellStyle}>{c.cycleNumber}</td>
              <td style={cellStyle}>{c.flightHour.toFixed(1)}</td>
              <td style={cellStyle}>
                <span style={{
                  padding: '2px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  borderRadius: 3, color: STATUS_COLORS[c.status],
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${STATUS_COLORS[c.status]}`,
                }}>{STATUS_LABELS[c.status]}</span>
              </td>
              <td style={cellStyle}>{c.durationSec}s</td>
              <td style={{ ...cellStyle, color: c.peakJpt1 > 900 ? 'var(--cwm-danger)' : c.peakJpt1 > 870 ? 'var(--cwm-warning)' : 'var(--cwm-text)' }}>{c.peakJpt1.toFixed(0)}°C</td>
              <td style={cellStyle}>{c.maxNggPct.toFixed(0)}%</td>
              <td style={cellStyle}>{c.fuelUsedKg.toFixed(3)} kg</td>
              <td style={cellStyle}>{c.efficiency.toFixed(0)}</td>
              <td style={{ ...cellStyle, color: 'var(--cwm-text-muted)' }}>{c.faultReason ? FAULT_LABELS[c.faultReason] : '—'}</td>
              <td style={{ ...cellStyle, color: 'var(--cwm-text-faint)', maxWidth: 280, fontSize: 10 }}>{c.improvement ?? '—'}</td>
              <td style={cellStyle}>
                <button
                  onClick={() => onReplay(c.id)}
                  style={{
                    padding: '3px 9px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    background: 'transparent', color: 'var(--cwm-accent)',
                    border: '1px solid var(--cwm-accent-border)', borderRadius: 3, cursor: 'pointer',
                  }}
                >REPLAY ▶</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cycles.length > 200 && (
        <p style={{ fontSize: 10, color: 'var(--cwm-text-faint)', textAlign: 'center', padding: 8 }}>
          Showing first 200 of {cycles.length} cycles.
        </p>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '7px 8px', color: 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
};

// ── Flight Library components ────────────────────────────────────────────────

function DbStatusBadge({ status, count }: { status: string; count: number }) {
  if (status === 'loading') return (
    <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>⟳ connecting…</span>
  );
  if (status === 'error') return (
    <span style={{ fontSize: 10, background: '#7f1d1d', color: '#fca5a5', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
      ● OFFLINE
    </span>
  );
  if (status === 'loaded') return (
    <span style={{ fontSize: 10, background: '#14532d', color: '#86efac', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
      ● CONNECTED · {count} flights
    </span>
  );
  return null;
}

function FlightLibraryGrid({
  flights, loadingId, onAnalyse,
}: {
  flights:    BackendFlight[];
  loadingId:  number | null;
  onAnalyse:  (id: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {flights.map(f => {
        const isLoading = loadingId === f.id;
        const srColor = f.success_rate_pct >= 80 ? 'var(--cwm-success)' : f.success_rate_pct >= 60 ? 'var(--cwm-warning)' : 'var(--cwm-danger)';
        return (
          <div
            key={f.id}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--cwm-border)',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>{f.flight_label}</div>
                <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2 }}>{f.date}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: srColor }}>{f.success_rate_pct.toFixed(0)}%</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: 11 }}>
              <span style={{ color: 'var(--cwm-text-faint)' }}>Duration</span>
              <span style={{ color: 'var(--cwm-text)', fontWeight: 600 }}>{f.duration_hrs.toFixed(1)} hrs</span>
              <span style={{ color: 'var(--cwm-text-faint)' }}>Cycles</span>
              <span style={{ color: 'var(--cwm-text)', fontWeight: 600 }}>{f.total_start_cycles}</span>
              <span style={{ color: 'var(--cwm-text-faint)' }}>Faults</span>
              <span style={{ color: f.faulty_cycle_count > 0 ? 'var(--cwm-warning)' : 'var(--cwm-text)', fontWeight: 600 }}>{f.faulty_cycle_count}</span>
              <span style={{ color: 'var(--cwm-text-faint)' }}>Avg TGT</span>
              <span style={{ color: f.avg_peak_jpt1_degC > 880 ? 'var(--cwm-danger)' : 'var(--cwm-text)', fontWeight: 600 }}>{f.avg_peak_jpt1_degC.toFixed(0)} °C</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                onClick={() => onAnalyse(f.id)}
                disabled={isLoading}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.05em', border: '1px solid var(--cwm-accent-border)',
                  borderRadius: 5, cursor: isLoading ? 'wait' : 'pointer',
                  background: 'var(--cwm-accent-bg)', color: 'var(--cwm-accent)',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? '⟳ LOADING…' : '▶ SIMULATE'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pre-Flight Readiness (engineer's quick look) ─────────────────────────────

function PreFlightReadiness({ wear, latestFlight, onSeeLifeCycle }: {
  wear: ComponentWearRecord[]; latestFlight: FlightRecord; onSeeLifeCycle: () => void;
}) {
  const sorted = wear.slice().sort((a, b) => b.wearPct - a.wearPct);
  const failFirst = sorted[0];
  const engineLifeRemaining = wear.length ? Math.min(...wear.map(w => w.remainingLifeHrs)) : 0;
  const maxWear = failFirst?.wearPct ?? 0;
  const readiness = Math.max(0, 100 - maxWear);
  const recentAborts = latestFlight.abortCount;
  const status: 'go' | 'caution' | 'nogo' =
    maxWear > 90 || recentAborts > 2 ? 'nogo' : maxWear > 70 || recentAborts > 0 ? 'caution' : 'go';
  const meta = {
    go:      { label: 'GO',      color: 'var(--cwm-success)', bg: 'var(--cwm-success-bg)', border: 'var(--cwm-success-border)', note: 'All systems within limits — cleared to prepare for flight.' },
    caution: { label: 'CAUTION', color: 'var(--cwm-warning)', bg: 'var(--cwm-warning-bg)', border: 'var(--cwm-warning-border)', note: 'Review flagged components before the next start.' },
    nogo:    { label: 'NO-GO',   color: 'var(--cwm-danger)',  bg: 'var(--cwm-danger-bg)',  border: 'var(--cwm-danger-border)',  note: 'Life-limit or repeated aborts — maintenance required before flight.' },
  }[status];

  return (
    <div className="ds-panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>Pre-Flight Readiness — quick look</div>
          <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2 }}>Glance every parameter and remaining life before preparing for flight</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 10, background: meta.bg, border: `1px solid ${meta.border}` }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: meta.color }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: meta.color, letterSpacing: '0.06em' }}>{meta.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ marginTop: 14 }}>
        <div className="gtsu-metric">
          <div className="m-label">Overall Readiness</div>
          <div className="m-value" style={{ color: meta.color }}>{readiness.toFixed(0)}%</div>
          <div className="m-sub">{meta.note}</div>
        </div>
        <div className="gtsu-metric">
          <div className="m-label">Life Remaining (engine)</div>
          <div className="m-value">{engineLifeRemaining.toLocaleString()} <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', fontWeight: 600 }}>hrs</span></div>
          <div className="m-sub">Set by {failFirst?.name ?? '—'}</div>
        </div>
        <div className="gtsu-metric">
          <div className="m-label">This Flight</div>
          <div className="m-value" style={{ color: latestFlight.abortCount > 0 ? 'var(--cwm-danger)' : 'var(--cwm-text)' }}>{latestFlight.abortCount} aborts</div>
          <div className="m-sub">{latestFlight.faultyCount} faulty · {latestFlight.degradedCount} degraded</div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {sorted.map(w => {
          const col = w.wearPct > 80 ? 'var(--cwm-danger)' : w.wearPct > 60 ? '#f97316' : w.wearPct > 40 ? 'var(--cwm-warning)' : 'var(--cwm-success)';
          return (
            <div key={w.id} style={{ padding: '8px 10px', background: 'var(--cwm-surface-soft)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: 'var(--cwm-text-muted)' }}>{w.name}</span>
                <span style={{ color: col, fontWeight: 700 }}>{w.remainingLifeHrs.toLocaleString()} hrs</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, w.wearPct)}%`, height: '100%', background: col }} />
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onSeeLifeCycle} className="gtsu-btn accent sm" style={{ marginTop: 14 }}>OPEN FULL LIFE-CYCLE BREAKDOWN →</button>
    </div>
  );
}

// ── Flight Records / event log ───────────────────────────────────────────────

interface EngineEvent { hour: number; kind: string; label: string; detail: string; tone: 'bad' | 'warn' | 'info' | 'good'; }

function computeRecords(flights: FlightRecord[]): { events: EngineEvent[]; totalHrs: number } {
  const events: EngineEvent[] = [];
  let base = 0;
  flights.forEach((f, fi) => {
    events.push({ hour: base, kind: 'flight', label: `Flight ${fi + 1} ingested`, detail: `${f.durationHrs} hrs · ${f.cycles.length} start cycles · ${f.successCount} ok`, tone: 'info' });
    for (const c of f.cycles) {
      const h = base + c.flightHour;
      if (c.status === 'aborted') events.push({ hour: h, kind: 'abort', label: `Cycle #${c.cycleNumber} ABORTED`, detail: c.faultReason ? FAULT_LABELS[c.faultReason] : 'start aborted', tone: 'bad' });
      else if (c.status === 'faulty') events.push({ hour: h, kind: 'fault', label: `Cycle #${c.cycleNumber} fault`, detail: c.faultReason ? FAULT_LABELS[c.faultReason] : 'fault', tone: 'warn' });
      else if (c.peakJpt1 > 900) events.push({ hour: h, kind: 'tgt', label: `Cycle #${c.cycleNumber} TGT exceedance`, detail: `peak ${c.peakJpt1.toFixed(0)}°C`, tone: 'warn' });
    }
    base += f.durationHrs;
  });
  return { events: events.sort((a, b) => a.hour - b.hour), totalHrs: base };
}

function FlightRecordsPanel({ flights }: { flights: FlightRecord[] }) {
  const { events, totalHrs } = useMemo(() => computeRecords(flights), [flights]);
  const shown = events.slice(-60).reverse();
  const toneColor = (t: string) => t === 'bad' ? 'var(--cwm-danger)' : t === 'warn' ? 'var(--cwm-warning)' : t === 'good' ? 'var(--cwm-success)' : 'var(--cwm-accent)';
  const aborts = events.filter(e => e.kind === 'abort').length;
  const faults = events.filter(e => e.kind === 'fault').length;
  return (
    <div className="ds-panel" style={{ padding: 16 }}>
      <SectionHead
        title="Flight Records — event log"
        subtitle={`${events.length} recorded events across ${totalHrs.toFixed(0)} cumulative flight hours · ${aborts} aborts · ${faults} faults · every exceedance is kept`}
      />
      {events.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--cwm-text-faint)' }}>No notable events — all cycles nominal so far.</p>
      ) : (
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--cwm-surface-soft)', borderRadius: 7, borderLeft: `3px solid ${toneColor(e.tone)}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', fontVariantNumeric: 'tabular-nums', minWidth: 64 }}>{e.hour.toFixed(1)} hr</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cwm-text)' }}>{e.label}</span>
              <span style={{ fontSize: 11, color: 'var(--cwm-text-muted)' }}>· {e.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pct(n: number) {
  return (n * 100).toFixed(1);
}

function computeCumulative(flights: FlightRecord[]) {
  const totalHrs = flights.reduce((a, f) => a + f.durationHrs, 0);
  const totalCycles = flights.reduce((a, f) => a + f.cycles.length, 0);
  const totalAborts = flights.reduce((a, f) => a + f.abortCount, 0);
  const totalEffWeight = flights.reduce((a, f) => a + f.avgEfficiency * f.cycles.length, 0);
  const avgEff = totalCycles > 0 ? totalEffWeight / totalCycles : 0;
  return { totalHrs, totalCycles, totalAborts, avgEff };
}
