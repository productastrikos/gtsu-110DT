import { generatePerformanceData } from "./mockData";

export interface KPIDetail {
  title: string;
  value: string | number;
  unit?: string;
  description: string;
  status?: string;
  factors: {
    name: string;
    impact: number;
    description: string;
  }[];
  historicalData?: {
    x: number | string;
    y: number;
  }[];
  relatedMetrics?: {
    label: string;
    value: number;
    color?: string;
  }[];
}

export function getThrustToWeightDetail(currentValue: number): KPIDetail {
  const performanceData = generatePerformanceData();
  return {
    title: "Thrust-to-Weight Ratio",
    value: currentValue,
    unit: "T/W",
    // description: "Measures the engine's thrust output relative to its weight. Higher ratios indicate better performance and maneuverability.",
    description: `
Measures the engine's thrust output relative to its weight. Higher ratios indicate better performance and maneuverability.
Reference: Thrust-to-Weight Ratio (T/W) — dimensionless. Higher ratios mean more thrust for less mass, critical for maneuverability and climb performance.
Data Sources: Engine test bed data, simulation output, flight telemetry.
Thresholds: 🔴 < 6.0, 🟠 6.0–7.0, 🟢 > 7.0
    `,
    factors: [
      { name: "Compressor Efficiency", impact: 15.2, description: "Higher compression ratios improve thrust output" },
      { name: "Turbine Inlet Temperature", impact: 12.8, description: "Elevated temperatures increase power generation" },
      { name: "Material Weight Optimization", impact: 8.5, description: "Advanced composites reduce overall engine weight" },
      { name: "Fuel Flow Rate", impact: -3.2, description: "Current flow slightly above optimal" },
    ],
    historicalData: performanceData.slice(-30).map((d) => ({
      x: d.flightCycle,
      y: d.thrustToWeightRatio,
    })),
    relatedMetrics: [
      { label: "Thrust Output", value: 136.5, color: "#10b981" },
      { label: "Engine Weight", value: 18.2, color: "#22c55e" },
      { label: "Bypass Ratio", value: 8.4, color: "#16a34a" },
    ],
  };
}

export function getSFCDetail(currentValue: number): KPIDetail {
  const performanceData = generatePerformanceData();
  return {
    title: "Specific Fuel Consumption",
    value: currentValue,
    unit: "mg/Ns",
    description: `
Indicates fuel efficiency — how much fuel is burned per unit thrust per second. Lower values indicate better efficiency and range.
Reference: Specific Fuel Consumption (SFC) — mg/N·s (or kg/N·s). Fundamental measure of engine fuel efficiency.
Data Sources: Fuel flow sensors, engine test data, CFD simulation.
Display: Numeric indicator with % change vs. baseline.
Category: Efficiency
Thresholds: 🔴 > 25, 🟠 24–25, 🟢 < 24
`,

    factors: [
      { name: "Combustion Efficiency", impact: 8.3, description: "Optimized fuel-air mixture reducing consumption" },
      { name: "Bypass Ratio", impact: -6.7, description: "Higher bypass increases overall efficiency" },
      { name: "Component Wear", impact: 4.2, description: "Minor degradation increasing fuel usage" },
      { name: "Operating Temperature", impact: 2.8, description: "Current temp slightly elevated" },
    ],
    historicalData: performanceData.slice(-30).map((d) => ({
      x: d.flightCycle,
      y: d.specificFuelConsumption,
    })),
    relatedMetrics: [
      { label: "Fuel Flow", value: 2.45, color: "#f59e0b" },
      { label: "Air Flow", value: 385, color: "#fbbf24" },
      { label: "Pressure Ratio", value: 32.5, color: "#fb923c" },
    ],
  };
}

