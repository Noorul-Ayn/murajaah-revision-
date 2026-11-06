import { describe, expect, it } from 'vitest'
import { dueByDay, formatTime, keyBytes, localDate, parseTime } from '../src/lib/reminders'
import type { ItemState } from '../src/lib/srs'

const state = (due: number) => ({ card: { due } }) as unknown as ItemState

describe('due counts for the reminder', () => {
  it('counts what will be due by the end of each local day, carrying over what isn’t reviewed', () => {
    const now = new Date(2026, 10, 6, 9, 0).getTime()
    const day = (d: number, h = 12) => new Date(2026, 10, 6 + d, h).getTime()
    const counts = dueByDay(
      [state(day(-3)), state(day(0, 23)), state(day(1, 0)), state(day(2)), state(day(30))],
      now,
      3,
    )
    expect(counts).toEqual({ '2026-11-06': 2, '2026-11-07': 3, '2026-11-08': 4 })
  })

  it('crosses months and years', () => {
    expect(Object.keys(dueByDay([], new Date(2026, 11, 30).getTime(), 3))).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ])
    expect(localDate(new Date(2027, 0, 5))).toBe('2027-01-05')
  })
})

describe('reminder time', () => {
  it('parses and formats HH:MM', () => {
    expect(parseTime('07:30')).toBe(450)
    expect(parseTime('23:59')).toBe(1439)
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('7')).toBeNull()
    expect(formatTime(450)).toBe('07:30')
    expect(formatTime(0)).toBe('00:00')
  })

  it('decodes a base64url public key to its 65 bytes', () => {
    const key = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
    const bytes = keyBytes(key)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(4)
  })
})
