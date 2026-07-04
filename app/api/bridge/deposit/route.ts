import { createFlutterwaveCheckoutDeposit } from "../../../../src/flutterwave/bridge.js";
import { publicBridgeSnapshot, publicDepositReceipt, readBridgeState, upsertDepositReceipt } from "../../../../src/flutterwave/bridge-store.js";
import { writeBridgeCheckoutProof } from "../../../../src/proofs/bridge-proof-writer.js";
import { appAuthResponse, requireAppMutationAuth } from "../../app-auth-response.js";

export const dynamic = "force-dynamic";

type DepositBody = {
  amountNgn?: unknown;
  email?: unknown;
  name?: unknown;
  phoneNumber?: unknown;
};

export async function POST(request: Request) {
  try {
    await requireAppMutationAuth();
    const body = await request.json() as DepositBody;
    const amountNgn = positiveNumber(body.amountNgn, "amountNgn");
    const email = emailValue(body.email, "email");
    const name = stringValue(body.name, "name");
    const phoneNumber = optionalStringValue(body.phoneNumber);
    const origin = new URL(request.url).origin;
    const receipt = await createFlutterwaveCheckoutDeposit({
      amountNgn,
      customer: {
        email,
        name,
        ...(phoneNumber ? { phoneNumber } : {}),
      },
      redirectUrl: `${origin}/api/bridge/deposit/callback`,
    });

    const stateBeforeProof = await upsertDepositReceipt(receipt);
    if (receipt.providerMode === "real_flutterwave_sandbox" && receipt.status === "checkout_created" && receipt.checkoutUrl) {
      await writeBridgeCheckoutProof(receipt, stateBeforeProof);
    }
    const state = await readBridgeState();
    return Response.json({ receipt: publicDepositReceipt(receipt), state: publicBridgeSnapshot(state) });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Could not create Flutterwave deposit" }, { status: 400 });
  }
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function emailValue(value: unknown, name: string): string {
  const email = stringValue(value, name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${name} must be a valid email address`);
  return email;
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}