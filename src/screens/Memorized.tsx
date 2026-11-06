import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { partLabel } from '../i18n/labels'
import { HIZB_COUNT, JUZ_COUNT, QUARTER_COUNT } from '../lib/quran'
import { countAyahs, partRange, samePart, scopeMask, togglePart, type ScopePart } from '../lib/scope'
import { Segmented } from '../components/controls'
import { foldSearch as fold } from '../lib/search'

type Tab = 'juz' | 'hizb' | 'surah' | 'range'

export function Memorized() {
  const { quran, settings, updateSettings } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('juz')
  const [query, setQuery] = useState('')
  const [range, setRange] = useState({ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 })

  const scope = settings.memorized
  const mask = useMemo(() => scopeMask(scope, quran), [scope, quran])
  const ayahs = countAyahs(mask)
  const quarters = useMemo(() => {
    let n = 0
    for (let q = 1; q <= QUARTER_COUNT; q++) if (mask[quran.quarterStart(q)]) n++
    return n
  }, [mask, quran])

  const set = (next: ScopePart[]) => updateSettings({ memorized: next })
  const has = (part: ScopePart) => scope.some((p) => samePart(p, part))
  const covered = (part: ScopePart) => {
    const [a, b] = partRange(part, quran)
    for (let i = a; i <= b; i++) if (!mask[i]) return false
    return true
  }

  const tile = (part: ScopePart, n: number) => {
    const on = has(part)
    return (
      <button
        key={n}
        type="button"
        className={`tile${!on && covered(part) ? ' tile--covered' : ''}`}
        aria-pressed={on}
        aria-label={partLabel(i18n, quran, part)}
        onClick={() => set(togglePart(scope, part))}
      >
        {num(n)}
      </button>
    )
  }

  const surahs = useMemo(() => {
    const q = fold(query)
    if (!q) return quran.surahs
    return quran.surahs.filter(
      (s) =>
        fold(s.name).includes(q) ||
        fold(s.tname).includes(q) ||
        fold(s.ename).includes(q) ||
        String(s.n) === query.trim(),
    )
  }, [query, quran])

  const clampAyah = (surah: number, ayah: number) => Math.min(Math.max(1, ayah || 1), quran.surah(surah).ayahs)
  const addRange = () => {
    const from = quran.indexOf(range.fromSurah, clampAyah(range.fromSurah, range.fromAyah))
    const to = quran.indexOf(range.toSurah, clampAyah(range.toSurah, range.toAyah))
    set([...scope, { kind: 'range', from: Math.min(from, to), to: Math.max(from, to) }])
  }

  const surahSelect = (value: number, onChange: (n: number) => void, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {quran.surahs.map((s) => (
          <option key={s.n} value={s.n}>
            {num(s.n)}. {i18n.surahName(s)}
          </option>
        ))}
      </select>
    </label>
  )

  const ayahInput = (surah: number, value: number, onChange: (n: number) => void) => (
    <label className="field">
      <span>{t.memorized.ayah}</span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={1}
        max={quran.surah(surah).ayahs}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )

  return (
    <div className="stack">
      <div className="section">
        <h1>{t.memorized.title}</h1>
        <p className="muted" aria-live="polite">
          {t.memorized.ayahs(ayahs, num(ayahs))}
          {t.sep}
          {t.memorized.quarters(quarters, num(quarters))}
        </p>
      </div>

      <section className="section" aria-labelledby="sel-h">
        <div className="section__head">
          <h2 id="sel-h">{t.memorized.selected}</h2>
          {scope.length > 0 && (
            <button type="button" className="btn btn--quiet" onClick={() => set([])}>
              {t.memorized.clear}
            </button>
          )}
        </div>
        {scope.length === 0 ? (
          <p className="muted">{t.memorized.nothingSelected}</p>
        ) : (
          <div className="chips">
            {scope.map((p, i) => {
              const label = partLabel(i18n, quran, p)
              return (
                <span key={i} className="chip">
                  {label}
                  <button
                    type="button"
                    aria-label={t.memorized.remove(label)}
                    onClick={() => set(scope.filter((_, k) => k !== i))}
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}
      </section>

      <section className="section">
        <Segmented
          legend={t.memorized.choose}
          value={tab}
          options={(['juz', 'hizb', 'surah', 'range'] as const).map((v) => ({ value: v, label: t.memorized.tabs[v] }))}
          onChange={setTab}
        />

        {tab === 'juz' && (
          <div className="tiles">
            {Array.from({ length: JUZ_COUNT }, (_, i) => tile({ kind: 'juz', n: i + 1 }, i + 1))}
          </div>
        )}

        {tab === 'hizb' && (
          <div className="tiles">
            {Array.from({ length: HIZB_COUNT }, (_, i) => tile({ kind: 'hizb', n: i + 1 }, i + 1))}
          </div>
        )}

        {tab === 'surah' && (
          <>
            <input
              className="input"
              type="search"
              placeholder={t.memorized.search}
              aria-label={t.memorized.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {surahs.length === 0 ? (
              <p className="muted">{t.memorized.noMatch}</p>
            ) : (
              <ul className="surahs">
                {surahs.map((s) => {
                  const part: ScopePart = { kind: 'surah', n: s.n }
                  const on = has(part)
                  return (
                    <li key={s.n}>
                      <button
                        type="button"
                        className="surah-row"
                        aria-pressed={on}
                        onClick={() => set(togglePart(scope, part))}
                      >
                        <span className="surah-row__n">{num(s.n)}</span>
                        <span>
                          <span className="surah-row__name" lang="ar" translate="no">
                            {s.name}
                          </span>
                          <br />
                          <span className="surah-row__meta">
                            {i18n.lang === 'en' ? `${s.tname}${t.sep}` : ''}
                            {t.memorized.ayahs(s.ayahs, num(s.ayahs))}
                          </span>
                        </span>
                        <span className="check" aria-hidden="true">
                          {on ? '✓' : covered(part) ? '·' : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'range' && (
          <div className="panel stack" style={{ gap: '1rem' }}>
            <div className="range-grid">
              {surahSelect(
                range.fromSurah,
                (n) => setRange((r) => ({ ...r, fromSurah: n, fromAyah: 1 })),
                t.memorized.from,
              )}
              {ayahInput(range.fromSurah, range.fromAyah, (n) => setRange((r) => ({ ...r, fromAyah: n })))}
            </div>
            <div className="range-grid">
              {surahSelect(
                range.toSurah,
                (n) => setRange((r) => ({ ...r, toSurah: n, toAyah: quran.surah(n).ayahs })),
                t.memorized.to,
              )}
              {ayahInput(range.toSurah, range.toAyah, (n) => setRange((r) => ({ ...r, toAyah: n })))}
            </div>
            <button type="button" className="btn" onClick={addRange}>
              {t.memorized.addRange}
            </button>
          </div>
        )}
      </section>

      <button type="button" className="btn btn--primary btn--large btn--block" onClick={() => navigate('/')}>
        {t.memorized.done}
      </button>
    </div>
  )
}
