/**
 * useGTSUStore.ts
 * Central state for the 4-page GTSU-110 application.
 *
 * Starts EMPTY. Data appears only after the user runs a flight simulation
 * (Post-Flight Analysis page) or feeds a live frame (Process Simulator).
 *
 * Data flow:
 *   PostFlightAnalysisPage → runFlightSimulation()
 *     ↳ flights[] grows, wear[] is recomputed
 *   ProcessSimulatorPage   → selectCycle() + play/tick/pause replay
 *     OR setLiveMode(true) + pushLiveFrame() for test-rig data
 *   LifeCyclePage          → reads wear[] derived from flights
 *   SandboxPage            → runSandbox() → sandboxRuns[]
 */

import { create } from 'zustand';
import type {
  FlightRecord,
  StartCycle,
  CycleTraceSample,
  ComponentWearRecord,
  SandboxInputs,
  SandboxRun,
  SandboxOutputs,
  BackendFlight,
  LoadedBackendFlight,
} from '../types/engine';
import {
  simulateFlight,
  accumulateWear,
  simulateSandbox,
} from '../lib/flightSimulator';
import { getBackendFlights, getBackendFlight, getFlightTrace, saveFlightToBackend } from '../services/api';

export type ReplaySpeed = 1 | 2 | 5;

interface GTSUStore {
  // ── Persistent data ────────────────────────────────────────────────────
  flights:        FlightRecord[];
  wear:           ComponentWearRecord[];
  sandboxRuns:    SandboxRun[];

  // ── Flight simulation control ──────────────────────────────────────────
  isFlightSimRunning: boolean;
  flightSimProgress:  number;          // 0..1

  // ── Replay state (Process Simulator) ───────────────────────────────────
  selectedCycleId:   string | null;
  isPlaying:         boolean;
  replayElapsedSec:  number;
  replaySpeed:       ReplaySpeed;

  // ── Live telemetry (test-rig ingestion) ────────────────────────────────
  liveMode:    boolean;
  liveFrame:   CycleTraceSample | null;
  liveHistory: CycleTraceSample[];     // last N live frames

  // ── Backend flight DB ──────────────────────────────────────────────────
  backendFlights:       BackendFlight[];
  backendFlightsStatus: 'idle' | 'loading' | 'loaded' | 'error';
  loadedBackendFlight:  LoadedBackendFlight | null;
  loadingFlightId:      number | null;

  // ── Simulation console (video-editor style playback) ──────────────────
  consoleSec:       number;
  consoleSpeed:     number;    // 0.5 | 1 | 2 | 5 | 10 | 50 | 100
  consoleIsPlaying: boolean;

  // ── Actions ────────────────────────────────────────────────────────────
  runFlightSimulation: (durationHrs: number) => Promise<FlightRecord>;
  clearAll:            () => void;
  selectCycle:         (id: string | null) => void;
  playReplay:          () => void;
  pauseReplay:         () => void;
  toggleReplay:        () => void;
  resetReplay:         () => void;
  setReplaySpeed:      (s: ReplaySpeed) => void;
  tickReplay:          () => void;

  setLiveMode:         (live: boolean) => void;
  pushLiveFrame:       (f: CycleTraceSample) => void;

  fetchBackendFlights: () => Promise<void>;
  loadBackendFlight:   (id: number) => Promise<void>;
  clearBackendFlight:  () => void;

  setConsoleSec:       (sec: number) => void;
  setConsoleSpeed:     (speed: number) => void;
  playConsole:         () => void;
  pauseConsole:        () => void;
  tickConsole:         (deltaSec: number) => void;

  runSandbox:          (inputs: SandboxInputs) => SandboxRun;
  clearSandbox:        () => void;
}

const MAX_LIVE_HISTORY = 120;

