import fs from 'node:fs'
import path from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { expectRemoteVideoPlaying, joinMeeting, liveTrackCount, newParticipant, uniqueCode } from './helpers'

const remoteTile = (page, name) => page.locator(`[data-testid="tile-remote"][data-participant="${name}"]`)

test.describe('two-person meeting (synthetic media)', () => {
  let alice
  let bob
  let code

  test.beforeEach(async ({ browser }) => {
    code = uniqueCode()
    alice = await newParticipant(browser)
    bob = await newParticipant(browser)
  })

  test.afterEach(async () => {
    await alice.context.close()
    await bob.context.close()
  })

  test('both peers exchange live video and audio over WebRTC', async () => {
    await joinMeeting(alice.page, code, 'Alice')
    await expect(alice.page.getByTestId('invite-card')).toBeVisible()
    await joinMeeting(bob.page, code, 'Bob')

    await expectRemoteVideoPlaying(alice.page, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')
    await expect(alice.page.getByTestId('participant-count')).toHaveText('2 / 6')
    await expect(alice.page.getByTestId('invite-card')).toHaveCount(0)

    // Each remote stream carries one audio track, and Chromium's fake
    // microphone beep makes the remote tile register as speaking.
    const audioTracks = await remoteTile(alice.page, 'Bob')
      .locator('video')
      .evaluate((v) => v.srcObject.getAudioTracks().length)
    expect(audioTracks).toBe(1)
    await expect(remoteTile(alice.page, 'Bob')).toHaveClass(/is-speaking/, { timeout: 20_000 })

    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })

  test('chat messages reach the other participant', async () => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')

    await alice.page.getByTestId('toggle-chat').click()
    await alice.page.getByLabel('Send a message').fill('Hello <b>Bob</b>')
    await alice.page.keyboard.press('Enter')
    await expect(alice.page.getByTestId('chat-list')).toContainText('Hello <b>Bob</b>')

    // Bob sees an unread badge, then the message rendered as plain text.
    await expect(bob.page.getByTestId('toggle-chat')).toContainText('1')
    await bob.page.getByTestId('toggle-chat').click()
    await expect(bob.page.getByTestId('chat-list')).toContainText('Hello <b>Bob</b>')
    await expect(bob.page.locator('.chat-text b')).toHaveCount(0)

    await bob.page.getByLabel('Send a message').fill('Hi Alice')
    await bob.page.getByRole('button', { name: 'Send message' }).click()
    await expect(alice.page.getByTestId('chat-list')).toContainText('Hi Alice')
  })

  test('mute and camera toggles reflect real state on both sides', async () => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')

    await alice.page.getByTestId('toggle-mic').click()
    await expect(alice.page.getByTestId('toggle-mic')).toHaveAttribute('aria-pressed', 'true')
    await expect(remoteTile(bob.page, 'Alice')).toHaveAttribute('aria-label', /muted/)

    await alice.page.getByTestId('toggle-camera').click()
    await expect(alice.page.getByTestId('toggle-camera')).toHaveAttribute('aria-pressed', 'true')
    // The camera track is stopped (not merely disabled), and Bob sees an avatar.
    await expect.poll(() => alice.page.evaluate(() => window.__tracks.filter((t) => t.kind === 'video' && t.readyState === 'live').length)).toBe(0)
    await expect(remoteTile(bob.page, 'Alice').locator('.tile-placeholder')).toBeVisible()

    await alice.page.getByTestId('toggle-camera').click()
    await expect(remoteTile(bob.page, 'Alice').locator('.tile-placeholder')).toHaveCount(0)
    await expectRemoteVideoPlaying(bob.page, 'Alice')

    await bob.page.getByTestId('toggle-people').click()
    await expect(bob.page.getByTestId('people-list')).toContainText('Alice')
    await expect(bob.page.getByTestId('people-list').getByLabel('Muted')).toHaveCount(1)
  })

  test('leaving stops all local media and updates the other side', async () => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')
    await expectRemoteVideoPlaying(alice.page, 'Bob')
    expect(await liveTrackCount(bob.page)).toBeGreaterThan(0)

    await bob.page.getByTestId('leave').click()
    await expect(bob.page.getByTestId('end-screen')).toContainText('You left the meeting')
    expect(await liveTrackCount(bob.page)).toBe(0)

    await expect(remoteTile(alice.page, 'Bob')).toHaveCount(0)
    await expect(alice.page.getByTestId('participant-count')).toHaveText('1 / 6')
    await expect(alice.page.getByTestId('invite-card')).toBeVisible()

    await bob.page.getByRole('button', { name: 'Rejoin' }).click()
    await bob.page.getByRole('button', { name: 'Join meeting' }).click()
    await expectRemoteVideoPlaying(alice.page, 'Bob')
  })

  test('a refreshed participant can rejoin without duplicate tiles', async () => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')
    await expectRemoteVideoPlaying(alice.page, 'Bob')

    await bob.page.reload()
    await expect(remoteTile(alice.page, 'Bob')).toHaveCount(0)
    await expect(bob.page.getByLabel('Your name')).toHaveValue('Bob')
    await bob.page.getByRole('button', { name: 'Join meeting' }).click()

    await expectRemoteVideoPlaying(alice.page, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')
    await expect(remoteTile(alice.page, 'Bob')).toHaveCount(1)
  })

  test('screen sharing fills the spotlight for viewers and late joiners', async ({ browser }) => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')

    const share = alice.page.getByTestId('toggle-screen')
    await share.click()
    await expect(share).toHaveAttribute('aria-pressed', 'true')
    await expect(alice.page.getByText("You're presenting to everyone")).toBeVisible()

    // The presenter's tile takes most of the stage for everyone else.
    const spotlight = bob.page.locator('.stage-main [data-participant="Alice"]')
    await expect(remoteTile(bob.page, 'Alice')).toContainText('presenting')
    await expect.poll(async () => (await spotlight.boundingBox())?.width ?? 0).toBeGreaterThan(600)
    await expect.poll(async () => (await bob.page.locator('.stage-strip [data-participant="Bob"]').boundingBox())?.width ?? 0).toBeGreaterThan(100)
    await expectRemoteVideoPlaying(bob.page, 'Alice')

    // Someone joining mid-presentation receives the screen, not the camera.
    const carol = await newParticipant(browser)
    await joinMeeting(carol.page, code, 'Carol')
    await expect(carol.page.locator('.stage-main [data-participant="Alice"]')).toBeVisible()
    await expectRemoteVideoPlaying(carol.page, 'Alice')
    await carol.context.close()

    await alice.page.getByRole('button', { name: 'Stop presenting' }).first().click()
    await expect(share).toHaveAttribute('aria-pressed', 'false')
    await expect(remoteTile(bob.page, 'Alice')).not.toContainText('presenting')
    await expect(bob.page.locator('.stage-main')).toHaveCount(0)
    await expectRemoteVideoPlaying(bob.page, 'Alice')
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })

  test('sharing works with the camera off and falls back to the avatar afterwards', async () => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')
    await alice.page.getByTestId('toggle-camera').click()
    await expect(remoteTile(bob.page, 'Alice').locator('.tile-placeholder')).toBeVisible()

    await alice.page.getByTestId('toggle-screen').click()
    await expectRemoteVideoPlaying(bob.page, 'Alice')
    await expect(remoteTile(bob.page, 'Alice').locator('.tile-placeholder')).toHaveCount(0)

    await alice.page.getByTestId('toggle-screen').click()
    await expect(remoteTile(bob.page, 'Alice').locator('.tile-placeholder')).toBeVisible()
    // The screen capture track is released when sharing stops.
    expect(await liveTrackCount(alice.page)).toBe(1)
  })

  test('host can lock the room and remove a participant', async ({ browser }) => {
    await joinMeeting(alice.page, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')

    await alice.page.getByTestId('toggle-people').click()
    await alice.page.getByText('Lock meeting').click()
    await expect(bob.page.getByText('Locked')).toBeVisible()

    const carol = await newParticipant(browser)
    await carol.page.goto(`/${code}`)
    await carol.page.getByLabel('Your name').fill('Carol')
    await carol.page.getByRole('button', { name: 'Join meeting' }).click()
    await expect(carol.page.getByRole('heading', { name: 'This meeting is locked' })).toBeVisible()
    await carol.context.close()

    // Bob is not host and gets no host controls.
    await bob.page.getByTestId('toggle-people').click()
    await expect(bob.page.getByRole('button', { name: /^Remove / })).toHaveCount(0)

    await alice.page.getByRole('button', { name: 'Remove Bob' }).click()
    await alice.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(bob.page.getByTestId('end-screen')).toContainText('You were removed')
    expect(await liveTrackCount(bob.page)).toBe(0)
    await expect(alice.page.getByTestId('participant-count')).toHaveText('1 / 6')
  })
})

