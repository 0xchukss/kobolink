import { readFile, writeFile } from "node:fs/promises";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { recordProof } from "./proof-store.js";

type Role = "fan" | "agent" | "creator";

const envLocalPath = ".env.local";

function createWallet(role: Role) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    role,
    address: account.address,
    privateKey,
  };
}

async function readEnvLocal(): Promise<string[]> {
  try {
    const raw = await readFile(envLocalPath, "utf8");
    return raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function upsertEnv(lines: string[], values: Record<string, string>): string[] {
  const remaining = lines.filter((line) => {
    const key = line.split("=", 1)[0];
    return !(key in values);
  });

  return [
    ...remaining,
    "",
    "# KoboLink generated Day 1 test wallets. Do not commit this file.",
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
  ];
}

const wallets = [createWallet("fan"), createWallet("agent"), createWallet("creator")];
const envValues: Record<string, string> = {};
for (const wallet of wallets) {
  const upper = wallet.role.toUpperCase();
  envValues[`KOBOLINK_${upper}_ADDRESS`] = wallet.address;
  envValues[`KOBOLINK_${upper}_PRIVATE_KEY`] = wallet.privateKey;
}

envValues.X402_PAY_TO_ADDRESS = envValues.KOBOLINK_CREATOR_ADDRESS;

const nextEnvLocal = upsertEnv(await readEnvLocal(), envValues);
await writeFile(envLocalPath, `${nextEnvLocal.join("\n")}\n`, "utf8");

await recordProof("wallets", {
  note: "Public addresses only. Private keys are stored in ignored .env.local, not in this proof file.",
  addresses: wallets.map(({ role, address }) => ({ role, address })),
  x402PayToAddress: envValues.X402_PAY_TO_ADDRESS,
});

console.log("Created KoboLink Day 1 test wallets and wrote them to ignored .env.local.");
for (const wallet of wallets) {
  console.log(`${wallet.role}: ${wallet.address}`);
}
console.log("Next: fund the fan address with Arc Testnet USDC, then run npm run proof:arc-transfer and npm run proof:x402-payment.");
