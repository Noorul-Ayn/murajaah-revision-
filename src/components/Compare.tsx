import { useMemo } from 'react'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { ayahDiff } from '../lib/similar'
import { Ayahs } from './QuranText'

/** Two similar ayahs one above the other, with the words where they differ coloured. */
export function Compare({ ayah, other, simple }: { ayah: number; other: number; simple: readonly string[] }) {
  const { quran } = useApp()
  const i18n = useI18n()
  const { t } = i18n
  const diff = useMemo(
    () =>
      ayahDiff(
        { uthmani: quran.text(ayah), simple: simple[ayah]! },
        { uthmani: quran.text(other), simple: simple[other]! },
      ),
    [quran, ayah, other, simple],
  )
  return (
    <div className="compare">
      <p className="compare__label">{t.mixup.reciting(verseLabel(i18n, quran, ayah))}</p>
      <Ayahs indices={[ayah]} marked={(_, w) => diff.a[w] ?? false} />
      <p className="compare__label">{t.mixup.went(verseLabel(i18n, quran, other))}</p>
      <Ayahs indices={[other]} marked={(_, w) => diff.b[w] ?? false} />
      <p className="note">{t.quiz.pair.diffNote}</p>
    </div>
  )
}
