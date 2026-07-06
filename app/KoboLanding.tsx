import { HeroLottie } from './components/HeroLottie.js';
import { NigeriaArcMap } from './components/NigeriaArcMap.js';
import { LandingMotion } from './LandingMotion.js';
import { SiteFooter } from './SiteFooter.js';

type TestnetProof = {
  chainId: number;
  arcStatus: string;
  arcAmountUsdc: string;
  arcTxHash: string;
  arcExplorerUrl: string;
  x402Status: string;
  x402Detail?: string;
  x402PriceUsdc: string;
  settlementId: string;
};

type KoboLandingProps = {
  stats: {
    defaultTip: string;
    defaultTipUsdc: string;
    exchangeRate: string;
    blockNumber?: string;
    lastRefreshed?: string;
  };
  proof: TestnetProof;
};

const proofStory = [
  {
    title: 'Creator lists',
    body: 'A Nigerian X creator attaches an existing X post link, creator-pasted post content, optional media links, category, Arc wallet, and suggested Naira tip.',
  },
  {
    title: 'Fan funds',
    body: 'The budget feels local in Naira while the app calculates the USDC amount for Arc.',
  },
  {
    title: 'Agent decides',
    body: 'The policy checks category fit, creator score, quality, budget, and duplicate protection.',
  },
  {
    title: 'Arc settles',
    body: 'x402 gates the tip endpoint, Circle Gateway pays, and Arc testnet proof is recorded.',
  },
] as const;

const faqItems = [
  {
    question: 'What is KoboLink?',
    answer: 'KoboLink is a bounded autonomous tipping agent. Fans authorize a Naira budget, and the agent decides which Nigerian X creators to tip, pays them in USDC on Arc testnet, and records verifiable settlement proof.',
  },
  {
    question: 'Is this real money?',
    answer: 'No. KoboLink runs on Arc testnet USDC and the Flutterwave sandbox. No real funds move anywhere in the current demo.',
  },
  {
    question: 'What fees do I pay?',
    answer: 'None. KoboLink charges no platform fees on testnet. The only cost is Arc testnet gas, and the Naira display rate is shown transparently before you fund a budget.',
  },
  {
    question: 'How does the agent decide who to tip?',
    answer: 'The payment policy checks category fit, creator score, content quality, remaining budget, and duplicate protection before authorizing any tip. Every decision is logged and inspectable.',
  },
  {
    question: 'Can the agent overspend my budget?',
    answer: 'No. You authorize a bounded Naira budget upfront. The agent can never reserve or spend beyond that cap, and the ledger tracks funded, reserved, spent, and remaining amounts.',
  },
  {
    question: 'Where can I verify payments?',
    answer: 'Every settlement is recorded in the Proof Center with Arc explorer links, Circle Gateway settlement IDs, and a proof CLI in the GitHub repository you can run yourself.',
  },
] as const;

const howItWorks = [
  'Sign in once through the KoboLink entry flow.',
  'Choose whether to list a post or tip your top creators.',
  'Creators manually attach one existing X post at a time by pasting the link, content, and optional media links.',
  'Fans authorize a bounded budget before the agent can spend anything.',
] as const;

