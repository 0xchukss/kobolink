import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readProofCenterSnapshot } from "../dist/proofs/proof-center.js";

test("Proof Center only credits current Flutterwave bridge receipts", async (t) => {
  const previousBridgeStore = process.env.KOBOLINK_BRIDGE_STORE;
  const previousListingsStore = process.env.KOBOLINK_LISTINGS_STORE;
  const previousPaymentLog = process.env.KOBOLINK_PAYMENT_LOG;
  const previousBudgetStore = process.env.KOBOLINK_BUDGET_STORE;
  const dir = await mkdtemp(path.join(tmpdir(), "kobolink-proof-center-"));
  const bridgePayoutProofPath = path.join(dir, "real-bridge-payout.json");

  process.env.KOBOLINK_BRIDGE_STORE = path.join(dir, "flutterwave-bridge.json");
  process.env.KOBOLINK_LISTINGS_STORE = path.join(dir, "creator-listings.json");
  process.env.KOBOLINK_PAYMENT_LOG = path.join(dir, "payment-logs.jsonl");
  process.env.KOBOLINK_BUDGET_STORE = path.join(dir, "fan-budget.json");

  t.after(() => {
    restoreEnv("KOBOLINK_BRIDGE_STORE", previousBridgeStore);
    restoreEnv("KOBOLINK_LISTINGS_STORE", previousListingsStore);
    restoreEnv("KOBOLINK_PAYMENT_LOG", previousPaymentLog);
    restoreEnv("KOBOLINK_BUDGET_STORE", previousBudgetStore);
  });

  await writeFile(process.env.KOBOLINK_BRIDGE_STORE, JSON.stringify({
    deposits: [],
    withdrawals: [],
    updatedAt: "2026-07-01T00:00:00.000Z",
  }, null, 2));
  await writeFile(process.env.KOBOLINK_BUDGET_STORE, JSON.stringify({
    id: "budget-underfunded",
    fanAddress: "0x6BAeB217DBF5B53c9A1Ba88750fFF6c0cA7931E3",
    budgetNgn: 2000,
    budgetUsdc: 1.290323,
    policy: {
      period: "weekly",
      budgetCapNgn: 2000,
      maxTipNgn: 250,
      interests: ["ai"],
      preferredCategories: ["ai"],
      duplicateListingProtection: true,
      duplicateCreatorProtection: true,
    },
    reservations: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  }, null, 2));

  const snapshot = await readProofCenterSnapshot("2026-07-01T00:00:00.000Z");
  const depositItem = snapshot.items.find((item) => item.id === "flutterwave-deposit");
  const payoutItem = snapshot.items.find((item) => item.id === "flutterwave-payout");
  const agentItem = snapshot.items.find((item) => item.id === "agent-run");
  const budgetItem = snapshot.items.find((item) => item.id === "fan-budget-backed");
  const strictTipItem = snapshot.items.find((item) => item.id === "strict-tip-proof");

  assert.equal(snapshot.summary.creditedNairaBalance, 0);
  assert.equal(snapshot.summary.creditedUsdcBalance, 0);
  assert.equal(snapshot.summary.flutterwaveDepositStatus, "missing");
  assert.equal(snapshot.summary.flutterwavePayoutStatus, "missing");
  assert.equal(snapshot.summary.strictTipProofStatus, "missing");
  assert.equal(strictTipItem?.status, "missing");
  assert.equal(strictTipItem?.source, "proofs/real-tip.json + data/payment-logs.jsonl");
  assert.match(strictTipItem?.summary ?? "", /No settled payment logs match/);
  assert.equal(depositItem?.status, "missing");
  assert.match(depositItem?.summary ?? "", /proof:bridge-checkout|no matching credited bridge receipt/);
  assert.equal(depositItem?.source, "proofs/real-bridge-checkout.json + proofs/real-bridge-deposit.json + data/flutterwave-bridge.json");
  assert.equal(payoutItem?.status, "missing");
  assert.equal(payoutItem?.source, "proofs/real-bridge-payout.json + data/flutterwave-bridge.json");
  assert.match(agentItem?.summary ?? "", /0 verified creator tips, 0 unique proofs/);
  assert.match(agentItem?.summary ?? "", /0 USDC spent/);
  assert.doesNotMatch(agentItem?.summary ?? "", /550/);
  assert.equal(agentItem?.source, "proofs/day5.json + data/payment-logs.jsonl");
  assert.equal(snapshot.summary.fanBudgetStatus, "underfunded");
  assert.equal(budgetItem?.status, "missing");
  assert.match(budgetItem?.summary ?? "", /not covered/);
  assert.equal(budgetItem?.source, "data/fan-budget.json + proofs/day1.json");

  const acceptedPayout = flutterwavePayout({ creatorHandle: "@current", amountNgn: 150 });
  await writeFile(process.env.KOBOLINK_BRIDGE_STORE, JSON.stringify({
    deposits: [],
    withdrawals: [acceptedPayout],
    updatedAt: "2026-07-01T00:10:00.000Z",
  }, null, 2));
  await writeFile(bridgePayoutProofPath, JSON.stringify(payoutProof(acceptedPayout), null, 2));

  const unbackedPayoutSnapshot = await readProofCenterSnapshot("2026-07-01T00:11:00.000Z", { bridgePayoutProofPath });
  const unbackedPayoutItem = unbackedPayoutSnapshot.items.find((item) => item.id === "flutterwave-payout");
  assert.equal(unbackedPayoutSnapshot.summary.flutterwavePayoutStatus, "missing");
  assert.equal(unbackedPayoutItem?.status, "missing");
  assert.match(unbackedPayoutItem?.summary ?? "", /exceeds settled Arc\/Circle\/x402 creator earnings/);

  const liveBackedSnapshot = await readProofCenterSnapshot("2026-07-01T00:00:00.000Z", {
    liveGateway: true,
    gatewayReader: async (requiredBudgetUsdc) => ({
      fanAddress: "0x6BAeB217DBF5B53c9A1Ba88750fFF6c0cA7931E3",
      walletUsdc: 0,
      gatewayAvailableUsdc: 2,
      gatewayTotalUsdc: 2,
      requiredBudgetUsdc,
      fullyFunded: true,
      checkedAt: "2026-07-01T00:00:00.000Z",
    }),
  });
  const liveBackedBudgetItem = liveBackedSnapshot.items.find((item) => item.id === "fan-budget-backed");
  assert.equal(liveBackedSnapshot.summary.gatewayBalanceStatus, "read");
  assert.equal(liveBackedSnapshot.summary.gatewayBalanceSource, "live Circle Gateway");
  assert.equal(liveBackedSnapshot.summary.fanBudgetStatus, "backed");
  assert.equal(liveBackedBudgetItem?.status, "passed");
  assert.equal(liveBackedBudgetItem?.source, "data/fan-budget.json + live Circle Gateway");

  const liveFailedSnapshot = await readProofCenterSnapshot("2026-07-01T00:00:00.000Z", {
    liveGateway: true,
    gatewayReader: async () => {
      throw new Error("network unavailable");
    },
  });
  const liveFailedBudgetItem = liveFailedSnapshot.items.find((item) => item.id === "fan-budget-backed");
  assert.equal(liveFailedSnapshot.summary.gatewayBalanceStatus, "unavailable");
  assert.equal(liveFailedSnapshot.summary.gatewayBalanceSource, "live Circle Gateway");
  assert.equal(liveFailedSnapshot.summary.fanBudgetStatus, "underfunded");
  assert.equal(liveFailedBudgetItem?.status, "missing");
  assert.match(liveFailedBudgetItem?.summary ?? "", /network unavailable/);

  const receipt = "5a3bdccb-ea55-4fd6-b801-e81c6872c934";
  const creatorWallet = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const creatorId = "creator-current";
  const listingId = "listing-current";
  const createdAt = "2026-07-01T01:00:00.000Z";
  const realTipProofPath = path.join(dir, "real-tip.json");
  const day5ProofPath = path.join(dir, "day5.json");

  await writeFile(process.env.KOBOLINK_LISTINGS_STORE, JSON.stringify([
    {
      createdAt,
      attachmentSource: "creator_attached",
      creator: {
        id: creatorId,
        xHandle: "@current",
        displayName: "Current Creator",
        walletAddress: creatorWallet,
        category: "ai",
      },
      xUrlProof: liveProof("https://x.com/current/status/1", createdAt),
      listing: {
        id: listingId,
        creatorId,
        title: "Current Circle receipt row",
        url: "https://x.com/current/status/1",
        description: "Verified real X post listing",
        mediaUrls: ["https://pbs.twimg.com/media/current.jpg"],
        type: "x-thread",
        suggestedTipNgn: 150,
        suggestedTipUsdc: 0.096774,
      },
    },
  ], null, 2));

  const paymentLog = currentCircleLog({
    id: "tip-current",
    listingId,
    creatorId,
    receipt,
    payTo: creatorWallet,
    createdAt,
  });
  await writeFile(process.env.KOBOLINK_PAYMENT_LOG, JSON.stringify(paymentLog) + "\n", "utf8");
  await writeFile(realTipProofPath, JSON.stringify(realTipProof({
    listingId,
    creatorWallet,
    receipt,
    logId: paymentLog.id,
    recordedAt: createdAt,
  }), null, 2));

  const strictTipSnapshot = await readProofCenterSnapshot("2026-07-01T01:01:00.000Z", { realTipProofPath, bridgePayoutProofPath });
  const passedStrictTipItem = strictTipSnapshot.items.find((item) => item.id === "strict-tip-proof");

  assert.equal(strictTipSnapshot.summary.creatorCount, 1);
  assert.equal(strictTipSnapshot.summary.listingCount, 1);
  assert.equal(strictTipSnapshot.summary.settledPaymentCount, 1);
  assert.equal(strictTipSnapshot.summary.strictTipProofStatus, "verified");
  assert.equal(strictTipSnapshot.summary.flutterwavePayoutStatus, "transfer_requested");
  assert.equal(passedStrictTipItem?.status, "passed");
  assert.equal(passedStrictTipItem?.proof, receipt);
  assert.equal(passedStrictTipItem?.href, "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt);
  assert.match(passedStrictTipItem?.summary ?? "", /proofs\/real-tip\.json verifies/);
  const backedPayoutItem = strictTipSnapshot.items.find((item) => item.id === "flutterwave-payout");
  assert.equal(backedPayoutItem?.status, "passed");
  assert.equal(backedPayoutItem?.proof, acceptedPayout.reference);
  await writeFile(day5ProofPath, JSON.stringify(day5Proof({
    listingId,
    creatorHandle: "@current",
    creatorWallet,
    receipt,
    amountNgn: 150,
    amountUsdc: 0.096774,
    recordedAt: createdAt,
  }), null, 2));

  const validAgentSnapshot = await readProofCenterSnapshot("2026-07-01T01:02:00.000Z", { realTipProofPath, day5ProofPath });
  const validAgentItem = validAgentSnapshot.items.find((item) => item.id === "agent-run");
  assert.equal(validAgentSnapshot.summary.agentTipCount, 1);
  assert.equal(validAgentSnapshot.summary.uniqueAgentProofCount, 1);
  assert.match(validAgentItem?.summary ?? "", /1 verified creator tips, 1 unique proofs/);
  assert.match(validAgentItem?.summary ?? "", /150/);

  await writeFile(day5ProofPath, JSON.stringify(day5Proof({
    listingId,
    creatorHandle: "@current",
    creatorWallet,
    receipt,
    amountNgn: 550,
    amountUsdc: 0.354839,
    recordedAt: createdAt,
  }), null, 2));

  const inflatedAgentSnapshot = await readProofCenterSnapshot("2026-07-01T01:03:00.000Z", { realTipProofPath, day5ProofPath });
  const inflatedAgentItem = inflatedAgentSnapshot.items.find((item) => item.id === "agent-run");
  assert.equal(inflatedAgentSnapshot.summary.agentTipCount, 0);
  assert.equal(inflatedAgentSnapshot.summary.uniqueAgentProofCount, 0);
  assert.match(inflatedAgentItem?.summary ?? "", /0 verified creator tips, 0 unique proofs/);
  assert.doesNotMatch(inflatedAgentItem?.summary ?? "", /550/);
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function currentCircleLog({ id, listingId, creatorId, receipt, payTo, createdAt }) {
  return {
    id,
    creatorId,
    creatorHandle: "@current",
    contentId: listingId,
    contentTitle: "Current Circle receipt row",
    amountNgn: 150,
    amountUsdc: 0.096774,
    x402PaymentUrl: "/x402/pay/" + listingId,
    status: "settled",
    createdAt,
    paymentReceipt: receipt,
    receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
    settledAt: createdAt,
    amountAtomic: "96774",
    payTo,
    asset: "0x0000000000000000000000000000000000000001",
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    network: "eip155:5042002",
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

function liveProof(url, checkedAt = "2026-07-01T00:00:00.000Z") {
  return {
    ok: true,
    url,
    finalUrl: url,
    status: 200,
    checkedAt,
    method: "GET",
    note: "Live URL check only. KoboLink does not scrape post content or media; creator-supplied fields remain authoritative.",
  };
}

function flutterwavePayout({ creatorHandle, amountNgn }) {
  return {
    id: "fw-withdraw-current",
    type: "withdrawal",
    mode: "naira_payout",
    provider: "flutterwave-sandbox",
    providerMode: "real_flutterwave_sandbox",
    status: "transfer_requested",
    creatorHandle,
    amountNgn,
    usdcEquivalent: 0.096774,
    reference: "kobolink-payout-current",
    bankCode: "044",
    accountNumber: "0690000032",
    transferId: "98765",
    createdAt: "2026-07-01T00:10:00.000Z",
    updatedAt: "2026-07-01T00:10:00.000Z",
  };
}

function payoutProof(payout) {
  return {
    project: "KoboLink",
    phase: "real-flutterwave-naira-payout",
    recordedAt: "2026-07-01T00:10:00.000Z",
    success: true,
    receipt: {
      id: payout.id,
      reference: payout.reference,
      status: payout.status,
      providerMode: payout.providerMode,
    },
  };
}

function day5Proof({ listingId, creatorHandle, creatorWallet, receipt, amountNgn, amountUsdc, recordedAt }) {
  return {
    project: "KoboLink",
    phase: "day-5-autonomous-agent-real-payments",
    recordedAt,
    success: true,
    targetTipCount: 3,
    tipped: [
      {
        creatorHandle,
        listingId,
        amountNgn,
        amountUsdc,
        contentTitle: "Current Circle receipt row",
        x402PaymentUrl: "/x402/pay/" + listingId,
        payTo: creatorWallet,
        paymentReceipt: receipt,
        receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
        network: "eip155:5042002",
        settledAt: recordedAt,
      },
    ],
    ledger: {
      spentNgn: amountNgn,
      spentUsdc: amountUsdc,
      remainingNgn: 2000 - amountNgn,
      remainingUsdc: Number((1.290323 - amountUsdc).toFixed(6)),
    },
  };
}

function realTipProof({ listingId, creatorWallet, receipt, logId, recordedAt }) {
  return {
    project: "KoboLink",
    phase: "real-single-creator-tip",
    recordedAt,
    success: true,
    listing: {
      id: listingId,
      creatorHandle: "@current",
      creatorWallet,
      title: "Current Circle receipt row",
      xPostUrl: "https://x.com/current/status/1",
      postContent: "Verified real X post listing",
      mediaUrls: ["https://pbs.twimg.com/media/current.jpg"],
      amountNgn: 150,
      amountUsdc: 0.096774,
      x402PaymentPath: "/x402/pay/" + listingId,
    },
    payment: {
      amountAtomic: "96774",
      formattedAmount: "0.096774",
      status: 200,
      transaction: receipt,
    },
    settlement: {
      logId,
      paymentReceipt: receipt,
      receiptUrl: "https://gateway-api-testnet.circle.com/v1/transfers/" + receipt,
      network: "eip155:5042002",
      payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      settledAt: recordedAt,
    },
    matchedCurrentFeedLog: true,
  };
}
