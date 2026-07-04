import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testPublicFeed } from "./fixtures/creator-feed.mjs";
import {
  assertGatewayCoversBudget,
  budgetLedger,
  buildGatewayBalanceSnapshot,
  createFanBudget,
  runAgentBudgetPolicy,
} from "../dist/budgets/fan-budget.js";
import { settleVerifiedTip } from "../dist/payments/tips.js";

const fanAddress = "0x6BAeB217DBF5B53c9A1Ba88750fFF6c0cA7931E3";
const now = "2026-06-29T12:00:00.000Z";

function circleReceipt(transaction, item) {
  return {
    verify: { isValid: true, payer: fanAddress },
    settle: { success: true, transaction, payer: fanAddress, network: "eip155:5042002" },
    amountAtomic: String(Math.round(item.suggestedTipUsdc * 1_000_000)),
    asset: "0x0000000000000000000000000000000000000001",
    payTo: item.creator.walletAddress,
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
  };
}


describe("Phase 4 fan budget and agent wallet control", () => {
  it("creates a 2,000 Naira budget and maps it to USDC", () => {
    const budget = createFanBudget({
      fanAddress,
      budgetNgn: 2000,
      maxTipNgn: 250,
      period: "weekly",
      interests: ["ai", "fintech"],
      now,
    });
    const ledger = budgetLedger(budget);

    assert.equal(budget.budgetNgn, 2000);
    assert.equal(budget.budgetUsdc, 1.290323);
    assert.equal(ledger.fundedNgn, 2000);
    assert.equal(ledger.remainingNgn, 2000);
    assert.equal(budget.policy.maxTipNgn, 250);
    assert.equal(budget.policy.duplicateListingProtection, true);
  });


  it("rejects authorizing a budget above actual Gateway funds", () => {
    const wallet = buildGatewayBalanceSnapshot({
      fanAddress,
      walletUsdc: 0,
      gatewayAvailableUsdc: 0.01226,
      gatewayTotalUsdc: 0.01226,
      requiredBudgetUsdc: 1.290323,
      checkedAt: now,
    });

    assert.equal(wallet.fullyFunded, false);
    assert.throws(() => assertGatewayCoversBudget(wallet), /does not cover the authorized budget/);
  });

  it("reserves matching tips without exceeding budget or Gateway balance", () => {
    const budget = createFanBudget({
      fanAddress,
      budgetNgn: 300,
      maxTipNgn: 250,
      period: "weekly",
      interests: ["ai", "fintech"],
      now,
    });
    const wallet = buildGatewayBalanceSnapshot({
      fanAddress,
      walletUsdc: 0,
      gatewayAvailableUsdc: 0.2,
      gatewayTotalUsdc: 0.2,
      requiredBudgetUsdc: budget.budgetUsdc,
      checkedAt: now,
    });

    const result = runAgentBudgetPolicy({ budget, feed: testPublicFeed, paymentLogs: [], wallet, now });

    assert.equal(result.reserved.length, 1);
    assert.equal(result.reserved[0].listingId, "listing-arc-ai");
    assert.equal(result.ledger.reservedNgn, 150);
    assert.equal(result.ledger.remainingNgn, 150);
    assert.ok(result.decisions.some((decision) => /remaining budget/.test(decision.reason)));
  });

  it("blocks duplicate listing reservations on repeated agent runs", () => {
    const budget = createFanBudget({
      fanAddress,
      budgetNgn: 2000,
      maxTipNgn: 250,
      period: "weekly",
      interests: ["ai", "fintech"],
      now,
    });
    const wallet = buildGatewayBalanceSnapshot({
      fanAddress,
      walletUsdc: 0,
      gatewayAvailableUsdc: 2,
      gatewayTotalUsdc: 2,
      requiredBudgetUsdc: budget.budgetUsdc,
      checkedAt: now,
    });

    const firstRun = runAgentBudgetPolicy({ budget, feed: testPublicFeed, paymentLogs: [], wallet, now });
    const secondRun = runAgentBudgetPolicy({
      budget: firstRun.budget,
      feed: testPublicFeed,
      paymentLogs: [],
      wallet,
      now: "2026-06-29T12:01:00.000Z",
    });

    assert.equal(firstRun.reserved.length, 2);
    assert.equal(secondRun.reserved.length, 0);
    assert.ok(secondRun.decisions.every((decision) => decision.status === "skipped"));
    assert.ok(secondRun.decisions.some((decision) => /duplicate listing|duplicate creator/.test(decision.reason)));
  });

  it("does not reserve listings already settled through payment logs", () => {
    const budget = createFanBudget({
      fanAddress,
      budgetNgn: 2000,
      maxTipNgn: 250,
      period: "weekly",
      interests: ["ai", "fintech"],
      duplicateCreatorProtection: false,
      now,
    });
    const wallet = buildGatewayBalanceSnapshot({
      fanAddress,
      walletUsdc: 0,
      gatewayAvailableUsdc: 2,
      gatewayTotalUsdc: 2,
      requiredBudgetUsdc: budget.budgetUsdc,
      checkedAt: now,
    });
    const receipt = "1a3bdccb-ea55-4fd6-b801-e81c6872c934";
    const settled = settleVerifiedTip(testPublicFeed[0], {
      paymentReceipt: receipt,
      receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
      network: "eip155:5042002",
      settledAt: now,
      receipt: circleReceipt(receipt, testPublicFeed[0]),
    });

    const result = runAgentBudgetPolicy({ budget, feed: testPublicFeed, paymentLogs: [settled], wallet, now });

    assert.ok(result.decisions.some((decision) => decision.listingId === "listing-arc-ai" && /duplicate listing/.test(decision.reason)));
    assert.ok(result.reserved.every((reservation) => reservation.listingId !== "listing-arc-ai"));
  });

  it("blocks reservations that would exceed actual Gateway balance", () => {
    const budget = createFanBudget({
      fanAddress,
      budgetNgn: 2000,
      maxTipNgn: 250,
      period: "weekly",
      interests: ["ai", "fintech"],
      now,
    });
    const wallet = buildGatewayBalanceSnapshot({
      fanAddress,
      walletUsdc: 0,
      gatewayAvailableUsdc: 0.05,
      gatewayTotalUsdc: 0.05,
      requiredBudgetUsdc: budget.budgetUsdc,
      checkedAt: now,
    });

    const result = runAgentBudgetPolicy({ budget, feed: testPublicFeed, paymentLogs: [], wallet, now });
    const eligibleDecisions = result.decisions.filter((decision) =>
      ["listing-arc-ai", "listing-x402", "listing-agent-budgeting", "listing-circle-gateway"].includes(decision.listingId),
    );

    assert.equal(result.reserved.length, 0);
    assert.ok(eligibleDecisions.every((decision) => /Gateway balance/.test(decision.reason)));
    assert.ok(result.decisions.some((decision) => /category/.test(decision.reason)));
  });
});