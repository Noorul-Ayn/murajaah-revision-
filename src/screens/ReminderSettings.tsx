import { useState } from 'react'
import { useSync } from '../app/SyncContext'
import { useI18n } from '../i18n/I18n'
import { formatTime, needsHomeScreen, parseTime } from '../lib/reminders'
import { ReminderFailure } from '../sync/reminders'

/** Settings → Daily reminder: on or off, and at what time. */
export function ReminderSettings() {
  const sync = useSync()
  const { t, num } = useI18n()
  const [time, setTime] = useState(() => formatTime(sync.reminder?.minutes ?? 7 * 60))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (!sync.remindersAvailable) return null

  const save = async (fn: () => Promise<void>) => {
    setBusy(true)
    setProblem(null)
    try {
      await fn()
    } catch (e) {
      const reason = e instanceof ReminderFailure ? e.reason : 'server'
      setProblem(
        reason === 'denied' ? t.reminder.denied : reason === 'unsupported' ? t.reminder.unsupported : t.reminder.failed,
      )
    } finally {
      setBusy(false)
    }
  }

  const minutes = parseTime(time) ?? 7 * 60
  const shownTime = (m: number) => formatTime(m).replace(/\d/g, (d) => num(Number(d)))

  return (
    <section className="section" aria-labelledby="reminder-h" id="reminder">
      <h2 id="reminder-h">{t.reminder.title}</h2>
      {!sync.email ? (
        <p className="muted small">{t.reminder.signIn}</p>
      ) : needsHomeScreen() ? (
        <p className="muted small">{t.reminder.homeScreen}</p>
      ) : (
        <>
          <label className="toggle">
            <input
              type="checkbox"
              role="switch"
              checked={sync.reminder !== null}
              disabled={busy}
              onChange={(e) => void save(() => (e.target.checked ? sync.setReminder(minutes) : sync.clearReminder()))}
            />
            <span>{t.reminder.toggle}</span>
          </label>
          <label className="field field--inline">
            <span>{t.reminder.time}</span>
            <input
              className="input input--time"
              type="time"
              value={time}
              disabled={busy}
              onChange={(e) => setTime(e.target.value)}
              onBlur={() => {
                const m = parseTime(time)
                if (sync.reminder && m !== null && m !== sync.reminder.minutes) void save(() => sync.setReminder(m))
              }}
            />
          </label>
          <p className="muted small" role="status">
            {busy
              ? t.reminder.saving
              : sync.reminder
                ? t.reminder.on(shownTime(sync.reminder.minutes))
                : t.reminder.hint}
          </p>
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
        </>
      )}
    </section>
  )
}
