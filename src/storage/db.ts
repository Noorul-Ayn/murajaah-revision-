import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { isItemId, MODES, type ItemId } from '../lib/items'
import { GRADES, replay, type ItemState, type Review } from '../lib/srs'
import { defaultSettings, sanitizeSettings, type Settings } from '../lib/settings'

/**
 * Local, offline-first storage in IndexedDB.
 *
 * reviews  – every answer ever given (the source of truth, synced)
 * items    – memory state per item, derived from reviews (a cache)
 * kv       – settings and sync bookkeeping
 */
interface Schema extends DBSchema {
  reviews: { key: string; value: Review; indexes: { byItem: string; bySynced: number } }
  items: { key: string; value: ItemState }
  kv: { key: string; value: unknown }
}

export const DB_NAME = 'murajaah'
let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(d) {
      const reviews = d.createObjectStore('reviews', { keyPath: 'id' })
      reviews.createIndex('byItem', 'itemId')
      reviews.createIndex('bySynced', 'synced')
      d.createObjectStore('items', { keyPath: 'itemId' })
      d.createObjectStore('kv')
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

export async function getUnsyncedReviews(limit = 500): Promise<Review[]> {
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
  const tx = d.transaction('reviews', 'readwrite')
  for (const r of await tx.store.getAll()) if (r.synced) await tx.store.put({ ...r, synced: 0 })
  await tx.done
}

/** Removes reviews that came from a previous account, keeping offline-only ones. */
export async function removeSyncedReviews(): Promise<void> {
  const d = await db()
  const synced = await d.getAllKeysFromIndex('reviews', 'bySynced', 1)
  const tx = d.transaction(['reviews', 'items'], 'readwrite')
  for (const id of synced) await tx.objectStore('reviews').delete(id)
  await tx.objectStore('items').clear()
  await tx.done
  const remaining = await d.getAll('reviews')
  await recompute(
    d,
    remaining.map((r) => r.itemId),
  )
}

/** Deletes all progress on this device (settings are kept). */
export async function clearProgress(): Promise<void> {
  const d = await db()
  const tx = d.transaction(['reviews', 'items', 'kv'], 'readwrite')
  await tx.objectStore('reviews').clear()
  await tx.objectStore('items').clear()
  await tx.objectStore('kv').delete('sync')
  await tx.done
}

export interface Backup {
  app: 'murajaah'
  version: 1
  exportedAt: string
  settings: Settings
  reviews: Omit<Review, 'synced'>[]
}

export async function exportBackup(): Promise<Backup> {
  const [settings, reviews] = await Promise.all([getSettings(), getAllReviews()])
  return {
    app: 'murajaah',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    reviews: reviews.map(({ synced: _synced, ...r }) => r),
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
  const current = await getSettings()
  const incoming = sanitizeSettings(b.settings, current)
  const settings = incoming.updatedAt > current.updatedAt ? incoming : current
  await putSettings(settings)
  return { added, settings }
}
