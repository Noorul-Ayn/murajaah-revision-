/**
 * The Qur'an text (Hafs, Tanzil Uthmani) and its divisions.
 *
 * Every ayah is addressed by a global index from 0 to 6235 in mushaf order.
 * Surahs, juz, rub' al-hizb quarters and pages are stored as the global index
 * of their first ayah, so lookups are binary searches over small arrays.
 */

export interface Surah {
  /** Surah number, 1–114. */
  n: number
  /** Arabic name, e.g. البقرة */
  name: string
  /** Transliterated name, e.g. Al-Baqara */
  tname: string
  /** English meaning, e.g. The Cow */
  ename: string
  type: 'meccan' | 'medinan'
  /** Number of ayahs. */
  ayahs: number
  /** Global index of the first ayah. */
  start: number
  /** Basmala shown before ayah 1, or null (Al-Fatiha, At-Tawba). */
  basmala: string | null
}

export interface QuranData {
  copyright: string
  source: {
    name: string
    version: string
    url: string
    license: string
    riwaya: 'hafs'
    corrections: string[]
  }
  surahs: Surah[]
  juz: number[]
  quarters: number[]
  pages: number[]
  sajdas: number[]
  ayahs: string[]
}

export interface VerseKey {
  surah: number
  ayah: number
}

export const AYAH_COUNT = 6236
export const QUARTER_COUNT = 240
export const HIZB_COUNT = 60
export const JUZ_COUNT = 30
export const SURAH_COUNT = 114
export const PAGE_COUNT = 604

/** Index of the last element in `starts` that is <= value. `starts` is sorted ascending. */
function floorIndex(starts: readonly number[], value: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid]! <= value) lo = mid
    else hi = mid - 1
  }
  return lo
}

export class Quran {
  readonly data: QuranData
  private readonly surahStarts: number[]

  constructor(data: QuranData) {
    this.data = data
    this.surahStarts = data.surahs.map((s) => s.start)
  }

  /** The same text with another print's page breaks (see layout.ts). */
  withPages(pages: readonly number[]): Quran {
    if (pages.length !== PAGE_COUNT) throw new RangeError(`expected ${PAGE_COUNT} page starts`)
    if (pages.every((p, i) => p === this.data.pages[i])) return this
    return new Quran({ ...this.data, pages: [...pages] })
  }

  get surahs(): readonly Surah[] {
    return this.data.surahs
  }

  text(index: number): string {
    const t = this.data.ayahs[index]
    if (t === undefined) throw new RangeError(`ayah index ${index} out of range`)
    return t
  }

  surahOf(index: number): Surah {
    return this.data.surahs[floorIndex(this.surahStarts, index)]!
  }

  surah(n: number): Surah {
    const s = this.data.surahs[n - 1]
    if (!s) throw new RangeError(`surah ${n} out of range`)
    return s
  }

  keyOf(index: number): VerseKey {
    const s = this.surahOf(index)
    return { surah: s.n, ayah: index - s.start + 1 }
  }

  indexOf(surah: number, ayah: number): number {
    const s = this.surah(surah)
    if (ayah < 1 || ayah > s.ayahs) throw new RangeError(`ayah ${surah}:${ayah} out of range`)
    return s.start + ayah - 1
  }

  /** Rub' al-hizb quarter (1–240) containing the ayah. */
  quarterOf(index: number): number {
    return floorIndex(this.data.quarters, index) + 1
  }

  /** Hizb (1–60) containing the ayah. */
  hizbOf(index: number): number {
    return Math.ceil(this.quarterOf(index) / 4)
  }

  /** Juz (1–30) containing the ayah. */
  juzOf(index: number): number {
    return floorIndex(this.data.juz, index) + 1
  }

  /** Madani mushaf page (1–604) containing the ayah. */
  pageOf(index: number): number {
    return floorIndex(this.data.pages, index) + 1
  }

  /** First ayah index of quarter q (1–240). */
  quarterStart(q: number): number {
    const v = this.data.quarters[q - 1]
    if (v === undefined) throw new RangeError(`quarter ${q} out of range`)
    return v
  }

  /** Inclusive [first, last] ayah indices of quarter q. */
  quarterRange(q: number): [number, number] {
    const first = this.quarterStart(q)
    const last = q === QUARTER_COUNT ? AYAH_COUNT - 1 : this.quarterStart(q + 1) - 1
    return [first, last]
  }

  hizbRange(h: number): [number, number] {
    return [this.quarterRange(h * 4 - 3)[0], this.quarterRange(h * 4)[1]]
  }

  juzRange(j: number): [number, number] {
    const first = this.data.juz[j - 1]
    if (first === undefined) throw new RangeError(`juz ${j} out of range`)
    const last = j === JUZ_COUNT ? AYAH_COUNT - 1 : this.data.juz[j]! - 1
    return [first, last]
  }

  surahRange(n: number): [number, number] {
    const s = this.surah(n)
    return [s.start, s.start + s.ayahs - 1]
  }

  /** Inclusive [first, last] ayah indices on Madani page p (1–604). */
  pageRange(p: number): [number, number] {
    const first = this.data.pages[p - 1]
    if (first === undefined) throw new RangeError(`page ${p} out of range`)
    const last = p === PAGE_COUNT ? AYAH_COUNT - 1 : this.data.pages[p]! - 1
    return [first, last]
  }

  isSajda(index: number): boolean {
    return this.data.sajdas.includes(index)
  }
}

/** Hizb number and position (1–4) of a quarter. */
export function quarterParts(q: number): { hizb: number; part: 1 | 2 | 3 | 4; juz: number } {
  return {
    hizb: Math.ceil(q / 4),
    part: (((q - 1) % 4) + 1) as 1 | 2 | 3 | 4,
    juz: Math.ceil(q / 8),
  }
}

let loading: Promise<Quran> | null = null

/** Loads the Qur'an data once (a separate chunk, cached offline by the service worker). */
export function loadQuran(): Promise<Quran> {
  loading ??= import('../data/quran-hafs.json').then((m) => new Quran((m as { default: unknown }).default as QuranData))
  return loading
}
