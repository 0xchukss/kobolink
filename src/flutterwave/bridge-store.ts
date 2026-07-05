import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getFlutterwaveConfigStatus } from "./config.js";
import { isCreditedFlutterwaveDeposit, type BridgeWithdrawalReceipt, type FlutterwaveBridgeSnapshot, type FlutterwaveDepositReceipt } from "./bridge.js";
import { ensureKobolinkSchema, getSql, jsonb, postgresEnabled } from "../db/postgres.js";
import { localStoreDir } from "../config/env.js";
import { findStrictVerifiedFlutterwaveDeposit, type StrictBridgeCheckoutProof, type StrictBridgeDepositProof } from "../proofs/bridge-proof-evidence.js";

const fallbackPath = localStoreDir + "/flutterwave-bridge.json";

type BridgeFileState = {
  deposits: FlutterwaveDepositReceipt[];
  withdrawals: BridgeWithdrawalReceipt[];
  updatedAt: string;
};

export async function readBridgeState(path?: string): Promise<FlutterwaveBridgeSnapshot> {
  const state = await readBridgeFile(path);
  const proofBackedDeposits = !path && postgresEnabled()
    ? state.deposits.filter(isCreditedFlutterwaveDeposit)
    : compact([await readStrictVerifiedDeposit(state.deposits, path)]);
  return toSnapshot(state, proofBackedDeposits);
}

export async function upsertDepositReceipt(receipt: FlutterwaveDepositReceipt, path?: string): Promise<FlutterwaveBridgeSnapshot> {
  const state = await readBridgeFile(path);
  const deposits = [receipt, ...state.deposits.filter((item) => item.id !== receipt.id)];
  const next = { ...state, deposits, updatedAt: new Date().toISOString() };
  await writeBridgeFile(next, path);
  return readBridgeState(path);
}

export async function upsertWithdrawalReceipt(receipt: BridgeWithdrawalReceipt, path?: string): Promise<FlutterwaveBridgeSnapshot> {
  if (receipt.providerMode !== "real_flutterwave_sandbox") {
    throw new Error("Only real Flutterwave sandbox payout receipts can be stored.");
  }
  const state = await readBridgeFile(path);
  const withdrawals = [receipt, ...state.withdrawals.filter((item) => item.id !== receipt.id)];
  const next = { ...state, withdrawals, updatedAt: new Date().toISOString() };
  await writeBridgeFile(next, path);
  return readBridgeState(path);
}

export async function findDepositReceipt(id: string, path?: string): Promise<FlutterwaveDepositReceipt | undefined> {
  const state = await readBridgeFile(path);
  return state.deposits.find((receipt) => receipt.id === id);
}

export function publicBridgeSnapshot(snapshot: FlutterwaveBridgeSnapshot): FlutterwaveBridgeSnapshot {
  return {
    ...snapshot,
    deposits: snapshot.deposits.map(publicDepositReceipt),
    withdrawals: snapshot.withdrawals.map(publicWithdrawalReceipt),
  };
}

export function publicDepositReceipt(receipt: FlutterwaveDepositReceipt): FlutterwaveDepositReceipt {
  return {
    ...receipt,
    customer: {
      email: maskEmail(receipt.customer.email),
      name: receipt.customer.name,
      phoneNumber: receipt.customer.phoneNumber ? maskPhone(receipt.customer.phoneNumber) : undefined,
    },
    rawResponse: undefined,
  };
}

export function publicWithdrawalReceipt(receipt: BridgeWithdrawalReceipt): BridgeWithdrawalReceipt {
  return {
    ...receipt,
    accountNumber: receipt.accountNumber ? maskAccountNumber(receipt.accountNumber) : undefined,
    rawResponse: undefined,
  };
}

async function readBridgeFile(path?: string): Promise<BridgeFileState> {
  if (!path && postgresEnabled()) return readPostgresBridgeState();

  try {
    const raw = await readFile(/* turbopackIgnore: true */ resolveBridgePath(path), "utf8");
    const parsed = JSON.parse(raw) as BridgeFileState;
    return normalizeBridgeState(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyBridgeState();
    }
    throw error;
  }
}

