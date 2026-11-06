import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { partLabel } from '../i18n/labels'
import { MODES, itemsInScope, type Mode } from '../lib/items'
import { countAyahs, scopeMask, type Scope } from '../lib/scope'
import { ORDERS } from '../lib/session'
import { SESSION_SIZES } from '../lib/settings'
import { isDue } from '../lib/srs'
import { QUARTER_COUNT } from '../lib/quran'
import { Segmented } from '../components/controls'
import { ModeIcon } from '../components/Art'
import type { QuizRequest } from './Quiz'

export function Practice() {
  const { quran, settings, states, updateSettings } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()
  /** -1 means everything memorized; otherwise an index into settings.memorized. */
  const [from, setFrom] = useState(-1)
  const [now] = useState(() => Date.now())

  const memorized = settings.memorized
  const memorizedMask = useMemo(() => scopeMask(memorized, quran), [memorized, quran])
  const ayahCount = useMemo(() => countAyahs(memorizedMask), [memorizedMask])
  const quarterCount = useMemo(() => {
    let n = 0
    for (let q = 1; q <= QUARTER_COUNT; q++) if (memorizedMask[quran.quarterStart(q)]) n++
    return n
  }, [memorizedMask, quran])

  const part = from >= 0 ? memorized[from] : undefined
  const scope: Scope = useMemo(() => (part ? [part] : memorized), [part, memorized])
  const items = useMemo(
    () => itemsInScope(settings.mode, scopeMask(scope, quran), quran, states.keys()),
    [settings.mode, scope, quran, states],
  )
  const due = useMemo(() => {
    return items.filter((id) => {
      const s = states.get(id)
      return s !== undefined && isDue(s, now)
    }).length
  }, [items, states, now])

  const pairCount = useMemo(
    () => itemsInScope('pair', memorizedMask, quran, states.keys()).length,
    [memorizedMask, quran, states],
  )

  if (memorized.length === 0) {
    return (
      <div className="stack">
        <div className="section">
          <h1>{t.tagline}</h1>
          <p className="muted">{t.memorized.empty}</p>
        </div>
        <Link to="/memorized" className="btn btn--primary btn--large btn--block">
          {t.memorized.choose}
        </Link>
      </div>
    )
  }

  const size = Math.min(settings.sessionSize, items.length)
  const start = () => {
    const request: QuizRequest = { mode: settings.mode, scope, size: settings.sessionSize, order: settings.order }
    navigate('/quiz', { state: request })
  }

  return (
    <div className="stack">
      <section className="section" aria-labelledby="memorized-h">
        <div className="section__head">
          <h2 id="memorized-h">{t.memorized.title}</h2>
          <Link to="/memorized" className="btn btn--quiet">
            {t.memorized.edit}
          </Link>
        </div>
        <p className="muted">
          {t.memorized.ayahs(ayahCount, num(ayahCount))}
          {t.sep}
          {t.memorized.quarters(quarterCount, num(quarterCount))}
        </p>
      </section>

      <section className="section" aria-labelledby="mode-h">
        <h2 id="mode-h">{t.setup.mode}</h2>
        <div className="mode-grid" role="radiogroup" aria-labelledby="mode-h">
          {MODES.map((m: Mode) => (
            <label key={m} className="mode-tile" data-mode={m}>
              <input
                type="radio"
                name="mode"
                checked={settings.mode === m}
                onChange={() => updateSettings({ mode: m })}
              />
              <ModeIcon mode={m} />
              <span className="mode-tile__title">{t.modes[m].title}</span>
              <span className="mode-tile__body">{t.modes[m].body}</span>
              {m === 'pair' && pairCount > 0 && (
                <span className="mode-tile__badge">{t.setup.pairs(pairCount, num(pairCount))}</span>
              )}
              <span className="mode-tile__check" aria-hidden="true">
                ✓
              </span>
            </label>
          ))}
        </div>
        {settings.mode === 'place' && (
          <p className="muted small">
            {t.setup.printNote(i18n.year(Number(settings.mushaf)))}{' '}
            <Link to="/settings#mushaf">{t.setup.changePrint}</Link>
          </p>
        )}
      </section>

      <section className="section">
        {memorized.length > 1 && (
          <label className="field">
            <span>{t.setup.from}</span>
            <select className="select" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              <option value={-1}>{t.setup.allMemorized}</option>
              {memorized.map((p, i) => (
                <option key={i} value={i}>
                  {partLabel(i18n, quran, p)}
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented
          legend={t.setup.questions}
          value={settings.sessionSize}
          options={SESSION_SIZES.map((n) => ({ value: n, label: num(n) }))}
          onChange={(n) => updateSettings({ sessionSize: n })}
        />
        <Segmented
          legend={t.setup.order}
          value={settings.order}
          options={ORDERS.map((o) => ({ value: o, label: t.setup.orders[o] }))}
          onChange={(o) => updateSettings({ order: o })}
        />
      </section>

      <section className="section">
        {items.length === 0 ? (
          <p className="muted">
            {settings.mode === 'link'
              ? t.setup.nothingLink
              : settings.mode === 'pair'
                ? t.setup.nothingPair
                : t.setup.nothing}
          </p>
        ) : (
          <p className="muted small">
            {t.setup.available(items.length, num(items.length))}
            {due > 0 && (
              <>
                {t.sep}
                {t.setup.due(due, num(due))}
              </>
            )}
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary btn--large btn--block"
          disabled={items.length === 0}
          onClick={start}
        >
          {t.setup.start(size, num(size))}
        </button>
      </section>
    </div>
  )
}
