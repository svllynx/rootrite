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

-- 6. Organisations: team accounts, projects, sites, plantings and survival checks.
-- Everything belongs to an organisation, and only its members can see or add to it.
create table if not exists public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 120),
  kind        text not null check (kind in ('lgu', 'school', 'ngo', 'company', 'other')),
  plan_status text not null default 'demo' check (plan_status in ('demo', 'active', 'lapsed')),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id    uuid not null references public.organisations (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

create table if not exists public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations (id) on delete cascade,
  code       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index if not exists org_invites_org_idx on public.org_invites (org_id);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 2 and 120),
  description text check (char_length(description) <= 500),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists projects_org_idx on public.projects (org_id);

create table if not exists public.project_sites (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 2 and 120),
  location   text check (char_length(location) <= 160),
  lat        double precision not null check (lat between 4 and 22),
  lon        double precision not null check (lon between 116 and 127),
  area_ha    numeric(12, 2) not null default 0 check (area_ha >= 0 and area_ha <= 1000000),
  site       jsonb not null default '{}' check (pg_column_size(site) < 20000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_sites_project_idx on public.project_sites (project_id);

create table if not exists public.plantings (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.project_sites (id) on delete cascade,
  species_id text not null check (char_length(species_id) between 1 and 60),
  count      integer not null check (count between 1 and 10000000),
  planted_on date not null,
  notes      text check (char_length(notes) <= 400),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists plantings_site_idx on public.plantings (site_id);

create table if not exists public.survival_checks (
  id          uuid primary key default gen_random_uuid(),
  planting_id uuid not null references public.plantings (id) on delete cascade,
  checked_on  date not null,
  alive       integer not null check (alive >= 0),
  notes       text check (char_length(notes) <= 400),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists survival_checks_planting_idx on public.survival_checks (planting_id);

-- Helpers for the rules below. They run with the table owner's rights so the rules don't loop.
create or replace function public.is_org_member(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = o and user_id = (select auth.uid()));
$$;
create or replace function public.is_org_owner(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = o and user_id = (select auth.uid()) and role = 'owner');
$$;
create or replace function public.project_org(p uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.projects where id = p;
$$;
create or replace function public.site_org(s uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pr.org_id from public.project_sites si join public.projects pr on pr.id = si.project_id where si.id = s;
$$;
create or replace function public.planting_org(p uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pr.org_id from public.plantings pl
    join public.project_sites si on si.id = pl.site_id
    join public.projects pr on pr.id = si.project_id
   where pl.id = p;
$$;
revoke execute on function public.is_org_member(uuid), public.is_org_owner(uuid), public.project_org(uuid), public.site_org(uuid), public.planting_org(uuid) from public, anon;
grant execute on function public.is_org_member(uuid), public.is_org_owner(uuid), public.project_org(uuid), public.site_org(uuid), public.planting_org(uuid) to authenticated;

alter table public.organisations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.projects enable row level security;
alter table public.project_sites enable row level security;
alter table public.plantings enable row level security;
alter table public.survival_checks enable row level security;

drop policy if exists "Members read their organisation" on public.organisations;
create policy "Members read their organisation" on public.organisations for select to authenticated using (public.is_org_member(id));
drop policy if exists "Owners rename their organisation" on public.organisations;
create policy "Owners rename their organisation" on public.organisations for update to authenticated using (public.is_org_owner(id)) with check (public.is_org_owner(id));

drop policy if exists "Members read the team" on public.org_members;
create policy "Members read the team" on public.org_members for select to authenticated using (public.is_org_member(org_id));

drop policy if exists "Owners read invites" on public.org_invites;
create policy "Owners read invites" on public.org_invites for select to authenticated using (public.is_org_owner(org_id));
drop policy if exists "Owners create invites" on public.org_invites;
create policy "Owners create invites" on public.org_invites for insert to authenticated with check (public.is_org_owner(org_id) and created_by = (select auth.uid()));
drop policy if exists "Owners cancel invites" on public.org_invites;
create policy "Owners cancel invites" on public.org_invites for delete to authenticated using (public.is_org_owner(org_id));

drop policy if exists "Members read projects" on public.projects;
create policy "Members read projects" on public.projects for select to authenticated using (public.is_org_member(org_id));
drop policy if exists "Members add projects" on public.projects;
create policy "Members add projects" on public.projects for insert to authenticated with check (public.is_org_member(org_id) and created_by = (select auth.uid()));
drop policy if exists "Members edit projects" on public.projects;
create policy "Members edit projects" on public.projects for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists "Owners delete projects" on public.projects;
create policy "Owners delete projects" on public.projects for delete to authenticated using (public.is_org_owner(org_id));

drop policy if exists "Members read sites" on public.project_sites;
create policy "Members read sites" on public.project_sites for select to authenticated using (public.is_org_member(public.project_org(project_id)));
drop policy if exists "Members add sites" on public.project_sites;
create policy "Members add sites" on public.project_sites for insert to authenticated with check (public.is_org_member(public.project_org(project_id)) and created_by = (select auth.uid()));
drop policy if exists "Members edit sites" on public.project_sites;
create policy "Members edit sites" on public.project_sites for update to authenticated using (public.is_org_member(public.project_org(project_id))) with check (public.is_org_member(public.project_org(project_id)));
drop policy if exists "Authors and owners delete sites" on public.project_sites;
create policy "Authors and owners delete sites" on public.project_sites for delete to authenticated using (created_by = (select auth.uid()) or public.is_org_owner(public.project_org(project_id)));

drop policy if exists "Members read plantings" on public.plantings;
create policy "Members read plantings" on public.plantings for select to authenticated using (public.is_org_member(public.site_org(site_id)));
drop policy if exists "Members add plantings" on public.plantings;
create policy "Members add plantings" on public.plantings for insert to authenticated with check (public.is_org_member(public.site_org(site_id)) and created_by = (select auth.uid()));
drop policy if exists "Authors and owners delete plantings" on public.plantings;
create policy "Authors and owners delete plantings" on public.plantings for delete to authenticated using (created_by = (select auth.uid()) or public.is_org_owner(public.site_org(site_id)));

drop policy if exists "Members read checks" on public.survival_checks;
create policy "Members read checks" on public.survival_checks for select to authenticated using (public.is_org_member(public.planting_org(planting_id)));
drop policy if exists "Members add checks" on public.survival_checks;
create policy "Members add checks" on public.survival_checks for insert to authenticated with check (public.is_org_member(public.planting_org(planting_id)) and created_by = (select auth.uid()));
drop policy if exists "Authors and owners delete checks" on public.survival_checks;
create policy "Authors and owners delete checks" on public.survival_checks for delete to authenticated using (created_by = (select auth.uid()) or public.is_org_owner(public.planting_org(planting_id)));

-- Roles, plan status and who created what can't be set from the browser.
revoke all on public.organisations, public.org_members, public.org_invites, public.projects, public.project_sites, public.plantings, public.survival_checks from anon, authenticated;
grant select on public.organisations, public.org_members, public.org_invites, public.projects, public.project_sites, public.plantings, public.survival_checks to authenticated;
grant update (name, kind) on public.organisations to authenticated;
grant insert (org_id) on public.org_invites to authenticated;
grant delete on public.org_invites to authenticated;
grant insert (org_id, name, description), update (name, description), delete on public.projects to authenticated;
grant insert (project_id, name, location, lat, lon, area_ha, site), update (name, location, area_ha), delete on public.project_sites to authenticated;
grant insert (site_id, species_id, count, planted_on, notes), delete on public.plantings to authenticated;
grant insert (planting_id, checked_on, alive, notes), delete on public.survival_checks to authenticated;

-- A planting can't be dated in the future; a check can't count more trees than were planted, or come before planting.
create or replace function public.check_planting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.planted_on > (now() at time zone 'Asia/Manila')::date + 1 then
    raise exception 'The planting date is in the future.';
  end if;
  return new;
end;
$$;
drop trigger if exists plantings_check on public.plantings;
create trigger plantings_check before insert on public.plantings for each row execute function public.check_planting();

create or replace function public.check_survival() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.plantings;
begin
  select * into p from public.plantings where id = new.planting_id;
  if new.alive > p.count then
    raise exception 'More trees alive than were planted (%).', p.count;
  end if;
  if new.checked_on < p.planted_on then
    raise exception 'The check is dated before the planting.';
  end if;
  if new.checked_on > (now() at time zone 'Asia/Manila')::date + 1 then
    raise exception 'The check date is in the future.';
  end if;
  return new;
end;
$$;
drop trigger if exists survival_checks_check on public.survival_checks;
create trigger survival_checks_check before insert on public.survival_checks for each row execute function public.check_survival();
revoke execute on function public.check_planting(), public.check_survival() from public, anon, authenticated;

-- Demo checkout: creates the organisation with the caller as owner. No payment is taken.
-- When real payments are added, create it (or set plan_status) from the payment provider's webhook instead.
create or replace function public.create_organisation(org_name text, org_kind text)
returns public.organisations
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  result public.organisations;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.org_members where user_id = me and role = 'owner') >= 3 then
    raise exception 'You already own three organisations.';
  end if;
  insert into public.organisations (name, kind, created_by) values (trim(org_name), org_kind, me) returning * into result;
  insert into public.org_members (org_id, user_id, role) values (result.id, me, 'owner');
  return result;
end;
$$;

-- What an invite link leads to, so people can see the name before they join.
create or replace function public.invite_details(invite_code text)
returns table (org_name text, org_kind text, expired boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, o.kind, i.expires_at < now()
    from public.org_invites i join public.organisations o on o.id = i.org_id
   where i.code = invite_code and (select auth.uid()) is not null;
$$;

-- Joining through an invite link. A team has at most ten people.
create or replace function public.join_organisation(invite_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  inv public.org_invites;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into inv from public.org_invites where code = invite_code;
  if inv.id is null then raise exception 'This invite link is not valid.'; end if;
  if inv.expires_at < now() then raise exception 'This invite link has expired. Ask for a new one.'; end if;
  if exists (select 1 from public.org_members where org_id = inv.org_id and user_id = me) then return inv.org_id; end if;
  if (select count(*) from public.org_members where org_id = inv.org_id) >= 10 then
    raise exception 'This team is full: the plan covers ten people.';
  end if;
  insert into public.org_members (org_id, user_id, role) values (inv.org_id, me, 'member');
  return inv.org_id;
end;
$$;

-- The team's names, for members of that team only.
create or replace function public.list_org_members(o uuid)
returns table (user_id uuid, full_name text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.full_name, m.role, m.joined_at
    from public.org_members m left join public.profiles p on p.id = m.user_id
   where m.org_id = o and exists (select 1 from public.org_members me where me.org_id = o and me.user_id = (select auth.uid()))
   order by m.role desc, m.joined_at;
$$;

-- Owners can remove members; anyone but an owner can leave.
create or replace function public.remove_org_member(o uuid, member uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.org_members where org_id = o and user_id = member and role = 'owner') then
    raise exception 'An owner cannot be removed from the team.';
  end if;
  if member <> me and not exists (select 1 from public.org_members where org_id = o and user_id = me and role = 'owner') then
    raise exception 'Only the owner can remove people.';
  end if;
  delete from public.org_members where org_id = o and user_id = member;
end;
$$;

revoke execute on function public.create_organisation(text, text), public.invite_details(text), public.join_organisation(text), public.list_org_members(uuid), public.remove_org_member(uuid, uuid) from public, anon;
grant execute on function public.create_organisation(text, text), public.invite_details(text), public.join_organisation(text), public.list_org_members(uuid), public.remove_org_member(uuid, uuid) to authenticated;
