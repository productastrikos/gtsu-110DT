"""
GTSU-110 Flight Data API  |  backend/main.py
=============================================================
FastAPI + SQLite backend. Serves flight telemetry from data/flights.db
and accepts new flights POSTed from the React frontend.

Run:
    pip install fastapi uvicorn
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import sqlite3, csv, io
from pathlib import Path
from typing import Optional, List, Any, Dict
from pydantic import BaseModel

# ── App setup ────────────────────────────────────────────────────────────────
app = FastAPI(title='GTSU-110 Flight Data API', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET', 'POST', 'DELETE'],
    allow_headers=['*'],
)

DB_PATH  = Path(__file__).parent.parent / 'data' / 'flights.db'
CSV_DIR  = Path(__file__).parent.parent / 'data' / 'csvs'
DIST_DIR = Path(__file__).parent.parent / 'dist'

CSV_TRACE_FIELDS = [
    'flight_id', 'cycle_number', 'elapsed_time_sec', 'start_phase',
    'jet_pipe_temp_degC', 'gas_gen_speed_rpm', 'gas_gen_speed_pct',
    'compressor_pressure_ratio', 'ambient_temp_degC', 'fuel_valve_steps',
    'fuel_flow_kg_per_hr', 'vibration_mm_per_sec', 'secu_processor_ok',
    'built_in_test_pass', 'mil_1553b_status_word', 'cycle_status',
    'fault_type', 'flight_hour_elapsed',
]


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_db() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=f'Database not found at {DB_PATH}. Run: python generate_flight_csv.py',
        )
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def ensure_db() -> sqlite3.Connection:
    """Open the DB, creating it with the schema if it does not exist yet."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    needs_schema = not DB_PATH.exists()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    if needs_schema:
        _create_schema(con)
    return con


def _create_schema(con: sqlite3.Connection) -> None:
    con.executescript("""
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
    """)
    con.commit()


# ── Pydantic models for POST /api/flights ────────────────────────────────────
class TraceRowIn(BaseModel):
    elapsed_time_sec:          float
    start_phase:               str
    jet_pipe_temp_degC:        float
    gas_gen_speed_rpm:         int
    gas_gen_speed_pct:         float
    compressor_pressure_ratio: float
    ambient_temp_degC:         float
    fuel_valve_steps:          int
    fuel_flow_kg_per_hr:       float
    vibration_mm_per_sec:      float
    secu_processor_ok:         int
    built_in_test_pass:        int
    mil_1553b_status_word:     str
    cycle_status:              str
    fault_type:                str = ''
    flight_hour_elapsed:       float


class CycleIn(BaseModel):
    cycle_number:             int
    flight_hour_elapsed:      float
    cycle_status:             str
    fault_type:               str = ''
    corrective_action:        str = ''
    duration_sec:             float
    peak_jet_pipe_temp_degC:  float
    max_gas_gen_speed_pct:    float
    fuel_consumed_kg:         float
    cycle_start_sec:          float
    cycle_end_sec:            float
    trace:                    List[TraceRowIn]


class FlightIn(BaseModel):
    flight_label:  str
    duration_hrs:  float
    date:          str
    cycles:        List[CycleIn]


# ── Health ───────────────────────────────────────────────────────────────────
@app.get('/api/health')
def health():
    return {'status': 'ok', 'db': str(DB_PATH), 'db_exists': DB_PATH.exists()}


# ── List flights ──────────────────────────────────────────────────────────────
@app.get('/api/flights')
def list_flights():
    """Return all flight metadata (no trace)."""
    with get_db() as con:
        rows = con.execute('SELECT * FROM flights ORDER BY id').fetchall()
    return [dict(r) for r in rows]


# ── Single flight + cycle list ────────────────────────────────────────────────
@app.get('/api/flights/{flight_id}')
def get_flight(flight_id: int):
    """Return flight metadata + all cycle summaries (no trace)."""
    with get_db() as con:
        f = con.execute('SELECT * FROM flights WHERE id = ?', (flight_id,)).fetchone()
        if not f:
            raise HTTPException(404, f'Flight {flight_id} not found')
        cycles = con.execute(
            'SELECT * FROM cycles WHERE flight_id = ? ORDER BY cycle_number',
            (flight_id,)
        ).fetchall()
    return {**dict(f), 'cycles': [dict(c) for c in cycles]}


