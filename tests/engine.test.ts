import { describe, expect, it } from 'vitest'
import { quran } from './helpers'
import { countAyahs, isScopePart, maskRanges, scopeMask, togglePart } from '../src/lib/scope'
import { itemQuarter, itemsInScope, parseItem, isItemId } from '../src/lib/items'
import { isDue, recall, replay, strength, strengthOf, type Review } from '../src/lib/srs'
import { buildQuestion, openingAyahs, pickItems, quarterChoices, seededRng } from '../src/lib/session'
import { defaultSettings, sanitizeSettings } from '../src/lib/settings'
import { activity, quarterProgress } from '../src/lib/progress'

const DAY = 86_400_000
let n = 0
const review = (itemId: string, grade: Review['grade'], at: number): Review => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  itemId,
  grade,
  mode: parseItem(itemId)!.mode,
  at,
  synced: 0,
})

describe('scope', () => {
  it('turns parts into ayah masks', () => {
    expect(countAyahs(scopeMask([{ kind: 'juz', n: 30 }], quran))).toBe(564)
    expect(countAyahs(scopeMask([{ kind: 'surah', n: 2 }], quran))).toBe(286)
    expect(countAyahs(scopeMask([{ kind: 'hizb', n: 1 }], quran))).toBe(81)
    expect(countAyahs(scopeMask([{ kind: 'range', from: 10, to: 5 }], quran))).toBe(6)
  })

  it('merges overlapping parts', () => {
    const mask = scopeMask(
      [
        { kind: 'surah', n: 1 },
        { kind: 'range', from: 0, to: 9 },
      ],
      quran,
    )
    expect(maskRanges(mask)).toEqual([[0, 9]])
  })

  it('toggles parts and validates stored ones', () => {
    const s = togglePart([], { kind: 'juz', n: 30 })
    expect(s).toEqual([{ kind: 'juz', n: 30 }])
    expect(togglePart(s, { kind: 'juz', n: 30 })).toEqual([])
    expect(isScopePart({ kind: 'juz', n: 31 })).toBe(false)
    expect(isScopePart({ kind: 'range', from: 0, to: 6236 })).toBe(false)
    expect(isScopePart({ kind: 'surah', n: 114 })).toBe(true)
  })
})

describe('items', () => {
  const juz30 = scopeMask([{ kind: 'juz', n: 30 }], quran)

  it('lists the questions inside a scope', () => {
    expect(itemsInScope('open', juz30, quran)).toHaveLength(8)
    expect(itemsInScope('name', juz30, quran)[0]).toBe('name:233')
    // The first quarter of Juz 30 links from Juz 29, which isn't memorized.
    expect(itemsInScope('link', juz30, quran)).toHaveLength(7)
    const ayahs = itemsInScope('ayah', juz30, quran)
    expect(ayahs.length).toBeGreaterThan(400)
    expect(ayahs.length).toBeLessThan(564) // very short ayahs are skipped
  })

  it('parses and rejects item ids', () => {
    expect(parseItem('ayah:2:255')).toEqual({ mode: 'ayah', surah: 2, ayah: 255 })
    expect(parseItem('open:241')).toBeNull()
    expect(isItemId('link:0')).toBe(false)
    expect(isItemId('name:12')).toBe(true)
    expect(itemQuarter(quran, 'ayah:67:1')).toBe(225)
  })
})

describe('spaced repetition', () => {
  const t0 = Date.UTC(2026, 0, 1)

  it('replays the same reviews to the same state in any order', () => {
    const rs = [
      review('ayah:1:2', 'perfect', t0),
      review('ayah:1:2', 'missed', t0 + DAY),
      review('ayah:1:2', 'perfect', t0 + 3 * DAY),
    ]
    const a = replay('ayah:1:2', rs)
    const b = replay('ayah:1:2', [...rs].reverse())
    expect(a).toEqual(b)
    expect(a!.reviewCount).toBe(3)
    expect(a!.lastGrade).toBe('perfect')
    expect(a!.lastAt).toBe(t0 + 3 * DAY)
  })

  it('schedules perfect answers further out than missed ones', () => {
    const good = replay(
      'x',
      [review('ayah:1:2', 'perfect', t0)].map((r) => ({ ...r, itemId: 'x' })),
    )!
    const bad = replay(
      'y',
      [review('ayah:1:3', 'missed', t0)].map((r) => ({ ...r, itemId: 'y' })),
    )!
    expect(good.card.due).toBeGreaterThan(bad.card.due)
    expect(isDue(bad, t0 + 60 * 60 * 1000)).toBe(true)
  })

  it('reports recall that fades over time', () => {
    const s = replay('ayah:1:2', [review('ayah:1:2', 'perfect', t0), review('ayah:1:2', 'perfect', t0 + 2 * DAY)])!
    const soon = recall(s, t0 + 3 * DAY)
    const later = recall(s, t0 + 60 * DAY)
    expect(soon).toBeGreaterThan(later)
    expect(strengthOf(null)).toBe('none')
  })

  it('shows a just-missed item as weak and a well-known one as strong', () => {
    const missed = replay('ayah:1:2', [review('ayah:1:2', 'missed', t0)])!
    const hesitated = replay('ayah:1:3', [review('ayah:1:3', 'hesitated', t0)])!
    let known = replay('ayah:1:4', [review('ayah:1:4', 'perfect', t0)])!
    const reviews = [review('ayah:1:4', 'perfect', t0)]
    for (let d = 3; d < 120; d *= 2.5) {
      reviews.push(review('ayah:1:4', 'perfect', t0 + d * DAY))
      known = replay('ayah:1:4', reviews)!
    }
    const now = known.lastAt + 60_000
    expect(strengthOf(strength(missed, t0 + 60_000))).toBe('weak')
    expect(strength(hesitated, t0 + 60_000)).toBeGreaterThan(strength(missed, t0 + 60_000))
    expect(strengthOf(strength(known, now))).toBe('strong')
  })
})

