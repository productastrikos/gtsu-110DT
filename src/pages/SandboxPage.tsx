/**
 * SandboxPage
 *
 * Engineering sandbox. Engineers input fuel flow, blade angle, and RPM to
 * see whether the engine produces more power and/or lower SFC. Each "run"
 * is appended to a comparison history so trade-offs are visible.
 *
 * No initial data — the user runs a baseline first, then variations.
 */

import { useMemo, useState } from 'react';
import { useGTSUStore } from '../store/useGTSUStore';
import { SANDBOX_BASELINE, simulateSandbox } from '../lib/flightSimulator';
import { buildSandboxHotspots } from '../lib/engineHotspots';
import { EngineModel3D, HotspotLegend, SectionLegend, LabelToggle } from '../components/EngineModel3D';
import { deriveN2, deriveSectionRatios, MAX_NPT_RPM, ENGINE_FORMULAS } from '../lib/engineDerived';
import type { SandboxInputs, SandboxOutputs, SandboxRun, CycleTraceSample, StartPhase } from '../types/engine';

export default function SandboxPage() {
  const sandboxRuns = useGTSUStore(s => s.sandboxRuns);
  const runSandbox  = useGTSUStore(s => s.runSandbox);
  const clearSandbox = useGTSUStore(s => s.clearSandbox);

  const [inputs, setInputs] = useState<SandboxInputs>({ ...SANDBOX_BASELINE });
  const [showLabels, setShowLabels]     = useState(true);
  const [showSections, setShowSections] = useState(true);
  const [showFormulas, setShowFormulas] = useState(false);

  // Preview the outputs of the current input WITHOUT recording a run.
  const preview = useMemo(() => simulateSandbox(inputs), [inputs]);

  const baselineRun = sandboxRuns[sandboxRuns.length - 1]; // first run user submitted
  const baselineOutputs: SandboxOutputs | null = baselineRun?.outputs ?? null;

  const hotspots = useMemo(
    () => buildSandboxHotspots(inputs, preview, baselineOutputs),
    [inputs, preview, baselineOutputs],
  );

  // Synthesize a frame for thermal tint based on the predicted peak.
  const previewFrame: CycleTraceSample = useMemo(() => ({
    t: 0,
    jpt1: preview.jpt1PeakC,
    nggPct: inputs.rpmTargetPct,
    ngg: Math.round((inputs.rpmTargetPct / 100) * 22000),
    p2p1: 3.78,
    fuelFlow: inputs.fuelFlowKgH,
    stepperPos: Math.round(Math.max(0, Math.min(255, (inputs.fuelFlowKgH / 10) * 255))),
    vibration: Math.max(1, (inputs.rpmTargetPct - 90) * 0.6),
    oat: inputs.oat ?? 15,
    secuHealthy: preview.feasible || preview.warnings.length <= 1,
    bitPass: preview.warnings.length === 0,
    milBusWord: preview.warnings.length === 0 ? 0x0000 : preview.warnings.length > 2 ? 0x0410 : 0x0010,
    phase: 'self-sustaining' as StartPhase,
  }), [inputs, preview]);

  const n2     = useMemo(() => deriveN2(previewFrame), [previewFrame]);
  const ratios = useMemo(() => deriveSectionRatios(previewFrame), [previewFrame]);

  const onRun = (label?: 'baseline' | 'tuned') => {
    if (label === 'baseline') {
      setInputs({ ...SANDBOX_BASELINE });
      runSandbox(SANDBOX_BASELINE);
    } else {
      runSandbox(inputs);
    }
  };

  const resetToBaseline = () => setInputs({ ...SANDBOX_BASELINE });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Performance Sandbox"
        subtitle="Adjust fuel flow, blade angle and RPM — simulate power and SFC outcomes against the GTSU-110 physics model"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Inputs panel ────────────────────────────────────── */}
        <div className="ds-panel" style={{ padding: 18 }}>
          <SectionHead title="Engine Parameters" subtitle="Adjust and run — preview updates live, recorded runs go to the comparison table" />

          <ParamSlider
            label="Fuel Flow"
            unit="kg/h"
            min={1} max={10} step={0.1}
            value={inputs.fuelFlowKgH}
            onChange={v => setInputs(s => ({ ...s, fuelFlowKgH: v }))}
            note="Mass flow through metering valve. Nominal ≈ 6.4 kg/h."
          />
          <ParamSlider
            label="Blade Angle (IGV)"
            unit="°"
            min={-5} max={15} step={0.5}
            value={inputs.bladeAngleDeg}
            onChange={v => setInputs(s => ({ ...s, bladeAngleDeg: v }))}
            note="Inlet guide vane setting. 0° is the design nominal."
          />
          <ParamSlider
            label="RPM Target"
            unit="% Ngg"
            min={60} max={110} step={1}
            value={inputs.rpmTargetPct}
            onChange={v => setInputs(s => ({ ...s, rpmTargetPct: v }))}
            note="Self-sustaining ≥ 57.4 %. Over-speed limit at 105 %."
          />

          <ParamSlider
            label="Outside Air Temperature (OAT)"
            unit="°C"
            min={-40} max={60} step={1}
            value={inputs.oat ?? 15}
            onChange={v => setInputs(s => ({ ...s, oat: v }))}
            note="Ambient temp for thermodynamic normalization. ISA standard day = 15°C. Hot day > 40°C reduces mass flow and surge margin."
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => onRun()} style={primaryBtn}>▶ RUN SIMULATION</button>
            {sandboxRuns.length === 0 && (
              <button onClick={() => onRun('baseline')} style={ghostBtn}>SET AS BASELINE</button>
            )}
            <button onClick={resetToBaseline} style={ghostBtn}>RESET TO NOMINAL</button>
            {sandboxRuns.length > 0 && (
              <button onClick={clearSandbox} style={{ ...ghostBtn, marginLeft: 'auto', color: 'var(--cwm-text-faint)' }}>CLEAR HISTORY</button>
            )}
          </div>
        </div>

        {/* ── Preview / outputs ───────────────────────────────── */}
        <div className="ds-panel" style={{ padding: 18 }}>
          <SectionHead title="Predicted Output" subtitle="Live preview against current slider settings — not yet recorded" />

          <div className="grid grid-cols-2 gap-3">
            <OutputCard label="Shaft Power"     value={preview.powerKW.toFixed(1)}      unit="kW"   delta={baselineOutputs ? preview.powerKW    - baselineOutputs.powerKW    : null} positiveIsGood />
            <OutputCard label="SFC"             value={preview.sfcKgPerKWh.toFixed(3)}  unit="kg/kWh" delta={baselineOutputs ? preview.sfcKgPerKWh - baselineOutputs.sfcKgPerKWh : null} positiveIsGood={false} />
            <OutputCard label="TGT Peak"        value={preview.jpt1PeakC.toFixed(0)}    unit="°C"   delta={baselineOutputs ? preview.jpt1PeakC   - baselineOutputs.jpt1PeakC   : null} positiveIsGood={false} threshold={900} />
            <OutputCard label="Surge Margin"    value={preview.surgeMargin.toFixed(1)}  unit="%"    delta={baselineOutputs ? preview.surgeMargin - baselineOutputs.surgeMargin : null} positiveIsGood threshold={6} thresholdIsMin />
            <OutputCard label="Thermal Stress"  value={preview.thermalStressIdx.toFixed(0)} unit=""   delta={baselineOutputs ? preview.thermalStressIdx - baselineOutputs.thermalStressIdx : null} positiveIsGood={false} />
            <OutputCard label="Feasibility"     value={preview.feasible ? 'OK' : 'NO-GO'} unit=""    tone={preview.feasible ? 'good' : 'bad'} />
          </div>

          {preview.warnings.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--cwm-warning-bg)', border: '1px solid var(--cwm-warning-border)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--cwm-warning)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>WARNINGS</div>
              <ul style={{ fontSize: 11, color: 'var(--cwm-text)', margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* ── Telemetry parameter quick-view ───────────────── */}
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SandboxMetric label="TGT Peak" value={`${preview.jpt1PeakC.toFixed(0)}°C`} limit="≤900°C gnd / ≤1020°C flt" bad={preview.jpt1PeakC > 900} />
            <SandboxMetric label="P2/P1 (surge)" value={`${preview.surgeMargin.toFixed(1)}% SM`} limit="Surge margin ≥6%" bad={preview.surgeMargin < 6} />
            <SandboxMetric label="N1 · Gas Gen" value={`${Math.round(inputs.rpmTargetPct / 100 * 22000).toLocaleString()} RPM`} limit="Light-up >12,625 · O/S <21,000" bad={inputs.rpmTargetPct > 105} />
            <SandboxMetric label="N2 · Power Turbine" value={`${n2.rpm.toLocaleString()} RPM`} limit={`${n2.pct.toFixed(0)}% · ref ${MAX_NPT_RPM.toLocaleString()} RPM`} bad={n2.pct > 98} />
            <SandboxMetric label="Stepper / Fuel" value={`${Math.round((inputs.fuelFlowKgH / 10) * 255)} steps`} limit={`≈ ${inputs.fuelFlowKgH.toFixed(1)} kg/h · max 255`} bad={inputs.fuelFlowKgH > 9.5} />
            <SandboxMetric label="SECU BIT" value={preview.warnings.length === 0 ? 'PASS' : 'WARN'} limit={`0x${(preview.warnings.length === 0 ? 0 : 0x0010).toString(16).toUpperCase().padStart(4,'0')} · MIL-1553B`} bad={!preview.feasible} />
          </div>

          {/* ── Predicted section temperature ratios ─────────── */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Predicted Temperature Ratios · inlet/outlet per section
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ratios.map(r => (
                <div key={r.key} className="gtsu-metric" style={{ padding: '8px 10px' }}>
                  <div className="m-label" style={{ fontSize: 8.5 }}>{r.label}</div>
                  <div className="m-value" style={{ fontSize: 15, color: 'var(--cwm-accent)' }}>{r.ratio.toFixed(3)}</div>
                  <div className="m-sub">{r.inC.toFixed(0)}°C → {r.outC.toFixed(0)}°C</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3D twin: parameter-driven component stress ─────── */}
      <div className="ds-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 6px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>GTSU-110 — Predicted Component Stress</div>
            <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2, letterSpacing: '0.02em' }}>
              Color reflects what each section would experience under the current parameter set · delta vs baseline run
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <HotspotLegend items={hotspots} />
            <SectionLegend />
            <div style={{ display: 'flex', gap: 14 }}>
              <LabelToggle label="Metric labels" on={showLabels} onChange={setShowLabels} />
              <LabelToggle label="Section tags" on={showSections} onChange={setShowSections} />
            </div>
          </div>
        </div>
        <div style={{ height: 360, position: 'relative' }}>
          <EngineModel3D frame={previewFrame} hotspots={hotspots} showLabels={showLabels} showSections={showSections} />
        </div>
      </div>

      {/* ── Calculations / formulas ("in paper" physics) ────── */}
      <div className="ds-panel" style={{ padding: 16 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowFormulas(o => !o)}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cwm-text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Calculations &amp; Physics — every parameter
          </div>
          <span style={{ color: 'var(--cwm-text-muted)', fontSize: 12 }}>{showFormulas ? '▲' : '▼'}</span>
        </div>
        {showFormulas && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {ENGINE_FORMULAS.map(f => (
              <div key={f.symbol} style={{ padding: '10px 12px', background: 'var(--cwm-surface-soft)', border: '1px solid var(--cwm-border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cwm-accent)' }}>{f.symbol}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cwm-text)' }}>{f.name}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--cwm-text-muted)', fontFamily: 'monospace', marginTop: 5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.formula}</div>
                <div style={{ fontSize: 9.5, color: 'var(--cwm-text-faint)', marginTop: 5, fontStyle: 'italic', lineHeight: 1.5 }}>{f.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Empty state for runs ─────────────────────────────── */}
      {sandboxRuns.length === 0 && (
        <div className="ds-panel" style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>🔬</div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--cwm-text)', marginBottom: 6 }}>No runs recorded yet</h3>
          <p style={{ fontSize: 12, color: 'var(--cwm-text-muted)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Adjust parameters above and press <b>Run Simulation</b>. Recorded runs are compared
            side-by-side so you can see whether a change improves power or SFC.
          </p>
        </div>
      )}

      {/* ── Run history ───────────────────────────────────────── */}
      {sandboxRuns.length > 0 && (
        <div className="ds-panel" style={{ padding: 18 }}>
          <SectionHead title="Recorded Runs" subtitle={`${sandboxRuns.length} run${sandboxRuns.length > 1 ? 's' : ''} · earliest used as baseline`} />
          <RunComparisonTable runs={sandboxRuns} />
        </div>
      )}

      {/* ── Trade-off visualization ───────────────────────────── */}
      {sandboxRuns.length > 1 && (
        <div className="ds-panel" style={{ padding: 18 }}>
          <SectionHead title="Power vs SFC Trade-Off" subtitle="Each dot is a recorded run · top-left is the ideal regime (high power, low SFC)" />
          <TradeoffPlot runs={sandboxRuns} />
        </div>
      )}
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

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cwm-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 2, letterSpacing: '0.02em' }}>{subtitle}</div>}
    </div>
  );
}

