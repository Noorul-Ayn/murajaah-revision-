import type { Page } from '@playwright/test'

/**
 * Speech recognition replaced by a fake the test speaks through: the real
 * recognizer needs a microphone and a network service, neither of which
 * exists in CI. Vibration is counted instead of felt.
 */
export async function fakeSpeech(page: Page) {
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
}

export const say = (page: Page, text: string, isFinal = true) =>
  page.evaluate(([t, f]) => (window as unknown as { __say: (t: string, f: boolean) => void }).__say(t, f), [
    text,
    isFinal,
  ] as const)

/** A short silent WAV standing in for reciters' MP3s. */
export function silentWav(seconds = 0.25): Buffer {
  const rate = 8000
  const samples = Math.floor(rate * seconds)
  const b = Buffer.alloc(44 + samples)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + samples, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate, 28)
  b.writeUInt16LE(1, 32)
  b.writeUInt16LE(8, 34)
  b.write('data', 36)
  b.writeUInt32LE(samples, 40)
  b.fill(128, 44)
  return b
}

export async function memorizeSurah(page: Page, n: string, name: RegExp) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Choose what you’ve memorized' }).click()
  await page.getByRole('radio', { name: 'Surahs' }).check()
  await page.getByRole('searchbox', { name: 'Search surahs' }).fill(n)
  await page.getByRole('button', { name }).click()
  await page.getByRole('button', { name: 'Done' }).click()
}
