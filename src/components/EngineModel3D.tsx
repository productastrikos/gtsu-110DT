/**
 * EngineModel3D
 *
 * 3D digital twin built on a PT6C-67C free-turbine turboshaft cutaway, rendered
 * in a single uniform colour so the hardware reads by SHAPE rather than by the
 * asset's photoreal paintwork.
 *
 * Three things drive the model from a CycleTraceSample:
 *   1. Per-section status glow  — emissive injected by SECTION (see SECTIONS)
 *   2. Rotor spin               — N1 and N2 spools turn at their own speeds
 *   3. Hover                    — point at the GEOMETRY to inspect a section
 *
 * Sections are resolved from a position's axial station + radius, NOT from mesh
 * names: the asset's meshes are texture groups that each span the whole engine,
 * so no mesh maps 1:1 to a section. The same rule runs in two places — in the
 * shader (to tint) and on the CPU against the raycast hit (to identify what the
 * cursor is over). Both x and radius are invariant under the rotor's X-axis
 * spin, so the mapping holds on spinning geometry too.
 */

import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Lightformer } from '@react-three/drei';
import { Maximize2, Minimize2 } from 'lucide-react';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import type { CycleTraceSample } from '../types/engine';
import { useGTSUStore } from '../store/useGTSUStore';

// Hovering means raycasting the real engine — ~670k triangles. three's default
// raycast is linear per triangle and would stall the pointer; a BVH makes it
// effectively free. Installed once, at module scope.
// NOTE: three-mesh-bvh must stay >= 0.9 — 0.5.x (what drei pulls in transitively)
// calls Triangle.getUV(), which three removed by r155, so its raycast throws on
// the r161 we run.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const MODEL_PATH = '/pt6c-67c.glb';
// Draco decoder is served from public/draco/ — NOT the gstatic CDN — so the
// twin still loads with no network (matches the offline-safe Environment below).
const DRACO_PATH = '/draco/';

const MAX_N1_RPM = 22000;   // gas-generator governed reference
const MAX_N2_RPM = 33000;   // power/free-turbine governed reference

// ── Hotspot model ───────────────────────────────────────────────────────

export type HotspotSeverity = 'good' | 'warn' | 'orange' | 'bad';

/** One monitored component. `section` says which part of the engine it lives in;
 *  hovering that section's geometry surfaces every component mapped to it. */
export interface EngineHotspot {
  id:        string;
  section:   SectionKey;
  label:     string;
  value:     string;
  metric?:   string;
  severity:  HotspotSeverity;
  delta?:    string;
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
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
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

// ── Engine sections ─────────────────────────────────────────────────────
// Bounds are in MODEL space: the GLB is baked so the shaft axis is the X axis
// through the origin, and the engine spans x −1.30 (air inlet, rear) to +1.30
// (exhaust, front). `r` is the radius from the shaft axis.
//
// The PT6C is REVERSE-FLOW: its annular combustor wraps *around* the
// gas-generator turbine at the same axial station. They are therefore split by
// RADIUS — combustor outboard, gas-gen turbine inboard — which an axial band
// alone cannot do. First match wins.

export type SectionKey =
  | 'inlet' | 'compressor' | 'gas-gen-turbine' | 'combustor'
  | 'power-turbine' | 'exhaust';

export interface SectionDef {
  key: SectionKey;
  x0: number; x1: number;
  r0: number; r1: number;
  label: string;
  /** What the section is, for the hover card. */
  blurb: string;
  color: string;
}

export const SECTIONS: SectionDef[] = [
  { key: 'inlet',           x0: -1.31, x1: -0.82, r0: 0,    r1: 9,    label: 'Inlet & Accessories', blurb: 'Air intake at the rear, with the accessory case and control unit', color: '#64748b' },
  { key: 'compressor',      x0: -0.82, x1:  0.08, r0: 0,    r1: 9,    label: 'Compressor',          blurb: 'Axial stages + centrifugal impeller — driven by the N1 spool', color: '#3b82f6' },
  { key: 'gas-gen-turbine', x0:  0.08, x1:  0.45, r0: 0,    r1: 0.21, label: 'Gas-Gen Turbine',     blurb: 'HP turbine — extracts work to drive the compressor (N1)', color: '#c2703f' },
  { key: 'combustor',       x0:  0.08, x1:  0.62, r0: 0.21, r1: 9,    label: 'Combustor',           blurb: 'Annular reverse-flow can wrapping the gas-generator turbine', color: '#b06a3f' },
  { key: 'power-turbine',   x0:  0.62, x1:  0.88, r0: 0,    r1: 9,    label: 'Power Turbine',       blurb: 'Free turbine (N2) — mechanically independent, drives the load', color: '#a855f7' },
  { key: 'exhaust',         x0:  0.88, x1:  1.31, r0: 0,    r1: 9,    label: 'Exhaust',             blurb: 'Gas path exit and rear support struts', color: '#78716c' },
];

/** Which section a point in MODEL space belongs to — the single source of truth
 *  for "what part is this?". Mirrored in GLSL inside attachSectionShader; keep
 *  the two in step. Returns -1 outside every band. */
function sectionAt(x: number, r: number): number {
  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    if (x >= s.x0 && x < s.x1 && r >= s.r0 && r < s.r1) return i;
  }
  return -1;
}