# ── Full trace for a flight ───────────────────────────────────────────────────
@app.get('/api/flights/{flight_id}/trace')
def get_trace(
    flight_id: int,
    cycle: Optional[int] = Query(default=None, description='Filter to a single cycle number'),
):
    """
    Returns 1-Hz trace rows for a flight.
    Pass ?cycle=N to get only that cycle's rows.
    """
    with get_db() as con:
        if cycle is not None:
            rows = con.execute(
                'SELECT * FROM trace WHERE flight_id = ? AND cycle_number = ? ORDER BY elapsed_time_sec',
                (flight_id, cycle),
            ).fetchall()
        else:
            rows = con.execute(
                'SELECT * FROM trace WHERE flight_id = ? ORDER BY elapsed_time_sec',
                (flight_id,),
            ).fetchall()
    if not rows:
        raise HTTPException(404, f'No trace data found for flight {flight_id}')
    return [dict(r) for r in rows]


# ── Cycle detail (meta + trace) ───────────────────────────────────────────────
@app.get('/api/flights/{flight_id}/cycles/{cycle_number}')
def get_cycle(flight_id: int, cycle_number: int):
    """Return cycle metadata + its 1-Hz trace."""
    with get_db() as con:
        meta = con.execute(
            'SELECT * FROM cycles WHERE flight_id = ? AND cycle_number = ?',
            (flight_id, cycle_number),
        ).fetchone()
        if not meta:
            raise HTTPException(404, 'Cycle not found')
        trace = con.execute(
            'SELECT * FROM trace WHERE flight_id = ? AND cycle_number = ? ORDER BY elapsed_time_sec',
            (flight_id, cycle_number),
        ).fetchall()
    return {**dict(meta), 'trace': [dict(r) for r in trace]}


