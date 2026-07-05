import { mkdir, readFile, writeFile } from "node:fs/promises";

import { readFanBudget, readFanBudgetForOwner } from "../budgets/budget-store.js";
import { readFanGatewayBalance, readGatewayBalanceForPrivateKey } from "../budgets/gateway-balance.js";
import type { FanBudget, GatewayBalanceSnapshot } from "../budgets/fan-budget.js";
import { ensureUserAgentWallet } from "../agents/user-agent-wallets.js";

import type { BridgeWithdrawalReceipt, FlutterwaveDepositReceipt } from "../flutterwave/bridge.js";
import { isAcceptedPayoutBackedBySettledTips } from "../flutterwave/withdrawal-guard.js";
import { readBridgeState } from "../flutterwave/bridge-store.js";
import { readPublicCreatorFeed } from "../creator/listing-store.js";
import { filterPaymentLogsForFeed, readPaymentState } from "../payments/log-store.js";
import { balancesFromLogs, hasSettlementProof, type PaymentLog } from "../payments/tips.js";
import type { RealTipProof } from "../payments/real-tip-proof.js";
import { formatNaira, formatUsdc } from "../utils/currency.js";
import { bridgeDepositProofDetail, bridgePayoutProofDetail, findStrictAcceptedFlutterwavePayout, findStrictVerifiedFlutterwaveDeposit, isAcceptedFlutterwavePayoutStatus, type StrictBridgeCheckoutProof, type StrictBridgeDepositProof, type StrictBridgePayoutProof } from "./bridge-proof-evidence.js";
import { readX402ProofEvidence } from "./day1-evidence.js";
import { realTipProofEvidence } from "./real-mode-readiness.js";

export type ProofStatus = "passed" | "warning" | "missing";

export type ProofCenterItem = {
  id: string;
  title: string;
  status: ProofStatus;
  rail: "Arc Testnet" | "Circle x402" | "Agent" | "Fan Budget" | "Flutterwave Sandbox" | "Creator Feed";
  summary: string;
  proof?: string;
  href?: string;
  recordedAt?: string;
  source: string;
};

export type ProofCenterOptions = {
  liveGateway?: boolean;
  gatewayReader?: (requiredBudgetUsdc: number) => Promise<GatewayBalanceSnapshot>;
  realTipProofPath?: string;
  day5ProofPath?: string;
  bridgeCheckoutProofPath?: string;
  bridgeDepositProofPath?: string;
  bridgePayoutProofPath?: string;
  owner?: string;
};

type GatewayEvidence = {
  ok: boolean;
  source: string;
  fanAddress?: string;
  gatewayAvailableUsdc: number;
  error?: string;
};

export type ProofCenterSnapshot = {
  generatedAt: string;
  success: boolean;
  summary: {
    creatorCount: number;
    listingCount: number;
    settledPaymentCount: number;
    agentTipCount: number;
    uniqueAgentProofCount: number;
    creditedNairaBalance: number;
    creditedUsdcBalance: number;
    flutterwaveDepositStatus: string;
    flutterwavePayoutStatus: string;
    fanBudgetStatus: string;
    gatewayBalanceStatus: string;
    gatewayBalanceSource: string;
    strictTipProofStatus: string;
  };
  items: ProofCenterItem[];
  caveats: string[];
};

type Day1Proof = {
  updatedAt?: string;
  arcBalance?: {
    ok?: boolean;
    address?: string;
    gateway?: { gatewayAvailableUsdc?: string };
  };
  arcTransfer?: {
    ok?: boolean;
    amountUsdc?: string;
    transactionHash?: string;
    explorerUrl?: string;
    recordedAt?: string;
  };
  x402Payment?: {
    ok?: boolean;
    challengeStatus?: number;
    payment?: {
      status?: number;
      transaction?: string;
    };
    recordedAt?: string;
  };
};

