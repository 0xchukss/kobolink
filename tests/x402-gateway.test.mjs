import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paymentRequirementMismatch } from "../dist/payments/x402-gateway.js";

const requirements = {
  scheme: "exact",
  network: "eip155:5042002",
  asset: "0x1111111111111111111111111111111111111111",
  amount: "96774",
  payTo: "0x2222222222222222222222222222222222222222",
  maxTimeoutSeconds: 610000,
  extra: {
    name: "GatewayWalletBatched",
    version: "1",
    verifyingContract: "0x3333333333333333333333333333333333333333",
  },
};

describe("x402 protected tip requirements", () => {
  it("accepts matching payment requirements", () => {
    assert.equal(paymentRequirementMismatch({ accepted: { ...requirements } }, requirements), undefined);
  });

  it("rejects payment payloads that try to steer away from Arc testnet", () => {
    assert.match(
      paymentRequirementMismatch({ accepted: { ...requirements, network: "eip155:1" } }, requirements) ?? "",
      /accepted.network/,
    );
  });

  it("rejects payment payloads for the wrong amount, asset, or creator wallet", () => {
    assert.match(paymentRequirementMismatch({ accepted: { ...requirements, amount: "1" } }, requirements) ?? "", /accepted.amount/);
    assert.match(paymentRequirementMismatch({ accepted: { ...requirements, asset: "0x4444444444444444444444444444444444444444" } }, requirements) ?? "", /accepted.asset/);
    assert.match(paymentRequirementMismatch({ accepted: { ...requirements, payTo: "0x5555555555555555555555555555555555555555" } }, requirements) ?? "", /accepted.payTo/);
  });

  it("rejects payment payloads with a different Gateway verifying contract", () => {
    assert.match(
      paymentRequirementMismatch({ accepted: { ...requirements, extra: { verifyingContract: "0x6666666666666666666666666666666666666666" } } }, requirements) ?? "",
      /verifyingContract/,
    );
  });
});
