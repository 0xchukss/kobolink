import { readFanGatewayBalance } from "./budgets/gateway-balance.js";
import { readPublicCreatorFeed } from "./creator/listing-store.js";
import { readPaymentStateForFeed } from "./payments/log-store.js";
import { startLocalX402Server } from "./payments/local-x402-server.js";
import { findMatchedCurrentFeedTipLog, selectRealTipTarget, writeRealTipProof } from "./payments/real-tip-proof.js";
import { runFanTip } from "./payments/x402-gateway.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const requestedListingId = process.env.KOBOLINK_TIP_LISTING_ID?.trim() || undefined;
const feed = await readPublicCreatorFeed();
const beforeState = await readPaymentStateForFeed(feed);
const listing = selectRealTipTarget(feed, beforeState.logs, requestedListingId);
const wallet = await readFanGatewayBalance(listing.suggestedTipUsdc);

if (!wallet.fullyFunded) {
  throw new Error(
    "Circle Gateway balance does not cover this real tip. Available " +
      formatUsdc(wallet.gatewayAvailableUsdc) +
      ", required " +
      formatUsdc(listing.suggestedTipUsdc) +
      ".",
  );
}

const server = await startLocalX402Server();
try {
  const result = await runFanTip(listing.id, server.origin);
  const afterState = await readPaymentStateForFeed(feed);
  const matchedLog = findMatchedCurrentFeedTipLog(afterState.logs, listing, result.log);
  const proof = await writeRealTipProof({
    listing,
    result,
    matchedLog,
    requestedListingId,
    walletBefore: wallet,
  });

  console.log("KoboLink real single-tip proof\n");
  console.log("Creator: " + listing.creator.xHandle);
  console.log("Listing: " + listing.title);
  console.log("Amount: " + formatNaira(listing.suggestedTipNgn) + " / " + formatUsdc(listing.suggestedTipUsdc));
  console.log("Gateway before: " + formatUsdc(wallet.gatewayAvailableUsdc));
  console.log("Proof: " + (result.log.transactionHash ?? result.log.paymentReceipt));
  console.log("Proof saved: proofs/real-tip.json");

  if (!proof.success) process.exitCode = 1;
} finally {
  await server.close();
}
