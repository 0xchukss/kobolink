import { ensureUserAgentWallet } from "../../../../src/agents/user-agent-wallets.js";
import { runAutonomousPaymentAgent } from "../../../../src/agents/payment-agent.js";
import { readFanBudgetForOwner, writeFanBudgetForOwner } from "../../../../src/budgets/budget-store.js";
import { assertGatewayCoversBudget } from "../../../../src/budgets/fan-budget.js";
import { readGatewayBalanceForPrivateKey } from "../../../../src/budgets/gateway-balance.js";
import { readPublicCreatorFeed } from "../../../../src/creator/listing-store.js";
import { readPaymentStateForFeed } from "../../../../src/payments/log-store.js";
import { runFanTipWithPrivateKey } from "../../../../src/payments/x402-gateway.js";
import { appAuthResponse, requireAppMutationAuth } from "../../app-auth-response.js";

export const dynamic = "force-dynamic";

type AgentRunBody = {
  targetTipCount?: unknown;
};

export async function POST(request: Request) {
  try {
    const auth = await requireAppMutationAuth();
    const agentWallet = await ensureUserAgentWallet(auth.userId);
    const budget = await readFanBudgetForOwner(auth.userId);
    if (!budget) return Response.json({ error: "Create a fan budget before running the agent" }, { status: 400 });

    const body = await optionalJson(request) as AgentRunBody;
    const targetTipCount = positiveInteger(body.targetTipCount, 3);

    const feed = await readPublicCreatorFeed();
    if (feed.length === 0) {
      return Response.json({ error: "No creator-attached X listings are available for the agent to tip." }, { status: 400 });
    }

    const [paymentState, wallet] = await Promise.all([
      readPaymentStateForFeed(feed),
      readGatewayBalanceForPrivateKey(agentWallet.privateKey, budget.budgetUsdc),
    ]);
    assertGatewayCoversBudget(wallet);

    const result = await runAutonomousPaymentAgent({
      budget,
      feed,
      paymentLogs: paymentState.logs,
      wallet,
      appOrigin: new URL(request.url).origin,
      targetTipCount,
      executor: (listingId, appOrigin) => runFanTipWithPrivateKey(listingId, appOrigin, agentWallet.privateKey),
    });

    await writeFanBudgetForOwner(auth.userId, result.budget);

    if (result.tipped.length < targetTipCount || result.uniqueProofCount < targetTipCount) {
      return Response.json(
        {
          ...result,
          agentWallet: { address: agentWallet.address },
          error: "Agent settled " + result.tipped.length + " of " + targetTipCount + " required real x402 tips. No successful run is recorded until every target tip has proof.",
        },
        { status: 409 },
      );
    }

    return Response.json({ ...result, agentWallet: { address: agentWallet.address } });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not run payment agent" }, { status: 400 });
  }
}

async function optionalJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("targetTipCount must be a positive integer");
  return parsed;
}
