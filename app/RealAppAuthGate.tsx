'use client';

import { SignInButton, UserButton, useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { AppApiAuthProvider } from './AppApiAuthContext.js';
import { clerkConfigured } from './ClerkAppProvider.js';

type RealAppAuthGateProps = {
  children: React.ReactNode;
};

type AuthStatus = {
  loading: boolean;
  ok: boolean;
  missing: string[];
};

export function RealAppAuthGate({ children }: RealAppAuthGateProps) {
  const authStatus = useAuthStatus();

  if (!clerkConfigured()) {
    return <AuthSetupPanel detail='Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY before using creator listings, fan budgets, bridge actions, or real tips.' />;
  }

  return <ClerkWorkflowGate authStatus={authStatus}>{children}</ClerkWorkflowGate>;
}

function AuthSetupPanel({ detail }: { detail: string }) {
  return (
    <section className='signin-panel app-auth-panel' aria-label='KoboLink auth setup'>
      <div>
        <span>Auth setup required</span>
        <h2>KoboLink auth is not configured.</h2>
        <p>{detail}</p>
      </div>
    </section>
  );
}

function useAuthStatus(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>({ loading: true, ok: false, missing: [] });

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { clerk?: { ok?: boolean; missing?: string[] } };
        if (!response.ok || !payload.clerk) throw new Error('auth status unavailable');
        return payload.clerk;
      })
      .then((clerk) => {
        if (!active) return;
        setStatus({ loading: false, ok: Boolean(clerk.ok), missing: Array.isArray(clerk.missing) ? clerk.missing : [] });
      })
      .catch(() => {
        if (!active) return;
        setStatus({ loading: false, ok: false, missing: ['server auth status'] });
      });

    return () => {
      active = false;
    };
  }, []);

  return status;
}

function ClerkWorkflowGate({ children, authStatus }: RealAppAuthGateProps & { authStatus: AuthStatus }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && isSignedIn && authStatus.ok) {
    return (
      <AppApiAuthProvider>
        {children}
      </AppApiAuthProvider>
    );
  }

  const missing = !authStatus.loading && !authStatus.ok ? 'Missing server auth: ' + authStatus.missing.join(', ') : '';

  return (
    <section className='signin-panel app-auth-panel' aria-label='KoboLink sign in required'>
      <div>
        <span>Use KoboLink</span>
        <h2>{isLoaded && isSignedIn ? 'Complete auth setup.' : 'Sign in to continue.'}</h2>
        {missing ? <p>{missing}</p> : null}
      </div>
      {isLoaded && isSignedIn ? (
        <UserButton />
      ) : (
        <SignInButton mode='modal'>
          <button className='primary-action signin-button' type='button'>{isLoaded ? 'Sign in with Clerk' : 'Loading sign in'}</button>
        </SignInButton>
      )}
    </section>
  );
}