export function getEngineEfficiencyDetail(currentValue: number): KPIDetail {
  const performanceData = generatePerformanceData();
  return {
    title: "Engine Efficiency",
    value: currentValue,
    unit: "%",
    // description: "Overall thermal efficiency of the engine. Represents the percentage of fuel energy converted to useful work.",
    description: `
Overall efficiency combining combustion, turbine, and nozzle performance. Higher values mean better energy conversion.
Reference: Engine Efficiency (η) — expressed in %. Measures how effectively the engine converts fuel energy into useful work.
Data Sources: Thermodynamic model (CFD + test data), performance analysis software.
Display: Gauge or progress bar with % change vs. target.
Category: Performance / Efficiency
Thresholds: 🔴 < 30%, 🟠 30–33%, 🟢 > 33%
`,

    factors: [
      { name: "Thermal Management", impact: 11.5, description: "Advanced cooling systems improving heat retention" },
      { name: "Aerodynamic Design", impact: 9.2, description: "Optimized blade geometry reducing losses" },
      { name: "Mechanical Losses", impact: -5.8, description: "Bearing friction and seal leakage" },
      { name: "Combustion Completeness", impact: 7.3, description: "Near-complete fuel burn achieved" },
    ],
    historicalData: performanceData.slice(-30).map((d) => ({
      x: d.flightCycle,
      y: d.engineEfficiency,
    })),
    relatedMetrics: [
      { label: "Compressor Eff.", value: 85.2, color: "#10b981" },
      { label: "Combustor Eff.", value: 78.5, color: "#22c55e" },
      { label: "Turbine Eff.", value: 88.7, color: "#16a34a" },
      { label: "Nozzle Eff.", value: 92.3, color: "#15803d" },
      { label: "Fan Eff.", value: 90.3, color: "#15803d" },
    ],
  };
}

export function getSystemAvailabilityDetail(currentValue: number): KPIDetail {
  const performanceData = generatePerformanceData();
  return {
    title: "System Availability",
    value: currentValue,
    unit: "%",
    description: "Percentage of time the engine is operational and ready for use. Critical for mission readiness.",
    factors: [
      { name: "Predictive Maintenance", impact: 12.0, description: "AI-driven maintenance scheduling reducing downtime" },
      { name: "Component Reliability", impact: 8.5, description: "High-quality parts with low failure rates" },
      { name: "Scheduled Inspections", impact: -2.5, description: "Routine maintenance periods" },
      { name: "Supply Chain", impact: 4.2, description: "Fast part availability for repairs" },
    ],
    historicalData: performanceData.slice(-30).map((d) => ({
      x: d.flightCycle,
      y: d.systemAvailability,
    })),
    relatedMetrics: [
      { label: "MTBF", value: 580, color: "#10b981" },
      { label: "MTTR", value: 4.2, color: "#22c55e" },
      { label: "Uptime", value: 94.8, color: "#16a34a" },
    ],
  };
}

export function getRULDetail(currentValue: number): KPIDetail {
  return {
    title: "Remaining Useful Life",
    value: currentValue,
    unit: "hrs",
    // description: "Predicted hours of operation before major maintenance or overhaul is required.",
    description: `
Estimated operational hours remaining before maintenance or overhaul, based on fatigue and thermal wear.
Reference: Remaining Useful Life (RUL) — expressed in hours (h). Predicts engine reliability and maintenance needs.
Data Sources: Predictive maintenance models, digital twin, historical data.
Display: Color-coded numeric indicator showing degradation status.
Category: Reliability / Maintenance
Thresholds: 🔴 < 300, 🟠 300–450, 🟢 > 500
`,

    factors: [
      { name: "Thermal Cycling", impact: -15.2, description: "Temperature variations accelerating fatigue" },
      { name: "Operating Hours", impact: -12.8, description: "Cumulative runtime reducing lifespan" },
      { name: "Vibration Levels", impact: -8.3, description: "Mechanical stress from operation" },
      { name: "Maintenance Quality", impact: 18.5, description: "Excellent preventive maintenance extending life" },
    ],
    historicalData: Array.from({ length: 30 }, (_, i) => ({
      x: 900 + i * 10,
      y: 480 - i * 4.2,
    })),
    relatedMetrics: [
      { label: "Compressor RUL", value: 520, color: "#10b981" },
      { label: "Turbine RUL", value: 380, color: "#f59e0b" },
      { label: "Combustor RUL", value: 450, color: "#22c55e" },
      { label: "Shaft RUL", value: 600, color: "#16a34a" },
      { label: "Fan RUL", value: 620, color: "#16a34a" },
    ],
  };
}

