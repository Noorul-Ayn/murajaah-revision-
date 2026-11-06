import { useNavigate } from 'react-router'
import { useApp } from '../app/AppContext'
import { useI18n } from '../i18n/I18n'
import { verseLabel } from '../i18n/labels'
import { parseItem, itemAyahIndex, type ItemId } from '../lib/items'
import type { Grade3 } from '../lib/srs'
import { openingText } from '../lib/text'
import type { QuizRequest } from './Quiz'

export interface Result {
  itemId: ItemId
  grade: Grade3
}

export function Summary({ results }: { results: Result[] }) {
  const { quran } = useApp()
  const i18n = useI18n()
  const { t, num } = i18n
  const navigate = useNavigate()

  // An item needs review if any answer to it this session wasn't perfect.
  const worst = new Map<ItemId, Grade3>()
  const rank = { missed: 0, hesitated: 1, perfect: 2 }
  for (const r of results) {
    const w = worst.get(r.itemId)
    if (!w || rank[r.grade] < rank[w]) worst.set(r.itemId, r.grade)
  }
  const count = (g: Grade3) => results.filter((r) => r.grade === g).length
  const toReview = [...worst.entries()].filter(([, g]) => g !== 'perfect').map(([id]) => id)

  const describe = (id: ItemId) => {
    const p = parseItem(id)
    if (!p) return { label: id, index: 0 }
    if (p.mode === 'ayah') {
      const index = itemAyahIndex(quran, id)!
      return { label: verseLabel(i18n, quran, index), index }
    }
    const index = quran.quarterStart(p.quarter)
    return { label: `${i18n.quarterLabel(p.quarter)}${t.sep}${t.modes[p.mode].title}`, index }
  }

  const again = () => {
    const first = parseItem(toReview[0]!)
    const request: QuizRequest = { mode: first?.mode ?? 'ayah', itemIds: toReview }
    navigate('/quiz', { state: request })
  }

  return (
    <div className="stack">
      <div className="section">
        <h1 tabIndex={-1} ref={(el) => el?.focus()} style={{ outline: 'none' }}>
          {t.summary.title}
        </h1>
        <p className="visually-hidden">
          {t.summary.counts(num(count('perfect')), num(count('hesitated')), num(count('missed')))}
        </p>
      </div>

      <div className="tally" aria-hidden="true">
        <div className="t-perfect">
          <strong>{num(count('perfect'))}</strong>
          {t.quiz.grades.perfect}
        </div>
        <div className="t-hesitated">
          <strong>{num(count('hesitated'))}</strong>
          {t.quiz.grades.hesitated}
        </div>
        <div className="t-missed">
          <strong>{num(count('missed'))}</strong>
          {t.quiz.grades.missed}
        </div>
      </div>

      {toReview.length > 0 ? (
        <section className="section" aria-labelledby="review-h">
          <h2 id="review-h">{t.summary.toReview}</h2>
          <ul className="review-list">
            {toReview.map((id) => {
              const { label, index } = describe(id)
              return (
                <li key={id}>
                  <span className="quran" lang="ar" dir="rtl" translate="no">
                    {openingText(quran.text(index), 5)}
                  </span>
                  <span className="muted small">{label}</span>
                </li>
              )
            })}
          </ul>
          <button type="button" className="btn btn--primary btn--large btn--block" onClick={again}>
            {t.summary.again}
          </button>
        </section>
      ) : (
        <p>{t.summary.clean}</p>
      )}

      <button type="button" className="btn btn--block" onClick={() => navigate('/')}>
        {t.summary.back}
      </button>
    </div>
  )
}