function ParamSlider({
  label, unit, min, max, step, value, onChange, note,
}: {
  label: string; unit: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; note?: string;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cwm-text-muted)', letterSpacing: '0.03em' }}>{label}</label>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cwm-accent)', fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(step < 1 ? 1 : 0)} {unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 3 }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {note && <div style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginTop: 4, fontStyle: 'italic' }}>{note}</div>}
    </div>
  );
}

function OutputCard({
  label, value, unit, delta, positiveIsGood, threshold, thresholdIsMin, tone,
}: {
  label: string;
  value: string;
  unit:  string;
  delta?: number | null;
  positiveIsGood?: boolean;
  threshold?: number;
  thresholdIsMin?: boolean;
  tone?: 'good' | 'bad';
}) {
  const numericValue = Number(value);
  let valueColor: string | undefined;
  if (threshold !== undefined && !isNaN(numericValue)) {
    const bad = thresholdIsMin ? numericValue < threshold : numericValue > threshold;
    valueColor = bad ? 'var(--cwm-danger)' : undefined;
  }
  if (tone === 'good') valueColor = 'var(--cwm-success)';
  if (tone === 'bad')  valueColor = 'var(--cwm-danger)';

  let deltaEl: React.ReactNode = null;
  if (delta !== null && delta !== undefined && Math.abs(delta) > 1e-4) {
    const good = positiveIsGood ? delta > 0 : delta < 0;
    const color = good ? 'var(--cwm-success)' : 'var(--cwm-danger)';
    const sign = delta > 0 ? '+' : '';
    deltaEl = (
      <span style={{ fontSize: 10, fontWeight: 700, color, marginLeft: 6 }}>
        {sign}{delta.toFixed(Math.abs(delta) < 1 ? 3 : 1)}
      </span>
    );
  }

  return (
    <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--cwm-border)', borderRadius: 5 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: valueColor ?? 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', marginLeft: 4 }}>{unit}</span>
        {deltaEl}
      </div>
    </div>
  );
}

