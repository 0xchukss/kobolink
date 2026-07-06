'use client';

import { useAccount } from 'wagmi';
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
  return (
    <main className='signin-shell' id='main-content'>
      <header className='landing-nav workflow-nav'>
        <a className='brand-lockup' href='/' aria-label='KoboLink home'>
          <img src="/icon.png" alt="" style={{ width: '24px', height: '24px', marginRight: '8px', borderRadius: '4px' }} />
          <span>KoboLink</span>
        </a>
        <nav aria-label='KoboLink sign in navigation'>
          <a href='/'>Landing</a>
          <a href='/workflows?mode=fan'>Open fan workflow</a>
        </nav>
      </header>

      <section className='signin-hero'>
        <p className='hero-kicker'>Use KoboLink</p>
        <h1>Connect your wallet.</h1>
      </section>

      <WalletSignInPanel />

      <SiteFooter />
    </main>
  );
}

function WalletSignInPanel() {
  const { isConnected } = useAccount();

  return (
    <>
      <section className='signin-panel' aria-label='KoboLink connect wallet'>
        <div>
          <h2>{isConnected ? 'Welcome to KoboLink.' : 'Connect your wallet to get started.'}</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <appkit-button />
        </div>
      </section>

      {isConnected ? (
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
