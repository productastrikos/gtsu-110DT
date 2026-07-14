/**
 * flightSimulator.ts
 * Generates a complete post-flight dataset: 50–100 hours of GTSU-110 operation
 * containing many 40s start cycles, fault distribution, improvement suggestions.
 *
 * Deterministic given a seed so simulations are reproducible.
 */

import type {
  StartCycle,
  CycleTraceSample,
  FlightRecord,
  CycleStatus,
  FaultReason,
  ComponentWearRecord,
  ComponentCategory,
  SandboxInputs,
  SandboxOutputs,
  StartPhase,
} from '../types/engine';

// ── Deterministic PRNG (mulberry32) ─────────────────────────────────────────

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_NGG_RPM = 22000;
const NOMINAL_CYCLE_SEC = 40;

// ── Cycle generator ─────────────────────────────────────────────────────────

interface CycleSeed {
  cycleNumber: number;
  flightHour:  number;
  rng:         () => number;
  wearFactor:  number;          // 0..1 — accumulated wear during flight
  oat:         number;
}

function classifyPhase(t: number, durationSec: number): StartPhase {
  const r = t / durationSec;
  if (r < 0.15) return 'cranking';
  if (r < 0.32) return 'light-up';
  if (r < 0.65) return 'acceleration';
  return 'self-sustaining';
}

