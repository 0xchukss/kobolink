import type { CreatorCategory } from "../creator/listings.js";
import { config } from "../config/env.js";
import { ngnToUsdc } from "../utils/currency.js";
import { hasSettlementProof, type FeedItem, type PaymentLog } from "../payments/tips.js";

export type BudgetPeriod = "daily" | "weekly";
export type AgentDecisionStatus = "reserved" | "skipped";
export type ReservationStatus = "reserved" | "spent" | "failed";

export type FanBudgetPolicy = {
  period: BudgetPeriod;
  budgetCapNgn: number;
  maxTipNgn: number;
  interests: CreatorCategory[];
  preferredCategories: CreatorCategory[];
  duplicateListingProtection: boolean;
  duplicateCreatorProtection: boolean;
};

export type FanBudgetReservation = {
  id: string;
  listingId: string;
  creatorId: string;
  creatorHandle: string;
  amountNgn: number;
  amountUsdc: number;
  status: ReservationStatus;
  reason: string;
  createdAt: string;
  spentAt?: string;
  paymentLogId?: string;
  paymentProof?: string;
};

export type FanBudget = {
  id: string;
  fanAddress: string;
  budgetNgn: number;
  budgetUsdc: number;
  policy: FanBudgetPolicy;
  reservations: FanBudgetReservation[];
  createdAt: string;
  updatedAt: string;
};

export type BudgetLedger = {
  fundedNgn: number;
  fundedUsdc: number;
  reservedNgn: number;
  reservedUsdc: number;
  spentNgn: number;
  spentUsdc: number;
  remainingNgn: number;
  remainingUsdc: number;
};

export type GatewayBalanceSnapshot = {
  fanAddress: string;
  walletUsdc: number;
  gatewayAvailableUsdc: number;
  gatewayTotalUsdc: number;
  requiredBudgetUsdc: number;
  fullyFunded: boolean;
  checkedAt: string;
};

export type BudgetState = {
  budget: FanBudget | null;
  ledger: BudgetLedger | null;
  wallet: GatewayBalanceSnapshot | null;
};

export type FanBudgetInput = {
  fanAddress: string;
  budgetNgn: number;
  maxTipNgn: number;
  period: BudgetPeriod;
  interests: CreatorCategory[];
  preferredCategories?: CreatorCategory[];
  duplicateListingProtection?: boolean;
  duplicateCreatorProtection?: boolean;
  now?: string;
};

export type AgentRunDecision = {
  listingId: string;
  creatorHandle: string;
  status: AgentDecisionStatus;
  amountNgn: number;
  amountUsdc: number;
  reason: string;
};

export type AgentRunResult = {
  budget: FanBudget;
  ledger: BudgetLedger;
  decisions: AgentRunDecision[];
  reserved: FanBudgetReservation[];
  wallet: GatewayBalanceSnapshot;
};

