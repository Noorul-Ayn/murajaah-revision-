import { MODES, type Mode } from './items'
import { ORDERS, type Order } from './session'
import { isScopePart, type Scope } from './scope'
import { TRANSLATIONS, type TranslationId } from './translations'
import { MINE, PLAY_REPEATS, PLAY_SPEEDS, RECITERS } from './reciters'

export type Lang = 'ar' | 'en'
export type Theme = 'system' | 'light' | 'dark'
export type TextSize = 'm' | 'l' | 'xl'

export interface Settings {
  lang: Lang
  /** Optional, for the greeting on Home. */
  name: string
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
  /** Which English translation the mushaf reader shows. */
  translation: TranslationId
  /** Whether the mushaf reader shows the translation under each ayah. */
  showTranslation: boolean
  /** Reciting aloud: play a warning tone on a slip. */
  listenSound: boolean
  /** Reciting aloud: vibrate on a slip (phones). */
  listenVibrate: boolean
  /** Reciter for listening in the mushaf ('mine' for the user's own recordings). */
  reciter: string
  /** Times each ayah is played. */
  playRepeat: number
  playSpeed: number
  /** ms since epoch; the newer copy wins when syncing. */
  updatedAt: number
}

export const SESSION_SIZES = [10, 20, 50] as const
export const PROMPT_WORDS = { min: 1, max: 6 } as const
export const EXTRA_AYAHS = { min: 0, max: 3 } as const

export function defaultSettings(browserLang = 'en'): Settings {
  return {
    lang: browserLang.toLowerCase().startsWith('ar') ? 'ar' : 'en',
    name: '',
    theme: 'system',
    textSize: 'l',
    memorized: [],
    promptWords: 3,
    extraAyahs: 0,
    sessionSize: 20,
    order: 'smart',
    mode: 'ayah',
    translation: 'en-sahih',
    showTranslation: false,
    listenSound: true,
    listenVibrate: true,
    reciter: 'alafasy',
    playRepeat: 1,
    playSpeed: 1,
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
    name: typeof v.name === 'string' ? v.name.trim().slice(0, 40) : base.name,
    theme: oneOf(v.theme, ['system', 'light', 'dark'], base.theme),
    textSize: oneOf(v.textSize, ['m', 'l', 'xl'], base.textSize),
    memorized: Array.isArray(v.memorized) ? v.memorized.filter(isScopePart).slice(0, 500) : base.memorized,
    promptWords: clampInt(v.promptWords, PROMPT_WORDS.min, PROMPT_WORDS.max, base.promptWords),
    extraAyahs: clampInt(v.extraAyahs, EXTRA_AYAHS.min, EXTRA_AYAHS.max, base.extraAyahs),
    sessionSize: clampInt(v.sessionSize, 5, 100, base.sessionSize),
    order: oneOf(v.order, ORDERS, base.order),
    mode: oneOf(v.mode, MODES, base.mode),
    translation: oneOf(
      v.translation,
      TRANSLATIONS.map((t) => t.id),
      base.translation,
    ),
    showTranslation: typeof v.showTranslation === 'boolean' ? v.showTranslation : base.showTranslation,
    listenSound: typeof v.listenSound === 'boolean' ? v.listenSound : base.listenSound,
    listenVibrate: typeof v.listenVibrate === 'boolean' ? v.listenVibrate : base.listenVibrate,
    reciter: oneOf(v.reciter, [...RECITERS.map((r) => r.id), MINE], base.reciter),
    playRepeat: (PLAY_REPEATS as readonly number[]).includes(v.playRepeat as number)
      ? (v.playRepeat as number)
      : base.playRepeat,
    playSpeed: (PLAY_SPEEDS as readonly number[]).includes(v.playSpeed as number)
      ? (v.playSpeed as number)
      : base.playSpeed,
    updatedAt: clampInt(v.updatedAt, 0, Number.MAX_SAFE_INTEGER, base.updatedAt),
  }
}
