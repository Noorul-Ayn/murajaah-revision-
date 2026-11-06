/**
 * Similar ayahs (mutashabihat), found from the reciter's own slips.
 *
 * When a recitation goes wrong, the words said since the slip are looked up
 * in the whole Qur'an. If they continue another ayah, together with the words
 * just before the slip, the reciter most likely drifted into that ayah: the
 * two become a pair to practise telling apart.
 *
 * Everything here works on Tanzil's plain-spelling text (see recitation.ts),
 * so it matches what speech recognition writes. Pure, for testing.
 */

import { alignWords, normalize, sameWord } from './recitation'
import { splitWords } from './text'

export interface WordIndex {
  /** Every word of the Qur'an in order, normalized. */
  words: string[]
  /** The ayah each word belongs to. */
  ayahOf: Int32Array
  /** Where each distinct word occurs. */
  at: Map<string, number[]>
  /** Each ayah's normalized words. */
  ayahWords: string[][]
}

export function buildWordIndex(simple: readonly string[]): WordIndex {
  const words: string[] = []
  const owner: number[] = []
  const ayahWords: string[][] = []
  simple.forEach((text, ayah) => {
    const ws = text.split(/\s+/).map(normalize).filter(Boolean)
    ayahWords.push(ws)
    for (const w of ws) {
      words.push(w)
      owner.push(ayah)
    }
  })
  const at = new Map<string, number[]>()
  words.forEach((w, g) => {
    const list = at.get(w)
    if (list) list.push(g)
    else at.set(w, [g])
  })
  return { words, ayahOf: Int32Array.from(owner), at, ayahWords }
}

const built = new WeakMap<readonly string[], WordIndex>()

/** The word index for a text, built once. */
export function wordIndexFor(simple: readonly string[]): WordIndex {
  let index = built.get(simple)
  if (!index) {
    index = buildWordIndex(simple)
    built.set(simple, index)
  }
  return index
}

/** Share of distinct words two ayahs have in common (0–1). */
export function similarity(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return shared / Math.max(1, new Set([...A, ...B]).size)
}

/** Fewest words that must line up with another ayah before it counts as a mix-up. */
export const MIXUP_MIN_WORDS = 4
/** Of those, how many must be words said after the slip (the rest are the words just before it). */
export const MIXUP_MIN_STRAY = 1

/**
 * Where a recitation that went wrong in `expectedAyah` went instead.
 *
 * `said` are the last words correctly recited before the slip; `stray` the
 * words heard since. Returns the other ayah, or null when the words don't
 * clearly continue one other ayah (a phrase found all over the Qur'an, a
 * recognition error, or simply starting the ayah again).
 */
export function findMixup(
  index: WordIndex,
  expectedAyah: number,
  said: readonly string[],
  stray: readonly string[],
): number | null {
  if (stray.length < MIXUP_MIN_STRAY) return null
  const { words, ayahOf, ayahWords } = index
  const expectedWords = ayahWords[expectedAyah] ?? []
  const expectedText = expectedWords.join(' ')
  const best = new Map<number, number>()
  for (const g of index.at.get(stray[0]!) ?? []) {
    let m = 0
    while (m < stray.length && g + m < words.length && sameWord(stray[m]!, words[g + m]!)) m++
    if (m < MIXUP_MIN_STRAY) continue
    let c = 0
    while (c < said.length && g - 1 - c >= 0 && sameWord(said[said.length - 1 - c]!, words[g - 1 - c]!)) c++
    if (m + c < MIXUP_MIN_WORDS) continue
    const ayah = ayahOf[g]!
    if (ayah === expectedAyah) continue
    // Identical text isn't a mix-up, and landing an ayah or two away is skipping
    // ahead (or going back), not drifting into a look-alike.
    if (ayahWords[ayah]!.join(' ') === expectedText) continue
    if (Math.abs(ayah - expectedAyah) <= 2) continue
    best.set(ayah, Math.max(best.get(ayah) ?? 0, m + c))
  }
  if (best.size === 0) return null
  const ranked = [...best.entries()]
    .map(([ayah, score]) => ({ ayah, score, sim: similarity(expectedWords, ayahWords[ayah]!) }))
    .sort((a, b) => b.score - a.score || b.sim - a.sim)
  const top = ranked[0]!
  const ties = ranked.filter((r) => r.score === top.score)
  // A common phrase found in many places: only trust it if one ayah is clearly the most alike.
  if (ties.length > 3 && ties[1]!.sim >= top.sim) return null
  return top.ayah
}

/**
 * Where two similar ayahs differ, word by word on the Uthmani text shown on
 * screen: true marks a word that isn't in the other ayah's sequence.
 */
export function ayahDiff(
  a: { uthmani: string; simple: string },
  b: { uthmani: string; simple: string },
): { a: boolean[]; b: boolean[] } {
  const side = (x: { uthmani: string; simple: string }) => {
    const shown = splitWords(x.uthmani).words
    const plain = x.simple.split(/\s+/).filter(Boolean)
    return { shown, plain, norm: plain.map(normalize), map: alignWords(shown, plain) }
  }
  const A = side(a)
  const B = side(b)
  const [keepA, keepB] = commonSubsequence(A.norm, B.norm)
  const mark = (s: ReturnType<typeof side>, keep: boolean[]) => {
    const diff = s.shown.map(() => false)
    keep.forEach((k, j) => {
      if (!k) diff[s.map[j]!] = true
    })
    return diff
  }
  return { a: mark(A, keepA), b: mark(B, keepB) }
}

/** Longest common subsequence of two word lists: which words of each are part of it. */
export function commonSubsequence(a: readonly string[], b: readonly string[]): [boolean[], boolean[]] {
  const n = a.length
  const m = b.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
    }
  }
  const inA = a.map(() => false)
  const inB = b.map(() => false)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      inA[i++] = true
      inB[j++] = true
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++
    else j++
  }
  return [inA, inB]
}

/**
 * How many of an ayah's first display words are the same as the start of the
 * similar ayah: the shared opening that makes them easy to confuse.
 */
export function sharedOpening(a: { uthmani: string; simple: string }, b: { simple: string }): number {
  const plainA = a.simple.split(/\s+/).filter(Boolean)
  const normA = plainA.map(normalize)
  const normB = b.simple.split(/\s+/).filter(Boolean).map(normalize)
  let k = 0
  while (k < normA.length && k < normB.length && normA[k] === normB[k]) k++
  if (k === 0) return 0
  const map = alignWords(splitWords(a.uthmani).words, plainA)
  // Only whole display words: stop before one that is only partly shared.
  return k < map.length && map[k] === map[k - 1] ? map[k - 1]! : map[k - 1]! + 1
}

/**
 * The mix-ups in a followed recitation: for each run of wrong
 * words, the other ayah they continue, if any. One per ayah.
 */
export function mixupsIn(
  index: WordIndex,
  expected: readonly { norm: string; ayah: number }[],
  heard: readonly string[],
  strays: readonly { at: number; from: number; to: number }[],
): { ayah: number; other: number }[] {
  const out = new Map<number, number>()
  for (const s of strays) {
    if (s.to - s.from < MIXUP_MIN_STRAY) continue
    const ayah = expected[Math.min(s.at, expected.length - 1)]?.ayah
    if (ayah === undefined || out.has(ayah)) continue
    const said = expected.slice(Math.max(0, s.at - 3), s.at).map((e) => e.norm)
    const other = findMixup(index, ayah, said, heard.slice(s.from, s.to))
    if (other !== null) out.set(ayah, other)
  }
  return [...out].map(([ayah, other]) => ({ ayah, other }))
}
