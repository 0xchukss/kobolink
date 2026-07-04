-- KoboLink Phase 1 schema target: SQLite-compatible local storage.
-- The Day 1 proof scripts currently persist JSON proof artifacts; this schema is the persistence boundary for Phase 2+.

create table if not exists wallets (
  id text primary key,
  role text not null check (role in ('fan', 'agent', 'creator')),
  address text not null unique,
  chain_id integer not null default 5042002,
  created_at text not null default current_timestamp
);

create table if not exists creator_profiles (
  id text primary key,
  x_handle text not null unique,
  display_name text not null,
  wallet_address text not null,
  category text not null,
  reputation_score integer not null default 70,
  created_at text not null default current_timestamp
);

create table if not exists content_listings (
  id text primary key,
  creator_id text not null references creator_profiles(id),
  title text not null,
  x_url text not null,
  description text not null,
  suggested_tip_ngn integer not null,
  suggested_tip_usdc text not null,
  x402_payment_path text not null,
  created_at text not null default current_timestamp
);

create table if not exists payment_logs (
  id text primary key,
  creator_id text not null references creator_profiles(id),
  content_id text not null references content_listings(id),
  payer_address text not null,
  amount_ngn integer not null,
  amount_usdc text not null,
  x402_status text not null,
  arc_transaction_hash text,
  arc_explorer_url text,
  settled_at text,
  created_at text not null default current_timestamp
);

create table if not exists proof_events (
  id text primary key,
  section text not null,
  proof_json text not null,
  created_at text not null default current_timestamp
);
