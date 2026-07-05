import { headers } from 'next/headers';
import { config } from '../../src/config/env.js';
import { readPublicCreatorFeed } from '../../src/creator/listing-store.js';
import { CREATOR_CATEGORIES, TIP_PRESETS_NGN } from '../../src/creator/listings.js';
import { readBridgeState } from '../../src/flutterwave/bridge-store.js';
import { readPaymentStateForFeed } from '../../src/payments/log-store.js';
import { readProofCenterSnapshot } from '../../src/proofs/proof-center.js';
import { formatNaira, formatUsdc } from '../../src/utils/currency.js';
import { CreatorListingApp } from '../CreatorListingApp.js';
import { ProofCenterPanel } from '../ProofCenterPanel.js';
import { AppApiAuthProvider } from '../AppApiAuthContext.js';
import { SiteFooter } from '../SiteFooter.js';

export const dynamic = 'force-dynamic';

type WorkflowMode = 'creator' | 'fan';

type WorkflowsPageProps = {
  searchParams?: Promise<{
    mode?: string;
    role?: string;
  }>;
};

export default async function WorkflowsPage({ searchParams }: WorkflowsPageProps) {
  const params = await searchParams;
  const requestedMode = params?.mode ?? params?.role;
  const mode: WorkflowMode = requestedMode === 'creator' ? 'creator' : 'fan';
  const items = await readPublicCreatorFeed();
  const headersList = await headers();
  const walletAddress = headersList.get("x-wallet-address") ?? undefined;

  const [paymentState, bridgeState, proofCenter] = await Promise.all([
    readPaymentStateForFeed(items),
    readBridgeState(),
    readProofCenterSnapshot(new Date().toISOString(), { liveGateway: true, owner: walletAddress }),
  ]);

  const isCreator = mode === 'creator';

  return (
    <main className='workflow-page' id='main-content'>
      <header className='landing-nav workflow-nav'>
        <a className='brand-lockup' href='/' aria-label='KoboLink home'>
          <span>KoboLink</span>
        </a>
        <nav aria-label='KoboLink workflow navigation'>
          {isCreator ? (
            <a href='#creator-listing'>Listing</a>
          ) : (
            <>
              <a href='#fan-budget'>Budget</a>
              <a href='#naira-bridge'>Bridge</a>
            </>
          )}
          <a href='#proof-center'>Proof</a>
        </nav>
      </header>

      <section className='workflow-hero'>
        <div>
          <p className='hero-kicker'>{isCreator ? 'Creator workflow' : 'Fan workflow'}</p>
          <h1>{isCreator ? 'Attach an existing X post.' : 'Tip your top creators.'}</h1>
          <p>{isCreator ? 'Paste the X link, the post content, and any media links yourself. Fans click through to X; KoboLink does not scrape, detect, or post for you.' : 'Fund a budget, run the agent, and tip creators from manually attached X posts.'}</p>
        </div>
        <div className='header-metrics' aria-label='Settlement defaults'>
          <div>
            <span>Default tip</span>
            <strong>{formatNaira(config.economics.defaultTipNgn)}</strong>
          </div>
          <div>
            <span>USDC quote</span>
            <strong>{formatUsdc(config.economics.defaultTipNgn / config.economics.ngnPerUsdc)}</strong>
          </div>
          <div>
            <span>Rate</span>
            <strong>{formatNaira(config.economics.ngnPerUsdc)}</strong>
          </div>
        </div>
      </section>

      <section className='workflow-app-shell'>
        <AppApiAuthProvider>
          <CreatorListingApp
            mode={mode}
            initialItems={items}
            initialPaymentState={paymentState}
            initialBridgeState={bridgeState}
            initialMeta={{
              ngnPerUsdc: config.economics.ngnPerUsdc,
              categories: CREATOR_CATEGORIES,
              contentTypes: ['x-thread'],
              tipPresetsNgn: TIP_PRESETS_NGN,
            }}
          />
        </AppApiAuthProvider>
      </section>

      <ProofCenterPanel snapshot={proofCenter} />
      <SiteFooter />
    </main>
  );
}