export function getTurbineInletTempDetail(currentValue: number): KPIDetail {
  const performanceData = generatePerformanceData();
  return {
    title: "Turbine Inlet Temperature",
    value: currentValue,
    unit: "°C",
    // description: "Temperature of exhaust gases entering the turbine. Critical parameter affecting performance and component life.",
    description: `
Peak gas temperature entering the high-pressure turbine; indicates thermal loading. High TIT increases efficiency but stresses materials.
Reference: Turbine Inlet Temperature (TIT) — measured in °C. Critical for engine thermal and structural performance.
Data Sources: Temperature sensors, test bed telemetry, CFD thermal analysis.
Display: Thermometer-style numeric or trend indicator.
Category: Thermal / Structural
Thresholds: 🔴 > 1500°C, 🟠 1450–1500°C, 🟢 ≤ 1450°C
`,

    factors: [
      { name: "Combustion Intensity", impact: 22.5, description: "High power settings increasing temperature" },
      { name: "Fuel Quality", impact: 8.2, description: "Premium fuel improving combustion characteristics" },
      { name: "Cooling Air Flow", impact: -15.3, description: "Enhanced cooling reducing peak temperatures" },
      { name: "Ambient Conditions", impact: 5.7, description: "External temperature affecting inlet conditions" },
    ],
    historicalData: performanceData.slice(-30).map((d) => ({
      x: d.flightCycle,
      y: d.turbineInletTemp,
    })),
    relatedMetrics: [
      { label: "Exhaust Temp", value: 920, color: "#ef4444" },
      { label: "Cooling Eff.", value: 78.5, color: "#3b82f6" },
      { label: "Blade Temp", value: 1150, color: "#f59e0b" },
    ],
  };
}

export function getStressToYieldDetail(currentValue: number): KPIDetail {
  return {
    title: "Average Stress-to-Yield Ratio",
    value: currentValue,
    unit: "%",
    description: "Ratio of actual stress to material yield strength. Higher values indicate components operating closer to failure limits.",
    factors: [
      { name: "Operational Load", impact: 18.5, description: "High thrust requirements increasing stress" },
      { name: "Temperature Effects", impact: 12.3, description: "Elevated temperatures reducing material strength" },
      { name: "Material Quality", impact: -8.5, description: "High-grade alloys providing better strength" },
      { name: "Fatigue Accumulation", impact: 6.7, description: "Cumulative cycles weakening structures" },
    ],
    historicalData: Array.from({ length: 30 }, (_, i) => ({
      x: i + 1,
      y: 68 + Math.sin(i / 5) * 5 + i * 0.3,
    })),
    relatedMetrics: [
      { label: "Turbine Blade", value: 89.2, color: "#ef4444" },
      { label: "Compressor", value: 75.3, color: "#f59e0b" },
      { label: "Combustor", value: 68.5, color: "#10b981" },
      { label: "Shaft", value: 62.1, color: "#10b981" },
    ],
  };
}

export function getFatigueLifeDetail(currentValue: number): KPIDetail {
  return {
    title: "Average Fatigue Life",
    value: currentValue,
    unit: "% remaining",
    description: "Percentage of fatigue life remaining before component replacement or overhaul is required.",
    factors: [
      { name: "Cyclic Loading", impact: -15.8, description: "Repeated stress cycles consuming fatigue life" },
      { name: "Vibration Levels", impact: -10.2, description: "High frequency oscillations accelerating damage" },
      { name: "Material Properties", impact: 12.5, description: "Advanced alloys with superior fatigue resistance" },
      { name: "Operating Temperature", impact: -8.3, description: "Thermal cycling contributing to crack growth" },
    ],
    historicalData: Array.from({ length: 30 }, (_, i) => ({
      x: i + 1,
      y: 82 - i * 0.8,
    })),
    relatedMetrics: [
      { label: "Turbine", value: 58.2, color: "#f59e0b" },
      { label: "Compressor", value: 72.5, color: "#22c55e" },
      { label: "Combustor", value: 65.8, color: "#22c55e" },
      { label: "Bearings", value: 48.3, color: "#ef4444" },
    ],
  };
}

export function getRPNDetail(currentValue: number): KPIDetail {
  return {
    title: "Average Risk Priority Number",
    value: currentValue,
    description: "FMEA metric combining severity, occurrence, and detection. Higher values indicate greater risk requiring mitigation.",
    factors: [
      { name: "Failure Severity", impact: 25.0, description: "Potential impact of failure on system performance" },
      { name: "Occurrence Rate", impact: 15.5, description: "Frequency of failure mode occurrence" },
      { name: "Detection Capability", impact: -18.2, description: "Advanced monitoring improving early detection" },
      { name: "Mitigation Actions", impact: -12.8, description: "Preventive measures reducing risk" },
    ],
    historicalData: Array.from({ length: 30 }, (_, i) => ({
      x: i + 1,
      y: 160 - i * 1.5 + Math.sin(i / 3) * 10,
    })),
    relatedMetrics: [
      { label: "Bearing Failure", value: 240, color: "#ef4444" },
      { label: "Blade Crack", value: 180, color: "#f59e0b" },
      { label: "Seal Leak", value: 120, color: "#22c55e" },
      { label: "Sensor Drift", value: 90, color: "#10b981" },
    ],
  };
}

