import type { I18n } from './I18n'
import type { Quran } from '../lib/quran'
import type { ScopePart } from '../lib/scope'

/** "Al-Baqara 255" / "سورة البقرة ٢٥٥" */
export function verseLabel(i18n: I18n, quran: Quran, index: number): string {
  const { ayah } = quran.keyOf(index)
  return i18n.t.where.surahAyah(i18n.surahName(quran.surahOf(index)), i18n.num(ayah))
}

export function partLabel(i18n: I18n, quran: Quran, part: ScopePart): string {
  switch (part.kind) {
    case 'juz':
      return i18n.t.where.juz(i18n.num(part.n))
    case 'hizb':
      return i18n.t.quarter(i18n.num(part.n), 1)
    case 'surah':
      return i18n.surahName(quran.surah(part.n))
    case 'range': {
      const from = Math.min(part.from, part.to)
      const to = Math.max(part.from, part.to)
      return i18n.t.where.ayahRange(verseLabel(i18n, quran, from), verseLabel(i18n, quran, to))
    }
  }
}
