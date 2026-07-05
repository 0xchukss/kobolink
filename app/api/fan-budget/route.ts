import { ensureUserAgentWallet } from "../../../src/agents/user-agent-wallets.js";
import { readFanBudgetForOwner, readStoredBudgetStateForOwner, writeFanBudgetForOwner } from "../../../src/budgets/budget-store.js";
import { assertGatewayCoversBudget, createFanBudget } from "../../../src/budgets/fan-budget.js";
import { readGatewayBalanceForPrivateKey } from "../../../src/budgets/gateway-balance.js";
import { config } from "../../../src/config/env.js";
import { isCreatorCategory, type CreatorCategory } from "../../../src/creator/listings.js";
import { ngnToUsdc } from "../../../src/utils/currency.js";
import { appAuthResponse, requireAppMutationAuth } from "../app-auth-response.js";
import { getUsdcContractAddress } from "../../../src/payments/x402-gateway.js";

export const dynamic = "force-dynamic";

type BudgetRequestBody = {
  budgetNgn?: unknown;
  maxTipNgn?: unknown;
  period?: unknown;
  interests?: unknown;
  preferredCategories?: unknown;
  duplicateListingProtection?: unknown;
  duplicateCreatorProtection?: unknown;
};

export async function GET() {
  try {
    const auth = await requireAppMutationAuth();
    const agentWallet = await ensureUserAgentWallet(auth.userId);
    const budget = await readFanBudgetForOwner(auth.userId);
    const wallet = await readGatewayBalanceForPrivateKey(agentWallet.privateKey, budget?.budgetUsdc ?? 0);
    const state = await readStoredBudgetStateForOwner(auth.userId, wallet);
    const usdcTokenAddress = await getUsdcContractAddress().catch(() => null);
    return Response.json({ ...state, agentWallet: publicAgentWallet(agentWallet.address), usdcTokenAddress });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not read fan budget" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAppMutationAuth();
    const agentWallet = await ensureUserAgentWallet(auth.userId);
    const body = await request.json() as BudgetRequestBody;
    const budgetNgn = positiveNumber(body.budgetNgn, "budgetNgn");
    const maxTipNgn = positiveNumber(body.maxTipNgn, "maxTipNgn");
    const requiredBudgetUsdc = ngnToUsdc(budgetNgn, config.economics.ngnPerUsdc);
    const wallet = await readGatewayBalanceForPrivateKey(agentWallet.privateKey, requiredBudgetUsdc);
    assertGatewayCoversBudget(wallet);

    const budget = createFanBudget({
      fanAddress: wallet.fanAddress,
      budgetNgn,
      maxTipNgn,
      period: body.period === "daily" ? "daily" : "weekly",
      interests: categories(body.interests),
      preferredCategories: categories(body.preferredCategories ?? body.interests),
      duplicateListingProtection: booleanValue(body.duplicateListingProtection, true),
      duplicateCreatorProtection: booleanValue(body.duplicateCreatorProtection, true),
    });

    await writeFanBudgetForOwner(auth.userId, budget);
    const state = await readStoredBudgetStateForOwner(auth.userId, wallet);
    const usdcTokenAddress = await getUsdcContractAddress().catch(() => null);

    return Response.json({ ...state, agentWallet: publicAgentWallet(agentWallet.address), usdcTokenAddress }, { status: 201 });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not create fan budget" }, { status: 400 });
  }
}

function publicAgentWallet(address: string) {
  return { address };
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(name + " must be a positive number");
  return parsed;
}

function categories(value: unknown): CreatorCategory[] {
  if (!Array.isArray(value)) throw new Error("interests must be a category array");
  const parsed = value.filter((item): item is CreatorCategory => typeof item === "string" && isCreatorCategory(item));
  if (parsed.length === 0) throw new Error("at least one valid category is required");
  return [...new Set(parsed)];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
