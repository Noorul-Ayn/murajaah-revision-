import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { isItemId, MODES, type ItemId } from '../lib/items'
import { GRADES, replay, type ItemState, type Review } from '../lib/srs'
import { defaultSettings, sanitizeSettings, type Settings } from '../lib/settings'

/**
 * Local, offline-first storage in IndexedDB.
 *
 * reviews     – every answer ever given (the source of truth, synced)
 * items       – memory state per item, derived from reviews (a cache)
 * kv          – settings and sync bookkeeping
 * runs        – whole-surah recitations from memory, with their slip counts (synced)
 * recordings  – the user's own recorded surahs (audio; uploaded privately when signed in)
 */

/** One recitation of a whole surah from memory, followed by the app. */
export interface Run {
  id: string
  surah: number
  /** ms since epoch */
  at: number
  slips: number
  synced: 0 | 1
}

/** The user's own recording of a surah. Only they can hear it. */
export interface Recording {
  surah: number
  blob: Blob
  mime: string
  durationMs: number
  /** Start of each ayah in ms, in order (approximate: from the recognizer). */
  timings: number[]
  recordedAt: number
  uploaded: 0 | 1
}

interface Schema extends DBSchema {
  reviews: { key: string; value: Review; indexes: { byItem: string; bySynced: number } }
  items: { key: string; value: ItemState }
  kv: { key: string; value: unknown }
  runs: { key: string; value: Run; indexes: { bySurah: number; bySynced: number } }
  recordings: { key: number; value: Recording }
}

export const DB_NAME = 'murajaah'
let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const reviews = d.createObjectStore('reviews', { keyPath: 'id' })
        reviews.createIndex('byItem', 'itemId')
        reviews.createIndex('bySynced', 'synced')
        d.createObjectStore('items', { keyPath: 'itemId' })
        d.createObjectStore('kv')
      }
      if (oldVersion < 2) {
        const runs = d.createObjectStore('runs', { keyPath: 'id' })
        runs.createIndex('bySurah', 'surah')
        runs.createIndex('bySynced', 'synced')
        d.createObjectStore('recordings', { keyPath: 'surah' })
      }
    },
  })
  return dbPromise
}

/** For tests: forget the open connection. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
}

export function isReview(v: unknown): v is Review {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(r.id) &&
    isItemId(r.itemId) &&
    typeof r.grade === 'string' &&
    (GRADES as readonly string[]).includes(r.grade) &&
    typeof r.mode === 'string' &&
    (MODES as readonly string[]).includes(r.mode) &&
    typeof r.at === 'number' &&
    Number.isFinite(r.at) &&
    r.at > 0
  )
}

export async function getSettings(): Promise<Settings> {
  const base = defaultSettings(typeof navigator === 'undefined' ? 'en' : navigator.language)
  return sanitizeSettings(await (await db()).get('kv', 'settings'), base)
}

export async function putSettings(settings: Settings): Promise<void> {
  await (await db()).put('kv', settings, 'settings')
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key)
}

export async function getAllStates(): Promise<Map<ItemId, ItemState>> {
  const all = await (await db()).getAll('items')
  return new Map(all.map((s) => [s.itemId, s]))
}

export async function getAllReviews(): Promise<Review[]> {
  return (await db()).getAll('reviews')
}

export async function countReviews(): Promise<number> {
  return (await db()).count('reviews')
}

async function recompute(d: IDBPDatabase<Schema>, itemIds: Iterable<ItemId>): Promise<Map<ItemId, ItemState>> {
  const out = new Map<ItemId, ItemState>()
  for (const itemId of new Set(itemIds)) {
    const reviews = await d.getAllFromIndex('reviews', 'byItem', itemId)
    const state = replay(itemId, reviews)
    if (state) {
      await d.put('items', state)
      out.set(itemId, state)
    } else {
      await d.delete('items', itemId)
    }
  }
  return out
}

/** Stores one answer and returns the item's new state. */
export async function addReview(review: Review): Promise<ItemState> {
  const d = await db()
  await d.put('reviews', review)
  const states = await recompute(d, [review.itemId])
  return states.get(review.itemId)!
}

/**
 * Merges reviews from the server or a backup file. Existing reviews are kept
 * as they are; only new ones are added. Returns how many were new.
 */
export async function mergeReviews(incoming: readonly Review[], synced: 0 | 1): Promise<number> {
  const d = await db()
  const touched: ItemId[] = []
  for (const r of incoming) {
    if (!isReview(r)) continue
    const existing = await d.get('reviews', r.id)
    if (existing) {
      if (synced && !existing.synced) await d.put('reviews', { ...existing, synced: 1 })
      continue
    }
    await d.put('reviews', { ...r, synced })
    touched.push(r.itemId)
  }
  await recompute(d, touched)
  return touched.length
}

/** Reviews not yet on the server, oldest first (all of them unless `limit` is given). */
export async function getUnsyncedReviews(limit?: number): Promise<Review[]> {
  return (await db()).getAllFromIndex('reviews', 'bySynced', 0, limit)
}

export async function markSynced(ids: readonly string[]): Promise<void> {
  const d = await db()
  const tx = d.transaction('reviews', 'readwrite')
  for (const id of ids) {
    const r = await tx.store.get(id)
    if (r && !r.synced) await tx.store.put({ ...r, synced: 1 })
  }
  await tx.done
}

