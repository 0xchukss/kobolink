import { mkdir, writeFile } from "node:fs/promises";

import { buildRealModeNextActions } from "./proofs/next-actions.js";
import { buildRealModeReadiness } from "./proofs/real-mode-readiness.js";

const readiness = await buildRealModeReadiness(new Date().toISOString(), { liveGateway: true, liveArcBalance: true });
const next = buildRealModeNextActions(readiness);

await mkdir("proofs", { recursive: true });
await writeFile("proofs/next-actions.json", JSON.stringify(next, null, 2) + "\n", "utf8");

console.log("KoboLink real-mode next actions\n");
console.log(next.ok ? "Status: green" : "Status: red - " + next.remainingCount + " action(s) remaining");

for (const action of next.actions) {
  if (action.status === "done") continue;
  console.log("\n" + action.title);
  console.log("Why: " + action.why);
  if (action.env.length > 0) console.log("Env: " + action.env.join(", "));
  if (action.commands.length > 0) {
    console.log("Commands:");
    for (const command of action.commands) console.log("- " + command);
  }
}

console.log("\nProof saved: proofs/next-actions.json");
if (!next.ok) process.exitCode = 1;
