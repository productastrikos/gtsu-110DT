/**
 * EngineModel3D
 *
 * Lean 3D engine viewer with hotspot markers overlaid on individual
 * components. Each page provides its own hotspot list (per-page metrics,
 * thresholds, status colors).
 *
 * The engine mesh inside the inner <group> rotates with Ngg RPM; the
 * hotspots and labels live OUTSIDE that group so they stay stationary
 * and readable while the engine spins beneath them.
 */

import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Lightformer, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CycleTraceSample } from '../types/engine';
import { useGTSUStore } from '../store/useGTSUStore';

// NOTE: the file on disk is all-lowercase (public/turboshaftengine.glb).
// The path MUST match exactly — case-sensitive hosts (and Vite's asset
// server) 404 on a casing mismatch, which blanks the 3D twin.
const MODEL_PATH = '/turboshaftengine.glb';
const MAX_RPM = 22000;

// ── Hotspot model ───────────────────────────────────────────────────────

export type HotspotSeverity = 'good' | 'warn' | 'orange' | 'bad';

export interface EngineHotspot {
  id:        string;
  position:  [number, number, number];     // world coords in the normalized engine frame
  label:     string;
  value:     string;                       // primary readout, e.g. "78%"
  metric?:   string;                       // optional secondary line, e.g. "wear · 870 hrs left"
  severity:  HotspotSeverity;
  delta?:    string;                       // optional small badge, e.g. "+4.2%"
  deltaTone?:'good' | 'bad';
}

const SEV_COLOR: Record<HotspotSeverity, string> = {
  good:   '#16a34a',
  warn:   '#eab308',
  orange: '#f97316',
  bad:    '#dc2626',
};

// ── WebGL detection ─────────────────────────────────────────────────────

const HAS_WEBGL: boolean = (() => {
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    return !!ctx;
  } catch { return false; }
})();

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <WebGLUnavailable /> : this.props.children; }
}

/** Silently swallows errors from Environment HDR loading (e.g. CDN offline). */
class EnvBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function WebGLUnavailable() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 8,
      background: 'rgba(8,14,22,0.96)', fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>
        3D RENDERER UNAVAILABLE
      </div>
      <div style={{ color: '#8ca0b6', fontSize: 11, textAlign: 'center', maxWidth: 360 }}>
        Enable hardware acceleration in browser settings and reload.
      </div>
    </div>
  );
}

// ── Engine mesh (selective rotation) ───────────────────────────────────
// This GLB is one merged mesh whose primitives are split by MATERIAL: the
// casing/structure use greyscale steel, while the rotating blades/discs use
// CHROMATIC materials (reddish / bluish). We spin only the chromatic parts —
// i.e. the parts that actually rotate in a turboshaft — leaving the casing
// static. `isRotorMaterialColor` decides per source material.
function isRotorMaterialColor(col?: THREE.Color): boolean {
  if (!col) return false;
  return Math.abs(col.r - col.g) > 0.06 || Math.abs(col.g - col.b) > 0.06 || Math.abs(col.r - col.b) > 0.06;
}

// ── GTSU section identity (base albedo per section for contrast) ──────────
// Even though the mesh is a generic turboshaft, we tint each region so the
// twin READS as the GTSU-110: distinct inlet / compressor / hot-section /
// power-turbine / output-shaft / gearbox colours give the "sections" contrast.
export type SectionKey =
  | 'inlet' | 'compressor' | 'combustor' | 'gas-gen-turbine'
  | 'power-turbine' | 'output-shaft' | 'gearbox' | 'other';