// ── Per-section health ──────────────────────────────────────────────────
//   0 = ok → green · 1 = warn → amber · 2 = caution → orange · 3 = alert → red
// With no frame (simulation stopped) every section fades dark.

// This glow is layered OVER the asset's real PBR textures, whose basecolor is
// genuinely dark (mean ≈72/67/64). Flat additive emissive at any readable level
// therefore out-competes the texture and turns the engine into a solid blob, so
// the shader weights it by a fresnel rim instead (see attachSectionShader) and
// these intensities are tuned for that — they are NOT flat-add values.
const SEV_EMISSIVE: [number, number, number, number][] = [
  [0.00, 0.70, 0.22, 0.10],
  [0.85, 0.55, 0.00, 0.30],
  [1.00, 0.28, 0.00, 0.55],
  [1.00, 0.00, 0.00, 0.85],
];

type Sev = 0 | 1 | 2 | 3;

/** Status wording + colour shown in the hover card header. */
const SEV_STATUS: Record<Sev, { label: string; color: string }> = {
  0: { label: 'OK',       color: '#16a34a' },
  1: { label: 'WARN',     color: '#eab308' },
  2: { label: 'DEGRADED', color: '#f97316' },
  3: { label: 'CRITICAL', color: '#dc2626' },
};

/** Hot section — TGT (Turbine Gas Temperature). Ground limit 900 °C, flight 1020 °C. */
function tgtSev(tgt: number): Sev {
  if (tgt > 950) return 3;
  if (tgt > 850) return 2;
  if (tgt > 750) return 1;
  return 0;
}
/** Compressor — N1 shaft speed as % of governed max. */
function n1Sev(pct: number): Sev {
  if (pct > 98) return 3;
  if (pct > 93) return 2;
  if (pct > 88) return 1;
  return 0;
}
/** Rotating assembly — vibration (mm/s). */
function vibSev(vib: number): Sev {
  if (vib > 5.0) return 3;
  if (vib > 3.0) return 2;
  if (vib > 1.5) return 1;
  return 0;
}

/** Health per section, or -1 for sections with no mapped metric (stay dark). */
function sectionSev(key: SectionKey, f: CycleTraceSample): Sev | -1 {
  switch (key) {
    case 'compressor':      return n1Sev(f.nggPct);
    case 'gas-gen-turbine': return tgtSev(f.jpt1);
    case 'combustor':       return tgtSev(f.jpt1);
    case 'power-turbine':   return vibSev(f.vibration);
    case 'inlet':
    case 'exhaust':
    default:                return -1;
  }
}

// ── Section-aware material ──────────────────────────────────────────────
// Injects a section lookup into MeshStandardMaterial. Keeps the asset's
// basecolor/metal-rough/normal maps intact and only ADDS emissive on top.

interface SectionUniforms {
  uSecBounds: { value: THREE.Vector4[] };   // x0, x1, r0, r1
  uSecColor:  { value: THREE.Vector3[] };
  uSecInt:    { value: number[] };
  uHover:     { value: number };            // index of hovered section, -1 = none
}

function makeSectionUniforms(): SectionUniforms {
  return {
    uSecBounds: { value: SECTIONS.map(s => new THREE.Vector4(s.x0, s.x1, s.r0, s.r1)) },
    uSecColor:  { value: SECTIONS.map(() => new THREE.Vector3(0, 0, 0)) },
    uSecInt:    { value: SECTIONS.map(() => 0) },
    uHover:     { value: -1 },
  };
}

