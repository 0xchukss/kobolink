import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertCreatorWithdrawalBackedBySettledTips,
  creatorWithdrawalAvailability,
  isAcceptedPayoutBackedBySettledTips,
} from "../dist/flutterwave/withdrawal-guard.js";

const paymentState = {
  balances: [
    { creatorHandle: "@adaobiokoro", amountNgn: 550 },
    { creatorHandle: "@othercreator", amountNgn: 300 },
  ],
};

function payout(overrides = {}) {
  return {
    id: "fw-withdraw-real",
    type: "withdrawal",
    mode: "naira_payout",
    provider: "flutterwave-sandbox",
    providerMode: "real_flutterwave_sandbox",
    status: "transfer_requested",
    creatorHandle: "@adaobiokoro",
    amountNgn: 150,
    usdcEquivalent: 0.096774,
    reference: "kobolink-payout-real",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Flutterwave withdrawal backing guard", () => {
  it("allows withdrawal only from settled Arc/Circle/x402 creator earnings minus accepted payouts", () => {
    const bridgeState = { withdrawals: [payout({ amountNgn: 150 })] };
    const availability = assertCreatorWithdrawalBackedBySettledTips({
      creatorHandle: "adaobiokoro",
      amountNgn: 250,
      paymentState,
      bridgeState,
    });

    assert.equal(availability.creatorHandle, "@adaobiokoro");
    assert.equal(availability.earnedNgn, 550);
    assert.equal(availability.acceptedPayoutNgn, 150);
    assert.equal(availability.availableNgn, 400);
  });

  it("rejects creators with no settled tip earnings", () => {
    assert.throws(
      () => assertCreatorWithdrawalBackedBySettledTips({
        creatorHandle: "missingcreator",
        amountNgn: 50,
        paymentState,
        bridgeState: { withdrawals: [] },
      }),
      /no settled Arc\/Circle\/x402 earnings/,
    );
  });

  it("rejects withdrawals above settled earnings after accepted payouts", () => {
    assert.throws(
      () => assertCreatorWithdrawalBackedBySettledTips({
        creatorHandle: "@adaobiokoro",
        amountNgn: 450,
        paymentState,
        bridgeState: { withdrawals: [payout({ amountNgn: 150 })] },
      }),
      /Withdrawal exceeds settled Arc\/Circle\/x402 creator earnings/,
    );
  });

  it("does not count failed payout requests against available creator earnings", () => {
    const availability = creatorWithdrawalAvailability({
      creatorHandle: "@adaobiokoro",
      paymentState,
      bridgeState: { withdrawals: [payout({ status: "sandbox_api_error", amountNgn: 500 })] },
    });

    assert.equal(availability.availableNgn, 550);
  });

  it("marks accepted payout proof as unbacked when accepted payouts exceed settled tips", () => {
    const accepted = payout({ amountNgn: 700 });
    assert.equal(isAcceptedPayoutBackedBySettledTips(accepted, paymentState, { withdrawals: [accepted] }), false);
  });
});
