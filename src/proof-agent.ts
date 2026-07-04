import { mkdir, writeFile } from "node:fs/promises";

import { assertGatewayCoversBudget, createFanBudget } from "./budgets/fan-budget.js";
import { writeFanBudget } from "./budgets/budget-store.js";
import { readFanGatewayBalance } from "./budgets/gateway-balance.js";
import { config } from "./config/env.js";
import { readPublicCreatorFeed, type PublicCreatorFeedItem } from "./creator/listing-store.js";
import { runAutonomousPaymentAgent } from "./agents/payment-agent.js";
import { readPaymentStateForFeed } from "./payments/log-store.js";
import { startLocalX402Server } from "./payments/local-x402-server.js";
import { getFanAddress } from "./proofs/env-wallets.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const targetTipCount = 3;
const budgetNgn = config.economics.agentBudgetNgn;
const maxTipNgn = 250;
const runId = Date.now().toString(36).slice(-6).toLowerCase();
const fanAddress = getFanAddress();
const interests = ["ai", "fintech", "startups"] as const;

const feed = await readPublicCreatorFeed();
const eligibleListings = feed.filter((item) => interests.includes(item.creator.category as (typeof interests)[number]) && item.suggestedTipNgn <= maxTipNgn);

if (eligibleListings.length < targetTipCount) {
  throw new Error(
    "Day 5 real agent run needs at least " + targetTipCount + " creator-attached X listings in AI/fintech/startups at or below " + formatNaira(maxTipNgn) + ". " +
      "Found " + eligibleListings.length + ". Create creator-attached X listings with real status URLs, post content, and Arc wallets, then rerun npm run proof:agent.",
  );
}

const budget = createFanBudget({
  fanAddress,
  budgetNgn,
  maxTipNgn,
  period: "weekly",
  interests: [...interests],
  preferredCategories: [...interests],
  duplicateListingProtection: true,
  duplicateCreatorProtection: true,
});

const wallet = await readFanGatewayBalance(budget.budgetUsdc);
assertGatewayCoversBudget(wallet);
await writeFanBudget(budget);

const paymentState = await readPaymentStateForFeed(feed);
const server = await startLocalX402Server();

try {
  const result = await runAutonomousPaymentAgent({
    budget,
    feed,
    paymentLogs: paymentState.logs,
    wallet,
    appOrigin: server.origin,
    targetTipCount,
  });

  await writeFanBudget(result.budget);
  await writeDay5Proof({ runId, eligibleListings, result, wallet });

  console.log("KoboLink real autonomous tipping agent\n");
  console.log("Budget: " + formatNaira(result.ledger.fundedNgn) + " / " + formatUsdc(result.ledger.fundedUsdc));
  console.log("Spent: " + formatNaira(result.ledger.spentNgn) + " / " + formatUsdc(result.ledger.spentUsdc));
  console.log("Remaining: " + formatNaira(result.ledger.remainingNgn) + " / " + formatUsdc(result.ledger.remainingUsdc));
  console.log("Gateway before run: " + formatUsdc(wallet.gatewayAvailableUsdc));
  console.log("Verified feed listings: " + feed.length);
  console.log("Unique proofs: " + result.uniqueProofCount + "\n");

  for (const agentDecision of result.decisions) {
    if (agentDecision.status === "tipped") {
      const proof = agentDecision.proof?.transactionHash ?? agentDecision.proof?.paymentReceipt;
      console.log(agentDecision.creatorHandle + ": tipped " + formatNaira(agentDecision.amountNgn) + " / " + formatUsdc(agentDecision.amountUsdc) + " - " + proof);
    } else {
      console.log(agentDecision.creatorHandle + ": " + agentDecision.reason);
    }
  }

  if (result.tipped.length !== targetTipCount || result.uniqueProofCount !== targetTipCount) {
    process.exitCode = 1;
  }
} finally {
  await server.close();
}

async function writeDay5Proof(payload: {
  runId: string;
  eligibleListings: PublicCreatorFeedItem[];
  result: Awaited<ReturnType<typeof runAutonomousPaymentAgent>>;
  wallet: Awaited<ReturnType<typeof readFanGatewayBalance>>;
}): Promise<void> {
  const proof = {
    project: "KoboLink",
    phase: "day-5-autonomous-agent-real-payments",
    recordedAt: new Date().toISOString(),
    runId: payload.runId,
    success: payload.result.tipped.length === targetTipCount && payload.result.uniqueProofCount === targetTipCount,
    targetTipCount,
    wallet: payload.wallet,
    ledger: payload.result.ledger,
    eligibleListings: payload.eligibleListings.map((listing) => ({
      id: listing.id,
      creatorHandle: listing.creator.xHandle,
      category: listing.creator.category,
      amountNgn: listing.suggestedTipNgn,
      amountUsdc: listing.suggestedTipUsdc,
      x402PaymentPath: listing.x402PaymentPath,
      source: listing.source,
    })),
    tipped: payload.result.paymentProofs.map((log) => ({
      creatorHandle: log.creatorHandle,
      listingId: log.contentId,
      amountNgn: log.amountNgn,
      amountUsdc: log.amountUsdc,
      contentTitle: log.contentTitle,
      x402PaymentUrl: log.x402PaymentUrl,
      payTo: log.payTo,
      transactionHash: log.transactionHash,
      explorerUrl: log.explorerUrl,
      paymentReceipt: log.paymentReceipt,
      receiptUrl: log.receiptUrl,
      network: log.network,
      settledAt: log.settledAt,
    })),
    decisions: payload.result.decisions,
  };

  await mkdir("proofs", { recursive: true });
  await writeFile("proofs/day5.json", JSON.stringify(proof, null, 2) + "\n", "utf8");
}
