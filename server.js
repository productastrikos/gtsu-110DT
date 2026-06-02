import express from 'express';
import { createClient } from '@libsql/client';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DB_PATH  = join(__dirname, 'data', 'flights.db');
const CSV_DIR  = join(__dirname, 'data', 'csvs');
const DIST_DIR = join(__dirname, 'dist');
const PORT     = process.env.PORT || 8000;

mkdirSync(join(__dirname, 'data'), { recursive: true });
mkdirSync(CSV_DIR, { recursive: true });

const db = createClient({ url: `file:${DB_PATH.replace(/\\/g, '/')}` });

const CSV_TRACE_FIELDS = [
  'flight_id', 'cycle_number', 'elapsed_time_sec', 'start_phase',
  'jet_pipe_temp_degC', 'gas_gen_speed_rpm', 'gas_gen_speed_pct',
  'compressor_pressure_ratio', 'ambient_temp_degC', 'fuel_valve_steps',
  'fuel_flow_kg_per_hr', 'vibration_mm_per_sec', 'secu_processor_ok',
  'built_in_test_pass', 'mil_1553b_status_word', 'cycle_status',
  'fault_type', 'flight_hour_elapsed',
];

// ── Schema ────────────────────────────────────────────────────────────────────
await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS flights (
    id                       INTEGER PRIMARY KEY,
    flight_label             TEXT    NOT NULL,
    duration_hrs             REAL    NOT NULL,
    total_start_cycles       INTEGER NOT NULL,
    date                     TEXT    NOT NULL,
    success_rate_pct         REAL    NOT NULL,
    faulty_cycle_count       INTEGER NOT NULL,
    avg_peak_jpt1_degC       REAL    NOT NULL,
    total_fuel_kg            REAL    NOT NULL,
    total_trace_duration_sec REAL    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cycles (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_id                INTEGER NOT NULL REFERENCES flights(id),
    cycle_number             INTEGER NOT NULL,
    flight_hour_elapsed      REAL    NOT NULL,
    cycle_status             TEXT    NOT NULL,
    fault_type               TEXT    NOT NULL DEFAULT '',
    corrective_action        TEXT    NOT NULL DEFAULT '',
    duration_sec             REAL    NOT NULL,
    peak_jet_pipe_temp_degC  REAL    NOT NULL,
    max_gas_gen_speed_pct    REAL    NOT NULL,
    fuel_consumed_kg         REAL    NOT NULL,
    cycle_start_sec          REAL    NOT NULL,
    cycle_end_sec            REAL    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trace (
    id                         INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_id                  INTEGER NOT NULL REFERENCES flights(id),
    cycle_number               INTEGER NOT NULL,
    elapsed_time_sec           REAL    NOT NULL,
    start_phase                TEXT    NOT NULL,
    jet_pipe_temp_degC         REAL    NOT NULL,
    gas_gen_speed_rpm          INTEGER NOT NULL,
    gas_gen_speed_pct          REAL    NOT NULL,
    compressor_pressure_ratio  REAL    NOT NULL,
    ambient_temp_degC          REAL    NOT NULL,
    fuel_valve_steps           INTEGER NOT NULL,
    fuel_flow_kg_per_hr        REAL    NOT NULL,
    vibration_mm_per_sec       REAL    NOT NULL,
    secu_processor_ok          INTEGER NOT NULL,
    built_in_test_pass         INTEGER NOT NULL,
    mil_1553b_status_word      TEXT    NOT NULL,
    cycle_status               TEXT    NOT NULL,
    fault_type                 TEXT    NOT NULL DEFAULT '',
    flight_hour_elapsed        REAL    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_trace_flight_ts  ON trace(flight_id, elapsed_time_sec);
  CREATE INDEX IF NOT EXISTS idx_trace_flight_cyc ON trace(flight_id, cycle_number);
  CREATE INDEX IF NOT EXISTS idx_cycles_flight    ON cycles(flight_id);
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
const rows = (r) => r.rows;
const first = (r) => r.rows[0] ?? null;

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', db: DB_PATH, db_exists: existsSync(DB_PATH) });
});

// ── List flights ──────────────────────────────────────────────────────────────
app.get('/api/flights', async (_req, res) => {
  try {
    const result = await db.execute('SELECT * FROM flights ORDER BY id');
    res.json(rows(result));
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// ── Single flight + cycles ────────────────────────────────────────────────────
app.get('/api/flights/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const flight = first(await db.execute({ sql: 'SELECT * FROM flights WHERE id = ?', args: [id] }));
    if (!flight) return res.status(404).json({ detail: `Flight ${id} not found` });
    const cycleResult = await db.execute({
      sql: 'SELECT * FROM cycles WHERE flight_id = ? ORDER BY cycle_number', args: [id],
    });
    res.json({ ...flight, cycles: rows(cycleResult) });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// ── Full trace ────────────────────────────────────────────────────────────────
app.get('/api/flights/:id/trace', async (req, res) => {
  try {
    const id    = Number(req.params.id);
    const cycle = req.query.cycle !== undefined ? Number(req.query.cycle) : null;
    const result = cycle !== null
      ? await db.execute({ sql: 'SELECT * FROM trace WHERE flight_id = ? AND cycle_number = ? ORDER BY elapsed_time_sec', args: [id, cycle] })
      : await db.execute({ sql: 'SELECT * FROM trace WHERE flight_id = ? ORDER BY elapsed_time_sec', args: [id] });
    if (!result.rows.length) return res.status(404).json({ detail: `No trace data for flight ${id}` });
    res.json(rows(result));
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// ── Cycle detail ──────────────────────────────────────────────────────────────
app.get('/api/flights/:id/cycles/:cycle_number', async (req, res) => {
  try {
    const id  = Number(req.params.id);
    const num = Number(req.params.cycle_number);
    const meta = first(await db.execute({ sql: 'SELECT * FROM cycles WHERE flight_id = ? AND cycle_number = ?', args: [id, num] }));
    if (!meta) return res.status(404).json({ detail: 'Cycle not found' });
    const traceResult = await db.execute({
      sql: 'SELECT * FROM trace WHERE flight_id = ? AND cycle_number = ? ORDER BY elapsed_time_sec', args: [id, num],
    });
    res.json({ ...meta, trace: rows(traceResult) });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// ── Create flight ─────────────────────────────────────────────────────────────
app.post('/api/flights', async (req, res) => {
  const payload = req.body;
  const cycles  = payload.cycles || [];
  try {
    const totalCycles    = cycles.length;
    const successCount   = cycles.filter(c => c.cycle_status === 'success').length;
    const faultyCount    = cycles.filter(c => ['faulty', 'aborted'].includes(c.cycle_status)).length;
    const successRatePct = totalCycles ? Math.round(successCount / totalCycles * 1000) / 10 : 0;
    const avgJpt1        = totalCycles
      ? Math.round(cycles.reduce((s, c) => s + c.peak_jet_pipe_temp_degC, 0) / totalCycles * 10) / 10 : 0;
    const totalFuelKg    = Math.round(cycles.reduce((s, c) => s + c.fuel_consumed_kg, 0) * 100) / 100;
    const allTrace       = cycles.flatMap(c => c.trace || []);
    const totalTraceSec  = allTrace.length
      ? Math.round(Math.max(...allTrace.map(r => r.elapsed_time_sec)) * 10) / 10 : 0;

    const idRow = first(await db.execute('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM flights'));
    const flightId = Number(idRow.next_id);

    // Build all insert statements as a batch transaction
    const stmts = [];

    stmts.push({
      sql: `INSERT INTO flights (id, flight_label, duration_hrs, total_start_cycles, date,
              success_rate_pct, faulty_cycle_count, avg_peak_jpt1_degC, total_fuel_kg, total_trace_duration_sec)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [flightId, payload.flight_label, payload.duration_hrs,
             totalCycles, payload.date, successRatePct, faultyCount,
             avgJpt1, totalFuelKg, totalTraceSec],
    });

    for (const c of cycles) {
      stmts.push({
        sql: `INSERT INTO cycles (flight_id, cycle_number, flight_hour_elapsed, cycle_status, fault_type,
                corrective_action, duration_sec, peak_jet_pipe_temp_degC,
                max_gas_gen_speed_pct, fuel_consumed_kg, cycle_start_sec, cycle_end_sec)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [flightId, c.cycle_number, c.flight_hour_elapsed, c.cycle_status,
               c.fault_type || '', c.corrective_action || '', c.duration_sec,
               c.peak_jet_pipe_temp_degC, c.max_gas_gen_speed_pct, c.fuel_consumed_kg,
               c.cycle_start_sec, c.cycle_end_sec],
      });
      for (const r of (c.trace || [])) {
        stmts.push({
          sql: `INSERT INTO trace (flight_id, cycle_number, elapsed_time_sec, start_phase,
                  jet_pipe_temp_degC, gas_gen_speed_rpm, gas_gen_speed_pct,
                  compressor_pressure_ratio, ambient_temp_degC, fuel_valve_steps,
                  fuel_flow_kg_per_hr, vibration_mm_per_sec, secu_processor_ok,
                  built_in_test_pass, mil_1553b_status_word, cycle_status,
                  fault_type, flight_hour_elapsed)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [flightId, c.cycle_number, r.elapsed_time_sec, r.start_phase,
                 r.jet_pipe_temp_degC, r.gas_gen_speed_rpm, r.gas_gen_speed_pct,
                 r.compressor_pressure_ratio, r.ambient_temp_degC, r.fuel_valve_steps,
                 r.fuel_flow_kg_per_hr, r.vibration_mm_per_sec, r.secu_processor_ok,
                 r.built_in_test_pass, r.mil_1553b_status_word, r.cycle_status,
                 r.fault_type || '', r.flight_hour_elapsed],
        });
      }
    }

    await db.batch(stmts, 'write');

    // Write CSV
    const csvLines = [CSV_TRACE_FIELDS.join(',')];
    for (const c of cycles) {
      for (const r of (c.trace || [])) {
        csvLines.push(CSV_TRACE_FIELDS.map(f => {
          if (f === 'flight_id')    return flightId;
          if (f === 'cycle_number') return c.cycle_number;
          return csvEscape(r[f] ?? '');
        }).join(','));
      }
    }
    writeFileSync(join(CSV_DIR, `flight_${String(flightId).padStart(3, '0')}.csv`), csvLines.join('\n'));

    const created = first(await db.execute({ sql: 'SELECT * FROM flights WHERE id = ?', args: [flightId] }));
    res.status(201).json(created);
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// ── Delete flight ─────────────────────────────────────────────────────────────
app.delete('/api/flights/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const flight = first(await db.execute({ sql: 'SELECT id FROM flights WHERE id = ?', args: [id] }));
    if (!flight) return res.status(404).json({ detail: `Flight ${id} not found` });
    await db.batch([
      { sql: 'DELETE FROM trace   WHERE flight_id = ?', args: [id] },
      { sql: 'DELETE FROM cycles  WHERE flight_id = ?', args: [id] },
      { sql: 'DELETE FROM flights WHERE id = ?',        args: [id] },
    ], 'write');
    const csv = join(CSV_DIR, `flight_${String(id).padStart(3, '0')}.csv`);
    if (existsSync(csv)) unlinkSync(csv);
    res.sendStatus(204);
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// ── Serve built frontend (production) ─────────────────────────────────────────
// In dev, Vite handles all non-API requests on its own port.
// In production (npm start after npm run build), Express serves the React SPA.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(join(DIST_DIR, 'index.html')));
}

app.listen(PORT, () => console.log(`GTSU-110 server on port ${PORT}`));
