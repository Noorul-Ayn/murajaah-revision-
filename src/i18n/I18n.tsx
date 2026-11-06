import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { STRINGS, type Strings } from './strings'
import type { Lang } from '../lib/settings'
import type { Surah } from '../lib/quran'
import { quarterParts } from '../lib/quran'

export interface I18n {
  lang: Lang
  t: Strings
  /** Formats a number with Arabic-Indic digits in Arabic, Western digits in English. */
  num: (n: number) => string
  /** Like num, without thousands separators (years, page numbers in prose). */
  year: (n: number) => string
  surahName: (s: Surah) => string
  quarterLabel: (q: number) => string
  relativeTime: (ms: number, now?: number) => string
}

function make(lang: Lang): I18n {
  const t = STRINGS[lang]
  const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en', { useGrouping: true })
  const num = (n: number) => nf.format(n)
  const plain = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en', { useGrouping: false })
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  return {
    lang,
    t,
    num,
    year: (n) => plain.format(n),
    surahName: (s) => (lang === 'ar' ? `سورة ${s.name}` : s.tname),
    quarterLabel: (q) => {
      const { hizb, part } = quarterParts(q)
      return t.quarter(num(hizb), part)
    },
    relativeTime: (ms, now = Date.now()) => {
      const s = Math.round((ms - now) / 1000)
      const abs = Math.abs(s)
      if (abs < 45) return rtf.format(0, 'second')
      if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
      if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
      return rtf.format(Math.round(s / 86400), 'day')
    },
  }
}

const I18nContext = createContext<I18n>(make('en'))

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => make(lang), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}
