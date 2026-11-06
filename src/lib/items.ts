import { QUARTER_COUNT, type Quran } from './quran'
import { wordCount } from './text'

/**
 * Quiz modes.
 * - ayah: given the first words of an ayah, recite the rest.
 * - open: given a rub' (e.g. "½ Hizb 27"), recite how it begins.
 * - name: given the opening words of a rub', say which rub' it is.
 * - link: given the last ayah of a rub', recite the opening of the next one.
 * - place: given an ayah, tap where it begins on the open mushaf.
 * - meaning: given the English meaning of an ayah, recite it.
 * - pair: two similar ayahs the reciter mixed up; recite the right one.
 */
export type Mode = 'ayah' | 'open' | 'name' | 'link' | 'place' | 'meaning' | 'pair'
export const MODES: readonly Mode[] = ['ayah', 'open', 'name', 'link', 'place', 'meaning', 'pair']

/** Modes asked about a single ayah, with ids like `ayah:2:255`. */
export type AyahMode = 'ayah' | 'place' | 'meaning'
const AYAH_MODES: readonly string[] = ['ayah', 'place', 'meaning']
type QuarterMode = 'open' | 'name' | 'link'
const QUARTER_MODES: readonly string[] = ['open', 'name', 'link']

/**
 * Stable identifiers for everything that gets its own memory strength:
 * `open:107`, `name:107`, `link:107` (quarter numbers), `ayah:2:255`,
 * `place:2:255`, `meaning:2:255`, and `pair:2:58:7:161` (the ayah to recite,
 * then the similar ayah it was mixed up with).
 */
export type ItemId = string

export interface VerseRef {
  surah: number
  ayah: number
}

export type ParsedItem =
  | { mode: QuarterMode; quarter: number }
  | ({ mode: AyahMode } & VerseRef)
  | ({ mode: 'pair'; other: VerseRef } & VerseRef)

/** Ayahs shorter than this are too short to quiz from their first words. */
export const MIN_AYAH_WORDS = 3

export function quarterItem(mode: QuarterMode, q: number): ItemId {
  return `${mode}:${q}`
}

export function ayahItem(quran: Quran, index: number, mode: AyahMode = 'ayah'): ItemId {
  const { surah, ayah } = quran.keyOf(index)
  return `${mode}:${surah}:${ayah}`
}

/** The pair "recite `index`, not `other`". */
export function pairItem(quran: Quran, index: number, other: number): ItemId {
  const a = quran.keyOf(index)
  const b = quran.keyOf(other)
  return `pair:${a.surah}:${a.ayah}:${b.surah}:${b.ayah}`
}

export function parseItem(id: ItemId): ParsedItem | null {
  const parts = id.split(':')
  const num = (s: string | undefined) => (s !== undefined && /^\d{1,3}$/.test(s) ? Number(s) : NaN)
  const ref = (s: string | undefined, a: string | undefined): VerseRef | null => {
    const surah = num(s)
    const ayah = num(a)
    return surah >= 1 && surah <= 114 && ayah >= 1 ? { surah, ayah } : null
  }
  const mode = parts[0]!
  if (AYAH_MODES.includes(mode) && parts.length === 3) {
    const r = ref(parts[1], parts[2])
    return r && { mode: mode as AyahMode, ...r }
  }
  if (mode === 'pair' && parts.length === 5) {
    const r = ref(parts[1], parts[2])
    const other = ref(parts[3], parts[4])
    if (!r || !other || (r.surah === other.surah && r.ayah === other.ayah)) return null
    return { mode: 'pair', ...r, other }
  }
  if (QUARTER_MODES.includes(mode) && parts.length === 2) {
    const quarter = num(parts[1])
    if (quarter >= 1 && quarter <= QUARTER_COUNT) return { mode: mode as QuarterMode, quarter }
  }
  return null
}

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && value.length <= 24 && parseItem(value) !== null
}

/** Global index of an ayah reference, or null if it doesn't exist. */
export function refIndex(quran: Quran, r: VerseRef): number | null {
  try {
    return quran.indexOf(r.surah, r.ayah)
  } catch {
    return null
  }
}

/** The quarter an item belongs to, for the progress map. */
export function itemQuarter(quran: Quran, id: ItemId): number | null {
  const p = parseItem(id)
  if (!p) return null
  if ('quarter' in p) return p.quarter
  const index = refIndex(quran, p)
  return index === null ? null : quran.quarterOf(index)
}

/** Global index of the ayah an item asks about (the one to recite, for a pair). */
export function itemAyahIndex(quran: Quran, id: ItemId): number | null {
  const p = parseItem(id)
  if (!p || 'quarter' in p) return null
  return refIndex(quran, p)
}

/** For a pair, the similar ayah it was mixed up with. */
export function pairOther(quran: Quran, id: ItemId): number | null {
  const p = parseItem(id)
  return p?.mode === 'pair' ? refIndex(quran, p.other) : null
}

/** Ayahs whose exact text comes again in the same surah (refrains), which can't be placed on a page by their text. */
const repeated = new WeakMap<Quran, Set<number>>()
function repeatedInSurah(quran: Quran): Set<number> {
  let set = repeated.get(quran)
  if (!set) {
    set = new Set()
    for (const s of quran.surahs) {
      const seen = new Map<string, number>()
      for (let i = s.start; i < s.start + s.ayahs; i++) {
        const prev = seen.get(quran.text(i))
        if (prev !== undefined) {
          set.add(prev)
          set.add(i)
        } else seen.set(quran.text(i), i)
      }
    }
    repeated.set(quran, set)
  }
  return set
}

/**
 * Every item of a mode that falls inside the scope mask, in mushaf order.
 * Pairs aren't derived from the scope: they come from `known`, the items the
 * user has already been asked about (a pair is created when a slip is heard).
 */
export function itemsInScope(mode: Mode, mask: Uint8Array, quran: Quran, known: Iterable<ItemId> = []): ItemId[] {
  const out: ItemId[] = []
  if (mode === 'ayah' || mode === 'meaning') {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] && wordCount(quran.text(i)) >= MIN_AYAH_WORDS) out.push(ayahItem(quran, i, mode))
    }
    return out
  }
  if (mode === 'place') {
    const skip = repeatedInSurah(quran)
    for (let i = 0; i < mask.length; i++) if (mask[i] && !skip.has(i)) out.push(ayahItem(quran, i, 'place'))
    return out
  }
  if (mode === 'pair') {
    const found: [number, ItemId][] = []
    for (const id of known) {
      const index = parseItem(id)?.mode === 'pair' ? itemAyahIndex(quran, id) : null
      if (index !== null && pairOther(quran, id) !== null && mask[index]) found.push([index, id])
    }
    return found.sort((a, b) => a[0] - b[0]).map(([, id]) => id)
  }
  for (let q = 1; q <= QUARTER_COUNT; q++) {
    const start = quran.quarterStart(q)
    if (!mask[start]) continue
    // Linking needs the end of the previous quarter to be memorized too.
    if (mode === 'link' && (q === 1 || !mask[start - 1])) continue
    out.push(quarterItem(mode, q))
  }
  return out
}
