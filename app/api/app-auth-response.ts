// @ts-expect-error next/headers lacks correct NodeNext exports
import { headers } from "next/headers";
import { ClerkMutationAuthError } from "../../src/auth/clerk-server.js";

export async function requireAppMutationAuth() {
  const headersList = await headers();
  const walletAddress = headersList.get("x-wallet-address");
  if (!walletAddress) throw new ClerkMutationAuthError("Wallet connection required", 401);
  return { userId: walletAddress };
}

export function appAuthResponse(error: unknown): Response | null {
  if (!(error instanceof ClerkMutationAuthError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
