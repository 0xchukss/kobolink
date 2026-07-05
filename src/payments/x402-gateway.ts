import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { parseUnits, type Hex } from "viem";

import { config } from "../config/env.js";
import { getFanPrivateKey, makeGatewayClient } from "../proofs/env-wallets.js";
import { appendPaymentLog } from "./log-store.js";
import { findListing } from "./testnet-app.js";
import { failTip, settleVerifiedTip, type FeedItem, type PaymentLog } from "./tips.js";

type SupportedKind = {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: {
    verifyingContract?: string;
    assets?: Array<{ symbol: string; address: string }>;
    [key: string]: unknown;
  };
};

export type PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

export type PaymentPayload = {
  x402Version: number;
  accepted?: Partial<PaymentRequirements>;
  payload: Record<string, unknown>;
  [key: string]: unknown;
};

type SettleResult = {
  success?: boolean;
  errorReason?: string;
  payer?: string;
  transaction?: string;
  network?: string;
  [key: string]: unknown;
};

type VerifyResult = {
  isValid?: boolean;
  invalidReason?: string;
  payer?: string;
  [key: string]: unknown;
};

export type FanTipResult = {
  ok: true;
  listingId: string;
  fanAddress: string;
  log: PaymentLog;
  payment: {
    amountAtomic: string;
    formattedAmount: string;
    status: number;
    transaction: string;
  };
  balances: {
    beforeGatewayAvailableUsdc: string;
    afterGatewayAvailableUsdc: string;
  };
};

export type ProtectedTipResponse = {
  ok: boolean;
  log?: PaymentLog;
  listing?: {
    id: string;
    creatorHandle: string;
    contentTitle: string;
  };
  error?: string;
};

const x402MaxTimeoutSeconds = Number(process.env.X402_MAX_TIMEOUT_SECONDS ?? 610000);

let facilitator: BatchFacilitatorClient | undefined;
let supportedKind: Promise<SupportedKind> | undefined;

export async function runFanTip(listingId: string, appOrigin: string): Promise<FanTipResult> {
  return runFanTipWithPrivateKey(listingId, appOrigin, getFanPrivateKey());
}

export async function runFanTipWithPrivateKey(listingId: string, appOrigin: string, privateKey: Hex): Promise<FanTipResult> {
  const listing = await requireListing(listingId);
  const client = makeGatewayClient(privateKey);
  const endpoint = new URL(x402PaymentPath(listing.id), appOrigin).toString();
  const priceAtomic = tipAmountAtomic(listing);

  const beforeBalances = await client.getBalances();
  if (beforeBalances.gateway.available < priceAtomic) {
    if (!config.x402.autoDeposit) {
      throw new Error(
        `Fan Gateway balance is ${beforeBalances.gateway.formattedAvailable} USDC, but ${tipAmountUsdc(listing)} USDC is required. ` +
          "Deposit to Circle Gateway or set X402_AUTO_DEPOSIT=true before tipping.",
      );
    }

    await client.deposit(config.x402.depositAmountUsdc);
  }

  const support = await client.supports(endpoint);
  if (!support.supported) {
    throw new Error(`Circle Gateway client does not see ${endpoint} as an x402-supported URL: ${support.error ?? "unknown reason"}`);
  }

  const payment = await client.pay<ProtectedTipResponse>(endpoint, { method: "POST" });
  const afterBalances = await client.getBalances();

  if (!payment.data?.ok || (!payment.data.log?.transactionHash && !payment.data.log?.paymentReceipt)) {
    throw new Error(payment.data?.error ?? "x402 payment completed without a settled KoboLink proof");
  }

  return {
    ok: true,
    listingId,
    fanAddress: client.address,
    log: payment.data.log,
    payment: {
      amountAtomic: payment.amount.toString(),
      formattedAmount: payment.formattedAmount,
      status: payment.status,
      transaction: payment.transaction,
    },
    balances: {
      beforeGatewayAvailableUsdc: beforeBalances.gateway.formattedAvailable,
      afterGatewayAvailableUsdc: afterBalances.gateway.formattedAvailable,
    },
  };
}

