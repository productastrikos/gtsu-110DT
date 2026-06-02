// GTSU-110 Gas Turbine Starter Engine — Digital Twin Types

export type ThresholdStatus = "critical" | "warning" | "normal";

export type StartPhase =
  | "idle"
  | "cranking"
  | "light-up"
  | "acceleration"
  | "self-sustaining"
  | "abort";

export type StartScenario = "normal" | "hot-start" | "hung-start" | "fouling" | "sensor-drift";

// ─── Core telemetry (mirrors SECU ARINC/MIL-STD-1553B outputs) ─────────────

export interface GTSUTelemetry {
  timestamp: Date;
  /** Jet Pipe Temperature °C — ground limit 900, in-flight 1020 */
  jpt1: number;
  /** Gas Generator Speed RPM — light-up detection > 12625 */
  ngg: number;
  /** Ngg as % of max (≈ 22000 RPM) */
  nggPct: number;
  /** Compressor pressure ratio (P2/P1) — dimensionless */
  p2p1: number;
  /** Outside Air Temperature °C */
  oat: number;
  /** 3-phase stepper motor position (discrete steps 0-255) */
  stepperPosition: number;
  /** Estimated fuel mass flow kg/h derived from stepper */
  fuelMassFlow: number;
  /** SECU main-processor health: true = healthy */
  secuMainHealthy: boolean;
  /** Built-In-Test pass/fail */
  bitPass: boolean;
  /** IPS mode: 0=normal monitoring, 1=emergency shutdown armed, 2=degraded open-loop */
  ipsMode: 0 | 1 | 2;
  /** MIL-STD-1553B bus health 0–100 */
  milBusHealth: number;
  /** ARINC 429 bus health 0–100 */
  arinc429Health: number;
  /** Start sequence duration seconds */
  startDuration: number;
  /** Current phase in the start sequence */
  startPhase: StartPhase;
}

// ─── PHM / Prognostics ───────────────────────────────────────────────────────

export interface GTSUHealthState {
  timestamp: Date;
  starterReadiness: number;
  rul: number;
  rulCycles: number;
  hotStartRisk: number;
  hungStartProbability: number;
  virtualSensorConfidence: number;
}

// ─── Start-sequence time-series ──────────────────────────────────────────────

export interface StartCycleSample {
  t: number;
  ngg: number;
  jpt1: number;
  p2p1: number;
  stepperPos: number;
  fuelFlow: number;
  phase: StartPhase;
  event?: string;
}

// ─── FMEA ────────────────────────────────────────────────────────────────────

export interface FMEAData {
  timestamp: Date;
  componentName: string;
  failureMode: string;
  failureMechanism: string;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  diagnosticSignature: string;
  recommendedAction: string;
  mtbf?: number;
}

// ─── AI / PHM recommendations ───────────────────────────────────────────────

export interface AIRecommendation {
  id: string;
  timestamp: Date;
  recommendationType: "maintenance" | "optimization" | "alert";
  priority: "critical" | "warning" | "info";
  title: string;
  description: string;
  affectedComponent: string;
  confidenceScore: number;
  status: "pending" | "acknowledged" | "resolved";
  detectedCondition?: string;
}

// ─── V&V / Compliance ────────────────────────────────────────────────────────

export interface VVComplianceItem {
  standard: string;
  description: string;
  status: "aligned" | "in-progress" | "planned";
  notes: string;
}

// ─── Legacy alias kept so existing components compile ────────────────────────

export interface PerformanceMetric extends GTSUTelemetry {
  flightCycle?: number;
  systemAvailability?: number;
  remainingUsefulLife?: number;
}

export interface VibrationData {
  timestamp: Date;
  sensorLocation: string;
  amplitude: number;
  frequency: number;
  measurementType: "displacement" | "velocity" | "acceleration";
}

export interface DesignIteration {
  iterationNumber: number;
  timestamp: Date;
  optimizationScore: number;
  thermalStressMargin: number;
  designParameters: Record<string, number>;
  fuelStepperBias: number;
  startDuration: number;
}

