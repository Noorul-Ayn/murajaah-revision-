/**
 * The 15-line Madinah mushaf page layout: which line each ayah begins and
 * ends on, for the two prints in common use. Huffaz often remember an ayah by
 * where it sits on the page, so this is what the "where on the page" quiz
 * asks about. Built by scripts/build-layout.mjs from the Quran.com API.
 */

import type { Quran } from './quran'

/**
 * The King Fahd Complex prints: 1405 AH, and 1421 AH (with later prints that
 * follow it). They differ in where some pages and lines begin; page 121, for
 * example, starts at Al-Mā'idah 77 in the first and 78 in the second.
 */
export type Print = '1405' | '1421'
export const PRINTS: readonly Print[] = ['1405', '1421']

interface PrintData {
  /** Global index of the first ayah of each page. */
  pages: number[]
  /** One letter per ayah: the line it begins on (A = 1 … O = 15). */
  first: string
  /** One letter per ayah: the line it ends on. */
  last: string
}

export interface LayoutData {
  prints: Record<Print, PrintData>
}

let loading: Promise<LayoutData> | null = null

/** Loads the layout once (small, cached offline with the rest of the app). */
export function loadLayout(): Promise<LayoutData> {
  loading ??= import('../data/layout.json').then((m) => m.default as unknown as LayoutData)
  loading.catch(() => (loading = null))
  return loading
}

/** The first two pages hold eight lines inside a decorated frame; all others fifteen. */
export function linesOnPage(page: number): number {
  return page <= 2 ? 8 : 15
}

/** An open Madinah mushaf has the odd page on the right. */
export function isRightPage(page: number): boolean {
  return page % 2 === 1
}

/** The two facing pages a page belongs to. */
export function spreadOf(page: number): { right: number; left: number } {
  const right = isRightPage(page) ? page : page - 1
  return { right, left: right + 1 }
}

/** A line counted from the start of the mushaf, so distances run across pages. */
function lineNumber({ page, line }: { page: number; line: number }): number {
  const before = page <= 2 ? (page - 1) * 8 : 16 + (page - 3) * 15
  return before + line
}

export type LineKind = 'text' | 'header' | 'basmala'

/** A line on a page, as tapped in the page quiz. */
export interface Spot {
  page: number
  line: number
}

/** Lines apart a tap may be and still count as Almost. */
export const NEAR_LINES = 2

/** Lines a surah's opening takes before its first ayah: the title, and the basmala unless it is ayah 1 or absent. */
function openingLines(surah: number): number {
  return surah === 1 || surah === 9 ? 1 : 2
}

export class PageLayout {
  readonly print: Print
  /** The Qur'an with this print's page breaks. */
  readonly quran: Quran
  private readonly data: PrintData

  constructor(layout: LayoutData, print: Print, quran: Quran) {
    this.print = print
    this.data = layout.prints[print]
    this.quran = quran.withPages(this.data.pages)
  }

  /** The line (1–15) the ayah begins on. */
  firstLine(index: number): number {
    return this.data.first.charCodeAt(index) - 64
  }

  /** The line the ayah ends on (same page: no ayah crosses a page in either print). */
  lastLine(index: number): number {
    return this.data.last.charCodeAt(index) - 64
  }

  /**
   * How a tap on the open mushaf answers "where does this ayah begin":
   * its first line is Perfect; elsewhere on the ayah, or within two lines in
   * reading order (across the fold too), is Almost; anything else, Not yet.
   */
  grade(index: number, spot: Spot): 'perfect' | 'hesitated' | 'missed' {
    const page = this.quran.pageOf(index)
    const start = this.firstLine(index)
    if (spot.page === page && spot.line === start) return 'perfect'
    if (spot.page === page && spot.line > start && spot.line <= this.lastLine(index)) return 'hesitated'
    return Math.abs(lineNumber(spot) - lineNumber({ page, line: start })) <= NEAR_LINES ? 'hesitated' : 'missed'
  }

  /**
   * What each line of a page holds (index 0 is line 1): ayah text, a surah
   * title, or a basmala. A surah's title sometimes sits on the last line of
   * the page before its first ayah.
   */
  shape(page: number): LineKind[] {
    const out: LineKind[] = Array.from({ length: linesOnPage(page) }, () => 'text')
    const mark = (p: number, line: number, kind: LineKind) => {
      if (p === page && line >= 1 && line <= out.length) out[line - 1] = kind
    }
    for (const p of [page, page + 1]) {
      if (p > 604) continue
      const [first, last] = this.quran.pageRange(p)
      for (let i = first; i <= last; i++) {
        const s = this.quran.surahOf(i)
        if (s.start !== i) continue
        const line = this.firstLine(i)
        const lines = openingLines(s.n)
        // The opening's lines, counted back from the first ayah, possibly onto the page before.
        for (let k = 1; k <= lines; k++) {
          const at = line - k
          const kind: LineKind = k === lines ? 'header' : 'basmala'
          if (at >= 1) mark(p, at, kind)
          else mark(p - 1, linesOnPage(p - 1) + at, kind)
        }
      }
    }
    return out
  }
}