test('denied camera and microphone show recovery guidance and still allow joining', async ({ browser }) => {
  const { context, page } = await newParticipant(browser, { trackTracks: false })
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    }
  })
  await page.goto(`/${uniqueCode('denied')}`)
  await expect(page.getByText('Camera unavailable.')).toBeVisible()
  await expect(page.getByText('Microphone unavailable.')).toBeVisible()
  await expect(page.getByText(/Permission was blocked/).first()).toBeVisible()
  await expect(page.getByText("You'll join with your camera and microphone off.")).toBeVisible()

  await page.getByLabel('Your name').fill('Listener')
  await page.getByRole('button', { name: 'Join meeting' }).click()
  await expect(page.getByTestId('connection-status')).toBeVisible()
  await expect(page.getByTestId('toggle-mic')).toHaveAttribute('aria-pressed', 'true')
  await context.close()
})

test('meeting room fits a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await joinMeeting(page, uniqueCode('mobile'), 'Phone')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(page.getByTestId('leave')).toBeInViewport()
  await page.getByTestId('toggle-chat').click()
  await expect(page.getByLabel('Send a message')).toBeInViewport()
  await context.close()
})

test.describe('join reliability', () => {
  // Socket.IO frames: "42<ackId>[\"join-call\",…]" from the client, "43<ackId>[…]" for the server's ack.
  const isJoin = (m) => typeof m === 'string' && m.includes('"join-call"')
  const isAck = (m) => typeof m === 'string' && m.startsWith('43')

  test('a join the server never received is retried on a fresh connection', async ({ browser }) => {
    test.setTimeout(90_000)
    const code = uniqueCode('lost-join')
    const alice = await newParticipant(browser)
    const bob = await newParticipant(browser)
    let dropped = 0
    await bob.page.routeWebSocket('**/socket.io/**', (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((m) => {
        if (isJoin(m) && dropped === 0) return void (dropped += 1)
        server.send(m)
      })
    })
    await joinMeeting(alice.page, code, 'Alice')
    await bob.page.goto(`/${code}`)
    await bob.page.getByLabel('Your name').fill('Bob')
    await bob.page.getByRole('button', { name: 'Join meeting' }).click()

    await expect(bob.page.getByTestId('connection-status')).toBeVisible({ timeout: 30_000 })
    expect(dropped).toBe(1)
    await expectRemoteVideoPlaying(alice.page, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')
    await expect(remoteTile(alice.page, 'Bob')).toHaveCount(1)
    await alice.context.close()
    await bob.context.close()
  })

  test('a lost join ack leaves no ghost participant behind', async ({ browser }) => {
    test.setTimeout(90_000)
    const code = uniqueCode('lost-ack')
    const alice = await newParticipant(browser)
    const bob = await newParticipant(browser)
    let dropped = 0
    await bob.page.routeWebSocket('**/socket.io/**', (ws) => {
      const server = ws.connectToServer()
      server.onMessage((m) => {
        if (isAck(m) && dropped === 0) return void (dropped += 1)
        ws.send(m)
      })
    })
    await joinMeeting(alice.page, code, 'Alice')
    await bob.page.goto(`/${code}`)
    await bob.page.getByLabel('Your name').fill('Bob')
    await bob.page.getByRole('button', { name: 'Join meeting' }).click()

    // The server did join Bob, so Alice briefly sees him; the retry must replace, not duplicate, him.
    await expect(bob.page.getByTestId('connection-status')).toBeVisible({ timeout: 30_000 })
    expect(dropped).toBe(1)
    await expectRemoteVideoPlaying(alice.page, 'Bob')
    await expect(remoteTile(alice.page, 'Bob')).toHaveCount(1)
    await expect(alice.page.getByTestId('participant-count')).toHaveText('2 / 6')
    await alice.context.close()
    await bob.context.close()
  })

  test('an unresponsive server ends in an error screen instead of loading forever', async ({ browser }) => {
    test.setTimeout(90_000)
    const bob = await newParticipant(browser)
    await bob.page.routeWebSocket('**/socket.io/**', (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((m) => !isJoin(m) && server.send(m))
    })
    await bob.page.goto(`/${uniqueCode('no-ack')}`)
    await bob.page.getByLabel('Your name').fill('Bob')
    await bob.page.getByRole('button', { name: 'Join meeting' }).click()
    await expect(bob.page.getByRole('button', { name: 'Connecting…' })).toBeDisabled({ timeout: 15_000 })

    await expect(bob.page.getByTestId('end-screen')).toContainText('not responding', { timeout: 45_000 })
    expect(await liveTrackCount(bob.page)).toBe(0)
    await bob.page.unrouteAll()
    await bob.page.getByRole('button', { name: 'Try again' }).click()
    await expect(bob.page.getByRole('button', { name: 'Join meeting' })).toBeEnabled()
    await bob.context.close()
  })

  test('a double submit joins once', async ({ browser }) => {
    const code = uniqueCode('double')
    const alice = await newParticipant(browser)
    const bob = await newParticipant(browser)
    await joinMeeting(alice.page, code, 'Alice')
    await bob.page.goto(`/${code}`)
    await expect(bob.page.getByRole('button', { name: 'Join meeting' })).toBeEnabled()
    await bob.page.getByLabel('Your name').fill('Bob')
    await bob.page.evaluate(() => {
      const form = document.querySelector('.lobby-form')
      form.requestSubmit()
      form.requestSubmit()
    })
    await expect(bob.page.getByTestId('connection-status')).toBeVisible()
    await expectRemoteVideoPlaying(alice.page, 'Bob')
    await alice.page.waitForTimeout(1500)
    await expect(remoteTile(alice.page, 'Bob')).toHaveCount(1)
    await expect(alice.page.getByTestId('participant-count')).toHaveText('2 / 6')
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe('camera framing', () => {
  const videoStyle = (tile) =>
    tile.locator('video').evaluate((v) => {
      const cs = getComputedStyle(v)
      return { fit: cs.objectFit, transform: cs.transform, tileTransform: getComputedStyle(v.parentElement).transform }
    })
  const liveCameraSettings = (page) =>
    page.evaluate(() => {
      const t = window.__tracks.find((x) => x.kind === 'video' && x.readyState === 'live' && !x.label.includes('screen'))
      const { width, height, resizeMode } = t.getSettings()
      return { width, height, resizeMode }
    })

  test('local and remote tiles show the whole, unscaled camera frame', async ({ browser }) => {
    const code = uniqueCode('framing')
    const alice = await newParticipant(browser)
    const bob = await newParticipant(browser)

    await alice.page.goto(`/${code}`)
    await expect(alice.page.getByRole('button', { name: 'Join meeting' })).toBeEnabled()
    expect(await videoStyle(alice.page.getByTestId('tile-local'))).toEqual({ fit: 'contain', transform: 'matrix(-1, 0, 0, 1, 0, 0)', tileTransform: 'none' })
    expect((await liveCameraSettings(alice.page)).resizeMode).toBe('none')

    await alice.page.getByLabel('Your name').fill('Alice')
    await alice.page.getByRole('button', { name: 'Join meeting' }).click()
    await joinMeeting(bob.page, code, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')

    expect(await videoStyle(alice.page.getByTestId('tile-local'))).toEqual({ fit: 'contain', transform: 'matrix(-1, 0, 0, 1, 0, 0)', tileTransform: 'none' })
    expect(await videoStyle(remoteTile(bob.page, 'Alice'))).toEqual({ fit: 'contain', transform: 'none', tileTransform: 'none' })

    // Turning the camera back on (a new track) keeps the uncropped capture mode.
    await alice.page.getByTestId('toggle-camera').click()
    await expect(remoteTile(bob.page, 'Alice').locator('.tile-placeholder')).toBeVisible()
    await alice.page.getByTestId('toggle-camera').click()
    await expectRemoteVideoPlaying(bob.page, 'Alice')
    expect((await liveCameraSettings(alice.page)).resizeMode).toBe('none')
    await alice.context.close()
    await bob.context.close()
  })

  test('a 4:3 camera reaches the other side uncropped', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    // 1280x960 frame with white bands at the top and bottom edges: Chrome used to crop this to
    // 1280x720, cutting both bands off the outgoing track.
    const W = 1280
    const H = 960
    const y = Buffer.alloc(W * H, 128)
    y.fill(235, 0, 40 * W)
    y.fill(235, (H - 40) * W)
    const uv = Buffer.alloc((W / 2) * (H / 2), 128)
    const frame = Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv])
    const file = testInfo.outputPath('camera-4x3.y4m')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), frame, frame]))

    const camBrowser = await chromium.launch({
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${file}`,
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--autoplay-policy=no-user-gesture-required',
      ],
    })
    const code = uniqueCode('four-three')
    const aliceCtx = await camBrowser.newContext({ baseURL: testInfo.project.use.baseURL, permissions: ['camera', 'microphone'] })
    const alicePage = await aliceCtx.newPage()
    const bob = await newParticipant(browser)
    await joinMeeting(alicePage, code, 'Alice')
    await joinMeeting(bob.page, code, 'Bob')
    await expectRemoteVideoPlaying(bob.page, 'Alice')

    const received = await remoteTile(bob.page, 'Alice')
      .locator('video')
      .evaluate(async (v) => {
        // Let the encoder ramp up to the full resolution.
        for (let i = 0; i < 40 && v.videoWidth < 1280; i++) await new Promise((r) => setTimeout(r, 250))
        const c = document.createElement('canvas')
        c.width = v.videoWidth
        c.height = v.videoHeight
        const ctx = c.getContext('2d')
        ctx.drawImage(v, 0, 0)
        return { ratio: v.videoWidth / v.videoHeight, topLuma: ctx.getImageData(c.width / 2, 4, 1, 1).data[0] }
      })
    expect(received.ratio).toBeCloseTo(4 / 3, 2)
    expect(received.topLuma).toBeGreaterThan(200)

    await aliceCtx.close()
    await camBrowser.close()
    await bob.context.close()
  })
})