// ─── Extended Telemetry (with vibration + thermal life) ──────────────────────

export interface ExtendedTelemetry extends GTSUTelemetry {
  vibration:           number;   // mm/s
  thermalLifeConsumed: number;   // cumulative % of thermal life budget
  dataQuality:         number;   // 0–1 per-frame data integrity
  cumulativeStarts:    number;   // total start count for lifecycle tracking
}

// ─── Maintenance Actions ─────────────────────────────────────────────────────

export type MaintenancePriority = 'urgent' | 'high' | 'medium' | 'low';
export type MaintenanceStatus   = 'open' | 'acknowledged' | 'in-progress' | 'closed';

export interface MaintenanceAction {
  id:                string;
  priority:          MaintenancePriority;
  action:            string;
  component:         string;
  reason:            string;
  evidence:          string[];
  estimatedDowntime: string;   // e.g. "4 hours"
  tradeRequired:     string;   // e.g. "Avionics Tech"
  inspectionItems:   string[];
  status:            MaintenanceStatus;
  linkedFaultId?:    string;
  createdAt:         Date;
  updatedAt:         Date;
}

// ─── Extended Start Scenario ─────────────────────────────────────────────────

export type ExtendedStartScenario =
  | 'normal'
  | 'hot-start'
  | 'hung-start'
  | 'sensor-drift'
  | 'fuel-anomaly'
  | 'secu-fault'
  | 'high-vibration'
  | 'data-dropout';

// ─── Flight Record / Start Cycle Domain ──────────────────────────────────────

export type CycleStatus = 'success' | 'degraded' | 'faulty' | 'aborted';
export type FaultReason =
  | 'hot-start'
  | 'hung-start'
  | 'slow-light-up'
  | 'fuel-overshoot'
  | 'compressor-stall'
  | 'sensor-drift'
  | 'high-vibration';

export interface CycleTraceSample {
  t:           number;   // 0..durationSec
  jpt1:        number;   // °C — ground limit 900, in-flight limit 1020
  ngg:         number;   // RPM — light-up detection > 12,625 RPM
  nggPct:      number;   // % of max (22,000 RPM)
  p2p1:        number;   // dimensionless compressor pressure ratio (kPa tracking)
  fuelFlow:    number;   // kg/h derived from stepper motor position
  stepperPos:  number;   // discrete stepper steps 0-255 (Actuation & Control)
  vibration:   number;   // mm/s
  oat:         number;   // Outside Air Temperature °C (-100..+300 via ADU)
  secuHealthy: boolean;  // SECU main-processor health — true = healthy
  bitPass:     boolean;  // Built-In-Test (BIT) pass/fail
  milBusWord:  number;   // MIL-STD-1553B status word (interpret as hex)
  phase:       StartPhase;
}

export interface StartCycle {
  id:                   string;
  cycleNumber:          number;     // 1..N within flight
  flightHour:           number;     // hour offset within flight
  durationSec:          number;     // ≈40 nominal
  status:               CycleStatus;
  faultReason?:         FaultReason;
  improvement?:         string;     // suggestion if faulty/degraded
  peakJpt1:             number;
  maxNggPct:            number;
  minP2p1:              number;
  fuelUsedKg:           number;
  timeToSelfSustaining: number;     // seconds (or durationSec if never reached)
  efficiency:           number;     // 0..100 (composite)
  trace:                CycleTraceSample[];
}

export interface FlightRecord {
  id:                string;
  startTime:         Date;
  durationHrs:       number;
  cycles:            StartCycle[];
  totalFuelKg:       number;
  successCount:      number;
  degradedCount:     number;
  faultyCount:       number;
  abortCount:        number;
  avgEfficiency:     number;     // 0..100
  avgCycleSec:       number;
  improvementPotPct: number;     // estimated efficiency gain if recommendations applied
}

