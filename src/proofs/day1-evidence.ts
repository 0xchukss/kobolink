import { config } from "../config/env.js";
import { assertAddress, readArcNativeUsdcBalanceProof } from "../payments/arc.js";
import { getFanAddress } from "./env-wallets.js";

export type Day1Proof = {
  updatedAt?: string;
  arcBalance?: {
    recordedAt?: string;
    ok?: boolean;
    network?: string;
    chainId?: number;
    address?: string;
    nativeUsdc?: string;
    nativeUsdcAtomic?: string;
    gateway?: {
      walletUsdc?: string;
      gatewayAvailableUsdc?: string;
      gatewayTotalUsdc?: string;
    };
  };
  arcTransfer?: {
    ok?: boolean;
    chainId?: number;
    network?: string;
    amountUsdc?: string;
    transactionHash?: string;
    explorerUrl?: string;
    recordedAt?: string;
    status?: string;
  };
  x402Payment?: {
    recordedAt?: string;
    ok?: boolean;
    endpoint?: string;
    challengeStatus?: number;
    buyerAddress?: string;
    sellerAddress?: string;
    network?: string;
    chain?: string;
    facilitatorUrl?: string;
    priceUsdc?: string;
    priceAtomic?: string | number;
    requirements?: {
      scheme?: string;
      network?: string;
      asset?: string;
      amount?: string;
      payTo?: string;
      maxTimeoutSeconds?: number;
      extra?: { verifyingContract?: string; [key: string]: unknown };
    };
    support?: { supported?: boolean; [key: string]: unknown };
    verifyResult?: { isValid?: boolean; payer?: string; [key: string]: unknown };
    settleResult?: { success?: boolean; payer?: string; transaction?: string; network?: string; [key: string]: unknown };
    payment?: {
      amount?: string;
      formattedAmount?: string;
      status?: number;
      transaction?: string;
      data?: unknown;
    };
    paidRequest?: {
      verified?: boolean;
      payer?: string;
      amount?: string;
      network?: string;
      transaction?: string;
    };
  };
};

export type ArcBalanceSnapshot = {
  address: string;
  chainId: number;
  network: string;
  nativeUsdc: number;
  checkedAt?: string;
};

export type LiveArcBalanceReader = (address: string) => Promise<ArcBalanceSnapshot>;

export type ArcBalanceEvidence = {
  ok: boolean;
  source: string;
  address?: string;
  chainId?: number;
  nativeUsdc: number;
  error?: string;
};

export type ArcBalanceEvidenceOptions = {
  live?: boolean;
  reader?: LiveArcBalanceReader;
  addressResolver?: () => string;
};

export type X402ProofEvidence = {
  ok: boolean;
  source: string;
  transaction?: string;
  detail: string;
};

export type X402ProofEvidenceOptions = {
  expectedSellerAddress?: string;
};

