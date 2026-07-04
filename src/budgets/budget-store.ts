import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

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
  return readFanBudget(ownerBudgetPath(ownerId));
}

export async function writeFanBudgetForOwner(ownerId: string, budget: FanBudget): Promise<void> {
  return writeFanBudget(budget, ownerBudgetPath(ownerId));
}

export async function readStoredBudgetStateForOwner(ownerId: string, wallet: GatewayBalanceSnapshot | null = null): Promise<BudgetState> {
  return readStoredBudgetState(ownerBudgetPath(ownerId), wallet);
}

function ownerBudgetPath(ownerId: string): string {
  return join(process.cwd(), "data", "fan-budgets", ownerId.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
}
