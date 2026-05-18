import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGTSUStore } from "../store/useGTSUStore";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_NGG_RPM = 22000;
const JPT_GROUND_LIMIT = 900;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TelemetryKey = "ngg" | "jpt1" | "p2p1" | "fuel" | "secu";
type StatusLevel = "normal" | "warning" | "critical";

interface PartDef {
  id: string;
  label: string;
  description: string;
  color: string;
  metalness: number;
  roughness: number;
  patterns: RegExp[];
  telemetryKey: TelemetryKey;
  isOuter: boolean;
}

interface HoverInfo {
  id: string;
  label: string;
  description: string;
  telemetryKey: TelemetryKey;
}

interface MeshRecord {
  mesh: THREE.Mesh;
  part: PartDef;
  mat: THREE.MeshStandardMaterial;
  isOuter: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Part definitions
// ─────────────────────────────────────────────────────────────────────────────
const PART_DEFS: PartDef[] = [
  {
    id: "housing",
    label: "Motor Housing",
    description: "Cast-alloy outer casing — shields internals from contamination. SECU monitors casing integrity and bus health.",
    color: "#787878",
    metalness: 0.75,
    roughness: 0.35,
    patterns: [/hous|casing|shell|outer.*body|enclos|cylinder|case/i],
    telemetryKey: "secu",
    isOuter: true,
  },
  {
    id: "stator",
    label: "Stator Core & Laminations",
    description: "Silicon-steel lamination stack — generates rotating magnetic field. Field strength scales with Ngg; fouling degrades flux density.",
    color: "#252525",
    metalness: 0.60,
    roughness: 0.50,
    patterns: [/stator|lamina|pole.*piece|field.*core|core.*field|yoke/i],
    telemetryKey: "ngg",
    isOuter: false,
  },
  {
    id: "armature",
    label: "Armature / Rotor Winding",
    description: "Wound copper armature bars in slots — electromagnetic torque output. Ngg speed directly reflects armature electromagnetic efficiency.",
    color: "#1a1a1a",
    metalness: 0.55,
    roughness: 0.55,
    patterns: [/armature|rotor|winding|coil|slot|shaft|motor.*body/i],
    telemetryKey: "ngg",
    isOuter: false,
  },
  {
    id: "commutator",
    label: "Commutator Ring",
    description: "Segmented copper ring for current reversal — heat-critical. JPT1 residual Δ tracks commutator arc heating.",
    color: "#c87941",
    metalness: 0.88,
    roughness: 0.22,
    patterns: [/commut|copper.*ring|ring.*copper|segment|collector/i],
    telemetryKey: "jpt1",
    isOuter: false,
  },
  {
    id: "gear",
    label: "Drive Gear / Helical Pinion",
    description: "Helical ring gear engages engine ring gear during cranking. Fuel mass-flow and stepper position confirm proper mechanical engagement.",
    color: "#a07a3a",
    metalness: 0.82,
    roughness: 0.28,
    patterns: [/gear|pinion|helical|spur|drive.*gear|ring.*gear|planet/i],
    telemetryKey: "fuel",
    isOuter: false,
  },
  {
    id: "solenoid",
    label: "Solenoid / Plunger Assembly",
    description: "Electromagnetic plunger actuates gear engagement. P2/P1 ratio confirms engagement pressure and cranking quality.",
    color: "#1e1e1e",
    metalness: 0.65,
    roughness: 0.45,
    patterns: [/solenoid|plunger|relay|actuator|switch|engage/i],
    telemetryKey: "p2p1",
    isOuter: false,
  },
  {
    id: "endbell",
    label: "End Bells / Structural Caps",
    description: "Die-cast end closures house bearings and brush holders. SECU BIT pass/fail covers end-cap sensor and bus continuity.",
    color: "#8c8c8c",
    metalness: 0.72,
    roughness: 0.38,
    patterns: [/end.*bell|bell.*end|end.*cap|cap.*end|cover|closure|endplate/i],
    telemetryKey: "secu",
    isOuter: true,
  },
  {
    id: "bracket",
    label: "Mounting Bracket & Flange",
    description: "Structural airframe interface that absorbs cranking torque. SECU monitors mounting torque sensor and vibration accelerometer.",
    color: "#545454",
    metalness: 0.68,
    roughness: 0.48,
    patterns: [/bracket|mount|flange|base|foot|interface|attach/i],
    telemetryKey: "secu",
    isOuter: false,
  },
  {
    id: "brushes",
    label: "Carbon Brush Assembly",
    description: "Carbon brushes maintain sliding contact with commutator — primary wear item. JPT1 residual Δ tracks brush arc temperature rise.",
    color: "#2e2e2e",
    metalness: 0.30,
    roughness: 0.72,
    patterns: [/brush|carbon.*contact|contact.*ring/i],
    telemetryKey: "jpt1",
    isOuter: false,
  },
  {
    id: "bearings",
    label: "Precision Ball Bearings",
    description: "Radial and thrust bearings support armature shaft at both ends. Ngg speed + vibration predicts bearing remaining useful life.",
    color: "#c8a440",
    metalness: 0.92,
    roughness: 0.18,
    patterns: [/bearing|bushing|race|ball.*bearing|roller/i],
    telemetryKey: "ngg",
    isOuter: false,
  },
];

const DEFAULT_PART: PartDef = {
  id: "misc",
  label: "Motor Component",
  description: "Structural motor component — general SECU health monitored.",
  color: "#606060",
  metalness: 0.65,
  roughness: 0.45,
  patterns: [],
  telemetryKey: "secu",
  isOuter: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Base + status colors for model highlighting
// ─────────────────────────────────────────────────────────────────────────────
const BASE_MOTOR_COLOR = "#c9ced4";

const STATUS_MOTOR_COLORS: Record<StatusLevel, { color: string; emissive: string; intensity: number }> = {
  normal:   { color: "#22c55e", emissive: "#14532d", intensity: 0.16 },
  warning:  { color: "#f59e0b", emissive: "#78350f", intensity: 0.26 },
  critical: { color: "#ef4444", emissive: "#7f1d1d", intensity: 0.34 },
};

const EMISSIVE: Record<StatusLevel, { hex: string; intensity: number }> = {
  normal:   { hex: "#14532d", intensity: 0.16 },
  warning:  { hex: "#78350f", intensity: 0.26 },
  critical: { hex: "#7f1d1d", intensity: 0.34 },
};

// ── Props kept for backward-compat (OverviewPage calls with no props) ──────
export interface ComponentStatus {
  id: string;
  name: string;
  status: StatusLevel;
  temperature: number;
  efficiency: number;
  position?: [number, number, number];
}

interface EngineDigitalTwinProps {
  components?: ComponentStatus[];
  showTemperature?: boolean;
  showEfficiency?: boolean;
  title?: string;
  modelUrl?: string;
  hideFullscreenButton?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status colour palette
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<StatusLevel, { border: string; text: string; bg: string; glow: string }> = {
  critical: { border: "rgba(220,38,38,0.45)",  text: "#dc2626", bg: "rgba(220,38,38,0.10)",  glow: "#dc2626" },
  warning:  { border: "rgba(217,119,6,0.45)",  text: "#d97706", bg: "rgba(217,119,6,0.10)",  glow: "#d97706" },
  normal:   { border: "rgba(255,255,255,0.10)", text: "#afc3d8", bg: "rgba(255,255,255,0.04)", glow: "transparent" },
};

// ─────────────────────────────────────────────────────────────────────────────
// HUD card
// ─────────────────────────────────────────────────────────────────────────────
interface HudCardProps {
  label: string;
  value: string;
  unit: string;
  sublabel?: string;
  status: StatusLevel;
}
function HudCard({ label, value, unit, sublabel, status }: HudCardProps) {
  const c = STATUS_COLORS[status];
  return (
    <div
      style={{
        background: "rgba(10,10,10,0.90)",
        border: `1.5px solid ${c.border}`,
        borderRadius: 7,
        padding: "5px 10px",
        minWidth: 110,
        boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.glow === "transparent" ? "rgba(255,255,255,0.25)" : c.glow,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 8,
            color: "#8ca0b6",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: c.text,
          lineHeight: 1.15,
          fontFamily: "'Courier New', monospace",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 3, color: "#8ca0b6" }}>
            {unit}
          </span>
        )}
      </div>
      {sublabel && (
        <div style={{ fontSize: 8.5, color: "#8ca0b6", marginTop: 2, whiteSpace: "nowrap" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-D interactive model component
// ─────────────────────────────────────────────────────────────────────────────
function StarterModel({
  modelUrl,
  cutaway,
  exploded,
  telemetryStatus,
  selectedPartId,
  onHover,
  onSelect,
}: {
  modelUrl: string;
  cutaway: boolean;
  exploded: boolean;
  telemetryStatus: Record<TelemetryKey, StatusLevel>;
  selectedPartId: string | null;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (info: HoverInfo | null) => void;
}) {
  const { scene } = useGLTF(modelUrl);

  // Clone so material mutations don't affect the shared GLTF cache
  const cloned = useMemo(() => scene.clone(true), [scene]);

  const records = useRef<MeshRecord[]>([]);
  const childData = useRef<Map<THREE.Object3D, { orig: THREE.Vector3; dir: THREE.Vector3 }>>(new Map());
  const explodeT = useRef(0);
  // Group ref used to normalise the model scale/position to a 3-unit box
  const groupRef = useRef<THREE.Group>(null);

  // ── First-time: classify meshes, normalise size, build explode vectors ──
  useEffect(() => {
    const recs: MeshRecord[] = [];

    cloned.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return;

      const part =
        PART_DEFS.find((p) => p.patterns.some((rx) => rx.test(obj.name))) ?? DEFAULT_PART;

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(BASE_MOTOR_COLOR),
        metalness: part.metalness,
        roughness: part.roughness,
        envMapIntensity: 1.4,
      });

      obj.material = mat;
      obj.castShadow = true;
      obj.receiveShadow = true;
      recs.push({ mesh: obj, part, mat, isOuter: false });
    });

    // ── Auto-detect outer shells by bounding-sphere size ─────────────────
    // Works regardless of mesh naming in the GLB
    const meshSizeMap = new Map<THREE.Mesh, number>();
    recs.forEach(r => {
      const bbox = new THREE.Box3().setFromObject(r.mesh);
      meshSizeMap.set(r.mesh, bbox.getSize(new THREE.Vector3()).length());
    });
    const maxMeshSize = Math.max(...meshSizeMap.values(), 0.001);
    // Pattern-match OR largest meshes (>= 70 % of max diagonal) = outer shell
    records.current = recs.map(r => ({
      ...r,
      isOuter: r.part.isOuter || (meshSizeMap.get(r.mesh)! / maxMeshSize >= 0.70),
    }));

    // ── Normalise: scale + centre the model into a 2.4-unit bounding box ──
    const fullBbox = new THREE.Box3().setFromObject(cloned);
    const fullSize = fullBbox.getSize(new THREE.Vector3());
    const fullCenter = fullBbox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(fullSize.x, fullSize.y, fullSize.z);
    if (maxDim > 0 && groupRef.current) {
      const s = 2.4 / maxDim;
      groupRef.current.scale.setScalar(s);
      groupRef.current.position.set(
        -fullCenter.x * s,
        -fullCenter.y * s,
        -fullCenter.z * s
      );
    }

    // ── Compute per-child explode vectors ─────────────────────────────────
    const map = new Map<THREE.Object3D, { orig: THREE.Vector3; dir: THREE.Vector3 }>();
    cloned.children.forEach((child: THREE.Object3D) => {
      const bbox = new THREE.Box3().setFromObject(child);
      const centre = bbox.getCenter(new THREE.Vector3());
      const dir = centre.clone();
      if (dir.length() < 0.05) dir.set(0, 1, 0);
      else dir.normalize();
      map.set(child, { orig: child.position.clone(), dir });
    });
    childData.current = map;

    return () => {
      recs.forEach(({ mat }) => mat.dispose());
    };
  }, [cloned]);

  // ── Re-apply emissive + transparency whenever telemetry / mode changes ──
  useEffect(() => {
    records.current.forEach(({ mesh, part, mat, isOuter }) => {
      if (part.id === selectedPartId) return;
      const status = telemetryStatus[part.telemetryKey] ?? "normal";
      const em = EMISSIVE[status];
      const vis = STATUS_MOTOR_COLORS[status];

      if (isOuter) {
        mat.color.set(BASE_MOTOR_COLOR);
        mat.transparent = true;
        mat.opacity = cutaway ? 0.07 : 0.20;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
        mesh.renderOrder = 5;
        mat.emissive.set(em.hex);
        mat.emissiveIntensity = em.intensity * 0.55;
      } else {
        // Keep global light-gray base, but apply status color coding to
        // monitored interior components.
        mat.color.set(vis.color);
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.depthWrite = true;
        mat.side = THREE.FrontSide;
        mesh.renderOrder = 0;
        mat.emissive.set(vis.emissive);
        mat.emissiveIntensity = vis.intensity;
      }
      mat.needsUpdate = true;
    });
  }, [telemetryStatus, cutaway, selectedPartId]);

  // ── Highlight selected part in blue ─────────────────────────────────────
  useEffect(() => {
    records.current.forEach(({ part, mat }) => {
      if (part.id === selectedPartId) {
        mat.emissive.set("#3b82f6");
        mat.emissiveIntensity = 0.72;
        mat.needsUpdate = true;
      }
    });
    return () => {
      // Restore telemetry colour when part is deselected
      records.current.forEach(({ part, mat }) => {
        if (part.id === selectedPartId) {
          const status = telemetryStatus[part.telemetryKey] ?? "normal";
          const vis = STATUS_MOTOR_COLORS[status];
          mat.emissive.set(vis.emissive);
          mat.emissiveIntensity = vis.intensity;
          mat.needsUpdate = true;
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartId]);

  // ── Per-frame: smooth explode lerp + pulse warning / critical meshes ────
  useFrame((_, delta) => {
    const target = exploded ? 1 : 0;
    explodeT.current += (target - explodeT.current) * Math.min(delta * 2.8, 1);

    childData.current.forEach(({ orig, dir }, child) => {
      child.position.copy(orig).addScaledVector(dir, explodeT.current * 1.3);
    });

    const t = Date.now() * 0.003;
    records.current.forEach(({ part, mat }) => {
      if (part.id === selectedPartId) return;
      const status = telemetryStatus[part.telemetryKey] ?? "normal";
      if (status === "critical") {
        mat.emissiveIntensity = 0.35 + Math.abs(Math.sin(t)) * 0.28;
      } else if (status === "warning") {
        mat.emissiveIntensity = 0.18 + Math.abs(Math.sin(t * 0.55)) * 0.14;
      }
    });
  });

  return (
    <group ref={groupRef}>
    <primitive
      object={cloned}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const hit = records.current.find((r) => r.mesh === e.object);
        if (hit) {
          onSelect({
            id: hit.part.id,
            label: hit.part.label,
            description: hit.part.description,
            telemetryKey: hit.part.telemetryKey,
          });
        }
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        const hit = records.current.find((r) => r.mesh === e.object);
        if (hit) {
          onHover({
            id: hit.part.id,
            label: hit.part.label,
            description: hit.part.description,
            telemetryKey: hit.part.telemetryKey,
          });
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
        onHover(null);
      }}
    />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export function EngineDigitalTwin({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  components: _components = [],
  title = "GTSU-110 Digital Twin",
  modelUrl = "/Starter Asm..glb",
  hideFullscreenButton = false,
}: EngineDigitalTwinProps) {
  const {
    telemetry,
    health,
    simulation,
    setOperationMode,
    startSimulation,
    tickSimulation,
    stopSimulation,
    resetSimulation,
  } = useGTSUStore();

  const containerRef = useRef<HTMLDivElement>(null);

  // ── View-mode state ──────────────────────────────────────────────────────
  const [cutaway,  setCutaway]  = useState(false);
  const [exploded, setExploded] = useState(false);
  const [selected, setSelected] = useState<HoverInfo | null>(null);
  const [hovered,  setHovered]  = useState<HoverInfo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenTab, setFullscreenTab] = useState<"telemetry" | "simulation">("telemetry");

  useEffect(() => {
    if (!simulation.isRunning) return;
    const timer = setInterval(() => {
      tickSimulation();
    }, 1000);
    return () => clearInterval(timer);
  }, [simulation.isRunning, tickSimulation]);

  useEffect(() => {
    if (!simulation.isRunning && simulation.elapsedSec === simulation.durationSec) {
      setOperationMode("post-test-review");
    }
  }, [simulation.isRunning, simulation.elapsedSec, simulation.durationSec, setOperationMode]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const isNowFullscreen = !!(document.fullscreenElement && document.fullscreenElement.contains(containerRef.current));
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen) {
        setFullscreenTab("telemetry");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }
    await containerRef.current.requestFullscreen();
  };

  // ── Derive statuses ──────────────────────────────────────────────────────
  const nggPct = telemetry.nggPct ?? (telemetry.ngg / MAX_NGG_RPM) * 100;

  const jpt1Status: StatusLevel =
    telemetry.jpt1 >= JPT_GROUND_LIMIT ? "critical" : telemetry.jpt1 >= 820 ? "warning" : "normal";
  const nggStatus: StatusLevel =
    nggPct > 97 ? "critical" : nggPct > 92 ? "warning" : "normal";
  const p2p1Status: StatusLevel =
    telemetry.p2p1 < 3.4 ? "critical" : telemetry.p2p1 < 3.6 ? "warning" : "normal";
  const foulingStatus: StatusLevel =
    health.compressorFoulingIndex >= 50 ? "critical"
    : health.compressorFoulingIndex >= 25 ? "warning" : "normal";
  const secuStatus: StatusLevel =
    !telemetry.secuMainHealthy || !telemetry.bitPass ? "critical"
    : telemetry.ipsMode > 0 ? "warning" : "normal";
  const fuelStatus: StatusLevel =
    telemetry.fuelMassFlow > 8.5 ? "critical" : telemetry.fuelMassFlow > 7.5 ? "warning" : "normal";

  const telemetryStatus: Record<TelemetryKey, StatusLevel> = {
    ngg:  nggStatus,
    jpt1: jpt1Status,
    p2p1: p2p1Status,
    fuel: fuelStatus,
    secu: secuStatus,
  };

  const anyC = Object.values(telemetryStatus).includes("critical");
  const anyW = Object.values(telemetryStatus).includes("warning");
  const ambientColor = anyC ? "#ff4040" : anyW ? "#ffb347" : "#70ffd8";
  const dotCls = anyC ? "bg-red-500" : anyW ? "bg-amber-400" : "bg-emerald-400";

  const ipsLabels = [
    "IPS Mode 0 — Closed-Loop",
    "IPS Mode 1 — Emergency Armed",
    "IPS Mode 2 — Open-Loop",
  ];

  const progressPct = (simulation.elapsedSec / simulation.durationSec) * 100;
  const phaseLabel =
    simulation.elapsedSec < 6 ? "Cranking" : simulation.elapsedSec < 13 ? "Light-Up" : simulation.elapsedSec < 26 ? "Acceleration" : "Self-Sustaining";

  const peakDelta = simulation.afterMetrics.peakJpt1 - simulation.beforeMetrics.peakJpt1;
  const nggDelta = simulation.afterMetrics.maxNggPct - simulation.beforeMetrics.maxNggPct;
  const sustainDelta = simulation.afterMetrics.timeToSelfSustaining - simulation.beforeMetrics.timeToSelfSustaining;
  const showTelemetryHud = !isFullscreen || fullscreenTab === "telemetry";
  const showSimulationHud = isFullscreen && fullscreenTab === "simulation";

  // Tooltip: hovered takes priority over selected
  const tooltip = hovered ?? selected;
  const tooltipStatus = tooltip ? (telemetryStatus[tooltip.telemetryKey] ?? "normal") : "normal";

  // Part legend items
  const PART_LEGEND = [
    { partId: "housing",    label: "Housing",    tlKey: "secu"  as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "stator",     label: "Stator",     tlKey: "ngg"   as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "armature",   label: "Armature",   tlKey: "ngg"   as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "commutator", label: "Commutator", tlKey: "jpt1"  as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "gear",       label: "Drive Gear", tlKey: "fuel"  as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "solenoid",   label: "Solenoid",   tlKey: "p2p1"  as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "endbell",    label: "End Bells",  tlKey: "secu"  as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "bearings",   label: "Bearings",   tlKey: "ngg"   as TelemetryKey, swatch: BASE_MOTOR_COLOR },
    { partId: "brushes",    label: "Brushes",    tlKey: "jpt1"  as TelemetryKey, swatch: BASE_MOTOR_COLOR },
  ];

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: 'var(--cwm-bg)' }}>

      {/* ── 3-D Canvas ─────────────────────────────────────────────────────── */}
      <Canvas
        shadows
        camera={{ position: [0, 0.5, 18], fov: 42 }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
        onPointerMissed={() => setSelected(null)}
      >
        {/* Health-tinted ambient light */}
        <ambientLight intensity={0.48} color={ambientColor} />
        {/* Key light — top-right front */}
        <directionalLight position={[5, 8, 4]}  intensity={1.45} color="#ffffff" castShadow
          shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        {/* Fill light — top-left back */}
        <directionalLight position={[-5, 3, -4]} intensity={0.50} color="#b0c8f0" />
        {/* Bounce light — bottom */}
        <directionalLight position={[0, -3, 2]}  intensity={0.22} color="#404060" />
        {/* Under-fill for solenoid */}
        <pointLight position={[0, -1.5, 1]} intensity={0.60} color="#ffffff" />
        {/* Rim light — warms copper gear */}
        <pointLight position={[2, 0.5, -2]} intensity={0.55} color="#ffd580" />

        <Suspense fallback={null}>
          <StarterModel
            modelUrl={modelUrl}
            cutaway={cutaway}
            exploded={exploded}
            telemetryStatus={telemetryStatus}
            selectedPartId={selected?.id ?? null}
            onHover={setHovered}
            onSelect={(info) =>
              setSelected((prev) => (prev?.id === info?.id ? null : info))
            }
          />
        </Suspense>

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          autoRotate={!selected}
          autoRotateSpeed={0.45}
          minDistance={1.5}
          maxDistance={24}
        />
      </Canvas>

      {/* ── CSS HUD overlay ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none select-none">

        {/* FULLSCREEN CONTROL + TABS */}
        <div
          className="absolute pointer-events-auto"
          style={{ top: 8, right: 8, display: "flex", gap: 6, zIndex: 40, ...(hideFullscreenButton && !isFullscreen ? { display: "none" } : {}) }}
        >
          {isFullscreen && (
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { id: "telemetry" as const, label: "TELEMETRY" },
                { id: "simulation" as const, label: "TEST BENCH SIMULATION" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFullscreenTab(tab.id)}
                  style={{
                    background: fullscreenTab === tab.id ? "rgba(200,200,200,0.10)" : "rgba(10,10,10,0.82)",
                    border: `1px solid ${fullscreenTab === tab.id ? "rgba(200,200,200,0.20)" : "rgba(255,255,255,0.08)"}`,
                    color: fullscreenTab === tab.id ? "#e8eef5" : "#8ca0b6",
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 8,
                    letterSpacing: "0.06em",
                    fontFamily: "'Courier New', monospace",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          {!hideFullscreenButton && (
            <button
              onClick={toggleFullscreen}
              style={{
                background: "#3b7de8",
                color: "#ffffff",
                border: "none",
                padding: "5px 12px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 2px 10px rgba(59,125,232,0.35)",
              }}
            >
              {isFullscreen ? "Exit Fullscreen" : "Open Full Screen →"}
            </button>
          )}
        </div>

        {showTelemetryHud && (
        <>

        {/* TOP-LEFT ── Compressor Fouling → Stator & Armature */}
        <div className="absolute top-3 left-3">
          <HudCard
            label="Compressor Fouling"
            value={health.compressorFoulingIndex.toFixed(1)}
            unit="%"
            sublabel={`RUL: ${health.rul} h  ·  ${health.rulCycles} cycles`}
            status={foulingStatus}
          />
        </div>

        {/* TOP-RIGHT ── Ngg → Stator, Armature, Bearings */}
        <div className="absolute top-3 right-3">
          <HudCard
            label="Ngg — Gas Generator"
            value={nggPct.toFixed(1)}
            unit="% Ngg"
            sublabel={`${telemetry.ngg.toLocaleString()} RPM`}
            status={nggStatus}
          />
        </div>

        {/* MID-LEFT ── JPT1 → Commutator + Brushes */}
        <div className="absolute top-1/2 left-3 -translate-y-1/2">
          <HudCard
            label="JPT1 — Combustor"
            value={Math.round(telemetry.jpt1).toString()}
            unit="°C"
            sublabel={`Limit: ${JPT_GROUND_LIMIT}°C`}
            status={jpt1Status}
          />
        </div>

        {/* MID-RIGHT ── P2/P1 → Solenoid */}
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          <HudCard
            label="P2/P1 — Compressor"
            value={telemetry.p2p1.toFixed(2)}
            unit=":1"
            sublabel={`Base: ${health.baselineP2p1}`}
            status={p2p1Status}
          />
        </div>

        {/* BOTTOM-LEFT ── Fuel/Stepper → Drive Gear */}
        <div className="absolute bottom-14 left-3">
          <HudCard
            label="Fuel Flow — Stepper"
            value={telemetry.fuelMassFlow.toFixed(2)}
            unit="kg/h"
            status={fuelStatus}
          />
        </div>

        {/* BOTTOM-RIGHT ── SECU/IPS → Housing, End Bells */}
        <div className="absolute bottom-14 right-3">
          <HudCard
            label="SECU / IPS — BIT"
            value={telemetry.secuMainHealthy && telemetry.bitPass ? "PASS" : "FAIL"}
            unit=""
            sublabel={ipsLabels[telemetry.ipsMode]}
            status={secuStatus}
          />
        </div>

        {/* CENTER-TOP ── title badge */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <div
            style={{
              background: "rgba(10,10,10,0.82)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "3px 12px",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${dotCls}`} />
              <span
                style={{
                  fontSize: 9,
                  color: "#afc3d8",
                  letterSpacing: "0.09em",
                  fontFamily: "'Courier New', monospace",
                  whiteSpace: "nowrap",
                }}
              >
                {title} &nbsp;·&nbsp; LIVE ISO 23247
              </span>
            </div>
          </div>
        </div>

        {/* CONTROLS ── Cutaway + Explode (just below title badge) */}
        <div
          className="absolute pointer-events-auto"
          style={{ top: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}
        >
          {[
            { label: "✂ CUTAWAY", active: cutaway,  toggle: () => setCutaway((v) => !v) },
            { label: "⊕ EXPLODE", active: exploded, toggle: () => setExploded((v) => !v) },
          ].map(({ label, active, toggle }) => (
            <button
              key={label}
              onClick={toggle}
              style={{
                background: active ? "rgba(200,200,200,0.10)" : "rgba(10,10,10,0.82)",
                border: `1px solid ${active ? "rgba(200,200,200,0.20)" : "rgba(255,255,255,0.08)"}`,
                color: active ? "#e8eef5" : "#8ca0b6",
                borderRadius: 5,
                padding: "3px 11px",
                fontSize: 9,
                letterSpacing: "0.07em",
                fontFamily: "'Courier New', monospace",
                cursor: "pointer",
                backdropFilter: "blur(6px)",
                transition: "all 0.2s",
              }}
            >
              {label} {active ? "ON" : "OFF"}
            </button>
          ))}
        </div>

        {/* PART LEGEND ── colour-coded strip just above OAT bar */}
        <div
          className="absolute"
          style={{
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 5,
            alignItems: "center",
            flexWrap: "nowrap",
          }}
        >
          {PART_LEGEND.map(({ partId, label, tlKey, swatch }) => {
            const st  = telemetryStatus[tlKey];
            const col = STATUS_COLORS[st];
            const isSel = selected?.id === partId;
            return (
              <div
                key={partId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  background: isSel ? "rgba(200,200,200,0.10)" : "rgba(10,10,10,0.75)",
                  border: `1px solid ${isSel ? "rgba(200,200,200,0.25)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 4,
                  padding: "2px 5px",
                  backdropFilter: "blur(4px)",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: swatch,
                    display: "inline-block",
                    border: `1px solid ${col.border}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 7,
                    color: isSel ? "#e8eef5" : "#8ca0b6",
                    fontFamily: "'Courier New', monospace",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.04em",
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* CENTER-BOTTOM ── OAT / bus health strip */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <div
            style={{
              background: "rgba(10,10,10,0.80)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 6,
              padding: "3px 12px",
              backdropFilter: "blur(8px)",
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "#8ca0b6",
                fontFamily: "'Courier New', monospace",
                whiteSpace: "nowrap",
              }}
            >
              OAT {telemetry.oat.toFixed(1)} °C &nbsp;|&nbsp;
              MIL-1553B {telemetry.milBusHealth}% &nbsp;|&nbsp;
              ARINC 429 {telemetry.arinc429Health}%
            </span>
          </div>
        </div>
        </>
        )}
      </div>

      {/* TEST BENCH SIMULATION ── fullscreen-only simulation tab */}
      {showSimulationHud && (
      <div
        className="absolute pointer-events-auto"
        style={{ top: 58, left: "50%", transform: "translateX(-50%)", width: "min(880px, calc(100% - 24px))", zIndex: 32 }}
      >
        <div
          style={{
            background: "rgba(10,10,10,0.90)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "10px 12px",
            backdropFilter: "blur(9px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#afc3d8", letterSpacing: "0.08em", fontFamily: "'Courier New', monospace" }}>
              TEST BENCH SIMULATION
            </span>
            <span style={{ fontSize: 9, color: "#8ca0b6", fontFamily: "'Courier New', monospace" }}>
              {simulation.elapsedSec}s / {simulation.durationSec}s · {phaseLabel}
            </span>
          </div>

          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.07)", marginTop: 8, overflow: "hidden" }}>
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: simulation.advisoriesApplied ? "#22c55e" : "#f59e0b",
                transition: "width 0.35s",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={() => { setOperationMode("live-test"); startSimulation(false); }} style={{ border: "1px solid rgba(245,158,11,0.55)", background: "rgba(245,158,11,0.12)", color: "#fbbf24", borderRadius: 5, padding: "4px 9px", fontSize: 9, cursor: "pointer", fontFamily: "'Courier New', monospace" }}>START BEFORE AI</button>
            <button onClick={() => { setOperationMode("live-test"); startSimulation(true); }} style={{ border: "1px solid rgba(16,185,129,0.55)", background: "rgba(16,185,129,0.12)", color: "#34d399", borderRadius: 5, padding: "4px 9px", fontSize: 9, cursor: "pointer", fontFamily: "'Courier New', monospace" }}>START AFTER AI</button>
            <button onClick={stopSimulation} style={{ border: "1px solid rgba(96,165,250,0.55)", background: "rgba(96,165,250,0.12)", color: "#93c5fd", borderRadius: 5, padding: "4px 9px", fontSize: 9, cursor: "pointer", fontFamily: "'Courier New', monospace" }}>PAUSE</button>
            <button onClick={resetSimulation} style={{ border: "1px solid rgba(100,116,139,0.65)", background: "rgba(51,65,85,0.45)", color: "#cbd5e1", borderRadius: 5, padding: "4px 9px", fontSize: 9, cursor: "pointer", fontFamily: "'Courier New', monospace" }}>RESET</button>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            <div style={{ background: "rgba(10,10,10,0.80)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "4px 6px" }}>
              <div style={{ fontSize: 8, color: "#8ca0b6" }}>Peak JPT1 Δ</div>
              <div style={{ fontSize: 10, color: peakDelta <= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{peakDelta > 0 ? "+" : ""}{peakDelta.toFixed(1)}°C</div>
            </div>
            <div style={{ background: "rgba(10,10,10,0.80)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "4px 6px" }}>
              <div style={{ fontSize: 8, color: "#8ca0b6" }}>Max Ngg Δ</div>
              <div style={{ fontSize: 10, color: nggDelta >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{nggDelta > 0 ? "+" : ""}{nggDelta.toFixed(1)}%</div>
            </div>
            <div style={{ background: "rgba(10,10,10,0.80)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "4px 6px" }}>
              <div style={{ fontSize: 8, color: "#8ca0b6" }}>Time Sustain Δ</div>
              <div style={{ fontSize: 10, color: sustainDelta <= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{sustainDelta > 0 ? "+" : ""}{sustainDelta.toFixed(1)}s</div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Part info tooltip (floats above part legend, locked on click) ─── */}
      {showTelemetryHud && tooltip && (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 72,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(10,10,10,0.96)",
            border: `1.5px solid ${STATUS_COLORS[tooltipStatus].border}`,
            borderRadius: 8,
            padding: "8px 14px",
            maxWidth: 360,
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.40)",
            zIndex: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: STATUS_COLORS[tooltipStatus].glow,
                display: "inline-block",
                boxShadow: `0 0 8px ${STATUS_COLORS[tooltipStatus].glow}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: STATUS_COLORS[tooltipStatus].text,
                fontFamily: "'Courier New', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                flex: 1,
              }}
            >
              {tooltip.label}
            </span>
            <span style={{ fontSize: 8, color: "#8ca0b6", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {tooltipStatus}{selected?.id === tooltip.id ? " · LOCKED" : ""}
            </span>
          </div>
          <div style={{ fontSize: 9, color: "#afc3d8", lineHeight: 1.6 }}>
            {tooltip.description}
          </div>
          {selected?.id !== tooltip.id && (
            <div style={{ marginTop: 5, fontSize: 8, color: "#8ca0b6", fontFamily: "'Courier New', monospace" }}>
              Click to lock selection
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Preload the starter motor model
useGLTF.preload("/Starter Asm..glb");