async function writeBridgeFile(state: BridgeFileState, path?: string): Promise<void> {
  if (!path && postgresEnabled()) {
    await writePostgresBridgeState(state);
    return;
  }

  const resolvedPath = resolveBridgePath(path);
  await mkdir(/* turbopackIgnore: true */ dirname(resolvedPath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ resolvedPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function toSnapshot(state: BridgeFileState, proofBackedDeposits: FlutterwaveDepositReceipt[]): FlutterwaveBridgeSnapshot {
  const verifiedNairaBalance = proofBackedDeposits.reduce((total, deposit) => total + deposit.creditedNgn, 0);
  const verifiedUsdcEquivalent = Number(proofBackedDeposits.reduce((total, deposit) => total + deposit.creditedUsdc, 0).toFixed(6));

  return {
    configStatus: getFlutterwaveConfigStatus(),
    deposits: state.deposits,
    withdrawals: state.withdrawals,
    verifiedNairaBalance,
    verifiedUsdcEquivalent,
    proofBackedDepositIds: proofBackedDeposits.map((deposit) => deposit.id),
    rails: {
      nairaBridge: "Flutterwave sandbox",
      tipSettlement: "Arc/Circle/x402 USDC",
    },
    updatedAt: state.updatedAt,
  };
}

async function readStrictVerifiedDeposit(deposits: FlutterwaveDepositReceipt[], path?: string): Promise<FlutterwaveDepositReceipt | undefined> {
  const [checkoutProof, depositProof] = await Promise.all([
    readJsonIfExists<StrictBridgeCheckoutProof>(resolveProofPath("real-bridge-checkout.json", path)),
    readJsonIfExists<StrictBridgeDepositProof>(resolveProofPath("real-bridge-deposit.json", path)),
  ]);
  return findStrictVerifiedFlutterwaveDeposit(deposits, checkoutProof, depositProof);
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function resolveProofPath(filename: string, bridgePath?: string): string {
  if (bridgePath) return join(dirname(resolveBridgePath(bridgePath)), filename);
  return join("proofs", filename);
}

async function readPostgresBridgeState(): Promise<BridgeFileState> {
  await ensureKobolinkSchema();
  const sql = getSql();
  const rows = (await sql`
    select state
    from kobolink_flutterwave_bridge
    where id = ${"default"}
    limit 1
  `) as Array<{ state: BridgeFileState }>;
  return rows[0]?.state ? normalizeBridgeState(rows[0].state) : emptyBridgeState();
}

async function writePostgresBridgeState(state: BridgeFileState): Promise<void> {
  await ensureKobolinkSchema();
  const sql = getSql();
  await sql`
    insert into kobolink_flutterwave_bridge (id, state, updated_at)
    values (${"default"}, ${jsonb(state)}::jsonb, now())
    on conflict (id)
    do update set state = excluded.state, updated_at = now()
  `;
}

function normalizeBridgeState(state: BridgeFileState): BridgeFileState {
  return {
    deposits: Array.isArray(state.deposits) ? state.deposits : [],
    withdrawals: Array.isArray(state.withdrawals) ? state.withdrawals.filter(isRealFlutterwaveWithdrawal) : [],
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}

function emptyBridgeState(): BridgeFileState {
  return { deposits: [], withdrawals: [], updatedAt: new Date().toISOString() };
}

function compact<T>(items: Array<T | undefined>): T[] {
  return items.filter((item): item is T => item !== undefined);
}

function isRealFlutterwaveWithdrawal(receipt: BridgeWithdrawalReceipt): boolean {
  return receipt.provider === "flutterwave-sandbox" && receipt.providerMode === "real_flutterwave_sandbox" && receipt.mode === "naira_payout";
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "masked";
  return (name.length <= 2 ? name[0] ?? "x" : name.slice(0, 2)) + "***@" + domain;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return "***" + digits.slice(-4);
}

function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return "****" + digits.slice(-4);
}

function resolveBridgePath(path?: string): string {
  return path ?? process.env.KOBOLINK_BRIDGE_STORE ?? fallbackPath;
}