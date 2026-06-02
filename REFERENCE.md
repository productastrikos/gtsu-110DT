# GTSU-110 Digital Twin — Repository Reference

## Stack
- React 18.3.1 + TypeScript 5.5.3, Vite 4.5.14, Zustand 5.0.9
- Three.js 0.161 + @react-three/fiber 8.13 + @react-three/drei 9.49
- FastAPI ≥0.110 + Uvicorn ≥0.27 + SQLite (stdlib)
- Tailwind CSS 3.4.1, Axios 1.16, Framer Motion 12.24
- **Dead dependencies:** chart.js, react-chartjs-2, socket.io-client (mock only), @supabase/supabase-js

## Ports
| Service | Port |
|---|---|
| Vite dev server | 5173 |
| FastAPI flight DB | 8000 |
| Port 5000 (declared, unimplemented) | 5000 |

## Key Files
| File | Purpose |
|---|---|
| `src/App.tsx` | Auth gate + BrowserRouter + SocketProvider wrap |
| `src/store/useGTSUStore.ts` | Single Zustand store — all global state |
| `src/lib/flightSimulator.ts` | PRNG simulation engine (in-browser) |
| `src/lib/engineHotspots.ts` | Hotspot builders per page |
| `src/types/engine.ts` | All domain type definitions |
| `src/components/EngineModel3D.tsx` | Three.js GLB viewer + per-node health colouring |
| `src/components/LineChart.tsx` | Custom Canvas 2D single-series chart |
| `src/components/SimulationConsole.tsx` | VCR-style cycle playback |
| `src/services/socket.tsx` | Mock DataContext — seeded alerts/advisories, NO WebSocket |
| `src/services/api.ts` | Two Axios instances (port 5000 unused, port 8000 used) |
| `backend/main.py` | FastAPI REST — read-only, 5 endpoints |
| `generate_flight_csv.py` | Generates data/flights.db + data/csvs/flight_NNN.csv |

## Routes
| Route | Page |
|---|---|
| `/` | PostFlightAnalysisPage |
| `/simulator` | ProcessSimulatorPage |
| `/life-cycle` | LifeCyclePage |
| `/sandbox` | SandboxPage |
| `/profile` | CWMProfile |

## Zustand Store — State Categories
1. `flights[]`, `wear[]`, `sandboxRuns[]` — persistent data
2. `isFlightSimRunning`, `flightSimProgress` — simulation control
3. `selectedCycleId`, `isPlaying`, `replayElapsedSec`, `replaySpeed` — replay
4. `liveMode`, `liveFrame`, `liveHistory` (ring buffer MAX=120) — live telemetry
5. `backendFlights[]`, `loadedBackendFlight`, `backendFlightsStatus`, `loadingFlightId` — backend DB
6. `consoleSec`, `consoleSpeed`, `consoleIsPlaying` — console playback
- **PHM alerts/advisories are NOT in Zustand** — they live in React useState inside SocketProvider

## Telemetry Parameters (CycleTraceSample)
`t, jpt1, ngg, nggPct, p2p1, fuelFlow, stepperPos, vibration, oat, secuHealthy, bitPass, milBusWord, phase`

## Physics Constants
| Constant | Value |
|---|---|
| MAX_NGG_RPM | 22,000 |
| NOMINAL_P2P1 | 3.86 |
| LIGHTUP_RPM | 12,625 (57.4% Ngg) |
| SELF_SUSTAIN | 57.4% |
| GROUND_JPT1 limit | 900°C |
| FLIGHT_JPT1 limit | 1,020°C |
| NOMINAL_CYCLE | 40 s |

## Fault Modes (7)
`hot-start, hung-start, slow-light-up, fuel-overshoot, compressor-stall, sensor-drift, high-vibration`

## Component Wear (6 components)
`hpt-blades, combustor-liner, hp-compressor, fuel-nozzles, secu-main, turbine-bearing`

## 3D Model (turboShaftEngine.glb)
- **Rotor nodes:** `power_turbine_0`, `output_shaft_0`, `compressor_1`–`compressor_11`
- **Static nodes:** `compressor_0` (casing), `hp_turbine_0` (casing) — no health tint
- Runtime `__shaft_pivot__` Group is created and all ROTOR_NAMES reparented into it
- Rotation: `(ngg / 22000) × 8π rad/s`
- Health colouring: emissive lerp at LERP_SPEED=3 units/s

## Authentication
- Mock bypass: `admin / admin123` → hardcoded token stored in localStorage `cwm_token`
- **Production security risk — must replace before deployment**

## Backend — FastAPI Endpoints
- `GET /api/health`
- `GET /api/flights`
- `GET /api/flights/{id}`
- `GET /api/flights/{id}/trace` (optional `?cycle=N`)
- `GET /api/flights/{id}/cycles/{cycle_num}`
- CORS: `allow_origins=['*']` — **dev only, restrict for production**

## SQLite Tables
`flights`, `cycles`, `trace` — all read-only via API

## Digital Twin Readiness Scores
| Dimension | Score |
|---|---|
| Telemetry | 4/10 |
| Physics | 2/10 |
| Visualization | 7/10 |
| PHM | 2/10 |
| Simulation | 5/10 |
| Research | 3/10 |

## Implementation Roadmap (Phases A–H)
| Phase | Goal |
|---|---|
| A | Repository stabilisation (dead deps, CORS, auth, devtools) |
| B | Physics layer — Brayton cycle solver, compressor/turbine maps |
| C | State estimation — UKF/EKF for unmeasured state variables |
| D | Residual generation — innovation vector per telemetry channel |
| E | Fault diagnostics — CUSUM/EWMA detection, fault signature matrix |
| F | PHM — physics-based wear, Weibull RUL, maintenance scheduling |
| G | Laboratory simulation mode — real WebSocket rig data ingestion |
| H | Research validation — experiment logging, algorithm injection API |

## Known Issues / Technical Debt
- `socket.io-client` installed but not connected to any WS server
- `@supabase/supabase-js` installed but entirely unused
- Port 5000 backend endpoints declared in `api.ts` but no backend implements them
- CORS wildcard (`allow_origins=['*']`) in `backend/main.py`
- Mock auth (`admin/admin123`) hardcoded in `src/services/api.ts`
- `chart.js` and `react-chartjs-2` installed but not imported anywhere
- LineChart is single-series only — no multi-series or residual overlay support
- No state persistence (Zustand has no persist middleware) — store resets on page reload
