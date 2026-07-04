import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCreator, createListing, publicFeed } from "../dist/creator/listings.js";

const creator = createCreator({
  id: "c1",
  xHandle: "tester",
  displayName: "Tester",
  walletAddress: "0x1111111111111111111111111111111111111111",
  category: "ai",
});

describe("creator listings", () => {
  it("creates a creator and normalizes X handle", () => {
    assert.equal(creator.xHandle, "@tester");
  });

  it("creates a listing with USDC equivalent", () => {
    const listing = createListing(
      {
        id: "l1",
        creatorId: creator.id,
        title: " Useful thread ",
        url: " https://x.com/tester/status/1 ",
        description: " Good X content ",
        type: "x-thread",
        suggestedTipNgn: 155,
      },
      1550,
    );

    assert.equal(listing.title, "Useful thread");
    assert.equal(listing.url, "https://x.com/tester/status/1");
    assert.equal(listing.description, "Good X content");
    assert.deepEqual(listing.mediaUrls, []);
    assert.equal(listing.suggestedTipUsdc, 0.1);
  });

  it("uses only creator-supplied post content and media links", () => {
    const listing = createListing(
      {
        id: "manual-media",
        creatorId: creator.id,
        title: "Post with creator media",
        url: "https://x.com/tester/status/44",
        description: "Creator pasted this text manually.",
        mediaUrls: [" https://pbs.twimg.com/media/manual-image.jpg "],
        type: "x-thread",
        suggestedTipNgn: 150,
      },
      1500,
    );

    assert.equal(listing.description, "Creator pasted this text manually.");
    assert.deepEqual(listing.mediaUrls, ["https://pbs.twimg.com/media/manual-image.jpg"]);

    assert.throws(
      () =>
        createListing(
          {
            id: "missing-content",
            creatorId: creator.id,
            title: "Missing pasted content",
            url: "https://x.com/tester/status/45",
            description: " ",
            type: "x-thread",
            suggestedTipNgn: 150,
          },
          1500,
        ),
      /post content is required/,
    );
  });

  it("rejects bad handles, wallets, categories, urls, and tiny tips", () => {
    assert.throws(() => createCreator({ ...creator, xHandle: "bad handle" }), /invalid X handle/);
    assert.throws(() => createCreator({ ...creator, walletAddress: "nope" }), /walletAddress/);
    assert.throws(() => createCreator({ ...creator, category: "sports" }), /category/);
    assert.throws(
      () =>
        createListing(
          {
            id: "bad",
            creatorId: creator.id,
            title: "Bad",
            url: "not-a-url",
            description: "Bad",
            type: "x-thread",
            suggestedTipNgn: 100,
          },
          1550,
        ),
      /url/,
    );
    assert.throws(
      () =>
        createListing(
          {
            id: "tiny",
            creatorId: creator.id,
            title: "Tiny",
            url: "https://x.com/tester/status/2",
            description: "Tiny",
            type: "x-thread",
            suggestedTipNgn: 10,
          },
          1550,
        ),
      /₦50/,
    );
  });

  it("builds public feed with creator attached", () => {
    assert.equal(publicFeed([creator], [createListing({
      id: "l2",
      creatorId: creator.id,
      title: "Another thread",
      url: "https://x.com/tester/status/3",
      description: "More content",
      type: "x-thread",
      suggestedTipNgn: 50,
    }, 1550)])[0].creator.xHandle, "@tester");
  });

});