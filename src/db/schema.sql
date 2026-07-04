-- KoboLink durable storage schema for Neon Postgres.
-- The app creates these tables lazily on first DB-backed store access when DATABASE_URL is set.

create table if not exists kobolink_creator_listings (
  id text primary key,
  item jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists kobolink_payment_logs (
  id text primary key,
  log jsonb not null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists kobolink_flutterwave_bridge (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists kobolink_fan_budgets (
  owner_id text primary key,
  budget jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists kobolink_agent_wallets (
  user_id text primary key,
  address text not null,
  encrypted_private_key text not null,
  iv text not null,
  auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
