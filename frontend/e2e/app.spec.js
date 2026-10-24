import { expect, test } from '@playwright/test'
import { watchErrors } from './helpers'

test.describe('public pages', () => {
  test('landing renders with the product name and no runtime errors', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await expect(page).toHaveTitle('Video Conferencing Platform')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meet face to face')
    await expect(page.getByText(/apna/i)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('new meeting creates a code and opens the lobby', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New meeting' }).click()
    await expect(page).toHaveURL(/\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
    await expect(page.getByRole('button', { name: 'Join meeting' })).toBeVisible()
    await expect(page.getByTestId('tile-local')).toBeVisible()
  })

  test('join form validates codes and accepts full invite links', async ({ page, baseURL }) => {
    await page.goto('/')
    const input = page.getByLabel('Meeting code or link')
    await input.fill('not a code!!')
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Enter a meeting code')

    await input.fill(`${baseURL}/Team-Sync`)
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page).toHaveURL(/\/team-sync$/)
  })

  test('invalid meeting codes and unknown nested paths are handled', async ({ page }) => {
    await page.goto('/!!')
    await expect(page.getByRole('heading', { name: "That isn't a valid meeting link" })).toBeVisible()
    await page.goto('/some/deep/path')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })

  test('SPA routes survive a hard refresh', async ({ page }) => {
    for (const path of ['/auth', '/history', '/abc-defg-hij']) {
      const res = await page.goto(path)
      expect(res.status()).toBe(200)
    }
  })

  test('protected pages redirect to sign in', async ({ page }) => {
    await page.goto('/home')
    await expect(page).toHaveURL(/\/auth$/)
  })
})

test.describe('accounts', () => {
  test('register, sign in, see empty history, sign out', async ({ page }) => {
    const errors = watchErrors(page)
    const username = `user_${Date.now().toString(36)}`

    await page.goto('/auth?mode=signup')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Enter your name.')).toBeVisible()

    await page.getByLabel('Full name').fill('Grace Hopper')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill('a-strong-password')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Account created')).toBeVisible()

    await page.getByRole('tab', { name: 'Sign up' }).click()
    await page.getByLabel('Full name').fill('Someone Else')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill('another-password')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('That username is taken.').first()).toBeVisible()

    await page.getByRole('tab', { name: 'Sign in' }).click()
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect username or password')

    await page.getByLabel('Password', { exact: true }).fill('a-strong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Grace, ready to meet?')
    await expect(page.getByText('No meetings yet')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Grace')

    await page.getByRole('link', { name: 'History' }).click()
    await expect(page.getByRole('heading', { name: 'No meetings yet' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/home')
    await expect(page).toHaveURL(/\/auth$/)
    // 401/409 are the deliberate wrong-password and duplicate-username steps.
    expect(errors.filter((e) => !/status of 40[19]/.test(e))).toEqual([])
  })
})

test('meetings joined while signed in appear in history and can be removed', async ({ page }) => {
  const username = `hist_${Date.now().toString(36)}`
  const code = `hist-${Date.now().toString(36)}`
  await page.goto('/auth?mode=signup')
  await page.getByLabel('Full name').fill('Ada Lovelace')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill('history-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Account created')).toBeVisible()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill('history-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/home$/)

  await page.getByLabel('Meeting code or link').fill(code)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page.getByLabel('Your name')).toHaveValue('Ada Lovelace')
  await expect(page.getByText(`Signed in as @${username}`)).toBeVisible()
  await page.getByRole('button', { name: 'Join meeting' }).click()
  await expect(page.getByTestId('connection-status')).toBeVisible()
  await page.getByTestId('leave').click()
  await page.getByRole('link', { name: 'Return to home' }).click()

  await expect(page.locator('.dash-recent')).toContainText(code)
  await page.goto('/history')
  await expect(page.getByText(code)).toBeVisible()
  await page.getByRole('button', { name: `Remove ${code} from history` }).click()
  await expect(page.getByText('Removed from history')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No meetings yet' })).toBeVisible()
})

test.describe('responsive layout', () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    test(`no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      for (const path of ['/', '/auth', '/abc-defg-hij']) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0)
      }
    })
  }
})
