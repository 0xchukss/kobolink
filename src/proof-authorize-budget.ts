import { mkdir, writeFile } from "node:fs/promises";

import { writeFanBudget } from "./budgets/budget-store.js";
import { assertGatewayCoversBudget, createFanBudget } from "./budgets/fan-budget.js";
import { readFanGatewayBalance } from "./budgets/gateway-balance.js";
import { config } from "./config/env.js";
import { parseRealBudgetEnv } from "./proofs/real-setup-inputs.js";
import { formatNaira, formatUsdc, ngnToUsdc } from "./utils/currency.js";

const input = parseRealBudgetEnv();
const requiredBudgetUsdc = ngnToUsdc(input.budgetNgn, config.economics.ngnPerUsdc);
const wallet = await readFanGatewayBalance(requiredBudgetUsdc);
assertGatewayCoversBudget(wallet);

const budget = createFanBudget({
  fanAddress: wallet.fanAddress,
  budgetNgn: input.budgetNgn,
  maxTipNgn: input.maxTipNgn,
  period: input.period,
  interests: input.interests,
  preferredCategories: input.preferredCategories,
  duplicateListingProtection: input.duplicateListingProtection,
  duplicateCreatorProtection: input.duplicateCreatorProtection,
});
await writeFanBudget(budget);

const proof = {
  project: "KoboLink",
  phase: "real-fan-budget-authorization",
  recordedAt: new Date().toISOString(),
  success: true,
  budget,
  wallet,
};

await mkdir("proofs", { recursive: true });
await writeFile("proofs/real-budget.json", JSON.stringify(proof, null, 2) + "\n", "utf8");

console.log("KoboLink real fan budget authorization\n");
console.log("Fan: " + budget.fanAddress);
console.log("Budget: " + formatNaira(budget.budgetNgn) + " / " + formatUsdc(budget.budgetUsdc));
console.log("Gateway available: " + formatUsdc(wallet.gatewayAvailableUsdc));
console.log("Proof saved: proofs/real-budget.json");
