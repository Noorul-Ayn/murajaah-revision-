import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useApp } from '../app/AppContext'
import { useSync } from '../app/SyncContext'
import { useI18n } from '../i18n/I18n'
import { scopeMask } from '../lib/scope'
import { cleanDays, RUNS_TO_UNLOCK } from '../lib/runs'
import { getAllRuns, getRecordings, type Run } from '../storage/db'

export function ReciteIndex() {
  const { quran, settings, recitations } = useApp()
  const sync = useSync()
  const { t, num } = useI18n()
  const [runs, setRuns] = useState<Run[]>([])
  const [recorded, setRecorded] = useState<Set<number>>(new Set())

  useEffect(() => {
    let live = true
    void Promise.all([getAllRuns(), getRecordings()]).then(([r, recs]) => {
      if (!live) return
      setRuns(r)
      setRecorded(new Set(recs.map((x) => x.surah)))
    })
    return () => {
      live = false
    }
  }, [recitations])

  // Surahs memorized in full.
  const surahs = useMemo(() => {
    const mask = scopeMask(settings.memorized, quran)
    return quran.surahs.filter((s) => {
      for (let i = s.start; i < s.start + s.ayahs; i++) if (!mask[i]) return false
      return true
    })
  }, [settings.memorized, quran])

  const remote = new Set(sync.remoteRecordings.map((r) => r.surah))

  return (
    <div className="stack">
      <div className="section">
        <h1>{t.recite.title}</h1>
        <p className="muted">{t.recite.intro}</p>
      </div>

      {surahs.length === 0 ? (
        <div className="section">
          <p>{t.recite.none}</p>
          <Link to="/memorized" className="btn btn--primary">
            {t.recite.chooseMemorized}
          </Link>
        </div>
      ) : (
        <ul className="surahs surahs--index">
          {surahs.map((s) => {
            const days = Math.min(cleanDays(runs, s.n), RUNS_TO_UNLOCK)
            const has = recorded.has(s.n) || remote.has(s.n)
            return (
              <li key={s.n}>
                <Link to={`/recite/${s.n}`} className="surah-row">
                  <span className="surah-row__n">{num(s.n)}</span>
                  <span>
                    <span className="surah-row__name" lang="ar" translate="no">
                      {s.name}
                    </span>
                    <br />
                    <span className="surah-row__meta">
                      {has
                        ? t.recite.recorded
                        : days >= RUNS_TO_UNLOCK
                          ? t.recite.ready
                          : t.recite.clean(num(days), num(RUNS_TO_UNLOCK))}
                    </span>
                  </span>
                  <span className="pips" aria-hidden="true">
                    {Array.from({ length: RUNS_TO_UNLOCK }, (_, k) => (
                      <i key={k} className={k < days ? 'pip pip--on' : 'pip'} />
                    ))}
                    {has && <i className="pip pip--rec" />}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
