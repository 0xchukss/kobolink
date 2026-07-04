import { readPublicCreatorFeed } from "./creator/listing-store.js";
import { readPaymentStateForFeed } from "./payments/log-store.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const feed = await readPublicCreatorFeed();

if (feed.length === 0) {
  console.error("No creator-attached X listings are available. A real tip cannot be proven without a real listing target.");
  process.exitCode = 1;
} else {
  const state = await readPaymentStateForFeed(feed);
  const latest = state.logs.find((log) => log.status === "settled" && (log.transactionHash || log.paymentReceipt));

  if (!latest) {
    console.error("No settled tips for creator-attached X listings. Use the UI tip button or POST /api/tips with a funded Circle Gateway fan wallet.");
    process.exitCode = 1;
  } else {
    const balance = state.balances.find((item) => item.creatorId === latest.creatorId);

    console.log(`${formatNaira(latest.amountNgn)} tip settled as ${formatUsdc(latest.amountUsdc)} on Arc testnet.`);
    console.log(`Creator: ${latest.creatorHandle}`);
    console.log(`Content: ${latest.contentTitle}`);
    console.log(`x402 endpoint: ${latest.x402PaymentUrl}`);
    console.log(`Status: ${latest.status}`);
    if (latest.transactionHash) console.log(`Transaction proof: ${latest.transactionHash}`);
    if (latest.explorerUrl) console.log(`Explorer: ${latest.explorerUrl}`);
    if (latest.paymentReceipt) console.log(`Circle receipt: ${latest.paymentReceipt}`);
    if (latest.receiptUrl) console.log(`Receipt URL: ${latest.receiptUrl}`);
    if (balance) console.log(`Creator balance: ${formatNaira(balance.amountNgn)} / ${formatUsdc(balance.amountUsdc)}`);
  }
}
