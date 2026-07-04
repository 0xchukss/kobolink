import { verifyFlutterwaveDeposit } from "./flutterwave/bridge.js";
import { findDepositReceipt, upsertDepositReceipt } from "./flutterwave/bridge-store.js";
import { writeBridgeDepositProof } from "./proofs/bridge-proof-writer.js";
import { parseRealBridgeVerifyEnv } from "./proofs/real-setup-inputs.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const input = parseRealBridgeVerifyEnv();
const receipt = await findDepositReceipt(input.receiptId);
if (!receipt) throw new Error("Flutterwave deposit receipt not found: " + input.receiptId);

const verified = await verifyFlutterwaveDeposit({ receipt, transactionId: input.transactionId });
const state = await upsertDepositReceipt(verified);
const proof = await writeBridgeDepositProof(verified, state);

console.log("KoboLink real Flutterwave deposit verification\n");
console.log("Receipt: " + verified.id);
console.log("Transaction: " + input.transactionId);
console.log("Status: " + verified.status);
console.log("Credited: " + formatNaira(verified.creditedNgn) + " / " + formatUsdc(verified.creditedUsdc));
console.log("Proof saved: proofs/real-bridge-deposit.json");

if (!proof.success) {
  console.error("Flutterwave deposit proof is not successful. A verified successful sandbox transaction matching the checkout receipt is required.");
  process.exitCode = 1;
}