function RunComparisonTable({ runs }: { runs: SandboxRun[] }) {
  const baseline = runs[runs.length - 1];   // earliest run
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--cwm-border)' }}>
            {['Run', 'When', 'Fuel kg/h', 'IGV°', 'RPM %', 'Power kW', 'SFC kg/kWh', 'TGT °C', 'Surge %', 'Status'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 8px', fontSize: 10, fontWeight: 600, color: 'var(--cwm-text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => {
            const isBaseline = r.id === baseline.id;
            const dPower = isBaseline ? 0 : r.outputs.powerKW    - baseline.outputs.powerKW;
            const dSfc   = isBaseline ? 0 : r.outputs.sfcKgPerKWh - baseline.outputs.sfcKgPerKWh;
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={cellStyle}>#{runs.length - i}{isBaseline && <span style={{ marginLeft: 5, fontSize: 9, color: 'var(--cwm-accent)', fontWeight: 700 }}>BASE</span>}</td>
                <td style={cellStyle}>{r.timestamp.toLocaleTimeString('en-GB')}</td>
                <td style={cellStyle}>{r.inputs.fuelFlowKgH.toFixed(2)}</td>
                <td style={cellStyle}>{r.inputs.bladeAngleDeg.toFixed(1)}</td>
                <td style={cellStyle}>{r.inputs.rpmTargetPct.toFixed(0)}</td>
                <td style={cellStyle}>
                  {r.outputs.powerKW.toFixed(1)}
                  {!isBaseline && <DeltaBadge value={dPower} positiveIsGood />}
                </td>
                <td style={cellStyle}>
                  {r.outputs.sfcKgPerKWh.toFixed(3)}
                  {!isBaseline && <DeltaBadge value={dSfc} positiveIsGood={false} />}
                </td>
                <td style={{ ...cellStyle, color: r.outputs.jpt1PeakC > 900 ? 'var(--cwm-danger)' : 'var(--cwm-text)' }}>{r.outputs.jpt1PeakC.toFixed(0)}</td>
                <td style={{ ...cellStyle, color: r.outputs.surgeMargin < 6 ? 'var(--cwm-danger)' : 'var(--cwm-text)' }}>{r.outputs.surgeMargin.toFixed(1)}</td>
                <td style={cellStyle}>
                  <span style={{
                    padding: '2px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                    color: r.outputs.feasible ? 'var(--cwm-success)' : 'var(--cwm-danger)',
                    border: `1px solid ${r.outputs.feasible ? 'var(--cwm-success)' : 'var(--cwm-danger)'}`,
                    borderRadius: 3,
                  }}>{r.outputs.feasible ? 'OK' : 'NO-GO'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeltaBadge({ value, positiveIsGood }: { value: number; positiveIsGood: boolean }) {
  if (Math.abs(value) < 1e-4) return null;
  const good = positiveIsGood ? value > 0 : value < 0;
  const color = good ? 'var(--cwm-success)' : 'var(--cwm-danger)';
  const sign = value > 0 ? '+' : '';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, marginLeft: 5 }}>
      {sign}{value.toFixed(Math.abs(value) < 1 ? 3 : 1)}
    </span>
  );
}

function TradeoffPlot({ runs }: { runs: SandboxRun[] }) {
  const baseline = runs[runs.length - 1];
  const pts = runs.map(r => ({
    sfc:   r.outputs.sfcKgPerKWh,
    power: r.outputs.powerKW,
    feasible: r.outputs.feasible,
    isBase: r.id === baseline.id,
  }));
  const minSfc = Math.min(...pts.map(p => p.sfc));
  const maxSfc = Math.max(...pts.map(p => p.sfc));
  const minPow = Math.min(...pts.map(p => p.power));
  const maxPow = Math.max(...pts.map(p => p.power));
  const padX = (maxSfc - minSfc) * 0.1 + 0.01;
  const padY = (maxPow - minPow) * 0.1 + 1;
  const w = 100, h = 60;
  const pad = { left: 8, right: 4, top: 4, bottom: 9 };
  const sx = (sfc: number) => pad.left + ((sfc - (minSfc - padX)) / Math.max(0.001, (maxSfc + padX) - (minSfc - padX))) * (w - pad.left - pad.right);
  const sy = (pow: number) => pad.top + (1 - (pow - (minPow - padY)) / Math.max(0.001, (maxPow + padY) - (minPow - padY))) * (h - pad.top - pad.bottom);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 220 }}>
      {/* Axes */}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={h - pad.bottom} stroke="rgba(255,255,255,0.15)" strokeWidth="0.2" />
      <line x1={pad.left} y1={h - pad.bottom} x2={w - pad.right} y2={h - pad.bottom} stroke="rgba(255,255,255,0.15)" strokeWidth="0.2" />

      {/* Points */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={sx(p.sfc)} cy={sy(p.power)} r={p.isBase ? 1.4 : 1.0}
            fill={p.isBase ? 'var(--cwm-accent)' : p.feasible ? 'var(--cwm-success)' : 'var(--cwm-danger)'}
            stroke="white" strokeWidth="0.15"
          />
          {p.isBase && (
            <text x={sx(p.sfc) + 2} y={sy(p.power) + 1} fontSize="2" fill="var(--cwm-accent)">baseline</text>
          )}
        </g>
      ))}

      {/* Axis labels */}
      <text x={w / 2} y={h - 1.5} fontSize="2.5" fill="rgba(255,255,255,0.55)" textAnchor="middle">SFC (kg/kWh) →</text>
      <text x={1.5} y={h / 2} fontSize="2.5" fill="rgba(255,255,255,0.55)" textAnchor="middle" transform={`rotate(-90 1.5 ${h / 2})`}>Power (kW) →</text>

      {/* Min/max labels */}
      <text x={pad.left} y={h - pad.bottom + 3} fontSize="2.2" fill="rgba(255,255,255,0.5)">{minSfc.toFixed(2)}</text>
      <text x={w - pad.right - 4} y={h - pad.bottom + 3} fontSize="2.2" fill="rgba(255,255,255,0.5)">{maxSfc.toFixed(2)}</text>
      <text x={1} y={pad.top + 2} fontSize="2.2" fill="rgba(255,255,255,0.5)">{maxPow.toFixed(0)}</text>
      <text x={1} y={h - pad.bottom} fontSize="2.2" fill="rgba(255,255,255,0.5)">{minPow.toFixed(0)}</text>
    </svg>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '7px 8px', color: 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
};
const primaryBtn: React.CSSProperties = {
  padding: '9px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  background: 'var(--cwm-accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '9px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  background: 'transparent', color: 'var(--cwm-text)', border: '1px solid var(--cwm-border)', borderRadius: 6, cursor: 'pointer',
};

function SandboxMetric({ label, value, limit, bad }: { label: string; value: string; limit: string; bad: boolean }) {
  return (
    <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, border: `1px solid ${bad ? 'var(--cwm-danger-border, #7f1d1d)' : 'var(--cwm-border)'}` }}>
      <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: bad ? 'var(--cwm-danger)' : 'var(--cwm-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--cwm-text-faint)', marginTop: 2, fontStyle: 'italic' }}>{limit}</div>
    </div>
  );
}
