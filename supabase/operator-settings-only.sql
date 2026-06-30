-- PSC Atlas cloud permission settings only
-- Use this if the full operator-edit-policies.sql paste was truncated in Supabase SQL Editor.
-- This creates the cloud-shared owner/admin password settings table for no-email login.

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
