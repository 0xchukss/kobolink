import { randomUUID } from "node:crypto";

import { config } from "../config/env.js";
import { ngnToUsdc } from "../utils/currency.js";
import { getFlutterwaveConfigStatus, type FlutterwaveConfigStatus } from "./config.js";

export type BridgeProviderMode = "real_flutterwave_sandbox" | "flutterwave_config_missing";
export type BridgeReceiptStatus =
  | "checkout_created"
  | "credit_applied"
  | "verification_failed"
  | "transfer_requested"
  | "transfer_successful"
  | "sandbox_config_missing"
  | "sandbox_api_error";

export type FlutterwaveCustomer = {
  email: string;
  name: string;
  phoneNumber?: string;
};

export type FlutterwaveDepositReceipt = {
  id: string;
  type: "deposit";
  provider: "flutterwave-sandbox";
  providerMode: BridgeProviderMode;
  status: BridgeReceiptStatus;
  amountNgn: number;
  usdcEquivalent: number;
  txRef: string;
  checkoutUrl?: string;
  transactionId?: string;
  creditedNgn: number;
  creditedUsdc: number;
  customer: FlutterwaveCustomer;
  responseStatus?: string;
  responseMessage?: string;
  rawResponse?: unknown;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type BridgeWithdrawalMode = "naira_payout";

export type BridgeWithdrawalReceipt = {
  id: string;
  type: "withdrawal";
  mode: BridgeWithdrawalMode;
  provider: "flutterwave-sandbox";
  providerMode: BridgeProviderMode;
  status: BridgeReceiptStatus;
  creatorHandle: string;
  amountNgn: number;
  usdcEquivalent: number;
  reference: string;
  bankCode?: string;
  accountNumber?: string;
  responseStatus?: string;
  responseMessage?: string;
  transferId?: string;
  rawResponse?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type FlutterwaveBridgeSnapshot = {
  configStatus: FlutterwaveConfigStatus;
  deposits: FlutterwaveDepositReceipt[];
  withdrawals: BridgeWithdrawalReceipt[];
  verifiedNairaBalance: number;
  verifiedUsdcEquivalent: number;
  proofBackedDepositIds: string[];
  rails: {
    nairaBridge: "Flutterwave sandbox";
    tipSettlement: "Arc/Circle/x402 USDC";
  };
  updatedAt: string;
};

type FlutterwaveResponse<T = Record<string, unknown>> = {
  status?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
};

type HttpClient = (url: string, init: RequestInit) => Promise<Response>;

type BridgeClientOptions = {
  fetch?: HttpClient;
  now?: string;
  secretKey?: string;
  publicKey?: string;
  encryptionKey?: string;
  baseUrl?: string;
};

export async function createFlutterwaveCheckoutDeposit(input: {
  amountNgn: number;
  customer: FlutterwaveCustomer;
  redirectUrl?: string;
}, options: BridgeClientOptions = {}): Promise<FlutterwaveDepositReceipt> {
  const now = options.now ?? new Date().toISOString();
  const amountNgn = positiveAmount(input.amountNgn);
  const txRef = `kobolink-deposit-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const customer = normalizeCustomer(input.customer);
  const baseReceipt: FlutterwaveDepositReceipt = {
    id: `fw-deposit-${randomUUID()}`,
    type: "deposit",
    provider: "flutterwave-sandbox",
    providerMode: "flutterwave_config_missing",
    status: "sandbox_config_missing",
    amountNgn,
    usdcEquivalent: ngnToUsdc(amountNgn, config.economics.ngnPerUsdc),
    txRef,
    creditedNgn: 0,
    creditedUsdc: 0,
    customer,
    createdAt: now,
    updatedAt: now,
  };

  const keys = keyStatus(options);
  if (!keys.ready) {
    throw new Error("Flutterwave sandbox keys are not configured. No real Flutterwave checkout was created.");
  }

  const payload = {
    tx_ref: txRef,
    amount: amountNgn,
    currency: "NGN",
    redirect_url: input.redirectUrl ?? "http://localhost:3000/api/bridge/deposit/callback",
    customer: {
      email: customer.email,
      name: customer.name,
      phonenumber: customer.phoneNumber,
    },
    customizations: {
      title: "KoboLink Naira budget top-up",
      description: "Flutterwave sandbox Naira bridge. Arc/Circle/x402 still settles creator tips in USDC.",
    },
    meta: {
      product: "kobolink",
      bridge_role: "naira_display_and_funding_layer",
    },
  };

  const response = await flutterwaveRequest<{ link?: string }>("/v3/payments", { method: "POST", body: payload }, options);
  const checkoutUrl = typeof response.data?.link === "string" ? response.data.link : undefined;

  return {
    ...baseReceipt,
    providerMode: "real_flutterwave_sandbox",
    status: response.ok && checkoutUrl ? "checkout_created" : "sandbox_api_error",
    checkoutUrl,
    responseStatus: response.payload.status,
    responseMessage: response.payload.message,
    rawResponse: sanitizeFlutterwavePayload(response.payload),
    updatedAt: now,
  };
}

export async function verifyFlutterwaveDeposit(input: {
  receipt: FlutterwaveDepositReceipt;
  transactionId: string;
}, options: BridgeClientOptions = {}): Promise<FlutterwaveDepositReceipt> {
  const now = options.now ?? new Date().toISOString();
  const transactionId = String(input.transactionId).trim();
  if (!transactionId) throw new Error("transactionId is required");

  const keys = keyStatus(options);
  if (!keys.ready) {
    throw new Error("Flutterwave sandbox keys are not configured. Deposit was not verified or credited.");
  }

  if (input.receipt.providerMode !== "real_flutterwave_sandbox" || input.receipt.status !== "checkout_created") {
    throw new Error("Only a real Flutterwave checkout receipt can be verified and credited.");
  }

  const response = await flutterwaveRequest<Record<string, unknown>>(`/v3/transactions/${encodeURIComponent(transactionId)}/verify`, { method: "GET" }, options);
  const data = response.payload.data as Record<string, unknown> | undefined;
  const verified = isSuccessfulFlutterwavePayment(data, input.receipt, transactionId);
  const creditedNgn = verified ? input.receipt.amountNgn : 0;

  return {
    ...input.receipt,
    providerMode: "real_flutterwave_sandbox",
    status: verified ? "credit_applied" : "verification_failed",
    transactionId,
    creditedNgn,
    creditedUsdc: verified ? input.receipt.usdcEquivalent : 0,
    responseStatus: response.payload.status,
    responseMessage: response.payload.message,
    rawResponse: sanitizeFlutterwavePayload(response.payload),
    verifiedAt: verified ? now : input.receipt.verifiedAt,
    updatedAt: now,
  };
}

export async function requestFlutterwaveNairaPayout(input: {
  creatorHandle: string;
  amountNgn: number;
  bankCode: string;
  accountNumber: string;
}, options: BridgeClientOptions = {}): Promise<BridgeWithdrawalReceipt> {
  const now = options.now ?? new Date().toISOString();
  const amountNgn = positiveAmount(input.amountNgn);
  const reference = `kobolink-payout-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const baseReceipt: BridgeWithdrawalReceipt = {
    id: `fw-withdraw-${randomUUID()}`,
    type: "withdrawal",
    mode: "naira_payout",
    provider: "flutterwave-sandbox",
    providerMode: "flutterwave_config_missing",
    status: "sandbox_config_missing",
    creatorHandle: normalizeHandle(input.creatorHandle),
    amountNgn,
    usdcEquivalent: ngnToUsdc(amountNgn, config.economics.ngnPerUsdc),
    reference,
    bankCode: normalizeBankCode(input.bankCode),
    accountNumber: normalizeAccountNumber(input.accountNumber),
    createdAt: now,
    updatedAt: now,
  };

  const keys = keyStatus(options);
  if (!keys.ready) {
    throw new Error("Flutterwave sandbox keys are not configured. No real Flutterwave payout request was sent.");
  }

  const response = await flutterwaveRequest<Record<string, unknown>>("/v3/transfers", {
    method: "POST",
    body: {
      account_bank: baseReceipt.bankCode,
      account_number: baseReceipt.accountNumber,
      amount: amountNgn,
      narration: `KoboLink creator withdrawal for ${baseReceipt.creatorHandle}`,
      currency: "NGN",
      reference,
      debit_currency: "NGN",
    },
  }, options);

  const transferData = response.payload.data as Record<string, unknown> | undefined;
  const transferStatus = String(transferData?.status ?? "").toLowerCase();
  const transferId = transferData?.id === undefined ? undefined : String(transferData.id);
  const successful = response.ok && ["success", "successful", "new", "pending"].some((value) => transferStatus.includes(value));

  return {
    ...baseReceipt,
    providerMode: "real_flutterwave_sandbox",
    status: successful ? (transferStatus.includes("success") ? "transfer_successful" : "transfer_requested") : "sandbox_api_error",
    transferId,
    responseStatus: response.payload.status,
    responseMessage: response.payload.message,
    rawResponse: sanitizeFlutterwavePayload(response.payload),
    updatedAt: now,
  };
}

export function isCreditedFlutterwaveDeposit(receipt: FlutterwaveDepositReceipt): boolean {
  return Boolean(
    receipt.provider === "flutterwave-sandbox" &&
      receipt.providerMode === "real_flutterwave_sandbox" &&
      receipt.status === "credit_applied" &&
      typeof receipt.transactionId === "string" &&
      /^\d+$/.test(receipt.transactionId.trim()) &&
      Boolean(receipt.verifiedAt) &&
      receipt.creditedNgn > 0 &&
      receipt.creditedUsdc > 0 &&
      String(receipt.responseStatus ?? "").toLowerCase() === "success",
  );
}

function keyStatus(options: BridgeClientOptions): FlutterwaveConfigStatus {
  return getFlutterwaveConfigStatus({
    FLUTTERWAVE_PUBLIC_KEY: options.publicKey ?? config.flutterwave.publicKey,
    FLUTTERWAVE_SECRET_KEY: options.secretKey ?? config.flutterwave.secretKey,
    FLUTTERWAVE_ENCRYPTION_KEY: options.encryptionKey ?? config.flutterwave.encryptionKey,
  });
}

async function flutterwaveRequest<T>(
  path: string,
  input: { method: "GET" | "POST"; body?: unknown },
  options: BridgeClientOptions,
): Promise<{ ok: boolean; status: number; payload: FlutterwaveResponse<T>; data?: T }> {
  const secretKey = options.secretKey ?? config.flutterwave.secretKey;
  if (!secretKey) throw new Error("FLUTTERWAVE_SECRET_KEY is required for sandbox API calls");

  const http = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.flutterwave.com";
  const response = await http(`${baseUrl}${path}`, {
    method: input.method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
    },
    body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
  });

  const payload = await response.json() as FlutterwaveResponse<T>;
  return {
    ok: response.ok && payload.status !== "error",
    status: response.status,
    payload,
    data: payload.data,
  };
}

function isSuccessfulFlutterwavePayment(data: Record<string, unknown> | undefined, receipt: FlutterwaveDepositReceipt, transactionId: string): boolean {
  if (!data) return false;
  const status = String(data.status ?? "").toLowerCase();
  const currency = String(data.currency ?? "").toUpperCase();
  const amount = Number(data.amount ?? 0);
  const txRef = String(data.tx_ref ?? "");
  const providerTransactionId = data.id === undefined ? "" : String(data.id);

  return (
    status === "successful" &&
    currency === "NGN" &&
    amount >= receipt.amountNgn &&
    txRef === receipt.txRef &&
    providerTransactionId === transactionId
  );
}

function normalizeCustomer(customer: FlutterwaveCustomer): FlutterwaveCustomer {
  if (!customer || typeof customer.email !== "string") throw new Error("customer.email is required for Flutterwave checkout");
  if (typeof customer.name !== "string") throw new Error("customer.name is required for Flutterwave checkout");
  const email = customer.email.trim();
  const name = customer.name.trim();
  const phoneNumber = customer.phoneNumber?.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("customer.email must be a valid email address");
  if (!name) throw new Error("customer.name is required for Flutterwave checkout");
  return {
    email,
    name,
    ...(phoneNumber ? { phoneNumber } : {}),
  };
}

function positiveAmount(value: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amountNgn must be positive");
  return amount;
}

function normalizeBankCode(value: string): string {
  const bankCode = value.trim();
  if (!/^\d{3}$/.test(bankCode)) throw new Error("bankCode must be a 3 digit Nigerian bank code");
  return bankCode;
}

function normalizeAccountNumber(value: string): string {
  const accountNumber = value.trim();
  if (!/^\d{10}$/.test(accountNumber)) throw new Error("accountNumber must be a 10 digit NUBAN account number");
  return accountNumber;
}

function normalizeHandle(handle: string): string {
  const normalized = handle.trim().startsWith("@") ? handle.trim() : `@${handle.trim()}`;
  if (!/^@[A-Za-z0-9_]{1,15}$/.test(normalized)) throw new Error("invalid creator handle");
  return normalized;
}
function sanitizeFlutterwavePayload(payload: FlutterwaveResponse<Record<string, unknown>>): unknown {
  const data = payload.data as Record<string, unknown> | null | undefined;
  const sanitized: Record<string, unknown> = {
    status: payload.status,
    message: payload.message,
  };

  if (!data || typeof data !== "object") {
    sanitized.data = data ?? null;
    return sanitized;
  }

  const card = data.card as Record<string, unknown> | undefined;
  sanitized.data = {
    id: data.id,
    tx_ref: data.tx_ref,
    flw_ref: data.flw_ref,
    amount: data.amount,
    currency: data.currency,
    charged_amount: data.charged_amount,
    app_fee: data.app_fee,
    processor_response: data.processor_response,
    auth_model: data.auth_model,
    status: data.status,
    payment_type: data.payment_type,
    created_at: data.created_at,
    amount_settled: data.amount_settled,
    reference: data.reference,
    complete_message: data.complete_message,
    card: card
      ? {
          first_6digits: card.first_6digits,
          last_4digits: card.last_4digits,
          issuer: card.issuer,
          country: card.country,
          type: card.type,
          expiry: card.expiry,
        }
      : undefined,
    meta: data.meta,
  };

  return sanitized;
}