# GTSU-110 Digital Twin

A research-grade **digital twin and simulation platform** for the GTSU-110 gas turbine starter unit. This system combines physics-based engine simulation, 3D model visualization, telemetry monitoring, and prognostic health management (PHM) to understand and predict turbine engine behavior across the full operational envelope.

**Status:** POC/Research Phase — Physics engine under development (Phase B of 8-phase roadmap)

---

## Quick Start

### Prerequisites
- **Node.js** 18+ (check with `node --version`)
- **Python** 3.10+ (for backend FastAPI server)
- **npm** or **pnpm** (Node package manager)

### Installation

```bash
# Install Node dependencies
npm install

# Create and activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows

# Install backend dependencies
pip install fastapi uvicorn

# Generate sample flight data (optional)
python generate_flight_csv.py
```

### Running the Application

**Terminal 1 — Frontend (Vite dev server)**
```bash
npm run dev
# Opens http://localhost:5173
```

**Terminal 2 — Backend (FastAPI)**
```bash
python backend/main.py
# Serves on http://localhost:8000
```

Login with:
- **Username:** `admin`
- **Password:** `admin123`

---

## Project Overview

### What is GTSU-110?

The **GTSU-110** (Gas Turbine Starter Unit) is a compact, single-spool turboshaft engine used as an aircraft auxiliary power unit (APU) and starter. This digital twin is designed to:

1. **Simulate realistic engine startup profiles** — from cold cranking through light-up and self-sustaining acceleration
2. **Model fault conditions** — hot starts, hung starts, compressor stalls, sensor drift
3. **Track component wear** — thermal fatigue, creep damage, lifecycle remaining
4. **Visualize 3D engine geometry** — interactive GLB model with real-time rotor rotation and component health indicators
5. **Enable research** — validate physics models, test diagnostics algorithms, train anomaly detectors

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Pages:                                                 │  │
│  │  • PostFlightAnalysisPage — Replay recorded cycles    │  │
│  │  • ProcessSimulatorPage — Live telemetry visualization│  │
│  │  • LifeCyclePage — Component wear tracking            │  │
│  │  • SandboxPage — Off-design performance simulator     │  │
│  │  • CWMProfile — User settings                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────┐      ┌──────────────────────────┐  │
│  │ Zustand Store        │      │ 3D Visualization         │  │
│  │ (Global State)       │      │ (Three.js + R3F)         │  │
│  │ • Flights[]          │      │ • GLB model loader       │  │
│  │ • Wear tracking      │      │ • Health colouring       │  │
│  │ • Simulation control │      │ • Real-time rotation     │  │
│  └──────────────────────┘      └──────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ In-Browser Flight Simulator (flightSimulator.ts)      │   │
│  │ • Parametric engine models (aerodynamic curves)       │   │
│  │ • Telemetry generation (NGG, JPT1, P2/P1, etc.)      │   │
│  │ • Fault injection (7 fault modes)                     │   │
│  │ • Wear accumulation                                   │   │
│  │ → FUTURE: Replace with physics-based engine model     │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                                       │
         │                                       │
         ▼                                       ▼
