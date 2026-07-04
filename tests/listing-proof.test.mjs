import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { buildRealListingProof, writeRealListingProof } from "../dist/creator/listing-proof.js";

const item = {
  id: "listing-real",
  creatorId: "creator-real",
  title: "Real X post",
  url: "https://x.com/realcreator/status/123456",
  description: "Creator pasted the post content.",
  mediaUrls: ["https://pbs.twimg.com/media/real.jpg"],
  type: "x-thread",
  suggestedTipNgn: 150,
  suggestedTipUsdc: 0.096774,
  creator: {
    id: "creator-real",
    xHandle: "@realcreator",
    displayName: "Real Creator",
    walletAddress: "0x1111111111111111111111111111111111111111",
    category: "ai",
  },
  createdAt: "2026-07-02T00:00:00.000Z",
  source: "local",
  suggestedTipKobo: 15000,
  x402PaymentPath: "/x402/pay/listing-real",
};

const xUrlProof = {
  ok: true,
  url: "https://x.com/realcreator/status/123456",
  finalUrl: "https://x.com/realcreator/status/123456",
  status: 200,
  checkedAt: "2026-07-02T00:00:00.000Z",
  method: "GET",
  note: "Live URL check only. KoboLink does not scrape post content or media; creator-supplied fields remain authoritative.",
};

describe("real listing proof writer", () => {
  it("builds proof from creator-supplied fields and live URL proof", () => {
    const proof = buildRealListingProof(item, xUrlProof, "2026-07-02T00:01:00.000Z");

    assert.equal(proof.success, true);
    assert.equal(proof.listing.id, "listing-real");
    assert.equal(proof.listing.xPostUrl, item.url);
    assert.equal(proof.listing.postContent, item.description);
    assert.deepEqual(proof.listing.mediaUrls, item.mediaUrls);
    assert.equal(proof.listing.xUrlProof.status, 200);
    assert.match(proof.listing.xUrlProof.note, /does not scrape post content or media/);
  });

  it("writes the proof artifact used by real-mode readiness", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kobolink-listing-proof-"));
    try {
      const path = join(dir, "real-listing.json");
      await writeRealListingProof(item, xUrlProof, path);
      const written = JSON.parse(await readFile(path, "utf8"));

      assert.equal(written.phase, "real-creator-attached-listing");
      assert.equal(written.listing.attachmentSource, "creator_attached");
      assert.equal(written.listing.xUrlProof.url, item.url);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
