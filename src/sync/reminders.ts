import type { SupabaseClient } from '@supabase/supabase-js'
import { getKv, setKv } from '../storage/db'
import { keyBytes, VAPID_PUBLIC_KEY } from '../lib/reminders'

/**
 * The reminder on this device: its push subscription, stored in the
 * account's `reminders` table (one row per device), so the database's
 * scheduled job can notify it at the chosen time.
 */

export interface LocalReminder {
  /** Minutes after local midnight. */
  minutes: number
  /** This device's push subscription address, as stored. */
  endpoint: string
}

const KEY = 'reminder'

export const getLocalReminder = () => getKv<LocalReminder | null>(KEY).then((r) => r ?? null)

export type ReminderError = 'denied' | 'unsupported' | 'server'

export class ReminderFailure extends Error {
  readonly reason: ReminderError
  constructor(reason: ReminderError, detail?: string) {
    super(detail ?? reason)
    this.reason = reason
  }
}

async function subscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
}

function row(sub: PushSubscription, minutes: number, lang: 'ar' | 'en', due: Record<string, number>) {
  const json = sub.toJSON()
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    minutes,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    lang,
    due,
    updated_at: new Date().toISOString(),
  }
}

/** Turns the reminder on (or changes its time): asks for permission, subscribes, and saves the subscription. */
export async function enableReminder(
  client: SupabaseClient,
  minutes: number,
  lang: 'ar' | 'en',
  due: Record<string, number>,
): Promise<LocalReminder> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new ReminderFailure('denied')
  let sub: PushSubscription
  try {
    sub = await subscription()
  } catch (e) {
    throw new ReminderFailure('unsupported', e instanceof Error ? e.message : String(e))
  }
  const before = await getLocalReminder()
  const { error } = await client.from('reminders').upsert(row(sub, minutes, lang, due), { onConflict: 'endpoint' })
  if (error) throw new ReminderFailure('server', error.message)
  if (before && before.endpoint !== sub.endpoint)
    await client.from('reminders').delete().eq('endpoint', before.endpoint)
  const local = { minutes, endpoint: sub.endpoint }
  await setKv(KEY, local)
  return local
}

/** Turns the reminder off on this device. */
export async function disableReminder(client: SupabaseClient | null): Promise<void> {
  const local = await getLocalReminder()
  await setKv(KEY, null)
  if (local && client) await client.from('reminders').delete().eq('endpoint', local.endpoint)
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    await (await reg?.pushManager.getSubscription())?.unsubscribe()
  } catch {
    // Nothing more to undo.
  }
}

/**
 * After a sync: keeps the stored subscription current (browsers sometimes
 * replace it) and updates the due counts, language and time zone.
 */
export async function refreshReminder(
  client: SupabaseClient,
  lang: 'ar' | 'en',
  due: Record<string, number>,
): Promise<void> {
  const local = await getLocalReminder()
  if (!local || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const sub = await subscription()
  const { error } = await client
    .from('reminders')
    .upsert(row(sub, local.minutes, lang, due), { onConflict: 'endpoint' })
  if (error) throw error
  if (sub.endpoint !== local.endpoint) {
    await client.from('reminders').delete().eq('endpoint', local.endpoint)
    await setKv(KEY, { ...local, endpoint: sub.endpoint })
  }
}
