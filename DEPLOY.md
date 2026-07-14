# GTSU-110 — server deployment

Two PM2 processes + one nginx server block, same shape as your other apps.

| Piece | Process | Port | nginx | Cloudflare |
| --- | --- | --- | --- | --- |
| Frontend (static SPA `dist/`) | `pm2 serve ./dist` | **3213** | `gtsu.astrikos.xyz` → `location /` | Orange (proxied) |
| Backend REST API (`/api/*`) | `server.js` | **3013** | `gtsu.astrikos.xyz` → `location /api/` | (same subdomain) |

Unlike the GPUaaS app there is **no socket subdomain** — GTSU-110 has no
WebSockets. The frontend talks to the backend over plain REST at a **relative
`/api` path** (see `src/services/api.ts`), so both live on **one subdomain** and
nginx splits the traffic: `/api/*` → backend `:3013`, everything else →
frontend `:3213`.

> The `/api` base URL is relative and same-origin, so there is **nothing to bake
> into the build** — no `.env.production` to edit. If you ever move the API to
> its own subdomain, that relative path is the thing you'd change.

---

## 1. Build (do this before pushing, or on the server)

```bash
npm install              # installs BOTH the frontend build deps and the
                         # backend runtime deps (express, @libsql/client)
npm run build            # → dist/  (static SPA, incl. index.html)
```

The backend needs no separate install step — its dependencies are in the root
`package.json`. Push the repo (with `dist/` built) to the server, or run the
build there. The SQLite DB (`data/flights.db`) and seed CSVs (`data/csvs/`) are
committed, so the API has data on first boot; if the DB is empty, `server.js`
auto-seeds it from the CSVs.

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

Quick check: `curl -k https://gtsu.astrikos.xyz/api/health` →
`{"status":"ok","db":"…/flights.db","db_exists":true}`.

## 3. Cloudflare DNS

- `gtsu.astrikos.xyz` → **Orange cloud** (proxied), like astriverse/dso/gpuaas.
  No gray-cloud subdomain needed (no WebSockets).

---

## nginx — single app subdomain (frontend + API split)

Add this alongside your other `listen 8443 ssl` blocks. The **order matters**:
`location /api/` must come before `location /`, and its `proxy_pass` has **no
trailing slash** so the `/api` prefix is preserved (the Express routes are
`/api/flights`, `/api/health`, …).

```nginx
server {
        listen 8443 ssl;
        ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
        ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
        server_name gtsu.astrikos.xyz;

        # API → backend (server.js) on 3013 — keep the /api prefix
        location /api/ {
                add_header 'Access-Control-Allow-Origin' '*' always;
                proxy_pass http://127.0.0.1:3013;
                proxy_set_header Host $host;
        }

        # Frontend → static SPA on 3213
        location / {
                add_header 'Access-Control-Allow-Origin' '*' always;
                proxy_pass http://127.0.0.1:3213;
        }
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

---

## Verify

1. `curl -k https://gtsu.astrikos.xyz/api/health` → `{"status":"ok",…}` (backend reachable).
2. Open `https://gtsu.astrikos.xyz` in a browser → log in with `admin` / `admin123`.
3. Go to **Post-Flight Analysis** → the flight list loads from the API
   (`/api/flights`). If it's empty or errors, the browser console/network tab
   shows the `/api/...` request — confirm it 200s and that `location /api/` is
   pointing at `:3013`.
4. Deep-link a client route (e.g. `https://gtsu.astrikos.xyz/simulator`) and
   refresh — it should still load (SPA fallback via `--spa`), not 404.

> The Python `backend/main.py` (FastAPI) is **not** used in this deployment —
> `server.js` is the API server. You do **not** need Python or `pip` on the box.

---

## Updating a live deploy

```bash
git pull origin main
npm install
npm run build
pm2 reload ecosystem.config.cjs   # or: pm2 reload gtsu_frontend_3213 gtsu_backend_3013
```
