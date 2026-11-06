import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getKv,
  getSettings,
  getUnsyncedReviews,
  getUnsyncedRuns,
  markRunsSynced,
  markSynced,
  mergeReviews,
  mergeRuns,
  putSettings,
  removeSyncedReviews,
  setKv,
  type Run,
} from '../storage/db'
import { sanitizeSettings, type Settings } from '../lib/settings'
import type { Grade3, Review } from '../lib/srs'
import type { Mode } from '../lib/items'

/**
 * Two-way sync with Supabase.
 *
 * Reviews are immutable and identified by UUID, so syncing is a set union:
 * push the reviews the server hasn't got, pull the ones this device hasn't
 * got, then replay. Settings are a single document; the newer copy wins.
 */

interface ReviewRow {
  id: string
  user_id: string
  item_id: string
  grade: Grade3
  mode: Mode
  reviewed_at: string
  created_at?: string
}

interface SyncMeta {
  /** Server created_at of the newest review pulled so far. */
  cursor: string
}

/** Re-read a few minutes before the cursor in case of late commits; duplicates are ignored. */
const OVERLAP_MS = 5 * 60 * 1000
const PAGE = 1000

interface RunRow {
  id: string
  user_id: string
  surah: number
  slips: number
  run_at: string
  created_at?: string
}

export interface SyncResult {
  pushed: number
  pulled: number
  /** Whole-surah runs pulled from other devices. */
  pulledRuns?: number
  /** Present when the server's settings were newer and have been applied. */
  settings?: Settings
}

const toRow =
  (userId: string) =>
  (r: Review): ReviewRow => ({
    id: r.id,
    user_id: userId,
    item_id: r.itemId,
    grade: r.grade,
    mode: r.mode,
    reviewed_at: new Date(r.at).toISOString(),
  })

const fromRow = (row: ReviewRow): Review => ({
  id: row.id,
  itemId: row.item_id,
  grade: row.grade,
  mode: row.mode,
  at: Date.parse(row.reviewed_at),
  synced: 1,
})

export async function syncNow(client: SupabaseClient, userId: string): Promise<SyncResult> {
  // A different account signed in on this device: drop the previous account's
  // synced reviews (they live on the server) but keep offline-only ones.
  const owner = await getKv<string>('owner')
  if (owner && owner !== userId) {
    await removeSyncedReviews()
    await setKv('sync', null)
  }
  await setKv('owner', userId)

  let pushed = 0
  for (;;) {
    const batch = await getUnsyncedReviews(500)
    if (batch.length === 0) break
    const { error } = await client
      .from('reviews')
      .upsert(batch.map(toRow(userId)), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    await markSynced(batch.map((r) => r.id))
    pushed += batch.length
    if (batch.length < 500) break
  }

  const meta = await getKv<SyncMeta | null>('sync')
  const since = meta?.cursor ? new Date(Date.parse(meta.cursor) - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00.000Z'
  let cursorMs = meta?.cursor ? Date.parse(meta.cursor) : 0
  let pulled = 0
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from('reviews')
      .select('id,user_id,item_id,grade,mode,reviewed_at,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as ReviewRow[]
    pulled += await mergeReviews(rows.map(fromRow), 1)
    for (const row of rows) {
      const t = row.created_at ? Date.parse(row.created_at) : NaN
      if (t > cursorMs) cursorMs = t
    }
    if (rows.length < PAGE) break
  }
  await setKv('sync', { cursor: new Date(cursorMs).toISOString() } satisfies SyncMeta)

  const pulledRuns = await syncRuns(client, userId)

  const result: SyncResult = { pushed, pulled, pulledRuns }
  const local = await getSettings()
  const { data: remote, error } = await client.from('user_settings').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const remoteSettings = remote ? sanitizeSettings((remote as { data: unknown }).data, local) : null
  if (remoteSettings && remoteSettings.updatedAt > local.updatedAt) {
    await putSettings(remoteSettings)
    result.settings = remoteSettings
  } else if (!remoteSettings || local.updatedAt > remoteSettings.updatedAt) {
    const { error: upErr } = await client.from('user_settings').upsert({
      user_id: userId,
      data: local,
      updated_at: new Date(local.updatedAt || Date.now()).toISOString(),
    })
    if (upErr) throw upErr
  }
  return result
}

/**
 * Whole-surah runs sync the same way as reviews: immutable rows with UUIDs,
 * so a union of both sides. Projects that haven't run the recitations
 * migration yet simply skip this step.
 */
async function syncRuns(client: SupabaseClient, userId: string): Promise<number> {
  const unsynced = await getUnsyncedRuns()
  if (unsynced.length) {
    const { error } = await client.from('surah_runs').upsert(
      unsynced.map((r) => ({
        id: r.id,
        user_id: userId,
        surah: r.surah,
        slips: r.slips,
        run_at: new Date(r.at).toISOString(),
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    )
    if (error) return missingTable(error) ? 0 : Promise.reject(error)
    await markRunsSynced(unsynced.map((r) => r.id))
  }
  const meta = await getKv<SyncMeta | null>('runSync')
  const since = meta?.cursor ? new Date(Date.parse(meta.cursor) - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00.000Z'
  let cursorMs = meta?.cursor ? Date.parse(meta.cursor) : 0
  let pulled = 0
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from('surah_runs')
      .select('id,user_id,surah,slips,run_at,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return missingTable(error) ? 0 : Promise.reject(error)
    const rows = (data ?? []) as RunRow[]
    pulled += await mergeRuns(
      rows.map((r): Run => ({ id: r.id, surah: r.surah, slips: r.slips, at: Date.parse(r.run_at), synced: 1 })),
      1,
    )
    for (const row of rows) {
      const t = row.created_at ? Date.parse(row.created_at) : NaN
      if (t > cursorMs) cursorMs = t
    }
    if (rows.length < PAGE) break
  }
  await setKv('runSync', { cursor: new Date(cursorMs).toISOString() } satisfies SyncMeta)
  return pulled
}

/** The table doesn't exist yet: the recitations migration hasn't been run. */
function missingTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

/** Deletes everything this user has stored on the server. */
export async function deleteCloudData(client: SupabaseClient, userId: string): Promise<void> {
  const a = await client.from('reviews').delete().eq('user_id', userId)
  if (a.error) throw a.error
  const b = await client.from('user_settings').delete().eq('user_id', userId)
  if (b.error) throw b.error
  const c = await client.from('surah_runs').delete().eq('user_id', userId)
  if (c.error && !missingTable(c.error)) throw c.error
}
