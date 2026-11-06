import { expect, test } from '@playwright/test'
import { fakeSpeech, memorizeSurah, say, silentWav } from './fakes'

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page)
  // Reciters' audio, replaced by short silence so the test runs offline.
  await page.route('https://everyayah.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }),
  )
})

test('a reciter plays ayah by ayah, with the basmala, and turns the page', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => r.url().includes('everyayah.com') && requested.push(r.url().split('/').pop()!))

  await page.goto('/#/mushaf/603')
  await page.getByRole('button', { name: 'Listen' }).click()
  await expect(page.getByRole('combobox', { name: 'Reciter' })).toHaveValue('alafasy')
  // Tap the last ayah on the page: playback carries on onto page 604.
  await page.locator('.page [data-index]').last().click()
  await expect(page).toHaveURL(/#\/mushaf\/604$/, { timeout: 15_000 })
  await expect(page.locator('.ml-word--active').first()).toBeVisible()
  // Al-Ikhlas starts with the basmala (Al-Fatiha 1) before 112:1.
  await expect.poll(() => requested.includes('112001.mp3'), { timeout: 15_000 }).toBe(true)
  expect(requested.indexOf('001001.mp3')).toBeLessThan(requested.indexOf('112001.mp3'))
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('opening a surah that starts partway down a page plays from that surah', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => r.url().includes('everyayah.com') && requested.push(r.url().split('/').pop()!))

  // Page 293 ends Al-Isra (17:105–111) and begins Al-Kahf.
  await page.goto('/#/mushaf')
  await page.getByRole('searchbox').fill('Kahf')
  await page.getByRole('link', { name: /Al-Kahf/ }).click()
  await expect(page).toHaveURL(/#\/mushaf\/293$/)
  await expect(page.locator('[data-surah="18"]')).toBeInViewport()

  await page.getByRole('button', { name: 'Listen' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => requested.includes('018001.mp3'), { timeout: 15_000 }).toBe(true)
  expect(requested.some((f) => f.startsWith('017'))).toBe(false)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
})

test('a surah title and any ayah start playback, without opening the player first', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => r.url().includes('everyayah.com') && requested.push(r.url().split('/').pop()!))

  await page.goto('/#/mushaf/293')
  await page.getByRole('button', { name: 'Play Al-Kahf' }).click()
  await expect(page.getByRole('combobox', { name: 'Reciter' })).toBeVisible()
  await expect.poll(() => requested.includes('018001.mp3'), { timeout: 15_000 }).toBe(true)
  expect(requested.some((f) => f.startsWith('017'))).toBe(false)
  await page.getByRole('button', { name: 'Close the player' }).click()

  // Tap the first ayah on the page, Al-Isra 105: the player opens and plays it.
  await page.locator('.page [data-index]').first().click()
  await expect(page.getByRole('combobox', { name: 'Reciter' })).toBeVisible()
  await expect.poll(() => requested.includes('017105.mp3'), { timeout: 15_000 }).toBe(true)
})

test('the page scrolls up to follow the ayah being recited', async ({ page }) => {
  await page.goto('/#/mushaf/50')
  // With the translation, the page is far taller than the screen.
  await page.getByRole('radio', { name: 'Translation', exact: true }).check()
  await expect(page.locator('.tr-ayah')).toHaveCount(9)
  await page.locator('.ayah-run').first().click()
  // 3:1 to 3:9 play one after another; the last ones are far down the page.
  await expect(page.locator('.tr-ayah').nth(7)).toHaveClass(/tr-ayah--active/, { timeout: 20_000 })
  await expect(page.locator('.tr-ayah--active')).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200)
})

test('three clean recitations on different days unlock recording, and the recording plays as “You”', async ({
  page,
}) => {
  test.slow()
  await memorizeSurah(page, '112', /Al-Ikhlaas/)
  await page.getByRole('link', { name: 'Mushaf', exact: true }).click()
  await page.getByRole('link', { name: /Your recitation/ }).click()
  await page.getByRole('link', { name: /الإخلاص/ }).click()
  await expect(page.getByRole('button', { name: 'Record this surah' })).toBeDisabled()

  const surah = 'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد'
  for (const day of [1, 2, 3]) {
    await page.clock.setFixedTime(new Date(2026, 10, day, 10))
    await page.getByRole('button', { name: 'Recite from memory' }).click()
    if (day === 1) await page.getByRole('button', { name: 'Start listening' }).click()
    await expect(page.getByText('Ayah 1 of 4')).toBeVisible()
    await say(page, surah)
    await expect(page.getByText(`Clean recitation. That makes ${day} of 3 days.`)).toBeVisible()
  }

  await page.getByRole('button', { name: 'Record this surah' }).click()
  await expect(page.getByText(/Recording \d+:\d\d/)).toBeVisible()
  await page.waitForTimeout(600)
  await say(page, surah)
  await expect(page.getByText('A clean take. Listen back, then save it or try again.')).toBeVisible()
  await page.getByRole('button', { name: 'Save recording' }).click()
  await expect(page.getByText('Recording saved.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recorded' })).toBeVisible()

  await page.goto('/#/mushaf/604')
  await page.getByRole('button', { name: 'Listen' }).click()
  await page.getByRole('combobox', { name: 'Reciter' }).selectOption('mine')
  await expect(page.getByRole('combobox', { name: 'Reciter' })).toHaveValue('mine')
})
