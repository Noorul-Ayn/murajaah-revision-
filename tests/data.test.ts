import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import fixture from './fixtures/qurancom-boundaries.json'
import { AYAH_COUNT, QUARTER_COUNT } from '../src/lib/quran'
import { RUB_SIGN } from '../src/lib/text'

const raw = readFileSync(path.resolve(__dirname, '../data/tanzil/quran-uthmani.xml'), 'utf8')
const d = quran.data

describe('Qur’an data set', () => {
  it('has every surah and ayah', () => {
    expect(d.surahs).toHaveLength(114)
    expect(d.ayahs).toHaveLength(AYAH_COUNT)
    expect(d.surahs.reduce((n, s) => n + s.ayahs, 0)).toBe(AYAH_COUNT)
    expect(d.surahs[1]).toMatchObject({ n: 2, name: 'البقرة', ayahs: 286, start: 7 })
    expect(d.surahs[113]).toMatchObject({ n: 114, ayahs: 6, start: 6230 })
  })

  it('copies the Tanzil text byte for byte, as its licence requires', () => {
    const texts = [...raw.matchAll(/<aya index="\d+" text="([^"]*)"/g)].map((m) => m[1])
    expect(texts).toHaveLength(AYAH_COUNT)
    expect(d.ayahs).toEqual(texts)
    expect(d.copyright).toContain('Tanzil')
    expect(d.copyright).toContain('CHANGING IT IS NOT ALLOWED')
  })

  it('keeps the basmala apart from the ayahs', () => {
    expect(d.surahs[0]!.basmala).toBeNull()
    expect(d.surahs[8]!.basmala).toBeNull() // At-Tawba
    expect(d.surahs.filter((s) => s.basmala).length).toBe(112)
    expect(d.ayahs[0]).toBe(d.surahs[1]!.basmala) // Al-Fatiha 1 is the basmala
  })

  it('agrees with quran.com on every juz, rub’ and page boundary', () => {
    expect(d.juz).toEqual(fixture.juz)
    expect(d.quarters).toEqual(fixture.quarters)
    expect(d.pages).toEqual(fixture.pages)
  })

  it('agrees with the rub’ signs written in the text', () => {
    const marked = d.ayahs.flatMap((t, i) => (t.startsWith(`${RUB_SIGN} `) ? [i] : []))
    const surahStarts = new Set(d.surahs.map((s) => s.start))
    // Every ۞ starts a quarter; quarters without one begin a surah.
    expect(marked.every((i) => d.quarters.includes(i))).toBe(true)
    expect(d.quarters.every((q) => marked.includes(q) || surahStarts.has(q))).toBe(true)
    expect(d.quarters).toHaveLength(QUARTER_COUNT)
  })

  it('records the one correction to the Tanzil metadata', () => {
    // Al-Hijr: the quarter begins at 15:49 "نبئ عبادي", not 15:50.
    expect(quran.keyOf(quran.quarterStart(106))).toEqual({ surah: 15, ayah: 49 })
    expect(d.source.corrections).toHaveLength(1)
    expect(d.source.corrections[0]).toContain('15:49')
  })

  it('starts each juz on a hizb boundary', () => {
    d.juz.forEach((start, j) => expect(quran.quarterStart(j * 8 + 1)).toBe(start))
  })

  it('places well-known quarters correctly', () => {
    const at = (q: number) => quran.keyOf(quran.quarterStart(q))
    expect(at(1)).toEqual({ surah: 1, ayah: 1 })
    expect(at(2)).toEqual({ surah: 2, ayah: 26 })
    expect(at(9)).toEqual({ surah: 2, ayah: 142 }) // Juz 2
    expect(at(233)).toEqual({ surah: 78, ayah: 1 }) // Juz 30
    expect(at(240)).toEqual({ surah: 100, ayah: 9 })
  })
})
