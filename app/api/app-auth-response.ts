import { ClerkMutationAuthError, requireClerkMutationAuth } from "../../src/auth/clerk-server.js";

export { requireClerkMutationAuth as requireAppMutationAuth };

export function appAuthResponse(error: unknown): Response | null {
  if (!(error instanceof ClerkMutationAuthError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
