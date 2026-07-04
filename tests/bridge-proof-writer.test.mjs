import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { findStrictAcceptedFlutterwavePayout, findStrictVerifiedFlutterwaveDeposit } from "../dist/proofs/bridge-proof-evidence.js";
import { writeBridgeCheckoutProof, writeBridgeDepositProof, writeBridgePayoutProof } from "../dist/proofs/bridge-proof-writer.js";

const deposit = {
  id: "fw-deposit-real",
  type: "deposit",
  provider: "flutterwave-sandbox",
  providerMode: "real_flutterwave_sandbox",
  status: "credit_applied",
  amountNgn: 2000,
  usdcEquivalent: 1.290323,
  txRef: "kobolink-deposit-real",
  transactionId: "10334429",
  checkoutUrl: "https://checkout.flutterwave.com/pay/test",
  creditedNgn: 2000,
  creditedUsdc: 1.290323,
  customer: { email: "fan@example.com", name: "Real Fan", phoneNumber: "08000000000" },
  responseStatus: "success",
  verifiedAt: "2026-07-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const payout = {
  id: "fw-withdraw-real",
  type: "withdrawal",
  mode: "naira_payout",
  provider: "flutterwave-sandbox",
  providerMode: "real_flutterwave_sandbox",
  status: "transfer_requested",
  creatorHandle: "@realcreator",
  amountNgn: 150,
  usdcEquivalent: 0.096774,
  reference: "kobolink-payout-real",
  bankCode: "044",
  accountNumber: "0690000032",
  responseStatus: "success",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const state = {
  configStatus: { ready: true, missing: [] },
  deposits: [deposit],
  withdrawals: [payout],
  verifiedNairaBalance: 2000,
  verifiedUsdcEquivalent: 1.290323,
  proofBackedDepositIds: [deposit.id],
  rails: { nairaBridge: "Flutterwave sandbox", tipSettlement: "Arc/Circle/x402 USDC" },
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("strict bridge proof writer", () => {
  it("writes deposit proof JSON that the readiness matcher accepts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kobolink-bridge-proof-"));
    const proofPath = path.join(dir, "real-bridge-deposit.json");
    const checkoutPath = path.join(dir, "real-bridge-checkout.json");
    const checkoutReceipt = { ...deposit, status: "checkout_created", creditedNgn: 0, creditedUsdc: 0, transactionId: undefined, verifiedAt: undefined };
    const checkoutProof = await writeBridgeCheckoutProof(checkoutReceipt, { ...state, deposits: [checkoutReceipt] }, { path: checkoutPath, recordedAt: "2026-07-01T00:00:00.000Z" });
    const proof = await writeBridgeDepositProof(deposit, state, { path: proofPath, recordedAt: "2026-07-01T00:00:00.000Z" });
    const saved = JSON.parse(await readFile(proofPath, "utf8"));
    const savedCheckout = JSON.parse(await readFile(checkoutPath, "utf8"));

    assert.equal(checkoutProof.success, true);
    assert.equal(savedCheckout.success, true);
    assert.equal(proof.success, true);
    assert.equal(saved.success, true);
    assert.equal(saved.creditedBalance.amountNgn, 2000);
    assert.equal(saved.creditedBalance.amountUsdc, 1.290323);
    assert.equal(saved.bridgeState.verifiedNairaBalance, 2000);
    assert.deepEqual(saved.bridgeState.proofBackedDepositIds, [deposit.id]);
    assert.equal(saved.receipt.id, deposit.id);
    assert.equal(saved.receipt.transactionId, deposit.transactionId);
    assert.equal(saved.receipt.customer.email, "fa***@example.com");
    assert.equal(findStrictVerifiedFlutterwaveDeposit([deposit], savedCheckout, saved)?.id, deposit.id);
  });

  it("writes payout proof JSON that the readiness matcher accepts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kobolink-bridge-proof-"));
    const proofPath = path.join(dir, "real-bridge-payout.json");
    const proof = await writeBridgePayoutProof(payout, state, { path: proofPath, recordedAt: "2026-07-01T00:00:00.000Z" });
    const saved = JSON.parse(await readFile(proofPath, "utf8"));

    assert.equal(proof.success, true);
    assert.equal(saved.success, true);
    assert.equal(saved.receipt.id, payout.id);
    assert.equal(saved.receipt.reference, payout.reference);
    assert.equal(saved.receipt.accountNumber, "****0032");
    assert.equal(findStrictAcceptedFlutterwavePayout([payout], saved)?.id, payout.id);
  });
});
