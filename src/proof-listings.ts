import { readPublicCreatorFeed } from "./creator/listing-store.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const feed = await readPublicCreatorFeed();

console.log("KoboLink Verified Creator Listings\n");

if (feed.length === 0) {
  console.error("No creator-attached X listings are available. Add a creator listing with a real X status URL, post content, and Arc wallet.");
  process.exitCode = 1;
} else {
  for (const item of feed) {
    console.log(`${item.creator.xHandle} — ${item.creator.displayName}`);
    console.log(item.title);
    console.log(item.url);
    console.log(`Suggested tip: ${formatNaira(item.suggestedTipNgn)}`);
    console.log(`Settles as: ${formatUsdc(item.suggestedTipUsdc)}`);
    console.log(`x402 endpoint: ${item.x402PaymentPath}`);
    console.log("");
  }
}