export const SECTION_TINT: Record<SectionKey, { color: string; metalness: number; roughness: number; label: string; sub: string }> = {
  'inlet':           { color: '#64748b', metalness: 0.45, roughness: 0.50, label: 'Inlet',           sub: 'air intake' },
  'compressor':      { color: '#3b82f6', metalness: 0.52, roughness: 0.40, label: 'Compressor',      sub: 'N1 spool' },
  'combustor':       { color: '#b06a3f', metalness: 0.42, roughness: 0.50, label: 'Combustor',       sub: 'annular' },
  'gas-gen-turbine': { color: '#c2703f', metalness: 0.56, roughness: 0.38, label: 'Gas-Gen Turbine', sub: 'N1 · HP' },
  'power-turbine':   { color: '#a855f7', metalness: 0.52, roughness: 0.40, label: 'Power Turbine',   sub: 'N2 · free' },
  'output-shaft':    { color: '#ec4899', metalness: 0.55, roughness: 0.42, label: 'Output Shaft',    sub: 'to load' },
  'gearbox':         { color: '#78716c', metalness: 0.55, roughness: 0.50, label: 'Gearbox',         sub: 'accessory' },
  'other':           { color: '#7c848e', metalness: 0.25, roughness: 0.60, label: 'Structure',       sub: '' },
};

// ── Per-primitive component palette ─────────────────────────────────────────
// This GLB is a single merged mesh ("TurboShaft Engine Assembly") split into
// several MATERIAL primitives (a large steel body + coloured sub-parts). Three
// loads each primitive as its own sub-mesh, so we colour each one distinctly —
// every individual component then reads as a separate part. Colours avoid the
// RAG status hues (green/amber/red) reserved for the live health emissive.
const ENGINE_PART_PALETTE = [
  '#5a7a9e', // main body / casing — calm steel blue
  '#d1587a', // rose
  '#46a5c9', // cyan
  '#e0a458', // gold
  '#9b6fd4', // purple
  '#4fb0a5', // teal
  '#c98b3a', // amber
  '#e07a5f', // terracotta
];

// Labelled GTSU sections positioned along the engine axis (X). These make the
// twin identifiable as a GTSU even though the mesh is a generic TS engine.
export interface SectionTagDef { key: SectionKey; position: [number, number, number]; }
const SECTION_LABELS: SectionTagDef[] = [
  { key: 'inlet',           position: [-1.55, -0.55, 0] },
  { key: 'compressor',      position: [-0.85, -0.78, 0] },
  { key: 'combustor',       position: [-0.05, -0.55, 0] },
  { key: 'gas-gen-turbine', position: [ 0.60, -0.78, 0] },
  { key: 'power-turbine',   position: [ 1.20, -0.55, 0] },
  { key: 'output-shaft',    position: [ 1.62, -0.78, 0] },
];

// ── Per-node health-status colouring ────────────────────────────────
// Each mapped part always shows its health when the simulation is running.
//   0 = ok       → green  (nominal / healthy)
//   1 = warn     → amber  (approaching limit)
//   2 = caution  → orange (at limit)
//   3 = alert    → red    (exceeded limit)
// When frame is null (simulation stopped) every part fades to dark.
const SEV_EMISSIVE: [number, number, number, number][] = [
  [0.00, 0.70, 0.22, 0.28], // 0 ok      – green   (calm, easy on the eye)
  [0.85, 0.55, 0.00, 0.55], // 1 warn    – amber
  [1.00, 0.28, 0.00, 0.72], // 2 caution – orange
  [1.00, 0.00, 0.00, 0.95], // 3 alert   – red
];
const DARK: [number, number, number, number] = [0, 0, 0, 0];

type Sev = 0 | 1 | 2 | 3;
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

// ── Turbine / hot-section: TGT temperature ───────────────────────────
// Normal light-up peak ≈ 650–750 °C  →  green
// Above normal peak                  →  escalate to red
function jptHealthSev(jpt1: number): Sev {
  if (jpt1 > 950) return 3;   // critical overtemp / hot start
  if (jpt1 > 850) return 2;   // hot start zone
  if (jpt1 > 750) return 1;   // above normal peak
  return 0;                    // normal operating range
}

// ── Compressor blades: Ngg shaft speed ───────────────────────────────
// Any spin in the normal range → green; flag only near/over speed limit
function nggHealthSev(pct: number): Sev {
  if (pct > 98) return 3;    // overspeed
  if (pct > 93) return 2;    // near overspeed
  if (pct > 88) return 1;    // above nominal target
  return 0;                   // healthy speed range
}

