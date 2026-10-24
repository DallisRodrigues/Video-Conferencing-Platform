import { expect, test } from '@playwright/test'
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
