import { isDue, recall, type ItemState } from './srs'
import { itemAyahIndex, parseItem, type ItemId, type Mode } from './items'
import { QUARTER_COUNT, type Quran } from './quran'
import { wordCount } from './text'

export type Order = 'smart' | 'random' | 'mushaf'
export const ORDERS: readonly Order[] = ['smart', 'random', 'mushaf']

export type Rng = () => number

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Small seeded PRNG (mulberry32) for reproducible tests. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Picks the questions for a session.
 *
 * smart: items that are due come first (weakest first), then items never
 *   tested, then the rest from weakest to strongest; the picked set is then
 *   shuffled so the session doesn't run in mushaf order.
 * random: a uniform random sample of the scope.
 * mushaf: in mushaf order, continuing after the last item reviewed in this
 *   scope and wrapping around at the end.
 */
export function pickItems(
  items: readonly ItemId[],
  states: ReadonlyMap<ItemId, ItemState>,
  order: Order,
  size: number,
  now: number,
  rng: Rng,
): ItemId[] {
  const n = Math.min(size, items.length)
  if (order === 'random') return shuffle(items, rng).slice(0, n)

  if (order === 'mushaf') {
    let lastPos = -1
    let lastAt = -Infinity
    items.forEach((id, i) => {
      const s = states.get(id)
      if (s && s.lastAt > lastAt) {
        lastAt = s.lastAt
        lastPos = i
      }
    })
    const start = lastPos + 1
    return Array.from({ length: n }, (_, k) => items[(start + k) % items.length]!)
  }

  const due: [ItemId, number][] = []
  const fresh: ItemId[] = []
  const rest: [ItemId, number][] = []
  for (const id of items) {
    const s = states.get(id)
    if (!s) fresh.push(id)
    else if (isDue(s, now)) due.push([id, recall(s, now)])
    else rest.push([id, recall(s, now)])
  }
  const byWeakest = (a: [ItemId, number], b: [ItemId, number]) => a[1] - b[1]
  const picked = [
    ...shuffle(due, rng)
      .sort(byWeakest)
      .map(([id]) => id),
    ...shuffle(fresh, rng),
    ...shuffle(rest, rng)
      .sort(byWeakest)
      .map(([id]) => id),
  ].slice(0, n)
  return shuffle(picked, rng)
}

/** Everything the quiz screen needs to show one question. */
export type Question =
  | { mode: 'open'; itemId: ItemId; quarter: number; reveal: number[] }
  | { mode: 'link'; itemId: ItemId; quarter: number; previous: number; reveal: number[] }
  | { mode: 'name'; itemId: ItemId; quarter: number; choices: number[] }
  | { mode: 'ayah'; itemId: ItemId; index: number; reveal: number[] }

/**
 * The ayahs to show when revealing the opening of a quarter: the first ayah,
 * plus following ayahs until at least `minWords` words are shown (short
 * opening ayahs on their own are hard to check yourself against).
 */
export function openingAyahs(quran: Quran, quarter: number, minWords = 8): number[] {
  const [first, last] = quran.quarterRange(quarter)
  const out = [first]
  let words = wordCount(quran.text(first))
  while (words < minWords && out[out.length - 1]! < last) {
    const next = out[out.length - 1]! + 1
    out.push(next)
    words += wordCount(quran.text(next))
  }
  return out
}

/**
 * Three wrong answers for "name the rub'", chosen from nearby quarters so the
 * question tests real knowledge rather than a rough sense of position.
 */
export function quarterChoices(
  quarter: number,
  rng: Rng,
  inScope: ReadonlySet<number> = new Set(),
  count = 4,
): number[] {
  const byDistance: number[] = []
  for (let d = 1; d < QUARTER_COUNT; d++) {
    if (quarter - d >= 1) byDistance.push(quarter - d)
    if (quarter + d <= QUARTER_COUNT) byDistance.push(quarter + d)
  }
  // Prefer nearby quarters the user has memorized: a choice from outside
  // their memorization is too easy to rule out.
  const near = (list: number[]) => shuffle(list.slice(0, 10), rng)
  const wrong = [
    ...near(byDistance.filter((q) => inScope.has(q))),
    ...near(byDistance.filter((q) => !inScope.has(q))),
  ].slice(0, count - 1)
  return shuffle([quarter, ...wrong], rng)
}

export function buildQuestion(
  quran: Quran,
  itemId: ItemId,
  opts: { extraAyahs: number; quartersInScope?: ReadonlySet<number> },
  rng: Rng,
): Question {
  const p = parseItem(itemId)
  if (!p) throw new Error(`bad item id ${itemId}`)
  switch (p.mode) {
    case 'open':
      return { mode: 'open', itemId, quarter: p.quarter, reveal: openingAyahs(quran, p.quarter) }
    case 'link':
      return {
        mode: 'link',
        itemId,
        quarter: p.quarter,
        previous: quran.quarterStart(p.quarter) - 1,
        reveal: openingAyahs(quran, p.quarter),
      }
    case 'name':
      return {
        mode: 'name',
        itemId,
        quarter: p.quarter,
        choices: quarterChoices(p.quarter, rng, opts.quartersInScope),
      }
    case 'ayah': {
      const index = itemAyahIndex(quran, itemId)!
      const surahEnd = quran.surahRange(quran.surahOf(index).n)[1]
      const reveal = [index]
      for (let k = 1; k <= opts.extraAyahs && index + k <= surahEnd; k++) reveal.push(index + k)
      return { mode: 'ayah', itemId, index, reveal }
    }
  }
}

export const MODE_OF = (itemId: ItemId): Mode => parseItem(itemId)?.mode ?? 'ayah'