export async function readArcBalanceEvidence(day1: Day1Proof | undefined, options: ArcBalanceEvidenceOptions = {}): Promise<ArcBalanceEvidence> {
  if (options.live) {
    try {
      const address = (options.addressResolver ?? getFanAddress)();
      const reader = options.reader ?? readLiveArcBalance;
      const snapshot = await reader(address);
      const ok = sameAddress(snapshot.address, address) && snapshot.chainId === config.arc.chainId && snapshot.nativeUsdc > 0;

      return {
        ok,
        source: "live Arc RPC",
        address: snapshot.address,
        chainId: snapshot.chainId,
        nativeUsdc: snapshot.nativeUsdc,
        error: ok ? undefined : "Live Arc balance is empty, on the wrong chain, or for a different address.",
      };
    } catch (error) {
      return {
        ok: false,
        source: "live Arc RPC",
        address: day1?.arcBalance?.address,
        chainId: day1?.arcBalance?.chainId,
        nativeUsdc: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return readStoredArcBalanceEvidence(day1);
}

export function readStoredArcBalanceEvidence(day1: Day1Proof | undefined): ArcBalanceEvidence {
  const nativeUsdc = Number(day1?.arcBalance?.nativeUsdc ?? 0);
  const chainId = day1?.arcBalance?.chainId;
  const address = day1?.arcBalance?.address;
  const ok = Boolean(day1?.arcBalance?.ok && chainId === config.arc.chainId && nativeUsdc > 0 && address && !isPlaceholder(address));

  return {
    ok,
    source: "proofs/day1.json",
    address,
    chainId,
    nativeUsdc,
    error: ok ? undefined : "Stored Arc balance proof is missing, unfunded, or not on Arc Testnet.",
  };
}

export function readX402ProofEvidence(day1: Day1Proof | undefined, options: X402ProofEvidenceOptions = {}): X402ProofEvidence {
  const proof = day1?.x402Payment;
  if (!proof?.ok) return missingX402("Run npm run proof:x402-payment successfully.");

  const transaction = proof.payment?.transaction;
  const expectedSeller = options.expectedSellerAddress ?? process.env.KOBOLINK_CREATOR_ADDRESS ?? config.x402.payToAddress;
  const failures: string[] = [];

  requireCheck(proof.challengeStatus === 402, "endpoint did not return 402 before payment", failures);
  requireCheck(proof.payment?.status === 200, "paid request did not return 200", failures);
  requireCheck(Boolean(transaction), "missing Circle payment transaction/receipt id", failures);
  requireCheck(proof.network === config.x402.network, "proof network does not match " + config.x402.network, failures);
  requireCheck(proof.chain === config.circle.gatewayChain, "proof Circle chain does not match " + config.circle.gatewayChain, failures);
  requireCheck(proof.facilitatorUrl === config.circle.gatewayFacilitatorUrl, "proof facilitator URL does not match configured Circle Gateway facilitator", failures);
  requireCheck(proof.requirements?.scheme === "exact", "payment requirement scheme is not exact", failures);
  requireCheck(proof.requirements?.network === config.x402.network, "payment requirements are not for Arc Testnet x402", failures);
  requireCheck(Boolean(proof.requirements?.asset && !isPlaceholder(proof.requirements.asset)), "payment requirements are missing the USDC asset", failures);
  requireCheck(Boolean(proof.requirements?.extra?.verifyingContract && !isPlaceholder(String(proof.requirements.extra.verifyingContract))), "payment requirements are missing the Circle Gateway verifying contract", failures);
  requireCheck(Boolean(proof.requirements?.amount), "payment requirements are missing the atomic amount", failures);
  requireCheck(proof.payment?.amount === proof.requirements?.amount, "client payment amount does not match the x402 requirement", failures);
  requireCheck(proof.paidRequest?.amount === proof.requirements?.amount, "settled request amount does not match the x402 requirement", failures);
  requireCheck(proof.paidRequest?.network === config.x402.network, "settled request network does not match Arc Testnet", failures);
  requireCheck(proof.settleResult?.network === config.x402.network, "Circle settle result network does not match Arc Testnet", failures);
  requireCheck(proof.support?.supported === true, "Circle Gateway client did not confirm x402 support", failures);
  requireCheck(proof.verifyResult?.isValid === true, "Circle Gateway verify result is not valid", failures);
  requireCheck(proof.settleResult?.success === true, "Circle Gateway settle result is not successful", failures);
  requireCheck(proof.paidRequest?.verified === true, "paid request was not verified", failures);
  requireCheck(Boolean(transaction && proof.settleResult?.transaction === transaction), "payment transaction does not match Circle settle result", failures);
  requireCheck(Boolean(transaction && proof.paidRequest?.transaction === transaction), "payment transaction does not match paid request", failures);
  requireCheck(sameAddress(proof.requirements?.payTo, proof.sellerAddress), "x402 payTo does not match proof seller address", failures);
  requireCheck(isPlaceholder(expectedSeller) || sameAddress(proof.sellerAddress, expectedSeller), "proof seller address does not match configured creator settlement address", failures);
  requireCheck(sameAddress(proof.paidRequest?.payer, proof.buyerAddress), "paid request payer does not match proof buyer address", failures);
  requireCheck(sameAddress(proof.verifyResult?.payer, proof.buyerAddress), "verify result payer does not match proof buyer address", failures);

  if (failures.length > 0) {
    return missingX402("Stored x402 proof is incomplete: " + failures[0] + ".");
  }

  return {
    ok: true,
    source: "proofs/day1.json",
    transaction,
    detail: "Payment receipt " + transaction + " settled on " + proof.network + " through Circle Gateway.",
  };
}

async function readLiveArcBalance(address: string): Promise<ArcBalanceSnapshot> {
  const proof = await readArcNativeUsdcBalanceProof(assertAddress("Arc balance address", address));
  return {
    address: proof.address,
    chainId: proof.chainId,
    network: proof.network,
    nativeUsdc: Number(proof.formatted),
    checkedAt: new Date().toISOString(),
  };
}

function missingX402(detail: string): X402ProofEvidence {
  return {
    ok: false,
    source: "proofs/day1.json",
    detail,
  };
}

function requireCheck(ok: boolean, message: string, failures: string[]): void {
  if (!ok) failures.push(message);
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const lowered = value.trim().toLowerCase();
  return !lowered || lowered === "replace_me" || lowered.includes("replace_me") || lowered.includes("placeholder") || /^0x0+$/.test(lowered);
}
