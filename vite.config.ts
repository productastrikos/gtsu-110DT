import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        // Dev only: /api/* → the local Express backend (server.js). In production
        // the frontend calls VITE_API_URL directly, so this proxy is unused.
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3013',
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
