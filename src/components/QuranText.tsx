import { Fragment, type CSSProperties } from 'react'
import { useApp } from '../app/AppContext'
import { RUB_SIGN, splitWords } from '../lib/text'

const arabicDigits = new Intl.NumberFormat('ar-EG', { useGrouping: false })

/** The end-of-ayah ornament with the ayah number inside (rendered by Amiri Quran). */
export function AyahEnd({ n }: { n: number }) {
  return <span className="ayah-end">{`۝${arabicDigits.format(n)}`}</span>
}

interface AyahsProps {
  /** Global ayah indices, consecutive. */
  indices: readonly number[]
  /** Words of the first ayah already visible before the reveal (not animated). */
  alreadyShown?: number
  /** Animate the words as they appear. */
  animate?: boolean
  /** Show the basmala before ayah 1 of a surah. */
  basmala?: boolean
  className?: string
  /** The ayah being played, highlighted. */
  active?: number | null
  /** Makes each ayah tappable. */
  onAyahClick?: (index: number) => void
  /** Words to colour, by ayah index and display-word position (where two similar ayahs differ). */
  marked?: (index: number, word: number) => boolean
}

/** One or more ayahs, word by word, with ayah-end markers. */
export function Ayahs({
  indices,
  alreadyShown = 0,
  animate = false,
  basmala = false,
  className,
  active,
  onAyahClick,
  marked,
}: AyahsProps) {
  const { quran } = useApp()
  const split = indices.map((index) => splitWords(quran.text(index)))
  // Stagger the reveal across ayahs: the n-th newly shown word waits n steps.
  const offsets = split.map((_, k) =>
    split.slice(0, k).reduce((n, s, j) => n + s.words.length - (j === 0 ? alreadyShown : 0), 0),
  )
  return (
    <p className={`quran ${className ?? ''}`} lang="ar" dir="rtl" translate="no">
      {indices.map((index, k) => {
        const { ayah } = quran.keyOf(index)
        const surah = quran.surahOf(index)
        const { rubSign, words } = split[k]!
        return (
          <Fragment key={index}>
            {basmala && ayah === 1 && surah.basmala && <span className="basmala">{surah.basmala}</span>}
            <span
              className={`ayah-run${active === index ? ' ayah-run--active' : ''}${onAyahClick ? ' ayah-run--tap' : ''}`}
              data-index={index}
              onClick={onAyahClick ? () => onAyahClick(index) : undefined}
            >
              {rubSign && <span className="ayah-end">{RUB_SIGN} </span>}
              {words.map((w, i) => {
                const fresh = animate && (k > 0 || i >= alreadyShown)
                const step = offsets[k]! + i - (k === 0 ? alreadyShown : 0)
                const style = fresh ? ({ '--i': step } as CSSProperties) : undefined
                const cls = `word${fresh ? ' word--revealed' : ''}${marked?.(index, i) ? ' word--diff' : ''}`
                return (
                  <Fragment key={i}>
                    <span className={cls} style={style}>
                      {w}
                    </span>{' '}
                  </Fragment>
                )
              })}
              <AyahEnd n={ayah} />
            </span>{' '}
          </Fragment>
        )
      })}
    </p>
  )
}

/** The opening words of an ayah, with a faint wash standing in for each hidden word. */
export function PromptWords({ index, shown }: { index: number; shown: number }) {
  const { quran } = useApp()
  const { words } = splitWords(quran.text(index))
  const visible = words.slice(0, shown)
  const hidden = Math.min(words.length - visible.length, 6)
  return (
    <p className="quran" lang="ar" dir="rtl" translate="no">
      {visible.map((w, i) => (
        <Fragment key={i}>
          <span className="word">{w}</span>{' '}
        </Fragment>
      ))}
      {Array.from({ length: hidden }, (_, i) => (
        <span key={`h${i}`} className="wash" aria-hidden="true" />
      ))}
    </p>
  )
}
