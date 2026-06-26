-- PSC Atlas operator/admin permission upgrade
-- Run in Supabase SQL Editor after editor-allowlist.sql.
-- Model:
--   owner/admin: managed in psc_editors via Supabase Auth, may sync datasets, refresh, manage roster, delete/restore sources.
--   source_editor/editor/admin/owner: may add/edit/soft-delete source URLs.
--   ordinary operators: selected in the browser from the department/name roster; browser records local LOG.
--   psc_audit_logs stores cloud LOG when an authenticated owner/admin/editor session is available.

create or replace function public.is_psc_operator()
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
      and (editor.role in ('owner', 'admin', 'editor') or editor.can_sync_dataset = true)
  )
$$;

create or replace function public.is_psc_source_operator()
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
      and (editor.role in ('owner', 'admin', 'editor', 'source_editor') or editor.can_add_sources = true)
  )
$$;

-- Sources: source_editor/editor/admin/owner may update existing source rows because source edits are low-risk and soft-deleted.
drop policy if exists "PSC source editors can update sources" on public.psc_sources;
drop policy if exists "PSC operators can update sources" on public.psc_sources;

create policy "PSC operators can update sources"
on public.psc_sources for update
to authenticated
using (public.is_psc_source_operator())
with check (public.is_psc_source_operator());

-- Cases: finding edits live inside psc_cases.payload, so keep update restricted to trusted dataset editors/admins/owners.
drop policy if exists "PSC dataset editors can update cases" on public.psc_cases;
drop policy if exists "PSC operators can update cases" on public.psc_cases;

create policy "PSC operators can update cases"
on public.psc_cases for update
to authenticated
using (public.is_psc_operator() or public.is_psc_editor('dataset'))
with check (public.is_psc_operator() or public.is_psc_editor('dataset'));

-- Operator roster table for future cloud-managed roster workflows.
create table if not exists public.psc_operator_roster (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  name text not null,
  role text not null default 'operator' check (role in ('operator')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department, name)
);

alter table public.psc_operator_roster enable row level security;

drop policy if exists "PSC roster readable" on public.psc_operator_roster;
drop policy if exists "PSC admins manage roster" on public.psc_operator_roster;

create policy "PSC roster readable"
on public.psc_operator_roster for select
to anon, authenticated
using (active = true);

create policy "PSC admins manage roster"
on public.psc_operator_roster for all
to authenticated
using (public.is_psc_operator())
with check (public.is_psc_operator());

-- Audit log table. Authenticated admin/editor sessions can write cloud logs;
-- browser-only operator actions still keep a local LOG if no authenticated writer exists.
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

create policy "PSC audit readable by operators"
on public.psc_audit_logs for select
to authenticated
using (public.is_psc_operator() or public.is_psc_source_operator());

create policy "PSC audit insert by operators"
on public.psc_audit_logs for insert
to authenticated
with check (public.is_psc_operator() or public.is_psc_source_operator());
