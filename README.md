# KoboLink

Autonomous tipping for Nigerian X creators, priced in Kobo/Naira and settled as USDC on Arc.

## One-Line Pitch

KoboLink lets fans fund a local Naira budget, then an autonomous agent tips Nigerian X creators through x402/Circle payments that settle on Arc Testnet.

## Problem

Nigerian creators publish useful X posts, threads, and explainers, but subscriptions are too heavy for one valuable post. Fans also do not want to manually inspect and tip every creator they follow.

## Solution

Creators list existing X posts by pasting the post link, the post content, and any media links, then set suggested tips in Naira/Kobo. Fans configure a budget, interests, and max tip. The KoboLink agent evaluates the feed, chooses matching creators, executes x402 payments through Circle Gateway on Arc Testnet, and records settlement proof. Flutterwave sandbox provides the familiar Naira deposit/withdrawal bridge story, but it does not settle creator tips.

## Target Users

- Nigerian X creators publishing AI, fintech, startup, news, music, and crypto content.
- Fans and communities that want budgeted support without subscriptions.
- Hackathon judges evaluating real Arc/x402/Circle payment proof.

## Sponsor Tech Used

- Arc Testnet RPC and explorer for settlement proof.
- Circle Gateway `arcTestnet` for x402 payment settlement.
- `@circle-fin/x402-batching` for buyer payment execution and facilitator calls.
- `viem` for Arc Testnet wallet reads and signed transfer proof.
- Flutterwave sandbox for the Naira bridge deposit/withdrawal proof path only.
- Clerk for real app entry and server-side mutation auth.

## What Works Today

- Next.js App Router frontend with creator listings, fan budget controls, agent reasoning, payment logs, Proof Center, and Flutterwave bridge panel.
- Public creator feed is real-mode gated: no compiled seed marketplace feed ships with the app, and stored listings must be creator-attached X status posts with typed post content, optional media links, live URL proof, and an X URL handle that matches the creator handle.
- User-facing `/x402/pay/[listingId]` route returns `402 Payment Required`, verifies Circle Gateway payment, settles through x402, and persists proof.
- Creator balances update only from settled logs whose Circle/Arc proof matches the listing amount and creator wallet. Wrong-recipient or wrong-amount receipts are rejected.
- Fan budget creation reads actual Circle Gateway balance before authorizing spend. In the app, each Clerk user gets a scoped agent wallet and budget ledger; the old global fan wallet env is kept only for CLI proof scripts. `proof:fund-gateway` can deposit Arc testnet USDC into Circle Gateway, and `proof:authorize-budget` refuses underfunded budgets.
- Flutterwave sandbox checkout, verification, and payout are strict proof paths; Naira bridge balance is credited only after a matching verified Flutterwave sandbox transaction, and creator Naira payouts are blocked unless settled Arc/Circle/x402 creator earnings cover the request.
- Creator listing proof uses only creator-attached X status links and typed post content; both the UI listing route and `proof:create-listing` refuse placeholders/mismatched handles, verify the X URL responds live, and record that URL proof without scraping content or media. The shipped app has no X OAuth or posting API routes.
- The autonomous agent refuses to run until at least 3 creator-attached X listings are available and affordable under policy.

## Current Real-Mode Readiness

Run:

```bash
npm run proof:real-mode
```

Current readiness is intentionally not green until every external proof exists. Passing checks now include Flutterwave sandbox keys, live Arc Testnet wallet balance, live Circle Gateway spendable balance, Gateway-backed fan budget, x402/Circle settlement proof, and Circle/x402 wallet env. Clerk server auth, creator listings, strict Flutterwave checkout+deposit proof, payout, and listing-specific tip proof are still required.

Current blockers from the verifier:

