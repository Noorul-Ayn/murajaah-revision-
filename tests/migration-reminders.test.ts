// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * The reminders migration on a real Postgres (PGlite), with stand-ins for
 * Supabase's auth schema and for pg_cron, pg_net and Vault, which PGlite
 * doesn't have: the scheduled job is recorded, and HTTP calls are captured.
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

const add = (user: string, endpoint: string, extra = '') =>
  as(
    user,
    `insert into public.reminders (endpoint, p256dh, auth, minutes, timezone, lang, due)
     values ($1, 'BKey', 'auth', ${extra || "(extract(hour from now() at time zone 'UTC') * 60 + extract(minute from now() at time zone 'UTC'))::int, 'UTC', 'en', '{}'"})`,
    [endpoint],
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
    insert into auth.users values ('${A}'), ('${B}');

    create schema cron;
    create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as
      $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as
      $$ delete from cron.job where jobid = id returning true $$;
    create schema net;
    create table net.calls (url text, headers jsonb, body jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint
      language sql as $$ insert into net.calls values (url, headers, body); select 1::bigint $$;
    create schema vault;
    create view vault.decrypted_secrets as
      select * from (values ('murajaah_project_url', 'https://ref.supabase.co'), ('murajaah_reminder_secret', 's3cret'))
      as s(name, decrypted_secret);
  `)
  await db.exec(read('20261106000000_init.sql'))
  const sql = read('20261108000000_reminders.sql').replace(/^create extension.*$/gm, '')
  await db.exec(sql)
  // Running it twice must be harmless (and leave one scheduled job).
  await db.exec(sql)
}, 60_000)

describe('reminders migration', () => {
  it('schedules one job every 15 minutes', async () => {
    const jobs = await db.query<{ jobname: string; schedule: string }>('select jobname, schedule from cron.job')
    expect(jobs.rows).toEqual([{ jobname: 'murajaah-reminders', schedule: '*/15 * * * *' }])
  })

  it('keeps each user’s devices to themselves', async () => {
    await add(A, 'https://push.example/a1')
    expect((await as(B, 'select * from public.reminders')).rows).toHaveLength(0)
    expect((await as(A, 'select user_id from public.reminders')).rows).toEqual([{ user_id: A }])
    await expect(
      as(B, `update public.reminders set minutes = 1 where endpoint = 'https://push.example/a1' returning *`),
    ).resolves.toMatchObject({ rows: [] })
  })

  it('only the scheduler can pick and send reminders', async () => {
    await expect(as(A, 'select * from public.take_due_reminders()')).rejects.toThrow(/permission denied/)
    await expect(as(A, 'select public.send_due_reminders()')).rejects.toThrow(/permission denied/)
  })

  it('sends each device once a day, at its time, with today’s count', async () => {
    await db.exec(
      `update public.reminders set due = jsonb_build_object(to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), 7)`,
    )
    const sent = await db.query<{ send_due_reminders: number }>('select public.send_due_reminders()')
    expect(sent.rows[0]!.send_due_reminders).toBe(1)
    const calls = await db.query<{ url: string; headers: Record<string, string>; body: { reminders: unknown[] } }>(
      'select * from net.calls',
    )
    expect(calls.rows).toHaveLength(1)
    expect(calls.rows[0]!.url).toBe('https://ref.supabase.co/functions/v1/daily-reminder')
    expect(calls.rows[0]!.headers['x-reminder-secret']).toBe('s3cret')
    expect(calls.rows[0]!.body.reminders).toEqual([
      { endpoint: 'https://push.example/a1', p256dh: 'BKey', auth: 'auth', lang: 'en', due: 7 },
    ])
    // Already reminded today.
    expect((await db.query('select * from public.take_due_reminders()')).rows).toHaveLength(0)
  })

  it('skips a day with nothing due, a time not reached yet, and an unknown time zone', async () => {
    await add(B, 'https://push.example/b-nothing-due')
    await db.exec(
      `update public.reminders set due = jsonb_build_object(to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), 0)
       where endpoint = 'https://push.example/b-nothing-due'`,
    )
    await add(
      B,
      'https://push.example/b-later',
      `((extract(hour from now() at time zone 'UTC') * 60 + extract(minute from now() at time zone 'UTC'))::int + 90) % 1440, 'UTC', 'ar', '{}'`,
    )
    await expect(add(B, 'https://push.example/b-bad-zone', `0, 'Mars/Olympus', 'ar', '{}'`)).rejects.toThrow(
      /unknown time zone/,
    )
    const picked = await db.query('select * from public.take_due_reminders()')
    expect(picked.rows).toHaveLength(0)
  })

  it('a device that hasn’t said how much is due is still reminded', async () => {
    await add(A, 'https://push.example/a2')
    const picked = await db.query<{ endpoint: string; due: number | null }>('select * from public.take_due_reminders()')
    expect(picked.rows).toEqual([expect.objectContaining({ endpoint: 'https://push.example/a2', due: null })])
  })
})
