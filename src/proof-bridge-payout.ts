import { requestFlutterwaveNairaPayout } from "./flutterwave/bridge.js";
import { readBridgeState, upsertWithdrawalReceipt } from "./flutterwave/bridge-store.js";
import { assertCreatorWithdrawalBackedBySettledTips } from "./flutterwave/withdrawal-guard.js";
import { readPublicCreatorFeed } from "./creator/listing-store.js";
import { readPaymentStateForFeed } from "./payments/log-store.js";
import { writeBridgePayoutProof } from "./proofs/bridge-proof-writer.js";
import { parseRealBridgePayoutEnv } from "./proofs/real-setup-inputs.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const input = parseRealBridgePayoutEnv();
const [feed, bridgeStateBeforePayout] = await Promise.all([readPublicCreatorFeed(), readBridgeState()]);
const paymentState = await readPaymentStateForFeed(feed);
const availability = assertCreatorWithdrawalBackedBySettledTips({
  creatorHandle: input.creatorHandle,
  amountNgn: input.amountNgn,
  paymentState,
  bridgeState: bridgeStateBeforePayout,
});
const receipt = await requestFlutterwaveNairaPayout(input);
const state = await upsertWithdrawalReceipt(receipt);
const proof = await writeBridgePayoutProof(receipt, state);

console.log("KoboLink real Flutterwave Naira payout proof\n");
console.log("Creator: " + receipt.creatorHandle);
console.log("Amount: " + formatNaira(receipt.amountNgn) + " / " + formatUsdc(receipt.usdcEquivalent));
console.log("Status: " + receipt.status);
console.log("Settled creator earnings available before payout: " + formatNaira(availability.availableNgn));
if (receipt.transferId) console.log("Transfer: " + receipt.transferId);
console.log("Proof saved: proofs/real-bridge-payout.json");

if (!proof.success) {
  console.error("Flutterwave payout proof is not successful. A transfer_requested or transfer_successful sandbox response is required.");
  process.exitCode = 1;
}
