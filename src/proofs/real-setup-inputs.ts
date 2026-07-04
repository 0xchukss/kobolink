import { isCreatorCategory, type CreatorCategory } from "../creator/listings.js";
import type { BudgetPeriod } from "../budgets/fan-budget.js";

export type EnvSource = Record<string, string | undefined>;

export type RealListingEnvInput = {
  xHandle: string;
  displayName: string;
  walletAddress: string;
  category: string;
  title: string;
  url: string;
  description: string;
  mediaUrls: string[];
  suggestedTipNgn: number;
  type: "x-thread";
};

export type RealBudgetEnvInput = {
  budgetNgn: number;
  maxTipNgn: number;
  period: BudgetPeriod;
  interests: CreatorCategory[];
  preferredCategories: CreatorCategory[];
  duplicateListingProtection: boolean;
  duplicateCreatorProtection: boolean;
};

export type RealBridgeCheckoutEnvInput = {
  amountNgn: number;
  customer: {
    email: string;
    name: string;
    phoneNumber?: string;
  };
  redirectUrl?: string;
};

export type RealBridgeVerifyEnvInput = {
  receiptId: string;
  transactionId: string;
};

export type RealBridgePayoutEnvInput = {
  creatorHandle: string;
  amountNgn: number;
  bankCode: string;
  accountNumber: string;
};

export function parseRealListingEnv(env: EnvSource = process.env as EnvSource): RealListingEnvInput {
  return {
    xHandle: requiredEnv(env, "KOBOLINK_CREATOR_X_HANDLE"),
    displayName: requiredEnv(env, "KOBOLINK_CREATOR_DISPLAY_NAME"),
    walletAddress: requiredEnv(env, "KOBOLINK_CREATOR_WALLET_ADDRESS", env.KOBOLINK_CREATOR_ADDRESS),
    category: requiredCategory(env, "KOBOLINK_CREATOR_CATEGORY"),
    title: requiredEnv(env, "KOBOLINK_LISTING_TITLE"),
    url: requiredEnv(env, "KOBOLINK_LISTING_X_URL"),
    description: requiredEnv(env, "KOBOLINK_LISTING_POST_CONTENT"),
    mediaUrls: optionalList(env.KOBOLINK_LISTING_MEDIA_URLS),
    suggestedTipNgn: positiveNumber(requiredEnv(env, "KOBOLINK_LISTING_TIP_NGN"), "KOBOLINK_LISTING_TIP_NGN"),
    type: "x-thread",
  };
}

export function parseRealBudgetEnv(env: EnvSource = process.env as EnvSource): RealBudgetEnvInput {
  const interests = requiredCategoryList(env, "KOBOLINK_FAN_INTERESTS");
  return {
    budgetNgn: positiveNumber(requiredEnv(env, "KOBOLINK_FAN_BUDGET_NGN"), "KOBOLINK_FAN_BUDGET_NGN"),
    maxTipNgn: positiveNumber(requiredEnv(env, "KOBOLINK_FAN_MAX_TIP_NGN"), "KOBOLINK_FAN_MAX_TIP_NGN"),
    period: requiredPeriod(env, "KOBOLINK_FAN_PERIOD"),
    interests,
    preferredCategories: env.KOBOLINK_FAN_PREFERRED_CATEGORIES ? requiredCategoryList(env, "KOBOLINK_FAN_PREFERRED_CATEGORIES") : interests,
    duplicateListingProtection: optionalBoolean(env.KOBOLINK_DUPLICATE_LISTING_PROTECTION, true, "KOBOLINK_DUPLICATE_LISTING_PROTECTION"),
    duplicateCreatorProtection: optionalBoolean(env.KOBOLINK_DUPLICATE_CREATOR_PROTECTION, true, "KOBOLINK_DUPLICATE_CREATOR_PROTECTION"),
  };
}

