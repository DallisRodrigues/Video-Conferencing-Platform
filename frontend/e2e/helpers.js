import { expect } from '@playwright/test'

/**
 * Records every MediaStreamTrack the page obtains from getUserMedia /
 * getDisplayMedia so tests can assert that leaving really stops them.
 */
export async function trackMedia(page) {
  await page.addInitScript(() => {
    window.__tracks = []
    const md = navigator.mediaDevices
    for (const fn of ['getUserMedia', 'getDisplayMedia']) {
      const original = md[fn]?.bind(md)
      if (!original) continue
      md[fn] = async (...args) => {
        const stream = await original(...args)
        window.__tracks.push(...stream.getTracks())
        return stream
      }
    }
  })
}

export const liveTrackCount = (page) => page.evaluate(() => window.__tracks.filter((t) => t.readyState === 'live').length)

/** Collects uncaught page errors and console errors for later assertions. */
export function watchErrors(page) {
  const errors = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  return errors
}

export async function newParticipant(browser, { trackTracks = true } = {}) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = watchErrors(page)
  if (trackTracks) await trackMedia(page)
  return { context, page, errors }
}

/** Opens the lobby for `code`, enters `name` and joins. */
export async function joinMeeting(page, code, name) {
  await page.goto(`/${code}`)
  await expect(page.getByRole('button', { name: 'Join meeting' })).toBeEnabled()
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join meeting' }).click()
  await expect(page.getByTestId('connection-status')).toBeVisible()
}

/** True once a remote <video> is actually decoding frames. */
export async function expectRemoteVideoPlaying(page, name) {
  const tile = page.locator(`[data-testid="tile-remote"][data-participant="${name}"]`)
  await expect(tile).toBeVisible()
  await expect
    .poll(
      () =>
        tile.locator('video').evaluate(async (v) => {
          const t0 = v.currentTime
          await new Promise((r) => setTimeout(r, 300))
          return v.videoWidth > 0 && v.currentTime > t0 && v.srcObject?.getVideoTracks().length === 1
        }),
      { timeout: 20_000 }
    )
    .toBe(true)
}

export const uniqueCode = (prefix = 'e2e') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
