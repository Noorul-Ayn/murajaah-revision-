import { Fragment, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { RUB_SIGN, splitWords } from '../lib/text'
import type { Expected, Follow } from '../lib/recitation'
import { AyahEnd } from './QuranText'

interface Props {
  indices: readonly number[]
  expected: readonly Expected[]
  result: Follow
  /** Uthmani words of the first ayah shown as the prompt. */
  promptWords: number
  /** Show every word (after the answer is revealed), marking the slips. */
  complete: boolean
  basmala?: boolean
}

const MAX_WASHES = 6

/**
 * The text as it is being recited: words appear once they are said
 * correctly, a wrong word is replaced by the right one in red, and the rest
 * stays hidden under a wash.
 */
export function RecitationBoard({ indices, expected, result, promptWords, complete, basmala }: Props) {
  const { quran } = useApp()

  // Expected positions belonging to each displayed word, keyed "ayah:word".
  const positions = new Map<string, number[]>()
  expected.forEach((e, k) => {
    const key = `${e.ayah}:${e.word}`
    positions.set(key, [...(positions.get(key) ?? []), k])
  })

  const out: ReactNode[] = []
  let washes = 0
  for (let a = 0; a < indices.length; a++) {
    const index = indices[a]!
    const { rubSign, words } = splitWords(quran.text(index))
    const surah = quran.surahOf(index)
    const ayahNo = quran.keyOf(index).ayah
    const parts: ReactNode[] = []
    let anyShown = false
    let allSaid = true
    for (let i = 0; i < words.length; i++) {
      const pos = positions.get(`${index}:${i}`) ?? []
      const isPrompt = a === 0 && i < promptWords
      const said = isPrompt || (pos.length > 0 && pos.every((p) => p < result.next))
      const slipped = pos.some((p) => result.slips.has(p))
      const wrongNow = !complete && result.stuck && pos.includes(result.next)
      if (!said) allSaid = false
      if (complete || said || wrongNow) {
        anyShown = true
        const cls = wrongNow ? 'rw rw--wrong' : slipped ? 'rw rw--slip' : isPrompt ? 'rw' : 'rw rw--said'
        parts.push(
          <Fragment key={i}>
            <span className={cls}>{words[i]}</span>{' '}
          </Fragment>,
        )
      } else if (washes < MAX_WASHES) {
        washes++
        parts.push(<span key={i} className="wash" aria-hidden="true" />)
      }
    }
    out.push(
      <Fragment key={index}>
        {basmala && complete && surah.basmala && ayahNo === 1 && <span className="basmala">{surah.basmala}</span>}
        {rubSign && anyShown && <span className="ayah-end">{RUB_SIGN} </span>}
        {parts}
        {(complete || allSaid) && (
          <>
            <AyahEnd n={ayahNo} />{' '}
          </>
        )}
      </Fragment>,
    )
  }

  return (
    <p className="quran" lang="ar" dir="rtl" translate="no">
      {out}
    </p>
  )
}