┌─────────────────────┐        ┌─────────────────────────────┐
│  FastAPI Backend    │        │  Mock Data Broker           │
│  (Port 8000)        │        │  (PHM alerts/advisories)    │
│  • Flight DB REST   │        │  • React Context            │
│  • Read-only API    │        │  • Seeded randomness        │
│  • SQLite queries   │        │  • Not production-grade     │
└─────────────────────┘        └─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  SQLite Database (data/flights.db)      │
│  Tables:                                │
│  • flights (metadata)                   │
│  • cycles (start/stop/peak metrics)     │
│  • trace (per-second telemetry)         │
└─────────────────────────────────────────┘
```

---

## Directory Structure

```
GTSU110/
├── README.md (this file)
├── PHYSICS_ENGINE_DESIGN.md       ← Detailed physics model specification
├── REFERENCE.md                   ← Repository reference & constants
├── package.json                   ← Node.js dependencies
├── tsconfig.json                  ← TypeScript configuration
├── vite.config.ts                 ← Vite bundler configuration
├── tailwind.config.js             ← Tailwind CSS setup
├── eslint.config.js               ← Code linting rules
├── server.js                      ← Production server entry point
│
├── src/                           ← React + TypeScript frontend
│   ├── App.tsx                    ← Root app with auth gate and routing
│   ├── index.css                  ← Global styles
│   ├── main.tsx                   ← Vite entry point
│   │
│   ├── components/                ← Reusable React components
│   │   ├── EngineModel3D.tsx      ← Three.js 3D viewer + health colouring
│   │   ├── LineChart.tsx          ← Custom canvas-based line chart
│   │   ├── SimulationConsole.tsx  ← VCR-style playback controls
│   │   └── ...                    ← Layout, buttons, modals, etc.
│   │
│   ├── lib/                       ← Core simulation & utility logic
│   │   ├── flightSimulator.ts     ← In-browser PRNG flight engine
│   │   ├── engineHotspots.ts      ← Per-page hotspot definitions
│   │   └── ...                    ← Other utilities
│   │
│   ├── pages/                     ← Route pages (one per main view)
│   │   ├── PostFlightAnalysisPage.tsx
│   │   ├── ProcessSimulatorPage.tsx
│   │   ├── LifeCyclePage.tsx
│   │   ├── SandboxPage.tsx
│   │   └── CWMProfile.tsx
│   │
│   ├── services/                  ← API clients and data brokers
│   │   ├── api.ts                 ← Axios HTTP client (port 8000)
│   │   └── socket.tsx             ← Mock DataContext (PHM alerts)
│   │
│   ├── store/                     ← Zustand global state management
│   │   └── useGTSUStore.ts        ← Single source of truth
│   │
│   └── types/                     ← TypeScript domain types
│       └── engine.ts              ← All interfaces (Flight, Cycle, etc.)
│
├── backend/                       ← Python FastAPI server
│   └── main.py                    ← REST API endpoints + SQLite queries
│
├── data/                          ← Sample flight database & CSVs
│   ├── flights.db                 ← SQLite database
│   └── csvs/
│       └── flight_*.csv           ← Per-flight telemetry export
│
├── public/                        ← Static assets
│   ├── turboShaftEngine.glb       ← 3D engine model (11 compressor stages)
│   └── ...                        ← Fonts, icons, etc.
│
└── .github/
    └── workflows/
        └── deploy.yml             ← CI/CD pipeline (GitHub Actions)
```

---

## Key Features & Pages

### 1. **PostFlightAnalysisPage** (Route: `/`)

Review and analyze **recorded engine startup cycles** after flight.

**Key Features:**
- Flight browser (dropdown or list)
- Cycle selector (each flight has 1–many startup cycles)
- **4-lane telemetry chart:**
  - NGG (Gas Generator Speed) — RPM
  - JPT1 (Jet Pipe Temperature) — °C
  - P2/P1 (Compressor Pressure Ratio) — dimensionless
  - Vibration — mm/s
- **Metrics panel:**
  - Peak JPT1 and NGG
  - Fuel used, cycle duration
  - Cycle status (success/fault)
  - Wear impact (per component)
- **3D visualization:** Live rotor rotation synchronized to telemetry

**Use Case:** Post-flight review, trend analysis, fault diagnosis

### 2. **ProcessSimulatorPage** (Route: `/simulator`)

**Real-time** engine simulation and monitoring.

**Key Features:**
- **Run Simulation:** Generate new flights with configurable parameters
  - Number of cycles, ambient temperature (OAT), wear factor
  - Fault injection probability
- **VCR-style playback:** Play/pause/seek through ongoing simulation
- **Live frame info:** Real-time telemetry values and phase classification (cranking, light-up, acceleration, etc.)
- **Ring buffer history:** Last 120 seconds of live data (auto-truncating)
- **3D model:** Real-time rotation and health indication

**Use Case:** What-if analysis, fault injection testing, live monitoring simulation

### 3. **LifeCyclePage** (Route: `/life-cycle`)

**Component wear tracking** and remaining useful life (RUL) prediction.

**Tracks 6 engine components:**
1. **HPT Blades** — Thermal creep damage
2. **Combustor Liner** — Oxidation + thermal cycling
3. **HP Compressor** — Blade rub damage
4. **Fuel Nozzles** — Coking risk
5. **SECU Main** — Electrical stress
6. **Turbine Bearing** — Spalling risk

**Key Features:**
- Wear percentage per component (design-life depletion)
- Accumulated damage index (linear table-driven model)
- Alert thresholds (yellow at 70%, red at 90%)
- Download/export capability

**Use Case:** Maintenance scheduling, fleet management, RUL forecasting

### 4. **SandboxPage** (Route: `/sandbox`)

**Off-design performance exploration** — adjust throttle, temperature, altitude and see real-time telemetry response.

**Inputs:**
- **Power setting:** 0–100 % (governor command)
- **OAT:** −54 to +50 °C
- **Altitude:** 0–10,668 m (35,000 ft)
- **Dust contamination:** 0–100 % (fouls compressor)

**Outputs:**
- NGG, JPT1, P2/P1, fuel flow
- Engine efficiency, surge margin
- Virtual sensors (compressor outlet temp, etc.)

**Use Case:** Envelope exploration, environmental correction validation, physics model tuning

### 5. **CWMProfile** (Route: `/profile`)

User profile and settings (minimal POC implementation).

---

## The Flight Simulator Engine

### How It Works

**File:** `src/lib/flightSimulator.ts`

The simulator generates realistic engine startup cycles using **parametric curves + fault injection**:

```typescript
simulateFlight(opts: SimulationOptions)
  ├─ makeRng(seed)  ← Deterministic PRNG
  │
  ├─ for each cycle:
  │  └─ generateCycle(seed)
  │     ├─ Roll fault (7% base + wear factor)
  │     │  ├─ hot-start, hung-start, slow-light-up, etc.
  │     │  └─ Apply perturbations to nominal curves
  │     │
  │     ├─ Integrate nominal telemetry (parametric curves)
  │     │  ├─ NGG:   exponential ramp  ngg = 5 + 90×(1 - e^(-2.4t))
  │     │  ├─ JPT1:  power-law ramp   jpt1 = 60 + 780×t^0.7
  │     │  ├─ P2/P1: linear ramp      p2p1 = 3.78 + 0.08×t
  │     │  └─ ...
  │     │
  │     └─ Aggregate metrics (peaks, totals)
  │
  └─ accumulateWear(cycles)
     └─ Linear table-driven wear accumulation
