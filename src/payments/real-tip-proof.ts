import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { GatewayBalanceSnapshot } from "../budgets/fan-budget.js";
import type { PublicCreatorFeedItem } from "../creator/listing-store.js";
import type { FanTipResult } from "./x402-gateway.js";
import { hasSettlementProof, type PaymentLog } from "./tips.js";

export type RealTipProof = {
  project: "KoboLink";
  phase: "real-single-creator-tip";
  recordedAt: string;
  success: boolean;
  requestedListingId?: string;
  listing: {
    id: string;
    creatorHandle: string;
    creatorWallet: string;
    title: string;
    xPostUrl: string;
    postContent: string;
    mediaUrls: string[];
    amountNgn: number;
    amountUsdc: number;
    x402PaymentPath: string;
  };
  walletBefore?: GatewayBalanceSnapshot;
  payment: FanTipResult["payment"];
  settlement: {
    logId?: string;
    transactionHash?: string;
    explorerUrl?: string;
    paymentReceipt?: string;
    receiptUrl?: string;
    network?: string;
    payer?: string;
    settledAt?: string;
  };
  matchedCurrentFeedLog: boolean;
};

export function selectRealTipTarget(
  feed: PublicCreatorFeedItem[],
  paymentLogs: Pick<PaymentLog, "contentId" | "status">[],
  requestedListingId?: string,
): PublicCreatorFeedItem {
  if (feed.length === 0) {
    throw new Error("No creator-attached X listings are available. Create a real listing before running proof:tip-listing.");
  }

  const settledListingIds = new Set(paymentLogs.filter((log) => log.status === "settled").map((log) => log.contentId));

  if (requestedListingId) {
    const requested = feed.find((item) => item.id === requestedListingId);
    if (!requested) throw new Error("Requested listing is not in the current creator-attached X feed: " + requestedListingId);
    if (settledListingIds.has(requested.id)) throw new Error("Requested listing already has settlement proof: " + requestedListingId);
    return requested;
  }

  const target = feed.find((item) => !settledListingIds.has(item.id));
  if (!target) {
    throw new Error("Every current creator-attached X listing already has settlement proof. Add a new listing or set KOBOLINK_TIP_LISTING_ID.");
  }

  return target;
}

export function findMatchedCurrentFeedTipLog(
  logs: PaymentLog[],
  listing: PublicCreatorFeedItem,
  resultLog: PaymentLog,
): PaymentLog | undefined {
  const resultProof = settlementProofId(resultLog);
  if (!resultProof) return undefined;

  return logs.find((log) =>
    log.contentId === listing.id &&
    hasSettlementProof(log) &&
    settlementProofId(log) === resultProof,
  );
}

export function buildRealTipProof(args: {
  listing: PublicCreatorFeedItem;
  result: FanTipResult;
  matchedLog?: PaymentLog;
  requestedListingId?: string;
  walletBefore?: GatewayBalanceSnapshot;
  recordedAt?: string;
}): RealTipProof {
  const matchedCurrentFeedLog = Boolean(
    args.result.ok &&
      args.matchedLog &&
      args.matchedLog.contentId === args.listing.id &&
      hasSettlementProof(args.matchedLog) &&
      settlementProofId(args.matchedLog) === settlementProofId(args.result.log),
  );

  return {
    project: "KoboLink",
    phase: "real-single-creator-tip",
    recordedAt: args.recordedAt ?? new Date().toISOString(),
    success: matchedCurrentFeedLog,
    requestedListingId: args.requestedListingId,
    listing: {
      id: args.listing.id,
      creatorHandle: args.listing.creator.xHandle,
      creatorWallet: args.listing.creator.walletAddress,
      title: args.listing.title,
      xPostUrl: args.listing.url,
      postContent: args.listing.description,
      mediaUrls: args.listing.mediaUrls ?? [],
      amountNgn: args.listing.suggestedTipNgn,
      amountUsdc: args.listing.suggestedTipUsdc,
      x402PaymentPath: args.listing.x402PaymentPath,
    },
    walletBefore: args.walletBefore,
    payment: args.result.payment,
    settlement: {
      logId: args.matchedLog?.id,
      transactionHash: args.result.log.transactionHash,
      explorerUrl: args.result.log.explorerUrl,
      paymentReceipt: args.result.log.paymentReceipt,
      receiptUrl: args.result.log.receiptUrl,
      network: args.result.log.network,
      payer: args.result.log.payer,
      settledAt: args.result.log.settledAt,
    },
    matchedCurrentFeedLog,
  };
}

export async function writeRealTipProof(args: Parameters<typeof buildRealTipProof>[0], filePath = "proofs/real-tip.json"): Promise<RealTipProof> {
  const proof = buildRealTipProof(args);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(proof, null, 2) + "\n", "utf8");
  return proof;
}

function settlementProofId(log: PaymentLog): string | undefined {
  return log.paymentReceipt ?? log.transactionHash;
}