export async function handleProtectedTipRequest(request: Request, listingId: string): Promise<Response> {
  const listing = await requireListing(listingId);
  const requirements = await paymentRequirementsForListing(listing);
  const paymentHeader = request.headers.get("payment-signature");

  if (!paymentHeader) {
    return paymentRequiredResponse(request, listing, requirements);
  }

  try {
    const paymentPayload = decodeHeader<PaymentPayload>(paymentHeader);
    const mismatch = paymentRequirementMismatch(paymentPayload, requirements);
    if (mismatch) {
      await appendPaymentLog(failTip(listing, mismatch));
      return jsonResponse({ ok: false, error: mismatch }, { status: 402 });
    }

    const selectedRequirements = requirements;
    const gateway = getFacilitator();
    const verifyResult = await gateway.verify(paymentPayload, selectedRequirements) as VerifyResult;
    if (!verifyResult.isValid) {
      await appendPaymentLog(failTip(listing, verifyResult.invalidReason ?? "Payment verification failed"));
      return jsonResponse(
        { ok: false, error: verifyResult.invalidReason ?? "Payment verification failed" },
        { status: 402 },
      );
    }

    const settleResult = await gateway.settle(paymentPayload, selectedRequirements) as SettleResult;
    if (!settleResult.success || !settleResult.transaction) {
      await appendPaymentLog(failTip(listing, settleResult.errorReason ?? "Payment settlement failed"));
      return jsonResponse(
        { ok: false, error: settleResult.errorReason ?? "Payment settlement failed" },
        { status: 402 },
      );
    }

    const now = new Date().toISOString();
    const settlementProof = settlementProofFromCircleTransaction(settleResult.transaction);
    const log = settleVerifiedTip(
      listing,
      {
        ...settlementProof,
        settledAt: now,
        payer: settleResult.payer ?? verifyResult.payer,
        network: settleResult.network ?? selectedRequirements.network,
        receipt: {
          verify: verifyResult,
          settle: settleResult,
          network: selectedRequirements.network,
          amountAtomic: selectedRequirements.amount,
          asset: selectedRequirements.asset,
          payTo: selectedRequirements.payTo,
          facilitatorUrl: config.circle.gatewayFacilitatorUrl,
        },
      },
      now,
    );
    await appendPaymentLog(log);

    return jsonResponse(
      {
        ok: true,
        listing: listingSummary(listing),
        log,
      } satisfies ProtectedTipResponse,
      {
        headers: {
          "PAYMENT-RESPONSE": encodeHeader({
            success: true,
            transaction: log.transactionHash ?? log.paymentReceipt,
            receiptUrl: log.receiptUrl,
            network: log.network,
            payer: log.payer,
          }),
        },
      },
    );
  } catch (error) {
    await appendPaymentLog(failTip(listing, conciseError(error)));
    return jsonResponse({ ok: false, error: conciseError(error) }, { status: 500 });
  }
}

export function paymentRequirementMismatch(paymentPayload: Pick<PaymentPayload, "accepted">, requirements: PaymentRequirements): string | undefined {
  const accepted = paymentPayload.accepted;
  if (!accepted) return undefined;

  const fields: Array<keyof Pick<PaymentRequirements, "scheme" | "network" | "asset" | "amount" | "payTo" | "maxTimeoutSeconds">> = ["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds"];
  for (const field of fields) {
    const actual = accepted[field];
    if (actual !== undefined && !sameRequirementValue(field, actual, requirements[field])) {
      return "x402 payment accepted." + field + " must match the verified listing payment requirement.";
    }
  }

  const acceptedVerifyingContract = stringValue(accepted.extra?.verifyingContract);
  const requiredVerifyingContract = stringValue(requirements.extra.verifyingContract);
  if (acceptedVerifyingContract && requiredVerifyingContract && acceptedVerifyingContract.toLowerCase() !== requiredVerifyingContract.toLowerCase()) {
    return "x402 payment accepted.extra.verifyingContract must match the Arc Gateway requirement.";
  }

  return undefined;
}