export const useGTSUStore = create<GTSUStore>((set, get) => ({
  // ── Initial state: EMPTY ────────────────────────────────────────────────
  flights:            [],
  wear:               [],
  sandboxRuns:        [],

  isFlightSimRunning: false,
  flightSimProgress:  0,

  selectedCycleId:    null,
  isPlaying:          false,
  replayElapsedSec:   0,
  replaySpeed:        1,

  liveMode:           false,
  liveFrame:          null,
  liveHistory:        [],

  backendFlights:       [],
  backendFlightsStatus: 'idle',
  loadedBackendFlight:  null,
  loadingFlightId:      null,
  consoleSec:           0,
  consoleSpeed:         1,
  consoleIsPlaying:     false,

  // ── Flight simulation ──────────────────────────────────────────────────
  runFlightSimulation: async (durationHrs: number) => {
    set({ isFlightSimRunning: true, flightSimProgress: 0 });

    // Yield to the event loop so the UI shows the running state, then
    // chunk progress updates so the user sees a quick progress bar.
    const STEPS = 6;
    for (let i = 1; i <= STEPS - 1; i++) {
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      set({ flightSimProgress: i / STEPS });
    }

    const flight = simulateFlight({ durationHrs });
    const allFlights = [...get().flights, flight];
    const wear = accumulateWear(get().wear, [flight]);

    set({
      flights:            allFlights,
      wear,
      isFlightSimRunning: false,
      flightSimProgress:  1,
      selectedCycleId:    pickInterestingCycle(flight),
      replayElapsedSec:   0,
      isPlaying:          false,
    });

    // Fire-and-forget save to backend — silently ignored if backend is offline
    saveFlightToBackend(flight)
      .then(() => {
        // Refresh the flight library so the newly-saved flight appears
        get().fetchBackendFlights();
      })
      .catch(() => { /* backend offline — local simulation still works */ });

    return flight;
  },

  clearAll: () =>
    set({
      flights:           [],
      wear:              [],
      sandboxRuns:       [],
      selectedCycleId:   null,
      replayElapsedSec:  0,
      isPlaying:         false,
      liveMode:          false,
      liveFrame:         null,
      liveHistory:       [],
      flightSimProgress: 0,
      loadedBackendFlight: null,
      consoleSec:          0,
      consoleIsPlaying:    false,
    }),

  // ── Replay (3D Simulator) ──────────────────────────────────────────────
  selectCycle: (id) => set({
    selectedCycleId:  id,
    replayElapsedSec: 0,
    isPlaying:        false,
  }),

  playReplay:  () => set({ isPlaying: true }),
  pauseReplay: () => set({ isPlaying: false }),
  toggleReplay: () => set(s => ({ isPlaying: !s.isPlaying })),
  resetReplay:  () => set({ replayElapsedSec: 0, isPlaying: false }),
  setReplaySpeed: (s) => set({ replaySpeed: s }),

  tickReplay: () => {
    const { selectedCycleId, isPlaying, replayElapsedSec, replaySpeed, flights } = get();
    if (!isPlaying || !selectedCycleId) return;
    const cycle = findCycle(flights, selectedCycleId);
    if (!cycle) return;
    const next = replayElapsedSec + replaySpeed;
    if (next >= cycle.durationSec) {
      set({ replayElapsedSec: cycle.durationSec, isPlaying: false });
    } else {
      set({ replayElapsedSec: next });
    }
  },

  // ── Live telemetry ─────────────────────────────────────────────────────
  setLiveMode: (live) =>
    set({ liveMode: live, isPlaying: false, liveFrame: null, liveHistory: [] }),

  pushLiveFrame: (f) =>
    set(s => ({
      liveFrame: f,
      liveHistory: [...s.liveHistory, f].slice(-MAX_LIVE_HISTORY),
    })),

  // ── Backend flight DB ──────────────────────────────────────────────────
  fetchBackendFlights: async () => {
    set({ backendFlightsStatus: 'loading' });
    try {
      const res = await getBackendFlights();
      set({ backendFlights: res.data, backendFlightsStatus: 'loaded' });
    } catch {
      set({ backendFlightsStatus: 'error' });
    }
  },

  loadBackendFlight: async (id: number) => {
    set({ loadingFlightId: id });
    try {
      const [metaRes, traceRes] = await Promise.all([
        getBackendFlight(id),
        getFlightTrace(id),
      ]);
      const { cycles, ...meta } = metaRes.data;
      set({
        loadedBackendFlight: { meta, cycles, trace: traceRes.data },
        consoleSec:          0,
        consoleIsPlaying:    false,
        loadingFlightId:     null,
      });
    } catch {
      set({ loadingFlightId: null });
      throw new Error(`Failed to load flight ${id}`);
    }
  },

  clearBackendFlight: () =>
    set({ loadedBackendFlight: null, consoleSec: 0, consoleIsPlaying: false }),

  // ── Simulation console ─────────────────────────────────────────────────
  setConsoleSec:   (sec) => set({ consoleSec: sec }),
  setConsoleSpeed: (speed) => set({ consoleSpeed: speed }),
  playConsole:     () => set({ consoleIsPlaying: true }),
  pauseConsole:    () => set({ consoleIsPlaying: false }),

  tickConsole: (deltaSec: number) => {
    const { consoleIsPlaying, consoleSec, loadedBackendFlight } = get();
    if (!consoleIsPlaying || !loadedBackendFlight) return;
    const maxSec = loadedBackendFlight.meta.total_trace_duration_sec;
    const next = consoleSec + deltaSec;
    if (next >= maxSec) {
      set({ consoleSec: maxSec, consoleIsPlaying: false });
    } else {
      set({ consoleSec: next });
    }
  },

  // ── Sandbox ────────────────────────────────────────────────────────────
  runSandbox: (inputs: SandboxInputs) => {
    const outputs: SandboxOutputs = simulateSandbox(inputs);
    const run: SandboxRun = {
      id:        `sbx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      timestamp: new Date(),
      inputs,
      outputs,
    };
    set(s => ({ sandboxRuns: [run, ...s.sandboxRuns].slice(0, 30) }));
    return run;
  },

  clearSandbox: () => set({ sandboxRuns: [] }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function findCycle(flights: FlightRecord[], id: string): StartCycle | undefined {
  for (const f of flights) {
    const c = f.cycles.find(cc => cc.id === id);
    if (c) return c;
  }
  return undefined;
}

function pickInterestingCycle(flight: FlightRecord): string | null {
  if (!flight.cycles.length) return null;
  return (
    flight.cycles.find(c => c.status === 'aborted')?.id ??
    flight.cycles.find(c => c.status === 'faulty')?.id ??
    flight.cycles.find(c => c.status === 'degraded')?.id ??
    flight.cycles[0].id
  );
}

// ── Selectors ────────────────────────────────────────────────────────────

export function getAllCycles(flights: FlightRecord[]): StartCycle[] {
  return flights.flatMap(f => f.cycles);
}

export function getSelectedCycle(state: Pick<GTSUStore, 'flights' | 'selectedCycleId'>): StartCycle | null {
  if (!state.selectedCycleId) return null;
  return findCycle(state.flights, state.selectedCycleId) ?? null;
}

export function getCurrentFrame(state: Pick<GTSUStore, 'flights' | 'selectedCycleId' | 'replayElapsedSec' | 'liveMode' | 'liveFrame'>): CycleTraceSample | null {
  if (state.liveMode) return state.liveFrame;
  const cycle = getSelectedCycle(state);
  if (!cycle) return null;
  const idx = Math.min(cycle.trace.length - 1, Math.max(0, Math.floor(state.replayElapsedSec)));
  return cycle.trace[idx] ?? null;
}