type Day5Proof = {
  recordedAt?: string;
  success?: boolean;
  targetTipCount?: number;
  uniqueProofCount?: number;
  tipped?: Array<{
    creatorHandle?: string;
    listingId?: string;
    amountNgn?: number;
    amountUsdc?: number;
    transactionHash?: string;
    explorerUrl?: string;
    paymentReceipt?: string;
    receiptUrl?: string;
    network?: string;
    x402PaymentUrl?: string;
    payTo?: string;
  }>;
  ledger?: {
    spentNgn?: number;
    spentUsdc?: number;
    remainingNgn?: number;
    remainingUsdc?: number;
  };
};

export async function readProofCenterSnapshot(now = new Date().toISOString(), options: ProofCenterOptions = {}): Promise<ProofCenterSnapshot> {
  const [feed, paymentState, bridgeState, budget, day1, day5, bridgeCheckoutProof, bridgeDepositProof, bridgePayoutProof, realTipProof] = await Promise.all([
    readPublicCreatorFeed(),
    readPaymentState(),
    readBridgeState(),
    options.owner ? readFanBudgetForOwner(options.owner) : readFanBudget(),
    readJsonIfExists<Day1Proof>("proofs/day1.json"),
    readJsonIfExists<Day5Proof>(options.day5ProofPath ?? "proofs/day5.json"),
    readJsonIfExists<StrictBridgeCheckoutProof>(options.bridgeCheckoutProofPath ?? "proofs/real-bridge-checkout.json"),
    readJsonIfExists<StrictBridgeDepositProof>(options.bridgeDepositProofPath ?? "proofs/real-bridge-deposit.json"),
    readJsonIfExists<StrictBridgePayoutProof>(options.bridgePayoutProofPath ?? "proofs/real-bridge-payout.json"),
    readJsonIfExists<RealTipProof>(options.realTipProofPath ?? "proofs/real-tip.json"),
  ]);

  const creatorCount = new Set(feed.map((item) => item.creator.id)).size;
  const settledLogs = filterPaymentLogsForFeed(paymentState.logs.filter(hasSettlementProof), feed);
  const currentFeedPaymentState = { balances: balancesFromLogs(settledLogs) };
  const strictTipProof = realTipProofEvidence(feed, settledLogs, realTipProof);
  const verifiedDeposit = findStrictVerifiedFlutterwaveDeposit(bridgeState.deposits, bridgeCheckoutProof, bridgeDepositProof);
  const latestStoredPayout = bridgeState.withdrawals.find((entry) => entry.mode === "naira_payout");
  const strictAcceptedPayout = findStrictAcceptedFlutterwavePayout(bridgeState.withdrawals, bridgePayoutProof);
  const latestPayout = isAcceptedPayoutBackedBySettledTips(strictAcceptedPayout, currentFeedPaymentState, bridgeState) ? strictAcceptedPayout : undefined;
  const payoutDetail = strictAcceptedPayout && !latestPayout
    ? "Accepted Flutterwave payout exists, but it exceeds settled Arc/Circle/x402 creator earnings."
    : bridgePayoutProofDetail(latestPayout, bridgePayoutProof);

  const agentTips = day5?.tipped ?? [];
  const verifiedAgentTipLogs = matchAgentTipsToVerifiedLogs(agentTips, settledLogs);
  const agentUniqueProofs = new Set(verifiedAgentTipLogs.map(proofIdFromLog).filter(Boolean)).size;
  const creditedNairaBalance = verifiedDeposit?.creditedNgn ?? 0;
  const creditedUsdcBalance = verifiedDeposit?.creditedUsdc ?? 0;
  const payoutStatus = latestPayout?.status ?? (bridgePayoutProof?.success === false ? "proof_failed" : "missing");
  const gatewayEvidence = await readGatewayEvidence({ budget, day1, options });
  const gatewayAvailable = gatewayEvidence.gatewayAvailableUsdc;
  const budgetBacked = Boolean(budget && gatewayEvidence.ok && gatewayAvailable >= budget.budgetUsdc && sameAddress(budget.fanAddress, gatewayEvidence.fanAddress));

  const items: ProofCenterItem[] = [
    day1ArcItem(day1),
    day1X402Item(day1),
    strictTipProofItem(strictTipProof, realTipProof),
    fanBudgetItem(budget, gatewayEvidence, budgetBacked),
    agentItem(day5, verifiedAgentTipLogs, agentUniqueProofs),
    flutterwaveDepositItem(verifiedDeposit, bridgeCheckoutProof, bridgeDepositProof),
    flutterwavePayoutItem(latestPayout, bridgePayoutProof, payoutDetail),
    {
      id: "creator-feed",
      title: "Creator-attached X feed",
      status: creatorCount >= 1 && feed.length >= 1 ? "passed" : "missing",
      rail: "Creator Feed",
      summary: `${creatorCount} creators and ${feed.length} creator-attached X listings are available as payment targets.`,
      proof: `${creatorCount} creators / ${feed.length} listings`,
      recordedAt: now,
      source: "data/creator-listings.json",
    },
  ];

  const caveats = [
    "Flutterwave is a sandbox Naira bridge only; creator tips settle through Arc/Circle/x402 as USDC.",
  ];

  if (latestStoredPayout?.status === "sandbox_api_error") {
    caveats.push("Flutterwave sandbox payout reached /v3/transfers but requires IP whitelisting before a successful Naira transfer.");
  }

  return {
    generatedAt: now,
    success: items.every((item) => item.status === "passed"),
    summary: {
      creatorCount,
      listingCount: feed.length,
      settledPaymentCount: settledLogs.length,
      agentTipCount: verifiedAgentTipLogs.length,
      uniqueAgentProofCount: agentUniqueProofs,
      creditedNairaBalance,
      creditedUsdcBalance,
      flutterwaveDepositStatus: verifiedDeposit?.status ?? "missing",
      flutterwavePayoutStatus: payoutStatus,
      fanBudgetStatus: budgetBacked ? "backed" : budget ? "underfunded" : "missing",
      gatewayBalanceStatus: gatewayEvidence.ok ? "read" : "unavailable",
      gatewayBalanceSource: gatewayEvidence.source,
      strictTipProofStatus: strictTipProof.ok ? "verified" : "missing",
    },
    items,
    caveats,
  };
}

