import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { balancesFromLogs, hasSettlementProof, type CreatorBalance, type FeedItem, type PaymentLog } from "./tips.js";

const fallbackPath = "data/payment-logs.jsonl";

export type PaymentState = {
  logs: PaymentLog[];
  balances: CreatorBalance[];
};

export async function appendPaymentLog(log: PaymentLog, path?: string): Promise<void> {
  const resolvedPath = resolvePaymentLogPath(path);
  await mkdir(/* turbopackIgnore: true */ dirname(resolvedPath), { recursive: true });
  await appendFile(/* turbopackIgnore: true */ resolvedPath, `${JSON.stringify(log)}\n`, "utf8");
}

export async function readPaymentLogs(path?: string): Promise<PaymentLog[]> {
  try {
    const rows = await readFile(/* turbopackIgnore: true */ resolvePaymentLogPath(path), "utf8");
    return rows.trim() ? rows.trim().split("\n").map((row) => JSON.parse(row) as PaymentLog) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function readPaymentState(path?: string): Promise<PaymentState> {
  const logs = (await readPaymentLogs(path)).filter(isCurrentPaymentLog);
  return paymentStateFromLogs(logs);
}

export async function readPaymentStateForFeed(feed: FeedItem[], path?: string): Promise<PaymentState> {
  const logs = (await readPaymentLogs(path)).filter(isCurrentPaymentLog);
  return paymentStateFromLogs(filterPaymentLogsForFeed(logs, feed));
}

export function filterPaymentLogsForFeed(logs: PaymentLog[], feed: FeedItem[]): PaymentLog[] {
  const itemsByListingId = new Map(feed.map((item) => [item.id, item]));
  return logs.filter((log) => {
    const item = itemsByListingId.get(log.contentId);
    return Boolean(item && logMatchesFeedItem(log, item));
  });
}

function logMatchesFeedItem(log: PaymentLog, item: FeedItem): boolean {
  return (
    log.contentId === item.id &&
    log.creatorId === item.creator.id &&
    log.creatorHandle.toLowerCase() === item.creator.xHandle.toLowerCase() &&
    log.contentTitle === item.title &&
    log.amountNgn === item.suggestedTipNgn &&
    Number(log.amountUsdc).toFixed(6) === item.suggestedTipUsdc.toFixed(6) &&
    log.x402PaymentUrl === `/x402/pay/${item.id}` &&
    sameAddress(log.payTo, item.creator.walletAddress)
  );
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function paymentStateFromLogs(logs: PaymentLog[]): PaymentState {
  return {
    logs: [...logs].reverse(),
    balances: balancesFromLogs(logs),
  };
}

export function isCurrentPaymentLog(log: PaymentLog): boolean {
  if (log.status !== "settled") return Boolean(log.createdAt);
  return hasSettlementProof(log) && Boolean(log.createdAt) && Boolean(log.paymentReceipt || log.explorerUrl);
}

function resolvePaymentLogPath(path?: string): string {
  return path ?? process.env.KOBOLINK_PAYMENT_LOG ?? fallbackPath;
}