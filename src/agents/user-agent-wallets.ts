import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { makeGatewayClient } from "../proofs/env-wallets.js";

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

const fallbackPath = join(/* turbopackIgnore: true */ process.cwd(), "data", "agent-wallets.json");

export async function ensureUserAgentWallet(userId: string): Promise<UserAgentWallet> {
  const safeUserId = normalizeUserId(userId);
  const store = await readStore();
  const existing = store.wallets[safeUserId];
  if (existing) return existing;

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const now = new Date().toISOString();
  const wallet: UserAgentWallet = {
    userId: safeUserId,
    address: account.address,
    privateKey,
    createdAt: now,
    updatedAt: now,
  };

  store.wallets[safeUserId] = wallet;
  store.updatedAt = now;
  await writeStore(store);
  return wallet;
}

export function makeUserAgentGatewayClient(wallet: UserAgentWallet) {
  return makeGatewayClient(wallet.privateKey);
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
