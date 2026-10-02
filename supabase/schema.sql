-- ============================================================================
-- PropReel — Supabase schema (lift-and-shift from DynamoDB)
-- ============================================================================
-- Design: each table stores the FULL original item in a `data jsonb` column
-- (so every code path keeps reading/writing identical shapes), with hot
-- attributes extracted as generated columns for indexing and equality filters.
--
-- Run this in the Supabase SQL Editor (or `supabase db push`).
-- All app access uses the SERVICE ROLE key (bypasses RLS); enable RLS below
-- and leave policies empty so only the server can touch the data.
-- ============================================================================

-- ── Users ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id text primary key,
  email text generated always as (data->>'email') stored,
  supabase_user_id text generated always as (data->>'supabaseUserId') stored,
  agency_id text generated always as (data->>'agencyId') stored,
  role text generated always as (data->>'role') stored,
  credits numeric generated always as ((coalesce(data->>'credits','0'))::numeric) stored,
  created_at timestamptz default now(),
  data jsonb not null
);
create index if not exists users_email_idx on users (email);
create index if not exists users_supabase_idx on users (supabase_user_id);
create index if not exists users_agency_idx on users (agency_id);

-- ── Credit transactions (PK: userId + createdAt) ────────────────────────────
create table if not exists credit_transactions (
  user_id text not null,
  created_at text not null,
  id text generated always as (data->>'id') stored,
  amount numeric generated always as ((coalesce(data->>'amount','0'))::numeric) stored,
  data jsonb not null,
  primary key (user_id, created_at)
);
create index if not exists ct_user_idx on credit_transactions (user_id, created_at desc);

-- ── Projects (PK: userId + id) ──────────────────────────────────────────────
create table if not exists projects (
  user_id text not null,
  id text not null,
  status text generated always as (data->>'status') stored,
  data jsonb not null,
  primary key (user_id, id)
);
create index if not exists projects_status_idx on projects (user_id, status);

-- ── Settings / misc markers (PK: id) ────────────────────────────────────────
create table if not exists settings (
  id text primary key,
  type text generated always as (data->>'type') stored,
  status text generated always as (data->>'status') stored,
  invite_email text generated always as (data->>'inviteEmail') stored,
  agency_id text generated always as (data->>'agencyId') stored,
  data jsonb not null
);
create index if not exists settings_type_idx on settings (type, status);

-- ── Agencies (PK: id) ───────────────────────────────────────────────────────
create table if not exists agencies (
  id text primary key,
  owner_id text generated always as (data->>'ownerId') stored,
  data jsonb not null
);
-- poolCredits lives inside data; the decrement RPC patches it in place.

-- ── Agency members (PK: agencyId + userId) ──────────────────────────────────
create table if not exists agency_members (
  agency_id text not null,
  user_id text not null,
  data jsonb not null,
  primary key (agency_id, user_id)
);
create index if not exists agency_members_user_idx on agency_members (user_id);

-- ── Subscriptions (PK: userId) ──────────────────────────────────────────────
create table if not exists subscriptions (
  user_id text primary key,
  data jsonb not null
);

-- ── Credit expiries (PK: userId + expiresAt) ────────────────────────────────
create table if not exists credit_expiries (
  user_id text not null,
  expires_at text not null,
  data jsonb not null,
  primary key (user_id, expires_at)
);

-- ── Reviews (PK: id) ────────────────────────────────────────────────────────
create table if not exists reviews (
  id text primary key,
  status text generated always as (data->>'status') stored,
  data jsonb not null
);

-- ── Subscriptions table note: the canonical subscription lives on the user
-- record (data->'subscription'); the standalone table is legacy/compat.

-- ============================================================================
-- Atomic helpers (service-role only; RLS blocks everything else)
-- ============================================================================

alter table users enable row level security;
alter table credit_transactions enable row level security;
alter table projects enable row level security;
alter table settings enable row level security;
alter table agencies enable row level security;
alter table agency_members enable row level security;
alter table subscriptions enable row level security;
alter table credit_expiries enable row level security;
alter table reviews enable row level security;
-- No policies created on purpose: with RLS enabled and zero policies, only
-- the service role (postgres / service_role) can read or write.

-- Atomic conditional decrement over a jsonb attribute. Returns the new value,
-- or NULL when the row doesn't exist / the balance is insufficient.
create or replace function dec_if_enough(
  p_table text, p_id text, p_attr text, p_amount numeric
) returns numeric
language plpgsql
security definer
as $$
declare
  v_new numeric;
begin
  execute format(
    'update %I set data = jsonb_set(data, array[%L], (((coalesce(data->>%L)::numeric) - $2)::text)::jsonb) where %I = $1 and coalesce((data->>%L)::numeric, 0) >= $2 returning (data->>%L)::numeric',
    p_table, p_attr, p_attr, 'id', p_attr, p_attr
  ) using p_id, p_amount into v_new;
  return v_new;
end;
$$;

-- Atomic increment (creates the attribute when missing). Returns new value.
create or replace function inc_value(
  p_table text, p_id text, p_attr text, p_amount numeric
) returns numeric
language plpgsql
security definer
as $$
declare
  v_new numeric;
begin
  execute format(
    'update %I set data = jsonb_set(data, array[%L], (((coalesce(data->>%L)::numeric) + $2)::text)::jsonb) where %I = $1 returning (data->>%L)::numeric',
    p_table, p_attr, p_attr, 'id', p_attr
  ) using p_id, p_amount into v_new;
  return v_new;
end;
$$;

-- Conditional update: only when the attribute is currently NULL/missing.
-- Returns true when the row was claimed. Used for idempotency locks.
create or replace function claim_lock(p_id text, p_payload jsonb)
returns boolean
language plpgsql
security definer
as $$
begin
  insert into settings (id, data) values (p_id, p_payload)
  on conflict (id) do nothing;
  return found;
end;
$$;

-- Increment an attribute on a composite-key table (agency_members limits etc.)
-- NOTE: agencies is the only table using numeric pool arithmetic at scale.
