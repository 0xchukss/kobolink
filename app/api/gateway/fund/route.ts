import { ensureUserAgentWallet, makeUserAgentGatewayClient } from "../../../../src/agents/user-agent-wallets.js";
import { readGatewayBalanceForPrivateKey } from "../../../../src/budgets/gateway-balance.js";
import { appAuthResponse, requireAppMutationAuth } from "../../app-auth-response.js";

export const dynamic = "force-dynamic";

type GatewayFundRequest = {
  amountUsdc?: unknown;
  requiredBudgetUsdc?: unknown;
};

export async function POST(request: Request) {
  try {
    const auth = await requireAppMutationAuth();
    const agentWallet = await ensureUserAgentWallet(auth.userId);
    const body = await request.json() as GatewayFundRequest;
    const amountUsdc = positiveNumber(body.amountUsdc, "amountUsdc");
    const requiredBudgetUsdc = optionalNumber(body.requiredBudgetUsdc) ?? amountUsdc;

    const client = makeUserAgentGatewayClient(agentWallet);
    const before = await readGatewayBalanceForPrivateKey(agentWallet.privateKey, requiredBudgetUsdc);

    // Leave a small buffer (0.01 USDC) for transaction gas since USDC is the native gas token on Arc Testnet
    const maxDepositUsdc = Math.max(0, before.walletUsdc - 0.01);
    const actualDepositUsdc = Math.min(amountUsdc, maxDepositUsdc);

    if (actualDepositUsdc <= 0) {
      throw new Error(`Insufficient Agent Wallet balance to cover gas and deposit. Wallet has ${before.walletUsdc} USDC.`);
    }

    const receipt = await client.deposit(actualDepositUsdc.toFixed(6));
    const after = await readGatewayBalanceForPrivateKey(agentWallet.privateKey, requiredBudgetUsdc);

    return jsonResponse({
      ok: true,
      amountUsdc,
      fanAddress: client.address,
      agentWallet: { address: agentWallet.address },
      before,
      after,
      wallet: after,
      receipt,
    });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not deposit to Gateway" }, { status: 400 });
  }
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(name + " must be a positive number");
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("requiredBudgetUsdc must be a non-negative number");
  return parsed;
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