function generateCycle(seed: CycleSeed): StartCycle {
  const { rng, wearFactor, oat } = seed;

  // ── Pick fault probability driven by wear + small randomness ──
  const rawFaultRoll = rng();
  // Base 4 % degraded + (wearFactor × 18 %) → faulty/aborted
  let status: CycleStatus = 'success';
  let faultReason: FaultReason | undefined;
  let improvement: string | undefined;

  const wearBoost = wearFactor * 0.18;
  if (rawFaultRoll < 0.02 + wearBoost * 0.25) {
    status = 'aborted';
    faultReason = rng() < 0.5 ? 'hot-start' : 'compressor-stall';
  } else if (rawFaultRoll < 0.05 + wearBoost * 0.55) {
    status = 'faulty';
    const r = rng();
    faultReason = r < 0.25 ? 'hung-start'
                : r < 0.45 ? 'fuel-overshoot'
                : r < 0.65 ? 'hot-start'
                : r < 0.85 ? 'sensor-drift'
                :            'high-vibration';
  } else if (rawFaultRoll < 0.18 + wearBoost) {
    status = 'degraded';
    const r = rng();
    faultReason = r < 0.4 ? 'slow-light-up'
                : r < 0.7 ? 'fuel-overshoot'
                :           'sensor-drift';
  }

  // ── Build telemetry trace ──────────────────────────────────
  const trace: CycleTraceSample[] = [];

  const durationSec =
    status === 'aborted' ? 18 + Math.floor(rng() * 8) :
    status === 'faulty'  ? NOMINAL_CYCLE_SEC + 8 + Math.floor(rng() * 6) :
    status === 'degraded'? NOMINAL_CYCLE_SEC + 2 + Math.floor(rng() * 4) :
                           NOMINAL_CYCLE_SEC;

  // Per-cycle slight bias based on wear (slower ramp, hotter)
  const wearTempBias  = wearFactor * 35;   // °C
  const wearSpeedBias = wearFactor * -2.5; // % Ngg slope reduction
  const wearFuelBias  = wearFactor * 0.4;  // kg/h

  for (let t = 0; t <= durationSec; t++) {
    const ramp = t / NOMINAL_CYCLE_SEC;
    const phase = classifyPhase(t, NOMINAL_CYCLE_SEC);

    // ── Base nominal curves ──────────────────────────────────
    let nggPct = Math.min(95, 5 + 90 * (1 - Math.exp(-ramp * 2.4)));
    let jpt1   = Math.min(870, 60 + 780 * Math.pow(ramp, 0.7));
    let p2p1   = 3.78 + ramp * 0.08 + (rng() - 0.5) * 0.02;
    let fuel   = 1.2 + ramp * 6.6 + (rng() - 0.5) * 0.2;
    let vib    = 0.8 + ramp * 1.2 + (rng() - 0.5) * 0.15;

    // ── Wear effects ─────────────────────────────────────────
    nggPct += wearSpeedBias * ramp;
    jpt1   += wearTempBias  * ramp;
    fuel   += wearFuelBias  * ramp;

    // ── Status-specific overlays ────────────────────────────
    if (status === 'aborted' && faultReason === 'hot-start' && t >= durationSec - 4) {
      jpt1 = 905 + (durationSec - t) * 4;
      nggPct *= 0.7;
    }
    if (status === 'aborted' && faultReason === 'compressor-stall' && t >= durationSec - 5) {
      p2p1 = Math.max(2.9, p2p1 - 0.6);
      nggPct *= 0.55;
      vib += 4;
    }
    if (status === 'faulty' && faultReason === 'hung-start' && ramp > 0.5) {
      nggPct = Math.min(nggPct, 55 + (ramp - 0.5) * 4);   // stalls below self-sustain
      fuel  += 1.4;
      jpt1  += 60;
    }
    if (status === 'faulty' && faultReason === 'hot-start' && ramp > 0.3) {
      jpt1 = Math.min(960, jpt1 + 110 * (ramp - 0.3));
    }
    if (status === 'faulty' && faultReason === 'fuel-overshoot') {
      fuel += 2.1 * Math.sin(ramp * Math.PI);
      jpt1 += 40;
    }
    if (status === 'faulty' && faultReason === 'sensor-drift') {
      jpt1 += 80 * Math.sin(ramp * 6);
    }
    if (status === 'faulty' && faultReason === 'high-vibration' && ramp > 0.4) {
      vib += 6 + 4 * Math.sin(ramp * 12);
    }
    if (status === 'degraded' && faultReason === 'slow-light-up') {
      nggPct *= 0.92;
      jpt1 *= 0.95;
    }
    if (status === 'degraded' && faultReason === 'fuel-overshoot') {
      fuel *= 1.1;
    }

    trace.push({
      t,
      jpt1:      Number(jpt1.toFixed(1)),
      ngg:       Math.round((nggPct / 100) * MAX_NGG_RPM),
      nggPct:    Number(nggPct.toFixed(2)),
      p2p1:      Number(p2p1.toFixed(3)),
      fuelFlow:  Number(fuel.toFixed(2)),
      stepperPos: Math.round(Math.max(0, Math.min(255, (fuel / 10) * 255))),
      vibration: Number(Math.max(0, vib).toFixed(2)),
      oat:       Number(oat.toFixed(1)),
      secuHealthy: !(status === 'faulty' && faultReason === 'sensor-drift'),
      bitPass:   !(status === 'faulty' && faultReason === 'sensor-drift') && status !== 'aborted',
      milBusWord: (status === 'faulty' && faultReason === 'sensor-drift') ? 0x0410
                : status === 'faulty'   ? 0x0010
                : status === 'degraded' ? 0x0008
                : 0x0000,
      phase,
    });
  }

  // ── Aggregate metrics ──────────────────────────────────────
  const peakJpt1   = Math.max(...trace.map(p => p.jpt1));
  const maxNggPct  = Math.max(...trace.map(p => p.nggPct));
  const minP2p1    = Math.min(...trace.map(p => p.p2p1));
  const fuelUsedKg = Number(trace.reduce((acc, p) => acc + p.fuelFlow / 3600, 0).toFixed(3));
  const tSustainPt = trace.find(p => p.nggPct >= 57.4);
  const timeToSelfSustaining = tSustainPt?.t ?? durationSec;

  // ── Composite efficiency (0..100) ─────────────────────────
  const tempPenalty   = Math.max(0, (peakJpt1 - 820) / 80) * 25;
  const sustainPenalty = Math.max(0, (timeToSelfSustaining - 26) / 14) * 20;
  const fuelPenalty   = Math.max(0, (fuelUsedKg - 0.062) / 0.025) * 15;
  const abortPenalty  = status === 'aborted' ? 60 : status === 'faulty' ? 30 : status === 'degraded' ? 12 : 0;
  const efficiency = Math.max(5, 100 - tempPenalty - sustainPenalty - fuelPenalty - abortPenalty);

  // ── Improvement suggestion ─────────────────────────────────
  if (faultReason) {
    improvement = improvementForFault(faultReason);
  } else if (efficiency < 80) {
    improvement = 'Tune fuel schedule between 8-22s to flatten TGT peak; expected 3-6 % SFC gain.';
  }

  return {
    id:                   `cyc-${seed.cycleNumber}-${Math.floor(rng() * 1e6)}`,
    cycleNumber:          seed.cycleNumber,
    flightHour:           Number(seed.flightHour.toFixed(2)),
    durationSec,
    status,
    faultReason,
    improvement,
    peakJpt1:             Number(peakJpt1.toFixed(1)),
    maxNggPct:            Number(maxNggPct.toFixed(2)),
    minP2p1:              Number(minP2p1.toFixed(3)),
    fuelUsedKg,
    timeToSelfSustaining,
    efficiency:           Number(efficiency.toFixed(1)),
    trace,
  };
}

