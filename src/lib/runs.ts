import type { Run } from '../storage/db'

/** Clean runs (no slips), on different days, needed before recording a surah. */
export const RUNS_TO_UNLOCK = 3

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** How many different days the surah was recited with no slips. */
export function cleanDays(runs: readonly Pick<Run, 'surah' | 'at' | 'slips'>[], surah: number): number {
  return new Set(runs.filter((r) => r.surah === surah && r.slips === 0).map((r) => dayKey(r.at))).size
}

export function canRecord(runs: readonly Pick<Run, 'surah' | 'at' | 'slips'>[], surah: number): boolean {
  return cleanDays(runs, surah) >= RUNS_TO_UNLOCK
}

/** Whether a clean run today would add a new day (one already today doesn't). */
export function cleanToday(runs: readonly Pick<Run, 'surah' | 'at' | 'slips'>[], surah: number, now: number): boolean {
  const today = dayKey(now)
  return runs.some((r) => r.surah === surah && r.slips === 0 && dayKey(r.at) === today)
}