export function KoboLanding({ stats, proof }: KoboLandingProps) {
  return (
    <main className='landing-shell' id='main-content'>
      <LandingMotion />
      <header className='landing-nav nav-animate'>
        <a className='brand-lockup' href='#top' aria-label='KoboLink home'>
          <img src="/icon.png" alt="" style={{ width: '24px', height: '24px', marginRight: '8px', borderRadius: '4px' }} />
          <span>KoboLink</span>
        </a>
        <nav aria-label='KoboLink landing navigation'>
          <a className='nav-animate' href='#proof'>Proof</a>
          <a className='nav-animate' href='#how-it-works'>How it works</a>
          <a className='nav-animate' href='#faq'>FAQ</a>
        </nav>
      </header>

      <section className='hero-section' id='top'>
        <div className='hero-copy'>
          <p className='hero-kicker hero-line'>Autonomous tipping agent</p>
          <h1 className='hero-line'>Autonomous tips for Nigerian X creators.</h1>
          <p className='hero-sub hero-line'>Fans fund Naira budgets. KoboLink decides, pays, and proves USDC settlement on Arc.</p>
          <div className='hero-actions hero-line'>
            <a className='primary-link' href='/use-link'>Use KoboLink</a>
            <a className='secondary-link' href='/workflows?mode=fan'>Open fan workflow</a>
          </div>
          <div className='verb-stage hero-line' aria-label='KoboLink flow: list, fund, decide, settle'>
            <HeroLottie />
            <span className='sr-only'>List, fund, decide, settle.</span>
          </div>
        </div>
        <div className='hero-map' aria-label='3D Nigeria creator payment map'>
          <NigeriaArcMap />
        </div>
      </section>

      <section className='metric-band' id='proof' aria-label='Live testnet proof metrics'>
        <div className='metric-tile'>
          <span>Arc chain</span>
          <strong>{proof.chainId} {stats.blockNumber ? `(#${stats.blockNumber})` : ''}</strong>
        </div>
        <div className='metric-tile'>
          <span>Arc transfer</span>
          <strong>{proof.arcAmountUsdc} USDC</strong>
        </div>
        <div className='metric-tile'>
          <span>x402 settlement</span>
          <strong>{proof.x402Status}</strong>
          {proof.x402Detail ? <small className='metric-detail'>{proof.x402Detail}</small> : null}
        </div>
        <div className='metric-tile'>
          <span>Default tip</span>
          <strong>{stats.defaultTip}</strong>
        </div>
      </section>
      {stats.lastRefreshed ? (
        <div style={{ textAlign: 'center', marginTop: '-1rem', marginBottom: '2rem', fontSize: '0.875rem', opacity: 0.6 }}>
          Live data retrieved at {stats.lastRefreshed}
        </div>
      ) : null}

      <section className='settlement-strip reveal-block' aria-hidden='true'>
        <div className='strip-line'>Naira budget / creator listing / agent decision / x402 payment / Arc USDC settlement / Flutterwave bridge /</div>
      </section>

      <section className='story-section reveal-block' id='how-it-works'>
        <div className='section-copy'>
          <h2>How it works.</h2>
          <p>KoboLink is not a tipping jar. It is a bounded payment agent that turns creator intent, fan budgets, and testnet receipts into one auditable flow.</p>
        </div>
        <div className='story-grid'>
          {proofStory.map((item) => (
            <article className='story-card' key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='how-section reveal-block' aria-label='KoboLink operating steps'>
        <div className='how-grid'>
          {howItWorks.map((step, index) => (
            <article className='how-card' key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='proof-ledger reveal-block' aria-label='Recorded testnet proof'>
        <article>
          <span>Arc testnet hash</span>
          <a href={proof.arcExplorerUrl} target='_blank' rel='noreferrer'>{proof.arcTxHash}</a>
        </article>
        <article>
          <span>Circle Gateway settlement</span>
          <code>{proof.settlementId}</code>
        </article>
        <article>
          <span>Naira display rate</span>
          <strong>{stats.exchangeRate} per 1 USDC</strong>
        </article>
      </section>

      <section className='reveal-block' style={{ padding: '0 clamp(16px, 4vw, 56px) clamp(48px, 8vw, 96px)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 48px)', marginBottom: '1rem' }}>Creator Listing Dashboard</h2>
        <p style={{ maxWidth: '600px', margin: '0 auto 2rem', opacity: 0.8 }}>
          Here is a preview of how creators manually attach X posts to receive Naira-equivalent USDC tips settled on Arc.
        </p>
        <div style={{ maxWidth: '1000px', margin: '0 auto', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden', background: '#11170f' }}>
          <img src="/screenshots/creator-real-x-proof-gate.png" alt="Creator Listing Dashboard Preview" style={{ width: '100%', display: 'block' }} />
        </div>
      </section>

      <section className='fee-band reveal-block' id='fees' aria-label='What KoboLink costs'>
        <div className='section-copy'>
          <h2>What it costs.</h2>
          <p>No hidden fees. The conversion rate is shown before you fund anything, and the testnet demo charges nothing.</p>
        </div>
        <div className='fee-grid'>
          <article className='fee-tile'>
            <span>Naira display rate</span>
            <strong>{stats.exchangeRate}</strong>
            <small>per 1 USDC, shown before every budget authorization</small>
          </article>
          <article className='fee-tile'>
            <span>Default tip</span>
            <strong>{stats.defaultTip}</strong>
            <small>{stats.defaultTipUsdc} equivalent on Arc</small>
          </article>
          <article className='fee-tile'>
            <span>Platform fee</span>
            <strong>None</strong>
            <small>Testnet demo. Only Arc testnet gas applies; no real funds move.</small>
          </article>
        </div>
      </section>

      <section className='faq-section reveal-block' id='faq' aria-label='Frequently asked questions'>
        <div className='section-copy'>
          <h2>Frequently asked questions.</h2>
          <p>Everything fans and creators ask before running their first bounded tipping agent.</p>
        </div>
        <div className='faq-list'>
          {faqItems.map((item) => (
            <details className='faq-item' key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className='landing-cta-section reveal-block'>
        <div>
          <h2>Enter KoboLink.</h2>
          <p>Sign in, pick a creator or fan workflow, then run only the section that matches what you came to do.</p>
        </div>
        <div className='hero-actions'>
          <a className='primary-link' href='/use-link'>Use KoboLink</a>
          <a className='secondary-link' href='/workflows?mode=fan'>Open fan workflow</a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
