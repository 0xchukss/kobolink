import type { CreatorCategory } from "../creator/listings.js";
import { createPendingTip, type FeedItem, type PaymentLog } from "../payments/tips.js";

export type AgentDecision = {
  listingId: string;
  creatorHandle: string;
  status: "selected" | "skipped";
  reason: string;
};

export type TippingAgentInput = {
  feed: FeedItem[];
  budgetNgn: number;
  interests: CreatorCategory[];
  maxTipNgn: number;
};

export type TippingAgentResult = {
  spentNgn: number;
  remainingBudgetNgn: number;
  decisions: AgentDecision[];
  paymentLogs: PaymentLog[];
};

export function runTippingAgent(input: TippingAgentInput): TippingAgentResult {
  let remainingBudgetNgn = input.budgetNgn;
  const decisions: AgentDecision[] = [];
  const paymentLogs: PaymentLog[] = [];

  for (const item of input.feed) {
    if (!input.interests.includes(item.creator.category)) {
      decisions.push(skip(item, "Skipped: creator category did not match fan interests."));
      continue;
    }

    if (item.suggestedTipNgn > input.maxTipNgn) {
      decisions.push(skip(item, "Skipped: suggested tip is above max tip."));
      continue;
    }

    if (item.suggestedTipNgn > remainingBudgetNgn) {
      decisions.push(skip(item, "Skipped: remaining budget is too low."));
      continue;
    }

    paymentLogs.push(createPendingTip(item));
    remainingBudgetNgn -= item.suggestedTipNgn;
    decisions.push({
      listingId: item.id,
      creatorHandle: item.creator.xHandle,
      status: "selected",
      reason: `Selected: matched interest ${item.creator.category} within budget; settlement must run through x402.`,
    });
  }

  return {
    spentNgn: input.budgetNgn - remainingBudgetNgn,
    remainingBudgetNgn,
    decisions,
    paymentLogs,
  };
}

function skip(item: FeedItem, reason: string): AgentDecision {
  return {
    listingId: item.id,
    creatorHandle: item.creator.xHandle,
    status: "skipped",
    reason,
  };
}