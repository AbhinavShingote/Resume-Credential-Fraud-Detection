import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * `server.host: true` → required so the dev server is reachable from outside
 *                        the Docker container (same reason we pass --host 0.0.0.0).
 *
 * `server.proxy` → forwards any request from the browser starting with "/api"
 *                  to the backend container. The React app just calls /api/...
 *                  and Vite transparently proxies it to http://backend:8000.
 *                  This also sidesteps CORS during development.
 */
export default defineConfig({
  plugins: [react()],

  server: {
    host: true,       // listen on 0.0.0.0 inside Docker
    port: 5173,
    strictPort: true, // fail if 5173 is taken instead of silently using another port
    watch: {
      usePolling: true, // required for file-change detection inside Docker on Mac/Windows
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',   // the backend service name in docker-compose
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 5173,
    host: true,
  },
});