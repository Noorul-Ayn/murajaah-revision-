import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { Compare } from './Compare'
import { Dialog } from './controls'

export interface Mixup {
  /** The ayah being recited. */
  ayah: number
  /** The similar ayah the recitation drifted into. */
  other: number
}

/**
 * "That was Al-A'raf 161": a note for each similar ayah the recitation
 * drifted into, with a side-by-side comparison, and a way to say it wasn't a
 * mix-up (a misheard word, say) so it isn't saved.
 */
export function Mixups({
  mixups,
  simple,
  onDismiss,
}: {
  mixups: readonly Mixup[]
  simple: readonly string[] | null
  onDismiss: (ayah: number) => void
}) {
  const { quran } = useApp()
  const i18n = useI18n()
  const { t } = i18n
  const [comparing, setComparing] = useState<Mixup | null>(null)
  return (
    <>
      {mixups.map((m) => (
        <div key={m.ayah} className="mixup" role="status">
          <p>{t.mixup.wentInto(verseLabel(i18n, quran, m.other))}</p>
          <div className="mixup__actions">
            <button type="button" className="btn" onClick={() => setComparing(m)}>
              {t.mixup.compare}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => onDismiss(m.ayah)}>
              {t.mixup.dismiss}
            </button>
          </div>
        </div>
      ))}
      <Dialog
        open={comparing !== null}
        onClose={() => setComparing(null)}
        title={t.mixup.title}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setComparing(null)}>
            {t.mixup.close}
          </button>
        }
      >
        {comparing && simple && <Compare ayah={comparing.ayah} other={comparing.other} simple={simple} />}
        <p className="muted">{t.mixup.saved}</p>
      </Dialog>
    </>
  )
}
