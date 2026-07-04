import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isCreditedFlutterwaveDeposit, type BridgeWithdrawalReceipt, type FlutterwaveBridgeSnapshot, type FlutterwaveDepositReceipt } from "../flutterwave/bridge.js";
import { publicBridgeSnapshot, publicDepositReceipt, publicWithdrawalReceipt } from "../flutterwave/bridge-store.js";
import { getFlutterwaveConfigStatus } from "../flutterwave/config.js";
import { isAcceptedFlutterwavePayoutStatus } from "./bridge-proof-evidence.js";

type BridgeProofOptions = {
  recordedAt?: string;
  path?: string;
};

export type BridgeCheckoutProof = Awaited<ReturnType<typeof buildBridgeCheckoutProof>>;
export type BridgeDepositProof = Awaited<ReturnType<typeof buildBridgeDepositProof>>;
export type BridgePayoutProof = Awaited<ReturnType<typeof buildBridgePayoutProof>>;

export async function writeBridgeCheckoutProof(
  receipt: FlutterwaveDepositReceipt,
  state: FlutterwaveBridgeSnapshot,
  options: BridgeProofOptions = {},
): Promise<BridgeCheckoutProof> {
  const proof = await buildBridgeCheckoutProof(receipt, state, options.recordedAt);
  await writeJson(options.path ?? "proofs/real-bridge-checkout.json", proof);
  return proof;
}

export async function writeBridgeDepositProof(
  receipt: FlutterwaveDepositReceipt,
  state: FlutterwaveBridgeSnapshot,
  options: BridgeProofOptions = {},
): Promise<BridgeDepositProof> {
  const proof = await buildBridgeDepositProof(receipt, state, options.recordedAt);
  await writeJson(options.path ?? "proofs/real-bridge-deposit.json", proof);
  return proof;
}

export async function writeBridgePayoutProof(
  receipt: BridgeWithdrawalReceipt,
  state: FlutterwaveBridgeSnapshot,
  options: BridgeProofOptions = {},
): Promise<BridgePayoutProof> {
  const proof = await buildBridgePayoutProof(receipt, state, options.recordedAt);
  await writeJson(options.path ?? "proofs/real-bridge-payout.json", proof);
  return proof;
}

export async function buildBridgeCheckoutProof(
  receipt: FlutterwaveDepositReceipt,
  state: FlutterwaveBridgeSnapshot,
  recordedAt = new Date().toISOString(),
) {
  return {
    project: "KoboLink",
    phase: "real-flutterwave-checkout",
    recordedAt,
    success: receipt.providerMode === "real_flutterwave_sandbox" && receipt.status === "checkout_created" && Boolean(receipt.checkoutUrl),
    configStatus: getFlutterwaveConfigStatus(),
    rails: state.rails,
    receipt: publicDepositReceipt(receipt),
    bridgeState: publicBridgeSnapshot(state),
  };
}

export async function buildBridgeDepositProof(
  receipt: FlutterwaveDepositReceipt,
  state: FlutterwaveBridgeSnapshot,
  recordedAt = new Date().toISOString(),
) {
  const success = isCreditedFlutterwaveDeposit(receipt);
  const proofState = success
    ? {
        ...state,
        verifiedNairaBalance: Math.max(state.verifiedNairaBalance, receipt.creditedNgn),
        verifiedUsdcEquivalent: Math.max(state.verifiedUsdcEquivalent, receipt.creditedUsdc),
        proofBackedDepositIds: Array.from(new Set([...state.proofBackedDepositIds, receipt.id])),
      }
    : state;

  return {
    project: "KoboLink",
    phase: "real-flutterwave-deposit-verification",
    recordedAt,
    success,
    configStatus: getFlutterwaveConfigStatus(),
    rails: proofState.rails,
    receipt: publicDepositReceipt(receipt),
    creditedBalance: {
      amountNgn: proofState.verifiedNairaBalance,
      amountUsdc: proofState.verifiedUsdcEquivalent,
    },
    bridgeState: publicBridgeSnapshot(proofState),
  };
}

export async function buildBridgePayoutProof(
  receipt: BridgeWithdrawalReceipt,
  state: FlutterwaveBridgeSnapshot,
  recordedAt = new Date().toISOString(),
) {
  return {
    project: "KoboLink",
    phase: "real-flutterwave-naira-payout",
    recordedAt,
    success: receipt.providerMode === "real_flutterwave_sandbox" && isAcceptedFlutterwavePayoutStatus(receipt.status),
    configStatus: getFlutterwaveConfigStatus(),
    rails: state.rails,
    receipt: publicWithdrawalReceipt(receipt),
    bridgeState: publicBridgeSnapshot(state),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}
