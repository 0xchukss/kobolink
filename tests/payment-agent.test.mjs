import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFanBudget, buildGatewayBalanceSnapshot } from "../dist/budgets/fan-budget.js";
import { createCreator, createListing, publicFeed } from "../dist/creator/listings.js";
import { runAutonomousPaymentAgent } from "../dist/agents/payment-agent.js";
import { settleVerifiedTip } from "../dist/payments/tips.js";

const rate = 1550;
const fanAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const now = "2026-06-29T12:00:00.000Z";

function makeFeed() {
  const creators = [
    createCreator({ id: "creator-ai", xHandle: "@aiagentng", displayName: "AI Agent NG", walletAddress: "0x1111111111111111111111111111111111111111", category: "ai" }),
    createCreator({ id: "creator-fin", xHandle: "@fintechng", displayName: "Fintech NG", walletAddress: "0x2222222222222222222222222222222222222222", category: "fintech" }),
    createCreator({ id: "creator-start", xHandle: "@startupng", displayName: "Startup NG", walletAddress: "0x3333333333333333333333333333333333333333", category: "startups" }),
    createCreator({ id: "creator-promo", xHandle: "@promong", displayName: "Promo NG", walletAddress: "0x4444444444444444444444444444444444444444", category: "ai" }),
  ];

  const listings = [
    createListing({ id: "listing-ai", creatorId: "creator-ai", title: "Arc agents for Nigerian AI builders", url: "https://x.com/aiagentng/status/1", description: "A high-signal thread about agents, Arc, USDC settlement, and Nigerian creator payments.", type: "x-thread", suggestedTipNgn: 150 }, rate),
    createListing({ id: "listing-fin", creatorId: "creator-fin", title: "x402 payment rails for X creators", url: "https://x.com/fintechng/status/2", description: "A practical fintech thread on x402, creator budgets, stablecoin settlement, and payment receipts.", type: "x-thread", suggestedTipNgn: 250 }, rate),
    createListing({ id: "listing-start", creatorId: "creator-start", title: "Community budgets for useful startup threads", url: "https://x.com/startupng/status/3", description: "A founder-focused thread on autonomous tipping agents, Arc settlement proof, and Nigerian startup communities.", type: "x-thread", suggestedTipNgn: 150 }, rate),
    createListing({ id: "listing-promo", creatorId: "creator-promo", title: "Sponsored giveaway for creator tips", url: "https://x.com/promong/status/4", description: "Promo giveaway sale for followers.", type: "x-thread", suggestedTipNgn: 100 }, rate),
  ];

  return publicFeed(creators, listings);
}

function makeBudget() {
  return createFanBudget({
    fanAddress,
    budgetNgn: 2000,
    maxTipNgn: 250,
    period: "weekly",
    interests: ["ai", "fintech", "startups"],
    preferredCategories: ["ai", "fintech", "startups"],
    now,
  }, rate);
}

function makeWallet(gatewayAvailableUsdc = 1) {
  return buildGatewayBalanceSnapshot({
    fanAddress,
    walletUsdc: 10,
    gatewayAvailableUsdc,
    gatewayTotalUsdc: gatewayAvailableUsdc,
    requiredBudgetUsdc: 1.290323,
    checkedAt: now,
  });
}

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

function fakeExecutorFor(feed) {
  const byId = new Map(feed.map((item) => [item.id, item]));
  return async (listingId) => {
    const item = byId.get(listingId);
    assert.ok(item, `missing listing ${listingId}`);
    const receipt = `receipt-${listingId}`;
    const log = settleVerifiedTip(item, {
      paymentReceipt: receipt,
      receiptUrl: `https://gateway-api-testnet.circle.com/v1/transfers/${receipt}`,
      payer: fanAddress,
      network: "eip155:5042002",
      settledAt: now,
      receipt: circleReceipt(receipt, item),
    }, now);

    return {
      ok: true,
      listingId,
      fanAddress,
      log,
      payment: {
        amountAtomic: String(Math.round(item.suggestedTipUsdc * 1_000_000)),
        formattedAmount: String(item.suggestedTipUsdc),
        status: 200,
        transaction: receipt,
      },
      balances: {
        beforeGatewayAvailableUsdc: "1",
        afterGatewayAvailableUsdc: "1",
      },
    };
  };
}

