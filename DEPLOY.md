# GTSU-110 — Deployment (astrikos.xyz)

Follows `deployment_context.md`. One frontend port, one backend port; the backend
port serves REST **and** websocket upgrades through a single nginx block.

> **Port note.** The convention (§1) reserves `33XX` for frontends and `43XX` for
> backends. This POC deploys on **3213 / 3013** by explicit instruction, which sits
> outside both bands and inverts the usual ordering (the lower number is the
> backend). Read the tier from this table, not from the port prefix.

## Processes

| Tier | Port | Subdomain | pm2 name | Process |
| --- | --- | --- | --- | --- |
| Frontend | 3213 | `gtsu110.astrikos.xyz` | `gtsu110_3213` | pm2 static server → `dist/` |
| Backend | 3013 | `gtsu110-api.astrikos.xyz` | `gtsu110_be_3013` | `server.js` (Express + libSQL) |

Single backend process — `server.js` — reading `process.env.PORT`. `backend/main.py`
is a legacy FastAPI duplicate of the same routes and is **not deployed**.

## Environment

`.env.production` (committed, baked into the bundle at build time):

```
VITE_API_URL=https://gtsu110-api.astrikos.xyz:8443
VITE_SOCKET_URL=https://gtsu110-api.astrikos.xyz:8443
```

## Build & start

```bash
cd <repo>
npm install
npm run build                                    # → dist/

# Both processes at once (ecosystem.config.cjs pins ports + pm2 names):
pm2 start ecosystem.config.cjs
pm2 save
```

Equivalent explicit form:

```bash
pm2 start serve --name "gtsu110_3213" -- ./dist -s -p 3213
PORT=3013 pm2 start ./server.js --name "gtsu110_be_3013"
pm2 save
```

## nginx

Append to `/etc/nginx/conf/astrikos.conf` — frontend:

```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name gtsu110.astrikos.xyz;
    location / {
        add_header 'Access-Control-Allow-Origin' '*' always;
        proxy_pass http://127.0.0.1:3213;
    }
}
```

Append to `/etc/nginx/conf/astriverse.conf` — backend (REST + WS, one block).
Requires `map $http_upgrade $connection_upgrade { … }` once at the top of the file:

```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name gtsu110-api.astrikos.xyz;
    location / {
        proxy_pass http://127.0.0.1:3013;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
    }
}
```

Apply:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Cloudflare DNS

- `gtsu110.astrikos.xyz` → **Orange** (proxied)
- `gtsu110-api.astrikos.xyz` → **Gray** (DNS-only)

## Verify

```bash
curl -k https://gtsu110.astrikos.xyz:8443            # SPA HTML
curl -k https://gtsu110-api.astrikos.xyz:8443/api/health   # {"status":"ok",…}
curl -k https://gtsu110-api.astrikos.xyz:8443/api/flights   # flight list JSON
```

## Data

`server.js` reads/writes `data/flights.db` and `data/csvs/` relative to the repo
root. Both must be present and writable by the pm2 user on the server.
