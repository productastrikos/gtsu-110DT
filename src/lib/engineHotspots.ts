/**
 * engineHotspots.ts
 * Page-specific hotspot builders for EngineModel3D.
 *
 * Each builder takes the data relevant to its page and emits a list of
 * EngineHotspot records (positioned around the engine, severity-colored).
 *
 * Thresholds (default — refine later if needed):
 *   < 40 %  → good
 *   40-70 % → warn
 *   70-90 % → orange (degraded)
 *   > 90 %  → bad (critical)
 */

import type { EngineHotspot, HotspotSeverity, SectionKey } from '../components/EngineModel3D';
import type {
  ComponentWearRecord,
  FlightRecord,
  CycleTraceSample,
  StartCycle,
  SandboxInputs,
  SandboxOutputs,
} from '../types/engine';

// ── Which engine section each component belongs to ──────────────────────
// The twin is hovered by pointing at the GEOMETRY itself, so every component
// must declare the section it lives in — that is what the raycast resolves to.
// (There are no marker positions any more: components are no longer placed by
// hand in space, they are found by hovering the hardware.)
//
//   fuel-nozzles  → combustor    : the nozzles spray into the combustor can
//   hpt-blades    → gas-gen turbine : "HP turbine" = the gas-generator turbine
//   turbine-bearing → power turbine : the rear bearing carries the free turbine
//   secu-main     → inlet        : on a PT6C the accessory case and its control
//                                  unit sit at the REAR, alongside the air inlet
export const HOTSPOT_SECTION: Record<string, SectionKey> = {
  'hp-compressor':   'compressor',
  'fuel-nozzles':    'combustor',
  'combustor-liner': 'combustor',
  'hpt-blades':      'gas-gen-turbine',
  'turbine-bearing': 'power-turbine',
  'secu-main':       'inlet',
};

const SHORT_LABEL: Record<string, string> = {
  'hp-compressor':   'HP Compressor',
  'fuel-nozzles':    'Fuel Nozzles',
  'combustor-liner': 'Combustor',
  'hpt-blades':      'HP Turbine',
  'turbine-bearing': 'Bearing',
  'secu-main':       'SECU',
};

// ── Generic threshold helper ────────────────────────────────────────────

export function severityFromPct(pct: number): HotspotSeverity {
  if (pct >= 90) return 'bad';
  if (pct >= 70) return 'orange';
  if (pct >= 40) return 'warn';
  return 'good';
}

function ratioSev(value: number, min: number, max: number, inverted = false): HotspotSeverity {
  // Map value into 0..100 of (min..max); inverted means low value = bad.
  const clamped = Math.max(min, Math.min(max, value));
  const pct = ((clamped - min) / (max - min)) * 100;
  return severityFromPct(inverted ? 100 - pct : pct);
}

// ── Post-Flight Analysis hotspots ──────────────────────────────────────
// Driven by accumulated wear AND fault-distribution from the latest flight.

