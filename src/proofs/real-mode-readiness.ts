import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";

import { config } from "../config/env.js";
import { readFanBudget } from "../budgets/budget-store.js";
import { readFanGatewayBalance } from "../budgets/gateway-balance.js";
import type { FanBudget, GatewayBalanceSnapshot } from "../budgets/fan-budget.js";
import { readCreatorListingRecords, readPublicCreatorFeed, type PublicCreatorFeedItem } from "../creator/listing-store.js";
import { getFlutterwaveConfigStatus } from "../flutterwave/config.js";
import { readBridgeState } from "../flutterwave/bridge-store.js";
import { isAcceptedPayoutBackedBySettledTips } from "../flutterwave/withdrawal-guard.js";
import { filterPaymentLogsForFeed, readPaymentState } from "../payments/log-store.js";
import { balancesFromLogs, hasSettlementProof, type PaymentLog } from "../payments/tips.js";
import type { RealTipProof } from "../payments/real-tip-proof.js";
import { bridgeDepositProofDetail, bridgePayoutProofDetail, findStrictAcceptedFlutterwavePayout, findStrictVerifiedFlutterwaveDeposit, type StrictBridgeCheckoutProof, type StrictBridgeDepositProof, type StrictBridgePayoutProof } from "./bridge-proof-evidence.js";
import { readArcBalanceEvidence, readX402ProofEvidence, type Day1Proof, type LiveArcBalanceReader } from "./day1-evidence.js";
import { parseRealBridgeCheckoutEnv, parseRealBridgePayoutEnv, parseRealBridgeVerifyEnv, parseRealListingEnv } from "./real-setup-inputs.js";

export type RealModeCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type RealModeReadiness = {
  generatedAt: string;
  ok: boolean;
  checks: RealModeCheck[];
  blockers: string[];
};

type RealModeReadinessOptions = {
  liveGateway?: boolean;
  gatewayReader?: (requiredBudgetUsdc: number) => Promise<GatewayBalanceSnapshot>;
  liveArcBalance?: boolean;
  arcBalanceReader?: LiveArcBalanceReader;
  arcAddressResolver?: () => string;
};

type GatewayEvidence = {
  ok: boolean;
  source: string;
  fanAddress?: string;
  gatewayAvailableUsdc: number;
  error?: string;
};

type CommandInputStatus = {
  ok: boolean;
  detail: string;
};

type RealListingProof = {
  success?: boolean;
  listing?: {
    id?: string;
    creatorHandle?: string;
    xPostUrl?: string;
    postContent?: string;
    xUrlProof?: {
      ok?: boolean;
      url?: string;
      status?: number;
      checkedAt?: string;
    };
  };
};

type ListingProofEvidence = {
  ok: boolean;
  detail: string;
};

type TipProofEvidence = {
  ok: boolean;
  detail: string;
};

type FileAbsenceEvidence = {
  ok: boolean;
  detail: string;
};

function envReady(names: string[]): { ok: boolean; missing: string[] } {
  const missing = names.filter((name) => isPlaceholder(process.env[name]));
  return { ok: missing.length === 0, missing };
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const lowered = value.trim().toLowerCase();
  return !lowered || lowered === "replace_me" || lowered.includes("replace_me") || lowered.includes("placeholder") || /^0x0+$/.test(lowered);
}

async function readGatewayEvidence(args: { budget: FanBudget | null; day1?: Day1Proof; options: RealModeReadinessOptions }): Promise<GatewayEvidence> {
  if (args.options.liveGateway) {
    try {
      const reader = args.options.gatewayReader ?? readFanGatewayBalance;
      const wallet = await reader(args.budget?.budgetUsdc ?? 0);
      return {
        ok: true,
        source: "live Circle Gateway",
        fanAddress: wallet.fanAddress,
        gatewayAvailableUsdc: wallet.gatewayAvailableUsdc,
      };
    } catch (error) {
      return {
        ok: false,
        source: "live Circle Gateway",
        fanAddress: args.day1?.arcBalance?.address,
        gatewayAvailableUsdc: 0,
        error: gatewayErrorMessage(error),
      };
    }
  }

  return {
    ok: Boolean(args.day1?.arcBalance?.address),
    source: "proofs/day1.json",
    fanAddress: args.day1?.arcBalance?.address,
    gatewayAvailableUsdc: Number(args.day1?.arcBalance?.gateway?.gatewayAvailableUsdc ?? 0),
  };
}

function gatewayErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Unexpected token '<'|<!DOCTYPE|is not valid JSON/i.test(message)) {
    return "Circle Gateway returned a non-JSON HTML response. Check Gateway API availability, chain=arcTestnet, and Circle credentials.";
  }
  return message;
}

function commandInputStatus(command: string, parser: () => unknown): CommandInputStatus {
  try {
    parser();
    return { ok: true, detail: "Inputs are present for " + command + "." };
  } catch (error) {
    return {
      ok: false,
      detail: "Missing input for " + command + ": " + (error instanceof Error ? error.message : String(error)),
    };
  }
}

function appendInputDetail(detail: string, ...inputs: CommandInputStatus[]): string {
  const missing = inputs.filter((input) => !input.ok).map((input) => input.detail);
  if (missing.length > 0) return detail + " " + missing.join(" ");
  const present = inputs.map((input) => input.detail);
  return detail + " " + present.join(" ");
}

function liveListingProofEvidence(feed: PublicCreatorFeedItem[], proof: RealListingProof | undefined, listingInput: CommandInputStatus): ListingProofEvidence {
  if (feed.length === 0) {
    return { ok: false, detail: appendInputDetail("No creator-attached X status listings are available.", listingInput) };
  }

  const listing = proof?.listing;
  const current = listing?.id ? feed.find((item) => item.id === listing.id) : undefined;
  const proofOk = Boolean(
    proof?.success === true &&
      listing?.xUrlProof?.ok === true &&
      listing.xUrlProof.url === listing.xPostUrl &&
      current &&
      current.url === listing.xPostUrl &&
      current.creator.xHandle.toLowerCase() === String(listing.creatorHandle ?? "").toLowerCase() &&
      current.description === listing.postContent,
  );

  if (proofOk) {
    return {
      ok: true,
      detail: feed.length + " creator-attached X listing(s) are payment targets; latest proof verified live X URL HTTP " + listing?.xUrlProof?.status + ".",
    };
  }

  if (!proof) {
    return {
      ok: false,
      detail: feed.length + " creator-attached X listing(s) exist, but proofs/real-listing.json is missing live X URL proof. Run npm run proof:create-listing.",
    };
  }

  return {
    ok: false,
    detail: feed.length + " creator-attached X listing(s) exist, but proofs/real-listing.json does not match the current feed with live X URL proof. Run npm run proof:create-listing again.",
  };
}

export function realTipProofEvidence(feed: PublicCreatorFeedItem[], settledVerifiedFeedLogs: PaymentLog[], proof: RealTipProof | undefined): TipProofEvidence {
  if (settledVerifiedFeedLogs.length === 0) {
    return { ok: false, detail: "No settled payment logs match the creator-attached X feed." };
  }

  if (!proof) {
    return {
      ok: false,
      detail: settledVerifiedFeedLogs.length + " settled current-feed tip log(s) exist, but proofs/real-tip.json is missing. Run npm run proof:tip-listing or use the UI tip button.",
    };
  }

  const listing = proof.listing;
  const current = feed.find((item) => item.id === listing.id);
  const matchedLog = settledVerifiedFeedLogs.find((log) => logMatchesTipProof(log, proof));
  const proofOk = Boolean(
    proof.success === true &&
      proof.matchedCurrentFeedLog === true &&
      current &&
      matchedLog &&
      currentTipListingMatchesProof(current, proof),
  );

  if (proofOk) {
    return {
      ok: true,
      detail: settledVerifiedFeedLogs.length + " settled tip log(s) match the creator-attached X feed; proofs/real-tip.json verifies " + (proof.settlement.paymentReceipt ?? proof.settlement.transactionHash ?? proof.settlement.logId) + ".",
    };
  }

  return {
    ok: false,
    detail: settledVerifiedFeedLogs.length + " settled current-feed tip log(s) exist, but proofs/real-tip.json does not match the current feed and settlement log. Run npm run proof:tip-listing again.",
  };
}

