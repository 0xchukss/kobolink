import { budgetLedger, type BudgetLedger, type FanBudget, type FanBudgetReservation, type GatewayBalanceSnapshot } from "../budgets/fan-budget.js";
import { config } from "../config/env.js";
import type { CreatorCategory } from "../creator/listings.js";
import { hasSettlementProof, type FeedItem, type PaymentLog } from "../payments/tips.js";
import { runFanTip, type FanTipResult } from "../payments/x402-gateway.js";

export type PaymentAgentDecisionStatus = "tipped" | "skipped" | "failed";
export type ContentQualityFlag = "high-signal" | "standard" | "promotional";

export type AgentScoringBreakdown = {
  categoryMatch: boolean;
  creatorReputation: number;
  suggestedTipAffordable: boolean;
  contentQuality: ContentQualityFlag;
  budgetRemainingBeforeNgn: number;
  gatewayRemainingBeforeUsdc: number;
};

export type PaymentAgentDecision = {
  listingId: string;
  creatorHandle: string;
  status: PaymentAgentDecisionStatus;
  amountNgn: number;
  amountUsdc: number;
  score: number;
  reason: string;
  scoring: AgentScoringBreakdown;
  proof?: {
    transactionHash?: string;
    explorerUrl?: string;
    paymentReceipt?: string;
    receiptUrl?: string;
    network?: string;
  };
};

export type PaymentAgentResult = {
  budget: FanBudget;
  ledger: BudgetLedger;
  wallet: GatewayBalanceSnapshot;
  decisions: PaymentAgentDecision[];
  tipped: FanBudgetReservation[];
  paymentProofs: PaymentLog[];
  uniqueProofCount: number;
};

export type AgentTipExecutor = (listingId: string, appOrigin: string) => Promise<FanTipResult>;

export type RunAutonomousPaymentAgentInput = {
  budget: FanBudget;
  feed: FeedItem[];
  paymentLogs: PaymentLog[];
  wallet: GatewayBalanceSnapshot;
  appOrigin: string;
  targetTipCount?: number;
  now?: string;
  executor?: AgentTipExecutor;
};

type PaidSets = {
  listingIds: Set<string>;
  creatorIds: Set<string>;
  creatorHandles: Set<string>;
};

type ReservationLookup = {
  byListingId: Map<string, FanBudgetReservation>;
  creatorIds: Set<string>;
  creatorHandles: Set<string>;
};

