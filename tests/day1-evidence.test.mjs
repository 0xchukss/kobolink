import assert from "node:assert/strict";
import test from "node:test";

import { config } from "../dist/config/env.js";
import { readArcBalanceEvidence, readStoredArcBalanceEvidence, readX402ProofEvidence } from "../dist/proofs/day1-evidence.js";

const buyer = "0x1111111111111111111111111111111111111111";
const seller = "0x2222222222222222222222222222222222222222";
const receipt = "circle-receipt-123";

test("strict x402 evidence rejects shallow status-only proof artifacts", () => {
  const evidence = readX402ProofEvidence({
    x402Payment: {
      ok: true,
      challengeStatus: 402,
      payment: { status: 200, transaction: receipt },
    },
  }, { expectedSellerAddress: seller });

  assert.equal(evidence.ok, false);
  assert.match(evidence.detail, /proof network does not match/);
});

test("strict x402 evidence accepts matching Circle Gateway settlement metadata", () => {
  const evidence = readX402ProofEvidence(strictDay1Proof(), { expectedSellerAddress: seller });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.transaction, receipt);
  assert.match(evidence.detail, /settled on eip155:5042002/);
});

test("strict x402 evidence rejects proof for a different configured seller", () => {
  const evidence = readX402ProofEvidence(strictDay1Proof(), {
    expectedSellerAddress: "0x3333333333333333333333333333333333333333",
  });

  assert.equal(evidence.ok, false);
  assert.match(evidence.detail, /configured creator settlement address/);
});

test("live Arc balance evidence overrides old stored balance artifacts", async () => {
  const evidence = await readArcBalanceEvidence({
    arcBalance: {
      ok: true,
      chainId: config.arc.chainId,
      address: buyer,
      nativeUsdc: "20",
    },
  }, {
    live: true,
    addressResolver: () => buyer,
    reader: async (address) => ({
      address,
      chainId: config.arc.chainId,
      network: config.x402.network,
      nativeUsdc: 0,
      checkedAt: "2026-07-02T00:00:00.000Z",
    }),
  });

  assert.equal(evidence.ok, false);
  assert.equal(evidence.source, "live Arc RPC");
  assert.match(evidence.error ?? "", /Live Arc balance is empty/);
});

test("stored Arc balance evidence still validates day1 artifacts when live mode is off", () => {
  const evidence = readStoredArcBalanceEvidence({
    arcBalance: {
      ok: true,
      chainId: config.arc.chainId,
      address: buyer,
      nativeUsdc: "0.5",
    },
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.source, "proofs/day1.json");
});

function strictDay1Proof() {
  return {
    x402Payment: {
      ok: true,
      challengeStatus: 402,
      buyerAddress: buyer,
      sellerAddress: seller,
      network: config.x402.network,
      chain: config.circle.gatewayChain,
      facilitatorUrl: config.circle.gatewayFacilitatorUrl,
      priceUsdc: "0.01",
      priceAtomic: "10000",
      requirements: {
        scheme: "exact",
        network: config.x402.network,
        asset: "0x3600000000000000000000000000000000000000",
        amount: "10000",
        payTo: seller,
        maxTimeoutSeconds: 610000,
        extra: {
          name: "GatewayWalletBatched",
          version: "1",
          verifyingContract: "0x0077777d7eba4688bdef3e311b846f25870a19b9",
        },
      },
      support: { supported: true },
      verifyResult: { isValid: true, payer: buyer },
      settleResult: { success: true, payer: buyer, transaction: receipt, network: config.x402.network },
      payment: { amount: "10000", formattedAmount: "0.01", status: 200, transaction: receipt },
      paidRequest: { verified: true, payer: buyer, amount: "10000", network: config.x402.network, transaction: receipt },
    },
  };
}
