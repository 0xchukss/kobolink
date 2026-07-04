import { config } from "../config/env.js";
import { addressFromPrivateKey, readArcNativeUsdcBalance, sendArcNativeUsdcTransfer } from "../payments/arc.js";
import { getCreatorAddress, getFanPrivateKey } from "./env-wallets.js";
import { proofFilePath, recordProof } from "./proof-store.js";

function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function conciseError(error: unknown): string {
  const candidate = error as { shortMessage?: string; message?: string };
  return candidate.shortMessage ?? candidate.message ?? String(error);
}

try {
  const privateKey = getFanPrivateKey();
  const from = addressFromPrivateKey(privateKey);
  const to = getCreatorAddress();
  const senderBalance = await readArcNativeUsdcBalance(from);

  if (senderBalance.balance === 0n) {
    throw new Error(
      `Generated fan wallet ${from} has 0 Arc Testnet USDC. Fund it from the Arc/Circle testnet faucet before running proof:arc-transfer.`,
    );
  }

  const transfer = await sendArcNativeUsdcTransfer({
    privateKey,
    to,
    amountUsdc: config.arc.transferAmountUsdc,
  });
  const recipientBalance = await readArcNativeUsdcBalance(to);

  const proof = {
    ok: transfer.status === "success",
    network: "Arc Testnet",
    chainId: config.arc.chainId,
    from: transfer.from,
    to: transfer.to,
    amountUsdc: transfer.formattedAmount,
    amountAtomic: transfer.amount,
    transactionHash: transfer.hash,
    explorerUrl: transfer.explorerUrl,
    blockNumber: transfer.blockNumber,
    status: transfer.status,
    recipientNativeUsdc: recipientBalance.formatted,
  };

  if (transfer.status !== "success") {
    throw new Error(`Arc transfer transaction ${transfer.hash} did not succeed. Status: ${transfer.status}`);
  }

  await recordProof("arcTransfer", proof);
  console.log(JSON.stringify({ proofFile: proofFilePath(), arcTransfer: proof }, jsonSafe, 2));
} catch (error) {
  const failure = {
    ok: false,
    network: "Arc Testnet",
    chainId: config.arc.chainId,
    error: conciseError(error),
    fundingRequired: conciseError(error).toLowerCase().includes("fund") || conciseError(error).toLowerCase().includes("insufficient"),
  };

  await recordProof("arcTransfer", failure);
  console.error(JSON.stringify({ proofFile: proofFilePath(), arcTransfer: failure }, jsonSafe, 2));
  process.exitCode = 1;
}