export async function runAutonomousPaymentAgent(input: RunAutonomousPaymentAgentInput): Promise<PaymentAgentResult> {
  const now = input.now ?? new Date().toISOString();
  const targetTipCount = input.targetTipCount ?? 3;
  const executor = input.executor ?? runFanTip;
  const budget = cloneBudget(input.budget);
  const paid = paidSets(input.paymentLogs);
  const decisions: PaymentAgentDecision[] = [];
  const tipped: FanBudgetReservation[] = [];
  const paymentProofs: PaymentLog[] = [];
  let runSpentUsdc = 0;

  for (const item of rankedFeed(input.feed, budget)) {
    const ledgerBefore = budgetLedger(budget);
    const reservations = reservationLookup(budget);
    const existingReservation = reservations.byListingId.get(item.id);
    const scoring = scoreListingForAgent({
      budget,
      item,
      ledger: ledgerBefore,
      wallet: input.wallet,
      runSpentUsdc,
      existingReservation,
    });

    const skipReason = skipReasonForAgent({
      budget,
      item,
      scoring,
      paid,
      reservations,
      existingReservation,
      targetReached: paymentProofs.length >= targetTipCount,
    });

    if (skipReason) {
      decisions.push(decision(item, "skipped", scoring, skipReason));
      continue;
    }

    const { reservation, created } = ensureReservation(budget, item, scoring, now);

    try {
      const result = await executor(item.id, input.appOrigin);
      if (!hasSettlementProof(result.log)) {
        throw new Error("x402 payment returned without a verified settlement proof");
      }

      if (!logMatchesAgentListing(result.log, item)) {
        throw new Error("x402 settlement proof does not match the selected creator listing");
      }

      const spentReservation = markReservationSpent(reservation, result.log, now);
      budget.updatedAt = now;
      runSpentUsdc = roundUsdc(runSpentUsdc + result.log.amountUsdc);
      tipped.push({ ...spentReservation });
      paymentProofs.push(result.log);
      decisions.push(decision(item, "tipped", scoring, `Tipped: ${item.creator.category} matched policy, score ${scoringTotal(scoring)}, and x402 settled with proof ${proofId(result.log)}.`, proofFromLog(result.log)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (created) reservation.status = "failed";
      reservation.reason = `Failed: x402 payment did not settle. ${message}`;
      budget.updatedAt = now;
      decisions.push(decision(item, "failed", scoring, reservation.reason));
    }
  }

  const uniqueProofs = new Set(paymentProofs.map(proofId));

  return {
    budget,
    ledger: budgetLedger(budget),
    wallet: input.wallet,
    decisions,
    tipped,
    paymentProofs,
    uniqueProofCount: uniqueProofs.size,
  };
}

export function scoreListingForAgent(args: {
  budget: FanBudget;
  item: FeedItem;
  ledger: BudgetLedger;
  wallet: GatewayBalanceSnapshot;
  runSpentUsdc: number;
  existingReservation?: FanBudgetReservation;
}): AgentScoringBreakdown {
  const effectiveRemainingNgn = args.ledger.remainingNgn + (args.existingReservation?.status === "reserved" ? args.existingReservation.amountNgn : 0);
  const gatewayRemainingBeforeUsdc = roundUsdc(Math.max(0, args.wallet.gatewayAvailableUsdc - args.runSpentUsdc));

  return {
    categoryMatch: args.budget.policy.preferredCategories.includes(args.item.creator.category),
    creatorReputation: creatorReputationScore(args.item),
    suggestedTipAffordable:
      args.item.suggestedTipNgn <= args.budget.policy.maxTipNgn &&
      args.item.suggestedTipNgn <= effectiveRemainingNgn &&
      args.item.suggestedTipUsdc <= gatewayRemainingBeforeUsdc,
    contentQuality: contentQualityFlag(args.item),
    budgetRemainingBeforeNgn: effectiveRemainingNgn,
    gatewayRemainingBeforeUsdc,
  };
}

export function scoringTotal(scoring: AgentScoringBreakdown): number {
  const categoryScore = scoring.categoryMatch ? 35 : 0;
  const qualityScore = scoring.contentQuality === "high-signal" ? 25 : scoring.contentQuality === "standard" ? 12 : 0;
  const affordabilityScore = scoring.suggestedTipAffordable ? 15 : 0;
  const budgetScore = scoring.budgetRemainingBeforeNgn > 0 && scoring.gatewayRemainingBeforeUsdc > 0 ? 5 : 0;
  return categoryScore + scoring.creatorReputation + qualityScore + affordabilityScore + budgetScore;
}

function rankedFeed(feed: FeedItem[], budget: FanBudget): FeedItem[] {
  return [...feed]
    .map((item, index) => {
      const existingReservation = budget.reservations.find((reservation) => reservation.listingId === item.id && reservation.status === "reserved");
      const staticScore = scoringTotal({
        categoryMatch: budget.policy.preferredCategories.includes(item.creator.category),
        creatorReputation: creatorReputationScore(item),
        suggestedTipAffordable: item.suggestedTipNgn <= budget.policy.maxTipNgn,
        contentQuality: contentQualityFlag(item),
        budgetRemainingBeforeNgn: budget.budgetNgn,
        gatewayRemainingBeforeUsdc: budget.budgetUsdc,
      });
      return { item, index, score: staticScore + (existingReservation ? 1000 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

function skipReasonForAgent(args: {
  budget: FanBudget;
  item: FeedItem;
  scoring: AgentScoringBreakdown;
  paid: PaidSets;
  reservations: ReservationLookup;
  existingReservation?: FanBudgetReservation;
  targetReached: boolean;
}): string | undefined {
  const { budget, item, scoring, paid, reservations, existingReservation } = args;
  const creatorHandle = item.creator.xHandle.toLowerCase();
  const executableReservation = existingReservation?.status === "reserved";

  if (args.targetReached) return "Skipped: target of 3 settled creator tips is already complete.";
  if (paid.listingIds.has(item.id)) return "Skipped: this listing already has settlement proof.";
  if (budget.policy.duplicateListingProtection && existingReservation?.status === "spent") return "Skipped: duplicate listing protection blocked a spent listing.";
  if (!scoring.categoryMatch) return "Skipped: category is outside the fan policy.";
  if (scoring.contentQuality === "promotional") return "Skipped: content quality flag marked the listing as promotional.";
  if (item.suggestedTipNgn > budget.policy.maxTipNgn) return "Skipped: suggested tip is above the max tip cap.";
  if (!executableReservation && item.suggestedTipNgn > scoring.budgetRemainingBeforeNgn) return "Skipped: remaining budget would be exceeded.";
  if (item.suggestedTipUsdc > scoring.gatewayRemainingBeforeUsdc) return "Skipped: actual Gateway balance would be exceeded.";
  if (!scoring.suggestedTipAffordable) return "Skipped: suggested tip affordability check failed.";

  if (!executableReservation && budget.policy.duplicateListingProtection && reservations.byListingId.has(item.id)) {
    return "Skipped: duplicate listing protection blocked this listing.";
  }

  if (
    !executableReservation &&
    budget.policy.duplicateCreatorProtection &&
    (reservations.creatorIds.has(item.creator.id) || reservations.creatorHandles.has(creatorHandle) || paid.creatorIds.has(item.creator.id) || paid.creatorHandles.has(creatorHandle))
  ) {
    return "Skipped: duplicate creator protection blocked this creator.";
  }

  if (scoringTotal(scoring) < 60) return "Skipped: deterministic score is below the tipping threshold.";
  return undefined;
}

function ensureReservation(budget: FanBudget, item: FeedItem, scoring: AgentScoringBreakdown, now: string): { reservation: FanBudgetReservation; created: boolean } {
  const existing = budget.reservations.find((reservation) => reservation.listingId === item.id && reservation.status === "reserved");
  if (existing) return { reservation: existing, created: false };

  const reservation: FanBudgetReservation = {
    id: `reserve-${item.id}-${now.replace(/[^0-9]/g, "")}`,
    listingId: item.id,
    creatorId: item.creator.id,
    creatorHandle: item.creator.xHandle,
    amountNgn: item.suggestedTipNgn,
    amountUsdc: item.suggestedTipUsdc,
    status: "reserved",
    reason: `Reserved for real x402 execution: score ${scoringTotal(scoring)} with ${scoring.contentQuality} content quality.`,
    createdAt: now,
  };

  budget.reservations.push(reservation);
  return { reservation, created: true };
}

function markReservationSpent(reservation: FanBudgetReservation, log: PaymentLog, now: string): FanBudgetReservation {
  reservation.status = "spent";
  reservation.reason = `Spent: x402 payment settled with proof ${proofId(log)}.`;
  reservation.spentAt = log.settledAt ?? now;
  reservation.paymentLogId = log.id;
  reservation.paymentProof = proofId(log);
  return reservation;
}

function logMatchesAgentListing(log: PaymentLog, item: FeedItem): boolean {
  return (
    log.contentId === item.id &&
    log.creatorId === item.creator.id &&
    log.creatorHandle.toLowerCase() === item.creator.xHandle.toLowerCase() &&
    log.contentTitle === item.title &&
    log.amountNgn === item.suggestedTipNgn &&
    Number(log.amountUsdc).toFixed(6) === item.suggestedTipUsdc.toFixed(6) &&
    log.x402PaymentUrl === `/x402/pay/${item.id}` &&
    sameAddress(log.payTo, item.creator.walletAddress) &&
    String(log.network ?? "").toLowerCase() === config.x402.network.toLowerCase()
  );
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function reservationLookup(budget: FanBudget): ReservationLookup {
  const active = budget.reservations.filter((reservation) => reservation.status === "reserved" || reservation.status === "spent");
  return {
    byListingId: new Map(active.map((reservation) => [reservation.listingId, reservation])),
    creatorIds: new Set(active.map((reservation) => reservation.creatorId)),
    creatorHandles: new Set(active.map((reservation) => reservation.creatorHandle.toLowerCase())),
  };
}

function paidSets(logs: PaymentLog[]): PaidSets {
  const settled = logs.filter(hasSettlementProof);
  return {
    listingIds: new Set(settled.map((log) => log.contentId)),
    creatorIds: new Set(settled.map((log) => log.creatorId)),
    creatorHandles: new Set(settled.map((log) => log.creatorHandle.toLowerCase())),
  };
}

function decision(item: FeedItem, status: PaymentAgentDecisionStatus, scoring: AgentScoringBreakdown, reason: string, proof?: PaymentAgentDecision["proof"]): PaymentAgentDecision {
  return {
    listingId: item.id,
    creatorHandle: item.creator.xHandle,
    status,
    amountNgn: item.suggestedTipNgn,
    amountUsdc: item.suggestedTipUsdc,
    score: scoringTotal(scoring),
    reason,
    scoring,
    proof,
  };
}

function creatorReputationScore(item: FeedItem): number {
  let score = 0;
  if (/^0x[a-fA-F0-9]{40}$/.test(item.creator.walletAddress) && !/^0x0{40}$/.test(item.creator.walletAddress)) score += 8;
  if (/^@[A-Za-z0-9_]{3,15}$/.test(item.creator.xHandle)) score += 6;
  if (item.creator.displayName.trim().length >= 4) score += 5;
  const reputationCategories: CreatorCategory[] = ["ai", "fintech", "startups"];
  if (reputationCategories.includes(item.creator.category)) score += 4;
  if (item.type === "x-thread") score += 2;
  return Math.min(25, score);
}

function contentQualityFlag(item: FeedItem): ContentQualityFlag {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (["promo", "giveaway", "airdrop", "sale", "sponsored"].some((term) => text.includes(term))) return "promotional";

  const signalTerms = ["agent", "arc", "x402", "stablecoin", "usdc", "creator", "founder", "payment", "payments", "nigerian", "thread"];
  const signalCount = signalTerms.filter((term) => text.includes(term)).length;
  if (signalCount >= 2 || item.description.length >= 80) return "high-signal";
  return "standard";
}

function proofFromLog(log: PaymentLog): PaymentAgentDecision["proof"] {
  return {
    transactionHash: log.transactionHash,
    explorerUrl: log.explorerUrl,
    paymentReceipt: log.paymentReceipt,
    receiptUrl: log.receiptUrl,
    network: log.network,
  };
}

function proofId(log: PaymentLog): string {
  return log.transactionHash ?? log.paymentReceipt ?? log.id;
}

function roundUsdc(value: number): number {
  return Number(value.toFixed(6));
}

function cloneBudget(budget: FanBudget): FanBudget {
  return JSON.parse(JSON.stringify(budget)) as FanBudget;
}