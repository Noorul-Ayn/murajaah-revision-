import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addReview,
  clearProgress,
  closeDb,
  DB_NAME,
  exportBackup,
  getAllReviews,
  getAllStates,
  getSettings,
  getUnsyncedReviews,
  importBackup,
  mergeReviews,
  putSettings,
} from '../src/storage/db'
import { syncNow } from '../src/sync/sync'
import type { Review } from '../src/lib/srs'

let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const review = (itemId: string, grade: Review['grade'], at: number, synced: 0 | 1 = 0): Review => ({
  id: uuid(),
  itemId,
  grade,
  mode: itemId.startsWith('ayah') ? 'ayah' : 'open',
  at,
  synced,
})

async function freshDb() {
  await closeDb()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

beforeEach(freshDb)
afterEach(closeDb)

describe('local storage', () => {
  it('derives item state from the reviews it stores', async () => {
    const s1 = await addReview(review('ayah:2:255', 'missed', 1_000))
    expect(s1.reviewCount).toBe(1)
    const s2 = await addReview(review('ayah:2:255', 'perfect', 2_000))
    expect(s2.reviewCount).toBe(2)
    expect((await getAllStates()).get('ayah:2:255')).toEqual(s2)
  })

  it('merges reviews without duplicating them', async () => {
    const r = review('open:3', 'perfect', 5_000)
    expect(await mergeReviews([r, r], 0)).toBe(1)
    expect(await mergeReviews([r], 1)).toBe(0)
    expect((await getAllReviews())[0]!.synced).toBe(1)
    expect(await mergeReviews([{ ...r, id: 'not-a-uuid' } as Review], 0)).toBe(0)
  })

  it('round-trips a backup file', async () => {
    await addReview(review('ayah:1:2', 'perfect', 10))
    await putSettings({ ...(await getSettings()), memorized: [{ kind: 'juz', n: 30 }], updatedAt: 50 })
    const backup = JSON.parse(JSON.stringify(await exportBackup()))
    await freshDb()
    const { added, settings } = await importBackup(backup)
    expect(added).toBe(1)
    expect(settings.memorized).toEqual([{ kind: 'juz', n: 30 }])
    expect((await getAllStates()).size).toBe(1)
    await expect(importBackup({ hello: 'world' })).rejects.toThrow('not-a-backup')
  })

  it('clears progress but keeps settings', async () => {
    await addReview(review('ayah:1:2', 'perfect', 10))
    await putSettings({ ...(await getSettings()), lang: 'ar', updatedAt: 5 })
    await clearProgress()
    expect(await getAllReviews()).toEqual([])
    expect((await getAllStates()).size).toBe(0)
    expect((await getSettings()).lang).toBe('ar')
  })
})

/**
 * Just enough of the Supabase query builder for sync.ts, backed by arrays.
 * `user` plays the part of row-level security: queries only see that user's rows.
 */
function fakeSupabase(schema: { oldSchema?: boolean } = {}) {
  const tables: Record<'reviews' | 'user_settings' | 'surah_runs', Record<string, unknown>[]> = {
    reviews: [],
    user_settings: [],
    surah_runs: [],
  }
  let clock = Date.UTC(2026, 0, 1)
  const client = {
    tables,
    user: 'user-a',
    from(table: string) {
      const rows = tables[table as keyof typeof tables]
      const filters: ((r: Record<string, unknown>) => boolean)[] = [(r) => r.user_id === client.user]
      let range: [number, number] | null = null
      let op: 'select' | 'delete' = 'select'
      const run = () => {
        let out = rows.filter((r) => filters.every((f) => f(r)))
        if (op === 'delete') {
          tables[table as keyof typeof tables] = rows.filter((r) => !out.includes(r))
          return { data: null, error: null }
        }
        out = [...out].sort(
          (a, b) =>
            String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)),
        )
        if (range) out = out.slice(range[0], range[1] + 1)
        return { data: out, error: null }
      }
      const builder = {
        select: () => builder,
        delete: () => ((op = 'delete'), builder),
        gte: (col: string, v: string) => (filters.push((r) => Date.parse(String(r[col])) >= Date.parse(v)), builder),
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), builder),
        order: () => builder,
        range: (a: number, b: number) => ((range = [a, b]), builder),
        maybeSingle: async () => {
          const { data } = run()
          return { data: (data as unknown[])[0] ?? null, error: null }
        },
        // The real query builder is awaitable, so the fake must be too.
        // oxlint-disable-next-line unicorn/no-thenable
        then: (resolve: (v: unknown) => void) => resolve(run()),
        upsert: async (
          input: Record<string, unknown> | Record<string, unknown>[],
          opts?: { ignoreDuplicates?: boolean },
        ) => {
          const all = Array.isArray(input) ? input : [input]
          // A database from before the newer modes rejects the whole batch.
          if (
            schema.oldSchema &&
            table === 'reviews' &&
            all.some((r) => !['ayah', 'open', 'name', 'link'].includes(String(r.mode)))
          ) {
            return { error: { code: '23514', message: 'new row violates check constraint "reviews_mode_check"' } }
          }
          for (const row of all) {
            const key = table === 'reviews' ? 'id' : 'user_id'
            const i = rows.findIndex((r) => r[key] === row[key])
            const stamped = table === 'reviews' ? { ...row, created_at: new Date((clock += 1000)).toISOString() } : row
            if (i < 0) rows.push(stamped)
            else if (!opts?.ignoreDuplicates) rows[i] = stamped
          }
          return { error: null }
        },
      }
      return builder
    },
  }
  return client
}