export function buildPostFlightHotspots(
  wear:           ComponentWearRecord[],
  latestFlight:   FlightRecord | null,
  prevFlightWear: ComponentWearRecord[] | null,
): EngineHotspot[] {
  if (!wear.length) return [];

  // Count fault categories in the latest flight (for the secondary metric line)
  const faultCounts: Record<string, number> = {};
  if (latestFlight) {
    for (const c of latestFlight.cycles) {
      if (c.faultReason) faultCounts[c.faultReason] = (faultCounts[c.faultReason] ?? 0) + 1;
    }
  }

  return wear.map<EngineHotspot>(w => {
    const severity = severityFromPct(w.wearPct);

    // Delta vs previous flight (if available)
    let delta: string | undefined;
    let deltaTone: 'good' | 'bad' | undefined;
    if (prevFlightWear) {
      const prev = prevFlightWear.find(p => p.id === w.id);
      if (prev) {
        const d = w.wearPct - prev.wearPct;
        if (Math.abs(d) > 0.05) {
          delta = `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
          deltaTone = d > 0 ? 'bad' : 'good';
        }
      }
    }

    // Per-component "this flight" stress note
    const relatedFaults =
      w.id === 'hpt-blades'      ? (faultCounts['hot-start']      ?? 0) :
      w.id === 'combustor-liner' ? (faultCounts['hot-start']      ?? 0) + (faultCounts['slow-light-up'] ?? 0) :
      w.id === 'hp-compressor'   ? (faultCounts['compressor-stall']?? 0) :
      w.id === 'fuel-nozzles'    ? (faultCounts['fuel-overshoot'] ?? 0) + (faultCounts['hung-start']    ?? 0) :
      w.id === 'turbine-bearing' ? (faultCounts['high-vibration'] ?? 0) :
      w.id === 'secu-main'       ? (faultCounts['sensor-drift']   ?? 0) :
                                   0;

    const stressNote = relatedFaults > 0
      ? `${relatedFaults} related fault${relatedFaults > 1 ? 's' : ''} this flight`
      : 'No related faults';

    return {
      id:       w.id,
      section: HOTSPOT_SECTION[w.id],
      label:    SHORT_LABEL[w.id] ?? w.name,
      value:    `${w.wearPct.toFixed(0)}%`,
      metric:   `${w.primaryStressor} · ${w.remainingLifeHrs.toLocaleString()} hrs left · ${stressNote}`,
      severity,
      delta,
      deltaTone,
    };
  });
}

// ── Process Simulator hotspots ─────────────────────────────────────────
// Driven by the CURRENT replay/live frame (live physics).

export function buildSimulatorHotspots(
  frame:    CycleTraceSample | null,
  cycle:    StartCycle | null,
  wear:     ComponentWearRecord[],
): EngineHotspot[] {
  if (!frame) return [];

  const wearOf = (id: string) => wear.find(w => w.id === id)?.wearPct ?? 0;

  // HPT — TGT vs 900°C ground limit / 1020°C flight limit
  const hptSeverity: HotspotSeverity = frame.jpt1 > 1020 ? 'bad' : frame.jpt1 > 900 ? 'orange' : frame.jpt1 > 780 ? 'warn' : 'good';

  // Combustor — light-up presence & TGT thermal gradient
  const combSeverity: HotspotSeverity = frame.jpt1 > 900 ? 'bad' : frame.jpt1 > 850 ? 'orange' : frame.jpt1 > 700 ? 'warn' : 'good';

  // HP Compressor — P2/P1 vs nominal 3.86, fouling detection
  const p2dev = Math.abs(frame.p2p1 - 3.86);
  const compSeverity: HotspotSeverity = p2dev > 0.5 ? 'bad' : p2dev > 0.3 ? 'orange' : p2dev > 0.15 ? 'warn' : 'good';

  // Fuel Nozzles — stepper pos & fuel mass flow vs envelope (9.5 kg/h max)
  const fuelSeverity = ratioSev(frame.fuelFlow, 0, 10);

  // Bearing — vibration (mm/s) rotor dynamic stability
  const vibSeverity: HotspotSeverity = frame.vibration > 11 ? 'bad' : frame.vibration > 8 ? 'orange' : frame.vibration > 4 ? 'warn' : 'good';

  // SECU — BIT status + MIL-STD-1553B bus word
  const secuSeverity: HotspotSeverity =
    !frame.secuHealthy              ? 'bad' :
    !frame.bitPass                  ? 'orange' :
    cycle?.status === 'aborted'     ? 'warn' : 'good';

  // Light-up detection: Ngg > 12,625 RPM
  const lightUpAchieved = frame.ngg > 12625;

  return [
    {
      id: 'hp-compressor',
      section: HOTSPOT_SECTION['hp-compressor'],
      label: SHORT_LABEL['hp-compressor'],
      value: `${frame.p2p1.toFixed(2)}:1`,
      metric: `P2/P1 ratio · nominal 3.86 · compressor fouling / mass flow · wear ${wearOf('hp-compressor').toFixed(0)} %`,
      severity: compSeverity,
    },
    {
      id: 'fuel-nozzles',
      section: HOTSPOT_SECTION['fuel-nozzles'],
      label: SHORT_LABEL['fuel-nozzles'],
      value: `${frame.stepperPos} steps / ${frame.fuelFlow.toFixed(1)} kg/h`,
      metric: `Stepper 0-255 → fuel 0-9.5 kg/h · OAT ${frame.oat.toFixed(0)}°C · wear ${wearOf('fuel-nozzles').toFixed(0)} %`,
      severity: fuelSeverity,
    },
    {
      id: 'combustor-liner',
      section: HOTSPOT_SECTION['combustor-liner'],
      label: SHORT_LABEL['combustor-liner'],
      value: `${frame.jpt1.toFixed(0)}°C`,
      metric: `Combustor outlet · hot-spot 900°C · N1 ${frame.ngg > 12625 ? '✓ lit' : '↑ cranking'} · wear ${wearOf('combustor-liner').toFixed(0)} %`,
      severity: combSeverity,
    },
    {
      id: 'hpt-blades',
      section: HOTSPOT_SECTION['hpt-blades'],
      label: SHORT_LABEL['hpt-blades'],
      value: `${frame.jpt1.toFixed(0)}°C`,
      metric: `TGT · GROUND ≤900°C / FLIGHT ≤1020°C · creep life · N1 ${frame.ngg.toLocaleString()} RPM${lightUpAchieved ? ' ✓' : ''}`,
      severity: hptSeverity,
    },
    {
      id: 'turbine-bearing',
      section: HOTSPOT_SECTION['turbine-bearing'],
      label: SHORT_LABEL['turbine-bearing'],
      value: `${frame.vibration.toFixed(1)} mm/s`,
      metric: `Vibration · rotor stability · limit 11 mm/s · wear ${wearOf('turbine-bearing').toFixed(0)} %`,
      severity: vibSeverity,
    },
    {
      id: 'secu-main',
      section: HOTSPOT_SECTION['secu-main'],
      label: SHORT_LABEL['secu-main'],
      value: frame.secuHealthy ? (frame.bitPass ? 'BIT PASS' : 'BIT FAIL') : 'SECU FAULT',
      metric: `MIL-1553B: 0x${frame.milBusWord.toString(16).toUpperCase().padStart(4, '0')} · IPS nominal · phase: ${frame.phase}`,
      severity: secuSeverity,
    },
  ];
}

// ── Sandbox hotspots ───────────────────────────────────────────────────
// Driven by the CURRENT sandbox inputs/outputs (predictive — what would
// happen if you ran the engine with these parameters).
//
// Each part lights up based on the parameter-derived stress.

export function buildSandboxHotspots(
  inputs:   SandboxInputs,
  outputs:  SandboxOutputs,
  baseline: SandboxOutputs | null,
): EngineHotspot[] {
  // HPT — TGT peak vs 900°C ground / 1020°C flight limit
  const jptSev: HotspotSeverity =
    outputs.jpt1PeakC > 1020 ? 'bad' :
    outputs.jpt1PeakC > 900  ? 'orange' :
    outputs.jpt1PeakC > 800  ? 'warn' : 'good';

  // Combustor — thermal stress index
  const combSev: HotspotSeverity = severityFromPct(outputs.thermalStressIdx);

  // HP Compressor — surge margin (low = bad)
  const surgeSev: HotspotSeverity =
    outputs.surgeMargin < 4  ? 'bad' :
    outputs.surgeMargin < 6  ? 'orange' :
    outputs.surgeMargin < 12 ? 'warn' : 'good';

  // Fuel Nozzles — flow vs envelope
  const fuelSev = ratioSev(inputs.fuelFlowKgH, 0, 10);

  // Bearing — derived from RPM target (over-speed risk)
  const bearingSev: HotspotSeverity =
    inputs.rpmTargetPct > 105 ? 'bad' :
    inputs.rpmTargetPct > 98  ? 'orange' :
    inputs.rpmTargetPct > 95  ? 'warn' : 'good';

  // SECU — feasibility / warnings
  const secuSev: HotspotSeverity = outputs.warnings.length === 0 ? 'good' : outputs.warnings.length > 2 ? 'bad' : 'orange';

  const mkDelta = (current: number, baselineVal: number | undefined, positiveIsBad = true) => {
    if (baselineVal === undefined || Math.abs(current - baselineVal) < 1e-3) return {};
    const d = current - baselineVal;
    const bad = positiveIsBad ? d > 0 : d < 0;
    return {
      delta: `${d > 0 ? '+' : ''}${d.toFixed(Math.abs(d) < 1 ? 2 : 1)}`,
      deltaTone: (bad ? 'bad' : 'good') as 'good' | 'bad',
    };
  };

  return [
    {
      id: 'hp-compressor',
      section: HOTSPOT_SECTION['hp-compressor'],
      label: SHORT_LABEL['hp-compressor'],
      value: `${outputs.surgeMargin.toFixed(1)}% SM`,
      metric: `Surge margin · IGV ${inputs.bladeAngleDeg.toFixed(1)}° · RPM ${inputs.rpmTargetPct.toFixed(0)} %`,
      severity: surgeSev,
      ...mkDelta(outputs.surgeMargin, baseline?.surgeMargin, false),
    },
    {
      id: 'fuel-nozzles',
      section: HOTSPOT_SECTION['fuel-nozzles'],
      label: SHORT_LABEL['fuel-nozzles'],
      value: `${Math.round((inputs.fuelFlowKgH / 10) * 255)} steps / ${inputs.fuelFlowKgH.toFixed(1)} kg/h`,
      metric: `Stepper 0-255 → fuel 0-9.5 kg/h · SFC ${outputs.sfcKgPerKWh.toFixed(3)} kg/kWh`,
      severity: fuelSev,
    },
    {
      id: 'combustor-liner',
      section: HOTSPOT_SECTION['combustor-liner'],
      label: SHORT_LABEL['combustor-liner'],
      value: `${outputs.thermalStressIdx.toFixed(0)} stress`,
      metric: `Thermal-stress index (0-100) — drives combustor liner life`,
      severity: combSev,
      ...mkDelta(outputs.thermalStressIdx, baseline?.thermalStressIdx),
    },
    {
      id: 'hpt-blades',
      section: HOTSPOT_SECTION['hpt-blades'],
      label: SHORT_LABEL['hpt-blades'],
      value: `${outputs.jpt1PeakC.toFixed(0)}°C`,
      metric: `Predicted TGT peak · GROUND ≤900°C / FLIGHT ≤1020°C · creep life consumption`,
      severity: jptSev,
      ...mkDelta(outputs.jpt1PeakC, baseline?.jpt1PeakC),
    },
    {
      id: 'turbine-bearing',
      section: HOTSPOT_SECTION['turbine-bearing'],
      label: SHORT_LABEL['turbine-bearing'],
      value: `${inputs.rpmTargetPct.toFixed(0)}% RPM`,
      metric: `Over-speed limit 105 % · power ${outputs.powerKW.toFixed(1)} kW`,
      severity: bearingSev,
    },
    {
      id: 'secu-main',
      section: HOTSPOT_SECTION['secu-main'],
      label: SHORT_LABEL['secu-main'],
      value: outputs.feasible ? 'BIT PASS' : `${outputs.warnings.length} WARN`,
      metric: (outputs.warnings[0] ?? 'All controls within envelope') + ` · OAT ${inputs.oat ?? 15}°C`,
      severity: secuSev,
    },
  ];
}
