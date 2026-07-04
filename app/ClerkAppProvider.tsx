'use client';

import { ClerkProvider } from '@clerk/nextjs';

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function clerkConfigured(): boolean {
  return Boolean(clerkPublishableKey && !clerkPublishableKey.includes('replace_me'));
}

export function ClerkAppProvider({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured()) return <>{children}</>;
  return <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>;
}
