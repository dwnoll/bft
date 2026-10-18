import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, Express runs on :3000 (tsx) and Vite on :5173. Requests to
// /api/* are proxied to the Express API, so the browser talks to a single
// origin and avoids CORS (PRD §1).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // `public/` (incl. public/sound/Warnung.mp3) is copied verbatim into
  // dist/client, so the audio is served at /sound/Warnung.mp3 (PRD §9).
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
