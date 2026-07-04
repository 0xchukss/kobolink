import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readPaymentState, readPaymentStateForFeed } from "../dist/payments/log-store.js";

describe("payment log store", () => {
  it("filters legacy simulated settlements out of refreshed Phase 3 state", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "kobolink-payments-"));
    const path = join(tempDir, "payment-logs.jsonl");

    const legacy = {
      id: "tip-legacy",
      creatorId: "creator-legacy",
      creatorHandle: "@legacy",
      contentId: "listing-legacy",
      contentTitle: "Legacy simulated row",
      amountNgn: 150,
      amountUsdc: 0.096774,
      x402PaymentUrl: "/x402/pay/listing-legacy",
      status: "settled",
      transactionHash: "0x" + "a".repeat(64),
      settledAt: "2026-06-28T00:00:00.000Z",
    };
    const current = {
      id: "tip-current",
      creatorId: "creator-current",
      creatorHandle: "@current",
      contentId: "listing-current",
      contentTitle: "Current Circle receipt row",
      amountNgn: 150,
      amountUsdc: 0.096774,
      x402PaymentUrl: "/x402/pay/listing-current",
      status: "settled",
      createdAt: "2026-06-29T10:56:49.157Z",
      paymentReceipt: "1a3bdccb-ea55-4fd6-b801-e81c6872c934",
      receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/1a3bdccb-ea55-4fd6-b801-e81c6872c934",
      settledAt: "2026-06-29T10:56:49.157Z",
      amountAtomic: "96774",
      payTo: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      asset: "0x0000000000000000000000000000000000000001",
      facilitatorUrl: "https://gateway-api-testnet.circle.com",
      receipt: {
        verify: { isValid: true, payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        settle: { success: true, transaction: "1a3bdccb-ea55-4fd6-b801-e81c6872c934", payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", network: "eip155:5042002" },
        amountAtomic: "96774",
        asset: "0x0000000000000000000000000000000000000001",
        payTo: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        facilitatorUrl: "https://gateway-api-testnet.circle.com",
      },
    };

    try {
      await writeFile(path, `${JSON.stringify(legacy)}\n${JSON.stringify(current)}\n`, "utf8");
      const state = await readPaymentState(path);

      assert.equal(state.logs.length, 1);
      assert.equal(state.logs[0].id, "tip-current");
      assert.deepEqual(state.balances, [
        {
          creatorId: "creator-current",
          creatorHandle: "@current",
          amountNgn: 150,
          amountUsdc: 0.096774,
          lastSettledAt: "2026-06-29T10:56:49.157Z",
        },
      ]);

      const emptyVerifiedState = await readPaymentStateForFeed([], path);
      assert.equal(emptyVerifiedState.logs.length, 0);
      assert.equal(emptyVerifiedState.balances.length, 0);

      const verifiedFeedState = await readPaymentStateForFeed([
        {
          id: "listing-current",
          creatorId: "creator-current",
          title: "Current Circle receipt row",
          url: "https://x.com/current/status/1",
          description: "Verified real X post listing",
          type: "x-thread",
          suggestedTipNgn: 150,
          suggestedTipUsdc: 0.096774,
          creator: {
            id: "creator-current",
            xHandle: "@current",
            displayName: "Current Creator",
            walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            category: "ai",
          },
        },
      ], path);
      assert.equal(verifiedFeedState.logs.length, 1);
      assert.equal(verifiedFeedState.logs[0].id, "tip-current");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("only counts settled logs that match the current creator-attached listing recipient and amount", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "kobolink-payments-match-"));
    const path = join(tempDir, "payment-logs.jsonl");
    const goodPayTo = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const wrongPayTo = "0xcccccccccccccccccccccccccccccccccccccccc";
    const good = currentCircleLog({ id: "tip-current", receipt: "3a3bdccb-ea55-4fd6-b801-e81c6872c934", payTo: goodPayTo });
    const wrongRecipient = currentCircleLog({ id: "tip-wrong-recipient", receipt: "4a3bdccb-ea55-4fd6-b801-e81c6872c934", payTo: wrongPayTo });

    try {
      await writeFile(path, JSON.stringify(good) + "\n" + JSON.stringify(wrongRecipient) + "\n", "utf8");
      const verifiedFeedState = await readPaymentStateForFeed([
        {
          id: "listing-current",
          creatorId: "creator-current",
          title: "Current Circle receipt row",
          url: "https://x.com/current/status/1",
          description: "Verified real X post listing",
          type: "x-thread",
          suggestedTipNgn: 150,
          suggestedTipUsdc: 0.096774,
          creator: {
            id: "creator-current",
            xHandle: "@current",
            displayName: "Current Creator",
            walletAddress: goodPayTo,
            category: "ai",
          },
        },
      ], path);

      assert.deepEqual(verifiedFeedState.logs.map((log) => log.id), ["tip-current"]);
      assert.equal(verifiedFeedState.balances.length, 1);
      assert.equal(verifiedFeedState.balances[0].amountUsdc, 0.096774);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function currentCircleLog({ id, receipt, payTo }) {
  return {
    id,
    creatorId: "creator-current",
    creatorHandle: "@current",
    contentId: "listing-current",
    contentTitle: "Current Circle receipt row",
    amountNgn: 150,
    amountUsdc: 0.096774,
    x402PaymentUrl: "/x402/pay/listing-current",
    status: "settled",
    createdAt: "2026-06-29T10:56:49.157Z",
    paymentReceipt: receipt,
    receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
    settledAt: "2026-06-29T10:56:49.157Z",
    amountAtomic: "96774",
    payTo,
    asset: "0x0000000000000000000000000000000000000001",
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    receipt: {
      verify: { isValid: true, payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      settle: { success: true, transaction: receipt, payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", network: "eip155:5042002" },
      amountAtomic: "96774",
      asset: "0x0000000000000000000000000000000000000001",
      payTo,
      facilitatorUrl: "https://gateway-api-testnet.circle.com",
    },
  };
}
