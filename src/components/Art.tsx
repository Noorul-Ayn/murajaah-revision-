import type { Mode } from '../lib/items'
import type { Grade3 } from '../lib/srs'

/**
 * Friendly pictures for the interface: one icon per kind of practice, icons
 * for the grades, stars, and the picture at the top of Home. Drawn with
 * plain shapes in the theme's colours, so they work in light and dark.
 */

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function ModeIcon({ mode }: { mode: Mode }) {
  switch (mode) {
    // An open mushaf: continue the ayah.
    case 'ayah':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path {...line} d="M16 9c-3-2.2-7-2.6-11-2v17c4-.6 8-.2 11 2 3-2.2 7-2.6 11-2V7c-4-.6-8-.2-11 2z" />
          <path {...line} d="M16 9v17M8.5 12h4.5M8.5 15.5h4.5M19 12h4.5M19 15.5h3" />
        </svg>
      )
    // A sunrise: how a rub' begins.
    case 'open':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path {...line} d="M5 22h22M9 22a7 7 0 0 1 14 0" />
          <path {...line} d="M16 8v3.5M7.5 11.5l2.3 2.3M24.5 11.5l-2.3 2.3M11 26h10" />
        </svg>
      )
    // A label with the rub' sign: name the rub'.
    case 'name':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path {...line} d="M5 7h12l10 9-10 9H5z" />
          <path
            d="M12 12.4l1.2 2.4 2.4 1.2-2.4 1.2-1.2 2.4-1.2-2.4-2.4-1.2 2.4-1.2z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      )
    // Two linked rings: link the quarters.
    case 'link':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect {...line} x="4" y="11" width="14" height="10" rx="5" />
          <rect {...line} x="14" y="11" width="14" height="10" rx="5" />
        </svg>
      )
    // A page of lines with one marked: where on the page.
    case 'place':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect {...line} x="7" y="4" width="18" height="24" rx="2.5" />
          <path {...line} d="M11 9.5h10M11 13.5h10M11 21.5h10M11 25h6" />
          <rect x="9.5" y="16" width="13" height="3" rx="1.5" fill="currentColor" />
        </svg>
      )
    // A speech bubble with lines: from the meaning.
    case 'meaning':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path {...line} d="M6 7h20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14l-6 5v-5H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
          <path {...line} d="M9.5 12.5h13M9.5 16.5h8" />
        </svg>
      )
    // Two cards, one over the other: similar ayahs.
    case 'pair':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect {...line} x="4" y="6" width="17" height="13" rx="2.5" />
          <rect {...line} x="11" y="13" width="17" height="13" rx="2.5" fill="var(--tile-bg, transparent)" />
          <path {...line} d="M15 18h9M15 21.5h5" />
        </svg>
      )
  }
}

export function StarIcon({ filled = true }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GradeIcon({ grade }: { grade: Grade3 }) {
  if (grade === 'perfect') return <StarIcon />
  if (grade === 'hesitated')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <clipPath id="half-star">
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
        <path
          d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"
          fill="currentColor"
          clipPath="url(#half-star)"
        />
        <path
          d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  // Not yet: go round once more.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...line} d="M5 12a7 7 0 1 0 2.1-5" />
      <path {...line} d="M5 4v4h4" />
    </svg>
  )
}

export function MicTile() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect {...line} x="12" y="5" width="8" height="14" rx="4" />
      <path {...line} d="M8 15a8 8 0 0 0 16 0M16 23v4M12 27h8" />
    </svg>
  )
}

export function BookTile() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path {...line} d="M16 9c-3-2.2-7-2.6-11-2v17c4-.6 8-.2 11 2 3-2.2 7-2.6 11-2V7c-4-.6-8-.2-11 2z" />
      <path {...line} d="M16 9v17" />
    </svg>
  )
}

/**
 * The picture at the top of Home: an open mushaf on a rahl, the folding
 * wooden stand used for reading, under a crescent and a few stars.
 */
export function HomeArt() {
  return (
    <svg className="home-art" viewBox="0 0 200 140" aria-hidden="true">
      {/* crescent */}
      <circle cx="158" cy="30" r="15" fill="var(--accent)" opacity="0.85" />
      <circle cx="165" cy="25" r="13" fill="var(--lilac)" />
      {/* stars */}
      {[
        [30, 24, 4],
        [58, 12, 2.6],
        [118, 16, 3],
        [184, 62, 2.6],
        [14, 64, 2.4],
      ].map(([x, y, r], k) => (
        <path
          key={k}
          d={`M${x} ${y! - r!}L${x! + r! * 0.35} ${y! - r! * 0.35}L${x! + r!} ${y}L${x! + r! * 0.35} ${y! + r! * 0.35}L${x} ${y! + r!}L${x! - r! * 0.35} ${y! + r! * 0.35}L${x! - r!} ${y}L${x! - r! * 0.35} ${y! - r! * 0.35}Z`}
          fill="var(--accent)"
          opacity="0.75"
        />
      ))}
      {/* rahl: two crossed boards */}
      <rect x="62" y="70" width="18" height="70" rx="5" fill="var(--orchid-ink)" transform="rotate(-38 71 105)" />
      <rect x="120" y="70" width="18" height="70" rx="5" fill="var(--orchid-ink)" transform="rotate(38 129 105)" />
      <rect x="62" y="70" width="18" height="70" rx="5" fill="#000" opacity="0.08" transform="rotate(-38 71 105)" />
      {/* the open mushaf */}
      <path d="M100 66 L56 52 L52 92 L100 104 Z" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M100 66 L144 52 L148 92 L100 104 Z" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M100 66 V104" stroke="var(--accent)" strokeWidth="2.5" />
      {[0, 1, 2].map((k) => (
        <g key={k} stroke="var(--lilac-ink)" strokeWidth="2.4" strokeLinecap="round" opacity="0.55">
          <path d={`M63 ${64 + k * 10} L92 ${73 + k * 10}`} />
          <path d={`M137 ${64 + k * 10} L108 ${73 + k * 10}`} />
        </g>
      ))}
    </svg>
  )
}
