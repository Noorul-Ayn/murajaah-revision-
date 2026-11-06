-- Murajaah: whole-surah runs and private recordings.
-- Run once in the Supabase SQL editor, after 20261106000000_init.sql.
-- Running it again is harmless.

-- Recitations of a whole surah from memory, with the number of slips the app
-- heard. Three clean runs on different days unlock recording that surah.
create table if not exists public.surah_runs (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  surah      smallint not null check (surah between 1 and 114),
  slips      integer not null check (slips >= 0),
  run_at     timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists surah_runs_user_created_idx on public.surah_runs (user_id, created_at, id);

create or replace function public.surah_runs_set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists surah_runs_set_created_at on public.surah_runs;
create trigger surah_runs_set_created_at
  before insert on public.surah_runs
  for each row execute function public.surah_runs_set_created_at();

alter table public.surah_runs enable row level security;

drop policy if exists "runs: read own" on public.surah_runs;
create policy "runs: read own" on public.surah_runs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "runs: insert own" on public.surah_runs;
create policy "runs: insert own" on public.surah_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "runs: delete own" on public.surah_runs;
create policy "runs: delete own" on public.surah_runs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.surah_runs to authenticated;

-- A private storage bucket for recordings. Files live under the owner's id,
-- e.g. <user id>/112.webm and <user id>/112.json, and only the owner can
-- read or change them. Nothing in it is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recitations',
  'recitations',
  false,
  52428800,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'application/json']
)
on conflict (id) do update set public = false;

drop policy if exists "recitations: read own" on storage.objects;
create policy "recitations: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'recitations' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recitations: insert own" on storage.objects;
create policy "recitations: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recitations' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recitations: update own" on storage.objects;
create policy "recitations: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'recitations' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recitations' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recitations: delete own" on storage.objects;
create policy "recitations: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recitations' and (storage.foldername(name))[1] = (select auth.uid())::text);
