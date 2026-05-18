import { useState, useMemo, useRef, useEffect } from "react";
import {
  Gauge,
  Zap,
  Clock,
  Flame,
  Thermometer,
} from "lucide-react";
import { KPICard } from "../components/KPICard";
import { BarChart } from "../components/BarChart";
import { AIRecommendationPanel } from "../components/AIRecommendationPanel";
import { KPIDetailModal } from "../components/KPIDetailModal";
import { EngineDigitalTwin } from "../components/EngineDigitalTwin";
import {
  generatePerformanceData,
  generateAIRecommendations,
} from "../utils/mockData";
import { useGTSUStore } from "../store/useGTSUStore";
import { getThresholdStatus } from "../utils/thresholds";
import {
  getRULDetail,
  getEngineEfficiencyDetail,
  KPIDetail,
} from "../utils/kpiDetails";

const JPT_GROUND_LIMIT = 900;

export function OverviewPage() {
  // ── Live telemetry and health from Zustand store (updated every 5s by App.tsx) ──
  const { telemetry, health } = useGTSUStore();

  // Performance trend data — generated once on mount for charts
  const performanceData = useMemo(() => generatePerformanceData(), []);
  const [recommendations] = useState(generateAIRecommendations());
  const [selectedKPI, setSelectedKPI] = useState<KPIDetail | null>(null);
  const twinWrapperRef = useRef<HTMLDivElement>(null);
  const [isTwinFullscreen, setIsTwinFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => {
      setIsTwinFullscreen(!!(document.fullscreenElement && twinWrapperRef.current && document.fullscreenElement.contains(twinWrapperRef.current)));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleTwinFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      twinWrapperRef.current?.requestFullscreen();
    }
  };

  const jpt1Trend = performanceData.map((d, i) => ({ x: i, y: d.jpt1 }));
  const nggTrend = performanceData.map((d, i) => ({ x: i, y: d.nggPct ?? 0 }));
  const p2p1Trend = performanceData.map((d, i) => ({ x: i, y: d.p2p1 }));
  const fuelTrend = performanceData.map((d, i) => ({ x: i, y: d.fuelMassFlow }));
  const rulTrend = performanceData.map((d, i) => ({ x: i, y: d.remainingUsefulLife ?? (480 - i * 2) }));

  const phmBars = [
    { label: "Fouling", value: health.compressorFoulingIndex },
    { label: "Creep Life", value: health.creepLifeConsumption },
    { label: "Therm. Fatigue", value: health.thermalFatigueAccumulation },
    { label: "Hot Start Risk", value: health.hotStartRisk },
    { label: "Hung Start", value: health.hungStartProbability },
  ];

  const jpt1Status = telemetry.jpt1 > JPT_GROUND_LIMIT ? "critical" : telemetry.jpt1 > 780 ? "warning" : "normal";
  const nggStatus = (telemetry.nggPct ?? 85) > 95 ? "critical" : (telemetry.nggPct ?? 85) > 88 ? "warning" : "normal";
  const p2p1Status = telemetry.p2p1 < 3.4 ? "critical" : telemetry.p2p1 < 3.6 ? "warning" : "normal";

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="ds-panel px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--cwm-text)' }}>GTSU-110 Digital Twin Dashboard</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cwm-text-muted)' }}>HAL Gas Turbine Starter Unit · DRISHTI Challenge 5 · ISO 23247 · MIL-STD-1553B</p>
        </div>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KPICard title="JPT1 Temperature" value={Math.round(telemetry.jpt1)} unit="°C" status={jpt1Status} icon={<Thermometer className="w-5 h-5" />} onClick={() => setSelectedKPI({ ...getEngineEfficiencyDetail(telemetry.jpt1), title: "JPT1 — Jet Pipe Temperature", description: "Current: " + telemetry.jpt1 + "°C | Ground limit: 900°C | Flight limit: 1020°C | Light-up detection: 135°C", unit: "°C", status: jpt1Status, historicalData: jpt1Trend })} />
        <KPICard title="Ngg Speed" value={telemetry.ngg.toLocaleString()} unit="RPM" status={nggStatus} icon={<Gauge className="w-5 h-5" />} onClick={() => setSelectedKPI({ ...getEngineEfficiencyDetail(telemetry.nggPct ?? 85), title: "Ngg — Gas Generator Speed", description: "Current: " + telemetry.ngg.toLocaleString() + " RPM (" + (telemetry.nggPct ?? 85).toFixed(1) + "%) | Max: 22,000 RPM | Light-up: 12,625 RPM", unit: "% Ngg", status: nggStatus, historicalData: nggTrend })} />
        <KPICard title="P2/P1 Pressure Ratio" value={telemetry.p2p1} unit=":1" status={p2p1Status} icon={<Zap className="w-5 h-5" />} onClick={() => setSelectedKPI({ ...getEngineEfficiencyDetail(telemetry.p2p1), title: "P2/P1 — Compressor Pressure Ratio", description: "Current: " + telemetry.p2p1.toFixed(2) + " | Baseline: " + health.baselineP2p1 + " | Residual: " + health.residualP2p1.toFixed(2), unit: ":1", status: p2p1Status, historicalData: p2p1Trend })} />
        <KPICard title="Fuel Mass Flow" value={telemetry.fuelMassFlow} unit="kg/h" status="normal" icon={<Flame className="w-5 h-5" />} onClick={() => setSelectedKPI({ ...getEngineEfficiencyDetail(telemetry.fuelMassFlow), title: "Fuel Mass Flow", description: "Current: " + telemetry.fuelMassFlow + " kg/h | Stepper position: " + telemetry.stepperPosition + " steps | 3-phase stepper motor control", unit: "kg/h", status: "normal", historicalData: fuelTrend })} />
        <KPICard title="RUL" value={health.rul} unit="hrs" status={getThresholdStatus(health.rul, "remainingUsefulLife")} icon={<Clock className="w-5 h-5" />} onClick={() => setSelectedKPI({ ...getRULDetail(health.rul), status: getThresholdStatus(health.rul, "remainingUsefulLife"), historicalData: rulTrend })} />
      </div>



      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 ds-panel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--cwm-border)' }}>
            <div>
              <h3 className="font-semibold text-sm tracking-tight" style={{ color: 'var(--cwm-text)' }}>GTSU-110 Engine Digital Twin</h3>
              <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: 'var(--cwm-text-muted)' }}>Click hotspots to inspect sub-systems · ISO 23247 Level 4</p>
            </div>
            <button
              onClick={toggleTwinFullscreen}
              style={{
                background: "#3b7de8",
                color: "#ffffff",
                border: "none",
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 8,
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(59,125,232,0.35)",
                letterSpacing: "0.02em",
              }}
            >
              {isTwinFullscreen ? "Exit Fullscreen" : "Open Full Screen →"}
            </button>
          </div>
          <div className="h-96" ref={twinWrapperRef}>
            <EngineDigitalTwin hideFullscreenButton={true} />
          </div>
        </div>

        <div className="ds-panel rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span style={{ color: 'var(--cwm-text-muted)', fontSize: 16 }}>◈</span>
            <h3 className="font-semibold text-sm tracking-tight" style={{ color: 'var(--cwm-text)' }}>PHM Health State</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Starter Readiness",  value: health.starterReadiness,                          limit: 70, unit: "%", inverted: false },
              { label: "Compressor Fouling",  value: health.compressorFoulingIndex,                    limit: 30, unit: "%", inverted: true  },
              { label: "Creep Life Consumed", value: health.creepLifeConsumption,                      limit: 20, unit: "%", inverted: true  },
              { label: "Thermal Fatigue",     value: health.thermalFatigueAccumulation,                limit: 25, unit: "%", inverted: true  },
              { label: "Hot Start Risk",      value: health.hotStartRisk,                              limit: 15, unit: "%", inverted: true  },
              { label: "Hung Start Prob.",    value: health.hungStartProbability,                      limit: 10, unit: "%", inverted: true  },
              { label: "V-Sensor Confidence", value: Math.round(health.virtualSensorConfidence * 100), limit: 90, unit: "%", inverted: false },
            ].map((item) => {
              const bad  = item.inverted ? item.value > item.limit       : item.value < item.limit;
              const warn = item.inverted ? item.value > item.limit * 0.7 : item.value < item.limit * 1.15;
              const barClr  = bad ? 'var(--cwm-danger)'  : warn ? 'var(--cwm-warning)' : 'var(--cwm-success)';
              const txtClr  = bad ? 'var(--cwm-danger)'  : warn ? 'var(--cwm-warning)' : 'var(--cwm-text)';
              return (
                <div key={item.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--cwm-text-muted)' }}>{item.label}</span>
                    <span className="text-xs font-bold font-mono" style={{ color: txtClr }}>{item.value.toFixed(1)}{item.unit}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cwm-surface-raised)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: Math.min(100, item.value) + '%', background: barClr }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="ds-panel rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span style={{ color: 'var(--cwm-text-muted)', fontSize: 14 }}>↑↓</span>
            <h3 className="font-semibold text-sm tracking-tight" style={{ color: 'var(--cwm-text)' }}>Degradation Indicators</h3>
          </div>
          <BarChart data={phmBars.map((b) => ({ label: b.label, value: b.value }))} title="Degradation Indicators" yAxisLabel="%" height={200} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="ds-inner rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--cwm-text-faint)' }}>RUL</p>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--cwm-text)' }}>{health.rul}h</p>
            </div>
            <div className="ds-inner rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--cwm-text-faint)' }}>Cycles</p>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--cwm-text)' }}>{health.rulCycles}</p>
            </div>
            <div className="ds-inner rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--cwm-text-faint)' }}>V-Sensor</p>
              <p className="text-sm font-bold font-mono" style={{ color: 'var(--cwm-chart-series-1)' }}>{(health.virtualSensorConfidence * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>
        <div className="xl:col-span-2">
          <AIRecommendationPanel recommendations={recommendations} />
        </div>
      </div>

      <div className="ds-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm tracking-tight" style={{ color: 'var(--cwm-text)' }}>GTSU-110 Specification Quick Reference</h3>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--cwm-text-faint)' }}>HAL DRISHTI Challenge 5</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "JPT1 Ground Limit", value: "900 °C" },
            { label: "JPT1 Flight Limit", value: "1020 °C" },
            { label: "Light-Up JPT1", value: "> 135 °C" },
            { label: "Light-Up Ngg", value: "> 12,625 RPM" },
            { label: "Max Ngg", value: "22,000 RPM" },
            { label: "Power Supply", value: "115/200V AC 400Hz" },
            { label: "DC Power", value: "16–31.5V DC" },
            { label: "Power Consumption", value: "75–200W" },
            { label: "In-Flight Start", value: "Up to 6 km alt." },
            { label: "SECU Controller", value: "ARM + SPARTAN 6" },
            { label: "Data Bus", value: "MIL-STD-1553B" },
            { label: "Avionics Bus", value: "ARINC 429" },
          ].map((spec) => (
            <div key={spec.label} className="ds-inner rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--cwm-text-faint)' }}>{spec.label}</p>
              <p className="text-xs font-semibold font-mono" style={{ color: 'var(--cwm-text)' }}>{spec.value}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedKPI && <KPIDetailModal kpiDetail={selectedKPI!} onClose={() => setSelectedKPI(null)} />}
    </div>
  );
}
