import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { ensureKobolinkSchema, getSql, postgresEnabled } from "../db/postgres.js";
import { decryptSecret, encryptSecret } from "../db/secret-box.js";
import { makeGatewayClient } from "../proofs/env-wallets.js";
import { localStoreDir } from "../config/env.js";

export type UserAgentWallet = {
  userId: string;
  address: string;
  privateKey: Hex;
  createdAt: string;
  updatedAt: string;
};

type AgentWalletStore = {
  wallets: Record<string, UserAgentWallet>;
  updatedAt: string;
};

type AgentWalletRow = {
  user_id: string;
  address: string;
  encrypted_private_key: string;
  iv: string;
  auth_tag: string;
  created_at: string | Date;
  updated_at: string | Date;
};

const fallbackPath = join(localStoreDir, "agent-wallets.json");

export async function ensureUserAgentWallet(userId: string): Promise<UserAgentWallet> {
  const safeUserId = normalizeUserId(userId);
  if (postgresEnabled()) return ensurePostgresWallet(safeUserId);

  const store = await readStore();
  const existing = store.wallets[safeUserId];
  if (existing) return existing;

  const wallet = createUserAgentWallet(safeUserId);
  store.wallets[safeUserId] = wallet;
  store.updatedAt = wallet.updatedAt;
  await writeStore(store);
  return wallet;
}

export function makeUserAgentGatewayClient(wallet: UserAgentWallet) {
  return makeGatewayClient(wallet.privateKey);
}

async function ensurePostgresWallet(userId: string): Promise<UserAgentWallet> {
  const existing = await readPostgresWallet(userId);
  if (existing) return existing;

  const wallet = createUserAgentWallet(userId);
  const encrypted = encryptSecret(wallet.privateKey);
  await ensureKobolinkSchema();
  const sql = getSql();
  await sql`
    insert into kobolink_agent_wallets (user_id, address, encrypted_private_key, iv, auth_tag, created_at, updated_at)
    values (${wallet.userId}, ${wallet.address}, ${encrypted.encrypted}, ${encrypted.iv}, ${encrypted.authTag}, ${wallet.createdAt}, ${wallet.updatedAt})
    on conflict (user_id)
    do nothing
  `;

  return await readPostgresWallet(userId) ?? wallet;
}

async function readPostgresWallet(userId: string): Promise<UserAgentWallet | null> {
  await ensureKobolinkSchema();
  const sql = getSql();
  const rows = (await sql`
    select user_id, address, encrypted_private_key, iv, auth_tag, created_at, updated_at
    from kobolink_agent_wallets
    where user_id = ${userId}
    limit 1
  `) as AgentWalletRow[];
  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    address: row.address,
    privateKey: decryptSecret({ encrypted: row.encrypted_private_key, iv: row.iv, authTag: row.auth_tag }) as Hex,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createUserAgentWallet(userId: string): UserAgentWallet {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const now = new Date().toISOString();
  return {
    userId,
    address: account.address,
    privateKey,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeUserId(userId: string): string {
  const normalized = userId.trim();
  if (!normalized) throw new Error("Clerk user id is required for an agent wallet.");
  return normalized;
}

async function readStore(): Promise<AgentWalletStore> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ storePath(), "utf8")) as AgentWalletStore;
    return {
      wallets: parsed.wallets && typeof parsed.wallets === "object" ? parsed.wallets : {},
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { wallets: {}, updatedAt: new Date().toISOString() };
    throw error;
  }
}

async function writeStore(store: AgentWalletStore): Promise<void> {
  const resolvedPath = storePath();
  await mkdir(/* turbopackIgnore: true */ dirname(resolvedPath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ resolvedPath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function storePath(): string {
  const configured = process.env.KOBOLINK_AGENT_WALLET_STORE;
  if (!configured) return fallbackPath;
  return isAbsolute(configured) ? configured : join(/* turbopackIgnore: true */ process.cwd(), configured);
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
