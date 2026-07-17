import axios from 'axios';

// Backend origin comes from VITE_API_URL. Empty (dev) → same-origin `/api`,
// which the Vite proxy forwards to the local backend.
const API_URL  = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const API_BASE = `${API_URL}/api`;

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cwm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cwm_token');
      localStorage.removeItem('cwm_user');
      window.dispatchEvent(new CustomEvent('cwm:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const login = (username: string, password: string) => {
  // Mock bypass — no backend needed for development
  if (username === 'admin' && password === 'admin123') {
    return Promise.resolve({
      data: {
        token: 'mock-token',
        user: { name: 'Admin User', username: 'admin', role: 'Operations Engineer', email: 'admin@gtsu.aero' },
      },
    });
  }
  return Promise.reject({ response: { data: { message: 'Invalid credentials. Use: admin / admin123' } } });
};
export const getMe = () => api.get('/auth/me');
export const getDashboard = () => api.get('/dashboard');
export const getVehicles = (params?: object) => api.get('/vehicles', { params });
export const dispatchVehicle = (vehicleId: string, zone: string) => api.post(`/vehicles/${vehicleId}/dispatch`, { zone });
export const getBins = (params?: object) => api.get('/bins', { params });
export const getAlerts = (params?: object) => api.get('/alerts', { params });
export const acknowledgeAlert = (alertId: string) => api.put(`/alerts/${alertId}/acknowledge`);
export const getAdvisories = () => api.get('/advisories');
export const acknowledgeAdvisory = (id: string) => api.put(`/advisories/${id}/acknowledge`);
export const getWeather = () => api.get('/weather');
export const getZones = () => api.get('/zones');

// ─── Flight Database (Express backend, server.js) ────────────────────────────

import type {
  BackendFlight, BackendCycle, TraceRow,
  FlightRecord,
} from '../types/engine';

const flightApi = axios.create({ baseURL: API_BASE, timeout: 30000 });

/** List all flights (metadata only). */
export const getBackendFlights = () =>
  flightApi.get<BackendFlight[]>('/flights');

/** Single flight metadata + cycle summaries. */
export const getBackendFlight = (id: number) =>
  flightApi.get<BackendFlight & { cycles: BackendCycle[] }>(`/flights/${id}`);

/** Full 1-Hz trace for a flight. Large (~2-3 MB per flight). */
export const getFlightTrace = (id: number) =>
  flightApi.get<TraceRow[]>(`/flights/${id}/trace`);

/** Check backend reachability. */
export const pingFlightDB = () =>
  flightApi.get<{ status: string }>('/health', { timeout: 3000 });

/**
 * Save a locally-simulated FlightRecord to the backend.
 * Converts the frontend camelCase structure to the backend snake_case schema.
 * Returns the created BackendFlight on success.
 */
export const saveFlightToBackend = (flight: FlightRecord): Promise<{ data: BackendFlight }> => {
  let cumulativeSec = 0;

  const payload = {
    flight_label: `Sim-${new Date().toISOString().slice(0, 10)}-${flight.id.slice(-6)}`,
    duration_hrs: flight.durationHrs,
    date:         new Date().toISOString().slice(0, 10),
    cycles: flight.cycles.map(c => {
      const cycleStart = cumulativeSec;
      const cycleEnd   = cumulativeSec + c.durationSec;
      cumulativeSec    = cycleEnd;

      return {
        cycle_number:             c.cycleNumber,
        flight_hour_elapsed:      c.flightHour,
        cycle_status:             c.status,
        fault_type:               c.faultReason ?? '',
        corrective_action:        c.improvement ?? '',
        duration_sec:             c.durationSec,
        peak_jet_pipe_temp_degC:  c.peakJpt1,
        max_gas_gen_speed_pct:    c.maxNggPct,
        fuel_consumed_kg:         c.fuelUsedKg,
        cycle_start_sec:          cycleStart,
        cycle_end_sec:            cycleEnd,
        trace: c.trace.map(s => ({
          elapsed_time_sec:          cycleStart + s.t,
          start_phase:               s.phase as string,
          jet_pipe_temp_degC:        s.jpt1,
          gas_gen_speed_rpm:         s.ngg,
          gas_gen_speed_pct:         s.nggPct,
          compressor_pressure_ratio: s.p2p1,
          ambient_temp_degC:         s.oat,
          fuel_valve_steps:          s.stepperPos,
          fuel_flow_kg_per_hr:       s.fuelFlow,
          vibration_mm_per_sec:      s.vibration,
          secu_processor_ok:         s.secuHealthy ? 1 : 0,
          built_in_test_pass:        s.bitPass ? 1 : 0,
          mil_1553b_status_word:     `0x${s.milBusWord.toString(16).toUpperCase().padStart(4, '0')}`,
          cycle_status:              c.status,
          fault_type:                c.faultReason ?? '',
          flight_hour_elapsed:       c.flightHour,
        })),
      };
    }),
  };

  return flightApi.post<BackendFlight>('/flights', payload, { timeout: 60000 });
};

/** Delete a stored flight from the backend. */
export const deleteBackendFlight = (id: number) =>
  flightApi.delete(`/flights/${id}`);

export default api;
