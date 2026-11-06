import type { CSSProperties } from 'react'
import { StarIcon } from './Art'

/** A small burst of stars for a perfect answer. Skipped when motion is reduced. */
export function Burst() {
  return (
    <div className="burst" aria-hidden="true">
      {Array.from({ length: 8 }, (_, k) => (
        <span key={k} style={{ '--a': `${k * 45 + 10}deg`, '--d': `${70 + (k % 3) * 18}px` } as CSSProperties}>
          <StarIcon />
        </span>
      ))}
    </div>
  )
}
