import { ensureUserAgentWallet } from "../../../src/agents/user-agent-wallets.js";
import { readPublicCreatorFeed } from "../../../src/creator/listing-store.js";
import { readPaymentStateForFeed } from "../../../src/payments/log-store.js";
import { findMatchedCurrentFeedTipLog, writeRealTipProof } from "../../../src/payments/real-tip-proof.js";
import { runFanTipWithPrivateKey } from "../../../src/payments/x402-gateway.js";
import { appAuthResponse, requireAppMutationAuth } from "../app-auth-response.js";

export const dynamic = "force-dynamic";

type TipRequestBody = {
  listingId?: unknown;
};

export async function GET() {
  const feed = await readPublicCreatorFeed();
  const state = await readPaymentStateForFeed(feed);
  return Response.json(state);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAppMutationAuth();
    const agentWallet = await ensureUserAgentWallet(auth.userId);
    const body = await request.json() as TipRequestBody;
    if (typeof body.listingId !== "string" || body.listingId.length === 0) {
      return Response.json({ error: "listingId is required" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const result = await runFanTipWithPrivateKey(body.listingId, origin, agentWallet.privateKey);
    const feed = await readPublicCreatorFeed();
    const state = await readPaymentStateForFeed(feed);
    const listing = feed.find((item) => item.id === result.listingId);
    if (!listing) throw new Error("Settled tip is not tied to the current creator feed");
    const matchedLog = findMatchedCurrentFeedTipLog(state.logs, listing, result.log);
    const proof = await writeRealTipProof({ listing, result, matchedLog });
    if (!proof.success) throw new Error("Settled tip did not match a verified current-feed payment log");

    return Response.json({
      result,
      agentWallet: { address: agentWallet.address },
      proof: {
        success: proof.success,
        path: "proofs/real-tip.json",
        settlement: proof.settlement,
      },
      logs: state.logs,
      balances: state.balances,
    });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not tip creator" },
      { status: 400 },
    );
  }
}
