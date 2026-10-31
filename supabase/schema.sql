-- RootRite database setup.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to run again: every statement replaces or skips what already exists.

-- 1. One profile per account, holding the name and the plan.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  plan          text not null default 'free' check (plan in ('free', 'premium')),
  premium_since timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can read only their own profile.
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Each user can edit only their own profile, and only the name column (granted below).
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- The plan column cannot be written directly from the browser.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 2. Create the profile automatically when someone registers.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only the trigger runs this; nobody may call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Demo checkout: switch the signed-in user's own plan. No payment is taken.
-- When real payments are added, remove this function and set the plan from the
-- payment provider's webhook on the server instead.
create or replace function public.set_demo_plan(new_plan text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  if new_plan not in ('free', 'premium') then
    raise exception 'Unknown plan: %', new_plan;
  end if;

  insert into public.profiles (id) values ((select auth.uid()))
  on conflict (id) do nothing;

  update public.profiles
     set plan = new_plan,
         premium_since = case when new_plan = 'premium' then coalesce(premium_since, now()) else null end
   where id = (select auth.uid())
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.set_demo_plan(text) from public, anon;
grant execute on function public.set_demo_plan(text) to authenticated;

-- 4. Profiles for any accounts created before this script ran.
insert into public.profiles (id, full_name)
select id, nullif(trim(raw_user_meta_data ->> 'full_name'), '')
from auth.users
on conflict (id) do nothing;

-- 5. Seedling nurseries. Anyone signed in can suggest one; it shows to everyone once
-- the RootRite team approves it (Table Editor → nurseries → set status to 'approved').
create table if not exists public.nurseries (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 120),
  kind         text not null default 'private' check (kind in ('denr', 'lgu', 'school', 'ngo', 'private')),
  municipality text check (char_length(municipality) <= 80),
  province     text check (char_length(province) <= 80),
  lat          double precision not null check (lat between 4 and 22),
  lon          double precision not null check (lon between 116 and 127),
  phone        text check (char_length(phone) <= 40),
  hours        text check (char_length(hours) <= 80),
  species      text[] not null default '{}' check (cardinality(species) <= 100),
  notes        text check (char_length(notes) <= 400),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  featured     boolean not null default false,
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  verified_at  timestamptz
);

alter table public.nurseries enable row level security;

-- Approved listings are public; people also see their own suggestions while they wait.
drop policy if exists "Read approved nurseries" on public.nurseries;
create policy "Read approved nurseries" on public.nurseries
  for select to anon, authenticated
  using (status = 'approved' or submitted_by = (select auth.uid()));

-- A suggestion always starts as pending, unfeatured and unverified.
drop policy if exists "Suggest a nursery" on public.nurseries;
create policy "Suggest a nursery" on public.nurseries
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending' and featured = false and verified_at is null);

-- Who suggested a listing stays private; status, featured and verified are set by the team only.
revoke all on public.nurseries from anon, authenticated;
grant select (id, name, kind, municipality, province, lat, lon, phone, hours, species, notes, status, featured, created_at, verified_at)
  on public.nurseries to anon, authenticated;
grant insert (name, kind, municipality, province, lat, lon, phone, hours, species, notes)
  on public.nurseries to authenticated;

-- At most five suggestions waiting for review per person.
create or replace function public.limit_pending_nurseries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.nurseries where submitted_by = new.submitted_by and status = 'pending') >= 5 then
    raise exception 'You have five suggestions waiting for review. Please wait for those first.';
  end if;
  return new;
end;
$$;
revoke execute on function public.limit_pending_nurseries() from public, anon, authenticated;

drop trigger if exists nurseries_limit_pending on public.nurseries;
create trigger nurseries_limit_pending
  before insert on public.nurseries
  for each row execute function public.limit_pending_nurseries();

create index if not exists nurseries_status_idx on public.nurseries (status);
