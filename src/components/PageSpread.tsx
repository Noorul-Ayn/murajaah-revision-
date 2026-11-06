import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { isRightPage, spreadOf, type LineKind, type Spot } from '../lib/layout'

interface PageSpreadProps {
  /** The ayah asked about: the spread shown is the one it is on. */
  index: number
  /** The line tapped. */
  picked: Spot | null
  /** Lets a line be tapped; leave out once answered. */
  onPick?: (spot: Spot) => void
  /** Draw the surah titles and basmalas (a hint, and always after answering). */
  showShape: boolean
  /** After answering: number the pages and mark where the ayah is. */
  answer: boolean
}

/**
 * An open Madinah mushaf, drawn as its lines: the odd page on the right, the
 * even page on the left, fifteen lines each (eight on the first two pages).
 */
export function PageSpread({ index, picked, onPick, showShape, answer }: PageSpreadProps) {
  const { layout } = useApp()
  const { t, num } = useI18n()
  const page = layout.quran.pageOf(index)
  const start = layout.firstLine(index)
  const end = layout.lastLine(index)
  const { right, left } = spreadOf(page)

  return (
    <div className={`spread${answer ? ' spread--answer' : ''}`} dir="rtl">
      {[right, left].map((p) => {
        const side = isRightPage(p) ? 'right' : 'left'
        const shape = layout.shape(p)
        return (
          <div key={p} className="spread__page" role="group" aria-label={t.quiz.place.side[side]}>
            {shape.map((kind, k) => {
              const line = k + 1
              const shown: LineKind = showShape || answer ? kind : 'text'
              const target = answer && p === page && line >= start && line <= end
              const first = answer && p === page && line === start
              const isPicked = picked?.page === p && picked.line === line
              const cls = [
                'spread__line',
                `spread__line--${shown}`,
                target && 'spread__line--target',
                first && 'spread__line--start',
                isPicked && 'spread__line--picked',
              ]
                .filter(Boolean)
                .join(' ')
              const label =
                shown === 'text'
                  ? t.quiz.place.line(side, num(line))
                  : `${t.quiz.place.line(side, num(line))}: ${shown === 'header' ? t.quiz.place.header : t.quiz.place.basmala}`
              if (onPick) {
                return (
                  <button
                    key={k}
                    type="button"
                    className={cls}
                    aria-label={label}
                    aria-pressed={isPicked}
                    disabled={shown !== 'text'}
                    onClick={() => onPick({ page: p, line })}
                  >
                    <span />
                  </button>
                )
              }
              return (
                <div key={k} className={cls} title={isPicked ? t.quiz.place.yours : undefined}>
                  <span />
                </div>
              )
            })}
            {answer && <span className="spread__num">{num(p)}</span>}
          </div>
        )
      })}
    </div>
  )
}
