/**
 * engineDerived.ts
 * Turboshaft (GTSU-110) derived quantities computed for DISPLAY from a single
 * CycleTraceSample. This is a UI-only layer — no stored data field is renamed;
 * the twin simply presents the engine using correct turboshaft terminology.
 *
 * Engine architecture presented (free-turbine turboshaft):
 *   Inlet ─▶ Compressor ─▶ Combustor ─▶ HP (gas-generator) Turbine ─▶
 *           Power / Free Turbine ─▶ Exhaust
 *
 *   • N1  = Gas-Generator spool speed  (compressor + HP turbine)  ← existing Ngg
 *   • N2  = Power / Free Turbine speed (output shaft)             ← derived here
 *
 * Temperature stations (K unless suffixed °C):
 *   T1 = inlet (ambient / OAT)
 *   T2 = compressor outlet
 *   T4 = combustor exit  (TIT — turbine inlet temperature, virtual)
 *   T5 = inter-turbine   (measured TGT — between HP turbine and power turbine)
 *   T6 = exhaust         (after power turbine)
 *
 * NOTE: the hot-section temperature is labelled **TGT** (Turbine Gas Temperature),
 * NOT "JPT" — a jet-pipe term that does not apply to a turboshaft/GTSU.
 */

import type { CycleTraceSample } from '../types/engine';

// ── Reference constants ─────────────────────────────────────────────────────
export const MAX_NGG_RPM   = 22000;   // N1 gas-generator governed reference
export const MAX_NPT_RPM   = 33000;   // N2 power/free-turbine governed reference
export const NOMINAL_P2P1  = 3.86;    // design compressor pressure ratio
export const LIGHTUP_RPM   = 12625;   // N1 self-sustain / light-up (57.4 %)
export const SELF_SUSTAIN_PCT = 57.4;

export const GROUND_TGT_LIMIT = 900;  // °C ground-start ceiling
export const FLIGHT_TGT_LIMIT = 1020; // °C in-flight ceiling

// Thermodynamic constants
const GAMMA_AIR = 1.4;
const ETA_C     = 0.82;   // compressor isentropic efficiency
const CP_AIR    = 1.005;  // kJ/(kg·K)
const CP_GAS    = 1.148;  // kJ/(kg·K)
const ETA_MECH  = 0.98;   // gas-generator mechanical efficiency

// ── Canonical hot-section temperature label ─────────────────────────────────
export const TGT_LABEL = 'TGT';
export const TGT_LONG  = 'Turbine Gas Temperature';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── N2 — Power / Free Turbine speed (derived) ───────────────────────────────
// The free turbine only develops speed once the gas generator produces surplus
// gas power (beyond that needed to drive the compressor), i.e. after light-up.
export interface ShaftSpeed { pct: number; rpm: number; }

export function deriveN2(frame: CycleTraceSample): ShaftSpeed {
  const nggPct = clamp(frame.nggPct, 0, 110);
  const spool  = Math.max(0, nggPct - 28) / 60;         // begins ≈ 28 % N1
  const pct    = Math.min(104, 102 * (1 - Math.exp(-spool * 2.4)));
  const rpm    = Math.round((pct / 100) * MAX_NPT_RPM);
  return { pct: Number(pct.toFixed(1)), rpm };
}

export function deriveN1(frame: CycleTraceSample): ShaftSpeed {
  return { pct: Number(frame.nggPct.toFixed(1)), rpm: frame.ngg };
}

// ── Temperature stations (T1..T6) ───────────────────────────────────────────
export interface TempStations {
  T1c: number; T2c: number; T4c: number; T5c: number; T6c: number;   // °C
  T1: number;  T2: number;  T4: number;  T5: number;  T6: number;    // K
}

export function deriveTempStations(frame: CycleTraceSample): TempStations {
  const T1c = frame.oat;
  const T1  = T1c + 273.15;

  // Compressor outlet from isentropic compression with efficiency (γ=1.4)
  const pr  = Math.max(1, frame.p2p1);
  const T2  = T1 * (1 + (Math.pow(pr, (GAMMA_AIR - 1) / GAMMA_AIR) - 1) / ETA_C);

  // Inter-turbine (measured TGT) — between HP turbine and power turbine
  const T5  = frame.jpt1 + 273.15;

  // Combustor exit (TIT) from the HP-turbine ↔ compressor work balance:
  //   cp_gas·(T4−T5) = cp_air·(T2−T1) / η_mech
  const dtHPT = (CP_AIR / CP_GAS / ETA_MECH) * (T2 - T1);
  const T4    = T5 + dtHPT;

  // Power-turbine expansion — extraction scales with N2 loading
  const n2    = deriveN2(frame).pct / 100;
  const dtPT  = 0.30 * Math.max(0, T5 - T1) * (0.4 + 0.6 * n2);
  const T6    = Math.max(T1, T5 - dtPT);

  return {
    T1c, T2c: T2 - 273.15, T4c: T4 - 273.15, T5c: frame.jpt1, T6c: T6 - 273.15,
    T1, T2, T4, T5, T6,
  };
}