// ── Shaft / gearbox: vibration ────────────────────────────────────────
function vibHealthSev(vib: number): Sev {
  if (vib > 5.0) return 3;
  if (vib > 3.0) return 2;
  if (vib > 1.5) return 1;
  return 0;
}

/** Maps named GLB nodes to a health-status function (used when a model exposes
 *  per-component nodes). The current merged-mesh GLB has none, so this is inert. */
const NODE_SEV: Record<string, (f: CycleTraceSample) => Sev> = {
  // HP turbine — temperature (hot section)
  'hp_turbine_0':    f => jptHealthSev(f.jpt1),
  // Power turbine disc — temperature (hot section rotor)
  'power_turbine_0': f => jptHealthSev(f.jpt1),
  // Output shaft — vibration
  'output_shaft_0':  f => vibHealthSev(f.vibration),
  // Compressor spool/drum — shaft speed
  'compressor_0':    f => nggHealthSev(f.nggPct),
  // Compressor blade discs — shaft speed
  'compressor_1':    f => nggHealthSev(f.nggPct),
  'compressor_2':    f => nggHealthSev(f.nggPct),
  'compressor_3':    f => nggHealthSev(f.nggPct),
  'compressor_4':    f => nggHealthSev(f.nggPct),
  'compressor_5':    f => nggHealthSev(f.nggPct),
  'compressor_6':    f => nggHealthSev(f.nggPct),
  'compressor_7':    f => nggHealthSev(f.nggPct),
  'compressor_8':    f => nggHealthSev(f.nggPct),
  'compressor_9':    f => nggHealthSev(f.nggPct),
  'compressor_10':   f => nggHealthSev(f.nggPct),
  'compressor_11':   f => nggHealthSev(f.nggPct),
};

// Per-node lerp state (persists across renders for smooth transitions)
const _nodeLerp = new Map<string, [number,number,number,number]>();
const LERP_SPEED = 3; // units per second

