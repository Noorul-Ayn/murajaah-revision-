/**
 * Following a recitation word by word.
 *
 * Speech recognition writes modern standard spelling (الصلاة، الكتاب), while
 * the mushaf is in Uthmani script (ٱلصَّلَوٰةَ، ٱلْكِتَـٰبُ). So recitation is
 * matched against Tanzil's plain-spelling text, and each plain word is mapped
 * back to the Uthmani word it belongs to for display.
 *
 * Everything here is pure, so it can be tested without a microphone.
 */

import { splitWords } from './text'

/** Letters only: no diacritics, one form of alif, ي for ى, ه for ة, no hamza. */
export function normalize(s: string): string {
  return s
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ا-ي]/g, '')
    .replace(/[ػ-ـ]/g, '')
}

/**
 * An Uthmani word reduced to plain letters. The small letters Uthmani script
 * writes above or below the line (dagger alif, small waw, small yeh) become
 * full letters, as modern spelling writes them.
 */
export function bareUthmani(word: string): string {
  return normalize(word.replace(/ٰ/g, 'ا').replace(/ۥ/g, 'و').replace(/[ۦۧ]/g, 'ي'))
}

export function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalize)
    .filter((w) => w.length > 0)
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]!
}

/**
 * Whether a heard word is the expected one. Short words must match exactly,
 * because many Qur'anic words differ by a single letter (يلد / يولد). Longer
 * words allow one letter of slack for the recognizer's spelling.
 */
export function sameWord(heard: string, expected: string): boolean {
  if (heard === expected) return true
  if (Math.min(heard.length, expected.length) < 5) return false
  return editDistance(heard, expected) <= 1
}

/**
 * For each plain word, the index of the Uthmani word it belongs to. Usually
 * one to one; sometimes one Uthmani word is two or three plain ones
 * (يَـٰٓأَيُّهَا → يا أيها, يَبْنَؤُمَّ → يا ابن أم) or the other way round.
 */
export function alignWords(uthmani: readonly string[], simple: readonly string[]): number[] {
  const U = uthmani.map(bareUthmani)
  const S = simple.map(normalize)
  const n = U.length
  const m = S.length
  const INF = Number.POSITIVE_INFINITY
  const cost = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => INF))
  const from = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, (): [number, number] => [1, 1]))
  cost[0]![0] = 0
  const steps: [number, number][] = [
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 1],
    [3, 1],
  ]
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const base = cost[i]![j]!
      if (base === INF) continue
      for (const [du, ds] of steps) {
        if (i + du > n || j + ds > m) continue
        const a = U.slice(i, i + du).join('')
        const b = S.slice(j, j + ds).join('')
        const c = base + editDistance(a, b) / Math.max(a.length, b.length, 1) + (du === 1 && ds === 1 ? 0 : 0.15)
        if (c < cost[i + du]![j + ds]!) {
          cost[i + du]![j + ds] = c
          from[i + du]![j + ds] = [du, ds]
        }
      }
    }
  }
  const map = Array.from({ length: m }, () => 0)
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const [du, ds] = from[i]![j]!
    for (let k = j - ds; k < j; k++) map[k] = i - du
    i -= du
    j -= ds
  }
  return map
}

/** One word to be recited. */
export interface Expected {
  /** Plain spelling, normalized. */
  norm: string
  /** Global ayah index. */
  ayah: number
  /** Index of the Uthmani display word (splitWords) within that ayah. */
  word: number
  /**
   * Already on screen as the prompt. Counted as said, so the reciter may
   * skip it or say it again; it is never a mistake either way.
   */
  given?: boolean
}

/** Isti'adha and basmala may be said before starting; they aren't checked. */
const OPENERS = ['اعوذ بالله من الشيطان الرجيم', 'بسم الله الرحمن الرحيم'].map(words)

/**
 * The words to recite: from `startWord` (an Uthmani word index) in the first
 * ayah, through the end of the last one. Words before `startWord` are
 * included as `given`, so reciting from the start of the ayah is understood.
 */
export function buildExpected(
  indices: readonly number[],
  uthmaniText: (i: number) => string,
  simpleText: (i: number) => string,
  startWord = 0,
): Expected[] {
  const out: Expected[] = []
  indices.forEach((ayah, k) => {
    const uw = splitWords(uthmaniText(ayah)).words
    const sw = simpleText(ayah).split(/\s+/).filter(Boolean)
    const map = alignWords(uw, sw)
    sw.forEach((w, j) => {
      const norm = normalize(w)
      if (!norm) return
      if (k === 0 && map[j]! < startWord) out.push({ norm, ayah, word: map[j]!, given: true })
      else out.push({ norm, ayah, word: map[j]! })
    })
  })
  return out
}

