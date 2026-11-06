import { Fragment, useLayoutEffect, useMemo, useRef } from 'react'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { RUB_SIGN } from '../lib/text'
import { AyahEnd } from './QuranText'
import { PlayIcon } from './Icons'

/** Font size the lines are measured at before being fitted to the page. */
const MEASURE_PX = 20
/** A line narrower than this share of the widest is centred, not spread across the page. */
const SHORT_LINE = 0.72

/**
 * A mushaf page drawn as printed: its fifteen lines (eight on the first two
 * pages), each holding the same words as in the user's print, with the surah
 * titles and basmalas where they fall. The text is sized so the page's widest
 * line fills the width, and each line is spread across it like the print.
 */
export function MushafLines({
  page,
  active,
  onAyahClick,
  onPlaySurah,
}: {
  page: number
  active: number | null
  onAyahClick: (index: number) => void
  /** Plays a surah from its start (the button on its title). */
  onPlaySurah: (surah: number) => void
}) {
  const { layout, quran, settings } = useApp()
  const i18n = useI18n()
  const lines = useMemo(() => layout.printedLines(page), [layout, page])
  const box = useRef<HTMLDivElement>(null)
  /** The width last fitted to, so a resize that doesn't change it is ignored. */
  const fittedWidth = useRef(-1)

  // Fit the text to the width: measure every line at a known size, then scale.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    fittedWidth.current = -1
    const fit = () => {
      const width = el.clientWidth
      if (width === fittedWidth.current) return
      fittedWidth.current = width
      el.style.fontSize = `${MEASURE_PX}px`
      el.classList.add('mushaf-lines--measure')
      const rows = [...el.querySelectorAll<HTMLElement>('.ml-text')]
      const natural = rows.map((r) => r.scrollWidth)
      el.classList.remove('mushaf-lines--measure')
      const widest = Math.max(1, ...natural)
      const max = parseFloat(getComputedStyle(el).getPropertyValue('--quran-size')) * 16 || 32
      el.style.fontSize = `${Math.min(max, (MEASURE_PX * width) / widest)}px`
      rows.forEach((r, k) => r.classList.toggle('ml-text--short', natural[k]! < widest * SHORT_LINE))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    // The Qur'an font may arrive after the first measurement.
    void document.fonts?.ready.then(() => {
      fittedWidth.current = -1
      fit()
    })
    return () => ro.disconnect()
  }, [lines, settings.textSize])

  return (
    <div
      ref={box}
      className={`mushaf-lines${page <= 2 ? ' mushaf-lines--opening' : ''}`}
      dir="rtl"
      lang="ar"
      translate="no"
    >
      {lines.map((line, k) => {
        if (line.kind !== 'text') {
          const s = quran.surah(line.surah || 1)
          return line.kind === 'header' ? (
            <div key={k} className="ml-header" data-surah={s.n}>
              <span>سورة {s.name}</span>
              <button
                type="button"
                className="ml-play"
                aria-label={i18n.t.player.playSurah(i18n.surahName(s))}
                title={i18n.t.player.playSurah(i18n.surahName(s))}
                onClick={() => onPlaySurah(s.n)}
              >
                <PlayIcon />
              </button>
            </div>
          ) : (
            <div key={k} className="ml-basmala">
              {s.basmala}
            </div>
          )
        }
        return (
          <div key={k} className="ml-text">
            {line.words.map((w, j) => (
              <Fragment key={j}>
                <span
                  className={`ml-word${active === w.ayah ? ' ml-word--active' : ''}`}
                  data-index={w.ayah}
                  onClick={() => onAyahClick(w.ayah)}
                >
                  {w.rub && `${RUB_SIGN} `}
                  {w.text}
                </span>
                {w.end !== null && (
                  <span
                    className={`ml-word ml-end${active === w.ayah ? ' ml-word--active' : ''}`}
                    onClick={() => onAyahClick(w.ayah)}
                  >
                    <AyahEnd n={w.end} />
                  </span>
                )}
              </Fragment>
            ))}
          </div>
        )
      })}
    </div>
  )
}
