import type { BridgeWithdrawalReceipt, FlutterwaveBridgeSnapshot } from "./bridge.js";
import { isAcceptedFlutterwavePayoutStatus } from "../proofs/bridge-proof-evidence.js";

export type CreatorWithdrawalBalance = {
  creatorHandle?: string;
  amountNgn: number;
};

export type CreatorWithdrawalPaymentState = {
  balances: CreatorWithdrawalBalance[];
};

export type CreatorWithdrawalAvailability = {
  creatorHandle: string;
  earnedNgn: number;
  acceptedPayoutNgn: number;
  availableNgn: number;
};

export function creatorWithdrawalAvailability(args: {
  creatorHandle: string;
  paymentState: CreatorWithdrawalPaymentState;
  bridgeState: Pick<FlutterwaveBridgeSnapshot, "withdrawals">;
}): CreatorWithdrawalAvailability {
  const creatorHandle = normalizeCreatorHandle(args.creatorHandle);
  const earnedNgn = roundNaira(args.paymentState.balances
    .filter((balance) => sameHandle(balance.creatorHandle, creatorHandle))
    .reduce((total, balance) => total + balance.amountNgn, 0));
  const acceptedPayoutNgn = roundNaira(args.bridgeState.withdrawals
    .filter((withdrawal) => isAcceptedCreatorPayout(withdrawal, creatorHandle))
    .reduce((total, withdrawal) => total + withdrawal.amountNgn, 0));

  return {
    creatorHandle,
    earnedNgn,
    acceptedPayoutNgn,
    availableNgn: roundNaira(Math.max(0, earnedNgn - acceptedPayoutNgn)),
  };
}

export function assertCreatorWithdrawalBackedBySettledTips(args: {
  creatorHandle: string;
  amountNgn: number;
  paymentState: CreatorWithdrawalPaymentState;
  bridgeState: Pick<FlutterwaveBridgeSnapshot, "withdrawals">;
}): CreatorWithdrawalAvailability {
  const amountNgn = positiveAmount(args.amountNgn);
  const availability = creatorWithdrawalAvailability(args);

  if (availability.earnedNgn <= 0) {
    throw new Error("Creator has no settled Arc/Circle/x402 earnings to withdraw through Flutterwave.");
  }

  if (amountNgn > availability.availableNgn) {
    throw new Error(
      "Withdrawal exceeds settled Arc/Circle/x402 creator earnings. Available " +
        availability.availableNgn +
        " NGN for " +
        availability.creatorHandle +
        ".",
    );
  }

  return availability;
}

export function isAcceptedPayoutBackedBySettledTips(
  payout: BridgeWithdrawalReceipt | undefined,
  paymentState: CreatorWithdrawalPaymentState,
  bridgeState: Pick<FlutterwaveBridgeSnapshot, "withdrawals">,
): payout is BridgeWithdrawalReceipt {
  if (!payout || !isAcceptedCreatorPayout(payout, payout.creatorHandle)) return false;
  const availability = creatorWithdrawalAvailability({ creatorHandle: payout.creatorHandle, paymentState, bridgeState });
  return availability.earnedNgn > 0 && availability.acceptedPayoutNgn <= availability.earnedNgn;
}

function isAcceptedCreatorPayout(withdrawal: BridgeWithdrawalReceipt, creatorHandle: string): boolean {
  return Boolean(
    withdrawal.mode === "naira_payout" &&
      withdrawal.provider === "flutterwave-sandbox" &&
      withdrawal.providerMode === "real_flutterwave_sandbox" &&
      isAcceptedFlutterwavePayoutStatus(withdrawal.status) &&
      sameHandle(withdrawal.creatorHandle, creatorHandle),
  );
}

function normalizeCreatorHandle(handle: string): string {
  const normalized = handle.trim().startsWith("@") ? handle.trim() : "@" + handle.trim();
  if (!/^@[A-Za-z0-9_]{1,15}$/.test(normalized)) throw new Error("invalid creator handle");
  return normalized;
}

function sameHandle(left: string | undefined, right: string): boolean {
  if (typeof left !== "string") return false;
  try {
    return normalizeCreatorHandle(left).toLowerCase() === normalizeCreatorHandle(right).toLowerCase();
  } catch {
    return false;
  }
}

function positiveAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("withdrawal amount must be positive");
  return value;
}

function roundNaira(value: number): number {
  return Number(value.toFixed(2));
}
