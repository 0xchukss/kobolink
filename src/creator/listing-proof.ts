import { mkdir, writeFile } from "node:fs/promises";

import type { PublicCreatorFeedItem } from "./listing-store.js";
import type { XUrlLiveProof } from "./x-url-proof.js";

export type RealListingProof = {
  project: "KoboLink";
  phase: "real-creator-attached-listing";
  recordedAt: string;
  success: true;
  listing: {
    id: string;
    creatorId: string;
    creatorHandle: string;
    displayName: string;
    creatorWallet: string;
    category: string;
    title: string;
    xPostUrl: string;
    postContent: string;
    mediaUrls: string[];
    amountNgn: number;
    amountUsdc: number;
    x402PaymentPath: string;
    attachmentSource: "creator_attached";
    xUrlProof: XUrlLiveProof;
  };
};

export function buildRealListingProof(
  item: PublicCreatorFeedItem,
  xUrlProof: XUrlLiveProof,
  recordedAt = new Date().toISOString(),
): RealListingProof {
  return {
    project: "KoboLink",
    phase: "real-creator-attached-listing",
    recordedAt,
    success: true,
    listing: {
      id: item.id,
      creatorId: item.creator.id,
      creatorHandle: item.creator.xHandle,
      displayName: item.creator.displayName,
      creatorWallet: item.creator.walletAddress,
      category: item.creator.category,
      title: item.title,
      xPostUrl: item.url,
      postContent: item.description,
      mediaUrls: item.mediaUrls ?? [],
      amountNgn: item.suggestedTipNgn,
      amountUsdc: item.suggestedTipUsdc,
      x402PaymentPath: item.x402PaymentPath,
      attachmentSource: "creator_attached",
      xUrlProof,
    },
  };
}

export async function writeRealListingProof(
  item: PublicCreatorFeedItem,
  xUrlProof: XUrlLiveProof,
  path = "proofs/real-listing.json",
): Promise<RealListingProof> {
  const proof = buildRealListingProof(item, xUrlProof);
  await mkdir(path.includes("/") || path.includes("\\") ? path.replace(/[\\/][^\\/]*$/, "") : ".", { recursive: true });
  await writeFile(path, JSON.stringify(proof, null, 2) + "\n", "utf8");
  return proof;
}
