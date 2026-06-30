-- PSC Atlas roster id default quick fix
-- Run in Supabase SQL Editor if saving personnel permissions fails with:
-- null value in column "id" of relation "psc_operator_roster" violates not-null constraint

create extension if not exists pgcrypto;

alter table public.psc_operator_roster
alter column id set default gen_random_uuid();

-- Optional check: should show gen_random_uuid() in column_default.
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'psc_operator_roster'
  and column_name = 'id';
