import { config } from "../config/env.js";
import type { ContentListing, CreatorProfile } from "../creator/listings.js";
import { transactionExplorerUrl } from "./arc.js";

export type FeedItem = ContentListing & { creator: CreatorProfile };
export type PaymentStatus = "pending" | "settled" | "failed";

export type PaymentLog = {
  id: string;
  creatorId: string;
  creatorHandle: string;
  contentId: string;
  contentTitle: string;
  amountNgn: number;
  amountUsdc: number;
  x402PaymentUrl: string;
  status: PaymentStatus;
  createdAt: string;
  transactionHash?: string;
  explorerUrl?: string;
  paymentReceipt?: string;
  receiptUrl?: string;
  payer?: string;
  network?: string;
  amountAtomic?: string;
  payTo?: string;
  asset?: string;
  facilitatorUrl?: string;
  receipt?: unknown;
  settledAt?: string;
  error?: string;
};

export type VerifiedSettlement = {
  transactionHash?: string;
  paymentReceipt?: string;
  receiptUrl?: string;
  settledAt?: string;
  payer?: string;
  network?: string;
  receipt?: unknown;
};

type CircleSettlementReceipt = {
  verify?: { isValid?: boolean };
  settle?: { success?: boolean; transaction?: string; network?: string };
  network?: string;
  amountAtomic?: string;
  asset?: string;
  payTo?: string;
  facilitatorUrl?: string;
};

type ArcTransactionReceipt = {
  type?: string;
  chainId?: number | string;
  network?: string;
  transactionHash?: string;
  hash?: string;
  status?: string;
  from?: string;
  to?: string;
  valueAtomic?: string;
  valueNativeUsdc?: string;
  blockNumber?: string | number | bigint;
  explorerUrl?: string;
};

export type CreatorBalance = {
  creatorId: string;
  creatorHandle?: string;
  amountNgn: number;
  amountUsdc: number;
  lastSettledAt?: string;
};

const txHashPattern = /^0x[a-fA-F0-9]{64}$/;
const receiptPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,}$/;

export function x402PaymentUrl(listing: ContentListing): string {
  return `/x402/pay/${listing.id}`;
}

export function createPendingTip(item: FeedItem, createdAt = new Date().toISOString()): PaymentLog {
  return baseLog(item, "pending", createdAt);
}

export function settleVerifiedTip(
  item: FeedItem,
  settlement: VerifiedSettlement,
  createdAt = settlement.settledAt ?? new Date().toISOString(),
): PaymentLog {
  const hasTxHash = Boolean(settlement.transactionHash);
  const hasReceipt = Boolean(settlement.paymentReceipt);

  if (!hasTxHash && !hasReceipt) {
    throw new Error("settlement proof requires a transactionHash or paymentReceipt");
  }

  if (settlement.transactionHash && !txHashPattern.test(settlement.transactionHash)) {
    throw new Error(`settlement transactionHash must be a real 0x-prefixed transaction hash. Received: ${settlement.transactionHash}`);
  }

  if (settlement.transactionHash && !hasTransactionHashReceipt(settlement.receipt, settlement.transactionHash, expectationFromItem(item))) {
    throw new Error("settlement transactionHash requires Arc or Circle settlement receipt evidence for the listed creator and amount");
  }

  if (settlement.paymentReceipt && !receiptPattern.test(settlement.paymentReceipt)) {
    throw new Error(`settlement paymentReceipt must be a real receipt identifier. Received: ${settlement.paymentReceipt}`);
  }

  if (settlement.paymentReceipt && !hasCircleSettlementReceipt(settlement.receipt, settlement.paymentReceipt, expectationFromItem(item))) {
    throw new Error("Circle Gateway receipt proof requires successful verify and settle payloads for the listed creator and amount");
  }

  return {
    ...baseLog(item, "settled", createdAt),
    transactionHash: settlement.transactionHash,
    explorerUrl: settlement.transactionHash ? transactionExplorerUrl(settlement.transactionHash) : undefined,
    paymentReceipt: settlement.paymentReceipt,
    receiptUrl: settlement.receiptUrl,
    payer: settlement.payer,
    network: settlement.network,
    amountAtomic: receiptAmountAtomic(settlement.receipt),
    payTo: receiptPayTo(settlement.receipt),
    asset: receiptAsset(settlement.receipt),
    facilitatorUrl: receiptFacilitatorUrl(settlement.receipt),
    receipt: settlement.receipt,
    settledAt: settlement.settledAt ?? createdAt,
  };
}

export function hasSettlementProof(log: PaymentLog): boolean {
  if (log.status !== "settled") return false;
  if (log.transactionHash && txHashPattern.test(log.transactionHash)) return hasTransactionHashReceipt(log.receipt, log.transactionHash, expectationFromLog(log));
  if (log.paymentReceipt && receiptPattern.test(log.paymentReceipt)) {
    return hasCircleSettlementReceipt(log.receipt, log.paymentReceipt, expectationFromLog(log));
  }
  return false;
}

export function failTip(item: FeedItem, error: string, createdAt = new Date().toISOString()): PaymentLog {
  return {
    ...baseLog(item, "failed", createdAt),
    error,
  };
}

