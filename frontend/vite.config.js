import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.VITE_DEV_BACKEND || 'http://localhost:8000'

// Replace Vite's per-request stack traces with one throttled, actionable line.
let lastWarning = 0
const quietErrors = (proxy) => {
  const onError = (err, _req, res) => {
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Backend is not running.' }))
    } else {
      res?.destroy?.()
    }
    if (Date.now() - lastWarning < 10_000) return
    lastWarning = Date.now()
    const reason = err.code || err.errors?.[0]?.code || err.message
    console.warn(`[proxy] Backend not reachable at ${backend} (${reason}). Start it with "npm run dev" in backend/.`)
  }
  proxy.on('error', onError)
  // Vite attaches its own verbose error logger after this hook runs; drop it.
  setImmediate(() => {
    for (const listener of proxy.listeners('error')) if (listener !== onError) proxy.off('error', listener)
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin API and Socket.IO in development, like the single-service production deploy.
    proxy: {
      '/api': { target: backend, configure: quietErrors },
      '/health': { target: backend, configure: quietErrors },
      '/socket.io': { target: backend, ws: true, configure: quietErrors },
    },
  },
})
