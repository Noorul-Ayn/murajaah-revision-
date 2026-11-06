/**
 * The daily revision reminder, on the device's side: whether it can work
 * here, and how many questions fall due on each of the coming days (sent
 * along so the notification can say "12 questions are due").
 */

import type { ItemState } from './srs'

/** The web push public key this build was made with (empty when reminders aren't set up). */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/** Days ahead the due counts cover, so a few days away from the app still get a count. */
export const DUE_DAYS = 8

/** Whether this build and this browser can deliver reminders at all. */
export function remindersSupported(): boolean {
  return (
    VAPID_PUBLIC_KEY.length > 0 &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iPhones and iPads deliver web push only to an app added to the Home Screen. */
export function needsHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  return ios && !standalone
}

/** A local calendar date as YYYY-MM-DD. */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * How many items will be due by the end of each of the next `days` local
 * days (today first). An item due today and not reviewed is still due tomorrow.
 */
export function dueByDay(states: Iterable<ItemState>, now: number, days = DUE_DAYS): Record<string, number> {
  const ends: { date: string; end: number }[] = []
  const d = new Date(now)
  for (let k = 0; k < days; k++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k)
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k + 1).getTime() - 1
    ends.push({ date: localDate(day), end })
  }
  const out: Record<string, number> = Object.fromEntries(ends.map((e) => [e.date, 0]))
  for (const s of states) {
    for (const e of ends) if (s.card.due <= e.end) out[e.date]!++
  }
  return out
}

/** Minutes after midnight from "HH:MM", or null. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

export function formatTime(minutes: number): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(minutes / 60))}:${p(minutes % 60)}`
}

/** A web push public key in base64url, as the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const s = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
