import { readPublicCreatorFeed } from "../creator/listing-store.js";
import { assertTxHash, readArcTransactionProof } from "./arc.js";
import { settleVerifiedTip, type FeedItem, type PaymentLog } from "./tips.js";

export async function findListing(listingId: string): Promise<FeedItem | undefined> {
  const feed = await readPublicCreatorFeed();
  return feed.find((item) => item.id === listingId);
}

export async function settleTestnetListingTip(
  listingId: string,
  txHash?: string,
  now = new Date().toISOString(),
  receipt?: unknown,
): Promise<PaymentLog> {
  const listing = await findListing(listingId);
  if (!listing) throw new Error("listing not found");

  const transactionHash = assertTxHash("txHash", txHash);
  const arcReceipt = receipt ?? await readArcTransactionProof(transactionHash);

  return settleVerifiedTip(
    listing,
    {
      transactionHash,
      network: "eip155:5042002",
      receipt: arcReceipt,
      settledAt: now,
    },
    now,
  );
}