```

**Key Constants** (from `REFERENCE.md`):
- `MAX_NGG_RPM = 22,000`
- `NOMINAL_P2P1 = 3.86`
- `LIGHTUP_RPM = 12,625` (57.4% NGG)
- `GROUND_JPT1_LIMIT = 900°C`
- `FLIGHT_JPT1_LIMIT = 1,020°C`
- `NOMINAL_CYCLE_SEC = 40`

### Fault Modes (7 injected randomly)

| Fault | Effect |
|-------|--------|
| **hot-start** | JPT1 > 900°C within 15s (excess fuel at light-up) |
| **hung-start** | NGG stalls at 55–60% (insufficient turbine work) |
| **slow-light-up** | JPT1 rise delayed > 32s (weak igniter) |
| **fuel-overshoot** | Sinusoidal fuel flow oscillation (metering valve instability) |
| **compressor-stall** | P2/P1 collapse, vibration spike (aerodynamic surge) |
| **sensor-drift** | JPT1 bias error (thermocouple aging) |
| **high-vibration** | Vibration > 6 mm/s sustained (rotor imbalance) |

### Wear Model

Each cycle adds **cycleStressWeight** (nominal) to component wear. Faults increase the penalty:
- Normal cycle: 1× multiplier
- Faulty cycle: 2–3× multiplier
- Hot start on turbine/combustor: +1.4× thermal penalty

**RUL Calculation:**
```
wearPct = max(wearByCycles, wearByHrs) × 100
RUL = designLifeHrs × (1 − wearPct/100)
```

---

## Global State Management

**Zustand Store** (`src/store/useGTSUStore.ts`)

Single source of truth for all persistent and transient state:

### Persistent Data
- `flights[]` — Array of completed FlightRecord objects
- `wear[]` — Component wear accumulation
- `sandboxRuns[]` — Off-design simulation results

### Simulation Control
- `isFlightSimRunning` — Spinner flag
- `flightSimProgress` — 0–100 %

### Playback State (Post-Flight Analysis)
- `selectedCycleId` — Currently viewed cycle
- `isPlaying` — VCR play/pause
- `replayElapsedSec` — Playhead position
- `replaySpeed` — 1× to 10× time warp

### Live Simulation State
- `liveMode` — true during real-time playback
- `liveFrame` — Current frame (CycleTraceSample)
- `liveHistory` — Ring buffer of last 120 seconds

### Backend DB State
- `backendFlights[]` — Flights loaded from SQLite
- `loadedBackendFlight` — Currently viewed backend flight
- `backendFlightsStatus`, `loadingFlightId` — Async status

### Console Playback (SimulationConsole component)
- `consoleSec`, `consoleSpeed`, `consoleIsPlaying`

---

## Telemetry Parameters

Each second of engine operation is a **CycleTraceSample** with these fields:

```typescript
interface CycleTraceSample {
  t: number;              // Seconds elapsed in cycle
  jpt1: number;           // Jet Pipe Temperature (°C)
  ngg: number;            // Gas Generator Speed (RPM)
  nggPct: number;         // NGG as % of max (0–100)
  p2p1: number;           // Compressor Pressure Ratio
  fuelFlow: number;       // Fuel mass flow (kg/h)
  stepperPos: number;     // Fuel metering valve stepper (0–255)
  vibration: number;      // Vibration (mm/s RMS)
  oat: number;            // Outside Air Temperature (°C)
  secuHealthy: boolean;   // SECU BIT pass
  bitPass: boolean;       // Built-in test result
  milBusWord: number;     // MIL-1553B status word (hex)
  phase: StartPhase;      // "cranking" | "light-up" | "acceleration" | "self-sustaining"
  
