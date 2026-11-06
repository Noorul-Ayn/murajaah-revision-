// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * The migration for the three newer practice modes, on a real Postgres
 * (PGlite): before it, the server refuses their answers (the app keeps them
 * until it is run); after it, they are stored and malformed ones still aren't.
 */

const read = (f: string) => readFileSync(path.resolve(__dirname, '../supabase/migrations', f), 'utf8')
const A = '11111111-1111-4111-8111-111111111111'
let db: PGlite

const insert = (itemId: string, mode: string) =>
  db.query(
    `insert into public.reviews (id, user_id, item_id, grade, mode, reviewed_at) values ($1, $2, $3, 'missed', $4, now())`,
    [crypto.randomUUID(), A, itemId, mode],
  )

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
    insert into auth.users values ('${A}');
  `)
  await db.exec(read('20261106000000_init.sql'))
}, 60_000)

describe('more practice modes', () => {
  it('are refused before the migration, with a check violation', async () => {
    await expect(insert('place:2:255', 'place')).rejects.toMatchObject({ code: '23514' })
  })

  it('are stored after it, and running it twice is harmless', async () => {
    await db.exec(read('20261107000000_more_modes.sql'))
    await db.exec(read('20261107000000_more_modes.sql'))
    await insert('place:2:255', 'place')
    await insert('meaning:112:1', 'meaning')
    await insert('pair:26:123:26:141', 'pair')
    await insert('ayah:2:255', 'ayah')
    await insert('open:107', 'open')
    const rows = await db.query('select item_id from public.reviews')
    expect(rows.rows).toHaveLength(5)
  })

  it('still refuses malformed answers', async () => {
    await expect(insert('pair:2:58:7', 'pair')).rejects.toThrow()
    await expect(insert('place:2', 'place')).rejects.toThrow()
    await expect(insert('ayah:2:255', 'tafsir')).rejects.toThrow()
  })
})
