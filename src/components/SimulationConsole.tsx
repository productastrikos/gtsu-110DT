/**
 * SimulationConsole.tsx
 * Per-cycle playback console for GTSU-110 starter motor data.
 *
 * Layout
 *   ┌─ Header: flight label, date, cycle count, success rate ──────────┐
 *   ├─ Cycle strip: one card per starter cycle (horizontal scroll) ────┤
 *   ├─ Cycle timeline: progress bar scoped to the selected cycle ──────┤
 *   ├─ Transport: ⏮ ⏪ ▶/⏸ ⏩ ⏭ · elapsed / duration · speed ───────┤
 *   └─ Status row: phase, TGT, N1, P2/P1, OAT, faults ───────────────┘
 *
 * Props:
 *   onFrameChange – called on every tick with the current CycleTraceSample
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useGTSUStore }  from '../store/useGTSUStore';
import type { CycleTraceSample, TraceRow, BackendCycle } from '../types/engine';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onFrameChange: (frame: CycleTraceSample | null) => void;
}

// ── Type converter: TraceRow → CycleTraceSample ──────────────────────────────
export function traceRowToFrame(row: TraceRow): CycleTraceSample {
  return {
    t:           row.elapsed_time_sec,
    jpt1:        row.jet_pipe_temp_degC,
    ngg:         row.gas_gen_speed_rpm,
    nggPct:      row.gas_gen_speed_pct,
    p2p1:        row.compressor_pressure_ratio,
    fuelFlow:    row.fuel_flow_kg_per_hr,
    stepperPos:  row.fuel_valve_steps,
    vibration:   row.vibration_mm_per_sec,
    oat:         row.ambient_temp_degC,
    secuHealthy: row.secu_processor_ok === 1,
    bitPass:     row.built_in_test_pass === 1,
    milBusWord:  parseInt(row.mil_1553b_status_word, 16) || 0,
    phase:       row.start_phase as CycleTraceSample['phase'],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSec(sec: number): string {
  const s = Math.abs(Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m > 0 ? `${m}m ${ss.toString().padStart(2, '0')}s` : `${s}s`;
}

function fmtDecimal(sec: number): string {
  const s = Math.floor(sec);
  const d = Math.floor((sec - s) * 10);
  return `${s}.${d}s`;
}

function statusColor(st: string): string {
  if (st === 'success')  return '#22c55e';
  if (st === 'degraded') return '#f59e0b';
  if (st === 'faulty')   return '#f97316';
  return '#ef4444'; // aborted
}

function statusBg(st: string): string {
  if (st === 'success')  return 'rgba(34,197,94,0.12)';
  if (st === 'degraded') return 'rgba(245,158,11,0.12)';
  if (st === 'faulty')   return 'rgba(249,115,22,0.12)';
  return 'rgba(239,68,68,0.12)';
}

/** Binary search: last TraceRow with elapsed_time_sec <= target. Returns null if trace empty. */
function findRow(trace: TraceRow[], target: number): TraceRow | null {
  if (!trace.length) return null;
  let lo = 0, hi = trace.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (trace[mid].elapsed_time_sec <= target) lo = mid; else hi = mid - 1;
  }
  return trace[lo];
}

const SPEEDS = [0.5, 1, 2, 5, 10, 50, 100] as const;

const PHASE_COLOR: Record<string, string> = {
  'cranking':          '#3b82f6',
  'light-up':          '#3b82f6',
  'acceleration':      '#3b82f6',
  'self-sustaining':   '#3b82f6',
  'shutdown':          '#3b82f6',
  'idle':              '#3b82f6',
};

// ── Phase band builder ────────────────────────────────────────────────────────
interface PhaseSeg { phase: string; startPct: number; widthPct: number; }

