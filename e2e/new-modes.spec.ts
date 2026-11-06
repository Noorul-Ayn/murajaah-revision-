import { expect, test, type Page } from '@playwright/test'
import { fakeSpeech, memorizeSurah, say } from './fakes'

/**
 * The three newer practice modes: where on the page, from the meaning, and
 * similar ayahs found from the reciter's own slips.
 */

test.use({ locale: 'en-US' })

/** Memorizes a single ayah range, e.g. 2:58–2:58. */
async function memorizeRange(page: Page, surah: number, from: number, to: number) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Choose what you’ve memorized' }).click()
  await page.getByRole('radio', { name: 'Ayah range' }).check()
  const [fromRow, toRow] = [page.locator('.range-grid').nth(0), page.locator('.range-grid').nth(1)]
  await fromRow.locator('select').selectOption(String(surah))
  await fromRow.locator('input').fill(String(from))
  await toRow.locator('select').selectOption(String(surah))
  await toRow.locator('input').fill(String(to))
  await page.getByRole('button', { name: 'Add range' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
}

test('where on the page: tap the line an ayah begins on', async ({ page }) => {
  // Al-Ikhlas is on page 604, the left page: title, basmala, then 112:1–3 on line 3 and 112:4 on line 4.
  await memorizeSurah(page, '112', /Al-Ikhlaas/)
  await page.getByRole('radio', { name: /Where on the page/ }).check()
  await expect(page.getByText(/Pages and lines follow your mushaf: Madinah, 1405 AH print/)).toBeVisible()
  await page.getByRole('radio', { name: 'Mushaf order' }).check()
  await page.getByRole('button', { name: 'Start 4 questions' }).click()

  await expect(page.getByRole('heading', { name: 'Where does this ayah begin?' })).toBeVisible()
  const check = page.getByRole('button', { name: 'Check' })
  await expect(check).toBeDisabled()
  await page.getByRole('button', { name: 'Left page, line 3', exact: true }).click()
  await check.click()
  await expect(page.getByText('Exactly there!')).toBeVisible()
  await expect(page.locator('.spread__num')).toHaveText(['603', '604'])
  await page.getByRole('button', { name: 'Next' }).click()

  // 112:2: the surah titles as a hint, then a tap far off.
  await page.getByRole('button', { name: 'Show the surah titles' }).click()
  await expect(page.getByRole('button', { name: 'Left page, line 1: Surah title' })).toBeDisabled()
  await page.getByRole('button', { name: 'Left page, line 12', exact: true }).click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('It begins on the left page, line 3.')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // A line that is part of the ayah but not its start is close.
  await page.getByRole('button', { name: 'Left page, line 4', exact: true }).click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Close. It begins on the left page, line 3.')).toBeVisible()
})

test('the page quiz and page numbers follow the mushaf print', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: /Al-Mā’idah 78/ }).check()
  await page.goto('/#/mushaf/121')
  // Page 121 starts at Al-Ma'idah 78 in the 1421 AH print (77 in the 1405 AH one).
  await expect(page.locator('.ayah-run').first()).toHaveAttribute('data-index', String(669 + 77))
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: /Al-Mā’idah 77/ }).check()
  await page.goto('/#/mushaf/121')
  await expect(page.locator('.ayah-run').first()).toHaveAttribute('data-index', String(669 + 76))
})

test('from the meaning: the English meaning is shown, the Arabic is recited', async ({ page }) => {
  await memorizeSurah(page, '112', /Al-Ikhlaas/)
  await page.getByRole('radio', { name: /From the meaning/ }).check()
  await page.getByRole('radio', { name: 'Mushaf order' }).check()
  await page.getByRole('button', { name: /^Start/ }).click()
  await expect(page.getByText('Say, "He is Allah, [who is] One,')).toBeVisible()
  await expect(page.getByText(/Translation: Saheeh International/)).toBeVisible()
  await page.getByRole('button', { name: 'Show next word' }).click()
  await expect(page.locator('.lawh .word')).toHaveText(['قُلْ'])
  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.locator('.lawh .ayah-run .word')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /Perfect/ })).toBeDisabled() // a word was shown
  await page.getByRole('button', { name: /Almost/ }).click()
})

test.describe('similar ayahs', () => {
  test.beforeEach(async ({ page }) => fakeSpeech(page))

  test('drifting into a similar ayah is noticed, compared and saved to practise', async ({ page }) => {
    await memorizeRange(page, 2, 58, 58)
    await page.getByRole('button', { name: 'Start 1 question' }).click()
    await page.getByRole('button', { name: 'Recite aloud' }).click()
    await page.getByRole('button', { name: 'Start listening' }).click()
    await expect(page.getByText('Listening. Recite from where the text stops.')).toBeVisible()

    // 2:58, going on in the words of 7:161 after "حيث شئتم".
    await say(page, 'وإذ قلنا ادخلوا هذه القرية فكلوا منها حيث شئتم وقولوا حطة')
    await expect(page.getByText("That was Al-A'raaf 161.")).toBeVisible()
    await page.getByRole('button', { name: 'Compare' }).click()
    const dialog = page.getByRole('dialog', { name: 'Two similar ayahs' })
    await expect(dialog.locator('.word--diff').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()

    // Back to 2:58's own words, to the end.
    await say(page, 'رغدا وادخلوا الباب سجدا وقولوا حطة نغفر لكم خطاياكم وسنزيد المحسنين')
    await page.getByRole('button', { name: 'Stop listening' }).click()
    await page.getByRole('button', { name: /Almost/ }).click()
    await expect(page.getByText('Session complete', { exact: true })).toBeVisible()
    await expect(page.getByText(/Al-Baqara 58, Tell them apart/)).toBeVisible()

    // The pair is now there to practise.
    await page.goto('/#/practice')
    const tile = page.getByRole('radio', { name: /Tell them apart/ })
    await expect(page.locator('.mode-tile[data-mode=pair] .mode-tile__badge')).toHaveText('1 pair')
    await tile.check()
    await page.getByRole('button', { name: 'Start 1 question' }).click()
    await expect(page.getByRole('heading', { name: 'Continue this ayah, not its look-alike' })).toBeVisible()
    await expect(page.getByText(/Looks like Al-A.raaf 161/)).toBeVisible()
    await page.getByRole('button', { name: 'Show answer' }).click()
    await expect(page.locator('.pair-other .word--diff').first()).toBeVisible()
    await expect(page.locator('.lawh > .quran .word--diff').first()).toBeVisible()
  })

  test('a mix-up can be dismissed so it isn’t saved', async ({ page }) => {
    await memorizeRange(page, 2, 58, 58)
    await page.getByRole('button', { name: 'Start 1 question' }).click()
    await page.getByRole('button', { name: 'Recite aloud' }).click()
    await page.getByRole('button', { name: 'Start listening' }).click()
    await expect(page.getByText('Listening. Recite from where the text stops.')).toBeVisible()
    await say(page, 'وإذ قلنا ادخلوا هذه القرية فكلوا منها حيث شئتم وقولوا حطة')
    await page.getByRole('button', { name: 'Not a mix-up' }).click()
    await expect(page.locator('.mixup')).toHaveCount(0)
    await page.getByRole('button', { name: 'Stop listening' }).click()
    await page.getByRole('button', { name: /Almost/ }).click()
    await expect(page.getByText('Session complete', { exact: true })).toBeVisible()
    await expect(page.locator('.review-list')).not.toContainText('Tell them apart')
    await page.goto('/#/practice')
    await expect(page.locator('.mode-tile[data-mode=pair] .mode-tile__badge')).toHaveCount(0)
  })
})
