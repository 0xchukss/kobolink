import { config } from "./config/env.js";
import { productPersonas } from "./data/personas.js";
import { formatNaira, formatUsdc, ngnToUsdc } from "./utils/currency.js";

const defaultTipUsdc = ngnToUsdc(config.economics.defaultTipNgn, config.economics.ngnPerUsdc);

console.log("KoboLink real-mode readiness summary");
console.log("===================================");
console.log("Positioning: Autonomous tipping for Nigerian X creators.");
console.log(`Agent budget target: ${formatNaira(config.economics.agentBudgetNgn)}`);
console.log(`Default tip: ${formatNaira(config.economics.defaultTipNgn)} (${formatUsdc(defaultTipUsdc)})`);
console.log(`Settlement rail: ${config.x402.network} via x402 / Arc USDC`);
console.log("Naira bridge: Flutterwave sandbox for verified deposits and payout requests");
console.log("Product personas:");

for (const persona of productPersonas) {
  console.log(`- ${persona.name} (${persona.role}): ${persona.primaryAction}`);
}
