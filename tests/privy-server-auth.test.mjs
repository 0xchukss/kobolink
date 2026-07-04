import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { publicClerkServerStatus, clerkServerConfigStatus, requireClerkMutationAuth, ClerkMutationAuthError } from "../dist/auth/clerk-server.js";

describe("Clerk server mutation auth", () => {
  it("reports missing Clerk configuration", () => {
    assert.deepEqual(clerkServerConfigStatus({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_app", CLERK_SECRET_KEY: "sk_test_secret" }), { ok: true, missing: [] });
    assert.deepEqual(clerkServerConfigStatus({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_app", CLERK_SECRET_KEY: "replace_me" }), { ok: false, missing: ["CLERK_SECRET_KEY"] });
    assert.deepEqual(clerkServerConfigStatus({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "replace_me", CLERK_SECRET_KEY: "sk_test_secret" }), { ok: false, missing: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] });
    assert.deepEqual(publicClerkServerStatus({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_app", CLERK_SECRET_KEY: "replace_me" }), { ok: false, missing: ["CLERK_SECRET_KEY"] });
  });

  it("accepts signed-in Clerk users", async () => {
    const claims = await requireClerkMutationAuth({
      env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_app", CLERK_SECRET_KEY: "sk_test_secret" },
      verifier: async () => ({ userId: "user_123", sessionId: "sess_123" }),
    });

    assert.equal(claims.userId, "user_123");
    assert.equal(claims.sessionId, "sess_123");
  });

  it("fails closed without server config", async () => {
    await assert.rejects(
      () => requireClerkMutationAuth({
        env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_app", CLERK_SECRET_KEY: "replace_me" },
        verifier: async () => ({ userId: "user_123" }),
      }),
      (error) => error instanceof ClerkMutationAuthError && error.status === 503,
    );
  });

  it("rejects signed-out users", async () => {
    await assert.rejects(
      () => requireClerkMutationAuth({
        env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_app", CLERK_SECRET_KEY: "sk_test_secret" },
        verifier: async () => ({ userId: null }),
      }),
      (error) => error instanceof ClerkMutationAuthError && error.status === 401,
    );
  });
});
