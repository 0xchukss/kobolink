import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findStrictAcceptedFlutterwavePayout, findStrictVerifiedFlutterwaveDeposit } from "../dist/proofs/bridge-proof-evidence.js";

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
  customer: { email: "fan@example.com", name: "Real Fan" },
  responseStatus: "success",
  verifiedAt: "2026-07-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};


const checkoutProof = {
  success: true,
  receipt: {
    id: deposit.id,
    txRef: deposit.txRef,
    status: "checkout_created",
    providerMode: "real_flutterwave_sandbox",
    checkoutUrl: "https://checkout.flutterwave.com/pay/test",
  },
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
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("strict Flutterwave bridge proof evidence", () => {
  it("requires a matching strict deposit proof before accepting a credited deposit", () => {
    assert.equal(findStrictVerifiedFlutterwaveDeposit([deposit], undefined, undefined), undefined);
    assert.equal(findStrictVerifiedFlutterwaveDeposit([deposit], checkoutProof, undefined), undefined);
    assert.equal(findStrictVerifiedFlutterwaveDeposit([deposit], { success: false, receipt: { id: deposit.id } }, { success: true, receipt: { id: deposit.id } }), undefined);
    assert.equal(findStrictVerifiedFlutterwaveDeposit([deposit], { ...checkoutProof, receipt: { ...checkoutProof.receipt, txRef: "wrong" } }, { success: true, receipt: { id: deposit.id, txRef: deposit.txRef, transactionId: deposit.transactionId, status: "credit_applied", providerMode: "real_flutterwave_sandbox" } }), undefined);
    assert.equal(findStrictVerifiedFlutterwaveDeposit([deposit], checkoutProof, { success: true, receipt: { id: deposit.id, txRef: "wrong", transactionId: deposit.transactionId, status: "credit_applied", providerMode: "real_flutterwave_sandbox" } }), undefined);

    const matched = findStrictVerifiedFlutterwaveDeposit([deposit], checkoutProof, {
      success: true,
      receipt: {
        id: deposit.id,
        txRef: deposit.txRef,
        transactionId: deposit.transactionId,
        status: "credit_applied",
        providerMode: "real_flutterwave_sandbox",
      },
    });
    assert.equal(matched?.id, deposit.id);
  });

  it("requires a matching strict payout proof before accepting a payout receipt", () => {
    assert.equal(findStrictAcceptedFlutterwavePayout([payout], undefined), undefined);
    assert.equal(findStrictAcceptedFlutterwavePayout([payout], { success: true, receipt: { id: payout.id, reference: "wrong", status: "transfer_requested", providerMode: "real_flutterwave_sandbox" } }), undefined);

    const matched = findStrictAcceptedFlutterwavePayout([payout], {
      success: true,
      receipt: {
        id: payout.id,
        reference: payout.reference,
        status: "transfer_requested",
        providerMode: "real_flutterwave_sandbox",
      },
    });
    assert.equal(matched?.id, payout.id);
  });
});
