-- Murajaah: schema for accounts and sync.
-- Run once in the Supabase SQL editor (or with `supabase db push`).
--
-- Each user can only ever read and write their own rows (row-level security).
-- Reviews are append-only: they are never updated, only inserted or deleted.

create table if not exists public.reviews (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     text not null check (item_id ~ '^(open|name|link):[0-9]{1,3}$|^ayah:[0-9]{1,3}:[0-9]{1,3}$'),
  grade       text not null check (grade in ('missed', 'hesitated', 'perfect')),
  mode        text not null check (mode in ('open', 'name', 'link', 'ayah')),
  reviewed_at timestamptz not null,
  -- Set by the server; clients use it to pull only what is new.
  created_at  timestamptz not null default now()
);

create index if not exists reviews_user_created_idx on public.reviews (user_id, created_at, id);

-- created_at must come from the server clock, whatever the client sends.
create or replace function public.reviews_set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists reviews_set_created_at on public.reviews;
create trigger reviews_set_created_at
  before insert on public.reviews
  for each row execute function public.reviews_set_created_at();

alter table public.reviews enable row level security;

drop policy if exists "reviews: read own" on public.reviews;
create policy "reviews: read own" on public.reviews
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "reviews: insert own" on public.reviews;
create policy "reviews: insert own" on public.reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "reviews: delete own" on public.reviews;
create policy "reviews: delete own" on public.reviews
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null check (pg_column_size(data) < 65536),
  updated_at timestamptz not null
);

alter table public.user_settings enable row level security;

drop policy if exists "settings: read own" on public.user_settings;
create policy "settings: read own" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "settings: insert own" on public.user_settings;
create policy "settings: insert own" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "settings: update own" on public.user_settings;
create policy "settings: update own" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "settings: delete own" on public.user_settings;
create policy "settings: delete own" on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Lets a signed-in user delete their own account (and, by cascade, all their data).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

grant select, insert, delete on public.reviews to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
