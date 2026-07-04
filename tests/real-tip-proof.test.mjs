import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRealTipProof, findMatchedCurrentFeedTipLog, selectRealTipTarget } from "../dist/payments/real-tip-proof.js";
import { realTipProofEvidence } from "../dist/proofs/real-mode-readiness.js";
import { settleVerifiedTip } from "../dist/payments/tips.js";

const listingA = feedItem("listing-a", "@creatora");
const listingB = feedItem("listing-b", "@creatorb");

describe("real single-tip proof target selection", () => {
  it("requires at least one creator-attached listing", () => {
    assert.throws(() => selectRealTipTarget([], []), /No creator-attached X listings/);
  });

  it("selects the first unsettled current listing", () => {
    const target = selectRealTipTarget([listingA, listingB], [{ contentId: listingA.id, status: "settled" }]);
    assert.equal(target.id, listingB.id);
  });

  it("honors an explicit listing id when it is current and unsettled", () => {
    const target = selectRealTipTarget([listingA, listingB], [], listingB.id);
    assert.equal(target.id, listingB.id);
  });

  it("rejects explicit listings that are missing or already settled", () => {
    assert.throws(() => selectRealTipTarget([listingA], [], "missing"), /not in the current creator-attached X feed/);
    assert.throws(() => selectRealTipTarget([listingA], [{ contentId: listingA.id, status: "settled" }], listingA.id), /already has settlement proof/);
  });

  it("rejects a feed where every listing is already settled", () => {
    assert.throws(
      () => selectRealTipTarget([listingA, listingB], [
        { contentId: listingA.id, status: "settled" },
        { contentId: listingB.id, status: "settled" },
      ]),
      /Every current creator-attached X listing already has settlement proof/,
    );
  });

  it("builds a real tip proof only from a matched current-feed settlement log", () => {
    const receipt = "8a3bdccb-ea55-4fd6-b801-e81c6872c934";
    const log = settleVerifiedTip(
      listingA,
      {
        paymentReceipt: receipt,
        receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
        network: "eip155:5042002",
        settledAt: "2026-07-02T12:00:00.000Z",
        receipt: circleReceipt(receipt, listingA),
      },
      "2026-07-02T12:00:00.000Z",
    );
    const result = fanTipResult(listingA, log);
    const matched = findMatchedCurrentFeedTipLog([log], listingA, result.log);
    const proof = buildRealTipProof({
      listing: listingA,
      result,
      matchedLog: matched,
      walletBefore: gatewayWallet(),
      recordedAt: "2026-07-02T12:00:01.000Z",
    });

    assert.equal(proof.success, true);
    assert.equal(proof.matchedCurrentFeedLog, true);
    assert.equal(proof.listing.postContent, listingA.description);
    assert.deepEqual(proof.listing.mediaUrls, []);
    assert.equal(proof.settlement.paymentReceipt, receipt);
    assert.equal(proof.settlement.logId, log.id);
    assert.equal(proof.walletBefore?.fullyFunded, true);
  });

  it("readiness requires the real tip proof artifact to match the settled current-feed log", () => {
    const receipt = "7a3bdccb-ea55-4fd6-b801-e81c6872c934";
    const log = settleVerifiedTip(
      listingA,
      {
        paymentReceipt: receipt,
        receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
        network: "eip155:5042002",
        settledAt: "2026-07-02T12:00:00.000Z",
        receipt: circleReceipt(receipt, listingA),
      },
      "2026-07-02T12:00:00.000Z",
    );
    const proof = buildRealTipProof({
      listing: listingA,
      result: fanTipResult(listingA, log),
      matchedLog: log,
      recordedAt: "2026-07-02T12:00:01.000Z",
    });

    const evidence = realTipProofEvidence([listingA], [log], proof);

    assert.equal(evidence.ok, true);
    assert.match(evidence.detail, /proofs\/real-tip\.json verifies/);
  });

  it("readiness rejects settled logs when the real tip proof artifact is missing or stale", () => {
    const receipt = "6a3bdccb-ea55-4fd6-b801-e81c6872c934";
    const log = settleVerifiedTip(
      listingA,
      {
        paymentReceipt: receipt,
        receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
        network: "eip155:5042002",
        settledAt: "2026-07-02T12:00:00.000Z",
        receipt: circleReceipt(receipt, listingA),
      },
      "2026-07-02T12:00:00.000Z",
    );
    const staleProof = buildRealTipProof({
      listing: listingB,
      result: fanTipResult(listingA, log),
      matchedLog: log,
      recordedAt: "2026-07-02T12:00:01.000Z",
    });

    const missingEvidence = realTipProofEvidence([listingA], [log], undefined);
    const staleEvidence = realTipProofEvidence([listingA], [log], staleProof);

    assert.equal(missingEvidence.ok, false);
    assert.match(missingEvidence.detail, /proofs\/real-tip\.json is missing/);
    assert.equal(staleEvidence.ok, false);
    assert.match(staleEvidence.detail, /does not match the current feed/);
  });

  it("does not mark a real tip proof successful without a current-feed log match", () => {
    const receipt = "9a3bdccb-ea55-4fd6-b801-e81c6872c934";
    const log = settleVerifiedTip(
      listingA,
      {
        paymentReceipt: receipt,
        receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
        network: "eip155:5042002",
        settledAt: "2026-07-02T12:00:00.000Z",
        receipt: circleReceipt(receipt, listingA),
      },
      "2026-07-02T12:00:00.000Z",
    );
    const result = fanTipResult(listingA, log);
    const proof = buildRealTipProof({
      listing: listingA,
      result,
      matchedLog: undefined,
      recordedAt: "2026-07-02T12:00:01.000Z",
    });

    assert.equal(findMatchedCurrentFeedTipLog([], listingA, result.log), undefined);
    assert.equal(proof.success, false);
    assert.equal(proof.matchedCurrentFeedLog, false);
  });
});

