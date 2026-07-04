import { isCreditedFlutterwaveDeposit, type BridgeWithdrawalReceipt, type FlutterwaveDepositReceipt } from "../flutterwave/bridge.js";

export type StrictBridgeCheckoutProof = {
  success?: boolean;
  receipt?: {
    id?: string;
    txRef?: string;
    status?: string;
    providerMode?: string;
    checkoutUrl?: string;
  };
};

export type StrictBridgeDepositProof = {
  success?: boolean;
  receipt?: {
    id?: string;
    txRef?: string;
    transactionId?: string;
    status?: string;
    providerMode?: string;
  };
};

export type StrictBridgePayoutProof = {
  success?: boolean;
  receipt?: {
    id?: string;
    reference?: string;
    status?: string;
    providerMode?: string;
  };
};

export function findStrictVerifiedFlutterwaveDeposit(
  deposits: FlutterwaveDepositReceipt[],
  checkoutProof: StrictBridgeCheckoutProof | undefined,
  depositProof: StrictBridgeDepositProof | undefined,
): FlutterwaveDepositReceipt | undefined {
  if (!checkoutProof?.success || !checkoutProof.receipt?.id || !checkoutProof.receipt.checkoutUrl) return undefined;
  if (!depositProof?.success || !depositProof.receipt?.id) return undefined;

  return deposits.find((deposit) => (
    isCreditedFlutterwaveDeposit(deposit) &&
    deposit.id === checkoutProof.receipt?.id &&
    deposit.id === depositProof.receipt?.id &&
    deposit.txRef === checkoutProof.receipt.txRef &&
    deposit.txRef === depositProof.receipt.txRef &&
    deposit.transactionId === depositProof.receipt.transactionId &&
    deposit.checkoutUrl === checkoutProof.receipt.checkoutUrl &&
    checkoutProof.receipt.status === "checkout_created" &&
    checkoutProof.receipt.providerMode === "real_flutterwave_sandbox" &&
    depositProof.receipt.status === "credit_applied" &&
    depositProof.receipt.providerMode === "real_flutterwave_sandbox"
  ));
}

export function findStrictAcceptedFlutterwavePayout(
  withdrawals: BridgeWithdrawalReceipt[],
  proof: StrictBridgePayoutProof | undefined,
): BridgeWithdrawalReceipt | undefined {
  if (!proof?.success || !proof.receipt?.id) return undefined;
  return withdrawals.find((withdrawal) => (
    withdrawal.mode === "naira_payout" &&
    withdrawal.providerMode === "real_flutterwave_sandbox" &&
    isAcceptedFlutterwavePayoutStatus(withdrawal.status) &&
    withdrawal.id === proof.receipt?.id &&
    withdrawal.reference === proof.receipt.reference &&
    proof.receipt.providerMode === "real_flutterwave_sandbox" &&
    isAcceptedFlutterwavePayoutStatus(proof.receipt.status)
  ));
}

export function bridgeDepositProofDetail(
  deposit: FlutterwaveDepositReceipt | undefined,
  checkoutProof: StrictBridgeCheckoutProof | undefined,
  depositProof: StrictBridgeDepositProof | undefined,
): string {
  if (deposit) return deposit.transactionId ? "Verified strict checkout and deposit transaction " + deposit.transactionId + "." : "Strict verified checkout and deposit proof exists.";
  if (!checkoutProof) return "Run npm run proof:bridge-checkout, complete the sandbox payment, then run npm run proof:bridge-verify.";
  if (!checkoutProof.success) return "Strict Flutterwave checkout proof exists but is marked unsuccessful.";
  if (!depositProof) return "Strict Flutterwave checkout proof exists, but proofs/real-bridge-deposit.json is missing. Complete checkout and run npm run proof:bridge-verify.";
  if (!depositProof.success) return "Strict Flutterwave deposit proof exists but is marked unsuccessful.";
  return "Strict Flutterwave checkout/deposit proofs exist but do not match the same credited bridge receipt.";
}

export function bridgePayoutProofDetail(
  payout: BridgeWithdrawalReceipt | undefined,
  proof: StrictBridgePayoutProof | undefined,
): string {
  if (payout) return payout.status + " / " + payout.reference;
  if (!proof) return "Run npm run proof:bridge-payout with explicit sandbox payout details.";
  if (!proof.success) return "Strict Flutterwave payout proof exists but is marked unsuccessful.";
  return "Strict Flutterwave payout proof exists but no matching accepted bridge receipt is recorded.";
}

export function isAcceptedFlutterwavePayoutStatus(status: string | undefined): boolean {
  return status === "transfer_requested" || status === "transfer_successful";
}
