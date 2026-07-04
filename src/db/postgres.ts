import { neon } from "@neondatabase/serverless";

const databaseUrlKeys = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"] as const;

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

export function postgresEnabled(): boolean {
  return Boolean(databaseUrl());
}

export function databaseUrl(): string | undefined {
  for (const key of databaseUrlKeys) {
    const value = process.env[key]?.trim();
    if (value && !value.includes("replace_me")) return value;
  }
  return undefined;
}

export function getSql(): ReturnType<typeof neon> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is required to use Neon Postgres storage.");
  sqlClient ??= neon(url);
  return sqlClient;
}

export async function ensureKobolinkSchema(): Promise<void> {
  if (!postgresEnabled()) return;
  schemaReady ??= createSchema();
  await schemaReady;
}

async function createSchema(): Promise<void> {
  const sql = getSql();

  await sql`
    create table if not exists kobolink_creator_listings (
      id text primary key,
      item jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists kobolink_payment_logs (
      id text primary key,
      log jsonb not null,
      settled_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists kobolink_flutterwave_bridge (
      id text primary key,
      state jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists kobolink_fan_budgets (
      owner_id text primary key,
      budget jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists kobolink_agent_wallets (
      user_id text primary key,
      address text not null,
      encrypted_private_key text not null,
      iv text not null,
      auth_tag text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
}

export function jsonb(value: unknown): string {
  return JSON.stringify(value);
}
