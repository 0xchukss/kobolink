import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getFlutterwaveConfigStatus } from "../dist/flutterwave/config.js";

describe("Flutterwave sandbox config", () => {
  it("reports ready only when all sandbox keys are set", () => {
    assert.deepEqual(
      getFlutterwaveConfigStatus({
        FLUTTERWAVE_PUBLIC_KEY: "FLWPUBK_TEST_x",
        FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST_x",
        FLUTTERWAVE_ENCRYPTION_KEY: "x",
      }),
      {
        hasPublicKey: true,
        hasSecretKey: true,
        hasEncryptionKey: true,
        ready: true,
      },
    );
  });

  it("treats placeholder values as not configured", () => {
    assert.equal(
      getFlutterwaveConfigStatus({
        FLUTTERWAVE_PUBLIC_KEY: "FLWPUBK_TEST_replace_me",
        FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST_x",
        FLUTTERWAVE_ENCRYPTION_KEY: "x",
      }).ready,
      false,
    );
  });
});
