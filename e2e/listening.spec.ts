import { expect, test } from '@playwright/test'
import { fakeSpeech, memorizeSurah, say } from './fakes'

/**
 * Reciting aloud, with the browser's speech recognition replaced by a fake
 * the test can speak through. The real recognizer needs a microphone and a
 * network service, neither of which exists in CI.
 */

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => fakeSpeech(page))

test('reciting aloud follows the words, keeps going past the verse, warns on a slip and suggests a grade', async ({
  page,
}) => {
  // Memorize Al-Ikhlas and go through it in mushaf order: 112:1, 112:3, 112:4.
  await memorizeSurah(page, '112', /Al-Ikhlaas/)
  await page.getByRole('radio', { name: 'Mushaf order' }).check()
  await page.getByRole('button', { name: 'Start 3 questions' }).click()

  // 112:1: "قل هو" is shown. Recite the rest, then carry on into 112:2 and 112:3.
  await page.getByRole('button', { name: 'Recite aloud' }).click()
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByText('Listening. Recite from where the text stops.')).toBeVisible()
  // Starting again from the shown words is fine.
  await say(page, 'قل هو الله')
  await expect(page.locator('.rw--said')).toHaveCount(1)
  await expect(page.locator('.rw--wrong')).toHaveCount(0)
  await say(page, 'أحد')
  await expect(page.getByText('Keep reciting, or tap Next question for a new one.')).toBeVisible()
  await say(page, 'الله الصمد لم يلد ولم يولد')
  await expect(page.locator('.rw--said', { hasText: 'يُولَدْ' })).toBeVisible()

  // Next question: graded from what was heard; the microphone stays on.
  await page.getByRole('button', { name: 'Next question' }).click()
  await expect(page.getByText('2 of 3')).toBeVisible()
  await expect(page.getByText('Listening. Recite from where the text stops.')).toBeVisible()

  // 112:3: "لم يلد" is shown. Say يلد again instead of يولد, then correct it.
  await say(page, 'ولم يلد', false)
  await expect(page.locator('.rw--wrong')).toHaveCount(0) // still being heard: no warning yet
  await say(page, 'ولم يلد', true)
  await expect(page.locator('.rw--wrong')).toHaveCount(1)
  await expect(page.getByText(/Not that word/)).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __vibrations: number }).__vibrations)).toBe(1)
  await say(page, 'يولد')
  await expect(page.getByText('Keep reciting, or tap Next question for a new one.')).toBeVisible()

  // Stop listening: the answer shows, with a suggested grade to confirm.
  await page.getByRole('button', { name: 'Stop listening' }).click()
  await expect(page.getByText('1 slip. Check the grade, then confirm it.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Hesitated/ })).toHaveClass(/grade--suggested/)
  await expect(page.locator('.rw--slip')).toHaveCount(1)
  await page.getByRole('button', { name: /Hesitated/ }).click()

  // Voice mode is off now: the last question waits for a tap.
  await expect(page.getByText('3 of 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recite aloud' })).toBeVisible()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /Perfect/ }).click()

  // 112:1 and 112:4 perfect, 112:3 perfect while carrying on, then hesitated as its own question.
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  await expect(page.getByText('3 perfect, 1 hesitated, 0 missed')).toBeAttached()
})
