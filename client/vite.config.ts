import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The dev server forwards API, upload and WebSocket traffic to the backend,
// so the browser only ever talks to one origin - exactly as it does behind
// nginx in production. No CORS, and the refresh cookie stays first-party.
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // File events do not cross the Docker bind mount on Windows and macOS.
    watch: process.env.VITE_USE_POLLING ? { usePolling: true } : undefined,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/uploads': { target, changeOrigin: true },
      '/ws': { target, changeOrigin: true, ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
