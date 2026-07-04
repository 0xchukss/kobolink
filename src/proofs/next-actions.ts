import type { RealModeCheck, RealModeReadiness } from "./real-mode-readiness.js";

export type RealModeNextAction = {
  id: string;
  title: string;
  status: "done" | "todo";
  why: string;
  commands: string[];
  env: string[];
};

export type RealModeNextActions = {
  ok: boolean;
  generatedAt: string;
  remainingCount: number;
  actions: RealModeNextAction[];
};

export function buildRealModeNextActions(readiness: RealModeReadiness): RealModeNextActions {
  const actions = readiness.checks.map(actionForCheck).filter((action): action is RealModeNextAction => Boolean(action));
  const remainingCount = actions.filter((action) => action.status === "todo").length;
  return {
    ok: readiness.ok,
    generatedAt: readiness.generatedAt,
    remainingCount,
    actions,
  };
}

function actionForCheck(check: RealModeCheck): RealModeNextAction | undefined {
  if (check.ok) return passedAction(check);

  if (check.id === "clerk-auth") {
    return todo(check, {
      title: "Configure server-side Clerk auth",
      why: "Real app mutations must be verified server-side, not only gated by client sign-in.",
      env: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
      commands: ["npm run proof:real-mode"],
    });
  }

  if (check.id === "real-listings") {
    return todo(check, {
      title: "Create a creator-attached X listing with live URL proof",
      why: "Tips and agent runs need a real creator listing target with a creator-supplied X post link, pasted content, and live URL proof.",
      env: [
        "KOBOLINK_CREATOR_X_HANDLE",
        "KOBOLINK_CREATOR_DISPLAY_NAME",
        "KOBOLINK_CREATOR_WALLET_ADDRESS",
        "KOBOLINK_CREATOR_CATEGORY",
        "KOBOLINK_LISTING_TITLE",
        "KOBOLINK_LISTING_X_URL",
        "KOBOLINK_LISTING_POST_CONTENT",
        "KOBOLINK_LISTING_MEDIA_URLS",
        "KOBOLINK_LISTING_TIP_NGN",
      ],
      commands: ["npm run proof:create-listing", "npm run proof:listings"],
    });
  }

  if (check.id === "no-seed-feed") {
    return todo(check, {
      title: "Remove shipped seed creator feed artifacts",
      why: "Real-mode proof must not ship or compile a fake creator marketplace feed.",
      env: [],
      commands: ["Delete stale demo listing artifacts", "npm test", "npm run proof:real-mode"],
    });
  }

  if (check.id === "flutterwave-config") {
    return todo(check, {
      title: "Configure Flutterwave sandbox keys",
      why: "The Naira bridge must call Flutterwave sandbox instead of local intent helpers.",
      env: ["FLUTTERWAVE_PUBLIC_KEY", "FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_ENCRYPTION_KEY"],
      commands: ["npm run proof:bridge-checkout"],
    });
  }

  if (check.id === "flutterwave-deposit") {
    return todo(check, {
      title: "Verify a Flutterwave sandbox deposit",
      why: "Naira balance is credited only after a Flutterwave checkout receipt and transaction verification match the same tx_ref.",
      env: [
        "KOBOLINK_BRIDGE_DEPOSIT_NGN",
        "KOBOLINK_BRIDGE_CUSTOMER_EMAIL",
        "KOBOLINK_BRIDGE_CUSTOMER_NAME",
        "KOBOLINK_BRIDGE_DEPOSIT_RECEIPT_ID",
        "KOBOLINK_BRIDGE_TRANSACTION_ID",
      ],
      commands: ["npm run proof:bridge-checkout", "npm run proof:bridge-verify"],
    });
  }

  if (check.id === "flutterwave-payout") {
    return todo(check, {
      title: "Get an accepted Flutterwave sandbox payout",
      why: "The verifier requires Flutterwave to accept the payout request and settled Arc/Circle/x402 creator earnings to cover accepted payouts for that creator; sandbox API errors do not count.",
      env: ["KOBOLINK_PAYOUT_CREATOR_HANDLE", "KOBOLINK_PAYOUT_NGN", "KOBOLINK_PAYOUT_BANK_CODE", "KOBOLINK_PAYOUT_ACCOUNT_NUMBER"],
      commands: ["Settle a creator tip before payout if the creator has no earnings", "Enable Flutterwave sandbox payout/IP whitelisting", "npm run proof:bridge-payout"],
    });
  }

  if (check.id === "arc-balance") {
    return todo(check, {
      title: "Prove a funded Arc Testnet wallet",
      why: "The app needs live Arc testnet balance evidence for settlement readiness.",
      env: ["KOBOLINK_FAN_ADDRESS", "KOBOLINK_FAN_PRIVATE_KEY", "ARC_RPC_URL", "ARC_CHAIN_ID"],
      commands: ["npm run proof:create-wallets", "npm run proof:arc-balance"],
    });
  }

  if (check.id === "gateway-balance") {
    return todo(check, {
      title: "Fund Circle Gateway on arcTestnet",
      why: "The fan/agent cannot spend until Gateway has spendable USDC.",
      env: ["KOBOLINK_FAN_PRIVATE_KEY", "KOBOLINK_GATEWAY_DEPOSIT_USDC"],
      commands: ["npm run proof:fund-gateway", "npm run proof:real-mode"],
    });
  }

  if (check.id === "fan-budget-backed") {
    return todo(check, {
      title: "Authorize a Gateway-backed fan budget",
      why: "Agent spend must be bounded by an available Gateway-backed Naira/USDC budget.",
      env: ["KOBOLINK_FAN_BUDGET_NGN", "KOBOLINK_FAN_MAX_TIP_NGN", "KOBOLINK_FAN_INTERESTS", "KOBOLINK_FAN_PERIOD"],
      commands: ["npm run proof:authorize-budget"],
    });
  }

  if (check.id === "x402-proof") {
    return todo(check, {
      title: "Prove x402/Circle settlement",
      why: "The core payment rail must show a real Circle Gateway/x402 settlement on Arc testnet.",
      env: ["KOBOLINK_FAN_PRIVATE_KEY", "X402_PAY_TO_ADDRESS", "CIRCLE_API_KEY"],
      commands: ["npm run proof:x402-payment"],
    });
  }

  if (check.id === "settled-tip-log") {
    return todo(check, {
      title: "Settle a tip for a creator-attached listing",
      why: "Creator balances only count settled x402/Circle/Arc proof tied to the current creator feed and written to proofs/real-tip.json.",
      env: ["KOBOLINK_TIP_LISTING_ID"],
      commands: ["npm run proof:listings", "npm run proof:tip-listing", "npm run proof:tip-status"],
    });
  }

  if (check.id === "circle-env") {
    return todo(check, {
      title: "Configure Circle/x402 wallet env",
      why: "Payment proofs need a fan signer and creator receiving address.",
      env: ["KOBOLINK_FAN_PRIVATE_KEY", "KOBOLINK_CREATOR_ADDRESS", "X402_PAY_TO_ADDRESS"],
      commands: ["npm run proof:x402-payment"],
    });
  }

  return todo(check, {
    title: check.label,
    why: check.detail,
    env: [],
    commands: ["npm run proof:real-mode"],
  });
}

function todo(check: RealModeCheck, input: Omit<RealModeNextAction, "id" | "status">): RealModeNextAction {
  return { id: check.id, status: "todo", ...input };
}

function passedAction(check: RealModeCheck): RealModeNextAction {
  return {
    id: check.id,
    title: check.label,
    status: "done",
    why: check.detail,
    env: [],
    commands: [],
  };
}
