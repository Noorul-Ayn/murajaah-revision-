import { MODES, type Mode } from './items'
import { ORDERS, type Order } from './session'
import { isScopePart, type Scope } from './scope'

export type Lang = 'ar' | 'en'
export type Theme = 'system' | 'light' | 'dark'
export type TextSize = 'm' | 'l' | 'xl'

export interface Settings {
  lang: Lang
  theme: Theme
  textSize: TextSize
  /** What the user has memorized; quizzes draw from here. */
  memorized: Scope
  /** Words shown at the start of an ayah in ayah mode. */
  promptWords: number
  /** Ayahs to keep reciting after the prompted one in ayah mode. */
  extraAyahs: number
  sessionSize: number
  order: Order
  mode: Mode
  /** ms since epoch; the newer copy wins when syncing. */
  updatedAt: number
}

export const SESSION_SIZES = [10, 20, 50] as const
export const PROMPT_WORDS = { min: 1, max: 6 } as const
export const EXTRA_AYAHS = { min: 0, max: 3 } as const

export function defaultSettings(browserLang = 'en'): Settings {
  return {
    lang: browserLang.toLowerCase().startsWith('ar') ? 'ar' : 'en',
    theme: 'system',
    textSize: 'l',
    memorized: [],
    promptWords: 3,
    extraAyahs: 0,
    sessionSize: 20,
    order: 'smart',
    mode: 'ayah',
    updatedAt: 0,
  }
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback

/** Accepts settings from storage, sync or a backup file, repairing anything invalid. */
export function sanitizeSettings(value: unknown, base: Settings = defaultSettings()): Settings {
  if (typeof value !== 'object' || value === null) return base
  const v = value as Record<string, unknown>
  const oneOf = <T extends string>(x: unknown, list: readonly T[], fallback: T): T =>
    typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : fallback
  return {
    lang: oneOf(v.lang, ['ar', 'en'], base.lang),
    theme: oneOf(v.theme, ['system', 'light', 'dark'], base.theme),
    textSize: oneOf(v.textSize, ['m', 'l', 'xl'], base.textSize),
    memorized: Array.isArray(v.memorized) ? v.memorized.filter(isScopePart).slice(0, 500) : base.memorized,
    promptWords: clampInt(v.promptWords, PROMPT_WORDS.min, PROMPT_WORDS.max, base.promptWords),
    extraAyahs: clampInt(v.extraAyahs, EXTRA_AYAHS.min, EXTRA_AYAHS.max, base.extraAyahs),
    sessionSize: clampInt(v.sessionSize, 5, 100, base.sessionSize),
    order: oneOf(v.order, ORDERS, base.order),
    mode: oneOf(v.mode, MODES, base.mode),
    updatedAt: clampInt(v.updatedAt, 0, Number.MAX_SAFE_INTEGER, base.updatedAt),
  }
}
