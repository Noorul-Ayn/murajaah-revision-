// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * The recitations migration on a real Postgres (PGlite), with minimal
 * stand-ins for Supabase's auth and storage schemas. Checks that each user
 * can only reach their own runs and their own recordings.
 */

const read = (f: string) => readFileSync(path.resolve(__dirname, '../supabase/migrations', f), 'utf8')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
let db: PGlite

async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role;')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text
    );
    alter table storage.objects enable row level security;
    -- Like Supabase's: every folder segment of the path, without the file name.
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema public, auth, storage to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `)
  await db.exec(read('20261106000000_init.sql'))
  await db.exec(read('20261106020000_recitations.sql'))
  await db.exec(read('20261106020000_recitations.sql')) // running it twice is harmless
}, 60_000)

describe('recitations migration', () => {
  it('creates a private bucket', async () => {
    const b = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'recitations'`)
    expect(b.rows).toEqual([{ public: false }])
  })

  it('keeps runs private to their owner', async () => {
    await as(A, `insert into public.surah_runs (id, user_id, surah, slips, run_at) values ($1, $2, 112, 0, now())`, [
      crypto.randomUUID(),
      A,
    ])
    expect((await as(A, 'select * from public.surah_runs')).rows).toHaveLength(1)
    expect((await as(B, 'select * from public.surah_runs')).rows).toHaveLength(0)
    await expect(
      as(B, `insert into public.surah_runs (id, user_id, surah, slips, run_at) values ($1, $2, 112, 0, now())`, [
        crypto.randomUUID(),
        A,
      ]),
    ).rejects.toThrow(/row-level security/)
    await expect(
      as(A, `insert into public.surah_runs (id, user_id, surah, slips, run_at) values ($1, $2, 115, 0, now())`, [
        crypto.randomUUID(),
        A,
      ]),
    ).rejects.toThrow()
  })

  it('lets users store recordings only in their own folder', async () => {
    await as(A, `insert into storage.objects (bucket_id, name) values ('recitations', $1)`, [`${A}/112.webm`])
    await expect(
      as(B, `insert into storage.objects (bucket_id, name) values ('recitations', $1)`, [`${A}/113.webm`]),
    ).rejects.toThrow(/row-level security/)
    expect((await as(A, 'select name from storage.objects')).rows).toEqual([{ name: `${A}/112.webm` }])
    expect((await as(B, 'select name from storage.objects')).rows).toEqual([])
    const removed = await as(B, `delete from storage.objects where name = $1 returning name`, [`${A}/112.webm`])
    expect(removed.rows).toEqual([])
  })

  it('removes runs with the account', async () => {
    await as(A, 'select public.delete_own_account()')
    const left = await db.query<{ n: number }>('select count(*)::int as n from public.surah_runs')
    expect(left.rows[0]!.n).toBe(0)
  })
})