- Server-side Clerk mutation auth requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`; POST routes fail closed without a signed-in Clerk user. The UI checks `/api/auth/status` and blocks real workflows until the server verifier is configured.
- No creator-attached X status listings exist in the public feed. Creators attach the post link, post content, and media links manually; KoboLink does not scrape or auto-detect the post.
- Flutterwave sandbox payout has not returned an accepted transfer status backed by settled Arc/Circle/x402 creator earnings; the sandbox account may need payout IP whitelisting.
- No strict `proofs/real-tip.json` artifact matches a settled creator tip log for a creator-attached X listing yet.

Current passed bridge evidence:

- A historical Flutterwave transaction receipt exists in the bridge store, but it no longer credits readiness or UI balance until `proofs/real-bridge-checkout.json` and `proofs/real-bridge-deposit.json` match the same receipt and tx_ref. Payout remains blocked until Flutterwave returns an accepted transfer status and the creator has enough settled tip earnings.

Primary artifacts:

- `proofs/day1.json` - Arc balance, Arc transfer, and x402/Circle settlement proof.
- `data/payment-logs.jsonl` - persistent settled tip logs, filtered to proof-valid rows.
- `data/flutterwave-bridge.json` - Flutterwave sandbox deposit/withdrawal receipts.
- `proofs/real-gateway-funding.json` - live Circle Gateway budget funding proof.
- `proofs/real-bridge-checkout.json` - real Flutterwave sandbox checkout proof for the Naira bridge.
- `proofs/real-bridge-deposit.json` - verified Flutterwave sandbox deposit proof for the Naira bridge; it only counts when it matches the checkout proof.
- `proofs/real-bridge-payout.json` - accepted Flutterwave sandbox payout proof; it only counts when settled Arc/Circle/x402 creator earnings cover accepted payouts for that creator.
- `proofs/real-tip.json` - strict current-listing tip proof written by the UI tip route or `npm run proof:tip-listing`.

## Demo Flow

1. Creator attaches an existing X post link, pastes the post content/media links, and sets a suggested tip in Naira.
2. Fan funds a Naira/USDC budget.
3. Fan creates an agent rule for interests and max tip.
4. Agent scans listings and explains tip/skip decisions.
5. Agent tips 3 creators through the x402 route.
6. Circle Gateway settles USDC on `arcTestnet` and KoboLink records proof.
7. Creator balances update from settled logs only.
8. Flutterwave sandbox shows the separate Naira bridge path.
9. Proof Center shows the evidence in one screen.

## Setup

```bash
npm install
copy .env.example .env.local
npm run proof:create-wallets
npm run proof:arc-balance
npm run dev
```

After funding the generated app agent wallet and configuring Circle, Clerk publishable/secret keys, and Flutterwave sandbox values:

```bash
npm run proof:arc-transfer
npm run proof:x402-payment
npm run proof:create-listing
npm run proof:fund-gateway
npm run proof:authorize-budget
npm run proof:bridge-checkout
npm run proof:bridge-verify
npm run proof:bridge-payout
npm run proof:tip-listing
npm run proof:real-mode
npm run proof:next
npm run proof:agent
npm run proof:bridge-status   # status-only; does not create bridge receipts
npm run proof:full
```

## Neon Postgres Persistence

Set `DATABASE_URL` from Neon and `AGENT_WALLET_ENCRYPTION_KEY` before production use. The app lazily creates the tables in `src/db/schema.sql` and uses Neon only when `DATABASE_URL` exists; local JSON remains the fallback for CLI tests and development without a database. Per-user agent wallet private keys are encrypted with `AGENT_WALLET_ENCRYPTION_KEY` before being stored.

## Test Evidence

```bash
npm test
npm run ui:build
npm run proof:real-mode
```

`npm run proof:listings` prints only current creator-attached listings. The UI listing route and `npm run proof:create-listing` write `proofs/real-listing.json` from explicit creator/post values after a live HTTP check of the attached X status URL. `npm run proof:fund-gateway` deposits enough Arc testnet USDC into Circle Gateway for the existing or env-defined fan budget and writes `proofs/real-gateway-funding.json`. `npm run proof:authorize-budget` writes `proofs/real-budget.json` only after live Circle Gateway balance covers the requested Naira budget. `npm run proof:bridge-checkout` creates a real Flutterwave sandbox checkout from explicit customer/amount env values and writes `proofs/real-bridge-checkout.json`. `npm run proof:bridge-verify` credits Naira bridge balance only after a matching Flutterwave sandbox transaction verifies and writes `proofs/real-bridge-deposit.json`; `proof:real-mode` only accepts the deposit when checkout and verification artifacts match the same receipt and tx_ref. `npm run proof:bridge-payout` sends a real Flutterwave sandbox transfer request from explicit payout env values only after the creator has enough settled Arc/Circle/x402 tip earnings, then writes `proofs/real-bridge-payout.json`. Successful bridge actions from the app UI write the same strict proof artifacts; failed attempts only remain as bridge-store receipts. `npm run proof:tip-listing` pays one current creator-attached listing through a local x402 endpoint and writes `proofs/real-tip.json`; `proof:real-mode` only accepts the tip when that artifact, the current feed item, and the settled payment log match the same receipt/hash. `npm run proof:tip-status` prints only already-settled current-listing tips; it fails until a real listing and enough live Circle Gateway balance exist. `npm run proof:real-mode` is expected to fail until server-side Clerk auth, creator-attached X listings, accepted Flutterwave payout status backed by creator tip earnings, and a settled creator-listing tip exist. `npm run proof:next` writes `proofs/next-actions.json` with the exact env values and commands for the remaining red checks. `npm run proof:agent` runs the real autonomous payment agent and fails unless it can settle 3 unique x402/Circle/Arc tips. `npm run proof:bridge-status` and `npm run proof:full` are status packages, not receipt generators. The local UI runs at `http://localhost:3000` and the Proof Center is available on the landing page.