function improvementForFault(reason: FaultReason): string {
  switch (reason) {
    case 'hot-start':         return 'Reduce stepper position at light-up by ~6 steps. Inspect fuel nozzle spray pattern; verify SECU schedule trim.';
    case 'hung-start':        return 'Increase fuel flow ramp between 12-24s by 8 %. Inspect igniters and starter current. Check compressor inlet for blockage.';
    case 'slow-light-up':     return 'Advance igniter timing 0.4s; verify P2/P1 above 3.50 before fuel command. Borescope combustor.';
    case 'fuel-overshoot':    return 'Calibrate LVDT feedback on metering valve. Rate-limit stepper command above 6 kg/h.';
    case 'compressor-stall':  return 'Open IGV by 2°. Inspect blades for FOD. Limit Ngg ramp above 80 %.';
    case 'sensor-drift':      return 'Swap TGT thermocouple. Run channel calibration. Verify connector resistance.';
    case 'high-vibration':    return 'Bearing run-out check; rotor balance. Inspect turbine tip clearance.';
  }
}

// ── Flight generator ────────────────────────────────────────────────────────

export interface FlightSimOptions {
  durationHrs: number;        // 50..100
  seed?:       number;
  // Average ground starts per flight hour. Real GTSUs cycle a lot during testing
  cyclesPerHour?: number;     // default 3
  // Wear baseline (0..1) before this flight starts (carried across flights)
  startingWear?: number;
}

export function simulateFlight(opts: FlightSimOptions): FlightRecord {
  const {
    durationHrs,
    seed = Math.floor(Math.random() * 1e9),
    cyclesPerHour = 3,
    startingWear = 0,
  } = opts;

  const rng = makeRng(seed);
  const totalCycles = Math.max(20, Math.round(durationHrs * cyclesPerHour));
  const cycles: StartCycle[] = [];

  for (let i = 0; i < totalCycles; i++) {
    const hour = (i / totalCycles) * durationHrs;
    // Wear accumulates linearly across the flight on top of startingWear
    const wearFactor = Math.min(1, startingWear + (i / totalCycles) * 0.6);
    const oat = 12 + Math.sin(hour * 0.3) * 8 + (rng() - 0.5) * 4;
    cycles.push(generateCycle({
      cycleNumber: i + 1,
      flightHour:  hour,
      rng,
      wearFactor,
      oat,
    }));
  }

  const successCount  = cycles.filter(c => c.status === 'success').length;
  const degradedCount = cycles.filter(c => c.status === 'degraded').length;
  const faultyCount   = cycles.filter(c => c.status === 'faulty').length;
  const abortCount    = cycles.filter(c => c.status === 'aborted').length;
  const totalFuelKg   = Number(cycles.reduce((a, c) => a + c.fuelUsedKg, 0).toFixed(2));
  const avgEfficiency = Number((cycles.reduce((a, c) => a + c.efficiency, 0) / cycles.length).toFixed(1));
  const avgCycleSec   = Number((cycles.reduce((a, c) => a + c.durationSec, 0) / cycles.length).toFixed(1));

  // Estimated improvement potential: if every degraded/faulty/aborted cycle
  // gained back 18 % efficiency on average, the fleet-mean would lift by:
  const improvable = degradedCount + faultyCount + abortCount;
  const improvementPotPct = Number(((improvable / cycles.length) * 18).toFixed(1));

  return {
    id:                `flight-${seed}`,
    startTime:         new Date(),
    durationHrs,
    cycles,
    totalFuelKg,
    successCount,
    degradedCount,
    faultyCount,
    abortCount,
    avgEfficiency,
    avgCycleSec,
    improvementPotPct,
  };
}

// ── Component wear accumulation ─────────────────────────────────────────────

interface ComponentSpec {
  id:               string;
  name:             string;
  category:         ComponentCategory;
  designLifeCycles: number;
  designLifeHrs:    number;
  primaryStressor:  string;
  // weight: how much this component is stressed by each cycle (1.0 = nominal)
  cycleStressWeight: number;
  // additional wear added per faulty event involving its category
  faultMultiplier:   number;
}