export async function paymentRequirementsForListing(listing: FeedItem): Promise<PaymentRequirements> {
  const kind = await getArcGatewayKind();
  const asset = usdcAddress(kind);
  if (!asset) throw new Error(`Circle Gateway did not advertise a USDC asset for ${config.x402.network}.`);
  if (!kind.extra?.verifyingContract) throw new Error(`Circle Gateway did not advertise a verifying contract for ${config.x402.network}.`);

  return {
    scheme: "exact",
    network: kind.network,
    asset,
    amount: tipAmountAtomic(listing).toString(),
    payTo: listing.creator.walletAddress,
    maxTimeoutSeconds: x402MaxTimeoutSeconds,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: kind.extra.verifyingContract,
    },
  };
}

export function tipAmountUsdc(listing: FeedItem): string {
  return listing.suggestedTipUsdc.toFixed(6);
}

export function tipAmountAtomic(listing: FeedItem): bigint {
  return parseUnits(tipAmountUsdc(listing), 6);
}

export async function requireListing(listingId: string): Promise<FeedItem> {
  const listing = await findListing(listingId);
  if (!listing) throw new Error("listing not found");
  return listing;
}

export async function getUsdcContractAddress(): Promise<string> {
  const kind = await getArcGatewayKind();
  const asset = usdcAddress(kind);
  if (!asset) throw new Error("Circle Gateway did not advertise a USDC asset.");
  return asset;
}

function paymentRequiredResponse(request: Request, listing: FeedItem, requirements: PaymentRequirements): Response {
  return jsonResponse(
    {
      error: "Payment required",
      listing: listingSummary(listing),
      amountNgn: listing.suggestedTipNgn,
      amountUsdc: tipAmountUsdc(listing),
    },
    {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": encodeHeader({
          x402Version: 2,
          resource: {
            url: request.url,
            description: `KoboLink tip for ${listing.creator.xHandle}: ${listing.title}`,
            mimeType: "application/json",
          },
          accepts: [requirements],
        }),
      },
    },
  );
}

async function getArcGatewayKind(): Promise<SupportedKind> {
  supportedKind ??= getFacilitator()
    .getSupported()
    .then((supported) => {
      const kind = (supported.kinds as SupportedKind[]).find(
        (candidate) => candidate.network === config.x402.network && candidate.extra?.verifyingContract && usdcAddress(candidate),
      );
      if (!kind) {
        throw new Error(`Circle Gateway does not report ${config.x402.network} as supported with USDC and a verifying contract.`);
      }
      return kind;
    });

  return supportedKind;
}

function getFacilitator(): BatchFacilitatorClient {
  facilitator ??= new BatchFacilitatorClient({
    url: config.circle.gatewayFacilitatorUrl,
  });
  return facilitator;
}

function usdcAddress(kind: SupportedKind): string | undefined {
  return kind.extra?.assets?.find((asset) => asset.symbol === "USDC")?.address;
}

function sameRequirementValue(field: keyof PaymentRequirements, actual: unknown, expected: unknown): boolean {
  const actualValue = String(actual);
  const expectedValue = String(expected);
  if (field === "network" || field === "asset" || field === "payTo") return actualValue.toLowerCase() === expectedValue.toLowerCase();
  return actualValue === expectedValue;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function settlementProofFromCircleTransaction(transaction: string): { transactionHash?: string; paymentReceipt?: string; receiptUrl?: string } {
  if (/^0x[a-fA-F0-9]{64}$/.test(transaction)) {
    return { transactionHash: transaction };
  }

  return {
    paymentReceipt: transaction,
    receiptUrl: `${config.circle.gatewayFacilitatorUrl.replace(/\/$/, "")}/v1/transfers/${transaction}`,
  };
}
function listingSummary(listing: FeedItem) {
  return {
    id: listing.id,
    creatorHandle: listing.creator.xHandle,
    contentTitle: listing.title,
  };
}

function x402PaymentPath(listingId: string): string {
  return `/x402/pay/${listingId}`;
}

function encodeHeader(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload, jsonSafe)).toString("base64");
}

function decodeHeader<T>(header: string): T {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as T;
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload, jsonSafe), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function conciseError(error: unknown): string {
  const candidate = error as { shortMessage?: string; message?: string };
  return candidate.shortMessage ?? candidate.message ?? String(error);
}