## Remaining Real-Mode Completion Sequence

The verifier currently has five red checks. Complete them in this order:

1. Run `npm run proof:next` to print the current red checks and save `proofs/next-actions.json`. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`, then run `npm run proof:real-mode`.
2. Fill the creator-attached listing env values `KOBOLINK_CREATOR_X_HANDLE`, `KOBOLINK_CREATOR_DISPLAY_NAME`, `KOBOLINK_CREATOR_WALLET_ADDRESS`, `KOBOLINK_CREATOR_CATEGORY`, `KOBOLINK_LISTING_TITLE`, `KOBOLINK_LISTING_X_URL`, `KOBOLINK_LISTING_POST_CONTENT`, and `KOBOLINK_LISTING_TIP_NGN`, then run `npm run proof:create-listing`; it must reach the X status URL and save live URL evidence in `proofs/real-listing.json`.
3. Run `npm run proof:tip-listing` after the listing exists and Gateway balance covers the listed USDC tip. This must write `proofs/real-tip.json` that matches the current feed and settled payment log.
4. Enable Flutterwave sandbox payout access/IP whitelisting, fill `KOBOLINK_PAYOUT_*`, and request an amount no higher than that creator's settled tip earnings, then run `npm run proof:bridge-payout`.
5. Run `npm run proof:real-mode` again. The goal is green only when all checks pass.

## Known Limitations

- Listing uses creator-attached X status links only. KoboLink does not post to X, expose X OAuth routes, scrape X, or auto-detect post content for the creator listing flow.
- Flutterwave checkout, deposit verification, and payout now have strict `proof:bridge-*` commands. Payout still requires settled creator tip earnings and the sandbox account to pass IP whitelisting before `/v3/transfers` returns an accepted payout status.
- Flutterwave is not the creator-tip settlement rail; tips settle through Arc/Circle/x402 as USDC.
- Without `DATABASE_URL`, data falls back to local JSON for hackathon repeatability. With Neon Postgres configured, creator listings, payment logs, Flutterwave bridge receipts, fan budget ledgers, and encrypted per-user agent wallets persist durably.
- Mainnet payouts are not included.

## Roadmap

1. Create a settled creator tip, then enable Flutterwave payout IP whitelisting and rerun the Naira payout proof.
2. Deploy the Next.js app publicly and verify all submission links.
3. Add database-backed creator onboarding and KMS-backed agent wallet storage.
4. Add live creator feedback and onboard real creator listings.
5. Harden payment operations for retries, monitoring, and payout reconciliation.