function feedItem(id, handle) {
  return {
    id,
    creatorId: "creator-" + id,
    title: "Useful creator post " + id,
    url: "https://x.com/" + handle.slice(1) + "/status/123",
    description: "Creator supplied post content.",
    mediaUrls: [],
    type: "x-thread",
    suggestedTipNgn: 150,
    suggestedTipUsdc: 0.096774,
    createdAt: "2026-07-02T00:00:00.000Z",
    source: "local",
    suggestedTipKobo: 15000,
    x402PaymentPath: "/x402/pay/" + id,
    creator: {
      id: "creator-" + id,
      xHandle: handle,
      displayName: handle.slice(1),
      walletAddress: "0x" + "b".repeat(40),
      category: "ai",
    },
  };
}

function circleReceipt(transaction, item) {
  return {
    verify: { isValid: true, payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    settle: { success: true, transaction, payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", network: "eip155:5042002" },
    amountAtomic: String(Math.round(item.suggestedTipUsdc * 1_000_000)),
    asset: "0x0000000000000000000000000000000000000001",
    payTo: item.creator.walletAddress,
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
  };
}

function fanTipResult(listing, log) {
  return {
    ok: true,
    listingId: listing.id,
    fanAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    log,
    payment: {
      amountAtomic: String(Math.round(listing.suggestedTipUsdc * 1_000_000)),
      formattedAmount: listing.suggestedTipUsdc.toFixed(6),
      status: 200,
      transaction: log.paymentReceipt ?? log.transactionHash,
    },
    balances: {
      beforeGatewayAvailableUsdc: "1.000000",
      afterGatewayAvailableUsdc: "0.903226",
    },
  };
}

function gatewayWallet() {
  return {
    fanAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    walletUsdc: 1,
    gatewayAvailableUsdc: 1,
    gatewayTotalUsdc: 1,
    requiredBudgetUsdc: 0.096774,
    fullyFunded: true,
    checkedAt: "2026-07-02T11:59:59.000Z",
  };
}
