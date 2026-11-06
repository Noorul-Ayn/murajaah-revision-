import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { MODES, itemsInScope, type Mode } from '../lib/items'
import { activity, quarterProgress, type QuarterProgress } from '../lib/progress'
import { JUZ_COUNT, quarterParts } from '../lib/quran'
import { countAyahs, scopeMask } from '../lib/scope'
import { getAllReviews } from '../storage/db'
import { Dialog, Segmented } from '../components/controls'
import { openingText } from '../lib/text'
import type { QuizRequest } from './Quiz'

export function Progress() {
  const { quran, settings, states, changes } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Mode | 'all'>('all')
  const [open, setOpen] = useState<QuarterProgress | null>(null)
  const [now] = useState(() => Date.now())
  const [act, setAct] = useState<{ answers: number; today: number; streak: number } | null>(null)

  useEffect(() => {
    let live = true
    void getAllReviews().then((reviews) => {
      if (live) setAct({ answers: reviews.length, ...activity(reviews, Date.now()) })
    })
    return () => {
      live = false
    }
  }, [changes, states])

  const mask = useMemo(() => scopeMask(settings.memorized, quran), [settings.memorized, quran])
  const quarters = useMemo(() => quarterProgress(quran, mask, states, filter, now), [quran, mask, states, filter, now])

  const practiceQuarter = (q: number) => {
    const [from, to] = quran.quarterRange(q)
    const items = itemsInScope('ayah', scopeMask([{ kind: 'range', from, to }], quran), quran)
    const request: QuizRequest = {
      mode: 'ayah',
      scope: [{ kind: 'range', from, to }],
      size: items.length,
      order: 'smart',
    }
    navigate('/quiz', { state: request })
  }

  const legend = (['out', 'none', 'weak', 'shaky', 'good', 'strong'] as const).map((s) => (
    <span key={s}>
      <i className="cell" data-s={s} aria-hidden="true" />
      {t.progress.legend[s]}
    </span>
  ))

  return (
    <div className="stack">
      <h1>{t.progress.title}</h1>

      <div className="stats">
        <div>
          <strong>{num(countAyahs(mask))}</strong>
          <span>{t.progress.memorized}</span>
        </div>
        <div>
          <strong>{act ? num(act.answers) : '–'}</strong>
          <span>{t.progress.answers}</span>
        </div>
        <div>
          <strong>{act ? num(act.today) : '–'}</strong>
          <span>{t.progress.today}</span>
        </div>
        <div>
          <strong>{act ? num(act.streak) : '–'}</strong>
          <span>{t.progress.streak}</span>
        </div>
      </div>

      <section className="section" aria-labelledby="map-h">
        <h2 id="map-h">{t.progress.mapTitle}</h2>
        {settings.memorized.length === 0 && <p className="muted">{t.progress.emptyHint}</p>}
        <Segmented
          legend={t.progress.show}
          value={filter}
          options={[
            { value: 'all' as const, label: t.progress.all },
            ...MODES.map((m) => ({ value: m, label: t.modes[m].title })),
          ]}
          onChange={setFilter}
        />
        <div className="map" role="grid" aria-labelledby="map-h">
          {Array.from({ length: JUZ_COUNT }, (_, j) => (
            <div key={j} role="row" style={{ display: 'contents' }}>
              <span className="map__juz" role="rowheader">
                {num(j + 1)}
              </span>
              {quarters.slice(j * 8, j * 8 + 8).map((p) => (
                <button
                  key={p.quarter}
                  type="button"
                  role="gridcell"
                  className="cell"
                  data-s={p.strength}
                  data-part={quarterParts(p.quarter).part}
                  aria-label={`${i18n.quarterLabel(p.quarter)}: ${t.progress.legend[p.strength]}`}
                  disabled={p.strength === 'out'}
                  onClick={() => setOpen(p)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="legend">{legend}</div>
      </section>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? i18n.quarterLabel(open.quarter) : ''}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              {t.progress.close}
            </button>
            {open && (
              <button type="button" className="btn btn--primary" onClick={() => practiceQuarter(open.quarter)}>
                {t.progress.practice}
              </button>
            )}
          </>
        }
      >
        {open && details(open)}
      </Dialog>
    </div>
  )

  function details(p: QuarterProgress) {
    const [first, last] = quran.quarterRange(p.quarter)
    const perMode: Record<Mode, number> = {
      ayah: itemsInScope('ayah', scopeMask([{ kind: 'range', from: first, to: last }], quran), quran).length,
      open: 1,
      name: 1,
      link: p.quarter > 1 ? 1 : 0,
    }
    const possible = filter === 'all' ? MODES.reduce((n, m) => n + perMode[m], 0) : perMode[filter]
    return (
      <>
        <p className="muted">{t.where.ayahRange(verseLabel(i18n, quran, first), verseLabel(i18n, quran, last))}</p>
        <p className="quran" lang="ar" dir="rtl">
          {openingText(quran.text(first), 8)}
        </p>
        <p>
          {t.progress.legend[p.strength]}
          {p.tested > 0 && (
            <span className="muted">
              {t.sep}
              {t.progress.tested(num(p.tested), num(possible))}
            </span>
          )}
        </p>
      </>
    )
  }
}