function buildPhaseSegs(
  rows: TraceRow[], startTs: number, endTs: number,
): PhaseSeg[] {
  const dur = endTs - startTs || 1;
  const segs: PhaseSeg[] = [];
  if (!rows.length) return segs;

  let segPhase = rows[0].start_phase;
  let segStart = rows[0].elapsed_time_sec;

  for (let i = 1; i <= rows.length; i++) {
    const row = rows[i];
    const flushTs = row ? row.elapsed_time_sec : endTs;
    if (!row || row.start_phase !== segPhase) {
      const startPct = Math.max(0, ((segStart - startTs) / dur) * 100);
      const widthPct = Math.max(0, ((flushTs  - segStart) / dur) * 100);
      if (widthPct > 0) segs.push({ phase: segPhase, startPct, widthPct });
      if (row) { segPhase = row.start_phase; segStart = row.elapsed_time_sec; }
    }
  }
  return segs;
}

// ── Chip component ────────────────────────────────────────────────────────────
function Chip({
  children,
  color = '#8b949e',
  bg    = 'rgba(255,255,255,0.06)',
}: {
  children: React.ReactNode;
  color?: string;
  bg?:    string;
}) {
  return (
    <span style={{ padding: '1px 8px', background: bg, borderRadius: 4,
      fontSize: 11, color, fontFamily: 'ui-monospace,"Courier New",monospace' }}>
      {children}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SimulationConsole({ onFrameChange }: Props) {
  const {
    loadedBackendFlight,
    consoleSec,
    consoleSpeed,
    consoleIsPlaying,
    loadingFlightId,
    setConsoleSec,
    setConsoleSpeed,
    playConsole,
    pauseConsole,
  } = useGTSUStore();

  // ── Local state: which cycle is selected in the strip ─────────────────
  const [activeCycleIdx, setActiveCycleIdx] = useState(0);

  // ── Refs used inside the timer callback (avoid stale closures) ────────
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef    = useRef<number>(performance.now());
  const consoleSecRef  = useRef(consoleSec);
  const activeCycleRef = useRef<BackendCycle | null>(null);
  const speedRef       = useRef(consoleSpeed);

  useEffect(() => { consoleSecRef.current  = consoleSec;    }, [consoleSec]);
  useEffect(() => { speedRef.current       = consoleSpeed;  }, [consoleSpeed]);

  const cycles = loadedBackendFlight?.cycles ?? [];
  const trace  = loadedBackendFlight?.trace  ?? [];
  const meta   = loadedBackendFlight?.meta;

  const activeCycle: BackendCycle | null = cycles[activeCycleIdx] ?? null;
  useEffect(() => { activeCycleRef.current = activeCycle; }, [activeCycle]);

  // Reset to first cycle whenever a new flight is loaded
  useEffect(() => { setActiveCycleIdx(0); }, [loadedBackendFlight]);

  // ── Playback timer – scoped to the selected cycle ─────────────────────
  useEffect(() => {
    if (!consoleIsPlaying) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    lastTickRef.current = performance.now();
    intervalRef.current = setInterval(() => {
      const now   = performance.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const cycle = activeCycleRef.current;
      if (!cycle) { pauseConsole(); return; }

      const next = consoleSecRef.current + delta * speedRef.current;
      if (next >= cycle.cycle_end_sec) {
        setConsoleSec(cycle.cycle_end_sec);
        pauseConsole();
      } else {
        setConsoleSec(next);
      }
    }, 50);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // Speed/cycle changes are read via refs so only consoleIsPlaying needed here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleIsPlaying]);

  // ── Emit current frame to parent ──────────────────────────────────────
  useEffect(() => {
    if (!loadedBackendFlight) { onFrameChange(null); return; }
    const row = findRow(trace, consoleSec);
    onFrameChange(row ? traceRowToFrame(row) : null);
  }, [consoleSec, loadedBackendFlight, onFrameChange, trace]);

  // ── Cycle selection helper ─────────────────────────────────────────────
  const selectCycle = useCallback((idx: number) => {
    if (!cycles[idx]) return;
    pauseConsole();
    setActiveCycleIdx(idx);
    setConsoleSec(cycles[idx].cycle_start_sec);
  }, [cycles, pauseConsole, setConsoleSec]);

  // ── Empty / loading state ──────────────────────────────────────────────
  if (!loadedBackendFlight) {
    return (
      <div style={S.emptyWrap}>
        {loadingFlightId != null ? (
          <p style={{ color: 'var(--cwm-accent,#60a5fa)', margin: 0 }}>
            Loading flight {loadingFlightId} telemetry…
          </p>
        ) : (
          <p style={{ color: '#6e7681', margin: 0 }}>
            Select a flight from the library to open the simulation console.
          </p>
        )}
      </div>
    );
  }

  // ── Derived render values ─────────────────────────────────────────────
  const cycleDuration = activeCycle ? activeCycle.cycle_end_sec - activeCycle.cycle_start_sec : 1;
  const cycleElapsed  = activeCycle
    ? Math.max(0, Math.min(cycleDuration, consoleSec - activeCycle.cycle_start_sec))
    : 0;
  const progressPct = Math.min(100, (cycleElapsed / cycleDuration) * 100);
  const currentRow  = findRow(trace, consoleSec);

  const cycleTrace = activeCycle
    ? trace.filter(r => r.elapsed_time_sec >= activeCycle.cycle_start_sec && r.elapsed_time_sec <= activeCycle.cycle_end_sec)
    : [];
  const phaseSegs = activeCycle
    ? buildPhaseSegs(cycleTrace, activeCycle.cycle_start_sec, activeCycle.cycle_end_sec)
    : [];

  return (
    <div style={S.root}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <span style={S.flightLabel}>{meta!.flight_label}</span>
        <span style={S.dimText}>{meta!.date}</span>
        <span style={S.dimText}>{meta!.total_start_cycles} starter cycles</span>
        <span style={{
          ...S.badge,
          background: meta!.success_rate_pct >= 80 ? '#166534' : '#7f1d1d',
        }}>
          {meta!.success_rate_pct.toFixed(0)}% SUCCESS
        </span>
        {meta!.faulty_cycle_count > 0 && (
          <span style={{ ...S.badge, background: '#7c2d12' }}>
            ⚠ {meta!.faulty_cycle_count} FAULTS
          </span>
        )}
      </div>

      {/* ── Cycle strip ──────────────────────────────────────────────────── */}
      <div style={S.cycleStrip}>
        {cycles.map((c, i) => {
          const isActive = i === activeCycleIdx;
          const col      = statusColor(c.cycle_status);
          return (
            <button
              key={c.id}
              style={{
                ...S.cycleCard,
                borderColor: isActive ? col : 'transparent',
                background:  isActive ? statusBg(c.cycle_status) : 'rgba(255,255,255,0.03)',
                boxShadow:   isActive ? `0 0 0 1px ${col}` : 'none',
              }}
              onClick={() => selectCycle(i)}
              title={`Cycle ${c.cycle_number} · ${c.cycle_status}${c.fault_type ? ' · ' + c.fault_type : ''}`}
            >
              <span style={{ fontSize: 10, color: '#6e7681' }}>#{c.cycle_number}</span>
              <span style={{ fontSize: 9, color: col, fontWeight: 700, letterSpacing: '0.04em' }}>
                {c.cycle_status.slice(0, 4).toUpperCase()}
              </span>
              <span style={{ fontSize: 9, color: '#484f58' }}>
                {fmtSec(c.cycle_end_sec - c.cycle_start_sec)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Per-cycle timeline bar ────────────────────────────────────────── */}
      {activeCycle && (
        <div style={S.timeline}>
          {/* Phase markers: divider tick + abbreviation label at each phase start */}
          {phaseSegs.map((seg, i) => (
            <React.Fragment key={i}>
              {/* Vertical divider at every phase boundary except the first */}
              {i > 0 && (
                <div style={{
                  position:   'absolute',
                  top: 0, bottom: 0,
                  left:       `${seg.startPct}%`,
                  width:      1,
                  background: 'rgba(230,237,243,0.22)',
                  pointerEvents: 'none',
                }} />
              )}
              {/* Phase abbreviation label */}
              <span style={{
                position:      'absolute',
                top:           3,
                left:          `calc(${seg.startPct}% + 4px)`,
                fontSize:      8,
                fontWeight:    700,
                color:         'rgba(230,237,243,0.42)',
                letterSpacing: '0.07em',
                pointerEvents: 'none',
                userSelect:    'none',
                whiteSpace:    'nowrap',
              }}>
                {({'cranking':'CRK','light-up':'LIT','acceleration':'ACC',
                   'self-sustaining':'SUS','shutdown':'SHD','idle':'IDL'} as Record<string,string>
                  )[seg.phase] ?? seg.phase.slice(0, 3).toUpperCase()}
              </span>
            </React.Fragment>
          ))}

          {/* Elapsed fill */}
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0, left: 0,
            width:      `${progressPct}%`,
            background: `linear-gradient(90deg,
              ${statusColor(activeCycle.cycle_status)}99 0%,
              ${statusColor(activeCycle.cycle_status)}33 100%)`,
            transition: 'width 55ms linear',
            pointerEvents: 'none',
          }} />

          {/* Playhead */}
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left:      `${progressPct}%`,
            width:     2,
            background: '#e6edf3',
            opacity:   0.9,
            transition: 'left 55ms linear',
            pointerEvents: 'none',
          }} />

          {/* Seek overlay */}
          <div
            style={{ position: 'absolute', inset: 0, cursor: 'ew-resize' }}
            onClick={(e) => {
              if (!activeCycle) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setConsoleSec(activeCycle.cycle_start_sec + frac * cycleDuration);
            }}
          />

          {/* Tick labels */}
          <span style={{ ...S.tick, left: 4 }}>0s</span>
          <span style={{ ...S.tick, left: '25%', transform: 'translateX(-50%)' }}>
            {fmtSec(cycleDuration * 0.25)}
          </span>
          <span style={{ ...S.tick, left: '50%', transform: 'translateX(-50%)' }}>
            {fmtSec(cycleDuration * 0.5)}
          </span>
          <span style={{ ...S.tick, right: 4 }}>{fmtSec(cycleDuration)}</span>
        </div>
      )}

      {/* ── Transport controls ───────────────────────────────────────────── */}
      <div style={S.controls}>
        <div style={S.btnGroup}>
          <button style={S.ctrlBtn} title="First cycle"
            onClick={() => selectCycle(0)}>⏮</button>

          <button
            style={{ ...S.ctrlBtn, opacity: activeCycleIdx > 0 ? 1 : 0.3 }}
            disabled={activeCycleIdx <= 0}
            title="Previous cycle"
            onClick={() => selectCycle(activeCycleIdx - 1)}
          >⏪</button>

          <button
            style={{ ...S.ctrlBtn, ...S.playBtn }}
            title={consoleIsPlaying ? 'Pause' : 'Play'}
            onClick={() => consoleIsPlaying ? pauseConsole() : playConsole()}
          >
            {consoleIsPlaying ? '⏸' : '▶'}
          </button>

          <button
            style={{ ...S.ctrlBtn, opacity: activeCycleIdx < cycles.length - 1 ? 1 : 0.3 }}
            disabled={activeCycleIdx >= cycles.length - 1}
            title="Next cycle"
            onClick={() => selectCycle(activeCycleIdx + 1)}
          >⏩</button>

          <button style={S.ctrlBtn} title="Last cycle"
            onClick={() => selectCycle(cycles.length - 1)}>⏭</button>
        </div>

        <span style={S.timeDisplay}>
          T+{fmtDecimal(cycleElapsed)}&nbsp;/&nbsp;{fmtSec(cycleDuration)}
        </span>

        <div style={S.btnGroup}>
          {SPEEDS.map(s => (
            <button
              key={s}
              style={{
                ...S.speedBtn,
                background:  consoleSpeed === s ? '#1f6feb' : 'transparent',
                color:       consoleSpeed === s ? '#e6edf3' : '#6e7681',
                borderColor: consoleSpeed === s ? '#388bfd' : '#30363d',
              }}
              onClick={() => setConsoleSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Status row ───────────────────────────────────────────────────── */}
      <div style={S.statusRow}>
        {activeCycle && (
          <>
            <span style={{ color: statusColor(activeCycle.cycle_status), fontWeight: 700, fontSize: 12 }}>
              ● {activeCycle.cycle_status.toUpperCase()}
            </span>
            <Chip>CYCLE {activeCycle.cycle_number}</Chip>
            {activeCycle.fault_type && (
              <Chip color="#f97316">⚠ {activeCycle.fault_type}</Chip>
            )}
          </>
        )}

        {currentRow && (
          <>
            <Chip
              color={PHASE_COLOR[currentRow.start_phase] ?? '#9ca3af'}
              bg={(PHASE_COLOR[currentRow.start_phase] ?? '#1f2937') + '33'}
            >
              {currentRow.start_phase.toUpperCase()}
            </Chip>
            <Chip>TGT {currentRow.jet_pipe_temp_degC.toFixed(0)} °C</Chip>
            <Chip>N1 {currentRow.gas_gen_speed_pct.toFixed(1)} %</Chip>
            <Chip>P2/P1 {currentRow.compressor_pressure_ratio.toFixed(2)}</Chip>
            <Chip>OAT {currentRow.ambient_temp_degC.toFixed(0)} °C</Chip>
            {currentRow.vibration_mm_per_sec > 5 && (
              <Chip color="#f97316">VIB {currentRow.vibration_mm_per_sec.toFixed(1)} mm/s</Chip>
            )}
          </>
        )}

        {activeCycle?.corrective_action && (
          <span
            style={{
              padding: '1px 8px', background: 'rgba(255,255,255,0.06)',
              borderRadius: 4, fontSize: 11, color: '#60a5fa',
              maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', fontFamily: 'ui-monospace,"Courier New",monospace',
            }}
            title={activeCycle.corrective_action}
          >
            💡 {activeCycle.corrective_action}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    background:    '#0d1117',
    border:        '1px solid #21262d',
    borderRadius:  10,
    padding:       '12px 14px 10px',
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
    fontFamily:    'ui-monospace,"Courier New",monospace',
  },
  emptyWrap: {
    background:   '#0d1117',
    border:       '1px solid #21262d',
    borderRadius: 10,
    padding:      24,
    textAlign:    'center',
    fontFamily:   'ui-monospace,"Courier New",monospace',
  },
  header: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    flexWrap:   'wrap',
  },
  flightLabel: {
    color:         '#e6edf3',
    fontWeight:    700,
    fontSize:      13,
    letterSpacing: '0.06em',
  },
  dimText: { color: '#6e7681', fontSize: 11 },
  badge: {
    padding:       '1px 7px',
    borderRadius:  4,
    fontSize:      10,
    fontWeight:    700,
    letterSpacing: '0.06em',
    color:         '#fff',
  },
  cycleStrip: {
    display:        'flex',
    gap:            5,
    overflowX:      'auto',
    paddingBottom:  4,
    scrollbarWidth: 'thin',
  },
  cycleCard: {
    flexShrink:    0,
    width:         62,
    padding:       '5px 4px',
    border:        '1px solid transparent',
    borderRadius:  6,
    cursor:        'pointer',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           2,
    transition:    'all 0.15s',
    fontFamily:    'inherit',
  },
  timeline: {
    position:     'relative',
    height:       32,
    background:   '#161b22',
    borderRadius: 5,
    overflow:     'hidden',
    border:       '1px solid #21262d',
  },
  tick: {
    position:      'absolute',
    bottom:        2,
    fontSize:      9,
    color:         '#484f58',
    pointerEvents: 'none',
    userSelect:    'none',
  },
  controls: {
    display:    'flex',
    alignItems: 'center',
    gap:        12,
    flexWrap:   'wrap',
  },
  btnGroup: {
    display:    'flex',
    alignItems: 'center',
    gap:        3,
  },
  ctrlBtn: {
    width:          32,
    height:         32,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     '#161b22',
    border:         '1px solid #30363d',
    borderRadius:   6,
    color:          '#e6edf3',
    fontSize:       14,
    cursor:         'pointer',
    fontFamily:     'inherit',
    transition:     'background 0.1s',
  },
  playBtn: {
    background:  '#1f6feb',
    borderColor: '#388bfd',
    width:       38,
    height:      38,
    fontSize:    16,
  },
  timeDisplay: {
    color:         '#e6edf3',
    fontSize:      13,
    fontWeight:    600,
    letterSpacing: '0.04em',
    minWidth:      120,
  },
  speedBtn: {
    padding:      '2px 7px',
    height:       24,
    border:       '1px solid',
    borderRadius: 4,
    fontSize:     10,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'all 0.1s',
  },
  statusRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        7,
    flexWrap:   'wrap',
    minHeight:  22,
  },
};