const COMPONENTS: ComponentSpec[] = [
  { id: 'hpt-blades',      name: 'HP Turbine Blades',  category: 'turbine',      designLifeCycles: 3500, designLifeHrs: 2400, primaryStressor: 'Thermal cycling + creep', cycleStressWeight: 1.3, faultMultiplier: 2.6 },
  { id: 'combustor-liner', name: 'Combustor Liner',    category: 'combustor',    designLifeCycles: 4200, designLifeHrs: 3000, primaryStressor: 'Hot-spot oxidation',      cycleStressWeight: 1.15, faultMultiplier: 2.2 },
  { id: 'hp-compressor',   name: 'HP Compressor Stage 3', category: 'compressor', designLifeCycles: 5000, designLifeHrs: 4000, primaryStressor: 'Fouling + erosion',     cycleStressWeight: 1.0, faultMultiplier: 1.6 },
  { id: 'fuel-nozzles',    name: 'Fuel Nozzle Set',    category: 'fuel-system',  designLifeCycles: 4500, designLifeHrs: 3500, primaryStressor: 'Coking + spray drift',    cycleStressWeight: 0.9, faultMultiplier: 1.8 },
  { id: 'secu-main',       name: 'SECU Main Board',    category: 'control-unit', designLifeCycles: 8000, designLifeHrs: 6000, primaryStressor: 'Thermal+EMI fatigue',     cycleStressWeight: 0.4, faultMultiplier: 1.2 },
  { id: 'turbine-bearing', name: 'Turbine Bearing',    category: 'bearing',      designLifeCycles: 6000, designLifeHrs: 4500, primaryStressor: 'Vibration + load',        cycleStressWeight: 0.85, faultMultiplier: 1.9 },
];

export function accumulateWear(
  prevWear: ComponentWearRecord[] | null,
  flights: FlightRecord[],
): ComponentWearRecord[] {
  return COMPONENTS.map(spec => {
    const prev = prevWear?.find(p => p.id === spec.id);
    let consumedCycles = prev?.consumedCycles ?? 0;
    let consumedHrs    = prev?.consumedHrs    ?? 0;

    for (const flight of flights) {
      consumedHrs += flight.durationHrs;

      for (const c of flight.cycles) {
        // Nominal wear from a clean cycle
        let cycleWear = spec.cycleStressWeight;

        // Add fault-driven wear (category-matched)
        if (c.status !== 'success') {
          const matches =
            (c.faultReason === 'hot-start'         && (spec.category === 'turbine' || spec.category === 'combustor')) ||
            (c.faultReason === 'hung-start'        && (spec.category === 'fuel-system' || spec.category === 'combustor')) ||
            (c.faultReason === 'compressor-stall' && spec.category === 'compressor') ||
            (c.faultReason === 'fuel-overshoot'   && spec.category === 'fuel-system') ||
            (c.faultReason === 'high-vibration'   && spec.category === 'bearing') ||
            (c.faultReason === 'sensor-drift'     && spec.category === 'control-unit') ||
            (c.faultReason === 'slow-light-up'    && spec.category === 'combustor');
          if (matches) cycleWear *= spec.faultMultiplier;
        }

        // Hot starts always punish thermals
        if (c.peakJpt1 > 900 && (spec.category === 'turbine' || spec.category === 'combustor')) {
          cycleWear *= 1.4;
        }

        consumedCycles += cycleWear;
      }
    }

    const wearByCycles = consumedCycles / spec.designLifeCycles;
    const wearByHrs    = consumedHrs    / spec.designLifeHrs;
    const wearPct      = Math.min(100, Math.max(wearByCycles, wearByHrs) * 100);

    const remainingFraction = Math.max(0, 1 - wearPct / 100);
    const remainingLifeHrs  = spec.designLifeHrs * remainingFraction;

    const failureRisk = Math.min(100,
      wearPct > 90 ? 90 + (wearPct - 90) * 1.0 :
      wearPct > 70 ? 40 + (wearPct - 70) * 2.5 :
      wearPct > 50 ? 12 + (wearPct - 50) * 1.4 :
                     Math.max(0, wearPct - 20) * 0.6,
    );

    return {
      id:               spec.id,
      name:             spec.name,
      category:         spec.category,
      designLifeCycles: spec.designLifeCycles,
      designLifeHrs:    spec.designLifeHrs,
      consumedCycles:   Number(consumedCycles.toFixed(1)),
      consumedHrs:      Number(consumedHrs.toFixed(2)),
      wearPct:          Number(wearPct.toFixed(2)),
      remainingLifeHrs: Number(remainingLifeHrs.toFixed(0)),
      failureRisk:      Number(failureRisk.toFixed(1)),
      primaryStressor:  spec.primaryStressor,
    };
  });
}

// ── Sandbox (Performance Optimization) ──────────────────────────────────────

/**
 * Compute SFC + power from input parameters using a simplified turbine model.
 * Inputs: fuel flow, blade angle (IGV-equivalent), RPM target %.
 */
