import { readFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { arcTestnet } from '../src/payments/arc.js';
import { config } from '../src/config/env.js';
import { readX402ProofEvidence, type Day1Proof } from '../src/proofs/day1-evidence.js';
import { formatNaira, formatUsdc } from '../src/utils/currency.js';
import { KoboLanding } from './KoboLanding.js';

export const dynamic = 'force-dynamic';

type LandingProof = {
  chainId: number;
  arcStatus: string;
  arcAmountUsdc: string;
  arcTxHash: string;
  arcExplorerUrl: string;
  x402Status: string;
  x402PriceUsdc: string;
  settlementId: string;
};

export default async function Page() {
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(config.arc.rpcUrl),
  });

  const [proof, blockNumber] = await Promise.all([
    readLandingProof(),
    publicClient.getBlockNumber().catch(() => null),
  ]);

  const lastRefreshed = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  });

  return (
    <KoboLanding
      stats={{
        defaultTip: formatNaira(config.economics.defaultTipNgn),
        defaultTipUsdc: formatUsdc(config.economics.defaultTipNgn / config.economics.ngnPerUsdc),
        exchangeRate: formatNaira(config.economics.ngnPerUsdc),
        blockNumber: blockNumber ? String(blockNumber) : undefined,
        lastRefreshed,
      }}
      proof={proof}
    />
  );
}

async function readLandingProof(): Promise<LandingProof> {
  const day1 = await readDay1Proof();
  const x402Evidence = readX402ProofEvidence(day1);
  const transfer = day1?.arcTransfer;
  const transferOk = Boolean(transfer?.ok && transfer.status === 'success' && transfer.chainId === config.arc.chainId && transfer.transactionHash);

  return {
    chainId: config.arc.chainId,
    arcStatus: transferOk ? 'success' : 'missing',
    arcAmountUsdc: transferOk ? transfer?.amountUsdc ?? '0' : 'missing',
    arcTxHash: transferOk ? transfer?.transactionHash ?? 'missing' : 'missing',
    arcExplorerUrl: transferOk ? transfer?.explorerUrl ?? config.arc.explorerUrl : config.arc.explorerUrl,
    x402Status: x402Evidence.ok ? String(day1?.x402Payment?.challengeStatus) + ' then ' + String(day1?.x402Payment?.payment?.status) : 'missing',
    x402PriceUsdc: x402Evidence.ok ? day1?.x402Payment?.priceUsdc ?? 'missing' : 'missing',
    settlementId: x402Evidence.transaction ?? 'missing',
  };
}

async function readDay1Proof(): Promise<Day1Proof | undefined> {
  try {
    return JSON.parse(await readFile('proofs/day1.json', 'utf8')) as Day1Proof;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
