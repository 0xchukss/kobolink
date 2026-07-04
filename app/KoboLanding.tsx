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
  x402PriceUsdc: string;
  settlementId: string;
};

type KoboLandingProps = {
  stats: {
    defaultTip: string;
    defaultTipUsdc: string;
    exchangeRate: string;
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

const howItWorks = [
  'Sign in once through the KoboLink entry flow.',
  'Choose whether to list a post or tip your top creators.',
  'Creators manually attach one existing X post at a time by pasting the link, content, and optional media links.',
  'Fans authorize a bounded budget before the agent can spend anything.',
] as const;

export function KoboLanding({ stats, proof }: KoboLandingProps) {
  return (
    <main className='landing-shell'>
      <LandingMotion />
      <header className='landing-nav nav-animate'>
        <a className='brand-lockup' href='#top' aria-label='KoboLink home'>
          <span>KoboLink</span>
        </a>
        <nav aria-label='KoboLink landing navigation'>
          <a className='nav-animate' href='#proof'>Proof</a>
          <a className='nav-animate' href='#how-it-works'>How it works</a>
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
          <strong>{proof.chainId}</strong>
        </div>
        <div className='metric-tile'>
          <span>Arc transfer</span>
          <strong>{proof.arcAmountUsdc} USDC</strong>
        </div>
        <div className='metric-tile'>
          <span>x402 result</span>
          <strong>{proof.x402Status}</strong>
        </div>
        <div className='metric-tile'>
          <span>Default tip</span>
          <strong>{stats.defaultTip}</strong>
        </div>
      </section>

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