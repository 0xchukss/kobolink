import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createStoredCreatorListing } from "../dist/creator/listing-store.js";
import { findListing, settleTestnetListingTip } from "../dist/payments/testnet-app.js";

function nativeAtomic(item) {
  const [whole, fraction = ""] = item.suggestedTipUsdc.toFixed(18).split(".");
  return BigInt(whole + fraction.padEnd(18, "0")).toString();
}

function arcReceipt(transactionHash, item) {
  return {
    type: "arc-transaction",
    chainId: 5042002,
    network: "eip155:5042002",
    transactionHash,
    to: item.creator.walletAddress,
    valueAtomic: nativeAtomic(item),
    valueNativeUsdc: item.suggestedTipUsdc.toFixed(18),
    status: "success",
    blockNumber: "1",
    explorerUrl: "https://testnet.arcscan.app/tx/" + transactionHash,
  };
}

function liveProof(url) {
  return {
    ok: true,
    url,
    finalUrl: url,
    status: 200,
    checkedAt: "2026-06-29T00:00:00.000Z",
    method: "GET",
    note: "Live URL check only. KoboLink does not scrape post content or media; creator-supplied fields remain authoritative.",
  };
}

async function withRealListing(callback) {
  const previousListingStore = process.env.KOBOLINK_LISTINGS_STORE;
  const previousPostStore = process.env.KOBOLINK_X_POST_STORE;
  const tempDir = await mkdtemp(join(tmpdir(), "kobolink-real-listing-"));
  process.env.KOBOLINK_LISTINGS_STORE = join(tempDir, "creator-listings.json");
  process.env.KOBOLINK_X_POST_STORE = join(tempDir, "x-posts.json");

  try {
    const item = await createStoredCreatorListing(
      {
        xHandle: "p2local",
        displayName: "Phase 2 Local Creator",
        walletAddress: "0x68e7DB2E572e0e58bea085b28689b9948DF70aAD",
        category: "fintech",
        title: "Local listing payment target",
        url: "https://x.com/p2local/status/5042002",
        xUrlProof: liveProof("https://x.com/p2local/status/5042002"),
        description: "A local creator listing that must resolve through the payment target path.",
        mediaUrls: [],
        suggestedTipNgn: 250,
        type: "x-thread",
      },
      undefined,
      "2026-06-29T00:00:00.000Z",
    );
    return await callback(item);
  } finally {
    if (previousListingStore === undefined) delete process.env.KOBOLINK_LISTINGS_STORE;
    else process.env.KOBOLINK_LISTINGS_STORE = previousListingStore;
    if (previousPostStore === undefined) delete process.env.KOBOLINK_X_POST_STORE;
    else process.env.KOBOLINK_X_POST_STORE = previousPostStore;
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe("functional testnet app flow", () => {
  it("settles a listed item only with an explicit Arc testnet tx proof", async () => {
    await withRealListing(async (item) => {
      const hash = "0x" + "a".repeat(64);
      const log = await settleTestnetListingTip(item.id, hash, "2026-06-28T00:00:00.000Z", arcReceipt(hash, item));

      assert.equal((await findListing(item.id))?.creator.xHandle, "@p2local");
      assert.equal(log.status, "settled");
      assert.equal(log.x402PaymentUrl, "/x402/pay/" + item.id);
      assert.equal(log.transactionHash, hash);
    });
  });

  it("settles Phase 2-created local listings as payment targets", async () => {
    await withRealListing(async (item) => {
      const hash = "0x" + "b".repeat(64);
      const log = await settleTestnetListingTip(item.id, hash, "2026-06-29T00:01:00.000Z", arcReceipt(hash, item));

      assert.equal((await findListing(item.id))?.creator.xHandle, "@p2local");
      assert.equal(log.creatorHandle, "@p2local");
      assert.equal(log.amountNgn, 250);
      assert.equal(log.amountUsdc, 0.16129);
      assert.equal(log.x402PaymentUrl, `/x402/pay/${item.id}`);
      assert.equal(log.transactionHash, hash);
    });
  });

  it("rejects missing or malformed tx proofs", async () => {
    await withRealListing(async (item) => {
      await assert.rejects(() => settleTestnetListingTip(item.id), /txHash must be a real/);
      await assert.rejects(() => settleTestnetListingTip(item.id, "replace_me"), /txHash must be a real/);
    });
  });

  it("rejects unknown listings", async () => {
    await assert.rejects(() => settleTestnetListingTip("missing", "0x" + "a".repeat(64)), /listing not found/);
  });
});