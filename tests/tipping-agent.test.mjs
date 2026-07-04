import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testPublicFeed } from "./fixtures/creator-feed.mjs";
import { runTippingAgent } from "../dist/agents/tipping-agent.js";

describe("Phase 4 autonomous tipping agent", () => {
  it("selects matching creator listings within budget and explains decisions", () => {
    const result = runTippingAgent({
      feed: testPublicFeed,
      budgetNgn: 300,
      interests: ["ai", "fintech"],
      maxTipNgn: 200,
    });

    assert.equal(result.spentNgn, 150);
    assert.equal(result.remainingBudgetNgn, 150);
    assert.equal(result.paymentLogs.length, 1);
    assert.equal(result.paymentLogs[0].status, "pending");
    assert.equal(result.paymentLogs[0].creatorHandle, "@adaobiokoro");
    assert.equal(result.decisions[0].status, "selected");
    assert.match(result.decisions[0].reason, /matched interest/i);
  });

  it("skips listings outside interests or over max tip", () => {
    const result = runTippingAgent({
      feed: testPublicFeed,
      budgetNgn: 2000,
      interests: ["ai"],
      maxTipNgn: 200,
    });

    assert.equal(result.paymentLogs.length, 1);
    assert.ok(result.decisions.some((decision) => decision.status === "skipped" && /interest/i.test(decision.reason)));
  });
});