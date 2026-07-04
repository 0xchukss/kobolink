import assert from "node:assert/strict";
import { unlink, writeFile } from "node:fs/promises";
import { after, describe, it } from "node:test";

import { createStoredCreatorListing, readCreatorListingRecords, readPublicCreatorFeed } from "../dist/creator/listing-store.js";

const storePath = `data/test-listings-${process.pid}-${Date.now()}.json`;

after(async () => {
  await unlink(storePath).catch(() => undefined);
});

describe("creator listing store", () => {
  it("persists a creator-attached X post listing and returns it in the public feed", async () => {
    const created = await createStoredCreatorListing(
      {
        xHandle: "lagosfounder",
        displayName: "Lagos Founder",
        walletAddress: "0x3333333333333333333333333333333333333333",
        category: "startups",
        title: "A founder's guide to agent budgets",
        url: "https://x.com/lagosfounder/status/42",
        xUrlProof: liveProof("https://x.com/lagosfounder/status/42"),
        postContent: "A practical thread about small autonomous budgets for communities.",
        mediaUrls: ["https://pbs.twimg.com/media/demo-image.jpg"],
        suggestedTipNgn: 150,
        type: "x-thread",
      },
      storePath,
      "2026-06-29T10:00:00.000Z",
    );

    assert.equal(created.creator.xHandle, "@lagosfounder");
    assert.equal(created.creator.category, "startups");
    assert.equal(created.suggestedTipNgn, 150);
    assert.equal(created.suggestedTipKobo, 15000);
    assert.equal(created.suggestedTipUsdc, 0.096774);
    assert.equal(created.url, "https://x.com/lagosfounder/status/42");
    assert.equal(created.description, "A practical thread about small autonomous budgets for communities.");
    assert.equal(created.x402PaymentPath, `/x402/pay/${created.id}`);
    assert.deepEqual(created.mediaUrls, ["https://pbs.twimg.com/media/demo-image.jpg"]);

    const localRecords = await readCreatorListingRecords(storePath);
    assert.equal(localRecords.length, 1);
    assert.equal(localRecords[0].listing.id, created.id);
    assert.equal(localRecords[0].attachmentSource, "creator_attached");

    const feed = await readPublicCreatorFeed(storePath);
    assert.equal(feed[0].id, created.id);
    assert.equal(feed[0].source, "local");
    assert.ok(feed.every((item) => item.source === "local"));
  });

  it("requires the attached X URL handle to match the creator handle", async () => {
    await assert.rejects(
      () => createStoredCreatorListing(
        {
          xHandle: "oauthcreator",
          displayName: "OAuth Creator",
          walletAddress: "0x7777777777777777777777777777777777777777",
          category: "ai",
          title: "Someone else's post",
          url: "https://x.com/diffcreator/status/84",
          description: "The creator cannot list another handle's post as their own target.",
          suggestedTipNgn: 150,
          type: "x-thread",
        },
        storePath,
        "2026-06-29T10:02:00.000Z",
      ),
      /handle matches the creator handle/,
    );
  });

  it("does not expose seed listings even if the old seed flag is set", async () => {
    const previous = process.env.KOBOLINK_INCLUDE_SEED_LISTINGS;
    process.env.KOBOLINK_INCLUDE_SEED_LISTINGS = "true";
    try {
      const emptyStorePath = `data/test-empty-listings-${process.pid}-${Date.now()}.json`;
      await writeFile(emptyStorePath, "[]\n", "utf8");
      try {
        const feed = await readPublicCreatorFeed(emptyStorePath);
        assert.equal(feed.length, 0);
      } finally {
        await unlink(emptyStorePath).catch(() => undefined);
      }
    } finally {
      if (previous === undefined) delete process.env.KOBOLINK_INCLUDE_SEED_LISTINGS;
      else process.env.KOBOLINK_INCLUDE_SEED_LISTINGS = previous;
    }
  });

  it("filters stored rows without embedded live URL proof", async () => {
    const unprovenStorePath = `data/test-unproven-listings-${process.pid}-${Date.now()}.json`;
    try {
      await writeFile(unprovenStorePath, JSON.stringify([
        {
          createdAt: "2026-06-29T10:00:00.000Z",
          attachmentSource: "creator_attached",
          creator: {
            id: "creator-unproven",
            xHandle: "@unprovencreator",
            displayName: "Unproven Creator",
            walletAddress: "0x9999999999999999999999999999999999999999",
            category: "ai",
          },
          listing: {
            id: "listing-unproven",
            creatorId: "creator-unproven",
            title: "Unproven attached post",
            url: "https://x.com/unprovencreator/status/168",
            description: "A matching local row without live URL proof must not be a payment target.",
            type: "x-thread",
            suggestedTipNgn: 150,
            suggestedTipUsdc: 0.096774,
          },
        },
      ], null, 2), "utf8");

      const feed = await readPublicCreatorFeed(unprovenStorePath);
      assert.equal(feed.length, 0);
    } finally {
      await unlink(unprovenStorePath).catch(() => undefined);
    }
  });

  it("filters legacy records without creator attachment source", async () => {
    const legacyStorePath = `data/test-legacy-attachment-listings-${process.pid}-${Date.now()}.json`;
    try {
      await writeFile(legacyStorePath, JSON.stringify([
        {
          createdAt: "2026-06-29T10:00:00.000Z",
          creator: {
            id: "creator-legacy",
            xHandle: "@legacycreator",
            displayName: "Legacy Creator",
            walletAddress: "0x8888888888888888888888888888888888888888",
            category: "ai",
          },
          listing: {
            id: "listing-legacy",
            creatorId: "creator-legacy",
            title: "Legacy attached post",
            url: "https://x.com/legacycreator/status/168",
            description: "Old records without creator_attached must not be payment targets.",
            type: "x-thread",
            suggestedTipNgn: 150,
            suggestedTipUsdc: 0.096774,
          },
        },
      ], null, 2), "utf8");

      const feed = await readPublicCreatorFeed(legacyStorePath);
      assert.equal(feed.length, 0);
    } finally {
      await unlink(legacyStorePath).catch(() => undefined);
    }
  });

  it("filters stale local X listings with mismatched URL handle", async () => {
    const staleStorePath = `data/test-stale-listings-${process.pid}-${Date.now()}.json`;
    try {
      await writeFile(staleStorePath, JSON.stringify([
        {
          createdAt: "2026-06-29T10:00:00.000Z",
          attachmentSource: "creator_attached",
          creator: {
            id: "creator-stale",
            xHandle: "@stalecreator",
            displayName: "Stale Creator",
            walletAddress: "0x4444444444444444444444444444444444444444",
            category: "ai",
          },
          listing: {
            id: "listing-stale",
            creatorId: "creator-stale",
            title: "Old unverified listing",
            url: "https://x.com/someoneelse/status/99",
            description: "This record must not be a payment target.",
            type: "x-thread",
            suggestedTipNgn: 150,
            suggestedTipUsdc: 0.096774,
          },
        },
      ], null, 2), "utf8");

      const feed = await readPublicCreatorFeed(staleStorePath);
      assert.equal(feed.length, 0);
    } finally {
      await unlink(staleStorePath).catch(() => undefined);
    }
  });

  it("rejects stored article listings because real mode requires attached X posts", async () => {
    await assert.rejects(
      () => createStoredCreatorListing(
        {
          xHandle: "articlewriter",
          displayName: "Article Writer",
          walletAddress: "0x5555555555555555555555555555555555555555",
          category: "news",
          title: "A standalone article should not be a tip target",
          url: "https://example.com/article",
          description: "KoboLink real mode only lists creator-attached X status posts.",
          suggestedTipNgn: 150,
          type: "article",
        },
        storePath,
        "2026-06-29T10:05:00.000Z",
      ),
      /invalid content type|creator-attached X status posts/,
    );
  });

  it("filters legacy article records out of the public payment feed", async () => {
    const articleStorePath = `data/test-article-listings-${process.pid}-${Date.now()}.json`;
    try {
      await writeFile(articleStorePath, JSON.stringify([
        {
          createdAt: "2026-06-29T10:00:00.000Z",
          attachmentSource: "creator_attached",
          creator: {
            id: "creator-article",
            xHandle: "@articlecreator",
            displayName: "Article Creator",
            walletAddress: "0x6666666666666666666666666666666666666666",
            category: "news",
          },
          listing: {
            id: "listing-article",
            creatorId: "creator-article",
            title: "Legacy article",
            url: "https://example.com/article",
            description: "This non-X record must not be exposed as a testnet payment target.",
            type: "article",
            suggestedTipNgn: 150,
            suggestedTipUsdc: 0.096774,
          },
        },
      ], null, 2), "utf8");

      const feed = await readPublicCreatorFeed(articleStorePath);
      assert.equal(feed.length, 0);
    } finally {
      await unlink(articleStorePath).catch(() => undefined);
    }
  });
});

function liveProof(url) {
  return {
    ok: true,
    url,
    finalUrl: url,
    status: 200,
    checkedAt: "2026-06-29T10:00:00.000Z",
    method: "GET",
    note: "Live URL check only. KoboLink does not scrape post content or media; creator-supplied fields remain authoritative.",
  };
}