export function getOptimizationScoreDetail(currentValue: number): KPIDetail {
  return {
    title: "Optimization Score",
    value: currentValue,
    unit: "/100",
    description: "Composite metric evaluating overall design optimization progress across multiple performance objectives.",
    factors: [
      { name: "Performance Gains", impact: 28.5, description: "Improvements in thrust, efficiency, and SFC" },
      { name: "Constraint Satisfaction", impact: 22.3, description: "Meeting structural and thermal limits" },
      { name: "Design Convergence", impact: 18.7, description: "Stability of optimization parameters" },
      { name: "Multi-Objective Balance", impact: 15.5, description: "Achieving optimal trade-offs" },
    ],
    historicalData: Array.from({ length: 30 }, (_, i) => ({
      x: i + 1,
      y: 45 + i * 1.2 + Math.log(i + 1) * 2,
    })),
    relatedMetrics: [
      { label: "T/W Improvement", value: 12.5, color: "#10b981" },
      { label: "SFC Reduction", value: 8.3, color: "#22c55e" },
      { label: "Efficiency Gain", value: 15.2, color: "#16a34a" },
      { label: "Constraint Score", value: 95.0, color: "#15803d" },
    ],
  };
}
// export function getBypassRatioDetail(currentValue: number): KPIDetail {
//   return {
//     title: "Bypass Ratio",
//     value: currentValue,
//     unit: ":1",
//     description: "The ratio of air bypassing the core to the air going through the core. Low values indicate a low-bypass military engine.",
//     factors: [
//       { name: "Fan Design", impact: 10, description: "Blade shape and fan diameter affect bypass ratio" },
//       { name: "Compressor Ratio", impact: -5, description: "Higher compression lowers bypass airflow" },
//       { name: "Exhaust Nozzle", impact: 3, description: "Nozzle design can slightly influence bypass airflow" },
//     ],
//     historicalData: [], // you can fill with historical values if available
//     relatedMetrics: [
//       { label: "Thrust-to-Weight Ratio", value: latestData.thrustToWeightRatio, color: "#10b981" },
//       { label: "Engine Efficiency", value: latestData.engineEfficiency, color: "#22c55e" },
//     ],
//   };
// }

export function getBypassRatioDetail(currentValue: number, thrustToWeightRatio: number, engineEfficiency: number): KPIDetail {
  return {
    title: "Bypass Ratio",
    value: currentValue,
    unit: ":1",
    // description: "The ratio of air bypassing the core to the air going through the core. Low values indicate a low-bypass military engine.",
    description: `
Ratio of bypass air to core air. For military turbofans, low BPR (~0.3–0.6) balances thrust and efficiency; too low behaves like a turbojet (inefficient, overheats).
Reference: Bypass Ratio (BPR) — dimensionless. Key design parameter for turbofan engines.
Data Sources: CFD analysis, engine design data, test instrumentation.
Display: Dial or numeric display.
Category: Design Parameter
Thresholds: 🔴 < 0.25, 🟠 0.25–0.35, 🟢 0.35–0.6
`,

    factors: [
      { name: "Fan Design", impact: 10, description: "Blade shape and fan diameter affect bypass ratio" },
      { name: "Compressor Ratio", impact: -5, description: "Higher compression lowers bypass airflow" },
      { name: "Exhaust Nozzle", impact: 3, description: "Nozzle design can slightly influence bypass airflow" },
    ],
    historicalData: [],
    relatedMetrics: [
      { label: "Thrust-to-Weight Ratio", value: thrustToWeightRatio, color: "#10b981" },
      { label: "Engine Efficiency", value: engineEfficiency, color: "#22c55e" },
    ],
  };
}

