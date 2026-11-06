import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useSync } from '../app/SyncContext'
import { useI18n } from '../i18n/I18n'
import { itemsInScope } from '../lib/items'
import { activity, quarterProgress } from '../lib/progress'
import { cleanDays, RUNS_TO_UNLOCK } from '../lib/runs'
import { scopeMask } from '../lib/scope'
import { isDue, type Strength } from '../lib/srs'
import { getAllReviews, getAllRuns, getKv, getRecordings } from '../storage/db'
import type { QuizRequest } from './Quiz'
import { BookTile, HomeArt, MicTile, StarIcon } from '../components/Art'

const STRENGTHS: readonly Strength[] = ['weak', 'shaky', 'good', 'strong', 'none']

export function Home() {
  const { quran, settings, states, changes, recitations } = useApp()
  const sync = useSync()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const [act, setAct] = useState<{ today: number; streak: number } | null>(null)
  const [lastPage, setLastPage] = useState<number | null>(null)
  const [recite, setRecite] = useState<{ surah: number; days: number; ready: boolean } | null>(null)

  const memorized = settings.memorized
  const mask = useMemo(() => scopeMask(memorized, quran), [memorized, quran])

  useEffect(() => {
    let live = true
    void getAllReviews().then((r) => live && setAct(activity(r, Date.now())))
    void getKv<number>('lastPage').then((p) => live && setLastPage(typeof p === 'number' ? p : null))
    return () => {
      live = false
    }
  }, [changes])

  // The surah closest to being recorded, or one ready to record.
  useEffect(() => {
    let live = true
    void Promise.all([getAllRuns(), getRecordings()]).then(([runs, recs]) => {
      if (!live) return
      const recorded = new Set([...recs.map((r) => r.surah), ...sync.remoteRecordings.map((r) => r.surah)])
      const full = quran.surahs.filter((s) => {
        for (let i = s.start; i < s.start + s.ayahs; i++) if (!mask[i]) return false
        return true
      })
      const candidates = full
        .filter((s) => !recorded.has(s.n))
        .map((s) => ({ surah: s.n, days: cleanDays(runs, s.n) }))
        .filter((c) => c.days > 0)
        .sort((a, b) => b.days - a.days)
      const best = candidates[0]
      setRecite(best ? { ...best, ready: best.days >= RUNS_TO_UNLOCK } : null)
    })
    return () => {
      live = false
    }
  }, [recitations, mask, quran, sync.remoteRecordings])

  const items = useMemo(
    () => itemsInScope(settings.mode, mask, quran, states.keys()),
    [settings.mode, mask, quran, states],
  )
  const due = useMemo(
    () =>
      items.filter((id) => {
        const s = states.get(id)
        return s !== undefined && isDue(s, now)
      }).length,
    [items, states, now],
  )

  const map = useMemo(() => quarterProgress(quran, mask, states, 'all', now), [quran, mask, states, now])
  const counts = useMemo(() => {
    const c: Record<Strength, number> = { none: 0, weak: 0, shaky: 0, good: 0, strong: 0 }
    for (const q of map) if (q.strength !== 'out') c[q.strength]++
    return c
  }, [map])
  const memorizedQuarters = STRENGTHS.reduce((n, s) => n + counts[s], 0)

  const hijri = new Intl.DateTimeFormat(`${i18n.lang === 'ar' ? 'ar-SA' : 'en'}-u-ca-islamic-umalqura`, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const gregorian = new Intl.DateTimeFormat(i18n.lang === 'ar' ? 'ar-EG' : 'en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  // ---------- First visit ----------
  if (memorized.length === 0) {
    return (
      <div className="stack">
        <section className="hero">
          <div className="hero__text">
            <p className="hero__hello">{t.home.greeting(settings.name)}</p>
            <h1>{t.home.welcomeTitle}</h1>
          </div>
          <HomeArt />
        </section>
        <p className="muted">{t.home.welcomeBody}</p>
        <ul className="features">
          <li>
            <h2>{t.home.featurePractice}</h2>
            <p className="muted">{t.home.featurePracticeBody}</p>
          </li>
          <li>
            <h2>{t.home.featureMushaf}</h2>
            <p className="muted">{t.home.featureMushafBody}</p>
          </li>
          <li>
            <h2>{t.home.featureRecite}</h2>
            <p className="muted">{t.home.featureReciteBody}</p>
          </li>
        </ul>
        <div className="section">
          <Link to="/memorized" className="btn btn--primary btn--large btn--block">
            {t.home.start}
          </Link>
          <Link to="/mushaf/1" className="btn btn--large btn--block">
            {t.home.openMushaf}
          </Link>
        </div>
      </div>
    )
  }

  const size = Math.min(settings.sessionSize, items.length)
  const start = () => {
    const request: QuizRequest = {
      mode: settings.mode,
      scope: memorized,
      size: settings.sessionSize,
      order: settings.order,
    }
    navigate('/quiz', { state: request })
  }

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero__text">
          <h1>{t.home.greeting(settings.name)}</h1>
          <p className="hero__date">
            {hijri}
            <br />
            <span>{gregorian}</span>
          </p>
        </div>
        <HomeArt />
      </section>

      <section className="section" aria-labelledby="today-h">
        <h2 id="today-h">{t.home.today}</h2>
        <div className="today">
          <div className="today__item today__item--lilac">
            <strong>{num(due)}</strong>
            <span>{t.home.due}</span>
          </div>
          <div className="today__item today__item--iris">
            <strong>{act ? num(act.today) : '–'}</strong>
            <span>{t.home.answered}</span>
          </div>
          <div className="today__item today__item--orchid">
            <strong>
              {act ? num(act.streak) : '–'}
              <StarIcon />
            </strong>
            <span>{t.home.streak}</span>
          </div>
        </div>
        {due === 0 && <p className="muted small">{t.home.nothingDue}</p>}
        <button
          type="button"
          className="btn btn--primary btn--large btn--block"
          disabled={items.length === 0}
          onClick={start}
        >
          {t.home.startRevision(size, num(size))}
        </button>
        <p className="row small" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{t.home.mode(t.modes[settings.mode].title)}</span>
          <Link to="/practice">{t.home.changePractice}</Link>
        </p>
      </section>

      <Link to={`/mushaf/${lastPage ?? 1}`} className="continue continue--tile" data-tone="iris">
        <BookTile />
        <span className="continue__label">{lastPage ? t.home.continueReading : t.home.openMushaf}</span>
        <span className="continue__where">
          {lastPage
            ? t.mushaf.continueAt(num(lastPage), i18n.surahName(quran.surahOf(quran.pageRange(lastPage)[0])))
            : t.home.startReading}
        </span>
      </Link>

      <Link to={recite ? `/recite/${recite.surah}` : '/recite'} className="continue continue--tile" data-tone="orchid">
        <MicTile />
        <span className="continue__label">{t.recite.title}</span>
        <span className="continue__where">
          {recite
            ? recite.ready
              ? t.home.recitationReady(i18n.surahName(quran.surah(recite.surah)))
              : t.home.recitationNext(i18n.surahName(quran.surah(recite.surah)), num(recite.days), num(RUNS_TO_UNLOCK))
            : t.recite.open}
        </span>
      </Link>

      <section className="section" aria-labelledby="mem-h">
        <div className="section__head">
          <h2 id="mem-h">{t.home.memorization}</h2>
          <Link to="/progress" className="btn btn--quiet">
            {t.home.seeProgress}
          </Link>
        </div>
        <p className="muted small">{t.memorized.quarters(memorizedQuarters, num(memorizedQuarters))}</p>
        <div
          className="strength-bar"
          role="img"
          aria-label={STRENGTHS.map((s) => `${t.progress.legend[s]} ${num(counts[s])}`).join(t.sep)}
        >
          {STRENGTHS.filter((s) => counts[s] > 0).map((s) => (
            <span key={s} className="cell" data-s={s} style={{ flexGrow: counts[s] }} />
          ))}
        </div>
        <div className="legend">
          {STRENGTHS.filter((s) => counts[s] > 0).map((s) => (
            <span key={s}>
              <i className="cell" data-s={s} aria-hidden="true" />
              {t.progress.legend[s]} {num(counts[s])}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
