import { QUARTER_COUNT, type Quran } from './quran'
import { wordCount } from './text'

/**
 * Quiz modes.
 * - open: given a rub' (e.g. "½ Hizb 27"), recite how it begins.
 * - name: given the opening words of a rub', say which rub' it is.
 * - link: given the last ayah of a rub', recite the opening of the next one.
 * - ayah: given the first words of an ayah, recite the rest.
 */
export type Mode = 'open' | 'name' | 'link' | 'ayah'
export const MODES: readonly Mode[] = ['ayah', 'open', 'name', 'link']

/**
 * Stable identifiers for everything that gets its own memory strength:
 * `open:107`, `name:107`, `link:107` (quarter numbers) and `ayah:2:255`.
 */
export type ItemId = string

export type ParsedItem =
  { mode: 'open' | 'name' | 'link'; quarter: number } | { mode: 'ayah'; surah: number; ayah: number }

/** Ayahs shorter than this are too short to quiz from their first words. */
export const MIN_AYAH_WORDS = 3

export function quarterItem(mode: 'open' | 'name' | 'link', q: number): ItemId {
  return `${mode}:${q}`
}

export function ayahItem(quran: Quran, index: number): ItemId {
  const { surah, ayah } = quran.keyOf(index)
  return `ayah:${surah}:${ayah}`
}

export function parseItem(id: ItemId): ParsedItem | null {
  const parts = id.split(':')
  const num = (s: string | undefined) => (s !== undefined && /^\d{1,3}$/.test(s) ? Number(s) : NaN)
  if (parts[0] === 'ayah' && parts.length === 3) {
    const surah = num(parts[1])
    const ayah = num(parts[2])
    if (surah >= 1 && surah <= 114 && ayah >= 1) return { mode: 'ayah', surah, ayah }
    return null
  }
  if ((parts[0] === 'open' || parts[0] === 'name' || parts[0] === 'link') && parts.length === 2) {
    const quarter = num(parts[1])
    if (quarter >= 1 && quarter <= QUARTER_COUNT) return { mode: parts[0], quarter }
  }
  return null
}

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && value.length <= 16 && parseItem(value) !== null
}

/** The quarter an item belongs to, for the progress map. */
export function itemQuarter(quran: Quran, id: ItemId): number | null {
  const p = parseItem(id)
  if (!p) return null
  if (p.mode !== 'ayah') return p.quarter
  try {
    return quran.quarterOf(quran.indexOf(p.surah, p.ayah))
  } catch {
    return null
  }
}

/** Global ayah index for an `ayah:` item. */
export function itemAyahIndex(quran: Quran, id: ItemId): number | null {
  const p = parseItem(id)
  if (!p || p.mode !== 'ayah') return null
  try {
    return quran.indexOf(p.surah, p.ayah)
  } catch {
    return null
  }
}

/** Every item of a mode that falls inside the scope mask, in mushaf order. */
export function itemsInScope(mode: Mode, mask: Uint8Array, quran: Quran): ItemId[] {
  const out: ItemId[] = []
  if (mode === 'ayah') {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] && wordCount(quran.text(i)) >= MIN_AYAH_WORDS) out.push(ayahItem(quran, i))
    }
    return out
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
