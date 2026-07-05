'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';

type AppAuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const AppApiAuthContext = createContext<AppAuthFetch | null>(null);

import { useAccount } from 'wagmi';

export function AppApiAuthProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();

  const authFetch = useCallback<AppAuthFetch>(async (input, init = {}) => {
    const headers = new Headers(init.headers);
    if (address) headers.set('x-wallet-address', address);

    return fetch(input, {
      ...init,
      credentials: init.credentials ?? 'same-origin',
      headers,
    });
  }, [address]);

  return <AppApiAuthContext.Provider value={authFetch}>{children}</AppApiAuthContext.Provider>;
}

export function useAppAuthFetch(): AppAuthFetch {
  const authFetch = useContext(AppApiAuthContext);
  if (!authFetch) throw new Error('Authenticated fetch is unavailable. Sign in before running real testnet actions.');
  return authFetch;
}