// ─── Component Wear (Life Cycle & Reliability) ──────────────────────────────

export type ComponentCategory =
  | 'turbine'
  | 'compressor'
  | 'combustor'
  | 'fuel-system'
  | 'control-unit'
  | 'bearing';

export interface ComponentWearRecord {
  id:                  string;
  name:                string;
  category:            ComponentCategory;
  designLifeCycles:    number;     // nominal life in start cycles
  designLifeHrs:       number;     // nominal life in flight hours
  consumedCycles:      number;     // accumulated from all flights
  consumedHrs:         number;
  wearPct:             number;     // 0..100
  remainingLifeHrs:    number;
  failureRisk:         number;     // 0..100
  primaryStressor:     string;     // e.g. "thermal cycling", "vibration", "fuel impingement"
}

// ─── Sandbox Simulation ──────────────────────────────────────────────────────

export interface SandboxInputs {
  fuelFlowKgH:    number;   // 1..10
  bladeAngleDeg:  number;   // -5..+15 inlet guide vane equivalent
  rpmTargetPct:   number;   // 60..110 (% of Ngg max)
  oat:            number;   // Outside Air Temperature °C (ambient normalization, ISA std = 15)
}

export interface SandboxOutputs {
  powerKW:           number;
  sfcKgPerKWh:       number;
  jpt1PeakC:         number;
  surgeMargin:       number;   // % — compressor stall margin
  thermalStressIdx:  number;   // 0..100 — life-cycle cost per start
  feasible:          boolean;
  warnings:          string[];
}

export interface SandboxRun {
  id:        string;
  timestamp: Date;
  inputs:    SandboxInputs;
  outputs:   SandboxOutputs;
}

// ─── Backend Flight DB Types (from FastAPI / SQLite) ────────────────────────

/** Flight metadata row from /api/flights */
export interface BackendFlight {
  id:                       number;
  flight_label:             string;    // e.g. "Flight 003"
  duration_hrs:             number;
  total_start_cycles:       number;
  date:                     string;    // "2026-03-15"
  success_rate_pct:         number;    // 0-100
  faulty_cycle_count:       number;
  avg_peak_jpt1_degC:       number;    // °C
  total_fuel_kg:            number;
  total_trace_duration_sec: number;
}

/** Cycle summary row from /api/flights/{id} */
export interface BackendCycle {
  id:                      number;
  flight_id:               number;
  cycle_number:            number;
  flight_hour_elapsed:     number;
  cycle_status:            CycleStatus;
  fault_type:              string;
  corrective_action:       string;
  duration_sec:            number;
  peak_jet_pipe_temp_degC: number;
  max_gas_gen_speed_pct:   number;
  fuel_consumed_kg:        number;
  cycle_start_sec:         number;    // seconds from flight start
  cycle_end_sec:           number;
}

/** 1-Hz trace row from /api/flights/{id}/trace */
export interface TraceRow {
  id:                        number;
  flight_id:                 number;
  cycle_number:              number;
  elapsed_time_sec:          number;   // absolute seconds from flight start
  start_phase:               string;
  jet_pipe_temp_degC:        number;
  gas_gen_speed_rpm:         number;
  gas_gen_speed_pct:         number;
  compressor_pressure_ratio: number;
  ambient_temp_degC:         number;
  fuel_valve_steps:          number;
  fuel_flow_kg_per_hr:       number;
  vibration_mm_per_sec:      number;
  secu_processor_ok:         number;  // 0 | 1
  built_in_test_pass:        number;  // 0 | 1
  mil_1553b_status_word:     string;  // e.g. "0x0000"
  cycle_status:              CycleStatus;
  fault_type:                string;
  flight_hour_elapsed:       number;
}

/** Fully loaded flight (metadata + cycles + trace) held in the store */
export interface LoadedBackendFlight {
  meta:   BackendFlight;
  cycles: BackendCycle[];
  trace:  TraceRow[];
}
