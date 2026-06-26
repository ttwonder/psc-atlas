-- PSC Atlas operator-only edit policy upgrade
-- Run in Supabase SQL Editor after editor-allowlist.sql.
-- Goal:
--   source_editor: can add new source URLs only.
--   editor / owner: can edit/delete source payloads and update case/finding payloads.

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
      and editor.role in ('owner', 'editor')
  )
$$;

-- Sources: ordinary source_editor may insert, but only operator+ may update existing rows.
drop policy if exists "PSC source editors can update sources" on public.psc_sources;
drop policy if exists "PSC operators can update sources" on public.psc_sources;

create policy "PSC operators can update sources"
on public.psc_sources for update
to authenticated
using (public.is_psc_operator())
with check (public.is_psc_operator());

-- Cases: finding edits live inside psc_cases.payload, so keep update restricted to dataset editors/operators.
drop policy if exists "PSC dataset editors can update cases" on public.psc_cases;
drop policy if exists "PSC operators can update cases" on public.psc_cases;

create policy "PSC operators can update cases"
on public.psc_cases for update
to authenticated
using (public.is_psc_operator() or public.is_psc_editor('dataset'))
with check (public.is_psc_operator() or public.is_psc_editor('dataset'));