  // FUTURE physics model additions (optional):
  battCurrent?: number;   // Starter battery current (A)
  surgeMargin?: number;   // Compressor surge margin (%)
  t4?: number;            // Turbine inlet temperature (K) - virtual sensor
}
```

### Startup Phase Classification

| Phase | Condition |
|-------|-----------|
| **cranking** | t / duration < 15 % |
| **light-up** | 15 % ≤ t / duration < 32 % |
| **acceleration** | 32 % ≤ t / duration < 65 % |
| **self-sustaining** | t / duration ≥ 65 % OR NGG ≥ 57.4 % |

---

## Backend API

**FastAPI Server** (`backend/main.py` on port 8000)

### Endpoints

```
GET /api/health
  → { "status": "ok" }

GET /api/flights
  → FlightRecord[]

GET /api/flights/{id}
  → FlightRecord (with full cycle data)

GET /api/flights/{id}/trace?cycle=N
  → CycleTraceSample[]

GET /api/flights/{id}/cycles/{cycle_num}
  → StartCycle (aggregate metrics)
```

### Database Schema

**SQLite** (`data/flights.db`)

```
flights
├── id (PK)
├── timestamp
├── oat
├── wearFactor
└── ...

cycles
├── id (PK)
├── flight_id (FK)
├── cycleNumber
├── peakJpt1
├── maxNggPct
├── status (success | fault)
└── ...

trace
├── id (PK)
├── flight_id (FK)
├── cycleNumber
├── timestep
├── jpt1, ngg, p2p1, fuelFlow, ...
└── ...
```

**CSV Export:** `data/csvs/flight_{id}.csv` (per-flight telemetry)

---

## 3D Visualization

**Three.js Engine Model** (`src/components/EngineModel3D.tsx` + `public/turboShaftEngine.glb`)

### GLB Model Structure

- **Rotor nodes** (spin with engine):
  - `compressor_1` through `compressor_11` (11 stages)
  - `power_turbine_0`
  - `output_shaft_0`

- **Static nodes** (no rotation):
  - `compressor_0` (inlet casing)
  - `hp_turbine_0` (turbine casing)

### Runtime Behavior

1. **Shaft creation:** All rotor nodes reparented into a single `__shaft_pivot__` Group
2. **Rotation:** `shaft.rotation.y = (NGG / 22000) × 8π rad/s`
3. **Health coloring:** Each rotor node has emissive color lerped based on component wear
   - Green (healthy) → Yellow (degraded) → Red (critical)
   - Lerp rate: 3 units/s (smooth transitions)

---

## Physics Engine (Under Development)

**Phase B of 8-phase roadmap** — Currently in design phase.

### Future Replacement of `generateCycle()`

The current simulator uses **parametric curves** (analytically prescribed). Phase B will replace this with a **physics-based Brayton cycle solver**:

```
Current (empirical):
  ngg = 5 + 90 × (1 − e^(−2.4t))    ← No physical basis
  
Physics-based (future):
  J_GG dω/dt = τ_starter − τ_turbine + τ_compressor − τ_friction
  τ_turbine = Ẇ_gas c_p (T4 − T5) / ω
  T4 = T2 + Ẇ_f LHV η_comb / (Ẇ_a + Ẇ_f) c_p,gas
