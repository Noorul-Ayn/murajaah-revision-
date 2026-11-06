import { expect, test, type Page } from '@playwright/test'

/**
 * Reciting aloud, with the browser's speech recognition replaced by a fake
 * the test can speak through. The real recognizer needs a microphone and a
 * network service, neither of which exists in CI.
 */

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    type Res = { transcript: string }[] & { isFinal: boolean }
    const w = window as unknown as Record<string, unknown>
    class FakeRecognition {
      results: Res[] = []
      onresult: ((e: { results: Res[] }) => void) | null = null
      onend: (() => void) | null = null
      onerror: unknown = null
      constructor() {
        w.__sr = this
      }
      start() {}
      stop() {
        setTimeout(() => this.onend?.(), 0)
      }
      abort() {}
    }
    w.SpeechRecognition = FakeRecognition
    w.__say = (text: string, isFinal: boolean) => {
      const sr = w.__sr as FakeRecognition
      const res = Object.assign([{ transcript: text }], { isFinal }) as Res
      const last = sr.results[sr.results.length - 1]
      if (last && !last.isFinal) sr.results[sr.results.length - 1] = res
      else sr.results.push(res)
      sr.onresult?.({ results: [...sr.results] })
    }
    w.__vibrations = 0
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        w.__vibrations = (w.__vibrations as number) + 1
        return true
      },
    })
  })
})

const say = (page: Page, text: string, isFinal = true) =>
  page.evaluate(([t, f]) => (window as unknown as { __say: (t: string, f: boolean) => void }).__say(t, f), [
    text,
    isFinal,
  ] as const)

test('reciting aloud follows the words, warns on a slip and suggests a grade', async ({ page }) => {
  // Memorize Al-Ikhlas and go through it in mushaf order: 112:1, 112:3, 112:4.
  await page.goto('/')
  await page.getByRole('link', { name: 'Choose what you’ve memorized' }).click()
  await page.getByRole('radio', { name: 'Surahs' }).check()
  await page.getByRole('searchbox', { name: 'Search surahs' }).fill('112')
  await page.getByRole('button', { name: /Al-Ikhlaas/ }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('radio', { name: 'Mushaf order' }).check()
  await page.getByRole('button', { name: 'Start 3 questions' }).click()

  // 112:1 — "قل هو" is shown; recite the rest correctly.
  await page.getByRole('button', { name: 'Recite aloud' }).click()
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByText('Listening. Recite from where the text stops.')).toBeVisible()
  await say(page, 'الله')
  await expect(page.locator('.rw--said')).toHaveCount(1)
  await say(page, 'أحد')
  await expect(page.getByText('No slips. Check the grade, then confirm it.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Perfect/ })).toHaveClass(/grade--suggested/)
  await page.getByRole('button', { name: /Perfect/ }).click()

  // 112:3 — "لم يلد" is shown; say يلد again instead of يولد, then correct it.
  await expect(page.getByText('2 of 3')).toBeVisible()
  await page.getByRole('button', { name: 'Recite aloud' }).click()
  await say(page, 'ولم يلد', false)
  await expect(page.locator('.rw--wrong')).toHaveCount(0) // still being heard: no warning yet
  await say(page, 'ولم يلد', true)
  await expect(page.locator('.rw--wrong')).toHaveCount(1)
  await expect(page.getByText(/Not that word/)).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __vibrations: number }).__vibrations)).toBe(1)
  await say(page, 'يولد')
  await expect(page.getByText('1 slip. Check the grade, then confirm it.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Hesitated/ })).toHaveClass(/grade--suggested/)
  await expect(page.locator('.rw--slip')).toHaveCount(1)
})
