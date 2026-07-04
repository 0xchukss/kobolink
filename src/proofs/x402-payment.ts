import express, { type Request, type Response } from "express";
import { createServer, type Server } from "node:http";

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { parseUnits } from "viem";

import { config } from "../config/env.js";
import { paymentRequirementMismatch } from "../payments/x402-gateway.js";
import { getCreatorAddress, getFanPrivateKey, makeGatewayClient } from "./env-wallets.js";
import { proofFilePath, recordProof } from "./proof-store.js";

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

type PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

type PaymentPayload = {
  x402Version: number;
  accepted?: PaymentRequirements;
  payload: Record<string, unknown>;
  [key: string]: unknown;
};

function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function conciseError(error: unknown): string {
  const candidate = error as { shortMessage?: string; message?: string };
  return candidate.shortMessage ?? candidate.message ?? String(error);
}

function detailedError(error: unknown): Record<string, unknown> {
  const candidate = error as { name?: string; shortMessage?: string; message?: string; details?: string; cause?: unknown };
  return {
    name: candidate.name,
    shortMessage: candidate.shortMessage,
    message: candidate.message,
    details: candidate.details,
    cause: candidate.cause ? detailedError(candidate.cause) : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function encodeHeader(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeHeader<T>(header: string): T {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as T;
}

function usdcAddress(kind: SupportedKind): string | undefined {
  return kind.extra?.assets?.find((asset) => asset.symbol === "USDC")?.address;
}

const sellerAddress = getCreatorAddress();
const buyerPrivateKey = getFanPrivateKey();
const priceUsdc = config.x402.priceUsdc;
const priceAtomic = parseUnits(priceUsdc, 6);
const amountAtomic = priceAtomic.toString();
const x402MaxTimeoutSeconds = Number(process.env.X402_MAX_TIMEOUT_SECONDS ?? 610000);

let paidRequest: { verified: boolean; payer: string; amount: string; network: string; transaction?: string } | undefined;
let settleResult: unknown;
let verifyResult: unknown;
let verifyFailure: unknown;
let settleFailure: unknown;
let support: unknown;
let deposit: unknown;
let beforeBalances: Awaited<ReturnType<ReturnType<typeof makeGatewayClient>["getBalances"]>> | undefined;
let afterDepositBalances: Awaited<ReturnType<ReturnType<typeof makeGatewayClient>["getBalances"]>> | undefined;
let afterPaymentBalances: Awaited<ReturnType<ReturnType<typeof makeGatewayClient>["getBalances"]>> | undefined;
let challengeStatus: number | undefined;
let selectedRequirements: PaymentRequirements | undefined;
let requestCount = 0;

const facilitator = new BatchFacilitatorClient({
  url: config.circle.gatewayFacilitatorUrl,
});

const supported = await facilitator.getSupported();
const kind = (supported.kinds as SupportedKind[]).find(
  (candidate) => candidate.network === config.x402.network && candidate.extra?.verifyingContract && usdcAddress(candidate),
);

if (!kind) {
  throw new Error(`Circle Gateway does not report ${config.x402.network} as supported with USDC and a verifying contract.`);
}

const baseRequirements: PaymentRequirements = {
  scheme: "exact",
  network: kind.network,
  asset: usdcAddress(kind) as string,
  amount: amountAtomic,
  payTo: sellerAddress,
  maxTimeoutSeconds: x402MaxTimeoutSeconds,
  extra: {
    name: "GatewayWalletBatched",
    version: "1",
    verifyingContract: kind.extra?.verifyingContract,
  },
};

const app = express();

app.get("/proof/x402", async (req: Request, res: Response) => {
  requestCount += 1;

  try {
    const paymentHeader = req.header("payment-signature");
    if (!paymentHeader) {
      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: req.originalUrl,
          description: "KoboLink Day 1 x402 Arc Testnet proof endpoint",
          mimeType: "application/json",
        },
        accepts: [baseRequirements],
      };

      res.status(402).setHeader("PAYMENT-REQUIRED", encodeHeader(paymentRequired)).json({});
      return;
    }

    const paymentPayload = decodeHeader<PaymentPayload>(paymentHeader);
    const mismatch = paymentRequirementMismatch(paymentPayload, baseRequirements);
    if (mismatch) {
      verifyFailure = { invalidReason: mismatch };
      res.status(402).json({
        error: "Payment requirement mismatch",
        reason: mismatch,
      });
      return;
    }

    selectedRequirements = baseRequirements;
    verifyResult = await facilitator.verify(paymentPayload, selectedRequirements);
    if (!(verifyResult as { isValid?: boolean }).isValid) {
      verifyFailure = verifyResult;
      res.status(402).json({
        error: "Payment verification failed",
        reason: (verifyResult as { invalidReason?: string }).invalidReason,
      });
      return;
    }

    settleResult = await facilitator.settle(paymentPayload, selectedRequirements);
    if (!(settleResult as { success?: boolean }).success) {
      settleFailure = settleResult;
      res.status(402).json({
        error: "Payment settlement failed",
        reason: (settleResult as { errorReason?: string }).errorReason,
      });
      return;
    }

    paidRequest = {
      verified: true,
      payer: (settleResult as { payer?: string }).payer ?? (verifyResult as { payer?: string }).payer ?? "",
      amount: selectedRequirements.amount,
      network: selectedRequirements.network,
      transaction: (settleResult as { transaction?: string }).transaction,
    };

    res.setHeader(
      "PAYMENT-RESPONSE",
      encodeHeader({
        success: true,
        transaction: paidRequest.transaction,
        network: paidRequest.network,
        payer: paidRequest.payer,
      }),
    );

    res.json({
      ok: true,
      content: "KoboLink creator tip endpoint unlocked by x402 payment on Arc Testnet.",
      sellerAddress,
      payment: paidRequest,
    });
  } catch (error) {
    res.status(500).json({ error: "Payment processing error", message: conciseError(error) });
  }
});

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const listenAddress = server.address();
if (!listenAddress || typeof listenAddress === "string") {
  throw new Error("Could not resolve local x402 proof server port.");
}

const url = `http://127.0.0.1:${listenAddress.port}/proof/x402`;

try {
  const challenge = await fetch(url);
  challengeStatus = challenge.status;
  const challengeBody = await challenge.text();
  if (challenge.status !== 402) {
    throw new Error(`Expected unauthenticated x402 endpoint to return 402. Received ${challenge.status}: ${challengeBody}`);
  }

  const client = makeGatewayClient(buyerPrivateKey);
  beforeBalances = await client.getBalances();

  if (beforeBalances.gateway.available < priceAtomic) {
    if (!config.x402.autoDeposit) {
      throw new Error(
        `Gateway balance is ${beforeBalances.gateway.formattedAvailable} USDC, but ${priceUsdc} USDC is required. ` +
          "Fund the fan wallet, then set X402_AUTO_DEPOSIT=true or deposit to Circle Gateway before running proof:x402-payment.",
      );
    }

    deposit = await client.deposit(config.x402.depositAmountUsdc);
  }

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    afterDepositBalances = await client.getBalances();
    if (afterDepositBalances.gateway.available >= priceAtomic) break;
    await sleep(5000);
  }

  if (!afterDepositBalances || afterDepositBalances.gateway.available < priceAtomic) {
    throw new Error(
      `Gateway balance is still ${afterDepositBalances?.gateway.formattedAvailable ?? "unknown"} USDC after deposit wait; ${priceUsdc} USDC required.`,
    );
  }

  support = await client.supports(url);
  if (!(support as { supported?: boolean }).supported) {
    throw new Error(`Circle Gateway client does not see this URL as supported: ${(support as { error?: string }).error ?? "unknown reason"}`);
  }

  const payment = await client.pay(url);
  afterPaymentBalances = await client.getBalances();

  const proof = {
    ok: true,
    endpoint: url,
    challengeStatus,
    buyerAddress: client.address,
    sellerAddress,
    network: config.x402.network,
    chain: config.circle.gatewayChain,
    facilitatorUrl: config.circle.gatewayFacilitatorUrl,
    priceUsdc,
    priceAtomic,
    x402MaxTimeoutSeconds,
    requirements: selectedRequirements ?? baseRequirements,
    support,
    deposit,
    verifyResult,
    settleResult,
    payment: {
      amount: payment.amount,
      formattedAmount: payment.formattedAmount,
      status: payment.status,
      transaction: payment.transaction,
      data: payment.data,
    },
    paidRequest,
    balances: {
      before: beforeBalances && {
        walletUsdc: beforeBalances.wallet.formatted,
        gatewayAvailableUsdc: beforeBalances.gateway.formattedAvailable,
      },
      afterDeposit: afterDepositBalances && {
        walletUsdc: afterDepositBalances.wallet.formatted,
        gatewayAvailableUsdc: afterDepositBalances.gateway.formattedAvailable,
      },
      afterPayment: afterPaymentBalances && {
        walletUsdc: afterPaymentBalances.wallet.formatted,
        gatewayAvailableUsdc: afterPaymentBalances.gateway.formattedAvailable,
      },
    },
    requestCount,
  };

  await recordProof("x402Payment", proof);
  console.log(JSON.stringify({ proofFile: proofFilePath(), x402Payment: proof }, jsonSafe, 2));
} catch (error) {
  const failure = {
    ok: false,
    endpoint: url,
    challengeStatus,
    sellerAddress,
    network: config.x402.network,
    chain: config.circle.gatewayChain,
    facilitatorUrl: config.circle.gatewayFacilitatorUrl,
    priceUsdc,
    x402MaxTimeoutSeconds,
    requirements: selectedRequirements ?? baseRequirements,
    error: conciseError(error),
    detail: detailedError(error),
    fundingRequired: conciseError(error).toLowerCase().includes("fund") || conciseError(error).toLowerCase().includes("balance"),
    support,
    deposit,
    verifyResult,
    verifyFailure,
    settleResult,
    settleFailure,
    balances: {
      before: beforeBalances && {
        walletUsdc: beforeBalances.wallet.formatted,
        gatewayAvailableUsdc: beforeBalances.gateway.formattedAvailable,
      },
      afterDeposit: afterDepositBalances && {
        walletUsdc: afterDepositBalances.wallet.formatted,
        gatewayAvailableUsdc: afterDepositBalances.gateway.formattedAvailable,
      },
      afterPayment: afterPaymentBalances && {
        walletUsdc: afterPaymentBalances.wallet.formatted,
        gatewayAvailableUsdc: afterPaymentBalances.gateway.formattedAvailable,
      },
    },
    requestCount,
  };

  await recordProof("x402Payment", failure);
  console.error(JSON.stringify({ proofFile: proofFilePath(), x402Payment: failure }, jsonSafe, 2));
  process.exitCode = 1;
} finally {
  await closeServer(server);
}

