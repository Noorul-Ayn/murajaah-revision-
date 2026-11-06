import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import { quarterParts } from '../src/lib/quran'
import { leadingWords, openingText, splitWords, wordCount } from '../src/lib/text'

describe('Quran lookups', () => {
  it('converts between verse keys and indices', () => {
    expect(quran.indexOf(1, 1)).toBe(0)
    expect(quran.indexOf(2, 255)).toBe(261)
    expect(quran.keyOf(261)).toEqual({ surah: 2, ayah: 255 })
    expect(quran.keyOf(6235)).toEqual({ surah: 114, ayah: 6 })
    expect(() => quran.indexOf(1, 8)).toThrow(RangeError)
  })

  it('finds the juz, hizb, quarter and page of an ayah', () => {
    const i = quran.indexOf(67, 1) // Al-Mulk
    expect(quran.juzOf(i)).toBe(29)
    expect(quran.hizbOf(i)).toBe(57)
    expect(quran.quarterOf(i)).toBe(225)
    expect(quran.pageOf(i)).toBe(562)
  })

  it('gives inclusive ranges that cover the whole mushaf', () => {
    let next = 0
    for (let q = 1; q <= 240; q++) {
      const [a, b] = quran.quarterRange(q)
      expect(a).toBe(next)
      expect(b).toBeGreaterThanOrEqual(a)
      next = b + 1
    }
    expect(next).toBe(6236)
    expect(quran.juzRange(30)).toEqual([quran.indexOf(78, 1), 6235])
    expect(quran.hizbRange(1)).toEqual([0, quran.indexOf(2, 74)])
  })

  it('names quarter positions', () => {
    expect(quarterParts(1)).toEqual({ hizb: 1, part: 1, juz: 1 })
    expect(quarterParts(106)).toEqual({ hizb: 27, part: 2, juz: 14 })
    expect(quarterParts(240)).toEqual({ hizb: 60, part: 4, juz: 30 })
  })
})

describe('word splitting', () => {
  it('attaches pause marks to the word before them', () => {
    const { words } = splitWords(quran.text(quran.indexOf(2, 2)))
    expect(words).toHaveLength(7) // ذلك الكتاب لا ريب فيه هدى للمتقين
    expect(words[3]).toBe('رَيْبَ ۛ')
    expect(words[4]).toBe('فِيهِ ۛ')
  })

  it('separates the rub’ sign from the first word', () => {
    const r = splitWords(quran.text(quran.indexOf(2, 26)))
    expect(r.rubSign).toBe(true)
    expect(r.words[0]!.normalize('NFC')).toBe('إِنَّ'.normalize('NFC'))
  })

  it('never counts signs as words', () => {
    for (let i = 0; i < 6236; i++) {
      for (const w of splitWords(quran.text(i)).words) expect(w).not.toMatch(/^[ۖ-ۭ]/u)
    }
  })

  it('never shows more than half of an ayah as its prompt', () => {
    const fatiha1 = quran.text(0) // 4 words
    expect(leadingWords(fatiha1, 3).shown).toHaveLength(2)
    const long = quran.text(quran.indexOf(2, 282))
    expect(leadingWords(long, 3).shown).toHaveLength(3)
    expect(leadingWords(quran.text(quran.indexOf(74, 34)), 3).shown).toHaveLength(1)
  })

  it('shortens long openings for lists', () => {
    expect(openingText(quran.text(quran.indexOf(2, 282)), 3).endsWith(' …')).toBe(true)
    expect(wordCount(openingText(quran.text(0), 10))).toBe(4)
  })
})
