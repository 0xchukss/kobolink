'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { CreatorWithdrawalPanel } from './CreatorWithdrawalPanel.js';
import { FanBudgetPanel } from './FanBudgetPanel.js';
import { FlutterwaveBridgePanel } from './FlutterwaveBridgePanel.js';
import { useAppAuthFetch } from './AppApiAuthContext.js';
import type { PublicCreatorFeedItem } from '../src/creator/listing-store.js';
import type { CreatorBalance, PaymentLog } from '../src/payments/tips.js';
import type { FlutterwaveBridgeSnapshot } from '../src/flutterwave/bridge.js';

type ListingsMeta = {
  ngnPerUsdc: number;
  categories: readonly string[];
  contentTypes: readonly string[];
  tipPresetsNgn: readonly number[];
};

type PaymentState = {
  logs: PaymentLog[];
  balances: CreatorBalance[];
};


type DemoMode = 'creator' | 'fan';
type FanWorkflowStep = 'budget' | 'bridge' | 'feed';

const fanWorkflowSteps: Array<{ id: FanWorkflowStep; label: string; body: string }> = [
  { id: 'budget', label: 'Fan budget', body: 'Fund USDC, assign spend authority.' },
  { id: 'bridge', label: 'Naira bridge', body: 'Show local deposit and payout rails.' },
  { id: 'feed', label: 'Creator feed', body: 'Review posts and settle tips.' },
];

type CreatorListingAppProps = {
  mode: DemoMode;
  initialItems: PublicCreatorFeedItem[];
  initialMeta: ListingsMeta;
  initialPaymentState: PaymentState;
  initialBridgeState: FlutterwaveBridgeSnapshot;
};

type FormState = {
  xHandle: string;
  displayName: string;
  walletAddress: string;
  category: string;
  title: string;
  url: string;
  postContent: string;
  mediaUrls: string;
  suggestedTipNgn: string;
  type: string;
};

