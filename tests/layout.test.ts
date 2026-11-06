import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import layoutData from '../src/data/layout.json'
import { PageLayout, isRightPage, linesOnPage, spreadOf, type LayoutData } from '../src/lib/layout'
import { itemsInScope } from '../src/lib/items'
import { scopeMask } from '../src/lib/scope'

const data = layoutData as unknown as LayoutData
const at = (s: number, a: number) => quran.indexOf(s, a)
const v1405 = new PageLayout(data, '1405', quran)
const v1421 = new PageLayout(data, '1421', quran)

describe('mushaf prints', () => {
  it('the 1405 print has the same pages as the rest of the app', () => {
    expect(v1405.quran).toBe(quran)
    for (let p = 1; p <= 604; p++) expect(v1405.quran.pageRange(p)).toEqual(quran.pageRange(p))
  })

  it('page 121 starts at Al-Maidah 77 in the 1405 print and 78 in the 1421 print', () => {
    expect(v1405.quran.pageRange(121)[0]).toBe(at(5, 77))
    expect(v1421.quran.pageRange(121)[0]).toBe(at(5, 78))
    expect(v1421.quran.pageOf(at(5, 77))).toBe(120)
  })

  it('every ayah sits within its page’s lines', () => {
    for (const l of [v1405, v1421]) {
      for (let i = 0; i < 6236; i++) {
        const lines = linesOnPage(l.quran.pageOf(i))
        expect(l.firstLine(i)).toBeGreaterThanOrEqual(1)
        expect(l.lastLine(i)).toBeGreaterThanOrEqual(l.firstLine(i))
        expect(l.lastLine(i)).toBeLessThanOrEqual(lines)
      }
    }
  })

  it('ayahs follow each other down the page', () => {
    for (const l of [v1405, v1421]) {
      for (let i = 1; i < 6236; i++) {
        if (l.quran.pageOf(i) !== l.quran.pageOf(i - 1)) continue
        expect(l.firstLine(i)).toBeGreaterThanOrEqual(l.lastLine(i - 1))
      }
    }
  })
})

describe('page shapes', () => {
  it('the first two pages have eight lines with a title, and a basmala before Al-Baqarah', () => {
    expect(v1405.shape(1)).toEqual(['header', 'text', 'text', 'text', 'text', 'text', 'text', 'text'])
    expect(v1405.shape(2)).toEqual(['header', 'basmala', 'text', 'text', 'text', 'text', 'text', 'text'])
  })

  it('a surah title can sit on the last line of the page before', () => {
    // An-Nisa's title closes page 76; its basmala opens page 77.
    expect(v1405.shape(76)[14]).toBe('header')
    expect(v1405.shape(77)[0]).toBe('basmala')
    expect(v1405.firstLine(at(4, 1))).toBe(2)
  })

  it('At-Tawbah has a title and no basmala', () => {
    const page = v1405.quran.pageOf(at(9, 1))
    const line = v1405.firstLine(at(9, 1))
    const shape = v1405.shape(page)
    expect(shape[line - 2]).toBe('header')
    expect(shape.filter((k) => k === 'basmala')).toHaveLength(0)
  })

  it('the last page has three titles and three basmalas', () => {
    for (const l of [v1405, v1421]) {
      const shape = l.shape(604)
      expect(shape.filter((k) => k === 'header')).toHaveLength(3)
      expect(shape.filter((k) => k === 'basmala')).toHaveLength(3)
      expect(shape).toHaveLength(15)
    }
  })

  it('every text line holds an ayah and every ayah line is text', () => {
    for (const l of [v1405, v1421]) {
      for (let p = 1; p <= 604; p++) {
        const shape = l.shape(p)
        const covered = new Set<number>()
        const [first, last] = l.quran.pageRange(p)
        for (let i = first; i <= last; i++) for (let k = l.firstLine(i); k <= l.lastLine(i); k++) covered.add(k)
        shape.forEach((kind, k) => expect(kind === 'text').toBe(covered.has(k + 1)))
      }
    }
  })
})

describe('the open book', () => {
  it('odd pages are on the right', () => {
    expect(isRightPage(1)).toBe(true)
    expect(isRightPage(2)).toBe(false)
    expect(spreadOf(577)).toEqual({ right: 577, left: 578 })
    expect(spreadOf(578)).toEqual({ right: 577, left: 578 })
  })
})

describe('page quiz items', () => {
  it('leave out refrains repeated word for word in the same surah', () => {
    const rahman = itemsInScope('place', scopeMask([{ kind: 'surah', n: 55 }], quran), quran)
    expect(rahman).not.toContain('place:55:13')
    expect(rahman).toContain('place:55:1')
    const baqarah = itemsInScope('place', scopeMask([{ kind: 'surah', n: 2 }], quran), quran)
    // 2:47 and 2:122, 2:134 and 2:141 are word for word the same.
    expect(baqarah).toHaveLength(282)
    for (const a of [47, 122, 134, 141]) expect(baqarah).not.toContain(`place:2:${a}`)
  })
})

describe('grading a tap', () => {
  const i = at(2, 255)
  const page = v1405.quran.pageOf(i)
  const line = v1405.firstLine(i)

  it('the first line is perfect, the ayah’s other lines or two lines off are almost', () => {
    expect(v1405.grade(i, { page, line })).toBe('perfect')
    if (v1405.lastLine(i) > line) expect(v1405.grade(i, { page, line: v1405.lastLine(i) })).toBe('hesitated')
    expect(v1405.grade(i, { page, line: line - 2 })).toBe('hesitated')
    expect(v1405.grade(i, { page, line: line - 3 })).toBe('missed')
    expect(v1405.grade(i, { page: page + 1, line })).toBe('missed')
  })

  it('counts across the fold: the last line of the right page is next to the first of the left', () => {
    const first = v1405.quran.pageRange(4)[0] // page 4 starts at line 1, facing page 3
    expect(v1405.firstLine(first)).toBe(1)
    expect(v1405.grade(first, { page: 3, line: 15 })).toBe('hesitated')
    expect(v1405.grade(first, { page: 3, line: 12 })).toBe('missed')
    // From the eight-line page 2 to page 3.
    const third = v1405.quran.pageRange(3)[0]
    expect(v1405.grade(third, { page: 2, line: 8 })).toBe('hesitated')
  })
})