// export function getMTBFDetail(currentValue: number): KPIDetail {
//   return {
//     title: "Mean Time Between Failures (MTBF) – IJT-36 (Production Stage)",
//     value: currentValue,
//     unit: "hours",
//     description:
//       "Represents the average operational time between two consecutive failures of the IJT-36 engine during production testing. Higher values indicate better reliability and component durability.",
//     factors: [
//       {
//         name: "Component Quality",
//         impact: 14.8,
//         description: "Use of certified parts and improved manufacturing precision extending reliability.",
//       },
//       {
//         name: "Maintenance Practices",
//         impact: 10.5,
//         description: "Scheduled preventive maintenance reducing unexpected failures.",
//       },
//       {
//         name: "Operating Conditions",
//         impact: -7.2,
//         description: "High ambient temperature and pressure cycles slightly reducing mean time to failure.",
//       },
//       {
//         name: "Sensor Diagnostics",
//         impact: 5.9,
//         description: "Real-time condition monitoring allowing early detection of potential faults.",
//       },
//     ],
//     historicalData: Array.from({ length: 24 }, (_, i) => ({
//       x: `Cycle ${i + 1}`,
//       y: 220 + Math.cos(i / 3) * 20 + i * 3.2, // example trend in hours
//     })),
//     relatedMetrics: [
//       { label: "Compressor Module", value: 310, color: "#10b981" },
//       { label: "Turbine Section", value: 275, color: "#f59e0b" },
//       { label: "Fuel System", value: 195, color: "#ef4444" },
//       { label: "Gearbox", value: 240, color: "#fbbf24" },
//     ],
//   };
// }
export function getMTBFDetail(currentValue: number): KPIDetail {
  return {
    title: "Mean Time Between Failures (MTBF)",
    value: currentValue,
    unit: "hours",
    description: `Indicates the average operational time between two consecutive failures. 
Higher MTBF reflects improved reliability and reduced downtime.
Thresholds: 🔴 < 1200 h, 🟠 1200–1800 h, 🟢 ≥ 1800 h`,

    factors: [
      {
        name: "Component Durability",
        impact: 15.2,
        description: "Enhanced material fatigue resistance extending time between failures.",
      },
      {
        name: "Maintenance Quality",
        impact: 11.4,
        description: "Preventive maintenance scheduling improving reliability.",
      },
      {
        name: "Operating Stress",
        impact: -9.6,
        description: "High load cycles slightly reducing overall MTBF.",
      },
      {
        name: "Diagnostics & Monitoring",
        impact: 7.3,
        description: "Predictive analytics detecting early-stage anomalies before failure.",
      },
    ],
    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 180 + Math.sin(i / 2) * 10 + i * 5, // simulated monthly trend
    })),
    relatedMetrics: [
      { label: "Compressor Module", value: 310, color: "#10b981" },
      { label: "Turbine Section", value: 275, color: "#f59e0b" },
      { label: "Fuel System", value: 195, color: "#ef4444" },
      { label: "Gearbox", value: 240, color: "#fbbf24" },
    ],
  };
}

export function getDryThrustDetail(currentValue: number): KPIDetail {
  return {
    title: "Dry Thrust",
    value: currentValue,
    unit: "kN",
    description: `Indicates the maximum thrust generated without afterburner. Higher values mean better propulsion performance.
Thresholds: 🔴 < 20 kN, 🟠 20–25 kN, 🟢 ≥ 25 kN`,

    factors: [
      { name: "Compressor Efficiency", impact: 12, description: "Higher compression improves thrust output." },
      { name: "Fuel Quality", impact: 8, description: "Better fuel combustion increases thrust." },
      { name: "Ambient Conditions", impact: -5, description: "High temperature reduces thrust slightly." },
    ],

    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 24 + Math.sin(i / 2) * 0.8 + i * 0.1, // example trend
    })),

    relatedMetrics: [
      { label: "Compressor Stage", value: 12, color: "#10b981" },
      { label: "Turbine Stage", value: 10, color: "#f59e0b" },
      { label: "Afterburner Potential", value: 5, color: "#ef4444" },
    ],
  };
}

export function getReheatThrustDetail(currentValue: number): KPIDetail {
  return {
    title: "Reheat Thrust",
    value: currentValue,
    unit: "kN",
    description: `Maximum thrust with afterburner. High reheat thrust is critical for supersonic and combat maneuvers.
Thresholds: 🔴 < 28 kN, 🟠 28–32 kN, 🟢 ≥ 32 kN`,

    factors: [
      { name: "Afterburner Efficiency", impact: 15, description: "Effective afterburner design increases thrust." },
      { name: "Fuel Flow Management", impact: 10, description: "Optimized fuel delivery boosts performance." },
      { name: "Exhaust Nozzle Design", impact: 7, description: "Nozzle geometry affects reheat effectiveness." },
    ],

    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 30 + Math.sin(i / 3) * 1 + i * 0.2,
    })),

    relatedMetrics: [
      { label: "Afterburner Module", value: 15, color: "#10b981" },
      { label: "Turbine Output", value: 12, color: "#f59e0b" },
      { label: "Fuel Injection", value: 5, color: "#ef4444" },
    ],
  };
}

