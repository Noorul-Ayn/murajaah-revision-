import { AYAH_COUNT, type Quran } from './quran'

/** A part of the Qur'an the user has memorized or wants to be tested on. */
export type ScopePart =
  | { kind: 'juz'; n: number }
  | { kind: 'hizb'; n: number }
  | { kind: 'surah'; n: number }
  /** Inclusive global ayah indices. */
  | { kind: 'range'; from: number; to: number }

export type Scope = ScopePart[]

export function partRange(part: ScopePart, quran: Quran): [number, number] {
  switch (part.kind) {
    case 'juz':
      return quran.juzRange(part.n)
    case 'hizb':
      return quran.hizbRange(part.n)
    case 'surah':
      return quran.surahRange(part.n)
    case 'range':
      return [Math.min(part.from, part.to), Math.max(part.from, part.to)]
  }
}

/** A mask with 1 for every ayah inside the scope. */
export function scopeMask(scope: Scope, quran: Quran): Uint8Array {
  const mask = new Uint8Array(AYAH_COUNT)
  for (const part of scope) {
    const [from, to] = partRange(part, quran)
    mask.fill(1, Math.max(0, from), Math.min(AYAH_COUNT - 1, to) + 1)
  }
  return mask
}

export function countAyahs(mask: Uint8Array): number {
  let n = 0
  for (const v of mask) n += v
  return n
}

/** Merged, sorted inclusive ranges covered by a mask. */
export function maskRanges(mask: Uint8Array): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i] === 1
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      out.push([start, i - 1])
      start = -1
    }
  }
  return out
}

export function samePart(a: ScopePart, b: ScopePart): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'range' && b.kind === 'range') return a.from === b.from && a.to === b.to
  return (a as { n: number }).n === (b as { n: number }).n
}

export function togglePart(scope: Scope, part: ScopePart): Scope {
  return scope.some((p) => samePart(p, part)) ? scope.filter((p) => !samePart(p, part)) : [...scope, part]
}

export function isScopePart(value: unknown): value is ScopePart {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const int = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
  switch (v.kind) {
    case 'juz':
      return int(v.n, 1, 30)
    case 'hizb':
      return int(v.n, 1, 60)
    case 'surah':
      return int(v.n, 1, 114)
    case 'range':
      return int(v.from, 0, AYAH_COUNT - 1) && int(v.to, 0, AYAH_COUNT - 1)
    default:
      return false
  }
}
