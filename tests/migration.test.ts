// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * Runs the Supabase migration against a real Postgres (PGlite) with a minimal
 * stand-in for Supabase's auth schema, then checks that row-level security
 * keeps users apart.
 */

const migration = readFileSync(path.resolve(__dirname, '../supabase/migrations/20261106000000_init.sql'), 'utf8')
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

const reviewSql = `insert into public.reviews (id, user_id, item_id, grade, mode, reviewed_at, created_at)
  values ($1, $2, $3, $4, $5, now(), $6)`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}');
  `)
  await db.exec(migration)
  // Running it twice must be harmless.
  await db.exec(migration)
}, 60_000)

describe('Supabase migration', () => {
  it('lets a user store and read their own reviews', async () => {
    await as(A, reviewSql, [crypto.randomUUID(), A, 'ayah:2:255', 'perfect', 'ayah', '2000-01-01'])
    const mine = await as(A, 'select item_id, created_at from public.reviews')
    expect(mine.rows).toHaveLength(1)
    // created_at comes from the server, not the client's 2000-01-01.
    expect(new Date((mine.rows[0] as { created_at: string }).created_at).getFullYear()).toBeGreaterThan(2020)
  })

  it('hides one user’s reviews from another', async () => {
    const theirs = await as(B, 'select * from public.reviews')
    expect(theirs.rows).toHaveLength(0)
  })

  it('refuses reviews written for someone else', async () => {
    await expect(as(B, reviewSql, [crypto.randomUUID(), A, 'open:3', 'missed', 'open', null])).rejects.toThrow(
      /row-level security/,
    )
  })

  it('rejects malformed reviews', async () => {
    await expect(as(A, reviewSql, [crypto.randomUUID(), A, 'ayah:2', 'perfect', 'ayah', null])).rejects.toThrow()
    await expect(as(A, reviewSql, [crypto.randomUUID(), A, 'open:3', 'great', 'open', null])).rejects.toThrow()
  })

  it('ignores a review that is already stored', async () => {
    const id = crypto.randomUUID()
    const sql = `${reviewSql.replace('$6)', 'now())')} on conflict (id) do nothing`
    await as(A, sql, [id, A, 'name:4', 'perfect', 'name'])
    await as(A, sql, [id, A, 'name:4', 'perfect', 'name'])
    const rows = await as(A, 'select * from public.reviews where id = $1', [id])
    expect(rows.rows).toHaveLength(1)
  })

  it('keeps settings private and lets the owner update them', async () => {
    await as(A, `insert into public.user_settings (user_id, data, updated_at) values ($1, '{"lang":"ar"}', now())`, [A])
    await as(A, `update public.user_settings set data = '{"lang":"en"}' where user_id = $1`, [A])
    const mine = await as(A, 'select data from public.user_settings')
    expect(mine.rows).toEqual([{ data: { lang: 'en' } }])
    const theirs = await as(B, 'select * from public.user_settings')
    expect(theirs.rows).toHaveLength(0)
    const tampered = await as(B, `update public.user_settings set data = '{}' where user_id = $1 returning *`, [A])
    expect(tampered.rows).toHaveLength(0)
  })

  it('deletes an account and everything in it', async () => {
    await as(A, 'select public.delete_own_account()')
    const left = await db.query('select count(*)::int as n from public.reviews where user_id = $1', [A])
    expect(left.rows[0]).toEqual({ n: 0 })
    const users = await db.query('select count(*)::int as n from auth.users')
    expect(users.rows[0]).toEqual({ n: 1 })
  })
})
