import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canRecord, cleanDays, cleanToday, RUNS_TO_UNLOCK } from '../src/lib/runs'
import {
  addRun,
  closeDb,
  DB_NAME,
  exportBackup,
  getAllRuns,
  getRecording,
  getRecordings,
  importBackup,
  putRecording,
  type Recording,
} from '../src/storage/db'
import { syncNow } from '../src/sync/sync'
import { downloadRecording, syncRecordings } from '../src/sync/recordings'

const DAY = 86_400_000
const t0 = new Date(2026, 10, 1, 9).getTime()
let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('unlocking a recording', () => {
  const run = (daysAfter: number, slips = 0, surah = 112) => ({ surah, slips, at: t0 + daysAfter * DAY })

  it('needs three clean recitations on three different days', () => {
    expect(RUNS_TO_UNLOCK).toBe(3)
    expect(canRecord([run(0), run(0.1), run(0.2)], 112)).toBe(false) // same day, three times
    expect(cleanDays([run(0), run(0.1), run(1)], 112)).toBe(2)
    expect(canRecord([run(0), run(1), run(2)], 112)).toBe(true)
  })

  it('ignores runs with slips and other surahs', () => {
    expect(cleanDays([run(0), run(1, 2), run(2, 0, 113)], 112)).toBe(1)
  })

  it('knows when today already counts', () => {
    expect(cleanToday([run(0)], 112, t0 + 3600_000)).toBe(true)
    expect(cleanToday([run(0, 1)], 112, t0 + 3600_000)).toBe(false)
  })
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

describe('runs on the device', () => {
  it('are kept, and travel in backups', async () => {
    await addRun({ id: uuid(), surah: 112, at: t0, slips: 0, synced: 0 })
    const backup = JSON.parse(JSON.stringify(await exportBackup()))
    expect(backup.runs).toHaveLength(1)
    await freshDb()
    await importBackup(backup)
    expect((await getAllRuns()).map((r) => r.surah)).toEqual([112])
  })
})

/** A fake Supabase with the tables and the storage bucket, scoped to one user. */
function fakeSupabase(user = 'user-a') {
  const tables: Record<'reviews' | 'user_settings' | 'surah_runs', Record<string, unknown>[]> = {
    reviews: [],
    user_settings: [],
    surah_runs: [],
  }
  const files = new Map<string, Blob>()
  let clock = Date.UTC(2026, 10, 1)
  const client = {
    tables,
    files,
    from(table: keyof typeof tables) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [(r) => r.user_id === user]
      let range: [number, number] | null = null
      let op: 'select' | 'delete' = 'select'
      const run = () => {
        const rows = tables[table].filter((r) => filters.every((f) => f(r)))
        if (op === 'delete') {
          tables[table] = tables[table].filter((r) => !rows.includes(r))
          return { data: null, error: null }
        }
        const sorted = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        return { data: range ? sorted.slice(range[0], range[1] + 1) : sorted, error: null }
      }
      const builder = {
        select: () => builder,
        delete: () => ((op = 'delete'), builder),
        gte: (c: string, v: string) => (filters.push((r) => Date.parse(String(r[c])) >= Date.parse(v)), builder),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        order: () => builder,
        range: (a: number, b: number) => ((range = [a, b]), builder),
        maybeSingle: async () => ({ data: (run().data as unknown[])[0] ?? null, error: null }),
        // The real query builder is awaitable, so the fake must be too.
        // oxlint-disable-next-line unicorn/no-thenable
        then: (resolve: (v: unknown) => void) => resolve(run()),
        upsert: async (input: Record<string, unknown> | Record<string, unknown>[]) => {
          for (const row of Array.isArray(input) ? input : [input]) {
            const key = table === 'user_settings' ? 'user_id' : 'id'
            if (!tables[table].some((r) => r[key] === row[key])) {
              tables[table].push({ ...row, created_at: new Date((clock += 1000)).toISOString() })
            }
          }
          return { error: null }
        },
      }
      return builder
    },
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob) => (files.set(path, blob), { error: null }),
        list: async (folder: string) => ({
          data: [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => ({ name: k.split('/')[1]! })),
          error: null,
        }),
        download: async (path: string) =>
          files.has(path) ? { data: files.get(path)!, error: null } : { data: null, error: new Error('not found') },
        remove: async (paths: string[]) => (paths.forEach((p) => files.delete(p)), { error: null }),
      }),
    },
  }
  return client
}

describe('syncing runs and recordings', () => {
  it('pushes runs and pulls those from other devices', async () => {
    const server = fakeSupabase()
    await addRun({ id: uuid(), surah: 112, at: t0, slips: 0, synced: 0 })
    await syncNow(server as unknown as SupabaseClient, 'user-a')
    expect(server.tables.surah_runs).toHaveLength(1)
    server.tables.surah_runs.push({
      id: uuid(),
      user_id: 'user-a',
      surah: 112,
      slips: 0,
      run_at: new Date(t0 + DAY).toISOString(),
      created_at: new Date(Date.UTC(2026, 10, 3)).toISOString(),
    })
    const r = await syncNow(server as unknown as SupabaseClient, 'user-a')
    expect(r.pulledRuns).toBe(1)
    expect(cleanDays(await getAllRuns(), 112)).toBe(2)
  })

  it('uploads a recording privately and brings it to another device', async () => {
    const server = fakeSupabase()
    const rec: Recording = {
      surah: 112,
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      mime: 'audio/webm;codecs=opus',
      durationMs: 15_000,
      timings: [0, 4000, 7000, 11000],
      recordedAt: t0,
      uploaded: 0,
    }
    await putRecording(rec)
    const remote = await syncRecordings(server as unknown as SupabaseClient, 'user-a')
    expect([...server.files.keys()].sort()).toEqual(['user-a/112.json', 'user-a/112.webm'])
    expect(remote).toEqual([expect.objectContaining({ surah: 112, timings: [0, 4000, 7000, 11000] })])
    expect((await getRecording(112))!.uploaded).toBe(1)

    // Another device: nothing local yet, so it downloads on request.
    await freshDb()
    expect(await getRecordings()).toEqual([])
    const got = await downloadRecording(server as unknown as SupabaseClient, remote[0]!)
    expect(got.surah).toBe(112)
    expect(await getRecording(112)).toBeDefined()
  })
})