describe('sync', () => {
  it('pushes local reviews and pulls ones from other devices', async () => {
    const server = fakeSupabase()
    const client = server as unknown as SupabaseClient
    await addReview(review('ayah:1:2', 'perfect', 1_000))

    const first = await syncNow(client, 'user-a')
    expect(first.pushed).toBe(1)
    expect(server.tables.reviews).toHaveLength(1)
    expect(await getUnsyncedReviews()).toEqual([])

    // Another device adds a review for the same user.
    server.tables.reviews.push({
      id: uuid(),
      user_id: 'user-a',
      item_id: 'ayah:1:2',
      grade: 'missed',
      mode: 'ayah',
      reviewed_at: new Date(2_000).toISOString(),
      created_at: new Date(Date.UTC(2026, 0, 2)).toISOString(),
    })
    const second = await syncNow(client, 'user-a')
    expect(second.pulled).toBe(1)
    const state = (await getAllStates()).get('ayah:1:2')!
    expect(state.reviewCount).toBe(2)
    expect(state.lastGrade).toBe('missed')

    // Nothing new: nothing moves.
    const third = await syncNow(client, 'user-a')
    expect(third).toMatchObject({ pushed: 0, pulled: 0 })
  })

  it('keeps answers from the newer modes on the device until the server accepts them', async () => {
    const server = fakeSupabase({ oldSchema: true })
    const client = server as unknown as SupabaseClient
    await addReview(review('ayah:1:2', 'perfect', 1_000))
    await addReview({ ...review('place:1:2', 'hesitated', 2_000), mode: 'place' })
    await addReview({ ...review('pair:2:58:7:161', 'missed', 3_000), mode: 'pair' })

    const first = await syncNow(client, 'user-a')
    expect(first).toMatchObject({ pushed: 1, held: 2 })
    expect(server.tables.reviews.map((r) => r.item_id)).toEqual(['ayah:1:2'])
    expect((await getUnsyncedReviews()).map((r) => r.itemId).sort()).toEqual(['pair:2:58:7:161', 'place:1:2'])
    // Their progress still counts on this device.
    expect((await getAllStates()).get('place:1:2')?.lastGrade).toBe('hesitated')

    // Once the migration has been run, they go up with the next sync.
    const updated = fakeSupabase()
    updated.tables.reviews.push(...server.tables.reviews)
    const second = await syncNow(updated as unknown as SupabaseClient, 'user-a')
    expect(second.pushed).toBe(2)
    expect(second.held).toBeUndefined()
    expect(await getUnsyncedReviews()).toEqual([])
  })

  it('keeps the newer copy of settings', async () => {
    const server = fakeSupabase()
    const client = server as unknown as SupabaseClient
    await putSettings({ ...(await getSettings()), lang: 'en', updatedAt: 100 })
    await syncNow(client, 'user-a')
    expect((server.tables.user_settings[0] as { data: { lang: string } }).data.lang).toBe('en')

    server.tables.user_settings[0] = {
      user_id: 'user-a',
      data: { ...(await getSettings()), lang: 'ar', updatedAt: 200 },
      updated_at: new Date(200).toISOString(),
    }
    const result = await syncNow(client, 'user-a')
    expect(result.settings?.lang).toBe('ar')
    expect((await getSettings()).lang).toBe('ar')
  })

  it('drops a previous account’s reviews when someone else signs in', async () => {
    const server = fakeSupabase()
    const client = server as unknown as SupabaseClient
    await addReview(review('ayah:1:2', 'perfect', 1_000))
    await syncNow(client, 'user-a')
    await addReview(review('ayah:1:3', 'perfect', 2_000)) // offline, not yet synced
    server.user = 'user-b'
    await syncNow(client, 'user-b')
    const local = await getAllReviews()
    // user-a's synced review is gone from this device; the offline one moves to user-b.
    expect(local.map((r) => r.itemId)).toEqual(['ayah:1:3'])
    expect(server.tables.reviews.filter((r) => r.user_id === 'user-b')).toHaveLength(1)
  })
})
