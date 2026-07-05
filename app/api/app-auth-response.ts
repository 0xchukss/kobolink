// @ts-expect-error next/headers lacks correct NodeNext exports
import { headers } from "next/headers";

export class AppAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AppAuthError";
  }
}

export async function requireAppMutationAuth() {
  const headersList = await headers();
  const walletAddress = headersList.get("x-wallet-address");
  if (!walletAddress) throw new AppAuthError("Wallet connection required", 401);
  return { userId: walletAddress };
}

export function appAuthResponse(error: unknown): Response | null {
  if (!(error instanceof AppAuthError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