export function createFanBudget(input: FanBudgetInput, rate = config.economics.ngnPerUsdc): FanBudget {
  const now = input.now ?? new Date().toISOString();
  const budgetNgn = assertPositiveAmount("budgetNgn", input.budgetNgn);
  const maxTipNgn = assertPositiveAmount("maxTipNgn", input.maxTipNgn);

  if (maxTipNgn > budgetNgn) throw new Error("maxTipNgn cannot exceed budgetNgn");
  if (input.interests.length === 0) throw new Error("at least one interest/category is required");

  const preferredCategories = input.preferredCategories?.length ? input.preferredCategories : input.interests;

  return {
    id: `budget-${now.replace(/[^0-9]/g, "")}`,
    fanAddress: input.fanAddress,
    budgetNgn,
    budgetUsdc: ngnToUsdc(budgetNgn, rate),
    policy: {
      period: input.period,
      budgetCapNgn: budgetNgn,
      maxTipNgn,
      interests: uniqueCategories(input.interests),
      preferredCategories: uniqueCategories(preferredCategories),
      duplicateListingProtection: input.duplicateListingProtection ?? true,
      duplicateCreatorProtection: input.duplicateCreatorProtection ?? true,
    },
    reservations: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function budgetLedger(budget: FanBudget): BudgetLedger {
  const reserved = budget.reservations.filter((entry) => entry.status === "reserved");
  const spent = budget.reservations.filter((entry) => entry.status === "spent");
  const reservedNgn = sum(reserved.map((entry) => entry.amountNgn));
  const reservedUsdc = roundUsdc(sum(reserved.map((entry) => entry.amountUsdc)));
  const spentNgn = sum(spent.map((entry) => entry.amountNgn));
  const spentUsdc = roundUsdc(sum(spent.map((entry) => entry.amountUsdc)));
  const remainingNgn = Math.max(0, budget.budgetNgn - reservedNgn - spentNgn);

  return {
    fundedNgn: budget.budgetNgn,
    fundedUsdc: budget.budgetUsdc,
    reservedNgn,
    reservedUsdc,
    spentNgn,
    spentUsdc,
    remainingNgn,
    remainingUsdc: roundUsdc(Math.max(0, budget.budgetUsdc - reservedUsdc - spentUsdc)),
  };
}

export function assertGatewayCoversBudget(wallet: GatewayBalanceSnapshot): void {
  if (!wallet.fullyFunded) {
    throw new Error(
      "Circle Gateway balance does not cover the authorized budget. Available " +
        wallet.gatewayAvailableUsdc +
        " USDC, required " +
        wallet.requiredBudgetUsdc +
        " USDC.",
    );
  }
}

export function buildGatewayBalanceSnapshot(args: {
  fanAddress: string;
  walletUsdc: number;
  gatewayAvailableUsdc: number;
  gatewayTotalUsdc: number;
  requiredBudgetUsdc: number;
  checkedAt?: string;
}): GatewayBalanceSnapshot {
  return {
    fanAddress: args.fanAddress,
    walletUsdc: roundUsdc(args.walletUsdc),
    gatewayAvailableUsdc: roundUsdc(args.gatewayAvailableUsdc),
    gatewayTotalUsdc: roundUsdc(args.gatewayTotalUsdc),
    requiredBudgetUsdc: roundUsdc(args.requiredBudgetUsdc),
    fullyFunded: args.gatewayAvailableUsdc >= args.requiredBudgetUsdc,
    checkedAt: args.checkedAt ?? new Date().toISOString(),
  };
}

export function runAgentBudgetPolicy(args: {
  budget: FanBudget;
  feed: FeedItem[];
  paymentLogs: PaymentLog[];
  wallet: GatewayBalanceSnapshot;
  now?: string;
}): AgentRunResult {
  const now = args.now ?? new Date().toISOString();
  const budget = cloneBudget(args.budget);
  const decisions: AgentRunDecision[] = [];
  const reserved: FanBudgetReservation[] = [];
  const paidListingIds = new Set(args.paymentLogs.filter(hasSettlementProof).map((log) => log.contentId));
  const paidCreatorIds = new Set(args.paymentLogs.filter(hasSettlementProof).map((log) => log.creatorId));
  const paidCreatorHandles = new Set(args.paymentLogs.filter(hasSettlementProof).map((log) => log.creatorHandle.toLowerCase()));
  let ledger = budgetLedger(budget);
  let runReservedUsdc = 0;

  for (const item of args.feed) {
    const amountUsdc = item.suggestedTipUsdc;
    const skipReason = skipReasonForItem({ budget, item, ledger, paidListingIds, paidCreatorIds, paidCreatorHandles, wallet: args.wallet, runReservedUsdc });

    if (skipReason) {
      decisions.push(decision(item, "skipped", skipReason));
      continue;
    }

    const reservation: FanBudgetReservation = {
      id: `reserve-${item.id}-${now.replace(/[^0-9]/g, "")}`,
      listingId: item.id,
      creatorId: item.creator.id,
      creatorHandle: item.creator.xHandle,
      amountNgn: item.suggestedTipNgn,
      amountUsdc,
      status: "reserved",
      reason: `Reserved: matched ${item.creator.category}, within budget and Gateway balance.`,
      createdAt: now,
    };

    budget.reservations.push(reservation);
    reserved.push(reservation);
    runReservedUsdc = roundUsdc(runReservedUsdc + amountUsdc);
    ledger = budgetLedger(budget);
    decisions.push(decision(item, "reserved", reservation.reason));
  }

  budget.updatedAt = now;

  return {
    budget,
    ledger,
    decisions,
    reserved,
    wallet: args.wallet,
  };
}

function skipReasonForItem(args: {
  budget: FanBudget;
  item: FeedItem;
  ledger: BudgetLedger;
  paidListingIds: Set<string>;
  paidCreatorIds: Set<string>;
  paidCreatorHandles: Set<string>;
  wallet: GatewayBalanceSnapshot;
  runReservedUsdc: number;
}): string | undefined {
  const { budget, item, ledger, paidListingIds, paidCreatorIds, paidCreatorHandles, wallet, runReservedUsdc } = args;
  const reservedListingIds = new Set(budget.reservations.map((entry) => entry.listingId));
  const reservedCreatorIds = new Set(budget.reservations.map((entry) => entry.creatorId));
  const reservedCreatorHandles = new Set(budget.reservations.map((entry) => entry.creatorHandle.toLowerCase()));
  const creatorHandle = item.creator.xHandle.toLowerCase();

  if (!budget.policy.preferredCategories.includes(item.creator.category)) return "Skipped: category is outside the authorized filter.";
  if (item.suggestedTipNgn > budget.policy.maxTipNgn) return "Skipped: suggested tip is above max tip cap.";
  if (item.suggestedTipNgn > ledger.remainingNgn) return "Skipped: remaining budget would be exceeded.";
  if (runReservedUsdc + item.suggestedTipUsdc > wallet.gatewayAvailableUsdc) return "Skipped: actual Gateway balance would be exceeded.";
  if (budget.policy.duplicateListingProtection && (reservedListingIds.has(item.id) || paidListingIds.has(item.id))) {
    return "Skipped: duplicate listing protection blocked this listing.";
  }
  if (
    budget.policy.duplicateCreatorProtection &&
    (reservedCreatorIds.has(item.creator.id) || paidCreatorIds.has(item.creator.id) || reservedCreatorHandles.has(creatorHandle) || paidCreatorHandles.has(creatorHandle))
  ) {
    return "Skipped: duplicate creator protection blocked this creator.";
  }

  return undefined;
}

function decision(item: FeedItem, status: AgentDecisionStatus, reason: string): AgentRunDecision {
  return {
    listingId: item.id,
    creatorHandle: item.creator.xHandle,
    status,
    amountNgn: item.suggestedTipNgn,
    amountUsdc: item.suggestedTipUsdc,
    reason,
  };
}

function assertPositiveAmount(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return Number(value);
}

function uniqueCategories(values: CreatorCategory[]): CreatorCategory[] {
  return [...new Set(values)];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundUsdc(value: number): number {
  return Number(value.toFixed(6));
}

function cloneBudget(budget: FanBudget): FanBudget {
  return JSON.parse(JSON.stringify(budget)) as FanBudget;
}