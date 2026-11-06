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
}

/** One or more ayahs, word by word, with ayah-end markers. */
export function Ayahs({ indices, alreadyShown = 0, animate = false, basmala = false, className }: AyahsProps) {
  const { quran } = useApp()
  const split = indices.map((index) => splitWords(quran.text(index)))
  // Stagger the reveal across ayahs: the n-th newly shown word waits n steps.
  const offsets = split.map((_, k) =>
    split.slice(0, k).reduce((n, s, j) => n + s.words.length - (j === 0 ? alreadyShown : 0), 0),
  )
  return (
    <p className={`quran ${className ?? ''}`} lang="ar" dir="rtl">
      {indices.map((index, k) => {
        const { ayah } = quran.keyOf(index)
        const surah = quran.surahOf(index)
        const { rubSign, words } = split[k]!
        return (
          <Fragment key={index}>
            {basmala && ayah === 1 && surah.basmala && <span className="basmala">{surah.basmala}</span>}
            {rubSign && <span className="ayah-end">{RUB_SIGN} </span>}
            {words.map((w, i) => {
              const fresh = animate && (k > 0 || i >= alreadyShown)
              const step = offsets[k]! + i - (k === 0 ? alreadyShown : 0)
              const style = fresh ? ({ '--i': step } as CSSProperties) : undefined
              return (
                <Fragment key={i}>
                  <span className={fresh ? 'word word--revealed' : 'word'} style={style}>
                    {w}
                  </span>{' '}
                </Fragment>
              )
            })}
            <AyahEnd n={ayah} />{' '}
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
    <p className="quran" lang="ar" dir="rtl">
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
