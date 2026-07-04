import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRealBridgeCheckoutEnv, parseRealBridgePayoutEnv, parseRealBridgeVerifyEnv, parseRealBudgetEnv, parseRealListingEnv } from "../dist/proofs/real-setup-inputs.js";

describe("real setup env parsers", () => {
  it("parses explicit creator-attached listing env", () => {
    const input = parseRealListingEnv({
      KOBOLINK_CREATOR_X_HANDLE: "realcreator",
      KOBOLINK_CREATOR_DISPLAY_NAME: "Real Creator",
      KOBOLINK_CREATOR_WALLET_ADDRESS: "0x1111111111111111111111111111111111111111",
      KOBOLINK_CREATOR_CATEGORY: "ai",
      KOBOLINK_LISTING_TITLE: "Useful X post",
      KOBOLINK_LISTING_X_URL: "https://x.com/realcreator/status/123456",
      KOBOLINK_LISTING_POST_CONTENT: "Creator typed the post content here.",
      KOBOLINK_LISTING_MEDIA_URLS: "https://pbs.twimg.com/media/a.jpg, https://pbs.twimg.com/media/b.jpg",
      KOBOLINK_LISTING_TIP_NGN: "150",
    });

    assert.equal(input.xHandle, "realcreator");
    assert.equal(input.walletAddress, "0x1111111111111111111111111111111111111111");
    assert.equal(input.category, "ai");
    assert.deepEqual(input.mediaUrls, ["https://pbs.twimg.com/media/a.jpg", "https://pbs.twimg.com/media/b.jpg"]);
    assert.equal(input.suggestedTipNgn, 150);
    assert.equal(input.type, "x-thread");
  });

  it("rejects listing placeholders and missing explicit fields", () => {
    assert.throws(() => parseRealListingEnv({}), /KOBOLINK_CREATOR_X_HANDLE/);
    assert.throws(() => parseRealListingEnv({
      KOBOLINK_CREATOR_X_HANDLE: "replace_me",
    }), /KOBOLINK_CREATOR_X_HANDLE/);
  });

  it("parses explicit fan budget env", () => {
    const input = parseRealBudgetEnv({
      KOBOLINK_FAN_BUDGET_NGN: "2000",
      KOBOLINK_FAN_MAX_TIP_NGN: "250",
      KOBOLINK_FAN_PERIOD: "weekly",
      KOBOLINK_FAN_INTERESTS: "ai, fintech, startups",
      KOBOLINK_FAN_PREFERRED_CATEGORIES: "ai,startups",
      KOBOLINK_DUPLICATE_LISTING_PROTECTION: "true",
      KOBOLINK_DUPLICATE_CREATOR_PROTECTION: "false",
    });

    assert.equal(input.budgetNgn, 2000);
    assert.equal(input.maxTipNgn, 250);
    assert.equal(input.period, "weekly");
    assert.deepEqual(input.interests, ["ai", "fintech", "startups"]);
    assert.deepEqual(input.preferredCategories, ["ai", "startups"]);
    assert.equal(input.duplicateListingProtection, true);
    assert.equal(input.duplicateCreatorProtection, false);
  });

  it("rejects invalid budget categories and periods", () => {
    assert.throws(() => parseRealBudgetEnv({
      KOBOLINK_FAN_BUDGET_NGN: "2000",
      KOBOLINK_FAN_MAX_TIP_NGN: "250",
      KOBOLINK_FAN_PERIOD: "monthly",
      KOBOLINK_FAN_INTERESTS: "ai",
    }), /KOBOLINK_FAN_PERIOD/);

    assert.throws(() => parseRealBudgetEnv({
      KOBOLINK_FAN_BUDGET_NGN: "2000",
      KOBOLINK_FAN_MAX_TIP_NGN: "250",
      KOBOLINK_FAN_PERIOD: "weekly",
      KOBOLINK_FAN_INTERESTS: "sports",
    }), /invalid category/);
  });

  it("parses explicit Flutterwave checkout env", () => {
    const input = parseRealBridgeCheckoutEnv({
      KOBOLINK_BRIDGE_DEPOSIT_NGN: "2000",
      KOBOLINK_BRIDGE_CUSTOMER_EMAIL: "fan@example.com",
      KOBOLINK_BRIDGE_CUSTOMER_NAME: "Real Fan",
      KOBOLINK_BRIDGE_CUSTOMER_PHONE: "08000000000",
      KOBOLINK_BRIDGE_REDIRECT_URL: "http://localhost:3000/api/bridge/deposit/callback",
    });

    assert.equal(input.amountNgn, 2000);
    assert.equal(input.customer.email, "fan@example.com");
    assert.equal(input.customer.name, "Real Fan");
    assert.equal(input.customer.phoneNumber, "08000000000");
    assert.equal(input.redirectUrl, "http://localhost:3000/api/bridge/deposit/callback");
  });

  it("rejects placeholder Flutterwave checkout env", () => {
    assert.throws(() => parseRealBridgeCheckoutEnv({}), /KOBOLINK_BRIDGE_DEPOSIT_NGN/);
    assert.throws(() => parseRealBridgeCheckoutEnv({
      KOBOLINK_BRIDGE_DEPOSIT_NGN: "2000",
      KOBOLINK_BRIDGE_CUSTOMER_EMAIL: "replace_me@example.com",
      KOBOLINK_BRIDGE_CUSTOMER_NAME: "Real Fan",
    }), /KOBOLINK_BRIDGE_CUSTOMER_EMAIL/);
  });

  it("parses explicit Flutterwave verify env", () => {
    const input = parseRealBridgeVerifyEnv({
      KOBOLINK_BRIDGE_DEPOSIT_RECEIPT_ID: "fw-deposit-abc",
      KOBOLINK_BRIDGE_TRANSACTION_ID: "123456789",
    });

    assert.equal(input.receiptId, "fw-deposit-abc");
    assert.equal(input.transactionId, "123456789");
  });

  it("rejects invalid Flutterwave verify env", () => {
    assert.throws(() => parseRealBridgeVerifyEnv({
      KOBOLINK_BRIDGE_DEPOSIT_RECEIPT_ID: "fw-deposit-abc",
      KOBOLINK_BRIDGE_TRANSACTION_ID: "not-a-number",
    }), /numeric Flutterwave transaction id/);
  });

  it("parses explicit Flutterwave payout env", () => {
    const input = parseRealBridgePayoutEnv({
      KOBOLINK_PAYOUT_CREATOR_HANDLE: "realcreator",
      KOBOLINK_PAYOUT_NGN: "150",
      KOBOLINK_PAYOUT_BANK_CODE: "044",
      KOBOLINK_PAYOUT_ACCOUNT_NUMBER: "0690000032",
    });

    assert.equal(input.creatorHandle, "realcreator");
    assert.equal(input.amountNgn, 150);
    assert.equal(input.bankCode, "044");
    assert.equal(input.accountNumber, "0690000032");
  });

  it("rejects invalid Flutterwave payout bank details", () => {
    assert.throws(() => parseRealBridgePayoutEnv({
      KOBOLINK_PAYOUT_CREATOR_HANDLE: "realcreator",
      KOBOLINK_PAYOUT_NGN: "150",
      KOBOLINK_PAYOUT_BANK_CODE: "44",
      KOBOLINK_PAYOUT_ACCOUNT_NUMBER: "0690000032",
    }), /3 digit/);

    assert.throws(() => parseRealBridgePayoutEnv({
      KOBOLINK_PAYOUT_CREATOR_HANDLE: "realcreator",
      KOBOLINK_PAYOUT_NGN: "150",
      KOBOLINK_PAYOUT_BANK_CODE: "044",
      KOBOLINK_PAYOUT_ACCOUNT_NUMBER: "replace_me",
    }), /KOBOLINK_PAYOUT_ACCOUNT_NUMBER/);
  });
});
