import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRealModeNextActions } from "../dist/proofs/next-actions.js";

const green = (id, label = id) => ({ id, label, ok: true, detail: "ok" });
const red = (id, label = id, detail = "missing") => ({ id, label, ok: false, detail });

describe("real-mode next actions", () => {
  it("turns failed readiness checks into ordered commands", () => {
    const next = buildRealModeNextActions({
      generatedAt: "2026-07-02T00:00:00.000Z",
      ok: false,
      blockers: [],
      checks: [
        red("clerk-auth", "Clerk app entry and server mutation auth configured", "Missing: CLERK_SECRET_KEY"),
        red("real-listings", "Creator-attached X listings available"),
        green("flutterwave-deposit", "Verified Flutterwave Naira deposit"),
        red("flutterwave-payout", "Flutterwave Naira payout request accepted"),
        red("settled-tip-log", "At least one real settled creator tip log for a creator-attached listing"),
      ],
    });

    assert.equal(next.ok, false);
    assert.equal(next.remainingCount, 4);
    assert.deepEqual(next.actions.filter((action) => action.status === "todo").map((action) => action.id), [
      "clerk-auth",
      "real-listings",
      "flutterwave-payout",
      "settled-tip-log",
    ]);
    assert.ok(next.actions.find((action) => action.id === "clerk-auth")?.env.includes("CLERK_SECRET_KEY"));
    assert.ok(next.actions.find((action) => action.id === "real-listings")?.commands.includes("npm run proof:create-listing"));
    const payoutAction = next.actions.find((action) => action.id === "flutterwave-payout");
    assert.ok(payoutAction?.commands.includes("npm run proof:bridge-payout"));
    assert.match(payoutAction?.why ?? "", /settled Arc\/Circle\/x402 creator earnings/);
    assert.ok(next.actions.find((action) => action.id === "settled-tip-log")?.commands.includes("npm run proof:tip-listing"));
  });

  it("marks passed checks as done without commands", () => {
    const next = buildRealModeNextActions({
      generatedAt: "2026-07-02T00:00:00.000Z",
      ok: true,
      blockers: [],
      checks: [green("arc-balance", "Arc Testnet wallet balance proof")],
    });

    assert.equal(next.ok, true);
    assert.equal(next.remainingCount, 0);
    assert.equal(next.actions[0].status, "done");
    assert.deepEqual(next.actions[0].commands, []);
  });
});
