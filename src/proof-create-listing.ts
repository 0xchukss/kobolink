import { writeRealListingProof } from "./creator/listing-proof.js";
import { createStoredCreatorListing } from "./creator/listing-store.js";
import { verifyXStatusUrlLive } from "./creator/x-url-proof.js";
import { parseRealListingEnv } from "./proofs/real-setup-inputs.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const input = parseRealListingEnv();
const xUrlProof = await verifyXStatusUrlLive(input.url);
const item = await createStoredCreatorListing({ ...input, xUrlProof });

await writeRealListingProof(item, xUrlProof);

console.log("KoboLink real creator-attached listing\n");
console.log("Creator: " + item.creator.xHandle);
console.log("X post: " + item.url);
console.log("X URL proof: HTTP " + xUrlProof.status + " / " + (xUrlProof.finalUrl ?? item.url));
console.log("Amount: " + formatNaira(item.suggestedTipNgn) + " / " + formatUsdc(item.suggestedTipUsdc));
console.log("Payment path: " + item.x402PaymentPath);
console.log("Proof saved: proofs/real-listing.json");
