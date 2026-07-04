import { addressExplorerUrl, readArcNativeUsdcBalance } from "../payments/arc.js";
import { getFanAddress, getFanPrivateKey, makeGatewayClient } from "./env-wallets.js";
import { proofFilePath, recordProof } from "./proof-store.js";

const address = getFanAddress();
const native = await readArcNativeUsdcBalance(address);

let gateway: Record<string, unknown> | undefined;
try {
  const privateKey = getFanPrivateKey();
  const client = makeGatewayClient(privateKey);
  const balances = await client.getBalances(address);
  gateway = {
    walletUsdc: balances.wallet.formatted,
    gatewayAvailableUsdc: balances.gateway.formattedAvailable,
    gatewayTotalUsdc: balances.gateway.formattedTotal,
  };
} catch (error) {
  gateway = {
    skipped: true,
    reason: (error as Error).message,
  };
}

const proof = {
  ok: true,
  network: "Arc Testnet",
  chainId: 5042002,
  address,
  addressUrl: addressExplorerUrl(address),
  nativeUsdc: native.formatted,
  nativeUsdcAtomic: native.balance,
  gateway,
};

await recordProof("arcBalance", proof);
console.log(JSON.stringify({ proofFile: proofFilePath(), arcBalance: proof }, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
