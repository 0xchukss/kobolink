import { mkdir, readFile, writeFile } from "node:fs/promises";

import { readBridgeState } from "./flutterwave/bridge-store.js";
import { isAcceptedPayoutBackedBySettledTips } from "./flutterwave/withdrawal-guard.js";
import { readPublicCreatorFeed } from "./creator/listing-store.js";
import { readPaymentStateForFeed } from "./payments/log-store.js";
import { bridgeDepositProofDetail, bridgePayoutProofDetail, findStrictAcceptedFlutterwavePayout, findStrictVerifiedFlutterwaveDeposit, type StrictBridgeCheckoutProof, type StrictBridgeDepositProof, type StrictBridgePayoutProof } from "./proofs/bridge-proof-evidence.js";
import { getFlutterwaveConfigStatus } from "./flutterwave/config.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const feed = await readPublicCreatorFeed();
const [bridgeState, paymentState, bridgeCheckoutProof, bridgeDepositProof, bridgePayoutProof] = await Promise.all([
  readBridgeState(),
  readPaymentStateForFeed(feed),
  readJsonIfExists<StrictBridgeCheckoutProof>("proofs/real-bridge-checkout.json"),
  readJsonIfExists<StrictBridgeDepositProof>("proofs/real-bridge-deposit.json"),
  readJsonIfExists<StrictBridgePayoutProof>("proofs/real-bridge-payout.json"),
]);

const verifiedDeposit = findStrictVerifiedFlutterwaveDeposit(bridgeState.deposits, bridgeCheckoutProof, bridgeDepositProof);
const strictAcceptedPayout = findStrictAcceptedFlutterwavePayout(bridgeState.withdrawals, bridgePayoutProof);
const acceptedPayout = isAcceptedPayoutBackedBySettledTips(strictAcceptedPayout, paymentState, bridgeState) ? strictAcceptedPayout : undefined;
const payoutRequirement = strictAcceptedPayout && !acceptedPayout
  ? "Accepted Flutterwave payout exists, but it exceeds settled Arc/Circle/x402 creator earnings."
  : bridgePayoutProofDetail(acceptedPayout, bridgePayoutProof);
const success = Boolean(verifiedDeposit && acceptedPayout);

const proof = {
  project: "KoboLink",
  phase: "real-flutterwave-sandbox-naira-bridge-status",
  recordedAt: new Date().toISOString(),
  success,
  configStatus: getFlutterwaveConfigStatus(),
  rails: bridgeState.rails,
  deposit: verifiedDeposit
    ? {
        id: verifiedDeposit.id,
        amountNgn: verifiedDeposit.amountNgn,
        usdcEquivalent: verifiedDeposit.usdcEquivalent,
        status: verifiedDeposit.status,
        providerMode: verifiedDeposit.providerMode,
        txRef: verifiedDeposit.txRef,
        checkoutUrl: verifiedDeposit.checkoutUrl,
        transactionId: verifiedDeposit.transactionId,
        creditedNgn: verifiedDeposit.creditedNgn,
        creditedUsdc: verifiedDeposit.creditedUsdc,
        responseStatus: verifiedDeposit.responseStatus,
        responseMessage: verifiedDeposit.responseMessage,
        source: "proofs/real-bridge-checkout.json + proofs/real-bridge-deposit.json + data/flutterwave-bridge.json",
      }
    : undefined,
  payout: acceptedPayout
    ? {
        id: acceptedPayout.id,
        mode: acceptedPayout.mode,
        provider: acceptedPayout.provider,
        providerMode: acceptedPayout.providerMode,
        status: acceptedPayout.status,
        creatorHandle: acceptedPayout.creatorHandle,
        amountNgn: acceptedPayout.amountNgn,
        usdcEquivalent: acceptedPayout.usdcEquivalent,
        reference: acceptedPayout.reference,
        transferId: acceptedPayout.transferId,
        responseStatus: acceptedPayout.responseStatus,
        responseMessage: acceptedPayout.responseMessage,
        source: "proofs/real-bridge-payout.json + data/flutterwave-bridge.json",
      }
    : undefined,
  creditedBalance: {
    amountNgn: verifiedDeposit?.creditedNgn ?? 0,
    usdcEquivalent: verifiedDeposit?.creditedUsdc ?? 0,
  },
  requirements: {
    deposit: bridgeDepositProofDetail(verifiedDeposit, bridgeCheckoutProof, bridgeDepositProof),
    payout: payoutRequirement,
  },
};

await mkdir("proofs", { recursive: true });
await writeFile("proofs/day6.json", JSON.stringify(proof, null, 2) + "\n", "utf8");

console.log("KoboLink real Flutterwave sandbox Naira bridge status\n");
console.log("Flutterwave keys ready: " + proof.configStatus.ready);
console.log("Deposit: " + (verifiedDeposit ? formatNaira(verifiedDeposit.creditedNgn) + " / " + formatUsdc(verifiedDeposit.creditedUsdc) + " - " + verifiedDeposit.status : proof.requirements.deposit));
console.log("Payout: " + (acceptedPayout ? acceptedPayout.status + " / " + acceptedPayout.reference : proof.requirements.payout));
console.log("Rails: Flutterwave = Naira bridge; Arc/Circle/x402 = USDC creator tip settlement.");
console.log("Proof: proofs/day6.json");

if (!success) process.exitCode = 1;

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
