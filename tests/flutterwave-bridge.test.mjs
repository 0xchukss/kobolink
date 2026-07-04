import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import {
  createFlutterwaveCheckoutDeposit,
  requestFlutterwaveNairaPayout,
  verifyFlutterwaveDeposit,
} from "../dist/flutterwave/bridge.js";
import { readBridgeState, upsertDepositReceipt, upsertWithdrawalReceipt } from "../dist/flutterwave/bridge-store.js";
import { writeBridgeCheckoutProof, writeBridgeDepositProof } from "../dist/proofs/bridge-proof-writer.js";

const testKeys = {
  publicKey: "FLWPUBK_TEST_x",
  secretKey: "FLWSECK_TEST_x",
  encryptionKey: "FLWENCK_TEST_x",
  now: "2026-06-29T12:00:00.000Z",
};

const testCustomer = {
  email: "fan@example.com",
  name: "Real Fan",
  phoneNumber: "08000000000",
};

describe("Phase 6 Flutterwave sandbox bridge", () => {
  it("creates a Flutterwave checkout receipt from a real-shaped sandbox API response", async () => {
    const calls = [];
    const receipt = await createFlutterwaveCheckoutDeposit({ amountNgn: 2000, customer: testCustomer }, {
      ...testKeys,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({ status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } });
      },
    });

    assert.equal(receipt.providerMode, "real_flutterwave_sandbox");
    assert.equal(receipt.status, "checkout_created");
    assert.equal(receipt.checkoutUrl, "https://checkout.flutterwave.com/v3/hosted/pay/test");
    assert.equal(calls[0].url, "https://api.flutterwave.com/v3/payments");
    assert.match(String(calls[0].init.headers.authorization), /^Bearer FLWSECK_TEST_x$/);
  });

  it("verifies a sandbox transaction and credits verified Naira balance only after success", async () => {
    const pending = await createFlutterwaveCheckoutDeposit({ amountNgn: 2000, customer: testCustomer }, {
      ...testKeys,
      fetch: async () => jsonResponse({ status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/pay/test" } }),
    });

    const verified = await verifyFlutterwaveDeposit({ receipt: pending, transactionId: "123456" }, {
      ...testKeys,
      fetch: async (url) => {
        assert.match(url, /\/v3\/transactions\/123456\/verify$/);
        return jsonResponse({ status: "success", message: "Transaction fetched", data: { id: 123456, tx_ref: pending.txRef, status: "successful", currency: "NGN", amount: 2000 } });
      },
    });

    assert.equal(verified.status, "credit_applied");
    assert.equal(verified.creditedNgn, 2000);
    assert.equal(verified.creditedUsdc, 1.290323);
  });

  it("rejects verification when Flutterwave tx_ref does not match the checkout receipt", async () => {
    const pending = await createFlutterwaveCheckoutDeposit({ amountNgn: 2000, customer: testCustomer }, {
      ...testKeys,
      fetch: async () => jsonResponse({ status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/pay/test" } }),
    });

    const verified = await verifyFlutterwaveDeposit({ receipt: pending, transactionId: "123456" }, {
      ...testKeys,
      fetch: async () => jsonResponse({ status: "success", message: "Transaction fetched", data: { id: 123456, tx_ref: "wrong-ref", status: "successful", currency: "NGN", amount: 2000 } }),
    });

    assert.equal(verified.status, "verification_failed");
    assert.equal(verified.creditedNgn, 0);
    assert.equal(verified.creditedUsdc, 0);
  });

  it("creates a Flutterwave Naira payout request with sandbox status", async () => {
    const payout = await requestFlutterwaveNairaPayout({
      creatorHandle: "@adaobiokoro",
      amountNgn: 150,
      bankCode: "044",
      accountNumber: "0690000032",
    }, {
      ...testKeys,
      fetch: async (url, init) => {
        const body = JSON.parse(String(init.body));
        assert.equal(url, "https://api.flutterwave.com/v3/transfers");
        assert.equal(body.currency, "NGN");
        assert.equal(body.amount, 150);
        return jsonResponse({ status: "success", message: "Transfer Queued Successfully", data: { id: 98765, status: "NEW" } });
      },
    });

    assert.equal(payout.providerMode, "real_flutterwave_sandbox");
    assert.equal(payout.status, "transfer_requested");
    assert.equal(payout.transferId, "98765");
  });

  it("refuses to store local-only withdrawal receipts", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "kobolink-bridge-local-"));
    const storePath = join(tempDir, "bridge.json");

    await assert.rejects(
      () => upsertWithdrawalReceipt({
        id: "arc-withdraw-local",
        type: "withdrawal",
        mode: "arc_usdc_wallet",
        provider: "arc-testnet",
        providerMode: "local_arc_wallet",
        status: "arc_wallet_requested",
        creatorHandle: "@adaobiokoro",
        amountNgn: 150,
        usdcEquivalent: 0.096774,
        reference: "local-only",
        createdAt: testKeys.now,
        updatedAt: testKeys.now,
      }, storePath),
      /Only real Flutterwave sandbox payout receipts can be stored/,
    );
  });

  it("persists receipts and computes credited verified balance", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "kobolink-bridge-"));
    const storePath = join(tempDir, "bridge.json");
    const pending = await createFlutterwaveCheckoutDeposit({ amountNgn: 2000, customer: testCustomer }, {
      ...testKeys,
      fetch: async () => jsonResponse({ status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/pay/test" } }),
    });
    const verified = await verifyFlutterwaveDeposit({
      receipt: pending,
      transactionId: "123456",
    }, {
      ...testKeys,
      fetch: async () => jsonResponse({ status: "success", message: "Transaction fetched", data: { id: 123456, tx_ref: pending.txRef, status: "successful", currency: "NGN", amount: 2000 } }),
    });

    await upsertDepositReceipt(verified, storePath);
    await upsertDepositReceipt({ ...verified, id: "fw-deposit-duplicate", txRef: verified.txRef }, storePath);
    let state = await readBridgeState(storePath);

    assert.equal(state.verifiedNairaBalance, 0);
    assert.equal(state.verifiedUsdcEquivalent, 0);
    assert.deepEqual(state.proofBackedDepositIds, []);

    const checkoutProofPath = join(tempDir, "real-bridge-checkout.json");
    const depositProofPath = join(tempDir, "real-bridge-deposit.json");
    await writeBridgeCheckoutProof(pending, { ...state, deposits: [pending] }, { path: checkoutProofPath, recordedAt: testKeys.now });
    await writeBridgeDepositProof(verified, {
      ...state,
      deposits: [verified],
      verifiedNairaBalance: verified.creditedNgn,
      verifiedUsdcEquivalent: verified.creditedUsdc,
    }, { path: depositProofPath, recordedAt: testKeys.now });

    const payout = await requestFlutterwaveNairaPayout({
      creatorHandle: "@adaobiokoro",
      amountNgn: 150,
      bankCode: "044",
      accountNumber: "0690000032",
    }, {
      ...testKeys,
      fetch: async () => jsonResponse({ status: "success", message: "Transfer Queued Successfully", data: { id: 98765, status: "NEW" } }),
    });
    await upsertWithdrawalReceipt(payout, storePath);
    state = await readBridgeState(storePath);

    assert.equal(state.verifiedNairaBalance, 2000);
    assert.equal(state.verifiedUsdcEquivalent, 1.290323);
    assert.deepEqual(state.proofBackedDepositIds, [verified.id]);
    assert.equal(state.deposits.filter((deposit) => deposit.status === "credit_applied").length, 2);
    assert.equal(state.rails.nairaBridge, "Flutterwave sandbox");
    assert.equal(state.rails.tipSettlement, "Arc/Circle/x402 USDC");
  });

  it("requires explicit customer details before creating checkout", async () => {
    await assert.rejects(
      () => createFlutterwaveCheckoutDeposit({ amountNgn: 2000 }, testKeys),
      /customer.email is required/,
    );

    await assert.rejects(
      () => createFlutterwaveCheckoutDeposit({ amountNgn: 2000, customer: { email: "bad", name: "Real Fan" } }, testKeys),
      /valid email/,
    );
  });

  it("does not fake a real Flutterwave response when keys are missing", async () => {
    await assert.rejects(
      () => createFlutterwaveCheckoutDeposit({ amountNgn: 2000, customer: testCustomer }, {
        now: testKeys.now,
        publicKey: "FLWPUBK_TEST_replace_me",
        secretKey: "FLWSECK_TEST_replace_me",
        encryptionKey: "FLWENCK_TEST_replace_me",
      }),
      /No real Flutterwave checkout was created/,
    );
  });
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}