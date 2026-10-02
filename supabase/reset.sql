-- ============================================================================
-- PropReel — Supabase RESET (run this BEFORE schema.sql)
-- ============================================================================
-- WHY: this project previously had a half-built relational schema (from the
-- older SUPABASE_MIGRATION_GUIDE.md plan) that was never wired into the app.
-- Those table shapes conflict with the live app's schema, so
-- `create table if not exists` in schema.sql silently skipped them and the
-- atomic credit functions never got created.
--
-- This drops ONLY the nine PropReel tables and the three credit functions.
-- It does NOT touch Supabase Auth (auth.users / logins are untouched), so
-- existing sign-ins keep working.
--
-- SAFETY: DynamoDB remains the source of truth at this point, so nothing
-- production is lost. The 3 pre-existing rows were backed up to
-- supabase/preexisting-rows-backup.json before this ran.
--
-- After running this, run supabase/schema.sql in a new query.
-- ============================================================================

-- Drop the three atomic helpers (any signature that may exist).
drop function if exists dec_if_enough(text, text, text, numeric) cascade;
drop function if exists inc_value(text, text, text, numeric) cascade;
drop function if exists claim_lock(text, jsonb) cascade;
-- Legacy helpers from the abandoned plan, in case any were created.
drop function if exists deduct_credits(uuid, integer) cascade;
drop function if exists add_credits(uuid, integer) cascade;

-- Leftovers from the abandoned deploy/ plan (Express + Prisma attempt).
-- Unused by the live app; their rows were backed up first.
drop table if exists app_settings cascade;
drop table if exists notifications cascade;
drop table if exists audit_logs cascade;

-- Drop the nine tables. CASCADE removes dependent indexes/constraints.
drop table if exists credit_transactions cascade;
drop table if exists agency_members cascade;
drop table if exists credit_expiries cascade;
drop table if exists subscriptions cascade;
drop table if exists agencies cascade;
drop table if exists projects cascade;
drop table if exists reviews cascade;
drop table if exists settings cascade;
drop table if exists users cascade;

-- Confirmation: this should return zero rows.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'users','credit_transactions','projects','settings','agencies',
    'agency_members','subscriptions','credit_expiries','reviews',
    'app_settings','notifications','audit_logs'
  );
