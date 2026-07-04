import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyXStatusUrlLive } from "../dist/creator/x-url-proof.js";

describe("live X URL proof", () => {
  it("records live URL metadata without scraping creator content or media", async () => {
    let cancelled = false;
    const proof = await verifyXStatusUrlLive(
      "https://x.com/realcreator/status/123456",
      async () => ({
        ok: true,
        status: 200,
        url: "https://x.com/realcreator/status/123456",
        body: { cancel: () => { cancelled = true; } },
      }),
      "2026-07-02T00:00:00.000Z",
    );

    assert.equal(proof.ok, true);
    assert.equal(proof.status, 200);
    assert.equal(proof.url, "https://x.com/realcreator/status/123456");
    assert.equal(proof.method, "GET");
    assert.equal(cancelled, true);
    assert.match(proof.note, /does not scrape post content or media/);
    assert.equal("postContent" in proof, false);
    assert.equal("mediaUrls" in proof, false);
  });

  it("rejects non-status URLs and non-live responses", async () => {
    await assert.rejects(
      () => verifyXStatusUrlLive("https://x.com/realcreator", async () => { throw new Error("should not fetch"); }),
      /status URL/,
    );

    await assert.rejects(
      () => verifyXStatusUrlLive("https://x.com/realcreator/status/123456", async () => ({
        ok: false,
        status: 404,
        url: "https://x.com/realcreator/status/123456",
        body: null,
      })),
      /did not return a live success response/,
    );
  });
});