function currentTipListingMatchesProof(item: PublicCreatorFeedItem, proof: RealTipProof): boolean {
  const listing = proof.listing;
  return Boolean(
    item.id === listing.id &&
      item.creator.xHandle.toLowerCase() === listing.creatorHandle.toLowerCase() &&
      item.creator.walletAddress.toLowerCase() === listing.creatorWallet.toLowerCase() &&
      item.title === listing.title &&
      item.url === listing.xPostUrl &&
      item.description === listing.postContent &&
      sameStringList(item.mediaUrls ?? [], listing.mediaUrls ?? []) &&
      item.suggestedTipNgn === listing.amountNgn &&
      item.suggestedTipUsdc.toFixed(6) === Number(listing.amountUsdc).toFixed(6) &&
      item.x402PaymentPath === listing.x402PaymentPath,
  );
}

function logMatchesTipProof(log: PaymentLog, proof: RealTipProof): boolean {
  const listing = proof.listing;
  const proofId = proof.settlement.paymentReceipt ?? proof.settlement.transactionHash;

  return Boolean(
    hasSettlementProof(log) &&
      log.contentId === listing.id &&
      log.creatorHandle.toLowerCase() === listing.creatorHandle.toLowerCase() &&
      log.contentTitle === listing.title &&
      log.amountNgn === listing.amountNgn &&
      log.amountUsdc.toFixed(6) === Number(listing.amountUsdc).toFixed(6) &&
      log.x402PaymentUrl === listing.x402PaymentPath &&
      sameAddress(log.payTo, listing.creatorWallet) &&
      (!proof.settlement.logId || log.id === proof.settlement.logId) &&
      Boolean(proofId && (log.paymentReceipt ?? log.transactionHash) === proofId) &&
      (!proof.settlement.network || !log.network || log.network.toLowerCase() === proof.settlement.network.toLowerCase()),
  );
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function noSeedMarketplaceEvidence(): Promise<FileAbsenceEvidence> {
  const forbiddenPaths = [
    "app/demo",
    "app/demo/page.tsx",
    "src/data/demo-listings.ts",
    "dist/data/demo-listings.js",
    "dist/data/demo-listings.js.map",
    "dist/demo-listings.js",
    "dist/demo-listings.js.map",
    "src/x/oauth.ts",
    "src/x/post-store.ts",
    "dist/x/oauth.js",
    "dist/x/oauth.js.map",
    "dist/x/post-store.js",
    "dist/x/post-store.js.map",
    "app/api/x/oauth/start/route.ts",
    "app/api/x/oauth/callback/route.ts",
    "app/api/x/post/route.ts",
    "app/api/x/status/route.ts",
    "app/api/x/logout/route.ts",
  ];
  const forbiddenEnvKeys = [
    "X_REDIRECT_URI",
    "X_OAUTH_COOKIE_SECRET",
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
    "TWITTER_API_KEY",
    "TWITTER_API_SECRET",
    "TWITTER_BEARER_TOKEN",
    "TWITTER_ACCESS_TOKEN",
    "TWITTER_ACCESS_TOKEN_SECRET",
  ];
  const present: string[] = [];

  for (const path of forbiddenPaths) {
    try {
      await access(path);
      present.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  for (const envFile of [".env", ".env.local", ".env.example"]) {
    const keys = await assignedEnvKeys(envFile, forbiddenEnvKeys);
    present.push(...keys.map((key) => envFile + ":" + key));
  }

  present.push(...await runtimeDemoRouteReferences());

  return present.length === 0
    ? { ok: true, detail: "No source, compiled seed marketplace feed, demo workflow route, X posting/OAuth routes, or X OAuth env assignments are present." }
    : { ok: false, detail: "Forbidden demo/X posting artifacts are present: " + present.join(", ") };
}

async function runtimeDemoRouteReferences(): Promise<string[]> {
  const files = await sourceFilesUnder("app");
  const present: string[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    if (/['"]\/demo(?:[?#'"]|$)/.test(raw)) present.push(file + ":/demo link");
    if (/View live demo/i.test(raw)) present.push(file + ":View live demo");
  }

  return present;
}

async function sourceFilesUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = root + "/" + entry.name;
      if (entry.isDirectory()) return sourceFilesUnder(fullPath);
      return /\.(tsx?|jsx?)$/.test(entry.name) ? [fullPath] : [];
    }));
    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function assignedEnvKeys(path: string, forbiddenKeys: string[]): Promise<string[]> {
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const assigned = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=/);
    if (match && forbiddenKeys.includes(match[1])) assigned.add(match[1]);
  }
  return Array.from(assigned);
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function buildRealModeReadiness(now = new Date().toISOString(), options: RealModeReadinessOptions = {}): Promise<RealModeReadiness> {
  const [feed, allListingRecords, paymentState, bridgeState, budget, day1, bridgeCheckoutProof, bridgeDepositProof, bridgePayoutProof, realListingProof, realTipProof] = await Promise.all([
    readPublicCreatorFeed(),
    readCreatorListingRecords(),
    readPaymentState(),
    readBridgeState(),
    readFanBudget(),
    readJsonIfExists<Day1Proof>("proofs/day1.json"),
    readJsonIfExists<StrictBridgeCheckoutProof>("proofs/real-bridge-checkout.json"),
    readJsonIfExists<StrictBridgeDepositProof>("proofs/real-bridge-deposit.json"),
    readJsonIfExists<StrictBridgePayoutProof>("proofs/real-bridge-payout.json"),
    readJsonIfExists<RealListingProof>("proofs/real-listing.json"),
    readJsonIfExists<RealTipProof>("proofs/real-tip.json"),
  ]);

  const noSeedFeed = await noSeedMarketplaceEvidence();
  const circle = envReady(["KOBOLINK_FAN_PRIVATE_KEY", "KOBOLINK_CREATOR_ADDRESS"]);
  const flutterwave = getFlutterwaveConfigStatus();
  const settledLogs = paymentState.logs.filter(hasSettlementProof);
  const settledVerifiedFeedLogs = filterPaymentLogsForFeed(settledLogs, feed);
  const currentFeedPaymentState = { balances: balancesFromLogs(settledVerifiedFeedLogs) };
  const verifiedDeposit = findStrictVerifiedFlutterwaveDeposit(bridgeState.deposits, bridgeCheckoutProof, bridgeDepositProof);
  const strictAcceptedPayout = findStrictAcceptedFlutterwavePayout(bridgeState.withdrawals, bridgePayoutProof);
  const successfulPayout = isAcceptedPayoutBackedBySettledTips(strictAcceptedPayout, currentFeedPaymentState, bridgeState) ? strictAcceptedPayout : undefined;
  const payoutDetail = strictAcceptedPayout && !successfulPayout
    ? "Accepted Flutterwave payout exists, but it exceeds settled Arc/Circle/x402 creator earnings."
    : bridgePayoutProofDetail(successfulPayout, bridgePayoutProof);
  const arcEvidence = await readArcBalanceEvidence(day1, {
    live: options.liveArcBalance,
    reader: options.arcBalanceReader,
    addressResolver: options.arcAddressResolver,
  });
  const gatewayEvidence = await readGatewayEvidence({ budget, day1, options });
  const gatewayAvailable = gatewayEvidence.gatewayAvailableUsdc;
  const budgetBacked = Boolean(budget && gatewayEvidence.ok && gatewayAvailable >= budget.budgetUsdc && sameAddress(budget.fanAddress, gatewayEvidence.fanAddress));
  const x402Evidence = readX402ProofEvidence(day1);
  const excludedListingCount = Math.max(0, allListingRecords.length - feed.length);
  const listingInput = commandInputStatus("npm run proof:create-listing", () => parseRealListingEnv());
  const listingProof = liveListingProofEvidence(feed, realListingProof, listingInput);
  const tipProof = realTipProofEvidence(feed, settledVerifiedFeedLogs, realTipProof);
  const bridgeCheckoutInput = commandInputStatus("npm run proof:bridge-checkout", () => parseRealBridgeCheckoutEnv());
  const bridgeVerifyInput = commandInputStatus("npm run proof:bridge-verify", () => parseRealBridgeVerifyEnv());
  const bridgePayoutInput = commandInputStatus("npm run proof:bridge-payout", () => parseRealBridgePayoutEnv());

  const checks: RealModeCheck[] = [
    {
      id: "real-listings",
      label: "Creator-attached X listings available",
      ok: listingProof.ok,
      detail: listingProof.ok
        ? listingProof.detail
        : listingProof.detail +
          (excludedListingCount > 0 ? " " + excludedListingCount + " stored legacy listing row(s) are excluded because they are not strict creator-attached records." : ""),
    },
    {
      id: "no-seed-feed",
      label: "No shipped seed feed or X posting routes",
      ok: noSeedFeed.ok,
      detail: noSeedFeed.detail,
    },
    {
      id: "flutterwave-config",
      label: "Flutterwave sandbox API configured",
      ok: flutterwave.ready,
      detail: flutterwave.ready ? "Flutterwave sandbox keys are configured." : "Flutterwave sandbox keys are incomplete.",
    },
    {
      id: "flutterwave-deposit",
      label: "Verified Flutterwave Naira deposit",
      ok: Boolean(verifiedDeposit),
      detail: verifiedDeposit
        ? bridgeDepositProofDetail(verifiedDeposit, bridgeCheckoutProof, bridgeDepositProof)
        : appendInputDetail(bridgeDepositProofDetail(verifiedDeposit, bridgeCheckoutProof, bridgeDepositProof), bridgeCheckoutInput, bridgeVerifyInput),
    },
    {
      id: "flutterwave-payout",
      label: "Flutterwave Naira payout request accepted",
      ok: Boolean(successfulPayout),
      detail: successfulPayout
        ? payoutDetail
        : appendInputDetail(payoutDetail, bridgePayoutInput),
    },
    {
      id: "arc-balance",
      label: "Arc Testnet wallet balance proof",
      ok: arcEvidence.ok,
      detail: arcEvidence.ok
        ? arcEvidence.nativeUsdc + " native USDC on Arc chain " + arcEvidence.chainId + " for " + arcEvidence.address + " (" + arcEvidence.source + ")."
        : (arcEvidence.error ?? "Run npm run proof:arc-balance with a funded Arc wallet."),
    },
    {
      id: "gateway-balance",
      label: "Circle Gateway spendable balance",
      ok: gatewayEvidence.ok && gatewayAvailable > 0,
      detail: gatewayEvidence.ok
        ? gatewayAvailable > 0
          ? gatewayAvailable + " USDC available in Gateway (" + gatewayEvidence.source + ")."
          : "No spendable Gateway balance recorded (" + gatewayEvidence.source + ")."
        : "Gateway balance could not be read from " + gatewayEvidence.source + ": " + (gatewayEvidence.error ?? "unknown error") + ".",
    },
    {
      id: "fan-budget-backed",
      label: "Fan budget backed by Circle Gateway",
      ok: budgetBacked,
      detail: budget
        ? budgetBacked
          ? "Budget " + budget.budgetUsdc + " USDC is covered by " + gatewayAvailable + " USDC in Gateway."
          : "Budget " + budget.budgetUsdc + " USDC is not covered by " + gatewayAvailable + " USDC in Gateway."
        : "No fan budget is authorized.",
    },
    {
      id: "x402-proof",
      label: "x402/Circle settlement proof",
      ok: x402Evidence.ok,
      detail: x402Evidence.detail,
    },
    {
      id: "settled-tip-log",
      label: "Strict real tip proof for a creator-attached listing",
      ok: tipProof.ok,
      detail: tipProof.detail,
    },
    {
      id: "circle-env",
      label: "Circle/x402 wallet env configured",
      ok: circle.ok,
      detail: circle.ok ? "Fan signer and creator address are configured." : "Missing: " + circle.missing.join(", "),
    },
  ];

  const blockers = checks.filter((check) => !check.ok).map((check) => check.label + ": " + check.detail);
  return {
    generatedAt: now,
    ok: blockers.length === 0,
    checks,
    blockers,
  };
}

if (import.meta.url === "file:///" + process.argv[1]?.replace(/\\/g, "/")) {
  const readiness = await buildRealModeReadiness(new Date().toISOString(), { liveGateway: true, liveArcBalance: true });
  await mkdir("proofs", { recursive: true });
  await writeFile("proofs/real-mode-readiness.json", JSON.stringify(readiness, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(readiness, null, 2));
  if (!readiness.ok) process.exitCode = 1;
}
