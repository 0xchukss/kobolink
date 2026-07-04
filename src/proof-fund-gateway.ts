import { mkdir, writeFile } from "node:fs/promises";

import { readFanBudget } from "./budgets/budget-store.js";
import { readFanGatewayBalance } from "./budgets/gateway-balance.js";
import { config } from "./config/env.js";
import { getFanPrivateKey, makeGatewayClient } from "./proofs/env-wallets.js";
import { parseRealBudgetEnv } from "./proofs/real-setup-inputs.js";
import { formatNaira, formatUsdc, ngnToUsdc } from "./utils/currency.js";

const pollAttempts = Number(process.env.KOBOLINK_GATEWAY_DEPOSIT_POLL_ATTEMPTS ?? 12);
const pollDelayMs = Number(process.env.KOBOLINK_GATEWAY_DEPOSIT_POLL_DELAY_MS ?? 5000);
const explicitDepositUsdc = optionalPositiveNumber(process.env.KOBOLINK_GATEWAY_DEPOSIT_USDC);
const depositBufferUsdc = optionalPositiveNumber(process.env.KOBOLINK_GATEWAY_DEPOSIT_BUFFER_USDC) ?? 0.000001;

const budget = await readFanBudget();
const envBudget = budget ? undefined : parseRealBudgetEnv();
const requiredBudgetNgn = budget?.budgetNgn ?? envBudget?.budgetNgn;
const requiredUsdc = budget?.budgetUsdc ?? ngnToUsdc(requiredBudgetNgn as number, config.economics.ngnPerUsdc);
const before = await readFanGatewayBalance(requiredUsdc);
let depositResult: unknown;
let after = before;
let depositAmountUsdc = 0;

if (before.gatewayAvailableUsdc < requiredUsdc) {
  const shortfall = Math.max(0, requiredUsdc - before.gatewayAvailableUsdc);
  depositAmountUsdc = explicitDepositUsdc ?? roundUpUsdc(shortfall + depositBufferUsdc);

  if (before.walletUsdc < depositAmountUsdc) {
    throw new Error(
      "Arc wallet does not have enough native USDC to fund Circle Gateway. Wallet " +
        before.walletUsdc +
        " USDC, deposit needed " +
        depositAmountUsdc +
        " USDC.",
    );
  }

  const client = makeGatewayClient(getFanPrivateKey());
  depositResult = await client.deposit(depositAmountUsdc.toFixed(6));

  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    after = await readFanGatewayBalance(requiredUsdc);
    if (after.gatewayAvailableUsdc >= requiredUsdc) break;
    await sleep(pollDelayMs);
  }
}

const success = after.gatewayAvailableUsdc >= requiredUsdc;
const proof = {
  project: "KoboLink",
  phase: "real-circle-gateway-budget-funding",
  recordedAt: new Date().toISOString(),
  success,
  budget: budget
    ? {
        source: "data/fan-budget.json",
        id: budget.id,
        fanAddress: budget.fanAddress,
        budgetNgn: budget.budgetNgn,
        budgetUsdc: budget.budgetUsdc,
      }
    : {
        source: "environment",
        fanAddress: before.fanAddress,
        budgetNgn: requiredBudgetNgn,
        budgetUsdc: requiredUsdc,
      },
  before,
  deposit: depositAmountUsdc > 0 ? { amountUsdc: depositAmountUsdc, result: depositResult } : { skipped: true, reason: "Gateway already covered the target fan budget." },
  after,
};

await mkdir("proofs", { recursive: true });
await writeFile("proofs/real-gateway-funding.json", JSON.stringify(proof, jsonSafe, 2) + "\n", "utf8");

console.log("KoboLink real Circle Gateway funding proof\n");
console.log("Budget required: " + formatNaira(requiredBudgetNgn as number) + " / " + formatUsdc(requiredUsdc));
console.log("Gateway before: " + formatUsdc(before.gatewayAvailableUsdc));
if (depositAmountUsdc > 0) console.log("Deposited: " + formatUsdc(depositAmountUsdc));
console.log("Gateway after: " + formatUsdc(after.gatewayAvailableUsdc));
console.log("Proof saved: proofs/real-gateway-funding.json");

if (!success) {
  console.error("Circle Gateway balance still does not cover the fan budget after funding attempt.");
  process.exitCode = 1;
}

function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function optionalPositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Expected a positive numeric USDC amount. Received: " + value);
  return parsed;
}

function roundUpUsdc(value: number): number {
  return Math.ceil(value * 1_000_000) / 1_000_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
