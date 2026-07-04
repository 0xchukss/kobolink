import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { config } from "../dist/config/env.js";
import { productPersonas } from "../dist/data/personas.js";

describe("phase 1 readiness", () => {
  it("keeps Arc/x402 as the settlement rail and Flutterwave as bridge config", () => {
    assert.equal(config.arc.chainId, 5042002);
    assert.equal(config.x402.network, "eip155:5042002");
    assert.equal(config.circle.gatewayChain, "arcTestnet");
    assert.equal(config.economics.ngnPerUsdc, 1550);
    assert.match(config.arc.rpcUrl, /rpc\.testnet\.arc\.network/);
  });

  it("defines the three required product personas", () => {
    assert.deepEqual(
      productPersonas.map((persona) => persona.id),
      ["creator", "fan", "agent"],
    );
  });

  it("does not ship seed creator feed or X posting implementation artifacts", async () => {
    const { access, readFile } = await import("node:fs/promises");
    const forbidden = [
      "app/demo",
      "app/demo/page.tsx",
      "src/data/demo-listings.ts",
      "dist/data/demo-listings.js",
      "dist/demo-listings.js",
      "src/x/oauth.ts",
      "src/x/post-store.ts",
      "dist/x/oauth.js",
      "dist/x/post-store.js",
      "app/api/x/oauth/start/route.ts",
      "app/api/x/oauth/callback/route.ts",
      "app/api/x/post/route.ts",
      "app/api/x/status/route.ts",
      "app/api/x/logout/route.ts",
    ];
    const forbiddenEnvKeys = [
      "X_REDIRECT_URI",
      "X_OAUTH_COOKIE_SECRET",
      "X_CLIENT_ID",
      "X_CLIENT_SECRET",
      "TWITTER_API_KEY",
      "TWITTER_API_SECRET",
      "TWITTER_BEARER_TOKEN",
      "TWITTER_ACCESS_TOKEN",
      "TWITTER_ACCESS_TOKEN_SECRET",
    ];

    for (const file of forbidden) {
      await assert.rejects(() => access(file), /ENOENT/);
    }


    const appFiles = [
      "app/KoboLanding.tsx",
      "app/SiteFooter.tsx",
      "app/use-link/page.tsx",
      "app/workflows/page.tsx",
    ];
    for (const file of appFiles) {
      const raw = await readFile(file, "utf8");
      assert.equal(/['"]\/demo(?:[?#'"]|$)/.test(raw), false, file + " must not link to /demo");
      assert.equal(/View live demo/i.test(raw), false, file + " must not call real workflows a demo");
    }

    for (const envFile of [".env", ".env.local", ".env.example"]) {
      const raw = await readFile(envFile, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      const assignedKeys = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.match(/^([A-Z0-9_]+)\s*=/)?.[1])
        .filter(Boolean);
      for (const key of forbiddenEnvKeys) {
        assert.equal(assignedKeys.includes(key), false, envFile + " must not assign " + key);
      }
    }
  });

  it("documents the locked Next.js stack", async () => {
    const architecture = await import("node:fs/promises").then((fs) =>
      fs.readFile("docs/architecture.md", "utf8"),
    );

    assert.match(architecture, /Frontend: Next\.js/);
    assert.match(architecture, /Backend: Next API routes/);
  });
});
