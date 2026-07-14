# GTSU-110 — local server deployment

Two PM2 processes behind one local nginx block. Plain HTTP — no domain, no TLS,
no Cloudflare. (The public office-server deploy at `gtsu-110.astrikos.org` —
SSL + real `server_name` — comes later; this doc is the LAN/local box only.)

| Piece | Process | Port | nginx |
| --- | --- | --- | --- |
| Frontend (static SPA `dist/`) | `pm2 serve ./dist` | **3213** | `location /` |
| Backend REST API (`/api/*`) | `server.js` | **3013** | `location /api/` |

The frontend talks to the backend over plain REST at a **relative `/api` path**
(see `src/services/api.ts`), so both sit behind **one nginx server** and nginx
splits the traffic: `/api/*` → backend `:3013`, everything else → frontend
`:3213`. The flight data (the real backend feature) always uses that relative
`/api`, so it resolves to whatever host you open the page on and flows through
nginx — nothing host-specific is baked into the build.

Prereq on the box: **Node 20** (`.nvmrc`), **PM2** (`npm i -g pm2`), and
**nginx**. No Python needed.

---

## 1. Build

```bash
npm install              # installs BOTH the frontend build deps and the
                         # backend runtime deps (express, @libsql/client)
npm run build            # → dist/  (static SPA, incl. index.html)
```

The backend needs no separate install — its deps are in the root `package.json`.
The SQLite DB (`data/flights.db`) and seed CSVs (`data/csvs/`) are committed, so
the API has data on first boot; if the DB is empty, `server.js` auto-seeds from
the CSVs.

## 2. Start the PM2 processes

**One command** (recommended) — uses `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Or the explicit two-command form (same result):

```bash
# Frontend — static SPA on 3213 (--spa = index.html fallback for React Router)
pm2 serve ./dist 3213 --name "gtsu_frontend_3213" --spa

# Backend API on 3013
PORT=3013 pm2 start server.js --name "gtsu_backend_3013"

pm2 save
```

Optional — survive reboots: run `pm2 startup` once and follow the printed
command, then `pm2 save`.

Quick check (before nginx): `curl http://127.0.0.1:3013/api/health` →
`{"status":"ok","db":"…/flights.db","db_exists":true}`, and
`curl -I http://127.0.0.1:3213` → `200 OK`.

---

## 3. nginx — local block (frontend + API split)

Drop this in `/etc/nginx/sites-available/gtsu-110` (then symlink into
`sites-enabled/`), or as a `server {}` inside `/etc/nginx/conf.d/gtsu-110.conf`.
The **order matters**: `location /api/` comes before `location /`, and its
`proxy_pass` has **no trailing slash** so the `/api` prefix is preserved (the
Express routes are `/api/flights`, `/api/health`, …).

```nginx
server {
        listen 80;
        server_name _;          # catch-all: works via localhost or the box's LAN IP

        # API → backend (server.js) on 3013 — keep the /api prefix
        location /api/ {
                proxy_pass http://127.0.0.1:3013;
                proxy_set_header Host $host;
        }

        # Frontend → static SPA on 3213
        location / {
                proxy_pass http://127.0.0.1:3213;
                proxy_set_header Host $host;
        }
}
```

> If nginx already has a `default_server` on port 80, either replace that block
> or give this one a real `server_name` (e.g. the machine's hostname) so it
> doesn't collide.

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. Verify

1. `curl http://localhost/api/health` → `{"status":"ok",…}` (nginx → backend).
2. Open `http://localhost/` (or `http://<box-LAN-IP>/`) in a browser → log in
   with `admin` / `admin123`.
3. Go to **Post-Flight Analysis** → the flight list loads from `/api/flights`.
   If it's empty or errors, check the browser Network tab: the `/api/...`
   request should 200; if it 404s, `location /api/` isn't pointing at `:3013`.
4. Deep-link a client route (e.g. `http://localhost/simulator`) and refresh — it
   should still load (SPA fallback via `--spa`), not 404.

> The Python `backend/main.py` (FastAPI) is **not** used here — `server.js` is
> the API server.

---

## Updating the deploy

```bash
git pull origin main
npm install
npm run build
pm2 reload ecosystem.config.cjs   # or: pm2 reload gtsu_frontend_3213 gtsu_backend_3013
```
