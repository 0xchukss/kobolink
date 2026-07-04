import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testPublicFeed } from "./fixtures/creator-feed.mjs";

const fanAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

function nativeAtomic(item) {
  const [whole, fraction = ""] = item.suggestedTipUsdc.toFixed(18).split(".");
  return BigInt(whole + fraction.padEnd(18, "0")).toString();
}

function arcReceipt(transactionHash, item) {
  return {
    type: "arc-transaction",
    chainId: 5042002,
    network: "eip155:5042002",
    transactionHash,
    to: item.creator.walletAddress,
    valueAtomic: nativeAtomic(item),
    valueNativeUsdc: item.suggestedTipUsdc.toFixed(18),
    status: "success",
    blockNumber: "1",
    explorerUrl: "https://testnet.arcscan.app/tx/" + transactionHash,
  };
}
import { balancesFromLogs, createPendingTip, failTip, settleVerifiedTip, x402PaymentUrl } from "../dist/payments/tips.js";

describe("Phase 3 tip settlement", () => {
  it("generates an x402 payment endpoint per listing", () => {
    assert.equal(x402PaymentUrl(testPublicFeed[0]), "/x402/pay/listing-arc-ai");
  });

  it("tracks pending, settled, and failed statuses", () => {
    assert.equal(createPendingTip(testPublicFeed[0]).status, "pending");
    assert.equal(failTip(testPublicFeed[0], "payment rejected").status, "failed");
  });

  it("creates a visible settled payment log only with transaction proof", () => {
    const hash = "0x" + "a".repeat(64);
    const log = settleVerifiedTip(
      testPublicFeed[0],
      {
        transactionHash: hash,
        network: "eip155:5042002",
        receipt: arcReceipt(hash, testPublicFeed[0]),
        settledAt: "2026-06-28T00:00:00.000Z",
      },
      "2026-06-28T00:00:00.000Z",
    );

    assert.equal(log.status, "settled");
    assert.equal(log.amountNgn, 150);
    assert.equal(log.amountUsdc, 0.096774);
    assert.equal(log.transactionHash, hash);
    assert.match(log.explorerUrl ?? "", /testnet\.arcscan\.app\/tx\//);
    assert.equal(log.settledAt, "2026-06-28T00:00:00.000Z");
  });

  it("accepts a Circle Gateway receipt as settlement proof", () => {
    const log = settleVerifiedTip(
      testPublicFeed[0],
      {
        paymentReceipt: "1a3bdccb-ea55-4fd6-b801-e81c6872c934",
        receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/1a3bdccb-ea55-4fd6-b801-e81c6872c934",
        network: "eip155:5042002",
        settledAt: "2026-06-29T10:56:49.157Z",
        receipt: circleReceipt("1a3bdccb-ea55-4fd6-b801-e81c6872c934", testPublicFeed[0]),
      },
      "2026-06-29T10:56:49.157Z",
    );

    assert.equal(log.status, "settled");
    assert.equal(log.paymentReceipt, "1a3bdccb-ea55-4fd6-b801-e81c6872c934");
    assert.match(log.receiptUrl ?? "", /gateway-api-testnet\.circle\.com\/v1\/transfers/);
  });

  it("rejects settled logs without a real transaction hash", () => {
    assert.throws(
      () => settleVerifiedTip(testPublicFeed[0], { transactionHash: "replace_me" }),
      /transactionHash must be a real/,
    );
  });

  it("rejects transaction hashes without Arc or Circle receipt evidence", () => {
    assert.throws(
      () => settleVerifiedTip(testPublicFeed[0], { transactionHash: "0x" + "c".repeat(64) }),
      /requires Arc or Circle settlement receipt evidence/,
    );
  });


  it("rejects Circle receipts for the wrong recipient or amount", () => {
    const receipt = "2a3bdccb-ea55-4fd6-b801-e81c6872c934";
    assert.throws(
      () => settleVerifiedTip(testPublicFeed[0], {
        paymentReceipt: receipt,
        network: "eip155:5042002",
        receipt: { ...circleReceipt(receipt, testPublicFeed[0]), payTo: testPublicFeed[1].creator.walletAddress },
      }),
      /listed creator and amount/,
    );

    assert.throws(
      () => settleVerifiedTip(testPublicFeed[0], {
        paymentReceipt: receipt,
        network: "eip155:5042002",
        receipt: { ...circleReceipt(receipt, testPublicFeed[0]), amountAtomic: "1" },
      }),
      /listed creator and amount/,
    );
  });

  it("rejects Arc transaction receipts for the wrong recipient or amount", () => {
    const hash = "0x" + "d".repeat(64);
    assert.throws(
      () => settleVerifiedTip(testPublicFeed[0], {
        transactionHash: hash,
        network: "eip155:5042002",
        receipt: { ...arcReceipt(hash, testPublicFeed[0]), to: testPublicFeed[1].creator.walletAddress },
      }),
      /listed creator and amount/,
    );

    assert.throws(
      () => settleVerifiedTip(testPublicFeed[0], {
        transactionHash: hash,
        network: "eip155:5042002",
        receipt: { ...arcReceipt(hash, testPublicFeed[0]), valueAtomic: "1" },
      }),
      /listed creator and amount/,
    );
  });
  it("updates creator balances from settled logs only", () => {
    const logs = [
      settleVerifiedTip(testPublicFeed[0], { transactionHash: "0x" + "a".repeat(64), receipt: arcReceipt("0x" + "a".repeat(64), testPublicFeed[0]), settledAt: "2026-06-28T00:00:00.000Z" }),
      settleVerifiedTip(testPublicFeed[1], { transactionHash: "0x" + "b".repeat(64), receipt: arcReceipt("0x" + "b".repeat(64), testPublicFeed[1]), settledAt: "2026-06-28T00:01:00.000Z" }),
      createPendingTip(testPublicFeed[0]),
      failTip(testPublicFeed[1], "payment rejected"),
    ];
    const balances = balancesFromLogs(logs);

    assert.deepEqual(balances, [
      {
        creatorId: "creator-adaobi",
        creatorHandle: "@adaobiokoro",
        amountNgn: 150,
        amountUsdc: 0.096774,
        lastSettledAt: "2026-06-28T00:00:00.000Z",
      },
      {
        creatorId: "creator-chuks",
        creatorHandle: "@Chuksdakingz",
        amountNgn: 250,
        amountUsdc: 0.16129,
        lastSettledAt: "2026-06-28T00:01:00.000Z",
      },
    ]);
  });
});