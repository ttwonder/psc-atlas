-- PSC Atlas operator/admin permission upgrade
-- Run in Supabase SQL Editor after editor-allowlist.sql.
-- Model:
--   Lightweight operators are selected in the browser from the department/name roster.
--   No Supabase email login is required for normal case/source/roster saves.
--   RLS below allows anon writes through the public anon key; the frontend enforces department/name confirmation.
--   Keep service_role keys out of the frontend; only anon key is public.

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

-- Sources: allow browser operators selected by department/name to save via anon key.
drop policy if exists "PSC source editors can update sources" on public.psc_sources;
drop policy if exists "PSC operators can update sources" on public.psc_sources;
drop policy if exists "PSC anon operators can insert sources" on public.psc_sources;
drop policy if exists "PSC anon operators can update sources" on public.psc_sources;

create policy "PSC anon operators can insert sources"
on public.psc_sources for insert
to anon, authenticated
with check (true);

create policy "PSC anon operators can update sources"
on public.psc_sources for update
to anon, authenticated
using (true)
with check (true);

-- Cases: finding edits live inside psc_cases.payload. Allow browser operators selected by department/name to save via anon key.
drop policy if exists "PSC dataset editors can update cases" on public.psc_cases;
drop policy if exists "PSC operators can update cases" on public.psc_cases;
drop policy if exists "PSC anon operators can insert cases" on public.psc_cases;
drop policy if exists "PSC anon operators can update cases" on public.psc_cases;

create policy "PSC anon operators can insert cases"
on public.psc_cases for insert
to anon, authenticated
with check (true);

create policy "PSC anon operators can update cases"
on public.psc_cases for update
to anon, authenticated
using (true)
with check (true);

-- Operator roster table for cloud-managed roster workflows.
create extension if not exists pgcrypto;

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


-- If this table was created by an older script, widen the role constraint from operator-only to operator/admin.
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

-- Audit log table. Browser operators can write cloud logs through anon key after frontend department/name confirmation.
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


-- Deactivate departments removed from the active roster by request.
update public.psc_operator_roster
set active = false,
    updated_at = now()
where department in ('管理層', '管理組', '資材組', '營業處', '船工處', '安衛處', '船員組');

-- Ensure at least one remaining department/name identity can manage the roster without Supabase email login.
update public.psc_operator_roster
set role = 'admin',
    active = true,
    updated_at = now()
where department = '航運處'
  and name = '吳建泰處長';

-- Seed PSC operator roster from Desktop/海運辦公室人員清單2.xlsx.
-- After removing 管理層、管理組、資材組、營業處、船工處、安衛處、船員組, the active roster has 39 department/name entries.
insert into public.psc_operator_roster (department, name, role, active, sort_order)
values
  ('航運處', '吳建泰處長', 'admin', true, 0),
  ('督導', '尹德垿', 'operator', true, 1),
  ('督導', '蔡繼來', 'operator', true, 2),
  ('督導', '翁振傑', 'operator', true, 3),
  ('督導', '黃傑治', 'operator', true, 4),
  ('督導', '陳寰頤', 'operator', true, 5),
  ('督導', '李幸龍', 'operator', true, 6),
  ('督導', '廖麗蓁', 'operator', true, 7),
  ('督導', '張議榮', 'operator', true, 8),
  ('督導', '林滄龍', 'operator', true, 9),
  ('督導', '蔡明哲', 'operator', true, 10),
  ('督導', '陳昱宏', 'operator', true, 11),
  ('督導', '陳思慧', 'operator', true, 12),
  ('督導', '張雅琪', 'operator', true, 13),
  ('督導', '張和中', 'operator', true, 14),
  ('督導', '張志林', 'operator', true, 15),
  ('督導', '餘雙', 'operator', true, 16),
  ('督導', '唐洪新', 'operator', true, 17),
  ('督導', '秦冰', 'operator', true, 18),
  ('督導', '黃燕華', 'operator', true, 19),
  ('督導', '潘獻波', 'operator', true, 20),
  ('督導', '毛剛', 'operator', true, 21),
  ('航運組', '陳秀玉', 'operator', true, 22),
  ('航運組', '黃駿達', 'operator', true, 23),
  ('航運組', '江嘉卿', 'operator', true, 24),
  ('航運組', '陳秋縈', 'operator', true, 25),
  ('航運組', '溫雅媛', 'operator', true, 26),
  ('航運組', '王聖傑', 'operator', true, 27),
  ('航運組', '楊治華', 'operator', true, 28),
  ('航運組', '謝侑糖', 'operator', true, 29),
  ('航運組', '劉彥輝', 'operator', true, 30),
  ('航運組', '陳芮蓁', 'operator', true, 31),
  ('海技組', '朱世毅', 'operator', true, 32),
  ('海技組', '陳宜斌', 'operator', true, 33),
  ('海技組', '柯香吟', 'operator', true, 34),
  ('海技組', '陳思樺', 'operator', true, 35),
  ('海技組', '林建志', 'operator', true, 36),
  ('海技組', '張嘉珈', 'operator', true, 37),
  ('海技組', '吳易安', 'operator', true, 38)
on conflict (department, name) do update set
  role = public.psc_operator_roster.role,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