function EngineMesh({ frame }: { frame: CycleTraceSample | null }) {
  const { scene } = useGLTF(MODEL_PATH);

  /**
   * A single pivot Group positioned exactly at the shaft centre-line.
   * Rotating this group around X makes all rotor children spin in place.
   */
  const pivotRef = useRef<THREE.Group | null>(null);

  const normalized = useMemo(() => {
    const root = scene.clone();

    // ── 1. Normalise scale + centre ──────────────────────────────────
    const box    = new THREE.Box3().setFromObject(root);
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s      = 2.6 / maxDim;
    // Shaft axis = the engine's longest dimension (its axis of revolution).
    const shaftAxis: 'x' | 'y' | 'z' =
      size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
    root.scale.setScalar(s);
    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    root.position.sub(center);

    // Flush world matrices so worldToLocal / getWorldPosition are accurate
    root.updateWorldMatrix(true, true);

    // ── 2. Apply materials — one distinct colour per sub-mesh/primitive,
    //     and flag the ROTATING parts by their original (chromatic) material. ─
    let partIndex = 0;
    const rotorMeshes: THREE.Object3D[] = [];
    root.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;

      const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      // Rotor detection from the ORIGINAL material colour (before recolouring):
      // chromatic materials = blades/discs (rotate); greyscale = casing (static).
      if (srcMats.some(m => isRotorMaterialColor((m as THREE.MeshStandardMaterial).color))) {
        rotorMeshes.push(mesh);
      }

      // Distinct palette colour per primitive/sub-mesh (visual identification).
      const partColor = ENGINE_PART_PALETTE[partIndex % ENGINE_PART_PALETTE.length];
      partIndex++;
      const ownMats = srcMats.map(m => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        c.emissive          = new THREE.Color(0x000000);
        c.emissiveIntensity = 0;
        c.color             = new THREE.Color(partColor);
        c.metalness         = 0.55;
        c.roughness         = 0.42;
        c.transparent       = false;
        c.opacity           = 1;
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? ownMats : ownMats[0];
    });

    // ── 3. Reparent ONLY the rotating parts (chromatic blade/disc meshes)
    //     into a pivot on the shaft centre-line. The casing stays put. ──
    if (rotorMeshes.length > 0) {
      // Shaft centre = combined bbox of all rotor geometry (world space).
      const shaftBox = new THREE.Box3();
      rotorMeshes.forEach(o => shaftBox.expandByObject(o));
      const shaftWorldCenter = shaftBox.getCenter(new THREE.Vector3());

      const pivot = new THREE.Group();
      pivot.position.copy(root.worldToLocal(shaftWorldCenter.clone()));
      root.add(pivot);
      root.updateWorldMatrix(true, true);   // flush so attach() sees current matrices

      // Object3D.attach() reparents each mesh while PRESERVING its full world
      // transform (position + orientation + scale). This matters because the
      // GLB's root node carries a 90° X quaternion: a position-only reparent
      // (getWorldPosition + worldToLocal) dropped that rotation, flinging the
      // rotor discs out of the casing as a phantom "second engine". attach()
      // keeps every rotor seated exactly where and how it was authored, so the
      // only thing the pivot changes is the shaft-axis spin.
      for (const obj of rotorMeshes) {
        pivot.attach(obj);
      }

      // Stable name so we can find the pivot after render (setting the ref
      // inside useMemo breaks under React 18 StrictMode double-invoke).
      pivot.name = '__shaft_pivot__';
    }

    root.userData.shaftAxis = shaftAxis;
    return root;
  }, [scene]);

  // Sync the pivot ref AFTER the normalised tree is committed to the scene.
  // useEffect is safe here: it runs after React commits, so `normalized`
  // is the tree that R3F will actually render via <primitive>.
  useEffect(() => {
    pivotRef.current =
      (normalized.getObjectByName('__shaft_pivot__') as THREE.Group) ?? null;
    return () => { pivotRef.current = null; };
  }, [normalized]);

  useFrame((state, delta) => {
    // Playing in ANY mode: replay (▶), database console, or live stream.
    const st        = useGTSUStore.getState();
    const playing   = st.isPlaying || st.consoleIsPlaying || st.liveMode;
    const rpm       = playing ? (frame?.ngg ?? 0) : 0;
    // Rotation speed proportional to N1 (gas-generator) RPM — up to ~2.5 rev/s.
    const radPerSec = (rpm / MAX_RPM) * 5 * Math.PI;

    // Spin ONLY the rotor pivot (the chromatic blade/disc meshes) about the
    // shaft axis; the casing stays static. Stops the instant playback pauses.
    if (pivotRef.current) {
      const axis = (normalized.userData.shaftAxis as 'x' | 'y' | 'z') ?? 'z';
      pivotRef.current.rotation[axis] += radPerSec * delta;
    }

    // Pulse multiplier for non-ok states: slow breathing effect (0.7–1.0)
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 3.5) * 0.15;

    // Per-node status colouring — lerp toward target severity colour
    normalized.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;

      const sevFn = NODE_SEV[obj.name];
      const sev   = (frame && sevFn) ? sevFn(frame) : -1;
      // -1 = no frame / unmapped → fade to dark
      const target = sev >= 0 ? SEV_EMISSIVE[sev] : DARK;

      // Initialise lerp state on first encounter
      if (!_nodeLerp.has(obj.name)) _nodeLerp.set(obj.name, [0,0,0,0]);
      const cur = _nodeLerp.get(obj.name)!;
      const t   = clamp01(LERP_SPEED * delta);
      cur[0] += (target[0] - cur[0]) * t;
      cur[1] += (target[1] - cur[1]) * t;
      cur[2] += (target[2] - cur[2]) * t;
      cur[3] += (target[3] - cur[3]) * t;

      // Apply pulse only on warn/caution/alert so green stays steady
      const intensityMod = sev > 0 ? pulse : 1.0;

      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => {
        const std = m as THREE.MeshStandardMaterial;
        if ('emissive' in std) {
          std.emissive.setRGB(cur[0], cur[1], cur[2]);
          std.emissiveIntensity = cur[3] * intensityMod;
        }
      });
    });
  });

  return <primitive object={normalized} />;
}