type StatusState = {
  kind: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

const initialForm: FormState = {
  xHandle: '',
  displayName: '',
  walletAddress: '',
  category: 'ai',
  title: '',
  url: '',
  postContent: '',
  mediaUrls: '',
  suggestedTipNgn: '150',
  type: 'x-thread',
};

const wizardSteps = [
  { title: 'Creator profile', body: 'Identify the X creator and settlement wallet.' },
  { title: 'Attach X post', body: 'Paste the existing X post link, the post content, and any media links. KoboLink stores only what the creator supplies.' },
  { title: 'Naira tip', body: 'Set the local amount while KoboLink quotes USDC for Arc.' },
  { title: 'Review listing', body: 'Confirm the listing before it appears in the public feed.' },
] as const;

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-NG');

export function CreatorListingApp({ mode, initialItems, initialMeta, initialPaymentState, initialBridgeState }: CreatorListingAppProps) {
  const authFetch = useAppAuthFetch();
  const [items, setItems] = useState(initialItems);
  const [meta, setMeta] = useState(initialMeta);
  const [paymentLogs, setPaymentLogs] = useState(initialPaymentState.logs);
  const [balances, setBalances] = useState(initialPaymentState.balances);
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: 'Ready' });
  const [tipStatus, setTipStatus] = useState<StatusState>({ kind: 'idle', message: 'No tip running' });
  const [activeTipId, setActiveTipId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [fanStep, setFanStep] = useState<FanWorkflowStep>('budget');

  const isCreatorMode = mode === 'creator';
  const isFanMode = mode === 'fan';

  useEffect(() => {
    let active = true;
    setStatus({ kind: 'loading', message: 'Refreshing feed' });

    Promise.all([
      fetch('/api/listings', { cache: 'no-store' }).then(async (response) => {
        const payload = await response.json() as { items?: PublicCreatorFeedItem[]; meta?: ListingsMeta; error?: string };
        if (!response.ok || !payload.items || !payload.meta) {
          throw new Error(payload.error ?? 'Could not load listings');
        }
        return payload;
      }),
      fetch('/api/tips', { cache: 'no-store' }).then(async (response) => {
        const payload = await response.json() as PaymentState & { error?: string };
        if (!response.ok || !payload.logs || !payload.balances) {
          throw new Error(payload.error ?? 'Could not load payment state');
        }
        return payload;
      }),
    ])
      .then(([listingPayload, paymentPayload]) => {
        if (!active) return;
        setItems(listingPayload.items ?? []);
        setMeta(listingPayload.meta ?? initialMeta);
        setPaymentLogs(paymentPayload.logs);
        setBalances(paymentPayload.balances);
        setStatus({ kind: 'idle', message: 'Ready' });
        setTipStatus({ kind: 'idle', message: String(paymentPayload.logs.length) + ' payment logs' });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load listings' });
      });

    return () => {
      active = false;
    };
  }, [initialMeta]);


  const quote = useMemo(() => {
    const amountNgn = Number(form.suggestedTipNgn);
    const safeAmount = Number.isFinite(amountNgn) && amountNgn >= 0 ? amountNgn : 0;
    return {
      ngn: safeAmount,
      kobo: Math.round(safeAmount * 100),
      usdc: meta.ngnPerUsdc > 0 ? safeAmount / meta.ngnPerUsdc : 0,
    };
  }, [form.suggestedTipNgn, meta.ngnPerUsdc]);

  const latestLogByListing = useMemo(() => {
    const map = new Map<string, PaymentLog>();
    for (const log of paymentLogs) {
      if (!map.has(log.contentId)) map.set(log.contentId, log);
    }
    return map;
  }, [paymentLogs]);

  const balanceByCreator = useMemo(() => {
    const map = new Map<string, CreatorBalance>();
    for (const balance of balances) map.set(balance.creatorId, balance);
    return map;
  }, [balances]);

  const currentWizard = wizardSteps[wizardStep] ?? wizardSteps[0];
  const isLastWizardStep = wizardStep === wizardSteps.length - 1;
  const canAdvance = isStepComplete(wizardStep, form);
  const fanStepIndex = fanWorkflowSteps.findIndex((step) => step.id === fanStep);
  const showFanBudget = isFanMode && fanStep === 'budget';
  const showFanBridge = isFanMode && fanStep === 'bridge';
  const showFanFeed = !isFanMode || fanStep === 'feed';

  function goToFanStep(step: FanWorkflowStep) {
    setFanStep(step);
  }

  function nextFanStep() {
    const next = fanWorkflowSteps[Math.min(fanStepIndex + 1, fanWorkflowSteps.length - 1)];
    if (next) setFanStep(next.id);
  }

  function previousFanStep() {
    const previous = fanWorkflowSteps[Math.max(fanStepIndex - 1, 0)];
    if (previous) setFanStep(previous.id);
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isLastWizardStep) {
      nextWizardStep();
      return;
    }

    for (let step = 0; step < wizardSteps.length - 1; step += 1) {
      if (!isStepComplete(step, form)) {
        setWizardStep(step);
        setStatus({ kind: 'error', message: 'Complete ' + (wizardSteps[step]?.title.toLowerCase() ?? 'this step') });
        return;
      }
    }

    if (form.type === 'x-thread' && !isXStatusUrl(form.url)) {
      setWizardStep(1);
      setStatus({ kind: 'error', message: 'Attach a real x.com or twitter.com status URL before creating a listing' });
      return;
    }

    setStatus({ kind: 'loading', message: 'Saving listing' });

    try {
      const response = await authFetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, suggestedTipNgn: Number(form.suggestedTipNgn) }),
      });
      const payload = await response.json() as { item?: PublicCreatorFeedItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? 'Could not save listing');

      const created = payload.item;
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setStatus({ kind: 'success', message: 'Listed ' + created.title });
      setForm((current) => ({ ...current, title: '', url: '', postContent: '', mediaUrls: '' }));
      setWizardStep(1);
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save listing' });
    }
  }

  async function tipListing(item: PublicCreatorFeedItem) {
    setActiveTipId(item.id);
    setTipStatus({ kind: 'loading', message: 'Paying ' + item.creator.xHandle });

    try {
      const response = await authFetch('/api/tips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listingId: item.id }),
      });
      const payload = await response.json() as { logs?: PaymentLog[]; balances?: CreatorBalance[]; error?: string };
      if (!response.ok || !payload.logs || !payload.balances) {
        throw new Error(payload.error ?? 'Could not settle tip');
      }

      setPaymentLogs(payload.logs);
      setBalances(payload.balances);
      setTipStatus({ kind: 'success', message: 'Settled ' + formatNaira(item.suggestedTipNgn) + ' on Arc' });
    } catch (error) {
      setTipStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not settle tip' });
    } finally {
      setActiveTipId(null);
    }
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function nextWizardStep() {
    if (!canAdvance) {
      setStatus({ kind: 'error', message: 'Complete ' + currentWizard.title.toLowerCase() });
      return;
    }
    setStatus({ kind: 'idle', message: 'Ready' });
    setWizardStep((current) => Math.min(current + 1, wizardSteps.length - 1));
  }

  function previousWizardStep() {
    setStatus({ kind: 'idle', message: 'Ready' });
    setWizardStep((current) => Math.max(current - 1, 0));
  }

  return (
    <section className={'workspace ' + (isCreatorMode ? 'creator-workspace' : 'fan-workspace')} id={isCreatorMode ? 'creator-listing' : 'fan-workspace'}>
      {isCreatorMode ? (
        <div className='panel form-panel'>
          <div className='panel-heading'>
            <div>
              <p className='eyebrow'>Listing wizard</p>
              <h2>Creator listing</h2>
            </div>
            {status.kind !== 'idle' && status.message !== 'Ready' && status.message !== "Wallet connection required" ? <span className={'status-dot ' + status.kind}>{status.message}</span> : null}
          </div>


          <div className='wizard-progress' aria-label='Creator listing progress'>
            {wizardSteps.map((step, index) => (
              <button className={index === wizardStep ? 'wizard-step active' : index < wizardStep ? 'wizard-step complete' : 'wizard-step'} key={step.title} onClick={() => setWizardStep(index)} type='button'>
                <span>{index + 1}</span>
                <strong>{step.title}</strong>
              </button>
            ))}
          </div>

          <form className='listing-form' onSubmit={submitListing}>
            <div className='wizard-card'>
              <p className='form-helper'>Step {wizardStep + 1} of {wizardSteps.length}</p>
              <h3>{currentWizard.title}</h3>
              <p>{currentWizard.body}</p>

              {wizardStep === 0 ? (
                <div className='wizard-fields'>
                  <div className='form-grid two'>
                    <label><span>X handle</span><input value={form.xHandle} onChange={(event) => updateField('xHandle', event.target.value)} placeholder='creatorhandle' required /></label>
                    <label><span>Display name</span><input value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} required /></label>
                  </div>
                  <div className='form-grid two'>
                    <label>
                      <span>Creator category</span>
                      <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
                        {meta.categories.map((category) => <option key={category} value={category}>{labelForCategory(category)}</option>)}
                      </select>
                    </label>
                    <label><span>Arc wallet</span><input value={form.walletAddress} onChange={(event) => updateField('walletAddress', event.target.value)} required /></label>
                  </div>
                </div>
              ) : null}

              {wizardStep === 1 ? (
                <div className='wizard-fields'>
                  <label><span>Title</span><input value={form.title} onChange={(event) => updateField('title', event.target.value)} required /></label>
                  <label><span>Existing X post link</span><input type='url' value={form.url} onChange={(event) => updateField('url', event.target.value)} placeholder='https://x.com/creator/status/123' required /></label>
                  <label><span>Post content pasted by creator</span><textarea value={form.postContent} onChange={(event) => updateField('postContent', event.target.value)} rows={4} placeholder='Paste the visible text from the X post' required /></label>
                  <label><span>Media links pasted by creator, optional</span><textarea value={form.mediaUrls} onChange={(event) => updateField('mediaUrls', event.target.value)} rows={3} placeholder='One existing image/video URL per line; KoboLink does not fetch media automatically' /></label>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className='wizard-fields'>
                  <div className='tip-row' aria-label='Suggested tip presets'>
                    {meta.tipPresetsNgn.map((tip) => (
                      <button className={Number(form.suggestedTipNgn) === tip ? 'preset active' : 'preset'} key={tip} onClick={() => updateField('suggestedTipNgn', String(tip))} type='button'>{formatNaira(tip)}</button>
                    ))}
                  </div>
                  <div className='form-grid two align-end'>
                    <label><span>Suggested tip</span><input inputMode='numeric' min={50} type='number' value={form.suggestedTipNgn} onChange={(event) => updateField('suggestedTipNgn', event.target.value)} required /></label>
                    <div className='quote-box' aria-live='polite'><strong>{formatNaira(quote.ngn)}</strong><span>{formatKobo(quote.kobo)} / {formatUsdc(quote.usdc)}</span></div>
                  </div>
                </div>
              ) : null}

              {wizardStep === 3 ? (
                <div className='review-grid' aria-label='Listing review'>
                  <div><span>Creator</span><strong>{form.displayName || 'Unnamed creator'} / {form.xHandle ? '@' + form.xHandle.replace(/^@/, '') : 'Missing X handle'}</strong></div>
                  <div><span>Category</span><strong>{labelForCategory(form.category)}</strong></div>
                  <div><span>Content</span><strong>{form.title || 'Untitled'}</strong></div>
                  <div><span>Tip quote</span><strong>{formatNaira(quote.ngn)} / {formatUsdc(quote.usdc)}</strong></div>
                  <div className='wide'><span>Settlement wallet</span><strong>{form.walletAddress}</strong></div>
                  <div className='wide'><span>Existing X post link</span><strong>{form.url || 'Missing real post URL'}</strong></div>
                </div>
              ) : null}
            </div>

            <div className='wizard-actions'>
              <button className='secondary-action' disabled={wizardStep === 0 || status.kind === 'loading'} onClick={previousWizardStep} type='button'>Back</button>
              {isLastWizardStep ? <button className='primary-action' type='submit' disabled={status.kind === 'loading'}>Create listing</button> : <button className='primary-action' disabled={!canAdvance || status.kind === 'loading'} onClick={nextWizardStep} type='button'>Next</button>}
            </div>
          </form>
        </div>
      ) : null}

      <div className='feed-column'>
        {isFanMode ? <FanWorkflowStepper activeStep={fanStep} onStepChange={goToFanStep} /> : null}
        {isCreatorMode ? <CreatorWithdrawalPanel initialState={initialBridgeState} balances={balances} /> : null}

        {showFanBudget ? (
          <section className='fan-stage' aria-label='Fan budget setup'>
            <FanBudgetPanel categories={meta.categories} ngnPerUsdc={meta.ngnPerUsdc} showAgentRunner={false} />
            <FanStageActions currentStep={fanStepIndex} onBack={previousFanStep} onNext={nextFanStep} nextLabel='Next: Naira bridge' />
          </section>
        ) : null}

        {showFanBridge ? (
          <section className='fan-stage' aria-label='Naira bridge setup'>
            <FlutterwaveBridgePanel initialState={initialBridgeState} />
            <FanStageActions currentStep={fanStepIndex} onBack={previousFanStep} onNext={nextFanStep} nextLabel='Next: creator feed' />
          </section>
        ) : null}

        {showFanFeed ? (
          <>
            {isFanMode ? <FanBudgetPanel categories={meta.categories} ngnPerUsdc={meta.ngnPerUsdc} showSetup={false} /> : null}

            <div className='panel-heading feed-heading'>
              <div>
                <p className='eyebrow'>{isCreatorMode ? 'Public feed preview' : 'Fan tipping feed'}</p>
                <h2>{isCreatorMode ? 'Listed creator posts' : 'Creator feed'}</h2>
              </div>
              <span>Rate: {formatNaira(meta.ngnPerUsdc)} / 1 USDC</span>
            </div>

            {isFanMode ? (
              <div className='phase3-status'>
                <div><p className='eyebrow'>Live settlement</p><strong>Fan tip settlement</strong></div>
                <span className={'status-dot ' + tipStatus.kind}>{tipStatus.message}</span>
              </div>
            ) : null}
            {items.length === 0 ? (
              <div className='empty-feed-state'>
                <strong>No creator posts yet.</strong>
                <p>Creator-attached X posts will appear here after listing.</p>
              </div>
            ) : (
              <div className='feed-list'>
                {items.map((item) => {
                const latestLog = latestLogByListing.get(item.id);
                const balance = balanceByCreator.get(item.creatorId);
                const isTipping = activeTipId === item.id;
                const balanceLabel = balance ? formatNaira(balance.amountNgn) + ' / ' + formatUsdc(balance.amountUsdc) : 'No settled tips';

                return (
                  <article className='listing-card' key={item.id}>
                    <div className='listing-topline'><span>{item.creator.xHandle}</span><span>{labelForCategory(item.creator.category)}</span><span>{item.source}</span></div>
                    <h3>{item.title}</h3>
                    <p className='manual-content-label'>Post content pasted by creator</p>
                    <p>{item.description}</p>
                    <a className='attached-post-link' href={item.url} rel='noreferrer' target='_blank'>Open X post on X</a>
                    {(item.mediaUrls ?? []).length > 0 ? (
                      <div className='media-link-list'>
                        {(item.mediaUrls ?? []).map((mediaUrl, index) => <a href={mediaUrl} key={mediaUrl} rel='noreferrer' target='_blank'>Open creator media link {index + 1}</a>)}
                      </div>
                    ) : null}
                    <div className='price-line'><strong>{formatNaira(item.suggestedTipNgn)}</strong><span>{formatKobo(item.suggestedTipKobo)}</span><span>{formatUsdc(item.suggestedTipUsdc)}</span></div>

                    {isFanMode ? (
                      <>
                        <div className='tip-action-row'>
                          <button className='tip-action' disabled={activeTipId !== null} onClick={() => void tipListing(item)} type='button'>{isTipping ? 'Settling on Arc' : 'Tip ' + formatNaira(item.suggestedTipNgn)}</button>
                          <span>Creator balance: {balanceLabel}</span>
                        </div>
                        {latestLog ? (
                          <div className={'payment-proof ' + latestLog.status}>
                            <span>{latestLog.status === 'settled' ? 'Settled on Arc' : latestLog.status}</span>
                            <strong>{latestLog.transactionHash ?? latestLog.paymentReceipt ?? latestLog.error}</strong>
                            {latestLog.explorerUrl ? <a href={latestLog.explorerUrl} target='_blank' rel='noreferrer'>View explorer proof</a> : null}
                            {!latestLog.explorerUrl && latestLog.receiptUrl ? <a href={latestLog.receiptUrl} target='_blank' rel='noreferrer'>View Circle receipt</a> : null}
                            <small>{latestLog.settledAt ?? latestLog.createdAt}</small>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    <div className='route-line'><span>{item.x402PaymentPath}</span><span>{item.createdAt.slice(0, 10)}</span></div>
                  </article>
                );
                })}
              </div>
            )}

            {isFanMode ? <FanStageActions currentStep={fanStepIndex} onBack={previousFanStep} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function FanWorkflowStepper({ activeStep, onStepChange }: { activeStep: FanWorkflowStep; onStepChange: (step: FanWorkflowStep) => void }) {
  return (
    <nav className='fan-workflow-stepper' aria-label='Fan workflow steps'>
      {fanWorkflowSteps.map((step, index) => (
        <button className={step.id === activeStep ? 'active' : ''} key={step.id} onClick={() => onStepChange(step.id)} type='button'>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{step.label}</strong>
          <small>{step.body}</small>
        </button>
      ))}
    </nav>
  );
}

function FanStageActions({ currentStep, onBack, onNext, nextLabel }: { currentStep: number; onBack: () => void; onNext?: () => void; nextLabel?: string }) {
  return (
    <div className='fan-stage-actions'>
      <button className='secondary-action' disabled={currentStep <= 0} onClick={onBack} type='button'>Back</button>
      {onNext ? <button className='primary-action' onClick={onNext} type='button'>{nextLabel ?? 'Next'}</button> : null}
    </div>
  );
}

function isStepComplete(step: number, form: FormState): boolean {
  if (step === 0) return Boolean(form.xHandle.trim() && form.displayName.trim() && form.walletAddress.trim() && form.category.trim());
  if (step === 1) {
    if (!form.type.trim() || !form.title.trim() || !form.url.trim() || !form.postContent.trim()) return false;
    if (form.type === 'x-thread') return isXStatusUrl(form.url);
    return isHttpUrl(form.url);
  }
  if (step === 2) {
    const amount = Number(form.suggestedTipNgn);
    return Number.isFinite(amount) && amount >= 50;
  }
  return true;
}

function isXStatusUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return (host === 'x.com' || host === 'twitter.com') && /^\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function labelForCategory(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
}

function formatNaira(value: number): string {
  return nairaFormatter.format(value);
}

function formatKobo(value: number): string {
  return numberFormatter.format(value) + ' kobo';
}

function formatUsdc(value: number): string {
  const fixed = value.toFixed(6);
  const trimmedZeroes = fixed.replace(/0+$/, '');
  const clean = trimmedZeroes.endsWith('.') ? trimmedZeroes.slice(0, -1) : trimmedZeroes;
  return clean + ' USDC';
}