const N_SEC = SECTIONS.length;

function attachSectionShader(mat: THREE.Material, u: SectionUniforms) {
  const std = mat as THREE.MeshStandardMaterial;
  std.onBeforeCompile = (shader) => {
    shader.uniforms.uSecBounds = u.uSecBounds;
    shader.uniforms.uSecColor  = u.uSecColor;
    shader.uniforms.uSecInt    = u.uSecInt;
    shader.uniforms.uHover     = u.uHover;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSecPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSecPos = position;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSecPos;
uniform vec4  uSecBounds[${N_SEC}];
uniform vec3  uSecColor[${N_SEC}];
uniform float uSecInt[${N_SEC}];
uniform int   uHover;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // Mirrors sectionAt() on the CPU. x and radius are both invariant under the
  // rotor's X-axis spin, so a spinning blade keeps the section of the disc it
  // belongs to.
  float secR = length(vSecPos.yz);
  float rim  = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
  for (int i = 0; i < ${N_SEC}; i++) {
    vec4 b = uSecBounds[i];
    if (vSecPos.x >= b.x && vSecPos.x < b.y && secR >= b.z && secR < b.w) {
      // Fresnel rim: the glow rides the silhouette and grazing angles, leaving
      // the surface readable face-on. A flat add at a visible intensity buries
      // the shape entirely.
      totalEmissiveRadiance += uSecColor[i] * uSecInt[i] * pow(rim, 3.0);
      // Hover: lift the whole section so the part under the cursor is obvious.
      if (i == uHover) {
        totalEmissiveRadiance += vec3(0.16, 0.22, 0.30) * (0.35 + 0.65 * pow(rim, 2.0));
      }
      break;
    }
  }
}`);
  };
  std.customProgramCacheKey = () => 'gtsu-section';
  std.needsUpdate = true;
}

// ── Engine mesh ─────────────────────────────────────────────────────────

/** The engine's single colour. Everything is this material — the asset's
 *  photoreal texture sets are deliberately not bound, so the hardware reads by
 *  shape and shading alone and the status glow has nothing to compete with. */
const ENGINE_COLOR = '#8d9aa8';

function EngineMesh({
  frame, uniforms, onHover,
}: {
  frame: CycleTraceSample | null;
  uniforms: SectionUniforms;
  onHover: (section: number, clientX: number, clientY: number) => void;
}) {
  const { scene } = useGLTF(MODEL_PATH, DRACO_PATH);

  const { root, rotor1, rotor2 } = useMemo(() => {
    const root = scene.clone(true);
    const rotor1: THREE.Object3D[] = [];
    const rotor2: THREE.Object3D[] = [];

    // One material for the whole engine.
    // side: DoubleSide is required, not cosmetic — this is a CUTAWAY. Its shells
    // are open surfaces, so with front-face culling every sliced casing shows as
    // a hole and the internals behind it vanish.
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(ENGINE_COLOR),
      metalness: 0.55,
      roughness: 0.46,
      side: THREE.DoubleSide,
    });
    attachSectionShader(mat, uniforms);

    // The GLB is already baked: shaft axis = X through the origin, longest
    // dimension normalised to 2.6 units. No runtime re-centring needed.
    root.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = mat;
      // BVH per geometry — without it, hover raycasts walk every triangle.
      mesh.geometry.computeBoundsTree?.();
    });

    // Rotor nodes were split out at build time from the detected blade rings.
    for (const child of root.children) {
      if (child.name.endsWith('__rotor1')) rotor1.push(child);
      else if (child.name.endsWith('__rotor2')) rotor2.push(child);
    }
    return { root, rotor1, rotor2 };
  }, [scene, uniforms]);

  useEffect(() => () => {
    root.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.disposeBoundsTree?.();
    });
  }, [root]);

  // Resolve the hit to a section. e.point is WORLD space, but the model sits at
  // the origin un-transformed, and the rotors only spin about X — which changes
  // neither x nor radius — so world coords can be used directly.
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const p = e.point;
    onHover(sectionAt(p.x, Math.hypot(p.y, p.z)), e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  const lerp = useRef<number[][]>(SECTIONS.map(() => [0, 0, 0, 0]));

  useFrame((state, delta) => {
    const st      = useGTSUStore.getState();
    const playing = st.isPlaying || st.consoleIsPlaying || st.liveMode;

    // ── rotor spin ──
    // N1 = gas generator (compressor + its turbine + shaft). N2 = free power
    // turbine. Both ride the X axis, which the GLB is baked around.
    const n1 = playing ? (frame?.ngg ?? 0) : 0;
    const n2 = playing ? (n1 / MAX_N1_RPM) * MAX_N2_RPM * 0.95 : 0;
    const w1 = (n1 / MAX_N1_RPM) * 5 * Math.PI;
    const w2 = (n2 / MAX_N2_RPM) * 5 * Math.PI;
    for (const r of rotor1) r.rotation.x += w1 * delta;
    for (const r of rotor2) r.rotation.x -= w2 * delta;   // free turbine counter-rotates

    // ── section status glow ──
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 3.5) * 0.15;
    const t = Math.max(0, Math.min(1, 3 * delta));
    SECTIONS.forEach((s, i) => {
      const sev    = frame ? sectionSev(s.key, frame) : -1;
      const target = sev >= 0 ? SEV_EMISSIVE[sev] : [0, 0, 0, 0];
      const cur    = lerp.current[i];
      for (let k = 0; k < 4; k++) cur[k] += (target[k] - cur[k]) * t;
      uniforms.uSecColor.value[i].set(cur[0], cur[1], cur[2]);
      uniforms.uSecInt.value[i] = cur[3] * (sev > 0 ? pulse : 1);
    });
  });

  return (
    <primitive
      object={root}
      onPointerMove={handleMove}
      onPointerOut={() => onHover(-1, 0, 0)}
    />
  );
}

// ── Scene ───────────────────────────────────────────────────────────────

function Scene({
  frame, uniforms, onHover,
}: {
  frame: CycleTraceSample | null;
  uniforms: SectionUniforms;
  onHover: (section: number, clientX: number, clientY: number) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 8, 6]} intensity={1.6} />
      <directionalLight position={[-4, -2, -3]} intensity={0.5} color="#5fa8ff" />

      {/* Procedural studio environment for metal reflections.
          Built entirely on the GPU from Lightformers — no network/CDN fetch,
          so the results screen never breaks when offline. */}
      <EnvBoundary>
        <Environment resolution={256}>
          <Lightformer intensity={1.4} position={[0, 5, -5]} scale={[10, 10, 1]} color="#ffffff" />
          <Lightformer intensity={0.7} position={[-6, 1, 1]} scale={[10, 3, 1]} color="#9bc4ff" />
          <Lightformer intensity={0.6} position={[6, -1, 2]} scale={[10, 3, 1]} color="#ffd9a0" />
        </Environment>
      </EnvBoundary>

      <Suspense fallback={null}>
        <EngineMesh frame={frame} uniforms={uniforms} onHover={onHover} />
      </Suspense>

      <gridHelper args={[8, 16, 0x223344, 0x14202c]} position={[0, -0.95, 0]} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={1.2} maxDistance={12} target={[0, 0, 0]} />
    </>
  );
}

// ── Public component ───────────────────────────────────────────────────

export interface EngineModel3DProps {
  frame:          CycleTraceSample | null;
  hotspots?:      EngineHotspot[];
  onHotspotClick?: (id: string) => void;
  /** Camera position. Default fits the full engine. */
  cameraPosition?: [number, number, number];
}

/** Card shown while the cursor is over a section of the engine. */
function HoverCard({
  def, sev, items, x, y,
}: {
  def: SectionDef;
  sev: Sev | -1;
  items: EngineHotspot[];
  x: number; y: number;
}) {
  const status = sev >= 0 ? SEV_STATUS[sev as Sev] : { label: 'NO DATA', color: '#64748b' };
  // Flip the card back over the cursor near the right/bottom edges so it never
  // spills out of the panel.
  const flipX = x > 0.62, flipY = y > 0.55;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(${flipX ? 'calc(-100% - 14px)' : '14px'}, ${flipY ? 'calc(-100% - 14px)' : '14px'})`,
        pointerEvents: 'none', zIndex: 25,
        minWidth: 210, maxWidth: 320,
        background: 'rgba(8,12,18,0.95)',
        border: `1px solid ${def.color}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}
    >
      {/* header — the part's name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: def.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e8eef5', letterSpacing: '0.04em' }}>{def.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 8, fontWeight: 700, color: status.color, letterSpacing: '0.06em' }}>{status.label}</span>
      </div>

      <div style={{ padding: '7px 10px 8px' }}>
        <div style={{ fontSize: 8, color: '#7f93a8', lineHeight: 1.5, marginBottom: items.length ? 7 : 0 }}>{def.blurb}</div>

        {items.map((h, i) => (
          <div key={h.id} style={{ marginTop: i ? 7 : 0, paddingTop: i ? 7 : 0, borderTop: i ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
            <div style={{ fontSize: 7, fontWeight: 700, color: '#afc3d8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: SEV_COLOR[h.severity] }}>{h.value}</span>
              {h.delta && (
                <span style={{ fontSize: 8, fontWeight: 700, color: h.deltaTone === 'bad' ? '#dc2626' : '#16a34a' }}>{h.delta}</span>
              )}
            </div>
            {h.metric && (
              <div style={{ fontSize: 8, color: '#8ca0b6', marginTop: 3, lineHeight: 1.5 }}>{h.metric}</div>
            )}
          </div>
        ))}

        {!items.length && (
          <div style={{ fontSize: 8, color: '#5c6b7c', marginTop: 6, fontStyle: 'italic' }}>No monitored parameters on this section</div>
        )}
      </div>
    </div>
  );
}

export function EngineModel3D({ frame, hotspots, onHotspotClick, cameraPosition }: EngineModel3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);
  const [hover, setHover] = useState<{ sec: number; x: number; y: number } | null>(null);
  const uniforms = useMemo(makeSectionUniforms, []);

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else wrapRef.current?.requestFullscreen?.().catch(() => { /* denied / unsupported */ });
  };

  // The raycast reports a section index + viewport coords; store the cursor as a
  // FRACTION of the wrapper so the card positions correctly at any panel size
  // and in fullscreen.
  const handleHover = (sec: number, clientX: number, clientY: number) => {
    uniforms.uHover.value = sec;
    if (sec < 0) { setHover(null); return; }
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ sec, x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height });
  };

  const hoveredDef = hover ? SECTIONS[hover.sec] : null;
  const hoveredItems = hoveredDef ? (hotspots ?? []).filter(h => h.section === hoveredDef.key) : [];
  const hoveredSev: Sev | -1 = hoveredDef && frame ? sectionSev(hoveredDef.key, frame) : -1;

  if (!HAS_WEBGL) return <WebGLUnavailable />;

  return (
    <WebGLBoundary>
      {/* The wrapper is the fullscreen target, so it carries the background —
          in fullscreen it becomes the whole display behind the canvas.
          The explicit 100vw/100vh matters: `position: relative` (needed to anchor
          the button) overrides the UA stylesheet's `position: fixed` on
          :fullscreen, which is what would otherwise stretch the element to the
          screen. Without this the element keeps its in-flow size and the canvas
          never grows. */}
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          width: isFull ? '100vw' : '100%',
          height: isFull ? '100vh' : '100%',
          background: 'radial-gradient(ellipse at center, #0e1822 0%, #06090d 80%)',
        }}
      >
        <Canvas
          camera={{ position: cameraPosition ?? [1.75, 0.95, 2.25], fov: 42 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
          style={{ background: 'transparent' }}
          onPointerMissed={() => handleHover(-1, 0, 0)}
          onClick={() => { if (hoveredItems[0]) onHotspotClick?.(hoveredItems[0].id); }}
        >
          <Scene frame={frame} uniforms={uniforms} onHover={handleHover} />
        </Canvas>

        {hoveredDef && (
          <HoverCard def={hoveredDef} sev={hoveredSev} items={hoveredItems} x={hover!.x} y={hover!.y} />
        )}

        <button
          type="button"
          onClick={toggleFull}
          title={isFull ? 'Exit full screen (Esc)' : 'View full screen'}
          style={{
            position: 'absolute', bottom: 10, right: 10, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(8,12,18,0.72)', border: '1px solid #24384d',
            borderRadius: 6, padding: '5px 9px', cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.06em', color: '#afc3d8',
          }}
        >
          {isFull ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {isFull ? 'EXIT' : 'FULL SCREEN'}
        </button>
      </div>
    </WebGLBoundary>
  );
}

useGLTF.preload(MODEL_PATH, DRACO_PATH);
