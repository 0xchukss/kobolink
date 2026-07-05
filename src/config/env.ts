import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env", quiet: true });
loadDotenv({ path: ".env.local", override: true, quiet: true });

export type AppConfig = {
  appPort: number;
  nodeEnv: string;
  arc: {
    rpcUrl: string;
    chainId: number;
    explorerUrl: string;
    transferAmountUsdc: string;
  };
  circle: {
    apiKey?: string;
    entitySecret?: string;
    walletSetId?: string;
    devWalletId?: string;
    devWalletAddress?: string;
    gatewayChain: string;
    gatewayFacilitatorUrl: string;
  };
  x402: {
    network: string;
    payToAddress: string;
    priceUsdc: string;
    autoDeposit: boolean;
    depositAmountUsdc: string;
  };
  flutterwave: {
    publicKey?: string;
    secretKey?: string;
    encryptionKey?: string;
  };
  economics: {
    ngnPerUsdc: number;
    defaultTipNgn: number;
    agentBudgetNgn: number;
  };
};

import { join } from "node:path";

export const localStoreDir = process.env.VERCEL ? "/tmp/data" : join(process.cwd(), "data");

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "replace_me" ||
    normalized.includes("replace_me") ||
    normalized.includes("example-") ||
    normalized.endsWith(".invalid")
  );
}

function stringFromEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  return isPlaceholder(raw) ? fallback : raw as string;
}

function numberFromEnv(name: string, fallback: number, options: { zeroIsPlaceholder?: boolean } = {}): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number. Received: ${raw}`);
  }

  if (options.zeroIsPlaceholder && parsed === 0) return fallback;
  return parsed;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return isPlaceholder(value) ? undefined : value;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;

  if (["true", "1", "yes", "y"].includes(raw.toLowerCase())) return true;
  if (["false", "0", "no", "n"].includes(raw.toLowerCase())) return false;

  throw new Error(`${name} must be a boolean-like value. Received: ${raw}`);
}

function x402NetworkFromEnv(): string {
  const raw = process.env.X402_NETWORK;
  if (!raw || raw === "arc-testnet") return "eip155:5042002";
  return raw;
}

export const config: AppConfig = {
  appPort: numberFromEnv("APP_PORT", 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  arc: {
    rpcUrl: stringFromEnv("ARC_RPC_URL", "https://rpc.testnet.arc.network"),
    chainId: numberFromEnv("ARC_CHAIN_ID", 5042002, { zeroIsPlaceholder: true }),
    explorerUrl: stringFromEnv("ARC_EXPLORER", stringFromEnv("ARC_EXPLORER_URL", "https://testnet.arcscan.app")),
    transferAmountUsdc: stringFromEnv("ARC_TRANSFER_AMOUNT_USDC", "0.000001"),
  },
  circle: {
    apiKey: optionalEnv("CIRCLE_" + "API_KEY"),
    entitySecret: optionalEnv("CIRCLE_ENTITY_SECRET"),
    walletSetId: optionalEnv("CIRCLE_WALLET_SET_ID"),
    devWalletId: optionalEnv("CIRCLE_DEV_WALLET_ID"),
    devWalletAddress: optionalEnv("CIRCLE_DEV_WALLET_ADDRESS"),
    gatewayChain: stringFromEnv("CIRCLE_GATEWAY_CHAIN", "arcTestnet"),
    gatewayFacilitatorUrl: stringFromEnv("CIRCLE_GATEWAY_FACILITATOR_URL", "https://gateway-api-testnet.circle.com"),
  },
  x402: {
    network: x402NetworkFromEnv(),
    payToAddress: stringFromEnv("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000000000"),
    priceUsdc: stringFromEnv("X402_PRICE_USDC", stringFromEnv("X402_DEMO_PRICE_USDC", "0.01")),
    autoDeposit: booleanFromEnv("X402_AUTO_DEPOSIT", false),
    depositAmountUsdc: stringFromEnv("X402_DEPOSIT_AMOUNT_USDC", "1.00"),
  },
  flutterwave: {
    publicKey: optionalEnv("FLUTTERWAVE_PUBLIC_KEY"),
    secretKey: optionalEnv("FLUTTERWAVE_SECRET_KEY"),
    encryptionKey: optionalEnv("FLUTTERWAVE_ENCRYPTION_KEY"),
  },
  economics: {
    ngnPerUsdc: numberFromEnv("NGN_USDC_RATE", numberFromEnv("DEMO_NGN_PER_USDC", 1550)),
    defaultTipNgn: numberFromEnv("DEFAULT_TIP_NGN", numberFromEnv("DEMO_DEFAULT_TIP_NGN", 150)),
    agentBudgetNgn: numberFromEnv("AGENT_BUDGET_NGN", numberFromEnv("DEMO_AGENT_BUDGET_NGN", 2000)),
  },
};


