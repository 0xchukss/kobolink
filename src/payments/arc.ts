import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { config } from "../config/env.js";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const privateKeyPattern = /^0x[a-fA-F0-9]{64}$/;
const txHashPattern = /^0x[a-fA-F0-9]{64}$/;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const zeroPrivateKey = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const arcTestnet = defineChain({
  id: config.arc.chainId,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [config.arc.rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan Testnet",
      url: config.arc.explorerUrl,
    },
  },
  testnet: true,
});

export function assertAddress(name: string, value: string | undefined): Address {
  if (!value || !addressPattern.test(value) || value.toLowerCase() === zeroAddress) {
    throw new Error(`${name} must be a non-zero 0x-prefixed EVM address. Received: ${value ?? "<missing>"}`);
  }

  return value as Address;
}

export function assertPrivateKey(name: string, value: string | undefined): Hex {
  if (!value || !privateKeyPattern.test(value) || value.toLowerCase() === zeroPrivateKey) {
    throw new Error(
      `${name} must be a 0x-prefixed 32-byte private key. ` +
        "Run npm run proof:create-wallets, fund the fan wallet from the Arc/Circle testnet faucet, then put the key in .env.",
    );
  }

  return value as Hex;
}

export function assertTxHash(name: string, value: string | undefined): Hex {
  if (!value || !txHashPattern.test(value)) {
    throw new Error(`${name} must be a real 0x-prefixed transaction hash. Received: ${value ?? "<missing>"}`);
  }

  return value as Hex;
}

export function makeArcPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(config.arc.rpcUrl),
  });
}

export function makeArcWalletClient(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);

  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(config.arc.rpcUrl),
  });
}

export function addressFromPrivateKey(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address;
}

export function formatNativeUsdc(value: bigint): string {
  return formatUnits(value, 18);
}

export type ArcTransactionProof = {
  type: "arc-transaction";
  chainId: number;
  network: string;
  transactionHash: Hex;
  from: Address;
  to?: Address;
  valueAtomic: string;
  valueNativeUsdc: string;
  status: "success" | "reverted";
  blockNumber: string;
  explorerUrl: string;
};

export function transactionExplorerUrl(txHash: string): string {
  return `${config.arc.explorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
}

export async function readArcTransactionProof(txHash: Hex): Promise<ArcTransactionProof> {
  const publicClient = makeArcPublicClient();
  const [receipt, transaction] = await Promise.all([
    publicClient.getTransactionReceipt({ hash: txHash }),
    publicClient.getTransaction({ hash: txHash }),
  ]);
  if (receipt.status !== "success") {
    throw new Error(`Arc transaction ${txHash} exists but status is ${receipt.status}.`);
  }

  return {
    type: "arc-transaction",
    chainId: config.arc.chainId,
    network: "eip155:" + config.arc.chainId,
    transactionHash: txHash,
    from: transaction.from,
    to: transaction.to ?? undefined,
    valueAtomic: transaction.value.toString(),
    valueNativeUsdc: formatNativeUsdc(transaction.value),
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    explorerUrl: transactionExplorerUrl(txHash),
  };
}

export function addressExplorerUrl(address: string): string {
  return `${config.arc.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

export async function readArcNativeUsdcBalance(address: Address) {
  const publicClient = makeArcPublicClient();
  const balance = await publicClient.getBalance({ address });

  return {
    address,
    balance,
    formatted: formatNativeUsdc(balance),
  };
}

export async function readArcNativeUsdcBalanceProof(address: Address) {
  const publicClient = makeArcPublicClient();
  const [balance, chainId] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.getChainId(),
  ]);

  if (chainId !== config.arc.chainId) {
    throw new Error("Arc RPC returned chain " + chainId + "; expected " + config.arc.chainId + ".");
  }

  return {
    address,
    chainId,
    network: "eip155:" + chainId,
    balance,
    formatted: formatNativeUsdc(balance),
    addressUrl: addressExplorerUrl(address),
  };
}

export async function sendArcNativeUsdcTransfer(args: {
  privateKey: Hex;
  to: Address;
  amountUsdc: string;
}) {
  const account = privateKeyToAccount(args.privateKey);
  const publicClient = makeArcPublicClient();
  const walletClient = makeArcWalletClient(args.privateKey);
  const value = parseUnits(args.amountUsdc, 18);

  const hash = await walletClient.sendTransaction({
    account,
    to: args.to,
    value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    hash,
    from: account.address,
    to: args.to,
    amount: value,
    formattedAmount: args.amountUsdc,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    explorerUrl: transactionExplorerUrl(hash),
  };
}


