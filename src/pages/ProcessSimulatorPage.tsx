/**
 * ProcessSimulatorPage
 *
 * 3D engine model + live physics replay. Two modes:
 *   - Replay: pick any cycle from a previously-simulated flight, play it
 *   - Live  : ingest live test-rig telemetry (simulated stream while no
 *             physical rig is connected) at 1 Hz
 *
 * Empty until a flight is simulated, OR Live mode is toggled.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGTSUStore, getSelectedCycle, getCurrentFrame } from '../store/useGTSUStore';
import { EngineModel3D, HotspotLegend } from '../components/EngineModel3D';
import { FAULT_LABELS } from '../lib/flightSimulator';
import { buildSimulatorHotspots } from '../lib/engineHotspots';
import type { CycleTraceSample, StartPhase } from '../types/engine';
import { LineChart } from '../components/LineChart';
import SimulationConsole from '../components/SimulationConsole';

const PHASE_LABELS: Record<StartPhase, string> = {
  'idle':            'IDLE',
  'cranking':        'CRANKING',
  'light-up':        'LIGHT-UP',
  'acceleration':    'ACCELERATION',
  'self-sustaining': 'SELF-SUSTAINING',
  'abort':           'ABORT',
};

const PHASE_ORDER: StartPhase[] = ['cranking', 'light-up', 'acceleration', 'self-sustaining'];

export default function ProcessSimulatorPage() {
  const navigate = useNavigate();

  const flights          = useGTSUStore(s => s.flights);
  const wear             = useGTSUStore(s => s.wear);
  const selectedCycleId  = useGTSUStore(s => s.selectedCycleId);
  const isPlaying        = useGTSUStore(s => s.isPlaying);
  const replayElapsedSec = useGTSUStore(s => s.replayElapsedSec);
  const replaySpeed      = useGTSUStore(s => s.replaySpeed);
  const liveMode         = useGTSUStore(s => s.liveMode);
  const liveFrame        = useGTSUStore(s => s.liveFrame);
  const liveHistory      = useGTSUStore(s => s.liveHistory);
  const loadedBackendFlight = useGTSUStore(s => s.loadedBackendFlight);

  const selectCycle    = useGTSUStore(s => s.selectCycle);
  const playReplay     = useGTSUStore(s => s.playReplay);
  const pauseReplay    = useGTSUStore(s => s.pauseReplay);
  const resetReplay    = useGTSUStore(s => s.resetReplay);
  const setReplaySpeed = useGTSUStore(s => s.setReplaySpeed);
  const tickReplay     = useGTSUStore(s => s.tickReplay);
  const setLiveMode    = useGTSUStore(s => s.setLiveMode);
  const pushLiveFrame  = useGTSUStore(s => s.pushLiveFrame);

  // Database replay mode
  const [dbMode, setDbMode]           = useState(!!loadedBackendFlight);
  const [consoleFrame, setConsoleFrame] = useState<CycleTraceSample | null>(null);

  // Auto-enter db mode when a backend flight is loaded
  useEffect(() => {
    if (loadedBackendFlight) setDbMode(true);
  }, [loadedBackendFlight]);

  const cycle = useMemo(() => getSelectedCycle({ flights, selectedCycleId }), [flights, selectedCycleId]);
  const replayFrame = useMemo(() => getCurrentFrame({
    flights, selectedCycleId, replayElapsedSec, liveMode, liveFrame,
  }), [flights, selectedCycleId, replayElapsedSec, liveMode, liveFrame]);

  // Active frame: db console when in db mode, otherwise replay/live
  const frame = dbMode ? consoleFrame : replayFrame;

  const hotspots = useMemo(
    () => buildSimulatorHotspots(frame, dbMode ? null : cycle, wear),
    [frame, cycle, wear, dbMode],
  );

  // ── Replay tick: 1 Hz when playing ─────────────────────────
  useEffect(() => {
    if (!isPlaying || liveMode) return;
    const id = setInterval(() => tickReplay(), 1000);
    return () => clearInterval(id);
  }, [isPlaying, liveMode, tickReplay]);

  // ── Live mode simulated stream: 1 Hz ──────────────────────
  // Until a real test-rig WebSocket is wired up, we generate plausible live
  // frames by stepping through a synthesized cycle.
  const liveTRef = useRef(0);
  useEffect(() => {
    if (!liveMode) { liveTRef.current = 0; return; }
    const id = setInterval(() => {
      const t = liveTRef.current++;
      const f = synthLiveFrame(t);
      pushLiveFrame(f);
    }, 1000);
    return () => clearInterval(id);
  }, [liveMode, pushLiveFrame]);

  // ── Flatten all cycles for the picker ──────────────────────
  const allCycles = useMemo(
    () => flights.flatMap(f => f.cycles.map(c => ({ ...c, flightId: f.id }))),
    [flights],
  );

  // ── Empty state ────────────────────────────────────────────
  if (flights.length === 0 && !liveMode && !dbMode) {
    return (
      <div className="space-y-5">
        <PageHeader title="3D Process Simulator" subtitle="Replay every start cycle in 3D with full physics visualization" />

        <div className="ds-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⚙</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cwm-text)', marginBottom: 8 }}>
            No cycles to replay
          </h2>
          <p style={{ fontSize: 13, color: 'var(--cwm-text-muted)', maxWidth: 540, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Load a flight from the Flight Library, run a manual simulation on the
            Post-Flight Analysis page, or switch to Live mode below.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => navigate('/')} style={primaryBtn}>GO TO POST-FLIGHT ANALYSIS →</button>
            <button onClick={() => setLiveMode(true)} style={ghostBtn}>▦ ENABLE LIVE MODE</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Determine current phase for display ────────────────────
  const currentPhase = frame?.phase ?? 'idle';
  const elapsedDisplay = liveMode ? liveTRef.current : replayElapsedSec;
  const totalDuration  = liveMode ? Math.max(liveTRef.current, 40) : (cycle?.durationSec ?? 0);

  // ── Trace history for inline charts ────────────────────────
  const traceUpTo: CycleTraceSample[] = liveMode
    ? liveHistory
    : (cycle?.trace ?? []).slice(0, Math.max(1, Math.floor(replayElapsedSec) + 1));

  const jptSeries  = traceUpTo.map(s => ({ x: s.t, y: s.jpt1 }));
  const nggSeries  = traceUpTo.map(s => ({ x: s.t, y: s.nggPct }));
  const p2p1Series = traceUpTo.map(s => ({ x: s.t, y: s.p2p1 }));
  const oatSeries  = traceUpTo.map(s => ({ x: s.t, y: s.oat }));

  return (
    <div className="space-y-4">
      {/* Top bar: mode + selector */}
      <div className="ds-panel" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--cwm-border)' }}>
          <button
            onClick={() => { setDbMode(false); setLiveMode(false); }}
            style={{
              ...tabBtn,
              background: !liveMode && !dbMode ? 'var(--cwm-accent)' : 'transparent',
              color: !liveMode && !dbMode ? '#fff' : 'var(--cwm-text-muted)',
            }}
          >REPLAY</button>
          <button
            onClick={() => { setDbMode(false); setLiveMode(true); }}
            style={{
              ...tabBtn,
              background: liveMode && !dbMode ? 'var(--cwm-danger)' : 'transparent',
              color: liveMode && !dbMode ? '#fff' : 'var(--cwm-text-muted)',
            }}
          >● LIVE TEST-RIG</button>
          <button
            onClick={() => { setDbMode(true); setLiveMode(false); }}
            style={{
              ...tabBtn,
              background: dbMode ? '#2563eb' : 'transparent',
              color: dbMode ? '#fff' : 'var(--cwm-text-muted)',
            }}
          >📁 DATABASE REPLAY</button>
        </div>

        {!liveMode && !dbMode && (
          <select
            value={selectedCycleId ?? ''}
            onChange={(e) => selectCycle(e.target.value || null)}
            style={{
              padding: '7px 10px', fontSize: 12,
              background: 'var(--cwm-panel)', color: 'var(--cwm-text)',
              border: '1px solid var(--cwm-border)', borderRadius: 6, minWidth: 280,
            }}
          >
            <option value="">— Select cycle —</option>
            {allCycles.map(c => (
              <option key={c.id} value={c.id}>
                Cycle #{c.cycleNumber} · {c.status.toUpperCase()}{c.faultReason ? ` · ${FAULT_LABELS[c.faultReason]}` : ''} · {c.flightHour.toFixed(1)} hr
              </option>
            ))}
          </select>
        )}

        {liveMode && !dbMode && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--cwm-danger)', animation: 'pulse 1.4s infinite' }} />
            <span style={{ fontSize: 11, color: 'var(--cwm-text-muted)', letterSpacing: '0.05em' }}>
              STREAMING SIMULATED RIG DATA · 1 HZ
            </span>
          </div>
        )}

        {dbMode && loadedBackendFlight && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#86efac', letterSpacing: '0.05em' }}>
              ● {loadedBackendFlight.meta.flight_label} · {loadedBackendFlight.meta.total_start_cycles} cycles · {loadedBackendFlight.meta.duration_hrs.toFixed(1)} hrs
            </span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {!liveMode && !dbMode && cycle && (
          <PlaybackControls
            isPlaying={isPlaying}
            elapsed={replayElapsedSec}
            duration={cycle.durationSec}
            speed={replaySpeed}
            onPlay={playReplay}
            onPause={pauseReplay}
            onReset={resetReplay}
            onSpeedChange={setReplaySpeed}
          />
        )}
      </div>

      {/* Simulation Console (database replay mode) */}
      {dbMode && (
        <SimulationConsole onFrameChange={setConsoleFrame} />
      )}

      {/* Main split: 3D + physics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, minHeight: 0 }}>
        {/* 3D model */}
        <div className="ds-panel" style={{ position: 'relative', overflow: 'hidden', height: 500 }}>
          <EngineModel3D frame={frame} hotspots={hotspots} />

          {/* Legend top-center */}
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 6 }}>
            <HotspotLegend items={hotspots} />
          </div>

          {/* HUD overlay */}
          <div style={{ position: 'absolute', top: 12, left: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.55)', borderRadius: 6, fontFamily: 'monospace' }}>
            <div style={{ fontSize: 10, color: '#8ca0b6', letterSpacing: '0.06em' }}>PHASE</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{PHASE_LABELS[currentPhase]}</div>
          </div>
          <div style={{ position: 'absolute', top: 12, right: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.55)', borderRadius: 6, fontFamily: 'monospace', textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#8ca0b6', letterSpacing: '0.06em' }}>T+ {elapsedDisplay}s</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{(frame?.ngg ?? 0).toLocaleString()} RPM</div>
          </div>

          {/* Phase progress bar at bottom */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
            <PhaseStrip currentPhase={currentPhase} />
            <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, (elapsedDisplay / Math.max(1, totalDuration)) * 100)}%`,
                height: '100%', background: 'var(--cwm-accent)', transition: 'width 0.2s ease',
              }} />
            </div>
          </div>
        </div>

        {/* Physics panel */}
        <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 12, minHeight: 0 }}>
          {/* Gauges */}
          <div className="ds-panel" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Live Physics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Gauge label="JPT1" value={frame?.jpt1.toFixed(0) ?? '—'} unit="°C" max={1050} v={frame?.jpt1 ?? 0} critical={900} sublabel="≤900 gnd / ≤1020 flt" />
              <Gauge label="Ngg" value={frame?.nggPct.toFixed(1) ?? '—'} unit="%" max={100} v={frame?.nggPct ?? 0} critical={95} sublabel={`${(frame?.ngg ?? 0).toLocaleString()} RPM`} />
              <Gauge label="P2/P1" value={frame?.p2p1.toFixed(2) ?? '—'} unit=":1" max={4.2} v={frame?.p2p1 ?? 0} critical={4.0} inverted sublabel="nominal 3.86" />
              <Gauge label="Fuel Flow" value={frame?.fuelFlow.toFixed(2) ?? '—'} unit="kg/h" max={10} v={frame?.fuelFlow ?? 0} critical={9} />
              <Gauge label="Stepper Pos" value={frame?.stepperPos?.toString() ?? '—'} unit="/255 steps" max={255} v={frame?.stepperPos ?? 0} critical={240} sublabel={`≈${frame?.fuelFlow?.toFixed(1) ?? '—'} kg/h`} />
              <Gauge label="OAT (ADU)" value={frame?.oat?.toFixed(1) ?? '—'} unit="°C" max={300} v={(frame?.oat ?? 15) + 100} critical={150} min={0} sublabel="-100 to +300°C" />
              <Gauge label="Vibration" value={frame?.vibration.toFixed(1) ?? '—'} unit="mm/s" max={20} v={frame?.vibration ?? 0} critical={11} />
              <Gauge label="Ngg RPM" value={(frame?.ngg ?? 0).toLocaleString()} unit="RPM" max={22000} v={frame?.ngg ?? 0} critical={21000} sublabel={`light-up >12,625 RPM${frame && frame.ngg > 12625 ? ' ✓' : ''}`} />
              <StatusGauge label="SECU BIT" ok={frame?.bitPass ?? true} detail={frame ? `0x${frame.milBusWord.toString(16).toUpperCase().padStart(4, '0')}` : '—'} />
            </div>
          </div>

          {/* Cycle context */}
          <div className="ds-panel" style={{ padding: 14 }}>
            {dbMode ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>Database Replay</div>
                <div style={{ fontSize: 11, color: 'var(--cwm-text-muted)', lineHeight: 1.55 }}>
                  {consoleFrame
                    ? `Phase: ${consoleFrame.phase?.toUpperCase() ?? '—'} · JPT1 ${consoleFrame.jpt1?.toFixed(0) ?? '—'}°C · Ngg ${consoleFrame.nggPct?.toFixed(1) ?? '—'}%`
                    : 'Use the console above to play or seek.'}
                </div>
              </>
            ) : cycle && !liveMode ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>Cycle Context</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)', marginBottom: 4 }}>
                  Cycle #{cycle.cycleNumber} · {cycle.status.toUpperCase()}
                </div>
                {cycle.faultReason && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--cwm-warning)', marginBottom: 6 }}>
                      Fault: {FAULT_LABELS[cycle.faultReason]}
                    </div>
                    {cycle.improvement && (
                      <div style={{ fontSize: 11, color: 'var(--cwm-text-muted)', lineHeight: 1.55, padding: '6px 0', borderTop: '1px solid var(--cwm-border)' }}>
                        <span style={{ color: 'var(--cwm-accent)', fontWeight: 700 }}>RECOMMENDATION · </span>{cycle.improvement}
                      </div>
                    )}
                  </>
                )}
                {!cycle.faultReason && (
                  <div style={{ fontSize: 11, color: 'var(--cwm-success)' }}>Nominal cycle — within all envelopes.</div>
                )}
              </>
            ) : liveMode ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>Live Stream</div>
                <div style={{ fontSize: 11, color: 'var(--cwm-text-muted)', lineHeight: 1.55 }}>
                  Ingesting telemetry from test rig at 1 Hz. Switch back to Replay to inspect a recorded cycle.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--cwm-text-faint)' }}>Select a cycle to inspect.</div>
            )}
          </div>

          {/* Mini charts */}
          <div className="ds-panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>Trace</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              {jptSeries.length > 1 ? (
                <LineChart data={jptSeries} color="#f97316" yAxisLabel="JPT1 °C" height={90} />
              ) : <EmptyMini label="JPT1" />}
              {nggSeries.length > 1 ? (
                <LineChart data={nggSeries} color="#10b981" yAxisLabel="Ngg %" height={90} />
              ) : <EmptyMini label="Ngg" />}
              {p2p1Series.length > 1 ? (
                <LineChart data={p2p1Series} color="#818cf8" yAxisLabel="P2/P1" height={90} />
              ) : <EmptyMini label="P2/P1" />}
              {oatSeries.length > 1 ? (
                <LineChart data={oatSeries} color="#38bdf8" yAxisLabel="OAT °C" height={90} />
              ) : <EmptyMini label="OAT" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="ds-panel px-5 py-4">
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--cwm-text)', letterSpacing: '-0.01em' }}>{title}</h2>
      <p style={{ fontSize: 12, color: 'var(--cwm-text-muted)', marginTop: 4 }}>{subtitle}</p>
    </div>
  );
}

function PlaybackControls({
  isPlaying, elapsed, duration, speed, onPlay, onPause, onReset, onSpeedChange,
}: {
  isPlaying: boolean;
  elapsed:   number;
  duration:  number;
  speed:     1 | 2 | 5;
  onPlay:    () => void;
  onPause:   () => void;
  onReset:   () => void;
  onSpeedChange: (s: 1 | 2 | 5) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button onClick={onReset} style={iconBtn} title="Reset">↺</button>
      <button onClick={isPlaying ? onPause : onPlay} style={{ ...iconBtn, background: 'var(--cwm-accent)', color: '#fff', minWidth: 38, fontWeight: 700 }}>
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <span style={{ fontSize: 11, color: 'var(--cwm-text-muted)', fontFamily: 'monospace', minWidth: 80 }}>
        {elapsed}s / {duration}s
      </span>
      <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--cwm-border)' }}>
        {([1, 2, 5] as const).map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            style={{
              padding: '4px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              background: speed === s ? 'var(--cwm-accent)' : 'transparent',
              color:      speed === s ? '#fff' : 'var(--cwm-text-muted)',
              border: 'none', cursor: 'pointer',
            }}
          >{s}x</button>
        ))}
      </div>
    </div>
  );
}

function PhaseStrip({ currentPhase }: { currentPhase: StartPhase }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PHASE_ORDER.map(p => (
        <div
          key={p}
          style={{
            flex: 1, padding: '4px 6px', fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
            background: currentPhase === p ? 'var(--cwm-accent)' : 'rgba(0,0,0,0.5)',
            color: currentPhase === p ? '#fff' : '#afc3d8',
            borderRadius: 3, textAlign: 'center',
          }}
        >{PHASE_LABELS[p]}</div>
      ))}
    </div>
  );
}

function Gauge({
  label, value, unit, max, v, critical, inverted, min = 0, sublabel,
}: {
  label: string;
  value: string;
  unit:  string;
  max:   number;
  v:     number;
  critical: number;
  inverted?: boolean;
  min?: number;
  sublabel?: string;
}) {
  const range = Math.max(1, max - min);
  const pct = Math.min(100, ((v - min) / range) * 100);
  const isBad = inverted ? v < critical : v > critical;
  const color = isBad ? 'var(--cwm-danger)' : pct > 75 ? 'var(--cwm-warning)' : 'var(--cwm-success)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)' }}>{unit}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>{value}</div>
      {sublabel && <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', marginBottom: 2, letterSpacing: '0.02em' }}>{sublabel}</div>}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 1.5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.25s ease' }} />
      </div>
    </div>
  );
}

function StatusGauge({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: ok ? 'var(--cwm-success)' : 'var(--cwm-danger)', marginBottom: 2 }}>{ok ? 'PASS' : 'FAIL'}</div>
      <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', letterSpacing: '0.04em', fontFamily: 'monospace' }}>{detail}</div>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--cwm-text-faint)' }}>
      {label} trace will appear here…
    </div>
  );
}

// ── Live mode synthesizer (placeholder until real rig connected) ────────

function synthLiveFrame(t: number): CycleTraceSample {
  const ramp = Math.min(1, t / 40);
  const phase: StartPhase =
    ramp < 0.15 ? 'cranking' :
    ramp < 0.32 ? 'light-up' :
    ramp < 0.65 ? 'acceleration' :
                  'self-sustaining';
  const nggPct = Math.min(94, 5 + 90 * (1 - Math.exp(-ramp * 2.4))) + (Math.random() - 0.5) * 1.5;
  const jpt1   = Math.min(860, 60 + 780 * Math.pow(ramp, 0.7)) + (Math.random() - 0.5) * 6;
  const p2p1   = 3.78 + ramp * 0.08 + (Math.random() - 0.5) * 0.02;
  const fuel   = 1.2 + ramp * 6.6 + (Math.random() - 0.5) * 0.2;
  const vib    = 0.8 + ramp * 1.0 + (Math.random() - 0.5) * 0.2;
  const oat    = 14 + Math.sin(t * 0.05) * 2 + (Math.random() - 0.5) * 1;
  const nggRpm = Math.round((nggPct / 100) * 22000);
  return {
    t,
    jpt1: Number(jpt1.toFixed(1)),
    nggPct: Number(nggPct.toFixed(2)),
    ngg: nggRpm,
    p2p1: Number(p2p1.toFixed(3)),
    fuelFlow: Number(fuel.toFixed(2)),
    stepperPos: Math.round(Math.max(0, Math.min(255, (fuel / 10) * 255))),
    vibration: Number(Math.max(0, vib).toFixed(2)),
    oat: Number(oat.toFixed(1)),
    secuHealthy: true,
    bitPass: true,
    milBusWord: 0x0000,
    phase,
  };
}

// ── Inline styles ────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  padding: '10px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
  background: 'var(--cwm-accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '10px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
  background: 'transparent', color: 'var(--cwm-text)', border: '1px solid var(--cwm-border)', borderRadius: 6, cursor: 'pointer',
};
const tabBtn: React.CSSProperties = {
  padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  border: 'none', cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, minWidth: 32,
  background: 'transparent', color: 'var(--cwm-text)',
  border: '1px solid var(--cwm-border)', borderRadius: 4, cursor: 'pointer',
};