describe('session building', () => {
  const t0 = Date.UTC(2026, 0, 1)
  const items = ['open:1', 'open:2', 'open:3', 'open:4', 'open:5', 'open:6']

  it('asks due items first, then untested ones, then the rest', () => {
    const states = new Map([
      ['open:1', replay('open:1', [review('open:1', 'missed', t0)])!], // due again after a minute
      ['open:2', replay('open:2', [review('open:2', 'perfect', t0)])!], // due after ten minutes
    ])
    const picked = pickItems(items, states, 'smart', 5, t0 + 5 * 60 * 1000, seededRng(1))
    expect(picked).toHaveLength(5)
    expect(picked).toContain('open:1')
    expect(picked).not.toContain('open:2') // four untested items fill the rest first
  })

  it('continues in mushaf order after the last item reviewed', () => {
    const states = new Map([['open:3', replay('open:3', [review('open:3', 'perfect', t0)])!]])
    expect(pickItems(items, states, 'mushaf', 4, t0, seededRng(1))).toEqual(['open:4', 'open:5', 'open:6', 'open:1'])
  })

  it('never asks more than there is', () => {
    expect(pickItems(items, new Map(), 'random', 50, t0, seededRng(2))).toHaveLength(6)
  })

  it('offers four distinct rub’ choices including the right one', () => {
    for (let q = 1; q <= 240; q += 17) {
      const c = quarterChoices(q, seededRng(q))
      expect(c).toHaveLength(4)
      expect(new Set(c).size).toBe(4)
      expect(c).toContain(q)
      expect(c.every((x) => x >= 1 && x <= 240)).toBe(true)
    }
  })

  it('prefers memorized quarters as wrong choices', () => {
    const inScope = new Set([100, 110, 120, 130])
    const c = quarterChoices(100, seededRng(3), inScope)
    expect(c.sort()).toEqual([100, 110, 120, 130])
  })

  it('reveals enough of a quarter’s opening to check against', () => {
    const q = quran.quarterOf(quran.indexOf(93, 1)) // Ad-Duha starts with very short ayahs
    expect(openingAyahs(quran, q).length).toBeGreaterThan(1)
    const link = buildQuestion(quran, `link:${q}`, { extraAyahs: 0 }, seededRng(1))
    expect(link.mode === 'link' && link.previous).toBe(quran.quarterStart(q) - 1)
  })

  it('stops extra ayahs at the end of the surah', () => {
    const last = quran.indexOf(112, 4)
    const q = buildQuestion(quran, 'ayah:112:4', { extraAyahs: 3 }, seededRng(1))
    expect(q.mode === 'ayah' && q.reveal).toEqual([last])
  })
})

describe('progress', () => {
  it('colours only memorized quarters', () => {
    const mask = scopeMask([{ kind: 'juz', n: 30 }], quran)
    const p = quarterProgress(quran, mask, new Map(), 'all', Date.now())
    expect(p.filter((x) => x.strength === 'none')).toHaveLength(8)
    expect(p.filter((x) => x.strength === 'out')).toHaveLength(232)
  })

  it('counts a streak of consecutive days', () => {
    const now = new Date(2026, 10, 6, 12).getTime()
    const at = (daysAgo: number) => ({ at: now - daysAgo * DAY })
    expect(activity([at(0), at(0), at(1), at(2), at(4)], now)).toEqual({ today: 2, streak: 3 })
    expect(activity([at(1), at(2)], now)).toEqual({ today: 0, streak: 2 })
    expect(activity([], now)).toEqual({ today: 0, streak: 0 })
  })
})

describe('settings', () => {
  it('repairs bad values from storage or a backup file', () => {
    const s = sanitizeSettings({
      lang: 'fr',
      promptWords: 99,
      memorized: [
        { kind: 'juz', n: 30 },
        { kind: 'juz', n: 99 },
      ],
    })
    expect(s.lang).toBe(defaultSettings().lang)
    expect(s.promptWords).toBe(6)
    expect(s.memorized).toEqual([{ kind: 'juz', n: 30 }])
  })
})
