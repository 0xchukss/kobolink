"use client";

import React, { type ReactNode } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, optimism, base, sepolia } from '@reown/appkit/networks';

const queryClient = new QueryClient();

// Get projectId from https://cloud.reown.com
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "97b1a45749fba33e7077a4a9c680f4f9";

const metadata = {
  name: 'KoboLink',
  description: 'Autonomous tipping for Nigerian X creators',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://kobolink.com', 
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

import { defineChain } from '@reown/appkit/networks';

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan Testnet', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

const networks = [arcTestnet];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: arcTestnet,
  projectId,
  metadata,
});

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