describe("Day 5 real-payment agent", () => {
  it("scores listings, tips 3 creators, records unique proofs, and updates spent budget", async () => {
    const feed = makeFeed();
    const result = await runAutonomousPaymentAgent({
      budget: makeBudget(),
      feed,
      paymentLogs: [],
      wallet: makeWallet(),
      appOrigin: "http://127.0.0.1:3000",
      targetTipCount: 3,
      executor: fakeExecutorFor(feed),
      now,
    });

    assert.equal(result.tipped.length, 3);
    assert.equal(result.paymentProofs.length, 3);
    assert.equal(result.uniqueProofCount, 3);
    assert.equal(result.ledger.spentNgn, 550);
    assert.equal(result.ledger.remainingNgn, 1450);
    assert.equal(result.ledger.reservedNgn, 0);
    assert.equal(result.budget.reservations.filter((entry) => entry.status === "spent").length, 3);
    assert.ok(result.decisions.every((decision) => decision.reason.length > 0));
    assert.ok(result.decisions.some((decision) => decision.status === "skipped" && /promotional|target/.test(decision.reason)));
  });

  it("rejects settlement proof that belongs to a different listing", async () => {
    const feed = makeFeed();
    const byId = new Map(feed.map((item) => [item.id, item]));

    const result = await runAutonomousPaymentAgent({
      budget: makeBudget(),
      feed,
      paymentLogs: [],
      wallet: makeWallet(),
      appOrigin: "http://127.0.0.1:3000",
      targetTipCount: 1,
      executor: async (listingId) => {
        const selected = byId.get(listingId);
        assert.ok(selected, `missing listing ${listingId}`);
        const wrong = feed.find((item) => item.id !== selected.id && item.creator.id !== selected.creator.id);
        assert.ok(wrong, `missing wrong listing for ${listingId}`);
        const receipt = `wrong-${listingId}`;
        const log = settleVerifiedTip(wrong, {
          paymentReceipt: receipt,
          receiptUrl: `https://gateway-api-testnet.circle.com/v1/transfers/${receipt}`,
          payer: fanAddress,
          network: "eip155:5042002",
          settledAt: now,
          receipt: circleReceipt(receipt, wrong),
        }, now);

        return {
          ok: true,
          listingId,
          fanAddress,
          log,
          payment: {
            amountAtomic: String(Math.round(wrong.suggestedTipUsdc * 1_000_000)),
            formattedAmount: String(wrong.suggestedTipUsdc),
            status: 200,
            transaction: receipt,
          },
          balances: {
            beforeGatewayAvailableUsdc: "1",
            afterGatewayAvailableUsdc: "1",
          },
        };
      },
      now,
    });

    assert.equal(result.tipped.length, 0);
    assert.equal(result.paymentProofs.length, 0);
    assert.equal(result.uniqueProofCount, 0);
    assert.equal(result.ledger.spentNgn, 0);
    assert.ok(result.decisions.some((decision) => decision.status === "failed" && /does not match the selected creator listing/.test(decision.reason)));
  });

  it("does not tip the same settled listings or creators twice", async () => {
    const feed = makeFeed();
    const first = await runAutonomousPaymentAgent({
      budget: makeBudget(),
      feed,
      paymentLogs: [],
      wallet: makeWallet(),
      appOrigin: "http://127.0.0.1:3000",
      targetTipCount: 3,
      executor: fakeExecutorFor(feed),
      now,
    });

    const second = await runAutonomousPaymentAgent({
      budget: first.budget,
      feed,
      paymentLogs: first.paymentProofs,
      wallet: makeWallet(),
      appOrigin: "http://127.0.0.1:3000",
      targetTipCount: 3,
      executor: fakeExecutorFor(feed),
      now: "2026-06-29T12:05:00.000Z",
    });

    assert.equal(second.tipped.length, 0);
    assert.equal(second.paymentProofs.length, 0);
    assert.ok(second.decisions.some((decision) => /already has settlement proof|duplicate/.test(decision.reason)));
  });

  it("blocks execution before payment when actual Gateway balance is insufficient", async () => {
    const feed = makeFeed();
    let paymentCalls = 0;
    const result = await runAutonomousPaymentAgent({
      budget: makeBudget(),
      feed,
      paymentLogs: [],
      wallet: makeWallet(0.05),
      appOrigin: "http://127.0.0.1:3000",
      targetTipCount: 3,
      executor: async () => {
        paymentCalls += 1;
        throw new Error("executor should not be called");
      },
      now,
    });

    assert.equal(paymentCalls, 0);
    assert.equal(result.tipped.length, 0);
    assert.ok(result.decisions.every((decision) => decision.status === "skipped"));
    assert.ok(result.decisions.some((decision) => /Gateway balance/.test(decision.reason)));
  });
});