export type Slip = 'wrong' | 'skipped'

export interface Follow {
  /** Index of the next expected word. */
  next: number
  /** Expected positions where something went wrong. */
  slips: Map<number, Slip>
  /** The reciter is stuck on a wrong word at `next`. */
  stuck: boolean
  done: boolean
}

/**
 * Follows `heard` (normalized words, oldest first) through `expected`.
 * The last heard word may still change while the recognizer is listening;
 * with `lastIsTentative` it can move the reciter forward but never counts as
 * a mistake.
 *
 * A wrong word doesn't move forward: the expected word stays awaited until it
 * is said, like a teacher waiting for the correction.
 *
 * Going back is not a mistake: starting the ayah again from its first word,
 * or repeating a stretch of it in order, is followed silently until the
 * reciter reaches the awaited word again.
 */
export function follow(expected: readonly Expected[], heard: readonly string[], lastIsTentative = false): Follow {
  const n = expected.length
  const slips = new Map<number, Slip>()
  let p = 0
  while (p < n && expected[p]!.given) p++
  let i = 0
  let stuck = false
  /** Position within the current ayah's said words while going back over them; -1 when not. */
  let back = -1

  const E = (k: number) => expected[k]?.norm ?? ''
  /** The words of the current ayah already said (or shown), in order. */
  const saidInAyah = (k: number): string[] => {
    const ayah = expected[k]?.ayah ?? expected[k - 1]?.ayah
    let s = k
    while (s > 0 && expected[s - 1]!.ayah === ayah) s--
    return expected.slice(s, k).map((e) => e.norm)
  }

  // Skip an isti'adha or basmala said before the first expected word, including
  // one still being said (so its first words aren't flagged as mistakes).
  for (const opener of OPENERS) {
    if (sameWord(E(0), opener[0]!) && sameWord(E(1), opener[1]!)) continue // it's part of the text itself
    let k = 0
    while (k < opener.length && i + k < heard.length && sameWord(heard[i + k]!, opener[k]!)) k++
    if (k >= 2 || (k >= 1 && i + k === heard.length)) i += k
  }

  while (i < heard.length && p < n) {
    const w = heard[i]!
    const tentative = lastIsTentative && i === heard.length - 1
    if (sameWord(w, E(p))) {
      p++
      i++
      stuck = false
      back = -1
      continue
    }
    // Going back over the ayah: from its first word, or a stretch of it in
    // order (confirmed by the word after it).
    const said = saidInAyah(p)
    if (said.length) {
      if (back >= 0 && back + 1 < said.length && sameWord(w, said[back + 1]!)) {
        back++
        i++
        continue
      }
      if (sameWord(w, said[0]!)) {
        back = 0
        i++
        continue
      }
      const next = heard[i + 1]
      const k = said.findIndex((x) => sameWord(w, x))
      if (k > 0 && next !== undefined) {
        const follows = k + 1 < said.length ? sameWord(next, said[k + 1]!) : sameWord(next, E(p))
        if (follows) {
          back = k
          i++
          continue
        }
      }
    }
    back = -1
    // The recognizer joined two words into one.
    if (p + 1 < n && sameWord(w, E(p) + E(p + 1))) {
      p += 2
      i++
      stuck = false
      continue
    }
    // The recognizer split one word in two.
    if (i + 1 < heard.length && sameWord(w + heard[i + 1], E(p))) {
      p++
      i += 2
      stuck = false
      continue
    }
    if (tentative) break
    // Repeating the previous word while finding one's place is not a mistake.
    if (p > 0 && sameWord(w, E(p - 1))) {
      i++
      continue
    }
    // Jumped ahead: the words in between were skipped. A single one- or
    // two-letter word is often just not heard, so it isn't counted.
    let k = 1
    while (k <= 3 && p + k < n && !sameWord(w, E(p + k))) k++
    if (k <= 3 && p + k < n) {
      for (let s = p; s < p + k; s++) {
        if (!(k === 1 && E(s).length <= 2)) slips.set(s, 'skipped')
      }
      p += k + 1
      i++
      stuck = false
      continue
    }
    slips.set(p, slips.get(p) ?? 'wrong')
    stuck = true
    i++
  }
  return { next: p, slips, stuck, done: p >= n }
}

/** A grade to suggest from the slips: none → perfect, one or two → hesitated, more → missed. */
export function suggestGrade(slips: number): 'perfect' | 'hesitated' | 'missed' {
  if (slips === 0) return 'perfect'
  if (slips <= 2) return 'hesitated'
  return 'missed'
}
