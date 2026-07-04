import { createFlutterwaveCheckoutDeposit } from "./flutterwave/bridge.js";
import { upsertDepositReceipt } from "./flutterwave/bridge-store.js";
import { writeBridgeCheckoutProof } from "./proofs/bridge-proof-writer.js";
import { parseRealBridgeCheckoutEnv } from "./proofs/real-setup-inputs.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const input = parseRealBridgeCheckoutEnv();
const receipt = await createFlutterwaveCheckoutDeposit({
  amountNgn: input.amountNgn,
  customer: input.customer,
  ...(input.redirectUrl ? { redirectUrl: input.redirectUrl } : {}),
});
const state = await upsertDepositReceipt(receipt);
const proof = await writeBridgeCheckoutProof(receipt, state);

console.log("KoboLink real Flutterwave checkout proof\n");
console.log("Deposit: " + formatNaira(receipt.amountNgn) + " / " + formatUsdc(receipt.usdcEquivalent));
console.log("Status: " + receipt.status);
if (receipt.checkoutUrl) console.log("Checkout: " + receipt.checkoutUrl);
console.log("Proof saved: proofs/real-bridge-checkout.json");

if (!proof.success) {
  console.error("Flutterwave checkout proof is not successful. A real checkout_created sandbox response is required.");
  process.exitCode = 1;
}
