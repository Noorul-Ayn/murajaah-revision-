import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { PAGE_COUNT, type Surah } from '../lib/quran'
import { loadTranslation, TRANSLATIONS, type Translation } from '../lib/translations'
import { setKv } from '../storage/db'
import { Ayahs } from '../components/QuranText'
import { Dialog } from '../components/controls'

const arabicDigits = new Intl.NumberFormat('ar-EG', { useGrouping: false })

/** A run of consecutive ayahs from one surah on a page. */
interface Segment {
  surah: Surah
  indices: number[]
  /** The surah begins on this page, so its header (and basmala) is shown. */
  starts: boolean
}

function segmentsOf(first: number, last: number, surahOf: (i: number) => Surah): Segment[] {
  const out: Segment[] = []
  for (let i = first; i <= last; i++) {
    const surah = surahOf(i)
    const cur = out[out.length - 1]
    if (cur && cur.surah.n === surah.n) cur.indices.push(i)
    else out.push({ surah, indices: [i], starts: i === surah.start })
  }
  return out
}

type TranslationState =
  { status: 'off' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: Translation }

export function MushafPage() {
  const params = useParams()
  const page = Number(params.page)
  if (!Number.isInteger(page) || page < 1 || page > PAGE_COUNT) return <Navigate to="/mushaf" replace />
  return <Reader page={page} />
}

function Reader({ page }: { page: number }) {
  const { quran, settings, updateSettings } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()
  const [translation, setTranslation] = useState<TranslationState>({ status: 'off' })
  const [attempt, setAttempt] = useState(0)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpValue, setJumpValue] = useState('')
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [first, last] = quran.pageRange(page)
  const segments = segmentsOf(first, last, (i) => quran.surahOf(i))
  const juz = quran.juzOf(first)

  useEffect(() => {
    void setKv('lastPage', page)
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [page])

  useEffect(() => {
    if (!settings.showTranslation) return
    let live = true
    loadTranslation(settings.translation).then(
      (data) => live && setTranslation({ status: 'ready', data }),
      () => live && setTranslation({ status: 'error' }),
    )
    return () => {
      live = false
    }
  }, [settings.showTranslation, settings.translation, attempt])

  const shown: TranslationState = !settings.showTranslation
    ? { status: 'off' }
    : translation.status === 'ready' && translation.data.id !== settings.translation
      ? { status: 'loading' }
      : translation.status === 'off'
        ? { status: 'loading' }
        : translation

  const go = useCallback(
    (p: number) => {
      if (p >= 1 && p <= PAGE_COUNT) navigate(`/mushaf/${p}`, { replace: true })
    },
    [navigate],
  )

  // The mushaf opens right to left: the next page lies to the left.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (jumpOpen || target.closest('input, select, textarea, dialog')) return
      if (e.key === 'ArrowLeft') go(page + 1)
      else if (e.key === 'ArrowRight') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, page, jumpOpen])

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx > 0 ? page + 1 : page - 1)
  }

  const jump = (e: FormEvent) => {
    e.preventDefault()
    const p = Number(jumpValue)
    if (Number.isInteger(p) && p >= 1 && p <= PAGE_COUNT) {
      setJumpOpen(false)
      go(p)
    }
  }

  const surahNames = segments.map((s) => i18n.surahName(s.surah)).join(t.sep)
  const translationName = TRANSLATIONS.find((x) => x.id === settings.translation)?.name ?? ''

  const surahHeader = (s: Surah) => (
    <div className="surah-title">
      <span className="surah-title__name" lang="ar">
        سورة {s.name}
      </span>
      {i18n.lang === 'en' && <span className="surah-title__en">{s.tname}</span>}
    </div>
  )

  return (
    <div className="reader">
      <div className="reader__bar">
        <Link to="/mushaf" className="btn btn--quiet">
          {t.mushaf.index}
        </Link>
        <label className="toggle">
          <input
            type="checkbox"
            role="switch"
            checked={settings.showTranslation}
            onChange={(e) => updateSettings({ showTranslation: e.target.checked })}
          />
          <span>{t.mushaf.translation}</span>
        </label>
      </div>

      <article className="page" onPointerDown={onPointerDown} onPointerUp={onPointerUp} aria-labelledby="page-h">
        <header className="page__head">
          <h1 id="page-h" ref={headingRef} tabIndex={-1}>
            {surahNames}
          </h1>
          <span>{t.where.juz(num(juz))}</span>
        </header>

        {segments.map((seg) => (
          <section key={seg.surah.n} aria-label={i18n.surahName(seg.surah)}>
            {seg.starts && surahHeader(seg.surah)}
            {seg.starts && seg.surah.basmala && (
              <p className="quran page__basmala" lang="ar" dir="rtl">
                {seg.surah.basmala}
              </p>
            )}
            {shown.status === 'ready' ? (
              <ol className="tr-list">
                {seg.indices.map((i) => {
                  const ayah = i - seg.surah.start + 1
                  return (
                    <li key={i} className="tr-ayah">
                      <Ayahs indices={[i]} className="quran--start" />
                      <p className="translation" lang="en" dir="ltr">
                        <span className="translation__ref">
                          {seg.surah.n}:{ayah}
                        </span>{' '}
                        {shown.data.ayahs[i]}
                      </p>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <Ayahs indices={seg.indices} className="quran--page" />
            )}
          </section>
        ))}

        {shown.status === 'loading' && (
          <p className="note" role="status">
            {t.mushaf.loadingTranslation}
          </p>
        )}
        {shown.status === 'error' && (
          <div className="note" role="alert">
            <p>{t.mushaf.translationFailed}</p>
            <button type="button" className="btn btn--quiet" onClick={() => setAttempt((n) => n + 1)}>
              {t.mushaf.retry}
            </button>
          </div>
        )}
        {shown.status === 'ready' && <p className="translation__credit">{translationName}</p>}

        <footer className="page__foot" lang="ar">
          {arabicDigits.format(page)}
        </footer>
      </article>

      {/* Laid out right to left like the mushaf: previous on the right, next on the left. */}
      <nav className="reader__turn" dir="rtl" aria-label={t.mushaf.pageOf(num(page), num(PAGE_COUNT))}>
        <button type="button" className="btn" disabled={page <= 1} onClick={() => go(page - 1)}>
          <span aria-hidden="true">→</span>
          {t.mushaf.previous}
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          aria-label={t.mushaf.goTo}
          onClick={() => {
            setJumpValue(String(page))
            setJumpOpen(true)
          }}
        >
          {t.mushaf.pageOf(num(page), num(PAGE_COUNT))}
        </button>
        <button type="button" className="btn btn--primary" disabled={page >= PAGE_COUNT} onClick={() => go(page + 1)}>
          {t.mushaf.next}
          <span aria-hidden="true">←</span>
        </button>
      </nav>
      <p className="note keys-hint">{t.mushaf.swipe}</p>

      <Dialog
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        title={t.mushaf.goTo}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setJumpOpen(false)}>
              {t.settings.cancel}
            </button>
            <button type="submit" form="jump-form" className="btn btn--primary">
              {t.mushaf.go}
            </button>
          </>
        }
      >
        <form id="jump-form" onSubmit={jump}>
          <label className="field">
            <span>{t.mushaf.pageNumber}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={PAGE_COUNT}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              autoFocus
            />
          </label>
        </form>
      </Dialog>
    </div>
  )
}
