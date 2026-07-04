import { writeDay7Proof } from "./proofs/proof-center.js";
import { formatNaira, formatUsdc } from "./utils/currency.js";

const snapshot = await writeDay7Proof("proofs/day7.json", { liveGateway: true });

console.log("KoboLink real testnet proof package\n");
console.log(`Success: ${snapshot.success ? "yes" : "no"}`);
console.log(`Creators/listings: ${snapshot.summary.creatorCount} creators / ${snapshot.summary.listingCount} listings`);
console.log(`Settled payment logs: ${snapshot.summary.settledPaymentCount}`);
console.log(`Agent run: ${snapshot.summary.agentTipCount} tips / ${snapshot.summary.uniqueAgentProofCount} unique proofs`);
console.log(`Flutterwave credited: ${formatNaira(snapshot.summary.creditedNairaBalance)} / ${formatUsdc(snapshot.summary.creditedUsdcBalance)}`);
console.log(`Deposit status: ${snapshot.summary.flutterwaveDepositStatus}`);
console.log(`Payout status: ${snapshot.summary.flutterwavePayoutStatus}`);
console.log(`Gateway proof: ${snapshot.summary.gatewayBalanceStatus} from ${snapshot.summary.gatewayBalanceSource}\n`);

for (const item of snapshot.items) {
  const marker = item.status === "passed" ? "PASS" : item.status === "warning" ? "WARN" : "MISS";
  console.log(`${marker} ${item.title}: ${item.summary}`);
  if (item.proof) console.log(`     proof: ${item.proof}`);
}

if (snapshot.caveats.length > 0) {
  console.log("\nCaveats:");
  for (const caveat of snapshot.caveats) console.log(`- ${caveat}`);
}

console.log("\nProof saved: proofs/day7.json");

if (!snapshot.success) {
  process.exitCode = 1;
}