export function getEngineWeightDetail(currentValue: number): KPIDetail {
  return {
    title: "Engine Dry Weight",
    value: currentValue,
    unit: "kg",
    description: `Weight of the engine without fuel. Lower weight improves aircraft payload and maneuverability.
Thresholds: 🔴 > 950 kg, 🟠 880–950 kg, 🟢 ≤ 880 kg`,

    factors: [
      { name: "Material Selection", impact: 12, description: "Lightweight alloys reduce engine weight." },
      { name: "Structural Optimization", impact: 10, description: "Design tweaks lower mass without compromising strength." },
      { name: "Accessory Components", impact: -5, description: "Heavy accessories increase overall weight." },
    ],

    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 900 + Math.sin(i / 2) * 5,
    })),

    relatedMetrics: [
      { label: "Compressor Module", value: 300, color: "#10b981" },
      { label: "Turbine Section", value: 250, color: "#f59e0b" },
      { label: "Accessory Systems", value: 350, color: "#ef4444" },
    ],
  };
}

export function getBypassRatioDetaill(currentValue: number): KPIDetail {
  return {
    title: "Bypass Ratio",
    value: currentValue,
    unit: ":1",
    description: `Ratio of mass flow bypassing the core to the mass flow through the core. Low-bypass turbofans optimize military performance.
Thresholds: 🔴 < 0.8, 🟠 0.8–1.0, 🟢 ≥ 1.0`,

    factors: [
      { name: "Fan Design", impact: 12, description: "Efficient fan improves bypass ratio." },
      { name: "Engine Core Flow", impact: -7, description: "Core design affects bypass flow." },
      { name: "Operational Speed", impact: 5, description: "Bypass ratio slightly varies with speed." },
    ],

    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 0.9 + Math.sin(i / 4) * 0.02,
    })),

    relatedMetrics: [
      { label: "Fan Module", value: 0.5, color: "#10b981" },
      { label: "Core Module", value: 0.4, color: "#f59e0b" },
    ],
  };
}
export function getOverallPressureRatioDetail(currentValue: number): KPIDetail {
  return {
    title: "Overall Pressure Ratio",
    value: currentValue,
    unit: ":1",
    description: `Indicates the ratio of total pressure at the compressor exit to inlet. Higher values typically mean better engine efficiency.
Thresholds: 🔴 < 10, 🟠 10–12, 🟢 ≥ 12`,

    factors: [
      { name: "Compressor Design", impact: 14, description: "Advanced compressor stages improve pressure ratio." },
      { name: "Inlet Conditions", impact: -6, description: "High ambient temperature or altitude reduces pressure ratio." },
      { name: "Maintenance & Fouling", impact: -5, description: "Dirty blades slightly reduce efficiency and ratio." },
    ],

    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 12 + Math.sin(i / 3) * 0.3,
    })),

    relatedMetrics: [
      { label: "Low-Pressure Compressor", value: 5, color: "#10b981" },
      { label: "High-Pressure Compressor", value: 7, color: "#f59e0b" },
    ],
  };
}

export function getTurbineInletTemperatureDetail(currentValue: number): KPIDetail {
  return {
    title: "Turbine Inlet Temperature (TIT)",
    value: currentValue,
    unit: "K",
    description: `Temperature of gases entering the turbine. High TIT allows better thermodynamic efficiency but stresses components.
Thresholds: 🔴 > 1,520 K, 🟠 1,470–1,520 K, 🟢 ≤ 1,470 K`,

    factors: [
      { name: "Fuel Injection Control", impact: 12, description: "Optimized fuel flow maintains nominal TIT." },
      { name: "Cooling Efficiency", impact: 10, description: "Improved turbine cooling reduces thermal stress." },
      { name: "Combustion Chamber Performance", impact: 8, description: "Uniform combustion prevents hot spots." },
    ],

    historicalData: Array.from({ length: 12 }, (_, i) => ({
      x: `Month ${i + 1}`,
      y: 1470 + Math.sin(i / 2) * 10 + i * 2, // simulated trend
    })),

    relatedMetrics: [
      { label: "Turbine Stage 1", value: 500, color: "#10b981" },
      { label: "Turbine Stage 2", value: 480, color: "#f59e0b" },
      { label: "Combustor Module", value: 490, color: "#ef4444" },
    ],
  };
}