export function parseRealBridgeCheckoutEnv(env: EnvSource = process.env as EnvSource): RealBridgeCheckoutEnvInput {
  const phoneNumber = optionalEnv(env.KOBOLINK_BRIDGE_CUSTOMER_PHONE);
  const redirectUrl = optionalEnv(env.KOBOLINK_BRIDGE_REDIRECT_URL);
  return {
    amountNgn: positiveNumber(requiredEnv(env, "KOBOLINK_BRIDGE_DEPOSIT_NGN"), "KOBOLINK_BRIDGE_DEPOSIT_NGN"),
    customer: {
      email: requiredEmail(env, "KOBOLINK_BRIDGE_CUSTOMER_EMAIL"),
      name: requiredEnv(env, "KOBOLINK_BRIDGE_CUSTOMER_NAME"),
      ...(phoneNumber ? { phoneNumber } : {}),
    },
    ...(redirectUrl ? { redirectUrl: requiredHttpUrl(redirectUrl, "KOBOLINK_BRIDGE_REDIRECT_URL") } : {}),
  };
}

export function parseRealBridgeVerifyEnv(env: EnvSource = process.env as EnvSource): RealBridgeVerifyEnvInput {
  const transactionId = requiredEnv(env, "KOBOLINK_BRIDGE_TRANSACTION_ID");
  if (!/^\d+$/.test(transactionId)) throw new Error("KOBOLINK_BRIDGE_TRANSACTION_ID must be a numeric Flutterwave transaction id");
  return {
    receiptId: requiredEnv(env, "KOBOLINK_BRIDGE_DEPOSIT_RECEIPT_ID"),
    transactionId,
  };
}

export function parseRealBridgePayoutEnv(env: EnvSource = process.env as EnvSource): RealBridgePayoutEnvInput {
  const bankCode = requiredEnv(env, "KOBOLINK_PAYOUT_BANK_CODE");
  const accountNumber = requiredEnv(env, "KOBOLINK_PAYOUT_ACCOUNT_NUMBER");
  if (!/^\d{3}$/.test(bankCode)) throw new Error("KOBOLINK_PAYOUT_BANK_CODE must be a 3 digit Nigerian bank code");
  if (!/^\d{10}$/.test(accountNumber)) throw new Error("KOBOLINK_PAYOUT_ACCOUNT_NUMBER must be a 10 digit NUBAN account number");
  return {
    creatorHandle: requiredEnv(env, "KOBOLINK_PAYOUT_CREATOR_HANDLE"),
    amountNgn: positiveNumber(requiredEnv(env, "KOBOLINK_PAYOUT_NGN"), "KOBOLINK_PAYOUT_NGN"),
    bankCode,
    accountNumber,
  };
}

function requiredEnv(env: EnvSource, name: string, fallback?: string): string {
  const value = env[name] ?? fallback;
  if (isPlaceholder(value)) throw new Error(name + " is required for a real testnet proof");
  return value!.trim();
}

function optionalEnv(value: string | undefined): string | undefined {
  if (isPlaceholder(value)) return undefined;
  return value!.trim();
}

function requiredCategory(env: EnvSource, name: string): CreatorCategory {
  const value = requiredEnv(env, name).toLowerCase();
  if (!isCreatorCategory(value)) throw new Error(name + " must be one of: ai, fintech, startups, news, music, crypto");
  return value;
}

function requiredCategoryList(env: EnvSource, name: string): CreatorCategory[] {
  const values = optionalList(requiredEnv(env, name)).map((value) => value.toLowerCase());
  const categories: CreatorCategory[] = [];
  for (const value of values) {
    if (!isCreatorCategory(value)) throw new Error(name + " contains invalid category: " + value);
    if (!categories.includes(value)) categories.push(value);
  }
  if (categories.length === 0) throw new Error(name + " must include at least one category");
  return categories;
}

function requiredPeriod(env: EnvSource, name: string): BudgetPeriod {
  const value = requiredEnv(env, name).toLowerCase();
  if (value !== "daily" && value !== "weekly") throw new Error(name + " must be daily or weekly");
  return value;
}

function optionalList(value: string | undefined): string[] {
  if (isPlaceholder(value)) return [];
  return value!.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function positiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(name + " must be a positive number");
  return parsed;
}

function requiredEmail(env: EnvSource, name: string): string {
  const email = requiredEnv(env, name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(name + " must be a valid email address");
  return email;
}

function requiredHttpUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(name + " must be a valid http(s) URL");
  }
}

function optionalBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (isPlaceholder(value)) return fallback;
  const normalized = value!.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  throw new Error(name + " must be true or false");
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "replace_me" ||
    normalized.includes("replace_me") ||
    normalized.includes("placeholder") ||
    /^0x0+$/.test(normalized)
  );
}
