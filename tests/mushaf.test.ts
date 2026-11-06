import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import sahih from '../src/data/translations/en-sahih.json'
import pickthall from '../src/data/translations/en-pickthall.json'
import { PAGE_COUNT } from '../src/lib/quran'
import { TRANSLATIONS } from '../src/lib/translations'
import { foldSearch } from '../src/lib/search'

describe('mushaf pages', () => {
  it('covers every ayah exactly once across 604 pages', () => {
    let next = 0
    for (let p = 1; p <= PAGE_COUNT; p++) {
      const [a, b] = quran.pageRange(p)
      expect(a).toBe(next)
      expect(b).toBeGreaterThanOrEqual(a)
      next = b + 1
    }
    expect(next).toBe(6236)
  })

  it('opens surahs on their Madani pages', () => {
    const pageOf = (s: number) => quran.pageOf(quran.surah(s).start)
    expect(pageOf(1)).toBe(1)
    expect(pageOf(2)).toBe(2)
    expect(pageOf(3)).toBe(50)
    expect(pageOf(18)).toBe(293)
    expect(pageOf(36)).toBe(440)
    expect(pageOf(67)).toBe(562)
    expect(pageOf(114)).toBe(604)
  })
})

describe('translations', () => {
  const all = [sahih, pickthall]

  it('has one entry per ayah, matching the listed translations', () => {
    expect(all.map((t) => t.id)).toEqual(TRANSLATIONS.map((t) => t.id))
    for (const t of all) {
      expect(t.ayahs).toHaveLength(6236)
      expect(t.ayahs.every((a) => a.length > 0)).toBe(true)
      expect(t.source).toContain('tanzil.net')
    }
  })

  it('lines up with the Arabic text', () => {
    expect(sahih.ayahs[0]).toMatch(/^In the name of Allah/)
    expect(sahih.ayahs[quran.indexOf(2, 255)]).toMatch(/^Allah - there is no deity except Him/)
    expect(sahih.ayahs[quran.indexOf(112, 1)]).toMatch(/He is Allah, \[who is\] One/)
    expect(pickthall.ayahs[quran.indexOf(114, 6)]).toMatch(/jinn and of mankind/)
  })
})

describe('search', () => {
  it('ignores diacritics, alif forms and case', () => {
    expect(foldSearch('ٱلْبَقَرَة')).toBe(foldSearch('البقره'))
    expect(foldSearch('Al-Baqara')).toBe('albaqara')
    expect(foldSearch('آل عمران')).toBe(foldSearch('ال عمران'))
  })
})
