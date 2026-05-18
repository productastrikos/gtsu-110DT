import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useGTSUStore } from '../store/useGTSUStore';
import { mapComponentOverlays } from '../lib/digitalTwinMapper';
import { Eye, EyeOff, Thermometer, AlertTriangle, Activity, Cpu, ChevronRight } from 'lucide-react';
import { EngineDigitalTwin } from '../components/EngineDigitalTwin';

// ─── Component Detail Panel ──────────────────────────────────────────────────

const COMPONENT_INFO: Record<string, { name: string; desc: string; nominal: string }> = {
  housing:    { name: 'Outer Housing', desc: 'Structural enclosure and heat shield', nominal: 'T < 250°C' },
  stator:     { name: 'Stator Winding', desc: 'Field electromagnet windings', nominal: 'T < 155°C insulation class F' },
  armature:   { name: 'Armature', desc: 'Rotating electrical conductor assembly', nominal: 'Balance ≤ 0.3 g·mm' },
  commutator: { name: 'Commutator', desc: 'Current reversal ring, brush contact surface', nominal: 'Wear < 0.5 mm radial' },
  gear:       { name: 'Gear Assembly', desc: 'Reduction gearbox and pinion engagement', nominal: 'Backlash 0.08–0.15 mm' },
  solenoid:   { name: 'Engage Solenoid', desc: 'Electromechanical pinion engagement actuator', nominal: 'Pull-in 24 V ±10%' },
  endbell:    { name: 'Drive End Bell', desc: 'Bearing housing, drive shaft seal', nominal: 'Radial clearance ≤ 0.05 mm' },
  bracket:    { name: 'Mounting Bracket', desc: 'Engine attachment interface', nominal: 'No cracks, torque verified' },
  brushes:    { name: 'Carbon Brushes', desc: 'Current transfer sliding contacts', nominal: 'Length > 12 mm, pressure 2.3 N' },
  bearings:   { name: 'Main Bearings', desc: 'Front and rear rotor support bearings', nominal: 'Vibration < 7.5 mm/s rms' },
};