```

**Status:** Design spec complete (`PHYSICS_ENGINE_DESIGN.md`), awaiting implementation.

**Key Physics Models:**
- Rotor dynamics (torque balance ODE)
- Compressor map (corrected speed/flow, surge line)
- Combustion (fuel-air ratio, thermal lag)
- Turbine expansion (isentropic efficiency)
- Thermal network (JPT1 lag, soakback)
- Environmental corrections (OAT, altitude, humidity)

---

## Development Commands

```bash
# Development server (hot reload)
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Preview production build locally
npm run preview

# FastAPI backend
python backend/main.py

# Generate sample data
python generate_flight_csv.py
```

---

## Known Issues & Technical Debt

### Critical (Production-Blocking)

- ⚠️ **Mock authentication** — `admin / admin123` hardcoded in `src/services/api.ts`
- ⚠️ **CORS wildcard** — `allow_origins=['*']` in `backend/main.py`
- ⚠️ **No state persistence** — Zustand store resets on page reload (no `persist` middleware)

### Minor (Usability)

- `socket.io-client` installed but **not connected** to any WebSocket server
- `@supabase/supabase-js` installed but entirely **unused**
- Port 5000 backend endpoints **declared but unimplemented**
- `chart.js` + `react-chartjs-2` **installed but not imported** (custom LineChart used instead)
- **Single-series charting only** — no multi-series overlay or residual diagnostics

### Physics & Simulation

- **No environmental correction** — OAT affects nothing in current model
- **Faults are overlays, not causal** — Hot start doesn't heat the casing; stall doesn't reduce turbine work
- **No thermal mass** — JPT1 responds instantly (no lag model)
- **Wear is table-driven** — No Weibull or Paris-law fatigue theory

---

## Implementation Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| **A** | Repository stabilisation (deps, auth, CORS) | 🟡 Partial |
| **B** | Physics layer (Brayton solver, maps) | 🟤 Design |
| **C** | State estimation (UKF/EKF) | 🟤 Not started |
| **D** | Residual generation (innovation vector) | 🟤 Not started |
| **E** | Fault diagnostics (CUSUM, EWMA) | 🟤 Not started |
| **F** | PHM (wear, Weibull RUL, scheduling) | 🟤 Not started |
| **G** | Lab simulation (real rig WebSocket) | 🟤 Not started |
| **H** | Research validation (experiment logging) | 🟤 Not started |

---

## Contributing

This is a **research/POC project**. Contributions welcome for:

1. **Physics validation** — Compare simulator traces to flight test data
2. **UI/UX improvements** — Diagnostic dashboards, export tools
3. **Backend enhancement** — Real WebSocket data ingestion, persistence
4. **Testing** — Unit tests for simulator, API contract tests

---

## License

Internal research project. Not for external distribution without explicit approval.

---

## Contact & Support

- **Project Lead:** @tvmokshith (git user)
- **Email:** astrikos.productteam06@gmail.com
- **Documentation:** See `PHYSICS_ENGINE_DESIGN.md` for deep technical details and `REFERENCE.md` for quick lookup

---

## Quick Reference

### Keyboard Shortcuts & Navigation

- **Main flow:** Dashboard (PostFlightAnalysis) → Simulator → Life Cycle → Sandbox → Profile
- **Simulation:** Run → Wait for completion → Click cycle → Replay in ProcessSimulator
- **Export:** Right-click chart → Download CSV

### Constants to Know

```typescript
MAX_NGG_RPM = 22000
NOMINAL_P2P1 = 3.86
SELF_SUSTAIN_THRESHOLD = 57.4%  // NGG% at which starter disengages
GROUND_JPT1_LIMIT = 900°C
FLIGHT_JPT1_LIMIT = 1020°C
NOMINAL_CYCLE_DURATION = 40 s
```

### Files to Review First

1. **For the big picture:** This README + REFERENCE.md
2. **For physics details:** PHYSICS_ENGINE_DESIGN.md (10,000+ lines)
3. **For code architecture:** `src/store/useGTSUStore.ts` → `src/pages/` → `src/lib/flightSimulator.ts`
4. **For 3D model:** `src/components/EngineModel3D.tsx` + `public/turboShaftEngine.glb`

---

*Last updated: 2026-06-02*
