-- PSC Atlas editor allowlist / 編輯者白名單權限
-- Run this in Supabase Dashboard → SQL Editor after supabase/schema.sql.
-- Result:
--   - Public visitors can still read cases/sources.
--   - Only active emails in public.psc_editors can write.
--   - Manage editors by adding/removing rows in public.psc_editors.

create table if not exists public.psc_editors (
  email text primary key,
  role text not null default 'source_editor' check (role in ('owner', 'editor', 'source_editor')),
  active boolean not null default true,
  can_add_sources boolean not null default true,
  can_sync_dataset boolean not null default false,
  can_refresh boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psc_editors_email_lower check (email = lower(trim(email)))
);

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_psc_editor(feature text default 'sources')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.psc_editors editor
    where editor.email = public.current_user_email()
      and editor.active = true
      and case
        when feature = 'sources' then editor.can_add_sources = true
        when feature = 'dataset' then editor.can_sync_dataset = true
        when feature = 'refresh' then editor.can_refresh = true
        else true
      end
  )
$$;

create or replace function public.set_psc_editor_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists psc_editors_set_updated_at on public.psc_editors;
create trigger psc_editors_set_updated_at
before insert or update on public.psc_editors
for each row execute function public.set_psc_editor_updated_at();

alter table public.psc_editors enable row level security;

drop policy if exists "Editors can read their own allowlist row" on public.psc_editors;
create policy "Editors can read their own allowlist row"
on public.psc_editors for select
to authenticated
using (email = public.current_user_email());

-- Bootstrap yourself as owner. Keep this row; change the email if you use a different login.
insert into public.psc_editors (email, role, active, can_add_sources, can_sync_dataset, can_refresh, notes)
values ('tuotuoworm@outlook.com', 'owner', true, true, true, true, 'Project owner')
on conflict (email) do update set
  role = excluded.role,
  active = excluded.active,
  can_add_sources = excluded.can_add_sources,
  can_sync_dataset = excluded.can_sync_dataset,
  can_refresh = excluded.can_refresh,
  notes = excluded.notes;

-- Replace broad authenticated-write policies with allowlist policies.
drop policy if exists "Authenticated users can insert PSC cases" on public.psc_cases;
drop policy if exists "Authenticated users can update PSC cases" on public.psc_cases;
drop policy if exists "Authenticated users can insert PSC sources" on public.psc_sources;
drop policy if exists "Authenticated users can update PSC sources" on public.psc_sources;
drop policy if exists "Authenticated users can insert sync events" on public.psc_sync_events;

drop policy if exists "PSC dataset editors can insert cases" on public.psc_cases;
create policy "PSC dataset editors can insert cases"
on public.psc_cases for insert
to authenticated
with check (public.is_psc_editor('dataset'));

drop policy if exists "PSC dataset editors can update cases" on public.psc_cases;
create policy "PSC dataset editors can update cases"
on public.psc_cases for update
to authenticated
using (public.is_psc_editor('dataset'))
with check (public.is_psc_editor('dataset'));

drop policy if exists "PSC source editors can insert sources" on public.psc_sources;
create policy "PSC source editors can insert sources"
on public.psc_sources for insert
to authenticated
with check (public.is_psc_editor('sources'));

drop policy if exists "PSC source editors can update sources" on public.psc_sources;
create policy "PSC source editors can update sources"
on public.psc_sources for update
to authenticated
using (public.is_psc_editor('sources'))
with check (public.is_psc_editor('sources'));

drop policy if exists "PSC editors can insert sync events" on public.psc_sync_events;
create policy "PSC editors can insert sync events"
on public.psc_sync_events for insert
to authenticated
with check (public.is_psc_editor('dataset') or public.is_psc_editor('refresh'));

-- Examples for managing editors:
-- 1) Allow someone to add source URLs only:
-- insert into public.psc_editors (email, role, can_add_sources, can_sync_dataset, can_refresh, notes)
-- values ('friend@example.com', 'source_editor', true, false, false, 'Can add source URLs only')
-- on conflict (email) do update set active = true, can_add_sources = true, can_sync_dataset = false, can_refresh = false;
--
-- 2) Allow a trusted editor to add sources and sync dataset:
-- insert into public.psc_editors (email, role, can_add_sources, can_sync_dataset, can_refresh, notes)
-- values ('editor@example.com', 'editor', true, true, false, 'Trusted data editor')
-- on conflict (email) do update set active = true, can_add_sources = true, can_sync_dataset = true;
--
-- 3) Disable an editor without deleting history:
-- update public.psc_editors set active = false where email = 'friend@example.com';
