const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** A lawh: the slate used for memorizing. */
export function LawhIcon() {
  return (
    <svg {...base}>
      <path d="M10.5 2.5h3v1.6" />
      <path d="M5 21V9.5C5 6 8.1 4.1 12 4.1S19 6 19 9.5V21z" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
    </svg>
  )
}

export function GridIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="4" width="7.5" height="6.5" rx="1.5" />
      <rect x="13" y="4" width="7.5" height="6.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="7.5" height="6.5" rx="1.5" />
      <rect x="13" y="13.5" width="7.5" height="6.5" rx="1.5" />
    </svg>
  )
}

export function SlidersIcon() {
  return (
    <svg {...base}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg {...base} width="22" height="22">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
