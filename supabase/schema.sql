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
