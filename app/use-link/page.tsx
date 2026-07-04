'use client';

import { SignInButton, SignOutButton, useAuth } from '@clerk/nextjs';
import { clerkConfigured } from '../ClerkAppProvider.js';
import { SiteFooter } from '../SiteFooter.js';

const workflows = [
  {
    title: 'List a post',
    body: 'Attach a real X post link, post content, optional media, and Arc wallet settlement details.',
    href: '/workflows?mode=creator#creator-listing',
    className: 'workflow-button creator-choice',
  },
  {
    title: 'Tip your top creators',
    body: 'Open the fan budget, verify Gateway funds, run the agent, and spend through recorded x402/Arc settlement.',
    href: '/workflows?mode=fan#fan-budget',
    className: 'workflow-button fan-choice',
  },
] as const;

export default function UseLinkPage() {
  const configured = clerkConfigured();

  return (
    <main className='signin-shell'>
      <header className='landing-nav workflow-nav'>
        <a className='brand-lockup' href='/' aria-label='KoboLink home'>
          <span>KoboLink</span>
        </a>
        <nav aria-label='KoboLink sign in navigation'>
          <a href='/'>Landing</a>
          <a href='/workflows?mode=fan'>Open fan workflow</a>
        </nav>
      </header>

      <section className='signin-hero'>
        <p className='hero-kicker'>Use KoboLink</p>
        <h1>Sign in to KoboLink.</h1>
      </section>

      {configured ? <ClerkSignInPanel /> : <MissingClerkPanel />}

      <SiteFooter />
    </main>
  );
}

function MissingClerkPanel() {
  return (
    <section className='signin-panel' aria-label='Clerk configuration required'>
      <div>
        <span>Real auth required</span>
        <h2>Clerk is not configured.</h2>
        <p>Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY before using KoboLink. The app will not simulate sign-in.</p>
      </div>
      <button className='primary-action signin-button' disabled type='button'>Configure Clerk</button>
    </section>
  );
}

function ClerkSignInPanel() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <>
      <section className='signin-panel' aria-label='KoboLink sign in'>
        <div>
          <h2>{isSignedIn ? 'Welcome to KoboLink.' : 'Sign in with Clerk.'}</h2>
        </div>
        {isSignedIn ? (
          <SignOutButton>
            <button className='secondary-action signin-button' type='button'>Sign out</button>
          </SignOutButton>
        ) : (
          <SignInButton mode='modal'>
            <button className='primary-action signin-button' disabled={!isLoaded} type='button'>{isLoaded ? 'Sign in with Clerk' : 'Loading Clerk'}</button>
          </SignInButton>
        )}
      </section>

      {isSignedIn ? (
        <section className='workflow-choice-grid' aria-label='Choose KoboLink workflow'>
          {workflows.map((workflow) => (
            <a className={workflow.className} href={workflow.href} key={workflow.title}>
              <span>{workflow.title}</span>
              <p>{workflow.body}</p>
            </a>
          ))}
        </section>
      ) : null}
    </>
  );
}
