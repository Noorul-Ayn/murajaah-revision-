-- Daily revision reminders. Each device that turns the reminder on stores its
-- push subscription, the time to be reminded (minutes after local midnight),
-- its time zone, its language, and how many questions are due on each of the
-- next few days. Every 15 minutes the database picks the devices whose time
-- has come and asks the daily-reminder Edge Function to notify them.
--
-- Before running: create the two Vault secrets this uses (see docs/SETUP.md):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'murajaah_project_url');
--   select vault.create_secret('<a long random string>', 'murajaah_reminder_secret');
-- Safe to run more than once.

create table if not exists public.reminders (
  endpoint   text primary key check (endpoint ~ '^https://' and length(endpoint) < 1024),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text not null check (length(p256dh) < 200),
  auth       text not null check (length(auth) < 100),
  minutes    smallint not null check (minutes between 0 and 1439),
  timezone   text not null check (length(timezone) < 64),
  lang       text not null check (lang in ('ar', 'en')),
  -- {"2026-11-07": 12, ...}: questions due on each local day, as the app last saw it.
  due        jsonb not null default '{}'::jsonb check (pg_column_size(due) < 2048),
  last_sent  date,
  updated_at timestamptz not null default now()
);

-- A time zone the database doesn't know would stop every reminder; refuse it.
create or replace function public.reminders_check_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists reminders_check_zone on public.reminders;
create trigger reminders_check_zone before insert or update of timezone on public.reminders
  for each row execute function public.reminders_check_zone();

alter table public.reminders enable row level security;

drop policy if exists "reminders: read own" on public.reminders;
create policy "reminders: read own" on public.reminders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "reminders: add own" on public.reminders;
create policy "reminders: add own" on public.reminders
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "reminders: change own" on public.reminders;
create policy "reminders: change own" on public.reminders
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "reminders: remove own" on public.reminders;
create policy "reminders: remove own" on public.reminders
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.reminders to authenticated;

-- The devices to remind now: their local time is within the hour after their
-- reminder time and they haven't been reminded today. Marks them as reminded.
-- A day with nothing due sends nothing.
create or replace function public.take_due_reminders()
returns table (endpoint text, p256dh text, auth text, lang text, due int)
language sql
security definer
set search_path = ''
as $$
  with local as materialized (
    select r.endpoint, (now() at time zone r.timezone) as t
    from public.reminders r
    where r.timezone in (select name from pg_catalog.pg_timezone_names)
  ),
  picked as (
    update public.reminders r
    set last_sent = l.t::date
    from local l
    where r.endpoint = l.endpoint
      and (r.last_sent is null or r.last_sent < l.t::date)
      and (extract(hour from l.t) * 60 + extract(minute from l.t)) >= r.minutes
      and (extract(hour from l.t) * 60 + extract(minute from l.t)) < r.minutes + 60
    returning r.endpoint, r.p256dh, r.auth, r.lang, (r.due ->> to_char(l.t::date, 'YYYY-MM-DD'))::int as due
  )
  select p.endpoint, p.p256dh, p.auth, p.lang, p.due from picked p where p.due is null or p.due > 0;
$$;

-- Sends the batch to the Edge Function (asynchronously, through pg_net).
create or replace function public.send_due_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into batch from public.take_due_reminders() t;
  if jsonb_array_length(batch) = 0 then
    return 0;
  end if;
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'murajaah_project_url')
      || '/functions/v1/daily-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'murajaah_reminder_secret')
    ),
    body := jsonb_build_object('reminders', batch),
    timeout_milliseconds := 10000
  );
  return jsonb_array_length(batch);
end;
$$;

-- Only the scheduler may run these.
revoke all on function public.take_due_reminders() from public, anon, authenticated;
revoke all on function public.send_due_reminders() from public, anon, authenticated;

-- @scheduling: every 15 minutes.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'murajaah-reminders';
select cron.schedule('murajaah-reminders', '*/15 * * * *', 'select public.send_due_reminders()');
