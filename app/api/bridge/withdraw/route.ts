import { requestFlutterwaveNairaPayout } from "../../../../src/flutterwave/bridge.js";
import { assertCreatorWithdrawalBackedBySettledTips } from "../../../../src/flutterwave/withdrawal-guard.js";
import { readPublicCreatorFeed } from "../../../../src/creator/listing-store.js";
import { readPaymentStateForFeed } from "../../../../src/payments/log-store.js";
import { publicBridgeSnapshot, publicWithdrawalReceipt, readBridgeState, upsertWithdrawalReceipt } from "../../../../src/flutterwave/bridge-store.js";
import { isAcceptedFlutterwavePayoutStatus } from "../../../../src/proofs/bridge-proof-evidence.js";
import { writeBridgePayoutProof } from "../../../../src/proofs/bridge-proof-writer.js";
import { appAuthResponse, requireAppMutationAuth } from "../../app-auth-response.js";

export const dynamic = "force-dynamic";

type WithdrawBody = {
  creatorHandle?: unknown;
  amountNgn?: unknown;
  bankCode?: unknown;
  accountNumber?: unknown;
};

export async function POST(request: Request) {
  try {
    await requireAppMutationAuth();
    const body = await request.json() as WithdrawBody;
    const creatorHandle = stringValue(body.creatorHandle, "creatorHandle");
    const amountNgn = positiveNumber(body.amountNgn, "amountNgn");
    const [feed, bridgeStateBeforePayout] = await Promise.all([readPublicCreatorFeed(), readBridgeState()]);
    const paymentState = await readPaymentStateForFeed(feed);
    const availability = assertCreatorWithdrawalBackedBySettledTips({
      creatorHandle,
      amountNgn,
      paymentState,
      bridgeState: bridgeStateBeforePayout,
    });

    const receipt = await requestFlutterwaveNairaPayout({
      creatorHandle,
      amountNgn,
      bankCode: stringValue(body.bankCode, "bankCode"),
      accountNumber: stringValue(body.accountNumber, "accountNumber"),
    });

    const stateBeforeProof = await upsertWithdrawalReceipt(receipt);
    if (receipt.mode === "naira_payout" && receipt.providerMode === "real_flutterwave_sandbox" && isAcceptedFlutterwavePayoutStatus(receipt.status)) {
      await writeBridgePayoutProof(receipt, stateBeforeProof);
    }
    const state = await readBridgeState();
    return Response.json({ receipt: publicWithdrawalReceipt(receipt), state: publicBridgeSnapshot(state), availability });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not create withdrawal request" }, { status: 400 });
  }
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}