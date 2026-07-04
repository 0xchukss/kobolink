import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

import { ensureKobolinkSchema, getSql, jsonb, postgresEnabled } from "../db/postgres.js";
import { budgetLedger, type BudgetState, type FanBudget, type GatewayBalanceSnapshot } from "./fan-budget.js";

const fallbackFileName = "fan-budget.json";

export async function readFanBudget(path?: string): Promise<FanBudget | null> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ resolveBudgetPath(path), "utf8")) as FanBudget;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeFanBudget(budget: FanBudget, path?: string): Promise<void> {
  const resolvedPath = resolveBudgetPath(path);
  await mkdir(/* turbopackIgnore: true */ dirname(resolvedPath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ resolvedPath, `${JSON.stringify(budget, null, 2)}\n`, "utf8");
}

export async function readStoredBudgetState(path?: string, wallet: GatewayBalanceSnapshot | null = null): Promise<BudgetState> {
  const budget = await readFanBudget(path);
  return {
    budget,
    ledger: budget ? budgetLedger(budget) : null,
    wallet,
  };
}

function resolveBudgetPath(path?: string): string {
  if (path) return path;

  const configuredPath = process.env.KOBOLINK_BUDGET_STORE;
  if (configuredPath && process.env.NODE_ENV !== "production") {
    return isAbsolute(configuredPath) ? configuredPath : join(process.cwd(), configuredPath);
  }

  return join(process.cwd(), "data", configuredPath ? basename(configuredPath) : fallbackFileName);
}

export async function readFanBudgetForOwner(ownerId: string): Promise<FanBudget | null> {
  const safeOwnerId = normalizeOwnerId(ownerId);
  if (postgresEnabled()) return readPostgresFanBudget(safeOwnerId);
  return readFanBudget(ownerBudgetPath(safeOwnerId));
}

export async function writeFanBudgetForOwner(ownerId: string, budget: FanBudget): Promise<void> {
  const safeOwnerId = normalizeOwnerId(ownerId);
  if (postgresEnabled()) {
    await writePostgresFanBudget(safeOwnerId, budget);
    return;
  }
  return writeFanBudget(budget, ownerBudgetPath(safeOwnerId));
}

export async function readStoredBudgetStateForOwner(ownerId: string, wallet: GatewayBalanceSnapshot | null = null): Promise<BudgetState> {
  const budget = await readFanBudgetForOwner(ownerId);
  return {
    budget,
    ledger: budget ? budgetLedger(budget) : null,
    wallet,
  };
}

async function readPostgresFanBudget(ownerId: string): Promise<FanBudget | null> {
  await ensureKobolinkSchema();
  const sql = getSql();
  const rows = (await sql`
    select budget
    from kobolink_fan_budgets
    where owner_id = ${ownerId}
    limit 1
  `) as Array<{ budget: FanBudget }>;
  return rows[0]?.budget ?? null;
}

async function writePostgresFanBudget(ownerId: string, budget: FanBudget): Promise<void> {
  await ensureKobolinkSchema();
  const sql = getSql();
  await sql`
    insert into kobolink_fan_budgets (owner_id, budget, updated_at)
    values (${ownerId}, ${jsonb(budget)}::jsonb, now())
    on conflict (owner_id)
    do update set budget = excluded.budget, updated_at = now()
  `;
}

function normalizeOwnerId(ownerId: string): string {
  const normalized = ownerId.trim();
  if (!normalized) throw new Error("owner id is required for a fan budget.");
  return normalized;
}

function ownerBudgetPath(ownerId: string): string {
  return join(process.cwd(), "data", "fan-budgets", ownerId.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
}