# ── Save a new flight ─────────────────────────────────────────────────────────
@app.post('/api/flights', status_code=201)
def create_flight(payload: FlightIn):
    """
    Store a new flight (generated by the frontend simulator or an external source).
    Persists to SQLite and writes a CSV trace file in data/csvs/.
    Returns the created flight metadata.
    """
    con = ensure_db()
    try:
        # Compute aggregates from the submitted cycles
        total_cycles     = len(payload.cycles)
        success_count    = sum(1 for c in payload.cycles if c.cycle_status == 'success')
        faulty_count     = sum(1 for c in payload.cycles if c.cycle_status in ('faulty', 'aborted'))
        success_rate_pct = round(success_count / total_cycles * 100, 1) if total_cycles else 0.0
        avg_jpt1         = round(
            sum(c.peak_jet_pipe_temp_degC for c in payload.cycles) / total_cycles, 1
        ) if total_cycles else 0.0
        total_fuel_kg    = round(sum(c.fuel_consumed_kg for c in payload.cycles), 2)
        all_trace        = [row for c in payload.cycles for row in c.trace]
        total_trace_sec  = round(max((r.elapsed_time_sec for r in all_trace), default=0.0), 1)

        # Assign next available flight_id
        row = con.execute('SELECT COALESCE(MAX(id), 0) + 1 FROM flights').fetchone()
        flight_id = row[0]

        con.execute(
            '''INSERT INTO flights
               (id, flight_label, duration_hrs, total_start_cycles, date,
                success_rate_pct, faulty_cycle_count, avg_peak_jpt1_degC,
                total_fuel_kg, total_trace_duration_sec)
               VALUES (?,?,?,?,?,?,?,?,?,?)''',
            (flight_id, payload.flight_label, payload.duration_hrs,
             total_cycles, payload.date, success_rate_pct, faulty_count,
             avg_jpt1, total_fuel_kg, total_trace_sec),
        )

        # Insert cycles
        con.executemany(
            '''INSERT INTO cycles
               (flight_id, cycle_number, flight_hour_elapsed, cycle_status, fault_type,
                corrective_action, duration_sec, peak_jet_pipe_temp_degC,
                max_gas_gen_speed_pct, fuel_consumed_kg, cycle_start_sec, cycle_end_sec)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
            [(flight_id, c.cycle_number, c.flight_hour_elapsed, c.cycle_status,
              c.fault_type, c.corrective_action, c.duration_sec,
              c.peak_jet_pipe_temp_degC, c.max_gas_gen_speed_pct,
              c.fuel_consumed_kg, c.cycle_start_sec, c.cycle_end_sec)
             for c in payload.cycles],
        )

        # Insert trace rows
        trace_rows = []
        for c in payload.cycles:
            for r in c.trace:
                trace_rows.append((
                    flight_id, c.cycle_number, r.elapsed_time_sec, r.start_phase,
                    r.jet_pipe_temp_degC, r.gas_gen_speed_rpm, r.gas_gen_speed_pct,
                    r.compressor_pressure_ratio, r.ambient_temp_degC, r.fuel_valve_steps,
                    r.fuel_flow_kg_per_hr, r.vibration_mm_per_sec, r.secu_processor_ok,
                    r.built_in_test_pass, r.mil_1553b_status_word, r.cycle_status,
                    r.fault_type, r.flight_hour_elapsed,
                ))
        con.executemany(
            '''INSERT INTO trace
               (flight_id, cycle_number, elapsed_time_sec, start_phase,
                jet_pipe_temp_degC, gas_gen_speed_rpm, gas_gen_speed_pct,
                compressor_pressure_ratio, ambient_temp_degC, fuel_valve_steps,
                fuel_flow_kg_per_hr, vibration_mm_per_sec, secu_processor_ok,
                built_in_test_pass, mil_1553b_status_word, cycle_status,
                fault_type, flight_hour_elapsed)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            trace_rows,
        )

        con.commit()

        # Write CSV trace file
        csv_path = CSV_DIR / f'flight_{flight_id:03d}.csv'
        with open(csv_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_TRACE_FIELDS)
            writer.writeheader()
            for c in payload.cycles:
                for r in c.trace:
                    writer.writerow({
                        'flight_id':                 flight_id,
                        'cycle_number':              c.cycle_number,
                        'elapsed_time_sec':          r.elapsed_time_sec,
                        'start_phase':               r.start_phase,
                        'jet_pipe_temp_degC':        r.jet_pipe_temp_degC,
                        'gas_gen_speed_rpm':         r.gas_gen_speed_rpm,
                        'gas_gen_speed_pct':         r.gas_gen_speed_pct,
                        'compressor_pressure_ratio': r.compressor_pressure_ratio,
                        'ambient_temp_degC':         r.ambient_temp_degC,
                        'fuel_valve_steps':          r.fuel_valve_steps,
                        'fuel_flow_kg_per_hr':       r.fuel_flow_kg_per_hr,
                        'vibration_mm_per_sec':      r.vibration_mm_per_sec,
                        'secu_processor_ok':         r.secu_processor_ok,
                        'built_in_test_pass':        r.built_in_test_pass,
                        'mil_1553b_status_word':     r.mil_1553b_status_word,
                        'cycle_status':              r.cycle_status,
                        'fault_type':                r.fault_type,
                        'flight_hour_elapsed':       r.flight_hour_elapsed,
                    })

        result = dict(con.execute('SELECT * FROM flights WHERE id = ?', (flight_id,)).fetchone())
        return result

    finally:
        con.close()


# ── Delete a flight ───────────────────────────────────────────────────────────
@app.delete('/api/flights/{flight_id}', status_code=204)
def delete_flight(flight_id: int):
    """Remove a flight and its trace data from the database and CSV store."""
    con = ensure_db()
    try:
        f = con.execute('SELECT id FROM flights WHERE id = ?', (flight_id,)).fetchone()
        if not f:
            raise HTTPException(404, f'Flight {flight_id} not found')
        con.execute('DELETE FROM trace  WHERE flight_id = ?', (flight_id,))
        con.execute('DELETE FROM cycles WHERE flight_id = ?', (flight_id,))
        con.execute('DELETE FROM flights WHERE id = ?', (flight_id,))
        con.commit()
        csv_path = CSV_DIR / f'flight_{flight_id:03d}.csv'
        if csv_path.exists():
            csv_path.unlink()
    finally:
        con.close()


# ── SPA catch-all (production) ────────────────────────────────────────────────
# Must be declared last so API routes take precedence.
# In dev, Vite handles all non-/api paths; this route is never hit.
# In prod (after `npm run build`), FastAPI serves the built React app here.
@app.get('/{full_path:path}')
async def serve_spa(full_path: str):
    if not DIST_DIR.exists():
        raise HTTPException(
            status_code=404,
            detail='Frontend not built. Run: npm run build',
        )
    candidate = DIST_DIR / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(DIST_DIR / 'index.html')
