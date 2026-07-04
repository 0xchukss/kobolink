'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';

type AppAuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const AppApiAuthContext = createContext<AppAuthFetch | null>(null);

export function AppApiAuthProvider({ children }: { children: ReactNode }) {
  const authFetch = useCallback<AppAuthFetch>(async (input, init = {}) => {
    return fetch(input, {
      ...init,
      credentials: init.credentials ?? 'same-origin',
      headers: {
        ...(init.headers ?? {}),
      },
    });
  }, []);

  return <AppApiAuthContext.Provider value={authFetch}>{children}</AppApiAuthContext.Provider>;
}

export function useAppAuthFetch(): AppAuthFetch {
  const authFetch = useContext(AppApiAuthContext);
  if (!authFetch) throw new Error('Authenticated fetch is unavailable. Sign in before running real testnet actions.');
  return authFetch;
}