function ComponentDetailPanel({ componentId, onClose }: { componentId: string; onClose: () => void }) {
  const { telemetry, physicsBaseline, residuals, activeFaults, vibration, thermalLifeConsumed } = useGTSUStore();
  const info = COMPONENT_INFO[componentId];
  const faults = activeFaults.filter(f => f.linkedComponentId === componentId);
  const residual = residuals.find(r => {
    const ch = r.channel.toLowerCase();
    if (componentId === 'bearings' && ch.includes('vibration')) return true;
    if (componentId === 'stator' && ch.includes('jpt')) return true;
    if (componentId === 'gear' && ch.includes('p2')) return true;
    return false;
  });

  if (!info) return null;

  return (
    <div className="absolute right-4 top-4 bottom-4 w-80 bg-gray-900 border border-gray-700 rounded-xl p-5 overflow-y-auto shadow-2xl z-10">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">{info.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{info.desc}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-2 shrink-0">✕</button>
      </div>

      {/* Status */}
      <div className={`rounded-lg p-3 mb-4 border ${faults.length === 0 ? 'border-green-800/40 bg-green-900/10' : faults.some(f => f.severity === 'critical') ? 'border-red-800/40 bg-red-900/10' : 'border-amber-800/40 bg-amber-900/10'}`}>
        <p className="text-xs text-gray-400 mb-1">Component Status</p>
        {faults.length === 0 ? (
          <p className="text-green-300 font-medium text-sm">NOMINAL</p>
        ) : (
          faults.map(f => (
            <p key={f.id} className={`text-sm font-medium ${f.severity === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>
              {f.title}
            </p>
          ))
        )}
      </div>

      {/* Telemetry */}
      <div className="space-y-2 mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Current Readings</p>
        {componentId === 'bearings' && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Vibration</span>
            <span className={`font-mono ${vibration > 11 ? 'text-red-400' : vibration > 7.5 ? 'text-amber-400' : 'text-green-400'}`}>
              {vibration.toFixed(2)} mm/s
            </span>
          </div>
        )}
        {(componentId === 'stator' || componentId === 'housing') && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">JPT1</span>
            <span className={`font-mono ${telemetry.jpt1 > 900 ? 'text-red-400' : telemetry.jpt1 > 870 ? 'text-amber-400' : 'text-green-400'}`}>
              {telemetry.jpt1.toFixed(0)} °C
            </span>
          </div>
        )}
        {componentId === 'gear' && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">P2/P1</span>
            <span className="text-white font-mono">{telemetry.p2p1.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Thermal Life</span>
          <span className={`font-mono ${thermalLifeConsumed > 0.8 ? 'text-red-400' : thermalLifeConsumed > 0.6 ? 'text-amber-400' : 'text-green-400'}`}>
            {(thermalLifeConsumed * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Nominal Range</span>
          <span className="text-gray-300 text-right max-w-[140px]">{info.nominal}</span>
        </div>
      </div>

      {/* Residual */}
      {residual && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Model Residual</p>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">{residual.channel}</span>
            <span className={`font-mono ${Math.abs(residual.normalised) > 2 ? 'text-red-400' : Math.abs(residual.normalised) > 1.5 ? 'text-amber-400' : 'text-gray-300'}`}>
              {residual.residual.toFixed(2)} ({residual.normalised.toFixed(1)}σ)
            </span>
          </div>
        </div>
      )}

      {/* Faults */}
      {faults.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Active Faults</p>
          {faults.map(f => (
            <div key={f.id} className="bg-gray-800 rounded p-3 mb-2 text-xs">
              <p className="font-medium text-white">{f.title}</p>
              <p className="text-gray-400 mt-1">{f.rootCause}</p>
              <p className="text-blue-400 mt-1 font-medium">{f.recommendation.split('.')[0]}.</p>
            </div>
          ))}
        </div>
      )}

      {/* Physics baseline */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Physics Model Expected</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-gray-400">JPT1 exp.</span><span className="font-mono text-gray-300">{physicsBaseline.expectedJpt1.toFixed(0)} °C</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Ngg exp.</span><span className="font-mono text-gray-300">{physicsBaseline.expectedNggPct.toFixed(1)} %</span></div>
          <div className="flex justify-between"><span className="text-gray-400">P2/P1 exp.</span><span className="font-mono text-gray-300">{physicsBaseline.expectedP2p1.toFixed(2)}</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DigitalTwinPage() {
  const { telemetry, activeFaults, physicsBaseline, focusedComponentId, focusComponent } = useGTSUStore();
  const [showThermal, setShowThermal]   = useState(true);
  const [showFaults, setShowFaults]     = useState(true);
  const [selectedComp, setSelectedComp] = useState<string | null>(null);

  const overlays = mapComponentOverlays(activeFaults, telemetry.jpt1, telemetry.nggPct, telemetry.p2p1);

  const componentStatuses: Record<string, 'normal' | 'warning' | 'critical'> = {};
  overlays.forEach(o => { componentStatuses[o.componentId] = o.severity; });

  function handleComponentClick(id: string) {
    setSelectedComp(prev => prev === id ? null : id);
    focusComponent(id);
  }

  const opCall = activeFaults.length === 0 ? 'go'
    : activeFaults.some(f => f.operationalCall === 'no-go') ? 'no-go'
    : activeFaults.some(f => f.operationalCall === 'watch') ? 'watch' : 'go';
  const opCallColor = opCall === 'go' ? 'text-slate-200 border-slate-600/50 bg-slate-800/40'
    : opCall === 'watch' ? 'text-amber-200 border-amber-800/50 bg-amber-950/30'
    : 'text-rose-200 border-red-800/50 bg-red-950/30';

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left panel — component list */}
      <div className="w-56 shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Components</h2>
          <div className={`mt-2 rounded border px-2 py-1 text-xs font-bold uppercase ${opCallColor}`}>
            {opCall}
          </div>
        </div>
        <div className="flex-1 py-2">
          {Object.entries(COMPONENT_INFO).map(([id, info]) => {
            const sev = componentStatuses[id] ?? 'normal';
            const dot = sev === 'critical' ? 'bg-rose-400/80' : sev === 'warning' ? 'bg-amber-400/70' : 'bg-slate-500';
            return (
              <button
                key={id}
                onClick={() => handleComponentClick(id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-800/50 transition-colors ${selectedComp === id ? 'bg-gray-800/70 border-l-2 border-white/40' : 'border-l-2 border-transparent'}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                <span className="text-xs text-gray-300 truncate">{info.name}</span>
                <ChevronRight size={12} className="ml-auto text-gray-600 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Overlay toggles */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Overlays</p>
          <button onClick={() => setShowThermal(v => !v)} className={`flex items-center gap-2 text-xs w-full ${showThermal ? 'text-amber-300' : 'text-gray-500'}`}>
            <Thermometer size={12} />{showThermal ? 'Thermal ON' : 'Thermal OFF'}
          </button>
          <button onClick={() => setShowFaults(v => !v)} className={`flex items-center gap-2 text-xs w-full ${showFaults ? 'text-red-400' : 'text-gray-500'}`}>
            <AlertTriangle size={12} />{showFaults ? 'Faults ON' : 'Faults OFF'}
          </button>
        </div>
      </div>

      {/* 3D canvas */}
      <div className="flex-1 relative bg-gray-950">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading 3D model…</div>}>
          <EngineDigitalTwin
            componentStatuses={showFaults ? componentStatuses : {}}
            onComponentClick={handleComponentClick}
            selectedComponent={selectedComp ?? undefined}
          />
        </Suspense>

        {/* HUD */}
        <div className="absolute top-4 left-4 space-y-1 pointer-events-none">
          <div className="bg-gray-900/80 border border-gray-700/60 rounded px-3 py-1.5 backdrop-blur-sm">
            <p className="text-xs text-gray-400">GTSU-110 <span className="text-white font-mono ml-2">{telemetry.startPhase.replace('-', ' ').toUpperCase()}</span></p>
          </div>
          <div className="bg-gray-900/80 border border-gray-700/60 rounded px-3 py-1.5 backdrop-blur-sm">
            <p className="text-xs">
              <span className="text-gray-400">JPT1 </span><span className={`font-mono ${telemetry.jpt1 > 900 ? 'text-red-400' : 'text-white'}`}>{telemetry.jpt1.toFixed(0)}°C</span>
              <span className="text-gray-400 mx-2">|</span>
              <span className="text-gray-400">Ngg </span><span className="text-white font-mono">{telemetry.nggPct.toFixed(1)}%</span>
              <span className="text-gray-400 mx-2">|</span>
              <span className="text-gray-400">Faults </span><span className={`font-mono ${activeFaults.length > 0 ? 'text-amber-400' : 'text-green-400'}`}>{activeFaults.length}</span>
            </p>
          </div>
        </div>

        {/* Fault badges */}
        {showFaults && activeFaults.length > 0 && (
          <div className="absolute bottom-4 left-4 space-y-1 max-w-xs pointer-events-none">
            {activeFaults.slice(0, 3).map(f => (
              <div key={f.id} className={`text-xs px-3 py-1.5 rounded border ${f.severity === 'critical' ? 'bg-red-900/60 border-red-700/60 text-red-200' : 'bg-amber-900/60 border-amber-700/60 text-amber-200'}`}>
                {f.title} — {f.affectedComponent}
              </div>
            ))}
          </div>
        )}

        {/* Component detail panel */}
        {selectedComp && (
          <ComponentDetailPanel componentId={selectedComp} onClose={() => { setSelectedComp(null); focusComponent(null); }} />
        )}
      </div>
    </div>
  );
}
