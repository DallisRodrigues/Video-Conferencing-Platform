import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 8100)
// Set E2E_BASE_URL to test an already-running app (e.g. the Vite dev server) instead.
const EXTERNAL = process.env.E2E_BASE_URL

// Runs the production build against the real backend and an in-memory MongoDB. Media comes from
// Chromium's synthetic devices, so this proves the signaling/WebRTC plumbing, not real hardware.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: EXTERNAL || `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--auto-select-desktop-capture-source=Entire screen',
            // Expose plain host candidates so two local contexts can connect.
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
        command: 'npm run build && node ../backend/scripts/memory-server.js',
        url: `http://127.0.0.1:${PORT}/health`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: { PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'production', TRUST_PROXY: '' },
      },
})