export function balancesFromLogs(logs: PaymentLog[]): CreatorBalance[] {
  const balances = new Map<string, CreatorBalance>();

  for (const log of logs.filter(hasSettlementProof)) {
    const current = balances.get(log.creatorId) ?? {
      creatorId: log.creatorId,
      creatorHandle: log.creatorHandle,
      amountNgn: 0,
      amountUsdc: 0,
      lastSettledAt: log.settledAt,
    };

    current.amountNgn += log.amountNgn;
    current.amountUsdc = Number((current.amountUsdc + log.amountUsdc).toFixed(6));
    current.lastSettledAt = log.settledAt ?? current.lastSettledAt;
    balances.set(log.creatorId, current);
  }

  return [...balances.values()];
}

type SettlementExpectation = {
  amountAtomic6: string;
  amountAtomic18: string;
  payTo?: string;
  network?: string;
};

function expectationFromItem(item: FeedItem): SettlementExpectation {
  return {
    amountAtomic6: usdcAtomicString(item.suggestedTipUsdc, 6),
    amountAtomic18: usdcAtomicString(item.suggestedTipUsdc, 18),
    payTo: item.creator.walletAddress,
    network: config.x402.network,
  };
}

function expectationFromLog(log: PaymentLog): SettlementExpectation {
  return {
    amountAtomic6: usdcAtomicString(log.amountUsdc, 6),
    amountAtomic18: usdcAtomicString(log.amountUsdc, 18),
    payTo: log.payTo,
    network: log.network ?? config.x402.network,
  };
}

function hasTransactionHashReceipt(receipt: unknown, transactionHash: string, expected: SettlementExpectation): boolean {
  return hasCircleSettlementReceipt(receipt, transactionHash, expected) || hasArcTransactionReceipt(receipt, transactionHash, expected);
}

function hasCircleSettlementReceipt(receipt: unknown, paymentReceipt: string, expected: SettlementExpectation): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as CircleSettlementReceipt;
  const receiptNetwork = String(value.settle?.network ?? value.network ?? "").toLowerCase();

  return Boolean(
    value.verify?.isValid === true &&
      value.settle?.success === true &&
      value.settle?.transaction === paymentReceipt &&
      value.amountAtomic === expected.amountAtomic6 &&
      validAsset(value.asset) &&
      addressesMatch(value.payTo, expected.payTo) &&
      receiptNetwork === String(expected.network ?? config.x402.network).toLowerCase() &&
      sameUrlOrigin(value.facilitatorUrl, config.circle.gatewayFacilitatorUrl),
  );
}

function hasArcTransactionReceipt(receipt: unknown, transactionHash: string, expected: SettlementExpectation): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as ArcTransactionReceipt;
  const receiptHash = value.transactionHash ?? value.hash;
  const status = String(value.status ?? "").toLowerCase();
  const network = String(value.network ?? "").toLowerCase();
  const chainId = Number(value.chainId);

  return Boolean(
    value.type === "arc-transaction" &&
      receiptHash?.toLowerCase() === transactionHash.toLowerCase() &&
      status === "success" &&
      (network === "eip155:" + config.arc.chainId || chainId === config.arc.chainId) &&
      value.blockNumber &&
      addressesMatch(value.to, expected.payTo) &&
      String(value.valueAtomic ?? "") === expected.amountAtomic18,
  );
}

function receiptAmountAtomic(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== "object") return undefined;
  const value = receipt as CircleSettlementReceipt & ArcTransactionReceipt;
  return value.amountAtomic ?? value.valueAtomic;
}

function receiptPayTo(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== "object") return undefined;
  const value = receipt as CircleSettlementReceipt & ArcTransactionReceipt;
  return value.payTo ?? value.to;
}

function receiptAsset(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== "object") return undefined;
  return (receipt as CircleSettlementReceipt).asset;
}

function receiptFacilitatorUrl(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== "object") return undefined;
  return (receipt as CircleSettlementReceipt).facilitatorUrl;
}

function usdcAtomicString(value: number, decimals: number): string {
  const [whole, fraction = ""] = value.toFixed(decimals).split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0")).toString();
}

function addressesMatch(actual: string | undefined, expected: string | undefined): boolean {
  return Boolean(actual && expected && actual.toLowerCase() === expected.toLowerCase());
}

function validAsset(asset: string | undefined): boolean {
  return Boolean(asset && /^0x[a-fA-F0-9]{40}$/.test(asset) && asset.toLowerCase() !== "0x0000000000000000000000000000000000000000");
}

function sameUrlOrigin(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  return actual.replace(/\/$/, "").toLowerCase() === expected.replace(/\/$/, "").toLowerCase();
}

function baseLog(item: FeedItem, status: PaymentStatus, createdAt: string): PaymentLog {
  return {
    id: `tip-${item.id}-${createdAt.replace(/[^0-9]/g, "")}`,
    creatorId: item.creator.id,
    creatorHandle: item.creator.xHandle,
    contentId: item.id,
    contentTitle: item.title,
    amountNgn: item.suggestedTipNgn,
    amountUsdc: item.suggestedTipUsdc,
    x402PaymentUrl: x402PaymentUrl(item),
    status,
    createdAt,
  };
}