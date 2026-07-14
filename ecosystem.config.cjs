// PM2 process definitions for GTSU-110 — start both with one command:
//
//   pm2 start ecosystem.config.cjs && pm2 save
//
// Uses PM2's built-in static server for the frontend (no extra `serve`
// dependency). `.cjs` because package.json is `"type": "module"`.
module.exports = {
  apps: [
    {
      // Frontend — static SPA (dist/) served by PM2's built-in server on 3213.
      name: 'gtsu_frontend_3213',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: 3213,
        PM2_SERVE_SPA: 'true',          // fall back to index.html for client-side routes
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
    {
      // Backend — Express + SQLite REST API (/api/*) on 3013.
      name: 'gtsu_backend_3013',
      script: './server.js',
      env: {
        PORT: 3013,
      },
    },
  ],
};
