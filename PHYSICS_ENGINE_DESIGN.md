# GTSU-110 Digital Twin — Research-Grade Semi-Empirical Physics Engine
## Design Authority Document — Rev 1.0
**Classification:** Engineering Reference  
**Date:** 2026-06-01  
**Scope:** Full physics engine design, state-space formulation, and repository integration plan

---

## TABLE OF CONTENTS

1. [Phase 1 — Reverse-Engineering the Existing Simulator](#phase-1)
2. [Phase 2 — Physical Engine Model Definition](#phase-2)
3. [Phase 3 — Rotor Dynamics](#phase-3)
4. [Phase 4 — Compressor Thermodynamics](#phase-4)
5. [Phase 5 — Combustion Physics](#phase-5)
6. [Phase 6 — Turbine Thermodynamics](#phase-6)
7. [Phase 7 — Thermal Model](#phase-7)
8. [Phase 8 — Environmental Model](#phase-8)
9. [Phase 9 — Physics-Based Telemetry Generation](#phase-9)
10. [Phase 10 — Integration into Existing Architecture](#phase-10)
11. [Final Deliverables](#final-deliverables)

---

<a name="phase-1"></a>
# PHASE 1 — REVERSE-ENGINEERING THE EXISTING SIMULATOR

## 1.1 Current Telemetry Generation Method

All telemetry is generated inside `src/lib/flightSimulator.ts → generateCycle()`.  
The fundamental approach is **parametric curve injection with a PRNG noise overlay**.

### NGG (Gas Generator Speed)
```
nggPct = min(95, 5 + 90 × (1 − exp(−ramp × 2.4)))
ngg    = (nggPct / 100) × 22000 RPM
```
Where `ramp = t / NOMINAL_CYCLE_SEC (40 s)`.  
This is a first-order exponential rise — a proxy for a first-order dynamic system with time constant `τ ≈ 1/2.4 = 0.417` normalised units (≈ 16.7 s real).  
**No rotor inertia, no torque balance, no starter motor model.**

### JPT1 (Jet Pipe Temperature)
```
jpt1 = min(870, 60 + 780 × ramp^0.7)
```
Power-law ramp peaking at 870 °C.  
**No thermal mass, no combustor energy balance, no heat-transfer lag.**

### P2/P1 (Compressor Pressure Ratio)
```
p2p1 = 3.78 + ramp × 0.08 + N(0, 0.01)
```
Linear interpolation from 3.78 to 3.86. The final value 3.86 matches the REFERENCE.md `NOMINAL_P2P1`.  
**No compressor map, no corrected speed, no isentropic calculation.**

### Fuel Flow (kg/h)
```
fuelFlow = 1.2 + ramp × 6.6 + N(0, 0.1)
```
Linear ramp from 1.2 to 7.8 kg/h.  
**No fuel-air ratio, no combustion efficiency, no metering valve dynamics.**

### Vibration (mm/s)
```
vibration = 0.8 + ramp × 1.2 + N(0, 0.075)
```
Linear ramp with noise. No rotor imbalance model, no bearing transfer function.

### Stepper Position
Derived analytically: `stepperPos = round((fuelFlow / 10) × 255)`  
Inverse linear mapping — no valve characteristic, no hysteresis.

## 1.2 Current Startup Curves

Phase classification is time-ratio based only:
```
cranking:       t/duration < 0.15
light-up:       t/duration < 0.32
acceleration:   t/duration < 0.65
self-sustaining: t/duration ≥ 0.65
```

Self-sustain is declared at `nggPct ≥ 57.4 %` (= 12,625 RPM) — this matches the REFERENCE.md constant but is **detected by post-processing scan** rather than modelled as an event trigger.

## 1.3 Current Fault Generation

Faults are probabilistic overlays applied as **additive or multiplicative perturbations** to the nominal curves:

| Fault | Mechanism in Code |
|---|---|
| `hot-start` | `jpt1 += 110 × (ramp − 0.3)` when ramp > 0.3 |
| `hung-start` | `nggPct = min(nggPct, 55 + (ramp−0.5)×4)` + fuel spike |
| `slow-light-up` | `nggPct × 0.92`, `jpt1 × 0.95` |
| `fuel-overshoot` | `fuelFlow += 2.1 × sin(ramp × π)` |
| `compressor-stall` | `p2p1 −= 0.6`, `nggPct × 0.55`, `vibration += 4` |
| `sensor-drift` | `jpt1 += 80 × sin(ramp × 6)` |
| `high-vibration` | `vibration += 6 + 4 × sin(ramp × 12)` |

Fault probability: `P(fault) = 0.04 + wearFactor × 0.18` (increasing with wear).  
**Faults are decorative, not causal.** A compressor stall does not reduce turbine work, which does not reduce NGG — the coupling is absent.

## 1.4 Current Environmental Modelling

- OAT is passed as a cycle seed parameter
- OAT is stored in each `CycleTraceSample` but **has no effect on NGG, JPT1, P2/P1 or fuel flow computation**
- `simulateSandbox()` applies a density correction: `densityCorr = sqrt(288.15 / (OAT + 273.15))` — but this is only in the sandbox, not the main cycle generator
- Altitude, humidity, and pressure are not modelled anywhere

## 1.5 Current Lifecycle Modelling

`accumulateWear()` uses a **table-driven linear accumulator**:
- Six components with `designLifeCycles` and `designLifeHrs` limits
- Each cycle adds `cycleStressWeight` wear units (nominal)
- Fault-matching doubles to triples the wear multiplier
- Hot starts add ×1.4 thermal penalty for turbine/combustor components
- `wearPct = max(wearByCycles, wearByHrs) × 100`
- RUL = `designLifeHrs × (1 − wearPct/100)`
- Failure risk uses a non-linear piecewise curve above 50 % wear

## 1.6 Current Simulator Architecture Summary

```
makeRng(seed)
└── simulateFlight(opts)
    └── for i in totalCycles:
        └── generateCycle(seed)
            ├── faultRoll → status, faultReason
            ├── for t = 0..durationSec:
            │   ├── nggPct  = exponential_ramp(t)
            │   ├── jpt1    = power_law_ramp(t)
            │   ├── p2p1    = linear_ramp(t)
            │   ├── fuel    = linear_ramp(t)
            │   ├── vib     = linear_ramp(t)
            │   └── overlay_fault(t, status)
            └── aggregate_metrics()
    └── accumulateWear(flights)
```

## 1.7 Current Simulator Limitations

| # | Limitation | Engineering Impact |
|---|---|---|
| L1 | No rotor inertia — NGG is a prescribed curve, not computed from torque balance | Cannot reproduce hung-start dynamics, cannot detect energy budget violations |
| L2 | No compressor map — P2/P1 is a constant + linear offset regardless of NGG or OAT | Surge is a random event, not a physical instability |
| L3 | No combustion model — JPT1 has no thermal lag, no FAR dependence | Hot-start risk is not a function of fuel schedule; ignition delay is absent |
| L4 | No turbine work calculation — turbine does not drive the rotor | Net torque is undefined; self-acceleration is implicit |
| L5 | OAT has no effect on NGG or JPT1 generation | Incorrect: hot-day starts have higher JPT1 and lower NGG at same fuel flow |
| L6 | Faults are additive/multiplicative signal overlays | A hot start does not increase bearing temperature; cross-state coupling is missing |
| L7 | Wear model is lookup-table-based, not physics-derived | Cannot predict wear from actual thermal cycles; Weibull or Paris-law models are absent |
| L8 | No starter motor model — starter torque is implicit in the NGG curve | Battery SOC, current draw, starter thermal limits cannot be computed |
| L9 | No cooldown / soakback model — each cycle starts from cold | Inter-cycle thermal state is discarded; hot-restart thermal risk is underestimated |
| L10 | No humidity or pressure altitude effects | High-altitude / maritime environment behaviour is unrepresentable |

## 1.8 Current Physics Assumptions (Explicit and Implicit)

| Parameter | Implicit Assumption | Physical Reality |
|---|---|---|
| γ (ratio of specific heats) | 1.4 (air, implicitly) | Combustion gases: γ ≈ 1.33 at 900 K |
| cp | Not used — energy balance absent | cp_air ≈ 1.005, cp_gas ≈ 1.148 kJ/(kg·K) at turbine inlet |
| Combustion efficiency | 100 % (implicit) | η_comb ≈ 0.97–0.99 at design, lower at off-design |
| Air density | Constant (ISA assumed) | Varies ±25 % across operating envelope |
| Shaft inertia | Infinite (NGG is prescribed) | J_GGS ≈ 0.04–0.06 kg·m² for class turboshaft |
| Thermal mass | Zero (JPT1 responds instantly) | τ_thermal ≈ 2–5 s for JP casing |
| Bearing friction | Not modelled | T_friction ≈ 0.1–0.4 N·m at operating speed |

---

<a name="phase-2"></a>
# PHASE 2 — PHYSICAL ENGINE MODEL DEFINITION

## 2.1 Engine Configuration

The GTSU-110 is a **single-spool gas generator turboshaft** configured as an aircraft ground power and starter unit. The thermodynamic cycle is the **open Brayton cycle** with the following component sequence:

```
Atmosphere → Inlet → Axial-Centrifugal Compressor → Combustor 
           → HP Turbine (drives compressor) → Exhaust → Atmosphere
           ↕
    Starter Motor (DC, engaged during cranking only)
```

From the 3D model node inventory (`turboShaftEngine.glb`):
- Compressor stages: `compressor_1` through `compressor_11` (11 rotor rows)
- HP Turbine: `hp_turbine_0` casing, `power_turbine_0` rotor
- Output shaft: `output_shaft_0`

## 2.2 State Variables

### Primary Continuous States

| State | Symbol | Unit | Physical Meaning |
|---|---|---|---|
| Gas generator rotor speed | ω | rad/s | Angular velocity of the GG spool |
| Compressor outlet temperature | T₂ | K | Total temperature at diffuser exit |
| Combustor exit temperature | T₄ | K | Total temperature at HP turbine inlet (TIT) |
| Jet pipe temperature | T₅ | K | Total temperature at exhaust plane |
| Casing thermal mass temperature | T_case | K | Lumped engine casing thermal state |
| Fuel metering valve position | x_v | [0,1] | Normalised valve opening (stepper position) |
| Combustion chamber pressure | P₃ | kPa | Combustor static pressure |
| Battery state of charge | SOC_batt | [0,1] | Remaining charge fraction |

### Derived Algebraic States (computed each timestep from primary states)

| State | Symbol | Unit | Equation |
|---|---|---|---|
| NGG speed % | N_gg | % | N_gg = (ω / ω_max) × 100 |
| Compressor pressure ratio | PR_c | — | From compressor map f(N_c, Ẇ_c) |
| Corrected speed | N_c | — | N_c = ω / √(T₁/T_ref) |
| Corrected mass flow | Ẇ_c | kg/s | Ẇ_c = Ẇ_a × (P_ref/P₁) × √(T₁/T_ref) |
| Fuel-air ratio | FAR | — | FAR = Ẇ_f / Ẇ_a |
| Compressor work | W_comp | kW | W_comp = Ẇ_a × cp_c × (T₂ − T₁) |
| Turbine work | W_turb | kW | W_turb = Ẇ_g × cp_t × (T₄ − T₅) |
| Net shaft torque | τ_net | N·m | τ_net = (W_turb − W_comp) / ω |
| Starter torque | τ_s | N·m | From DC motor torque-speed curve |
| Bearing friction torque | τ_f | N·m | Stribeck curve f(ω, viscosity) |

## 2.3 Inputs

| Input | Symbol | Unit | Range | Physical Source |
|---|---|---|---|---|
| Fuel command (stepper steps) | u_f | steps (0–255) | 0–255 | SECU digital output |
| Starter enable signal | u_s | boolean | {0,1} | SECU relay |
| Ambient temperature | T₁ | K | 228–333 K | ADU / sensor |
| Ambient pressure | P₁ | kPa | 70–106 kPa | ADU barometric |
| Relative humidity | φ | % | 0–100 % | ADU hygro |
| Starter battery voltage | V_batt | V | 21–29.5 V | Battery management |
| Igniter enable | u_ign | boolean | {0,1} | SECU relay |
| Dust contamination index | DCI | [0,1] | 0–1 | Environment model |

## 2.4 Outputs (SECU-Reported / Dashboard)

| Output | Symbol | Unit | Sensor Type |
|---|---|---|---|
| Jet Pipe Temperature | JPT1 | °C | Type K thermocouple |
| Gas Generator Speed | NGG | RPM | Magnetic pickup / Hall |
| NGG percent | NGG% | % | Derived |
| Compressor pressure ratio | P₂/P₁ | — | Differential pressure transducer |
| Fuel mass flow | Ẇ_f | kg/h | From metering valve stepper |
| Vibration | a_vib | mm/s | Accelerometer, bearing housing |
| Outside Air Temperature | OAT | °C | Ambient probe |
| SECU health | b_secu | bool | BIT |
| MIL-1553B status word | MW | hex | Bus monitor |
| Battery current | I_batt | A | Shunt sensor |

## 2.5 Internal States (Not Exposed to Dashboard)

| State | Reason Internal |
|---|---|
| T₂ — Compressor outlet temperature | Not instrumented on GTSU-110 hardware |
| T₄ — Turbine inlet temperature | Not instrumented (too hot for long-term sensor) |
| Combustion pressure P₃ | Internal combustor parameter, not SECU output |
| Casing temperature T_case | Virtual sensor, for thermal life model only |
| SOC_batt | Battery management system, not SECU parameter |
| τ_net, τ_s | Internal torque states |

## 2.6 Disturbances

| Disturbance | Symbol | Spectral Character |
|---|---|---|
| Compressor inlet turbulence | d_turb | Band-limited white noise |
| Combustion pressure oscillations | d_pogo | Narrowband (Rijke tube modes) |
| Bearing race defect excitation | d_brng | Impulsive (BPFO/BPFI harmonics) |
| Fuel heating value variation (Jet-A batch) | d_LHV | Slow drift ±2 % |
| Inlet distortion from crosswind | d_inlet | Transient step |

## 2.7 Failure Modes (Extended)

| Mode | Physical Cause | State Affected | Observable Signature |
|---|---|---|---|
| Hot start | Excess fuel at light-up | T₄ spike → T₅ spike | JPT1 > 900 °C within first 15 s |
| Hung start | Low turbine work, NGG < self-sustain | ω stalls at 55–60 % | NGG plateau, rising JPT1, high SFC |
| Slow light-up | Igniter energy deficiency or cold soak | FAR transient, T₄ rise delayed | t_selfSustain > 32 s, low JPT1 during light-up |
| Fuel overshoot | Metering valve oscillation / SECU instability | x_v oscillates | Fuel flow sinusoidal, JPT1 oscillatory |
| Compressor stall | Operation left of surge line | PR_c collapses | P2/P1 drop > 0.5, vibration spike, RPM reduction |
| Sensor drift | Thermocouple connector degradation | T₅ virtual path | JPT1 shows bias, passes BIT but trend anomalous |
| High vibration | Rotor imbalance or bearing defect | τ_net oscillates | a_vib > 6 mm/s, sub/super-harmonics of ω |
| Flameout | FAR below lean extinction limit | Combustion extinguished | T₄ collapse, RPM decay after momentary surge |
| Incomplete combustion | Cold soak, low P₃, off-stoichiometric FAR | η_comb < 0.90 | High fuel flow, low JPT1, CO emission proxy |

---

<a name="phase-3"></a>
# PHASE 3 — ROTOR DYNAMICS

## 3.1 Equation of Motion

The gas generator spool is modelled as a **rigid rotor** (single lumped inertia) connected to the compressor and turbine. The governing equation is Newton's second law for rotation:

$$J_{GG} \frac{d\omega}{dt} = \tau_{starter}(\omega, V_{batt}) + \tau_{turbine}(\dot{m}_g, T_4, \omega) - \tau_{compressor}(\dot{m}_a, T_1, \omega) - \tau_{friction}(\omega, \mu_{oil})$$

Where:
- $J_{GG}$ — polar moment of inertia of the gas generator spool (kg·m²)
- $\omega$ — angular velocity (rad/s), `NGG_RPM = ω × 60 / (2π)`
- $\tau_{starter}$ — DC starter motor torque (N·m), function of speed and battery voltage
- $\tau_{turbine}$ — net torque delivered from HP turbine to spool (N·m)
- $\tau_{compressor}$ — torque required to drive the compressor (N·m), acts as load
- $\tau_{friction}$ — bearing friction and windage loss (N·m)

## 3.2 Moment of Inertia Estimation

For a GTSU-class engine (≈ 20–25 kg rotor mass, ≈ 0.08–0.12 m tip radius):

$$J_{GG} = \frac{1}{2} m_{rotor} r_{eff}^2 = \frac{1}{2}(22\text{ kg})(0.09\text{ m})^2 \approx 0.089\text{ kg·m}^2$$

This is decomposed as:
- Compressor impeller stages: `J_c ≈ 0.045 kg·m²`
- HP turbine disc and blades: `J_t ≈ 0.031 kg·m²`
- Shaft, couplings, balance rings: `J_s ≈ 0.013 kg·m²`

**Calibration:** Measure spin-down coast from idle (no fuel, no starter). Fit $\omega(t) = \omega_0 \exp(-t/\tau)$ to determine $J_{GG} / b_{friction}$.

## 3.3 Starter Motor Torque Model

The DC starter motor operates in the **motoring regime** during cranking. For a permanent-magnet or series-wound motor:

$$\tau_{starter}(\omega, V_{batt}) = K_t \cdot I_a(\omega, V_{batt}) \cdot u_s$$

Back-EMF: $V_{emf} = K_e \cdot \omega$  
Armature current: $I_a = \frac{V_{batt} - V_{emf}}{R_a + R_{cable}}$  
Torque: $\tau_s = K_t \cdot I_a$  
Power: $P_s = \tau_s \cdot \omega$

Where:
| Parameter | Symbol | Nominal Value | Unit |
|---|---|---|---|
| Torque constant | K_t | 0.78 | N·m/A |
| Back-EMF constant | K_e | 0.78 | V·s/rad |
| Armature resistance | R_a | 0.12 | Ω |
| Cable/connector resistance | R_cable | 0.04 | Ω |
| Rated voltage | V_nom | 28.5 | V |
| Stall torque at rated V | τ_stall | ~165 | N·m |
| No-load speed | ω_nl | ~38 | rad/s (≈ 365 RPM) |
| Rated power | P_rated | ~3.5 | kW |

**Battery discharge model:**
$$V_{batt}(t) = V_{OC} - I_{batt}(t) \cdot R_{int}(SOC)$$
$$\frac{dSOC}{dt} = -\frac{I_{batt}}{3600 \cdot C_{rated}}$$

The starter disengages at `ω ≥ 0.574 × ω_max` (self-sustain threshold = 57.4 % NGG).

## 3.4 Compressor Load Torque

$$\tau_{compressor} = \frac{\dot{W}_{comp}}{\omega} = \frac{\dot{m}_a \cdot c_{p,air} \cdot (T_2 - T_1)}{\omega}$$

The compressor work per unit mass is:

$$h_{comp} = \frac{c_{p,air} \cdot T_1}{\eta_c} \left[ PR_c^{\frac{\gamma_c - 1}{\gamma_c}} - 1 \right]$$

Where $\eta_c$ is the isentropic efficiency from the compressor map (see Phase 4).

## 3.5 Turbine Driving Torque

$$\tau_{turbine} = \frac{\dot{W}_{turbine}}{\omega} = \frac{\dot{m}_g \cdot c_{p,gas} \cdot (T_4 - T_5)}{\omega}$$

The turbine expansion (see Phase 6) delivers:

$$T_5 = T_4 - \eta_t \cdot T_4 \left[ 1 - \left(\frac{P_5}{P_4}\right)^{\frac{\gamma_t - 1}{\gamma_t}} \right]$$

## 3.6 Bearing Friction Model (Stribeck Curve)

$$\tau_{friction}(\omega) = \left(\mu_{boundary} + \frac{b_{visc} \cdot \omega}{F_{bearing}}\right) F_{bearing} \cdot r_{bearing}$$

For the hydrodynamic regime (≥ 30 % NGG):

$$\tau_{friction} \approx b_{visc} \cdot \omega + \tau_{0}$$

Where `b_visc ≈ 0.0018 N·m·s/rad` and `τ_0 ≈ 0.12 N·m` (Coulomb offset).

**Cold soak correction:** Kinematic viscosity of MIL-PRF-7808 turbine oil at temperature T:

$$\nu(T) = \nu_{40} \exp\left[\frac{B}{T_{oil} + C}\right]$$

For cold soak (T_oil < 0 °C), friction torque rises 3–5× nominal, extending spin-up time.

## 3.7 Rotor Integration Scheme

The ODE is integrated using the **RK4 method** at a 0.1 s timestep (10 Hz telemetry decimated from 100 Hz internal):

$$\omega_{n+1} = \omega_n + \frac{h}{6}\left(k_1 + 2k_2 + 2k_3 + k_4\right)$$

Where $k_i = f(\omega + \Delta\omega_i, t + \Delta t_i) / J_{GG}$.

## 3.8 Derived Quantities

| Quantity | Equation | Unit |
|---|---|---|
| NGG | $N_{gg} = \omega \cdot 60 / (2\pi)$ | RPM |
| NGG % | $N_{gg\%} = (N_{gg} / 22000) \times 100$ | % |
| Angular acceleration | $\dot\omega = \tau_{net} / J_{GG}$ | rad/s² |
| Spin-up time (0 to 57.4%) | $t_{sustain} = \int_0^{\omega_{ss}} J / \tau_{net}\, d\omega$ | s |
| Rotor kinetic energy | $E_k = \frac{1}{2} J_{GG} \omega^2$ | J |
| Starter energy consumed | $E_s = \int_0^{t_{disengage}} P_s\, dt$ | J |
| Battery current drawn | $I_{batt} = I_a + I_{avionics}$ | A |

## 3.9 Parameter Ranges and Calibration

| Parameter | Min | Nominal | Max | Calibration Method |
|---|---|---|---|---|
| $J_{GG}$ (kg·m²) | 0.065 | 0.089 | 0.11 | Coast-down measurement |
| $K_t$ (N·m/A) | 0.70 | 0.78 | 0.85 | Motor test bench |
| $R_a$ (Ω) | 0.09 | 0.12 | 0.18 | DC resistance measurement |
| $b_{visc}$ (N·m·s) | 0.0012 | 0.0018 | 0.0028 | Friction stall measurement |
| $V_{OC}$ (V) | 24.0 | 28.5 | 29.6 | Battery measurement |
| $R_{int}$ (Ω) | 0.01 | 0.025 | 0.06 | Load test |

---

<a name="phase-4"></a>
# PHASE 4 — COMPRESSOR THERMODYNAMICS

## 4.1 Inlet Conditions

Total conditions at compressor face (Station 1):

$$T_{t1} = T_1 \left(1 + \frac{\gamma - 1}{2} M_1^2\right), \quad P_{t1} = P_1 \left(1 + \frac{\gamma - 1}{2} M_1^2\right)^{\gamma/(\gamma-1)}$$

For inlet Mach $M_1 \approx 0.15$–0.20 at design point, the ram recovery is small but must be included for hot-day correction.

## 4.2 Corrected Parameters

All compressor map coordinates use **corrected (referred) quantities** to collapse the map to a single curve:

$$N_{corr} = N\sqrt{\frac{T_{ref}}{T_{t1}}}, \quad \text{where } T_{ref} = 288.15\text{ K}$$

$$\dot{m}_{corr} = \dot{m}_a \cdot \frac{P_{ref}}{P_{t1}} \sqrt{\frac{T_{t1}}{T_{ref}}}, \quad P_{ref} = 101.325\text{ kPa}$$

At any operating point, the compressor map returns $\{PR_c,\ \eta_{c,is}\}$ as functions of $\{N_{corr},\ \dot{m}_{corr}\}$.

## 4.3 Semi-Empirical Compressor Map (Zonal Polynomial)

The compressor map is modelled using a **beta-line parameterisation** (Cumpsty, 1989):

For each corrected speed line $N_{corr,k}$, the pressure ratio is:

$$PR_c(N_{corr}, \dot{m}_{corr}) = PR_{design} \cdot G_1(N^*) \cdot G_2(\dot{m}^*, N^*)$$

Where $N^* = N_{corr}/N_{design}$ and $\dot{m}^* = \dot{m}_{corr}/\dot{m}_{design}$.

**Simplified polynomial fit (for implementation):**

$$PR_c = a_0 + a_1 N^* + a_2 N^{*2} + (b_0 + b_1 N^*) \dot{m}^* + c_0 \dot{m}^{*2}$$

With nominal design coefficients for GTSU-class compressor (single-stage centrifugal):

| Coefficient | Value | Note |
|---|---|---|
| $PR_{design}$ | 3.86 | From REFERENCE.md NOMINAL_P2P1 |
| $a_0$ | 0.20 | Off-design offset |
| $a_1$ | 2.14 | Linear speed term |
| $a_2$ | 0.82 | Quadratic speed term |
| $b_0$ | −1.40 | Mass flow – pressure coupling |
| $b_1$ | 0.68 | Speed–flow cross term |
| $c_0$ | 0.22 | Mass flow curvature |

**Isentropic efficiency map:**

$$\eta_{c,is}(N^*, \dot{m}^*) = \eta_{max} \exp\left[-\left(\frac{\dot{m}^* - \dot{m}^*_{best}(N^*)}{w_\eta}\right)^2\right]$$

Where $\eta_{max} \approx 0.82$, $w_\eta \approx 0.18$ (Gaussian lobe width).

## 4.4 Compressor Outlet Temperature

From isentropic compression with efficiency $\eta_{c,is}$:

$$T_2 = T_{t1} + \frac{T_{t1}}{\eta_{c,is}} \left[ PR_c^{\frac{\gamma_c - 1}{\gamma_c}} - 1 \right]$$

Where $\gamma_c = 1.4$ (for compressed air at ~400 K) and $c_{p,c} = 1.005$ kJ/(kg·K).

## 4.5 Surge Line and Surge Margin

The surge line is defined as a locus $PR_{surge}(N_{corr})$ above which the compressor becomes aerodynamically unstable. A second-order fit:

$$PR_{surge}(N^*) = \alpha_0 + \alpha_1 N^* + \alpha_2 N^{*2}$$

With $\alpha_0 = 0.85$, $\alpha_1 = 2.32$, $\alpha_2 = 1.15$ for a GTSU-class centrifugal stage.

**Surge Margin:**

$$SM = \left(\frac{PR_{surge}(\dot{m}^*_{op}) - PR_c(\dot{m}^*_{op})}{PR_c(\dot{m}^*_{op})}\right) \times 100\%$$

Design SM ≈ 18–22 %. Stall triggered when `SM < 0` (simulated as event flag).

## 4.6 Mass Flow Scaling

At corrected speed $N^*$, mass flow is computed from the speed-throttle relationship:

$$\dot{m}_a = \rho_{t1} \cdot V_{ax} \cdot A_{throat} = \frac{P_{t1} \cdot \dot{m}_{corr}}{P_{ref}} \sqrt{\frac{T_{ref}}{T_{t1}}}$$

## 4.7 Dashboard vs Internal States

**Expose to dashboard:**
- `p2p1` (= PR_c) — directly measurable, existing UI slot
- `nggPct` (= N_corr normalised) — directly measurable

**Keep internal:**
- $T_2$ — not instrumented, feeds combustor model
- $\dot{m}_{corr}$ — feeds turbine work balance
- $\eta_{c,is}$ — used in efficiency and wear model only
- Surge margin — fed to fault classifier only

**Expose as derived diagnostic (virtual sensor):**
- `surgeMargin` — can be shown in Sandbox and ProcessSimulator overlays
- `compressorEfficiency` — performance health indicator

---

<a name="phase-5"></a>
# PHASE 5 — COMBUSTION PHYSICS

## 5.1 Combustor Control Volume

The combustor is modelled as a **well-stirred reactor (WSR)** with a single zone. The combustion zone has a lumped thermal capacity $m_c \cdot c_{p,gas}$.

## 5.2 Fuel-Air Ratio

$$FAR = \frac{\dot{m}_f}{\dot{m}_a}$$

Where $\dot{m}_f$ (kg/s) is derived from the stepper position through the fuel metering valve characteristic:

$$\dot{m}_f = \dot{m}_{f,max} \cdot f_{valve}(x_v) = \dot{m}_{f,max} \cdot x_v^{1.15}$$

The nonlinear exponent (1.15) accounts for the flow characteristic of a needle valve near full open. For $x_v \in [0, 1]$ (normalised stepper position = `stepperPos / 255`).

Maximum fuel flow: $\dot{m}_{f,max} = 10.0\text{ kg/h} = 2.778 \times 10^{-3}\text{ kg/s}$

## 5.3 Heat Release Rate

$$\dot{Q}_{release} = \dot{m}_f \cdot LHV \cdot \eta_{comb}(FAR, P_3, T_2)$$

Where for Jet-A / JP-8:

$$LHV = 43200\text{ kJ/kg}$$

**Combustion efficiency as a function of operating point:**

$$\eta_{comb} = 1 - \exp\left[-A_{ws} \cdot \frac{\theta \cdot P_3^{0.75}}{\dot{m}_a}\right]$$

Where $\theta$ is the loading parameter (Lefebvre, 1983):

$$\theta = \frac{P_3^{1.75} \cdot A_{comb} \cdot D_h}{(\dot{m}_a / V_{ref}) \cdot \exp(T_3 / b)}$$

For implementation, a simplified tabulated efficiency vs FAR and loading is used.

## 5.4 Combustor Exit Temperature (TIT)

Energy balance on the combustion zone control volume:

$$(\dot{m}_a + \dot{m}_f) c_{p,gas} T_4 = \dot{m}_a c_{p,air} T_2 + \dot{Q}_{release}$$

Solving for TIT:

$$T_4 = T_2 + \frac{\dot{m}_f \cdot LHV \cdot \eta_{comb}}{(\dot{m}_a + \dot{m}_f) \cdot c_{p,gas}}$$

Where $c_{p,gas} \approx 1.148$ kJ/(kg·K) at 1200 K.

**Stoichiometric FAR for Jet-A:** $FAR_{stoich} \approx 0.0667$  
**Design FAR:** $FAR_{design} \approx 0.020$–$0.028$ (lean primary zone)

## 5.5 Combustion Dynamics (Thermal Lag)

The combustor does not respond instantly to a fuel command. The combustor zone temperature dynamics are modelled as a first-order lag:

$$\tau_{comb} \frac{dT_4}{dt} = T_4^{eq}(FAR, T_2) - T_4$$

Where $T_4^{eq}$ is the equilibrium TIT from the steady-state equation above, and the combustion time constant $\tau_{comb} \approx 0.3$–$0.5$ s (residence time of combustor volume).

## 5.6 Ignition Model

Ignition requires three conditions to be simultaneously satisfied:

1. **Energy condition:** $E_{igniter} > E_{min}(P_3, T_2, FAR)$
2. **Flammability window:** $FAR_{lean} < FAR < FAR_{rich}$ where $FAR_{lean} \approx 0.010$ and $FAR_{rich} \approx 0.060$
3. **Flow condition:** $V_{primary} < V_{max,ignition} \approx 12\text{ m/s}$

The ignition delay is modelled as:

$$t_{ignition} = \frac{\tau_{ind}}{(T_2 - T_{ref})^{n_T} \cdot P_3^{n_P}}$$

Where `τ_ind = 1.8 × 10⁻³`, `n_T = 2.1`, `n_P = 0.8` (empirical, Jet-A at standard igniter energy).

## 5.7 Lean Blowout (Flameout)

Extinction occurs when:

$$Da = \frac{\tau_{flow}}{\tau_{reaction}} < Da_{critical} \approx 0.3$$

Implementated as: $FAR < FAR_{lean}$ AND $P_3 < P_{min}$ → set `combustionActive = false`.

Recovery requires re-ignition sequence.

## 5.8 Fuel Schedule During Normal Start

The nominal fuel schedule (Metering Valve Law):

| Phase | t (s) | x_v (normalised) | Physical Action |
|---|---|---|---|
| Pre-fuel | 0–3 | 0 | Motoring only |
| Initial fuel injection | 3–5 | 0–0.12 | Reach ignition FAR |
| Ignition window | 5–8 | 0.12–0.18 | Maintain ignition FAR, igniter ON |
| Ramp-up | 8–22 | 0.18–0.55 | Controlled JPT1 ramp |
| Schedule hold | 22–35 | 0.55–0.72 | Full load acceleration |
| Steady state | 35–40 | 0.72 | Governed idle speed |

## 5.9 Hot-Start Physics

Hot start is caused by excess fuel at light-up ($FAR > FAR_{limit}$ at $T_3$) producing $T_4 > T_{4,limit}$.

$$T_4^{hot} = T_2 + \frac{\dot{m}_f^{excess} \cdot LHV}{(\dot{m}_a + \dot{m}_f^{excess}) \cdot c_{p,gas}} > T_{4,ground\_limit}$$

The resulting $T_5$ (JPT1) is fed through the turbine expansion model, giving a physically correct JPT1 exceedance trace instead of a signal overlay.

---

<a name="phase-6"></a>
# PHASE 6 — TURBINE THERMODYNAMICS

## 6.1 HP Turbine Stage

The HP turbine extracts work from the combustion gases to drive the compressor. The turbine is modelled as an **isentropic expansion with efficiency** $\eta_t$:

$$T_{5s} = T_4 \left(\frac{P_5}{P_4}\right)^{\frac{\gamma_t - 1}{\gamma_t}}$$

$$T_5 = T_4 - \eta_t (T_4 - T_{5s})$$

Where $\gamma_t = 1.33$ (hot combustion gases) and $c_{p,gas} = 1.148$ kJ/(kg·K).

## 6.2 Turbine Expansion Ratio

The expansion ratio is linked to the compressor pressure ratio through the combustor pressure drop:

$$\frac{P_4}{P_5} = PR_c \cdot \frac{P_1}{P_5} \cdot (1 - \Delta P_{comb})$$

Where $\Delta P_{comb} \approx 0.04$–$0.06$ (4–6 % combustor pressure loss) and $P_5 \approx P_1$ (ambient exhaust).

## 6.3 Turbine Work and Shaft Torque

$$\dot{W}_{turbine} = \dot{m}_g \cdot c_{p,gas} \cdot (T_4 - T_5)$$

$$\dot{m}_g = \dot{m}_a + \dot{m}_f$$

$$\tau_{turbine} = \frac{\dot{W}_{turbine}}{\omega}$$

## 6.4 Turbine Isentropic Efficiency Map

The turbine efficiency is also speed-dependent (velocity ratio parameter $U/C_0$):

$$U/C_0 = \frac{\omega \cdot r_{mean}}{\sqrt{2 c_{p,gas} T_4 \left[1 - (P_5/P_4)^{(\gamma_t-1)/\gamma_t}\right]}}$$

$$\eta_t = \eta_{t,max} \left[1 - \left(\frac{U/C_0 - (U/C_0)^*}{\sigma_t}\right)^2\right]$$

Where $(U/C_0)^* \approx 0.47$ (design velocity ratio for axial turbine), $\eta_{t,max} \approx 0.88$, $\sigma_t \approx 0.28$.

## 6.5 Transient Startup Behaviour

During the cranking phase ($N^* < 0.30$), mass flow is low and $T_4$ may be ill-defined until ignition. The turbine model is disabled below $T_4 > T_{lightup} = 600$ K (pre-ignition, $\dot{W}_{turbine} = 0$).

After light-up:

1. $T_4$ rises as FAR ramps up
2. $\tau_{turbine}$ grows, exceeding $\tau_{compressor} + \tau_{friction}$
3. Net torque positive → $\omega$ accelerates
4. At $N^* = 0.574$: starter disengages; spool must be self-sustaining
5. Governed idle reached at $N^* \approx 0.92$

## 6.6 Turbine Thermal Loading

Turbine blade life consumption per cycle (Robinson / Larson-Miller approach):

$$LMP = T_{4} \left(C + \log_{10} t_{exposure}\right)$$

Where $C \approx 20$ (Larson-Miller constant for IN-738 nickel superalloy).

Creep damage fraction per cycle:

$$\Delta D_{creep} = \int_0^{t_{cycle}} \frac{1}{t_r(T_4(t), \sigma_{blade})} dt$$

Where $t_r$ is the Larson-Miller rupture time at TIT and blade centrifugal stress.

---

<a name="phase-7"></a>
# PHASE 7 — THERMAL MODEL

## 7.1 Governing Equation

The engine thermal model uses a **lumped-parameter thermal network** with three nodes:

1. **Gas path node** — temperature of hot gas at turbine exit
2. **Combustor casing node** — metal temperature of combustor liner
3. **Engine casing node** — outer casing temperature accessible to infrared sensors

$$m_i c_{p,i} \frac{dT_i}{dt} = \dot{Q}_{in,i} - \dot{Q}_{out,i} - \dot{W}_i$$

For each thermal node $i$.

## 7.2 Gas Path Temperature Dynamics

JPT1 is modelled as the gas temperature $T_5$ with a **transport + thermal lag**:

$$\tau_{JPT1} \frac{dT_{JPT1}}{dt} = T_5(t) - T_{JPT1}(t)$$

Where $\tau_{JPT1} \approx 1.5$–$3.0$ s (thermocouple response time + gas transport delay from combustor to JP probe).

This introduces the characteristic "JPT1 rise after shutdown" (soakback) when hot gas continues to heat the thermocouple after fuel cut.

## 7.3 Combustor Liner Thermal Mass

$$m_{liner} c_{p,Ni} \frac{dT_{liner}}{dt} = h_{gas} A_{liner} (T_4 - T_{liner}) - h_{cool} A_{liner} (T_{liner} - T_{cool})$$

Where:
- $h_{gas} \approx 800$–$1200$ W/(m²·K) — hot gas convective coefficient
- $h_{cool} \approx 400$–$700$ W/(m²·K) — cooling air convective coefficient
- $m_{liner} \approx 0.85$ kg, $c_{p,Ni} \approx 450$ J/(kg·K) for Nimonic 75

Thermal capacity $\tau_{liner} = m_{liner} c_{p,Ni} / (h_{gas} A_{liner}) \approx 8$–$15$ s.

## 7.4 Hot Start Thermal Progression

During a hot start:

1. Fuel overshoot → $\dot{m}_f$ spike → $T_4$ spike within $\tau_{comb} \approx 0.4$ s
2. Gas path temperature $T_5$ follows with lag $\tau_{gas} \approx 0.8$ s
3. JPT1 reads $T_{JPT1}$ with additional lag $\tau_{JPT1} \approx 2$ s
4. At abort threshold (JPT1 > 900 °C), SECU cuts fuel
5. $T_{liner}$ continues rising for $\approx$ 5–8 s post-abort (thermal inertia)
6. Soakback peak (maximum $T_{liner}$) occurs 10–20 s after fuel cut

**Hot start trajectory equations:**

$$T_4^{peak} \approx T_2 + \frac{\dot{m}_{f,peak} \cdot LHV \cdot \eta_{comb}}{(\dot{m}_a + \dot{m}_{f,peak}) c_{p,gas}}$$

$$T_{JPT1}^{peak} \approx T_4^{peak} \cdot \left(\frac{P_5}{P_4}\right)^{\frac{\gamma_t - 1}{\gamma_t}} \cdot \eta_t + (1-\eta_t) T_4^{peak}$$

## 7.5 Thermal Fatigue Index

Each cycle accumulates a thermal fatigue fraction based on the temperature swing and rate:

$$\Delta D_{TF} = C_{TF} \cdot \left(\frac{\Delta T_{cycle}}{1000}\right)^{m_{TF}} \cdot N_f^{-1}(\Delta T, T_{mean})$$

Where $N_f$ is the Coffin-Manson fatigue life at given temperature swing, $m_{TF} \approx 1.9$, and $C_{TF}$ is a material constant.

## 7.6 Shutdown Cooling Model

After fuel cut at $t = t_{shutdown}$:

$$T_{gas}(t) = T_{ambient} + (T_{5,shutdown} - T_{ambient}) \exp\left(-\frac{t - t_{shutdown}}{\tau_{cool}}\right)$$

$$\tau_{cool} \approx 45\text{ s}$$ (ventilation convection, no forced cooling)

This feeds the **inter-cycle initial condition**: if restart occurs before $T_{case} < T_{ambient} + 50$ K, the cycle begins with elevated $T_{t1,eff}$ and elevated compressor outlet temperature $T_2$.

## 7.7 Thermal Life Budget (Exposes to Life Cycle Page)

Cumulative thermal life fraction:

$$TLF = \sum_{k=1}^{N_{cycles}} \left(\Delta D_{creep,k} + \Delta D_{TF,k} + \Delta D_{oxidation,k}\right)$$

At $TLF = 1.0$, the component has consumed its design thermal life.

**Exposed state:** `thermalLifeConsumed` (%) per component — already in `ExtendedTelemetry` type.

---

<a name="phase-8"></a>
# PHASE 8 — ENVIRONMENTAL MODEL

## 8.1 International Standard Atmosphere (ISA)

For altitude $h$ (m) in the troposphere ($h < 11000$ m):

$$T_{ISA}(h) = 288.15 - 0.00650 \cdot h \quad \text{[K]}$$

$$P_{ISA}(h) = 101325 \cdot \left(\frac{T_{ISA}(h)}{288.15}\right)^{5.2561} \quad \text{[Pa]}$$

$$\rho_{ISA}(h) = \frac{P_{ISA}(h)}{R_{air} \cdot T_{ISA}(h)}, \quad R_{air} = 287.05 \text{ J/(kg·K)}$$

**Ambient conditions:**

$$T_1 = T_{ISA}(h) + \Delta T_{deviation}$$

$$P_1 = P_{ISA}(h)$$

Where $\Delta T_{deviation}$ = OAT deviation from ISA standard day at altitude.

## 8.2 Humidity Correction

Moist air density:

$$\rho_{moist} = \rho_{dry} \cdot \left(1 - 0.378 \cdot \frac{e_v}{P_1}\right)$$

Where $e_v = \phi \cdot e_{sat}(T_1)$ is the partial pressure of water vapour and $\phi$ is relative humidity.

**Effect on engine:**
- Reduced air mass flow for same volumetric flow
- Higher specific heat of moist air: $c_{p,moist} = c_{p,dry} + x_w \cdot c_{p,steam}$
- Combustion suppression at very high humidity (FAR must increase to maintain TIT)

## 8.3 Hot Day Effects (OAT > 35 °C)

All corrected parameters degrade as $T_1$ rises above $T_{ref} = 288.15$ K:

$$N_{corr} = N \sqrt{\frac{288.15}{T_1}}$$

At same physical speed $N$, the corrected speed is **lower** on a hot day → operating point moves to lower PR and lower efficiency on the compressor map.

Effect chain:
- $N_{corr} \downarrow$ → $\dot{m}_{corr} \downarrow$ → $\dot{m}_a \downarrow$
- Same $\dot{m}_f$ → $FAR \uparrow$
- $T_4 \uparrow$ → $T_5 \uparrow$ → **JPT1 rises**
- Surge margin reduces (operating point drifts left on map)

Quantified: +1 °C OAT → +2.5 °C JPT1 at constant fuel schedule (empirical rule-of-thumb for small gas turbines).

## 8.4 Cold Day Effects (OAT < −20 °C)

$$N_{corr} = N \sqrt{\frac{288.15}{T_1}} > N \quad \text{(higher corrected speed at same physical N)}$$

Effect chain:
- Higher corrected speed → more mass flow → leaner FAR → lower JPT1 (beneficial for temperature)
- Increased oil viscosity → higher $\tau_{friction}$ → longer spin-up time, higher battery drain
- Cold-soaked components → increased thermal gradients at light-up → thermally-induced cracking risk

## 8.5 High Altitude Effects (Reduced P₁)

At constant physical fuel flow and RPM:
- $\dot{m}_{corr}$ increases (lower $P_1$)
- Physical mass flow drops → FAR rises → JPT1 rises
- Start success probability drops for high-altitude starts (thin combustor loading)

**Start envelope limit (illustrative):**

$$h_{max} = \frac{T_{ISA}^{ref}}{0.0065} \left[1 - \left(\frac{\dot{m}_{a,min,ignition} \cdot R_{air} T_1}{P_{ref} \cdot A_{inlet} V_{ax,min}}\right)^{1/5.256}\right]$$

## 8.6 Dust Contamination

Dust contamination index DCI ∈ [0,1] progressively degrades compressor performance:

$$\eta_{c,fouled}(DCI) = \eta_{c,clean} \cdot (1 - 0.04 \cdot DCI)$$

$$\dot{m}_{a,fouled}(DCI) = \dot{m}_{a,clean} \cdot (1 - 0.025 \cdot DCI)$$

$$PR_{c,fouled}(DCI) = PR_{c,clean} \cdot (1 - 0.032 \cdot DCI)$$

These corrections are consistent with published turbine washing restoration data (Urban, 1972).

## 8.7 Environmental Correction Summary

| Condition | NGG Impact | JPT1 Impact | SFC Impact | Start Success |
|---|---|---|---|---|
| OAT +30 °C (hot day) | −2–3 % | +6–9 % | +3–5 % | −15 % relative |
| OAT −40 °C (cold day) | −4–6 % accel | −4–6 % | +1–2 % (cold oil) | −8 % (cold soak risk) |
| Altitude +3000 m | −8 % mass flow | +10–14 % | +8 % | −20 % relative |
| RH 95 % | −0.5 % | +1.5 % | +1 % | −3 % relative |
| DCI = 0.5 (moderate) | −1.2 % | +2.5 % | +2.2 % | −10 % relative |

---

<a name="phase-9"></a>
# PHASE 9 — PHYSICS-BASED TELEMETRY GENERATION

## 9.1 Architecture

Each telemetry variable is no longer a prescribed curve. It is computed from the ODE system state at each timestep $\Delta t = 0.1$ s (or configurable). The computation order per timestep is:

```
1. Compute ambient corrections (ISA, humidity, dust)
2. Integrate rotor ODE: ω(t+Δt) = RK4(ω, τ_net)
3. Compute corrected speed N_c from ω and T1
4. Look up compressor map: {PR_c, η_c} = f(N_c, ṁ_corr)
5. Compute T2 from PR_c and η_c
6. Compute FAR from ṁ_f (stepper command) and ṁ_a
7. Evaluate combustion model: {T4, η_comb, ignition_state}
8. Compute turbine expansion: T5
9. Integrate thermal nodes: T_JPT1, T_liner, T_case
10. Compute bearing vibration spectrum
11. Evaluate fault classifiers (surge, flameout, overheat)
12. Pack CycleTraceSample with physical outputs
```

## 9.2 Telemetry Parameter Specifications

### NGG (Gas Generator Speed)

| Attribute | Value |
|---|---|
| **Source Equation** | $N_{gg} = \omega \cdot 60 / (2\pi)$; $\omega$ from rotor ODE |
| **Units** | RPM |
| **Expected Range** | 0–22,000 RPM (0–100 % NGG) |
| **Validation Method** | Coast-down test: fit exponential decay to $\omega(t)$; extract $J/b$ |
| **Failure Behaviour** | Hung-start: $N_{gg}$ stalls below 57.4 % when $\tau_{turbine} < \tau_{compressor} + \tau_{friction}$; physically causal |

### JPT1 (Jet Pipe Temperature)

| Attribute | Value |
|---|---|
| **Source Equation** | $T_{JPT1}$ from thermal lag ODE; $T_5$ from turbine expansion model |
| **Units** | °C (= $T_{JPT1}$ [K] − 273.15) |
| **Expected Range** | OAT to 1020 °C (ground limit 900 °C) |
| **Validation Method** | Compare startup trace to flight test card at nominal OAT; T-t slope 15–25 °C/s during acceleration |
| **Failure Behaviour** | Hot start: $T_4$ spike propagates through $T_5$ to $T_{JPT1}$ with 2–3 s delay; physically modelled |

### P2/P1 (Compressor Pressure Ratio)

| Attribute | Value |
|---|---|
| **Source Equation** | $PR_c = f(N_c, \dot{m}_c)$ from compressor map polynomial |
| **Units** | Dimensionless |
| **Expected Range** | 1.0 (static) to 3.86 (design) |
| **Validation Method** | Compare operating line slope to aero test cell data |
| **Failure Behaviour** | Compressor stall: $PR_c$ collapses when $SM < 0$; mass flow drops, vibration spikes |

### Fuel Flow (kg/h)

| Attribute | Value |
|---|---|
| **Source Equation** | $\dot{m}_f = \dot{m}_{f,max} \cdot f_{valve}(x_v)$; $x_v = stepperPos / 255$ |
| **Units** | kg/h |
| **Expected Range** | 0–10 kg/h |
| **Validation Method** | Flow bench test of metering valve; compare stepper command vs flow at bench pressure |
| **Failure Behaviour** | Fuel overshoot: $x_v$ oscillates (valve instability modelled as gain-scheduled limit cycle) |

### Vibration (mm/s)

| Attribute | Value |
|---|---|
| **Source Equation** | $a_{vib} = K_{imbal} \cdot \omega^2 \cdot e_{imbal} + \sum_k A_k \sin(\omega_k t + \phi_k)$ |
| **Units** | mm/s RMS |
| **Expected Range** | 0.5–8.0 mm/s (alert at 6, abort at 12) |
| **Validation Method** | Trim balance test; compare predicted imbalance response to balancing machine data |
| **Failure Behaviour** | Bearing defect: $\omega_k = BPFO \cdot (N_{gg}/60)$ — distinctive sideband pattern in spectrum |

### Starter Battery Current (I_batt)

| Attribute | Value |
|---|---|
| **Source Equation** | $I_{batt} = (V_{batt} - K_e \omega) / (R_a + R_{cable})$ |
| **Units** | A |
| **Expected Range** | 0–280 A (stall to no-load) |
| **Validation Method** | Compare to starter datasheet torque-speed curve; verify current peaks at correct NGG |
| **Failure Behaviour** | High resistance connection: elevated $I_{batt}$ for same torque; increased $V_{drop}$ |

### Stepper Position (Fuel Metering Valve)

| Attribute | Value |
|---|---|
| **Source Equation** | $stepperPos = \text{SECU metering command}$ (input, not derived) |
| **Units** | Steps (0–255) |
| **Expected Range** | 0–255 |
| **Validation Method** | SECU ARINC word calibration; compare step count to valve position sensor |
| **Failure Behaviour** | Valve stiction: $x_v$ does not follow $stepperPos$ → FAR error → JPT1/NGG deviation |

### OAT (Outside Air Temperature)

| Attribute | Value |
|---|---|
| **Source Equation** | Environmental model input; $T_1 = OAT + 273.15$ [K] |
| **Units** | °C |
| **Expected Range** | −54 to +50 °C |
| **Validation Method** | ADU calibration; comparison to reference thermometer |
| **Failure Behaviour** | Sensor stuck: constant OAT despite changing altitude/time → environmental corrections fail |

### SECU Health / BIT Pass

| Attribute | Value |
|---|---|
| **Source Equation** | BIT output from SECU's built-in test (modelled as: fail if any monitored parameter deviates > threshold) |
| **Units** | Boolean |
| **Expected Range** | True (pass) nominal |
| **Validation Method** | Inject known fault; verify BIT flags at correct fault severity |
| **Failure Behaviour** | Sensor drift fault: BIT may pass while physical sensor deviates — latent fault mode |

### MIL-STD-1553B Status Word

| Attribute | Value |
|---|---|
| **Source Equation** | Status bits set by fault classifier outputs |
| **Units** | 16-bit hex word |
| **Expected Range** | 0x0000 (healthy) |
| **Validation Method** | Protocol analyser on bench |
| **Failure Behaviour** | Word ≠ 0x0000 → fault code interpretation per existing bit mapping |

---

<a name="phase-10"></a>
# PHASE 10 — INTEGRATION INTO EXISTING ARCHITECTURE

## 10.1 Architectural Contract

The physics engine must satisfy the **zero-breaking-change contract**: all existing downstream consumers continue to receive `CycleTraceSample` objects with identical field shapes. The physics engine is a **drop-in replacement for `generateCycle()`** only.

```
[EXISTING]                        [NEW]
generateCycle(seed)               generateCyclePhysics(seed, PhysicsParams)
  → CycleTraceSample[]      ===     → CycleTraceSample[]
```

The `CycleTraceSample` interface in `types/engine.ts` gains **three new optional physics fields** without breaking existing consumers:

```typescript
// ADDITIONS ONLY — no removals
interface CycleTraceSample {
  // ...existing fields unchanged...
  battCurrent?:    number;  // A — from starter motor model
  surgeMargin?:    number;  // % — from compressor map
  t4?:             number;  // K  — internal TIT (virtual sensor)
}
```

## 10.2 New File: `src/lib/physicsEngine.ts`

This is the **only new source file** required. It exports:

```typescript
// Physics parameter set (replaces hardcoded constants in flightSimulator.ts)
export interface PhysicsParams {
  J_gg:           number;   // kg·m² — rotor inertia
  K_t:            number;   // N·m/A — motor torque constant
  K_e:            number;   // V·s/rad — back-EMF constant
  R_a:            number;   // Ω — armature resistance
  V_batt:         number;   // V — battery voltage
  LHV:            number;   // kJ/kg — fuel lower heating value
  eta_t_max:      number;   // — turbine isentropic efficiency
  eta_c_max:      number;   // — compressor isentropic efficiency
  tau_JPT1:       number;   // s — JPT1 thermal lag
  tau_comb:       number;   // s — combustion time constant
  b_visc:         number;   // N·m·s — viscous damping
  tau_0:          number;   // N·m — Coulomb friction
}

// Physics state (carried across timesteps)
export interface PhysicsState {
  omega:          number;   // rad/s
  T4:             number;   // K — TIT
  T_JPT1:         number;   // K — jet pipe temp (with lag)
  T_liner:        number;   // K — combustor liner
  SOC_batt:       number;   // [0,1]
  ignitionActive: boolean;
  combustionOn:   boolean;
  surgeFlag:      boolean;
}

// Main integration step — called once per timestep
export function stepPhysics(
  state: PhysicsState,
  params: PhysicsParams,
  env: EnvironmentState,
  control: ControlInput,
  dt: number,
): PhysicsState

// Convert physics state to CycleTraceSample row
export function stateToTelemetry(
  state: PhysicsState,
  env: EnvironmentState,
  t: number,
  phase: StartPhase,
): CycleTraceSample

// Compressor map lookup
export function compressorMap(N_corr: number, m_corr: number): { PR: number; eta: number }

// Default parameters (calibrated nominal GTSU-110)
export const DEFAULT_PHYSICS_PARAMS: PhysicsParams
```

## 10.3 Modified File: `src/lib/flightSimulator.ts`

**Changes required (minimal):**

1. Replace the inner `for (let t = 0; t <= durationSec; t++)` loop in `generateCycle()` with a call to `stepPhysics()` per timestep
2. Pass `PhysicsParams` (default or fault-perturbed) to the physics integrator
3. **All existing code outside this inner loop is unchanged**: fault selection, wear accumulation, `simulateFlight()`, `simulateSandbox()`, `accumulateWear()`

```typescript
// BEFORE:
for (let t = 0; t <= durationSec; t++) {
  let nggPct = Math.min(95, 5 + 90 * (1 - Math.exp(-ramp * 2.4)));
  let jpt1   = Math.min(870, 60 + 780 * Math.pow(ramp, 0.7));
  // ... empirical overlays ...
}

// AFTER:
let physState = initPhysicsState(oat, wearFactor);
for (let t = 0; t <= durationSec; t++) {
  const control = buildControlInput(t, faultReason, physicsParams);
  physState = stepPhysics(physState, physicsParams, envState, control, 1.0);
  const sample = stateToTelemetry(physState, envState, t, classifyPhase(t, durationSec));
  trace.push(sample);
}
```

## 10.4 Modified File: `src/types/engine.ts`

**Additions only:**

```typescript
// New exports (append to existing file)
export interface EnvironmentState {
  T1_K:       number;   // K — ambient temperature
  P1_kPa:     number;   // kPa — ambient pressure
  humidity:   number;   // [0,1]
  altitude_m: number;   // m
  DCI:        number;   // [0,1] dust contamination
}

export interface ControlInput {
  stepperCmd:   number;   // 0–255
  starterOn:    boolean;
  igniterOn:    boolean;
}

export interface PhysicsCalibration {
  J_gg:      number;
  K_t:       number;
  K_e:       number;
  R_a:       number;
  b_visc:    number;
  tau_0:     number;
  eta_c_max: number;
  eta_t_max: number;
}
```

## 10.5 Files Requiring No Modification

The following files **must not be changed** during physics engine insertion:

| File | Reason |
|---|---|
| `src/store/useGTSUStore.ts` | Consumes `CycleTraceSample[]` — shape preserved |
| `src/pages/PostFlightAnalysisPage.tsx` | Reads from Zustand store — no change |
| `src/pages/ProcessSimulatorPage.tsx` | Replays `trace[]` — no change |
| `src/pages/LifeCyclePage.tsx` | Reads `wear[]` from `accumulateWear()` — no change |
| `src/pages/SandboxPage.tsx` | Calls `simulateSandbox()` — unchanged |
| `src/components/EngineModel3D.tsx` | Uses `ngg` from live frame — no change |
| `src/components/LineChart.tsx` | Chart renderer — no change |
| `src/services/socket.tsx` | Alert/advisory mock — no change |
| `backend/main.py` | FastAPI server — no change |

## 10.6 Sandbox Enhancement (Optional, Non-Breaking)

`simulateSandbox()` currently uses simplified equations. The physics engine can replace the inner calculation without changing inputs/outputs:

```typescript
// BEFORE: algebraic sandbox
const compEff = Math.max(0.55, 0.86 - Math.pow(igv / 14, 2) * 0.25);

// AFTER: physics engine at steady state
const {PR, eta} = compressorMap(N_corr, m_corr);
const T2 = computeT2(T1, PR, eta);
const T4 = computeT4(T2, FAR, eta_comb);
const T5 = computeT5(T4, PR, eta_turbine);
```

Outputs `SandboxOutputs` shape is unchanged.

## 10.7 Store Extension for Physics Visibility

Add to `useGTSUStore` (non-breaking, additive):

```typescript
// New optional state fields
physicsParams:     PhysicsParams | null;  // null = use defaults
physicsEnabled:    boolean;               // toggle physics vs empirical mode
setPhysicsParams:  (p: PhysicsParams) => void;
setPhysicsEnabled: (v: boolean) => void;
```

This allows a **calibration mode toggle** — A/B comparison between empirical and physics-based traces for validation purposes.

---

<a name="final-deliverables"></a>
# FINAL DELIVERABLES

## D1 — Complete Physical Model Summary

```
GTSU-110 Engine Subsystems:
  1. Starter Motor:      DC motor, torque-speed curve, battery drain model
  2. Compressor:         Semi-empirical map, corrected speed/flow, surge line
  3. Combustor:          WSR model, fuel-air ratio, ignition, flameout
  4. Gas Generator Spool: Rigid rotor ODE, torque balance, RK4 integration
  5. HP Turbine:         Isentropic expansion, velocity ratio efficiency map
  6. Thermal Network:    3-node lumped model, JPT1 lag, soakback, fatigue
  7. Environment:        ISA + OAT deviation, humidity, altitude, dust
  8. Fault Classifiers:  Surge detector, hot-start detector, flameout detector
```

## D2 — State-Space Representation

The physics engine is a **nonlinear state-space system**:

$$\dot{\mathbf{x}} = f(\mathbf{x}, \mathbf{u}, \mathbf{d}, t)$$
$$\mathbf{y} = g(\mathbf{x}, \mathbf{u})$$

### State Vector

$$\mathbf{x} = \begin{bmatrix} \omega \\ T_4 \\ T_{JPT1} \\ T_{liner} \\ SOC_{batt} \\ x_v \end{bmatrix} \in \mathbb{R}^6$$

### Input Vector

$$\mathbf{u} = \begin{bmatrix} u_{stepper} \\ u_{starter} \\ u_{igniter} \end{bmatrix} \in \{[0,255], \{0,1\}, \{0,1\}\}$$

### Disturbance Vector

$$\mathbf{d} = \begin{bmatrix} T_1 \\ P_1 \\ \phi \\ DCI \end{bmatrix}$$

### Output Vector (Observable Telemetry)

$$\mathbf{y} = \begin{bmatrix} N_{gg} \\ N_{gg\%} \\ JPT1 \\ PR_c \\ \dot{m}_f \\ a_{vib} \\ I_{batt} \\ phase \end{bmatrix}$$

### Linearised System (Perturbation Model — for UKF/EKF)

At an operating point $(\mathbf{x}^*, \mathbf{u}^*)$:

$$\delta\dot{\mathbf{x}} = A \delta\mathbf{x} + B \delta\mathbf{u} + G \delta\mathbf{d}$$
$$\delta\mathbf{y} = C \delta\mathbf{x} + D \delta\mathbf{u}$$

Where $A = \partial f / \partial \mathbf{x}|_*$, $B = \partial f / \partial \mathbf{u}|_*$, computed numerically from the nonlinear model.

This linearised form enables future **Kalman filter state estimation** (Phase C of the roadmap).

## D3 — Thermodynamic Model Summary

| Component | Energy Equation | Key Outputs |
|---|---|---|
| Compressor | $\dot{W}_c = \dot{m}_a c_{p,c}(T_2 - T_1) / \eta_c$ | $T_2$, PR_c |
| Combustor | $T_4 = T_2 + \dot{m}_f LHV \eta_{comb} / (\dot{m}_g c_{p,gas})$ | $T_4$, FAR |
| Turbine | $\dot{W}_t = \dot{m}_g c_{p,t}(T_4 - T_5)$ | $T_5$, $\tau_{turbine}$ |
| Net cycle | $\eta_{th} = (W_t - W_c) / Q_{in}$ | Thermal efficiency |
| JPT1 lag | $\tau_{JPT1} dT_{JPT1}/dt = T_5 - T_{JPT1}$ | JPT1 (measured) |

**Brayton cycle efficiency (design point):**

$$\eta_{th} = 1 - \frac{T_1}{T_4} \cdot \frac{PR_c^{(\gamma-1)/\gamma} - 1}{\eta_c \cdot \eta_t} \approx 12\text{–}18\%$$

(GTSU-class starter turbine — not optimised for efficiency)

## D4 — Rotor Dynamics Model Summary

$$J_{GG} \dot\omega = \tau_s(\omega, V_b) + \tau_t(\dot{m}_g, T_4, \omega) - \tau_c(\dot{m}_a, T_1, \omega) - \tau_f(\omega)$$

| Term | Expression |
|---|---|
| $\tau_s$ | $K_t (V_b - K_e \omega) / (R_a + R_c)$ |
| $\tau_t$ | $\dot{m}_g c_{p,t} \eta_t T_4 [1 - (P_5/P_4)^{(\gamma_t-1)/\gamma_t}] / \omega$ |
| $\tau_c$ | $\dot{m}_a c_{p,c} T_1 [PR_c^{(\gamma_c-1)/\gamma_c} - 1] / (\eta_c \omega)$ |
| $\tau_f$ | $b_{visc} \omega + \tau_0$ |

Integration: RK4, $\Delta t = 0.1$ s.

## D5 — Thermal Model Summary

Three-node thermal network:

$$m_g c_{p,gas} \frac{dT_5}{dt} = \dot{m}_g c_{p,gas}(T_4^{in} - T_5) - h_{JP} A_{JP}(T_5 - T_{case})$$

$$m_c c_{p,Ni} \frac{dT_{liner}}{dt} = h_{gas} A_{liner}(T_4 - T_{liner}) - h_{cool} A_{liner}(T_{liner} - T_{cool})$$

$$\tau_{JPT1} \frac{dT_{JPT1}}{dt} = T_5 - T_{JPT1}$$

Shutdown: natural convective cooling with $\tau_{cool} \approx 45$ s.

## D6 — Environmental Model Summary

$$\delta_{T} = \sqrt{T_{ref}/T_1}, \quad \delta_P = P_1/P_{ref}$$

All corrected parameters:
- $N_{corr} = N / \sqrt{T_1/T_{ref}}$
- $\dot{m}_{corr} = \dot{m}_a \cdot \delta_P \cdot \delta_T^{-1}$
- $PR_{c,corrected} = PR_c$ (pressure ratio is dimensionless, no correction needed but operating point shifts)

Dust contamination: polynomial degradation of $\eta_c$, $\dot{m}_a$, $PR_c$ (3 coefficients per parameter, function of DCI).

## D7 — Telemetry Generation Model Summary

```
Physical ODE System (6 states) @ 100 Hz internal
    ↓ RK4 integration
Physical State Vector (ω, T4, T_JPT1, T_liner, SOC, x_v)
    ↓ stateToTelemetry()
CycleTraceSample @ 1 Hz (decimated from 10 Hz)
    ↓ generateCycle() aggregation
StartCycle (peakJpt1, maxNggPct, fuelUsedKg, efficiency, trace[])
    ↓ simulateFlight()
FlightRecord
    ↓ useGTSUStore
All UI pages
```

All existing UI consumers receive `CycleTraceSample[]` — identical interface.

## D8 — Calibration Strategy

### Phase 1 — Component-Level Calibration

| Component | Test | Parameters Extracted |
|---|---|---|
| Starter motor | No-load spin test + stall torque test at rated voltage | $K_t$, $K_e$, $R_a$ |
| Rotor inertia | Coast-down from 80 % NGG | $J_{GG}$, $b_{visc}$ |
| Compressor map | Throttle sweep at constant speed, variable inlet restriction | $\{a_i, b_i, c_i\}$ polynomial coefficients, surge line |
| Fuel valve | Flow bench test vs stepper command at 3 pressures | $f_{valve}(x_v)$ exponent |
| Combustor dynamics | Step fuel command, measure $\Delta T_4 / \Delta t$ | $\tau_{comb}$, $\eta_{comb}(FAR)$ |
| Turbine efficiency | Matched turbine rig test | $\eta_{t,max}$, $(U/C_0)^*$ |
| JPT1 lag | Step fuel cut, measure decay $T_{JPT1}(t)$ | $\tau_{JPT1}$ |
| Battery model | Load step at 3 SOC values | $V_{OC}(SOC)$, $R_{int}(SOC)$ |

### Phase 2 — System-Level Calibration

1. Run nominal start at ISA day, record full trace
2. Compare physics model prediction vs hardware at each second
3. Apply least-squares parameter adjustment to minimise:
   $$J(\theta) = \sum_{t=0}^{T} \left[(\hat{N}_{gg}(t) - N_{gg}(t))^2 + w_J(\hat{JPT1}(t) - JPT1(t))^2\right]$$
4. Iterate until residuals < 2 % RMS on NGG and < 5 °C RMS on JPT1

### Phase 3 — Fault Calibration

Inject each fault on hardware rig (or high-fidelity simulator), record signature, calibrate fault perturbation parameters in physics model to reproduce:
- Hot-start: calibrate excess fuel quantity vs JPT1 peak
- Hung-start: calibrate combustion efficiency reduction vs NGG plateau
- Compressor stall: calibrate surge line with inlet distortion

### Parameter Uncertainty Bounds

Each calibrated parameter carries a ±1σ uncertainty used for **Monte Carlo envelope generation**:

$$\theta_k \sim \mathcal{N}(\hat\theta_k, \sigma_{\theta_k}^2)$$

Run N = 500 Monte Carlo samples to generate prediction bands around nominal trace — used for anomaly detection thresholds in PHM.

## D9 — Validation Strategy

### Acceptance Criteria

| Parameter | Max Steady-State Error | Max Transient Error |
|---|---|---|
| NGG % | ±1.5 % | ±4 % |
| JPT1 | ±8 °C | ±20 °C |
| P2/P1 | ±0.03 | ±0.08 |
| Fuel Flow | ±0.15 kg/h | ±0.40 kg/h |
| Vibration | ±0.5 mm/s | ±2.0 mm/s |
| Self-sustain time | ±2 s | — |

### Validation Test Matrix

| Test Case | Purpose | Pass Criterion |
|---|---|---|
| Nominal start, ISA day | Baseline physics validation | All parameters within acceptance criteria |
| Hot day (+30 °C) start | Environmental model | JPT1 +6–9 °C vs ISA baseline |
| Cold day (−30 °C) start | Cold friction model | Spin-up time +3–6 s vs baseline |
| Hot start injection | Fault physics | JPT1 > 900 °C within t_fault ±2 s |
| Hung start injection | Rotor dynamics | NGG stalls at 55–60 % for > 5 s |
| Compressor stall injection | Map physics | P2/P1 drops > 0.4 in < 1 s |
| Repeatability (N=20 runs) | Numerical stability | σ(NGG) < 0.1 %, σ(JPT1) < 1 °C |
| Backward compatibility | Interface contract | All existing UI pages render correctly |

### V&V Standards Alignment

| Standard | Applicability | Status with Physics Engine |
|---|---|---|
| MIL-HDBK-516C (Airworthiness) | Simulation V&V | In-progress |
| DO-331 (Model-Based Methods) | Design simulation | Aligned |
| ASME V&V 10-2006 | Computational simulation | Planned |
| ISO 13373 (Vibration monitoring) | Vibration telemetry | Aligned |

## D10 — Repository Integration Plan

### Execution Sequence

```
Step 1: Add new types to src/types/engine.ts
        — EnvironmentState, ControlInput, PhysicsCalibration
        — 3 new optional fields on CycleTraceSample
        — No breaking changes

Step 2: Create src/lib/physicsEngine.ts
        — Full physics integration (new file)
        — Exports: stepPhysics, stateToTelemetry, compressorMap,
                   DEFAULT_PHYSICS_PARAMS, initPhysicsState

Step 3: Modify src/lib/flightSimulator.ts  (surgical)
        — Replace inner trace generation loop in generateCycle()
        — Keep all outer logic: fault selection, wear, aggregation
        — Estimated: ~60 lines replaced, ~0 lines deleted outside loop

Step 4: Add physicsEnabled toggle to useGTSUStore.ts  (additive)
        — Allows A/B comparison: empirical vs physics
        — Default: physicsEnabled = true (new behaviour)
        — No UI required initially; can be toggled via devtools

Step 5: Validate via existing test infrastructure
        — Run full flight simulation
        — Verify CycleTraceSample shape unchanged
        — Verify all pages render
        — Check physics acceptance criteria numerically

Step 6 (Optional): Expose surgeMargin + battCurrent in ProcessSimulator
        — Add two chart lanes in LineChart component
        — No store changes required

Step 7 (Optional): Calibration UI in SandboxPage
        — Sliders for J_gg, K_t, tau_JPT1
        — Live preview of physics trace vs empirical trace
```

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Physics ODE diverges at edge cases | Medium | High | Clamp ω ≥ 0; add guard against PR < 1; unit-test all branches |
| Longer simulation time (RK4 vs curve) | Low | Medium | Profile; RK4 at 10 Hz is < 1 ms/cycle; acceptable |
| Breaking change to CycleTraceSample | Low | Critical | Only add optional fields; existing destructuring unaffected |
| Calibration parameters poorly identified | Medium | Medium | Use default params; physics is better than empirical even uncalibrated |
| Hot-start physics produces non-physical JPT1 | Low | Medium | Clamp T4 < T4_limit in model; add sanity assertion |

### Backward Compatibility Checklist

- [x] `CycleTraceSample` interface — fields added only, all optional
- [x] `StartCycle` interface — no changes required
- [x] `FlightRecord` interface — no changes required
- [x] `ComponentWearRecord` — no changes required
- [x] `SandboxInputs` / `SandboxOutputs` — no changes required
- [x] `useGTSUStore` public API — additive only
- [x] `simulateFlight()` signature — unchanged
- [x] `accumulateWear()` — unchanged
- [x] `simulateSandbox()` — unchanged (or optionally improved)
- [x] Backend FastAPI endpoints — unaffected
- [x] All page components — unaffected (read from store)

---

## APPENDIX A — Notation Table

| Symbol | Description | Unit |
|---|---|---|
| $\omega$ | Angular velocity of gas generator spool | rad/s |
| $J_{GG}$ | Polar moment of inertia, GG spool | kg·m² |
| $\tau$ | Torque (with subscript) | N·m |
| $T_1, T_2, T_4, T_5$ | Station total temperatures | K |
| $P_1, P_2, P_4, P_5$ | Station total pressures | kPa |
| $PR_c$ | Compressor pressure ratio P₂/P₁ | — |
| $\dot{m}_a$ | Air mass flow rate | kg/s |
| $\dot{m}_f$ | Fuel mass flow rate | kg/s |
| $FAR$ | Fuel-to-air ratio | — |
| $LHV$ | Lower heating value of Jet-A | kJ/kg |
| $\eta_c$ | Compressor isentropic efficiency | — |
| $\eta_t$ | Turbine isentropic efficiency | — |
| $\eta_{comb}$ | Combustion efficiency | — |
| $c_{p,c}$ | Specific heat of air (compressor) | kJ/(kg·K) |
| $c_{p,gas}$ | Specific heat of hot gas (turbine) | kJ/(kg·K) |
| $\gamma_c$ | Ratio of specific heats, air | 1.40 |
| $\gamma_t$ | Ratio of specific heats, combustion gas | 1.33 |
| $N_{corr}$ | Corrected rotor speed | RPM/√K |
| $\dot{m}_{corr}$ | Corrected mass flow | kg/s·(√K/kPa) |
| $SM$ | Compressor surge margin | % |
| $SOC$ | Battery state of charge | [0,1] |
| $K_t$ | Motor torque constant | N·m/A |
| $K_e$ | Motor back-EMF constant | V·s/rad |
| $R_a$ | Motor armature resistance | Ω |
| $TLF$ | Thermal life fraction consumed | — |
| $DCI$ | Dust contamination index | [0,1] |

## APPENDIX B — Reference GTSU-110 Design Point

| Parameter | Value |
|---|---|
| Max NGG | 22,000 RPM |
| Nominal P2/P1 | 3.86 |
| Light-up NGG | 12,625 RPM (57.4 %) |
| Ground JPT1 limit | 900 °C |
| Flight JPT1 limit | 1,020 °C |
| Nominal cycle duration | 40 s |
| Nominal fuel flow (idle) | 6.4–7.8 kg/h |
| Self-sustain threshold | 57.4 % NGG |
| Max fuel flow | 10.0 kg/h |
| Fuel type | Jet-A / JP-8 |
| LHV (Jet-A) | 43,200 kJ/kg |
| ISA reference T | 288.15 K |
| ISA reference P | 101.325 kPa |

---

*End of GTSU-110 Physics Engine Design Document*  
*For laboratory validation use. Not for operational deployment without hardware V&V.*
