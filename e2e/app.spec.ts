import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'en-US' })

async function chooseJuz30(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Choose what you’ve memorized' }).click()
  await page.getByRole('button', { name: 'Juz 30', exact: true }).click()
  await expect(page.getByText('564 ayahs, 8 rub’s').first()).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
}

test('a first session from memorization to progress map', async ({ page }) => {
  await chooseJuz30(page)
  await page.getByRole('radio', { name: /Continue the ayah/ }).check()
  await page.getByRole('radio', { name: '10' }).check()
  await page.getByRole('button', { name: 'Start 10 questions' }).click()

  for (let i = 1; i <= 10; i++) {
    await expect(page.getByText(`${i} of 10`)).toBeVisible()
    await page.getByRole('button', { name: 'Show answer' }).click()
    await page.getByRole('button', { name: 'Perfect' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  await expect(page.getByText('No mistakes this time.')).toBeVisible()

  await page.getByRole('link', { name: 'Progress' }).click()
  // One perfect answer is good, not yet strong; any tested colour will do.
  await expect(page.locator('.map .cell:not([data-s="out"]):not([data-s="none"])').first()).toBeVisible()
  await expect(page.locator('.map .cell[data-s="out"]')).toHaveCount(232)
})

test('a missed ayah comes back later in the same session', async ({ page }) => {
  await chooseJuz30(page)
  await page.getByRole('radio', { name: '10' }).check()
  await page.getByRole('button', { name: 'Start 10 questions' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Missed' }).click()
  await expect(page.getByText('2 of 11')).toBeVisible()
})

test('word hints cap the grade at hesitated', async ({ page }) => {
  await chooseJuz30(page)
  await page.getByRole('button', { name: /^Start/ }).click()
  await page.getByRole('button', { name: 'Show next word' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.getByRole('button', { name: 'Perfect' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Hesitated' })).toBeEnabled()
})

test('naming a rub’ is checked automatically', async ({ page }) => {
  await chooseJuz30(page)
  await page.getByRole('radio', { name: /Name the rub’/ }).check()
  await page.getByRole('button', { name: /^Start/ }).click()
  await page.locator('.choice').first().click()
  await expect(page.locator('.verdict')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText(/^2 of/)).toBeVisible()
})

test('Arabic switches the whole interface to right-to-left', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'العربية' }).check()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible()
})

test('works offline once loaded', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker check runs in Chromium')
  await chooseJuz30(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: /^Start/ }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.locator('.lawh .quran').first()).toBeVisible()
  await context.setOffline(false)
})

test('the mushaf opens by surah, turns pages and shows a translation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Mushaf' }).click()
  await page.getByRole('link', { name: /Al-Kahf/ }).click()
  await expect(page).toHaveURL(/#\/mushaf\/293$/)
  await expect(page.getByRole('heading', { name: 'Al-Kahf' })).toBeVisible()

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/#\/mushaf\/294$/)
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(page).toHaveURL(/#\/mushaf\/293$/)

  await page.getByRole('switch', { name: 'English translation' }).check()
  await expect(page.getByText('18:1', { exact: true })).toBeVisible()
  // Page 293 opens with the end of Al-Isra, then Al-Kahf begins.
  await expect(page.locator('.translation').first()).toContainText('17:105')
  await expect(page.locator('.translation', { hasText: '18:1 ' })).toContainText('[All] praise is [due] to Allah')

  await page.getByRole('button', { name: 'Go to page' }).click()
  await page.getByLabel('Page number').fill('604')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(page).toHaveURL(/#\/mushaf\/604$/)
  await expect(page.getByRole('heading', { name: /An-Naas/ })).toBeVisible()

  await page.getByRole('link', { name: 'Surah list' }).click()
  await expect(page.getByRole('link', { name: /Continue reading/ })).toContainText('Page 604')
})