// ── Per-section inlet/outlet temperature ratios (absolute K) ─────────────────
export interface SectionRatio {
  key:   string;
  label: string;
  ratio: number;      // outlet-relative ratio (see below), absolute-temperature based
  inC:   number;      // inlet °C
  outC:  number;      // outlet °C
  inLabel:  string;
  outLabel: string;
}

export function deriveSectionRatios(frame: CycleTraceSample): SectionRatio[] {
  const s = deriveTempStations(frame);
  return [
    {
      key: 'compressor', label: 'Compressor',
      ratio: s.T2 / s.T1, inC: s.T1c, outC: s.T2c,
      inLabel: 'T1 inlet', outLabel: 'T2 outlet',
    },
    {
      key: 'hp-turbine', label: 'HP (Gas-Gen) Turbine',
      ratio: s.T4 / s.T5, inC: s.T4c, outC: s.T5c,
      inLabel: 'T4 TIT', outLabel: 'T5 TGT',
    },
    {
      key: 'power-turbine', label: 'Power / Free Turbine',
      ratio: s.T5 / s.T6, inC: s.T5c, outC: s.T6c,
      inLabel: 'T5 TGT', outLabel: 'T6 exhaust',
    },
  ];
}

// ── P2/P1 normal-vs-current helper ──────────────────────────────────────────
export interface PressureCompare {
  current: number;
  nominal: number;
  deltaPct: number;      // % deviation from nominal
  status: 'good' | 'warn' | 'bad';
}

export function comparePressureRatio(frame: CycleTraceSample): PressureCompare {
  const current = frame.p2p1;
  const nominal = NOMINAL_P2P1;
  const deltaPct = ((current - nominal) / nominal) * 100;
  const abs = Math.abs(deltaPct);
  // During cranking (low N1) low PR is expected — don't flag it
  const status: 'good' | 'warn' | 'bad' =
    frame.nggPct < 40 ? 'good' :
    abs > 12 ? 'bad' :
    abs > 6  ? 'warn' : 'good';
  return { current, nominal, deltaPct: Number(deltaPct.toFixed(1)), status };
}

// ── Physics / calculation reference (shown on-screen "in paper") ─────────────
export interface FormulaEntry {
  symbol:  string;
  name:    string;
  formula: string;
  note:    string;
}

export const ENGINE_FORMULAS: FormulaEntry[] = [
  {
    symbol: 'N1',
    name:   'Gas-Generator speed',
    formula: 'N1% = (ω_gg / ω_max) × 100 ;  N1_RPM = N1% /100 × 22 000',
    note:   'HP spool — compressor + HP (gas-generator) turbine. Self-sustains ≥ 57.4 %.',
  },
  {
    symbol: 'N2',
    name:   'Power / Free-Turbine speed',
    formula: 'N2% = 102 · (1 − e^(−2.4·s)),  s = max(0, N1%−28)/60 ;  N2_RPM = N2%/100 × 33 000',
    note:   'Free turbine spools up after the gas generator develops surplus gas power.',
  },
  {
    symbol: 'T2',
    name:   'Compressor outlet temp',
    formula: 'T2 = T1 · [ 1 + ( (P2/P1)^((γ−1)/γ) − 1 ) / η_c ] ,  γ = 1.4, η_c = 0.82',
    note:   'Isentropic compression from inlet (T1 = OAT) with compressor efficiency.',
  },
  {
    symbol: 'T4',
    name:   'Combustor exit temp (TIT)',
    formula: 'T4 = T5 + (cp_air / cp_gas / η_m) · (T2 − T1)',
    note:   'From HP-turbine ↔ compressor work balance (cp_air=1.005, cp_gas=1.148).',
  },
  {
    symbol: 'T5',
    name:   'Inter-turbine temp (TGT)',
    formula: 'T5 = TGT_measured  (between HP turbine and power turbine)',
    note:   'The measured hot-section temperature. Limits: 900 °C ground / 1020 °C flight.',
  },
  {
    symbol: 'T6',
    name:   'Exhaust temp',
    formula: 'T6 = T5 − 0.30 · (T5 − T1) · (0.4 + 0.6·N2frac)',
    note:   'Power-turbine expansion — extraction scales with N2 loading.',
  },
  {
    symbol: 'RC',
    name:   'Section temperature ratios',
    formula: 'Compressor T2/T1 · HP-turbine T4/T5 · Power-turbine T5/T6  (absolute K)',
    note:   'Inlet/outlet ratio across each section — must use absolute temperature.',
  },
  {
    symbol: 'P2/P1',
    name:   'Compressor pressure ratio',
    formula: 'ΔP% = (P2/P1 − 3.86) / 3.86 × 100',
    note:   'Deviation of current pressure ratio from the 3.86 design nominal.',
  },
  {
    symbol: 'ṁf',
    name:   'Fuel mass flow',
    formula: 'ṁf = ṁf_max · (stepperPos / 255)^1.15 ,  ṁf_max = 10 kg/h',
    note:   'Metering-valve needle characteristic (nonlinear near full open).',
  },
];
