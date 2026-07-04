type ClerkEnv = Partial<Record<"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" | "CLERK_SECRET_KEY", string | undefined>>;

type ClerkAuthResult = {
  userId: string | null;
  sessionId?: string | null;
  orgId?: string | null;
};

type ClerkMutationAuthOptions = {
  env?: ClerkEnv;
  verifier?: () => Promise<ClerkAuthResult> | ClerkAuthResult;
};

export type ClerkServerConfigStatus = {
  ok: boolean;
  missing: string[];
};

export type PublicClerkServerStatus = ClerkServerConfigStatus;

export type ClerkMutationClaims = {
  userId: string;
  sessionId?: string;
  orgId?: string;
};

export function publicClerkServerStatus(env: ClerkEnv = process.env as ClerkEnv): PublicClerkServerStatus {
  return clerkServerConfigStatus(env);
}

export class ClerkMutationAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ClerkMutationAuthError";
  }
}

export function clerkServerConfigStatus(env: ClerkEnv = process.env as ClerkEnv): ClerkServerConfigStatus {
  const missing: string[] = [];
  if (isPlaceholder(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)) missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (isPlaceholder(env.CLERK_SECRET_KEY)) missing.push("CLERK_SECRET_KEY");
  return { ok: missing.length === 0, missing };
}

export async function requireClerkMutationAuth(options: ClerkMutationAuthOptions = {}): Promise<ClerkMutationClaims> {
  const env = options.env ?? process.env as ClerkEnv;
  const status = clerkServerConfigStatus(env);
  if (!status.ok) {
    throw new ClerkMutationAuthError("Server-side Clerk auth is not configured. Missing: " + status.missing.join(", "), 503);
  }

  const result = await (options.verifier ? options.verifier() : readCurrentClerkAuth());
  if (!result.userId) throw new ClerkMutationAuthError("Clerk sign-in is required for this real testnet action.", 401);

  return {
    userId: result.userId,
    sessionId: result.sessionId ?? undefined,
    orgId: result.orgId ?? undefined,
  };
}

async function readCurrentClerkAuth(): Promise<ClerkAuthResult> {
  const clerk = await import("@clerk/nextjs/server");
  return clerk.auth();
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === "replace_me" || normalized === "your_publishable_key" || normalized === "your_secret_key";
}
