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


-- Seed PSC operator roster from Desktop/海運辦公室人員清單2.xlsx.
-- The spreadsheet has 105 unique department/name entries after trimming whitespace and removing duplicate rows.
insert into public.psc_operator_roster (department, name, role, active, sort_order)
values
  ('管理層', '呂學修副總', 'operator', true, 0),
  ('管理層', '蔡宏仁協理', 'operator', true, 1),
  ('管理層', '李勻寧協理', 'operator', true, 2),
  ('管理組', '陳治先', 'operator', true, 3),
  ('管理組', '王昱民', 'operator', true, 4),
  ('管理組', '方憲鵬組長', 'operator', true, 5),
  ('管理組', '陳韋自', 'operator', true, 6),
  ('管理組', '紀煒邦', 'operator', true, 7),
  ('管理組', '李雅雯', 'operator', true, 8),
  ('管理組', '曾湘柔', 'operator', true, 9),
  ('管理組', '周麗如', 'operator', true, 10),
  ('資材組', '林建瑋', 'operator', true, 11),
  ('資材組', '鄧兆修', 'operator', true, 12),
  ('資材組', '鄧浚宏', 'operator', true, 13),
  ('資材組', '徐永兆', 'operator', true, 14),
  ('資材組', '王梓名', 'operator', true, 15),
  ('資材組', '林大詠', 'operator', true, 16),
  ('資材組', '周瑞廉組長', 'operator', true, 17),
  ('資材組', '楊延興', 'operator', true, 18),
  ('資材組', '許政子', 'operator', true, 19),
  ('資材組', '楊絜崴', 'operator', true, 20),
  ('營業處', '王慈芬', 'operator', true, 21),
  ('營業處', '劉小萍', 'operator', true, 22),
  ('營業處', '翁敏芳', 'operator', true, 23),
  ('營業處', '李純瑛', 'operator', true, 24),
  ('營業處', '魏利育', 'operator', true, 25),
  ('營業處', '賴思妤', 'operator', true, 26),
  ('營業處', '陳建中', 'operator', true, 27),
  ('營業處', '粘家萍', 'operator', true, 28),
  ('營業處', '邱義泰', 'operator', true, 29),
  ('營業處', '倪嘉', 'operator', true, 30),
  ('營業處', '李耿志', 'operator', true, 31),
  ('船工處', '廖晥妤', 'operator', true, 32),
  ('船工處', '吳燕桂', 'operator', true, 33),
  ('船工處', '楊弘羽', 'operator', true, 34),
  ('船工處', '王威譯', 'operator', true, 35),
  ('船工處', '李曜均', 'operator', true, 36),
  ('船工處', '劉煥章處長', 'operator', true, 37),
  ('船工處', '林冠辰', 'operator', true, 38),
  ('船工處', '盧玉玫', 'operator', true, 39),
  ('船工處', '林儀婷', 'operator', true, 40),
  ('船工處', '王昱斌', 'operator', true, 41),
  ('船工處', '賴朝瑜', 'operator', true, 42),
  ('船工處', '陳思翰', 'operator', true, 43),
  ('船工處', '顏仲楷', 'operator', true, 44),
  ('安衛處', '楊順婷', 'operator', true, 45),
  ('安衛處', '施品帆', 'operator', true, 46),
  ('安衛處', '紀芳琪', 'operator', true, 47),
  ('安衛處', '蘇上銘', 'operator', true, 48),
  ('安衛處', '韓竹雅', 'operator', true, 49),
  ('安衛處', '劉定淮', 'operator', true, 50),
  ('安衛處', '江佳勳', 'operator', true, 51),
  ('安衛處', '張鼎東', 'operator', true, 52),
  ('航運處', '吳建泰處長', 'operator', true, 53),
  ('督導', '尹德垿', 'operator', true, 54),
  ('督導', '蔡繼來', 'operator', true, 55),
  ('督導', '翁振傑', 'operator', true, 56),
  ('督導', '黃傑治', 'operator', true, 57),
  ('督導', '陳寰頤', 'operator', true, 58),
  ('督導', '李幸龍', 'operator', true, 59),
  ('督導', '廖麗蓁', 'operator', true, 60),
  ('督導', '張議榮', 'operator', true, 61),
  ('督導', '林滄龍', 'operator', true, 62),
  ('督導', '蔡明哲', 'operator', true, 63),
  ('督導', '陳昱宏', 'operator', true, 64),
  ('督導', '陳思慧', 'operator', true, 65),
  ('督導', '張雅琪', 'operator', true, 66),
  ('督導', '張和中', 'operator', true, 67),
  ('督導', '張志林', 'operator', true, 68),
  ('督導', '餘雙', 'operator', true, 69),
  ('督導', '唐洪新', 'operator', true, 70),
  ('督導', '秦冰', 'operator', true, 71),
  ('督導', '黃燕華', 'operator', true, 72),
  ('督導', '潘獻波', 'operator', true, 73),
  ('督導', '毛剛', 'operator', true, 74),
  ('船員組', '徐意倫', 'operator', true, 75),
  ('船員組', '古美雪', 'operator', true, 76),
  ('船員組', '薛英林', 'operator', true, 77),
  ('船員組', '張育菁', 'operator', true, 78),
  ('船員組', '謝嘉穎', 'operator', true, 79),
  ('船員組', '王鈺婷', 'operator', true, 80),
  ('船員組', '湯雅帆', 'operator', true, 81),
  ('船員組', '陳必恆', 'operator', true, 82),
  ('船員組', '林竺諼', 'operator', true, 83),
  ('船員組', '鄭詩璇', 'operator', true, 84),
  ('船員組', '陳昱勳', 'operator', true, 85),
  ('船員組', '胡峻瑋', 'operator', true, 86),
  ('船員組', '吳思葦', 'operator', true, 87),
  ('航運組', '陳秀玉', 'operator', true, 88),
  ('航運組', '黃駿達', 'operator', true, 89),
  ('航運組', '江嘉卿', 'operator', true, 90),
  ('航運組', '陳秋縈', 'operator', true, 91),
  ('航運組', '溫雅媛', 'operator', true, 92),
  ('航運組', '王聖傑', 'operator', true, 93),
  ('航運組', '楊治華', 'operator', true, 94),
  ('航運組', '謝侑糖', 'operator', true, 95),
  ('航運組', '劉彥輝', 'operator', true, 96),
  ('航運組', '陳芮蓁', 'operator', true, 97),
  ('海技組', '朱世毅', 'operator', true, 98),
  ('海技組', '陳宜斌', 'operator', true, 99),
  ('海技組', '柯香吟', 'operator', true, 100),
  ('海技組', '陳思樺', 'operator', true, 101),
  ('海技組', '林建志', 'operator', true, 102),
  ('海技組', '張嘉珈', 'operator', true, 103),
  ('海技組', '吳易安', 'operator', true, 104)
on conflict (department, name) do update set
  role = excluded.role,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
