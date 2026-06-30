-- PSC Atlas cloud permissions quick fix
-- Run this in Supabase SQL Editor if personnel role changes do not save on the website.
-- It enables the no-email Owner/admin workflow to read/write roster roles and cloud password settings.

create extension if not exists pgcrypto;

-- 1) Ensure roster table can store operator/admin roles.
create table if not exists public.psc_operator_roster (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  name text not null,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department, name)
);

alter table public.psc_operator_roster alter column id set default gen_random_uuid();

do $$
begin
  alter table public.psc_operator_roster drop constraint if exists psc_operator_roster_role_check;
  alter table public.psc_operator_roster add constraint psc_operator_roster_role_check check (role in ('operator', 'admin'));
exception when duplicate_object then null;
end $$;

alter table public.psc_operator_roster enable row level security;

drop policy if exists "PSC roster readable" on public.psc_operator_roster;
drop policy if exists "PSC admins manage roster" on public.psc_operator_roster;
drop policy if exists "PSC anon roster readable" on public.psc_operator_roster;
drop policy if exists "PSC anon roster insert" on public.psc_operator_roster;
drop policy if exists "PSC anon roster update" on public.psc_operator_roster;

create policy "PSC anon roster readable"
on public.psc_operator_roster for select
to anon, authenticated
using (true);

create policy "PSC anon roster insert"
on public.psc_operator_roster for insert
to anon, authenticated
with check (true);

create policy "PSC anon roster update"
on public.psc_operator_roster for update
to anon, authenticated
using (true)
with check (true);

-- 2) Ensure audit logs do not block role-save logging.
create table if not exists public.psc_audit_logs (
  id text primary key,
  created_at timestamptz not null default now(),
  actor_department text not null,
  actor_name text not null,
  actor_role text not null check (actor_role in ('owner', 'admin', 'operator')),
  action text not null,
  target_type text not null,
  target_id text not null,
  target_title text not null,
  before_payload jsonb,
  after_payload jsonb,
  payload jsonb not null
);

alter table public.psc_audit_logs enable row level security;

drop policy if exists "PSC audit readable by operators" on public.psc_audit_logs;
drop policy if exists "PSC audit insert by operators" on public.psc_audit_logs;
drop policy if exists "PSC anon audit readable" on public.psc_audit_logs;
drop policy if exists "PSC anon audit insert" on public.psc_audit_logs;

create policy "PSC anon audit readable"
on public.psc_audit_logs for select
to anon, authenticated
using (true);

create policy "PSC anon audit insert"
on public.psc_audit_logs for insert
to anon, authenticated
with check (true);

-- 3) Cloud-shared owner/admin passwords for no-email login.
create table if not exists public.psc_operator_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_psc_operator_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists psc_operator_settings_set_updated_at on public.psc_operator_settings;
create trigger psc_operator_settings_set_updated_at
before insert or update on public.psc_operator_settings
for each row execute function public.set_psc_operator_settings_updated_at();

alter table public.psc_operator_settings enable row level security;

drop policy if exists "PSC operator settings readable" on public.psc_operator_settings;
drop policy if exists "PSC operator settings insert" on public.psc_operator_settings;
drop policy if exists "PSC operator settings update" on public.psc_operator_settings;

create policy "PSC operator settings readable"
on public.psc_operator_settings for select
to anon, authenticated
using (true);

create policy "PSC operator settings insert"
on public.psc_operator_settings for insert
to anon, authenticated
with check (setting_key in ('owner_password', 'admin_passwords'));

create policy "PSC operator settings update"
on public.psc_operator_settings for update
to anon, authenticated
using (setting_key in ('owner_password', 'admin_passwords'))
with check (setting_key in ('owner_password', 'admin_passwords'));

insert into public.psc_operator_settings (setting_key, setting_value)
values
  ('owner_password', to_jsonb('owner'::text)),
  ('admin_passwords', '{}'::jsonb)
on conflict (setting_key) do nothing;