/** After an account is deleted, its reviews belong to no account and can be pushed to a new one. */
export async function markAllUnsynced(): Promise<void> {
  const d = await db()
  const tx = d.transaction(['reviews', 'runs', 'recordings'], 'readwrite')
  for (const r of await tx.objectStore('reviews').getAll()) {
    if (r.synced) await tx.objectStore('reviews').put({ ...r, synced: 0 })
  }
  for (const r of await tx.objectStore('runs').getAll()) {
    if (r.synced) await tx.objectStore('runs').put({ ...r, synced: 0 })
  }
  for (const r of await tx.objectStore('recordings').getAll()) {
    if (r.uploaded) await tx.objectStore('recordings').put({ ...r, uploaded: 0 })
  }
  await tx.done
}

/** Removes reviews that came from a previous account, keeping offline-only ones. */
export async function removeSyncedReviews(): Promise<void> {
  const d = await db()
  const synced = await d.getAllKeysFromIndex('reviews', 'bySynced', 1)
  const syncedRuns = await d.getAllKeysFromIndex('runs', 'bySynced', 1)
  const tx = d.transaction(['reviews', 'items', 'runs', 'kv'], 'readwrite')
  for (const id of synced) await tx.objectStore('reviews').delete(id)
  for (const id of syncedRuns) await tx.objectStore('runs').delete(id)
  await tx.objectStore('items').clear()
  await tx.objectStore('kv').delete('runSync')
  await tx.objectStore('kv').delete('remoteRecordings')
  await tx.done
  const remaining = await d.getAll('reviews')
  await recompute(
    d,
    remaining.map((r) => r.itemId),
  )
}

/** Deletes all progress on this device (settings and recordings are kept). */
export async function clearProgress(): Promise<void> {
  const d = await db()
  const tx = d.transaction(['reviews', 'items', 'kv', 'runs'], 'readwrite')
  await tx.objectStore('reviews').clear()
  await tx.objectStore('items').clear()
  await tx.objectStore('runs').clear()
  await tx.objectStore('kv').delete('sync')
  await tx.objectStore('kv').delete('runSync')
  await tx.done
}

// ---------- Whole-surah runs ----------

export function isRun(v: unknown): v is Run {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(r.id) &&
    typeof r.surah === 'number' &&
    Number.isInteger(r.surah) &&
    r.surah >= 1 &&
    r.surah <= 114 &&
    typeof r.at === 'number' &&
    r.at > 0 &&
    typeof r.slips === 'number' &&
    Number.isInteger(r.slips) &&
    r.slips >= 0
  )
}

export async function addRun(run: Run): Promise<void> {
  await (await db()).put('runs', run)
}

export async function getAllRuns(): Promise<Run[]> {
  return (await db()).getAll('runs')
}

export async function getUnsyncedRuns(): Promise<Run[]> {
  return (await db()).getAllFromIndex('runs', 'bySynced', 0)
}

export async function markRunsSynced(ids: readonly string[]): Promise<void> {
  const d = await db()
  const tx = d.transaction('runs', 'readwrite')
  for (const id of ids) {
    const r = await tx.store.get(id)
    if (r && !r.synced) await tx.store.put({ ...r, synced: 1 })
  }
  await tx.done
}

/** Adds runs from the server or a backup; returns how many were new. */
export async function mergeRuns(incoming: readonly Run[], synced: 0 | 1): Promise<number> {
  const d = await db()
  let added = 0
  for (const r of incoming) {
    if (!isRun(r)) continue
    const existing = await d.get('runs', r.id)
    if (existing) {
      if (synced && !existing.synced) await d.put('runs', { ...existing, synced: 1 })
      continue
    }
    await d.put('runs', { ...r, synced })
    added++
  }
  return added
}

// ---------- Recordings ----------

export async function putRecording(rec: Recording): Promise<void> {
  await (await db()).put('recordings', rec)
}

export async function getRecording(surah: number): Promise<Recording | undefined> {
  return (await db()).get('recordings', surah)
}

export async function getRecordings(): Promise<Recording[]> {
  return (await db()).getAll('recordings')
}

export async function deleteRecording(surah: number): Promise<void> {
  await (await db()).delete('recordings', surah)
}

export interface Backup {
  app: 'murajaah'
  version: 1
  exportedAt: string
  settings: Settings
  reviews: Omit<Review, 'synced'>[]
  /** Whole-surah runs (recordings are not included: they can be large). */
  runs?: Omit<Run, 'synced'>[]
}

export async function exportBackup(): Promise<Backup> {
  const [settings, reviews, runs] = await Promise.all([getSettings(), getAllReviews(), getAllRuns()])
  return {
    app: 'murajaah',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    reviews: reviews.map(({ synced: _synced, ...r }) => r),
    runs: runs.map(({ synced: _synced, ...r }) => r),
  }
}

/** Imports a backup file. Reviews are merged; settings are taken if newer. */
export async function importBackup(value: unknown): Promise<{ added: number; settings: Settings }> {
  if (typeof value !== 'object' || value === null || (value as Backup).app !== 'murajaah') {
    throw new Error('not-a-backup')
  }
  const b = value as Partial<Backup>
  const reviews = Array.isArray(b.reviews) ? b.reviews.map((r) => ({ ...r, synced: 0 as const })) : []
  const added = await mergeReviews(reviews, 0)
  if (Array.isArray(b.runs))
    await mergeRuns(
      b.runs.map((r) => ({ ...r, synced: 0 as const })),
      0,
    )
  const current = await getSettings()
  const incoming = sanitizeSettings(b.settings, current)
  const settings = incoming.updatedAt > current.updatedAt ? incoming : current
  await putSettings(settings)
  return { added, settings }
}