export async function writeDay7Proof(path = "proofs/day7.json", options: ProofCenterOptions = {}): Promise<ProofCenterSnapshot> {
  const snapshot = await readProofCenterSnapshot(new Date().toISOString(), options);
  await mkdir(/* turbopackIgnore: true */ "proofs", { recursive: true });
  await writeFile(/* turbopackIgnore: true */ path, `${JSON.stringify({ project: "KoboLink", phase: "real-testnet-proof-package", ...snapshot }, null, 2)}\n`, "utf8");
  return snapshot;
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

async function readGatewayEvidence(args: { budget: FanBudget | null; day1?: Day1Proof; options: ProofCenterOptions }): Promise<GatewayEvidence> {
  if (args.options.liveGateway) {
    try {
      if (args.options.owner) {
        const agentWallet = await ensureUserAgentWallet(args.options.owner);
        const wallet = await readGatewayBalanceForPrivateKey(agentWallet.privateKey, args.budget?.budgetUsdc ?? 0);
        return {
          ok: true,
          source: "live Circle Gateway (Agent Wallet)",
          fanAddress: wallet.fanAddress,
          gatewayAvailableUsdc: wallet.gatewayAvailableUsdc,
        };
      }

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

function day1ArcItem(day1?: Day1Proof): ProofCenterItem {
  const txHash = day1?.arcTransfer?.transactionHash;
  return {
    id: "arc-transfer",
    title: "Arc Testnet wallet transfer",
    status: day1?.arcTransfer?.ok && txHash ? "passed" : "missing",
    rail: "Arc Testnet",
    summary: txHash ? `${day1?.arcTransfer?.amountUsdc ?? "0"} USDC transfer settled on Arc Testnet.` : "Arc transfer proof is missing.",
    proof: txHash,
    href: day1?.arcTransfer?.explorerUrl,
    recordedAt: day1?.arcTransfer?.recordedAt ?? day1?.updatedAt,
    source: "proofs/day1.json",
  };
}

function day1X402Item(day1?: Day1Proof): ProofCenterItem {
  const evidence = readX402ProofEvidence(day1);

  return {
    id: "x402-settlement",
    title: "x402 challenge and Circle settlement",
    status: evidence.ok ? "passed" : "missing",
    rail: "Circle x402",
    summary: evidence.ok ? evidence.detail : evidence.detail,
    proof: evidence.transaction,
    recordedAt: day1?.x402Payment?.recordedAt ?? day1?.updatedAt,
    source: evidence.source,
  };
}

function strictTipProofItem(evidence: { ok: boolean; detail: string }, proof: RealTipProof | undefined): ProofCenterItem {
  const settlement = proof?.settlement;
  return {
    id: "strict-tip-proof",
    title: "Strict creator tip proof",
    status: evidence.ok ? "passed" : "missing",
    rail: settlement?.network === "eip155:5042002" ? "Circle x402" : "Arc Testnet",
    summary: evidence.detail,
    proof: settlement?.paymentReceipt ?? settlement?.transactionHash ?? settlement?.logId,
    href: settlement?.receiptUrl ?? settlement?.explorerUrl,
    recordedAt: settlement?.settledAt ?? proof?.recordedAt,
    source: "proofs/real-tip.json + data/payment-logs.jsonl",
  };
}

function matchAgentTipsToVerifiedLogs(tips: NonNullable<Day5Proof["tipped"]>, logs: PaymentLog[]): PaymentLog[] {
  const matched: PaymentLog[] = [];
  const seenProofIds = new Set<string>();

  for (const tip of tips) {
    const log = logs.find((candidate) => tipMatchesVerifiedLog(tip, candidate));
    const proofId = log ? proofIdFromLog(log) : undefined;
    if (!log || !proofId || seenProofIds.has(proofId)) continue;
    matched.push(log);
    seenProofIds.add(proofId);
  }

  return matched;
}

function tipMatchesVerifiedLog(tip: NonNullable<Day5Proof["tipped"]>[number], log: PaymentLog): boolean {
  const tipProofId = tip.paymentReceipt ?? tip.transactionHash;
  const logProofId = proofIdFromLog(log);

  return Boolean(
    tip.listingId &&
      tip.creatorHandle &&
      tipProofId &&
      logProofId &&
      log.contentId === tip.listingId &&
      log.creatorHandle.toLowerCase() === tip.creatorHandle.toLowerCase() &&
      log.amountNgn === tip.amountNgn &&
      Number(log.amountUsdc).toFixed(6) === Number(tip.amountUsdc).toFixed(6) &&
      logProofId === tipProofId &&
      Boolean(tip.network && log.network && log.network.toLowerCase() === tip.network.toLowerCase()) &&
      Boolean(tip.x402PaymentUrl && log.x402PaymentUrl === tip.x402PaymentUrl) &&
      Boolean(tip.payTo && log.payTo && tip.payTo.toLowerCase() === log.payTo.toLowerCase()),
  );
}

function proofIdFromLog(log: PaymentLog): string | undefined {
  return log.paymentReceipt ?? log.transactionHash;
}

function fanBudgetItem(budget: FanBudget | null, gateway: GatewayEvidence, backed: boolean): ProofCenterItem {
  return {
    id: "fan-budget-backed",
    title: "Authorized fan budget",
    status: backed ? "passed" : "missing",
    rail: "Fan Budget",
    summary: budget
      ? gateway.ok
        ? backed
          ? `${formatNaira(budget.budgetNgn)} / ${formatUsdc(budget.budgetUsdc)} authorized and covered by ${formatUsdc(gateway.gatewayAvailableUsdc)} in Circle Gateway.`
          : `${formatNaira(budget.budgetNgn)} / ${formatUsdc(budget.budgetUsdc)} is not covered by ${formatUsdc(gateway.gatewayAvailableUsdc)} in Circle Gateway.`
        : `Gateway balance could not be read: ${gateway.error ?? "unknown error"}.`
      : "No fan budget is authorized.",
    proof: budget?.id,
    recordedAt: budget?.updatedAt ?? budget?.createdAt,
    source: "data/fan-budget.json + " + gateway.source,
  };
}

function agentItem(day5: Day5Proof | undefined, verifiedTips: PaymentLog[], uniqueProofs: number): ProofCenterItem {
  const verifiedTipCount = verifiedTips.length;
  const spentNgn = verifiedTips.reduce((total, tip) => total + (tip.amountNgn ?? 0), 0);
  const spentUsdc = Number(verifiedTips.reduce((total, tip) => total + (tip.amountUsdc ?? 0), 0).toFixed(6));

  return {
    id: "agent-run",
    title: "Autonomous agent payment run",
    status: day5?.success && verifiedTipCount >= 3 && uniqueProofs >= 3 ? "passed" : "missing",
    rail: "Agent",
    summary: `${verifiedTipCount} verified creator tips, ${uniqueProofs} unique proofs, ${formatNaira(spentNgn)} / ${formatUsdc(spentUsdc)} spent.`,
    proof: `${uniqueProofs} unique x402 proofs`,
    recordedAt: day5?.recordedAt,
    source: "proofs/day5.json + data/payment-logs.jsonl",
  };
}

function flutterwaveDepositItem(currentDeposit: FlutterwaveDepositReceipt | undefined, checkoutProof: StrictBridgeCheckoutProof | undefined, proof: StrictBridgeDepositProof | undefined): ProofCenterItem {
  const passed = Boolean(currentDeposit);
  const amountNgn = currentDeposit?.creditedNgn ?? 0;
  const amountUsdc = currentDeposit?.creditedUsdc ?? 0;

  return {
    id: "flutterwave-deposit",
    title: "Flutterwave sandbox Naira deposit",
    status: passed ? "passed" : "missing",
    rail: "Flutterwave Sandbox",
    summary: passed
      ? `${formatNaira(amountNgn)} verified and credited as ${formatUsdc(amountUsdc)} verified balance.`
      : bridgeDepositProofDetail(currentDeposit, checkoutProof, proof),
    proof: currentDeposit?.transactionId,
    href: currentDeposit?.checkoutUrl,
    recordedAt: currentDeposit?.verifiedAt ?? currentDeposit?.updatedAt,
    source: "proofs/real-bridge-checkout.json + proofs/real-bridge-deposit.json + data/flutterwave-bridge.json",
  };
}

function flutterwavePayoutItem(currentPayout: BridgeWithdrawalReceipt | undefined, proof: StrictBridgePayoutProof | undefined, detail: string): ProofCenterItem {
  const accepted = isAcceptedFlutterwavePayoutStatus(currentPayout?.status);
  const warning = proof?.success === false;

  return {
    id: "flutterwave-payout",
    title: "Flutterwave sandbox Naira payout request",
    status: accepted ? "passed" : warning ? "warning" : "missing",
    rail: "Flutterwave Sandbox",
    summary: accepted
      ? currentPayout?.responseMessage ?? `${currentPayout?.status} / ${currentPayout?.reference}`
      : detail,
    proof: currentPayout?.reference,
    recordedAt: currentPayout?.updatedAt ?? currentPayout?.createdAt,
    source: "proofs/real-bridge-payout.json + data/flutterwave-bridge.json",
  };
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
