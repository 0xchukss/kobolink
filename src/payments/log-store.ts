import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ensureKobolinkSchema, getSql, jsonb, postgresEnabled } from "../db/postgres.js";
import { balancesFromLogs, hasSettlementProof, type CreatorBalance, type FeedItem, type PaymentLog } from "./tips.js";

const fallbackPath = "data/payment-logs.jsonl";

export type PaymentState = {
  logs: PaymentLog[];
  balances: CreatorBalance[];
};

export async function appendPaymentLog(log: PaymentLog, path?: string): Promise<void> {
  if (!path && postgresEnabled()) {
    await appendPostgresPaymentLog(log);
    return;
  }

  const resolvedPath = resolvePaymentLogPath(path);
  await mkdir(/* turbopackIgnore: true */ dirname(resolvedPath), { recursive: true });
  await appendFile(/* turbopackIgnore: true */ resolvedPath, `${JSON.stringify(log)}\n`, "utf8");
}

export async function readPaymentLogs(path?: string): Promise<PaymentLog[]> {
  if (!path && postgresEnabled()) return readPostgresPaymentLogs();

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

async function appendPostgresPaymentLog(log: PaymentLog): Promise<void> {
  await ensureKobolinkSchema();
  const sql = getSql();
  await sql`
    insert into kobolink_payment_logs (id, log, settled_at, created_at)
    values (${log.id}, ${jsonb(log)}::jsonb, ${log.settledAt ?? null}, ${log.createdAt})
    on conflict (id)
    do update set log = excluded.log, settled_at = excluded.settled_at
  `;
}

async function readPostgresPaymentLogs(): Promise<PaymentLog[]> {
  await ensureKobolinkSchema();
  const sql = getSql();
  const rows = (await sql`
    select log
    from kobolink_payment_logs
    order by created_at asc
  `) as Array<{ log: PaymentLog }>;
  return rows.map((row) => row.log);
}

function resolvePaymentLogPath(path?: string): string {
  return path ?? process.env.KOBOLINK_PAYMENT_LOG ?? fallbackPath;
}