// ── Hotspot pulse (per-marker animated dot) ─────────────────────────────

function HotspotMarker({
  hotspot, hovered, onHover, onClick, showLabels = true,
}: {
  hotspot: EngineHotspot;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick?: (id: string) => void;
  showLabels?: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ringRef.current) return;
    const t = state.clock.getElapsedTime();
    const s = 1 + Math.sin(t * 3) * 0.18;
    ringRef.current.scale.setScalar(s);
  });

  const color = SEV_COLOR[hotspot.severity];

  return (
    <group position={hotspot.position}>
      {/* Core dot */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); onHover(hotspot.id); }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onClick?.(hotspot.id); }}
      >
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Pulsing ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.06, 0.08, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Label card — always when showLabels, otherwise only on hover */}
      {(showLabels || hovered) && (
        <Html position={[0.08, 0.12, 0]} distanceFactor={6} occlude={false} zIndexRange={[10, 0]}>
          <div
            style={{
              pointerEvents: 'none',
              background: 'rgba(8,12,18,0.92)',
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: hovered ? '6px 10px' : '4px 8px',
              fontFamily: 'monospace',
              transform: 'translate(0, -100%)',
              whiteSpace: 'nowrap',
              transition: 'padding 0.15s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 7, fontWeight: 700, color: '#afc3d8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {hotspot.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{hotspot.value}</span>
              {hotspot.delta && (
                <span style={{
                  fontSize: 7, fontWeight: 700,
                  color: hotspot.deltaTone === 'bad' ? '#dc2626' : '#16a34a',
                }}>{hotspot.delta}</span>
              )}
            </div>
            {hovered && hotspot.metric && (
              <div style={{ fontSize: 7, color: '#8ca0b6', marginTop: 3, maxWidth: 180, whiteSpace: 'normal' }}>
                {hotspot.metric}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Section tag (labels the GTSU sections along the engine) ─────────────────
function SectionTag({ def }: { def: SectionTagDef }) {
  const t = SECTION_TINT[def.key];
  return (
    <group position={def.position}>
      <Html distanceFactor={7} occlude={false} zIndexRange={[5, 0]} center>
        <div style={{
          pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(8,12,18,0.78)', border: `1px solid ${t.color}`,
          borderRadius: 5, padding: '3px 7px', fontFamily: 'monospace', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: t.color, flexShrink: 0 }} />
          <span style={{ fontSize: 8, fontWeight: 700, color: '#e8eef5', letterSpacing: '0.04em' }}>{t.label}</span>
          {t.sub && <span style={{ fontSize: 7, color: '#8ca0b6' }}>· {t.sub}</span>}
        </div>
      </Html>
    </group>
  );
}

// ── Scene ───────────────────────────────────────────────────────────────

function Scene({
  frame, hotspots, onHotspotClick, showLabels = true, showSections = true,
}: {
  frame: CycleTraceSample | null;
  hotspots?: EngineHotspot[];
  onHotspotClick?: (id: string) => void;
  showLabels?: boolean;
  showSections?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 8, 6]} intensity={1.1} castShadow />
      <directionalLight position={[-4, -2, -3]} intensity={0.4} color="#5fa8ff" />

      {/* Procedural studio environment for metal reflections.
          Built entirely on the GPU from Lightformers — no network/CDN fetch,
          so the results screen never breaks when offline. */}
      <EnvBoundary>
        <Environment resolution={256}>
          <Lightformer intensity={1.2} position={[0, 5, -5]} scale={[10, 10, 1]} color="#ffffff" />
          <Lightformer intensity={0.6} position={[-6, 1, 1]} scale={[10, 3, 1]} color="#9bc4ff" />
          <Lightformer intensity={0.5} position={[6, -1, 2]} scale={[10, 3, 1]} color="#ffd9a0" />
        </Environment>
      </EnvBoundary>

      {/* Engine mesh — separate suspense so a missing HDR doesn't block it */}
      <Suspense fallback={null}>
        <group>
          <EngineMesh frame={frame} />
        </group>
      </Suspense>

      {showSections && SECTION_LABELS.map((s) => (
        <SectionTag key={s.key} def={s} />
      ))}

      {hotspots?.map((h) => (
        <HotspotMarker
          key={h.id}
          hotspot={h}
          hovered={hovered === h.id}
          onHover={setHovered}
          onClick={onHotspotClick}
          showLabels={showLabels}
        />
      ))}

      <gridHelper args={[8, 16, 0x223344, 0x14202c]} position={[0, -1.4, 0]} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={2.2} maxDistance={14} target={[0, 0, 0]} />

    </>
  );
}

// ── Public component ───────────────────────────────────────────────────

export interface EngineModel3DProps {
  frame:          CycleTraceSample | null;
  hotspots?:      EngineHotspot[];
  onHotspotClick?: (id: string) => void;
  /** Camera position. Default fits the full engine + hotspots. */
  cameraPosition?: [number, number, number];
  /** When false, metric hotspot labels appear only on hover. Default true. */
  showLabels?:    boolean;
  /** When false, GTSU section tags are hidden. Default true. */
  showSections?:  boolean;
}

export function EngineModel3D({ frame, hotspots, onHotspotClick, cameraPosition, showLabels = true, showSections = true }: EngineModel3DProps) {
  if (!HAS_WEBGL) return <WebGLUnavailable />;
  return (
    <WebGLBoundary>
      <Canvas
        camera={{ position: cameraPosition ?? [4.2, 2.6, 4.4], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ background: 'radial-gradient(ellipse at center, #0e1822 0%, #06090d 80%)' }}
      >
        <Scene frame={frame} hotspots={hotspots} onHotspotClick={onHotspotClick} showLabels={showLabels} showSections={showSections} />
      </Canvas>
    </WebGLBoundary>
  );
}

// ── Section legend + label toggle controls (for use beside the canvas) ──────
export function SectionLegend() {
  const keys: SectionKey[] = ['inlet', 'compressor', 'combustor', 'gas-gen-turbine', 'power-turbine', 'output-shaft'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', padding: '4px 8px', fontFamily: 'monospace', fontSize: 9 }}>
      {keys.map(k => {
        const t = SECTION_TINT[k];
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} />
            <span style={{ color: '#afc3d8' }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Small toggle switch matching the app design system. */
export function LabelToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`gtsu-toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      style={{ background: 'transparent', border: 'none', padding: 0 }}
    >
      <span className="tg-track"><span className="tg-knob" /></span>
      <span className="tg-label">{label}</span>
    </button>
  );
}

// ── Legend component for use beside the canvas ──────────────────────────

export function HotspotLegend({ items }: { items: EngineHotspot[] }) {
  if (!items.length) return null;
  const grouped = {
    good:   items.filter(h => h.severity === 'good').length,
    warn:   items.filter(h => h.severity === 'warn').length,
    orange: items.filter(h => h.severity === 'orange').length,
    bad:    items.filter(h => h.severity === 'bad').length,
  };
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 10px', fontFamily: 'monospace', fontSize: 10 }}>
      {(['good', 'warn', 'orange', 'bad'] as const).map(sev => (
        <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: SEV_COLOR[sev] }} />
          <span style={{ color: '#afc3d8' }}>
            {sev === 'good' ? 'OK' : sev === 'warn' ? 'WARN' : sev === 'orange' ? 'DEGRADED' : 'CRITICAL'} · {grouped[sev]}
          </span>
        </div>
      ))}
    </div>
  );
}

useGLTF.preload(MODEL_PATH);
