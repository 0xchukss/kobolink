import { isCreditedFlutterwaveDeposit, verifyFlutterwaveDeposit } from "../../../../../src/flutterwave/bridge.js";
import { findDepositReceipt, publicBridgeSnapshot, publicDepositReceipt, readBridgeState, upsertDepositReceipt } from "../../../../../src/flutterwave/bridge-store.js";
import { writeBridgeDepositProof } from "../../../../../src/proofs/bridge-proof-writer.js";
import { appAuthResponse, requireAppMutationAuth } from "../../../app-auth-response.js";

export const dynamic = "force-dynamic";

type VerifyBody = {
  receiptId?: unknown;
  transactionId?: unknown;
};

export async function POST(request: Request) {
  try {
    await requireAppMutationAuth();
    const body = await request.json() as VerifyBody;
    if (typeof body.receiptId !== "string" || !body.receiptId.trim()) throw new Error("receiptId is required");
    if (typeof body.transactionId !== "string" || !body.transactionId.trim()) throw new Error("transactionId is required");

    const receipt = await findDepositReceipt(body.receiptId);
    if (!receipt) return Response.json({ error: "deposit receipt not found" }, { status: 404 });

    const verified = await verifyFlutterwaveDeposit({ receipt, transactionId: body.transactionId });
    const stateBeforeProof = await upsertDepositReceipt(verified);
    if (isCreditedFlutterwaveDeposit(verified)) {
      await writeBridgeDepositProof(verified, stateBeforeProof);
    }
    const state = await readBridgeState();
    return Response.json({ receipt: publicDepositReceipt(verified), state: publicBridgeSnapshot(state) });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not verify Flutterwave deposit" }, { status: 400 });
  }
}