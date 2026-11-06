import { itemQuarter, parseItem, type ItemId, type Mode } from './items'
import { QUARTER_COUNT, type Quran } from './quran'
import { strength, strengthOf, type ItemState, type Review, type Strength } from './srs'

export interface QuarterProgress {
  quarter: number
  /** Ayahs of this quarter inside the memorized scope. */
  memorizedAyahs: number
  /** Items reviewed at least once, for the selected mode filter. */
  tested: number
  /** Mean strength (0–1, see srs.strength) of tested items, or null if none tested. */
  recall: number | null
  strength: Strength | 'out'
}

/** Strength of every quarter, for the progress map. */
export function quarterProgress(
  quran: Quran,
  memorizedMask: Uint8Array,
  states: ReadonlyMap<ItemId, ItemState>,
  filter: Mode | 'all',
  now: number,
): QuarterProgress[] {
  const sums = new Float64Array(QUARTER_COUNT + 1)
  const counts = new Uint32Array(QUARTER_COUNT + 1)
  for (const [id, state] of states) {
    if (filter !== 'all' && parseItem(id)?.mode !== filter) continue
    const q = itemQuarter(quran, id)
    if (q === null) continue
    sums[q] = sums[q]! + strength(state, now)
    counts[q] = counts[q]! + 1
  }
  const out: QuarterProgress[] = []
  for (let q = 1; q <= QUARTER_COUNT; q++) {
    const [first, last] = quran.quarterRange(q)
    let memorizedAyahs = 0
    for (let i = first; i <= last; i++) memorizedAyahs += memorizedMask[i]!
    const tested = counts[q]!
    const r = tested ? sums[q]! / tested : null
    out.push({
      quarter: q,
      memorizedAyahs,
      tested,
      recall: r,
      strength: r !== null ? strengthOf(r) : memorizedAyahs > 0 ? 'none' : 'out',
    })
  }
  return out
}

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Answers today and the run of consecutive days (ending today or yesterday) with answers. */
export function activity(reviews: readonly Pick<Review, 'at'>[], now: number): { today: number; streak: number } {
  const days = new Set<string>()
  let today = 0
  const todayKey = dayKey(now)
  for (const r of reviews) {
    const k = dayKey(r.at)
    days.add(k)
    if (k === todayKey) today++
  }
  const cursor = new Date(now)
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(dayKey(cursor.getTime()))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return { today, streak }
}
