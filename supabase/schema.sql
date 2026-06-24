-- PSC Atlas Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- Public visitors can read cases/sources. Only authenticated users can write.

create extension if not exists pgcrypto;

create table if not exists public.psc_cases (
  id text primary key,
  vessel text not null,
  imo text,
  region text,
  port text,
  inspection_date date,
  status text,
  evidence_level text,
  deficiency_count integer not null default 0,
  detention_ground_count integer not null default 0,
  source_url text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists psc_cases_inspection_date_idx on public.psc_cases (inspection_date desc);
create index if not exists psc_cases_region_idx on public.psc_cases (region);
create index if not exists psc_cases_vessel_idx on public.psc_cases (vessel);
create index if not exists psc_cases_payload_gin_idx on public.psc_cases using gin (payload);

create table if not exists public.psc_sources (
  id text primary key,
  title text not null,
  url text not null,
  source_type text,
  authority text,
  manual boolean not null default false,
  added_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint psc_sources_url_unique unique (url)
);

create index if not exists psc_sources_added_at_idx on public.psc_sources (added_at desc);
create index if not exists psc_sources_manual_idx on public.psc_sources (manual);
create index if not exists psc_sources_payload_gin_idx on public.psc_sources using gin (payload);

create table if not exists public.psc_sync_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  message text,
  case_count integer default 0,
  source_count integer default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create or replace function public.set_updated_at_and_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists psc_cases_set_updated_at on public.psc_cases;
create trigger psc_cases_set_updated_at
before insert or update on public.psc_cases
for each row execute function public.set_updated_at_and_user();

drop trigger if exists psc_sources_set_updated_at on public.psc_sources;
create trigger psc_sources_set_updated_at
before insert or update on public.psc_sources
for each row execute function public.set_updated_at_and_user();

alter table public.psc_cases enable row level security;
alter table public.psc_sources enable row level security;
alter table public.psc_sync_events enable row level security;

-- Recreate policies idempotently.
drop policy if exists "Public can read PSC cases" on public.psc_cases;
create policy "Public can read PSC cases"
on public.psc_cases for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can insert PSC cases" on public.psc_cases;
create policy "Authenticated users can insert PSC cases"
on public.psc_cases for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update PSC cases" on public.psc_cases;
create policy "Authenticated users can update PSC cases"
on public.psc_cases for update
to authenticated
using (true)
with check (true);

drop policy if exists "Public can read PSC sources" on public.psc_sources;
create policy "Public can read PSC sources"
on public.psc_sources for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can insert PSC sources" on public.psc_sources;
create policy "Authenticated users can insert PSC sources"
on public.psc_sources for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update PSC sources" on public.psc_sources;
create policy "Authenticated users can update PSC sources"
on public.psc_sources for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can read sync events" on public.psc_sync_events;
create policy "Authenticated users can read sync events"
on public.psc_sync_events for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert sync events" on public.psc_sync_events;
create policy "Authenticated users can insert sync events"
on public.psc_sync_events for insert
to authenticated
with check (created_by is null or created_by = auth.uid());