export function simulateSandbox(inputs: SandboxInputs): SandboxOutputs {
  const { fuelFlowKgH, bladeAngleDeg, rpmTargetPct, oat = 15 } = inputs;

  // Normalized inputs
  const fuel = Math.max(0.5, fuelFlowKgH);
  const igv  = bladeAngleDeg;
  const rpm  = Math.max(40, Math.min(110, rpmTargetPct));

  // ── Compressor efficiency vs IGV ─────────────────────────────
  // Peak at 0°, drops parabolically as |igv| grows
  const compEff = Math.max(0.55, 0.86 - Math.pow(igv / 14, 2) * 0.25);

  // ── Ambient correction (OAT → air density ratio) ─────────────
  // ISA std day = 15°C = 288.15 K; density ∝ 1/T at constant pressure
  const ambientK    = oat + 273.15;
  const densityCorr = Math.sqrt(288.15 / ambientK);   // √(T_std/T_oat)

  // ── Mass flow scales with RPM, IGV opening and density ───────
  const mDotAir = (rpm / 100) * (1 + igv / 60) * 1.6 * densityCorr;  // kg/s

  // ── Turbine inlet temperature (TIT) rises with fuel-air ratio ──
  const fuelAirRatio = (fuel / 3600) / Math.max(0.5, mDotAir);
  const tit = 280 + fuelAirRatio * 35000;                   // °C (rough)
  const jpt1Peak = tit * 0.72 + 60;                          // jet-pipe downstream of HPT

  // ── Power output ─────────────────────────────────────────────
  // Brayton-like: power ∝ mDot × cp × ΔT × η_overall
  const cp = 1.005;                  // kJ/(kg·K)
  const deltaT  = Math.max(0, tit + 273 - ambientK);
  const etaCycle = compEff * 0.84;   // include turbine + mech eff
  const powerKW  = Math.max(0, mDotAir * cp * deltaT * etaCycle * 0.18);

  // ── SFC = fuel mass per energy ───────────────────────────────
  const sfcKgPerKWh = powerKW > 0 ? fuel / powerKW : 99;

  // ── Surge margin & thermal stress ────────────────────────────
  const surgeMargin = Math.max(0, 28 - Math.pow(Math.max(0, rpm - 95), 1.4) - Math.max(0, igv) * 0.6);
  const thermalStressIdx = Math.max(0, Math.min(100, (jpt1Peak - 700) / 3));

  // ── Feasibility ───────────────────────────────────────────────
  const warnings: string[] = [];
  if (jpt1Peak > 900) warnings.push('TGT peak exceeds 900 °C ground limit — hot-start risk.');
  if (surgeMargin < 6) warnings.push('Surge margin below safe threshold (<6 %) — compressor stall possible.');
  if (sfcKgPerKWh > 0.95) warnings.push('SFC above 0.95 kg/kWh — uneconomical regime.');
  if (rpm > 105) warnings.push('RPM above 105 % over-speed limit.');
  if (fuel > 9.5) warnings.push('Fuel flow above hardware envelope (>9.5 kg/h).');
  if (oat > 40) warnings.push(`High OAT (${oat.toFixed(0)} °C) — reduced air density; elevated TGT and lower surge margin expected.`);
  if (oat < -30) warnings.push(`Low OAT (${oat.toFixed(0)} °C) — cold-soak start; verify oil temperature and gearbox readiness.`);
  const feasible = warnings.length === 0;

  return {
    powerKW:          Number(powerKW.toFixed(2)),
    sfcKgPerKWh:      Number(sfcKgPerKWh.toFixed(4)),
    jpt1PeakC:        Number(jpt1Peak.toFixed(1)),
    surgeMargin:      Number(surgeMargin.toFixed(2)),
    thermalStressIdx: Number(thermalStressIdx.toFixed(1)),
    feasible,
    warnings,
  };
}

export const SANDBOX_BASELINE: SandboxInputs = {
  fuelFlowKgH:   6.4,
  bladeAngleDeg: 0,
  rpmTargetPct:  92,
  oat:           15,   // ISA standard day
};

// ── Fault reason → human label ──────────────────────────────────────────────

export const FAULT_LABELS: Record<FaultReason, string> = {
  'hot-start':         'Hot Start (TGT exceedance)',
  'hung-start':        'Hung Start (Ngg stall)',
  'slow-light-up':     'Slow Light-Up',
  'fuel-overshoot':    'Fuel Schedule Overshoot',
  'compressor-stall':  'Compressor Stall',
  'sensor-drift':      'Sensor Drift',
  'high-vibration':    'High Vibration Event',
};
