# KoboLink Architecture

## Stack

- Frontend: Next.js App Router.
- Backend: Next API routes plus Node proof/demo scripts.
- Settlement: Arc Testnet + Circle Gateway + x402.
- Naira bridge: Flutterwave sandbox.
- Persistence: local JSON stores for hackathon repeatability.

## Modules

- `src/creator/` - creator profiles, content listings, pricing, and local listing persistence.
- `src/payments/` - Arc/Circle/x402 payment execution, protected tip route logic, and payment logs.
- `src/agents/` - deterministic scoring, budget policy checks, duplicate protection, and real-payment agent execution.
- `src/budgets/` - fan budget policy, ledger math, and Gateway balance snapshots.
- `src/flutterwave/` - sandbox checkout, verification, withdrawal requests, and bridge receipts.
- `src/proofs/` - proof aggregation for the Day 7 Proof Center and `proofs/day7.json`.
- `app/` - landing page, creator workspace, fan budget panel, Flutterwave bridge panel, Proof Center, and API routes.
- `src/data/` - personas and demo creator/listing seed data.

## Payment Boundaries

KoboLink has two separate money stories:

1. Creator tip settlement
   - x402 route: `/x402/pay/[listingId]`.
   - Facilitator: Circle Gateway testnet.
   - Network: Arc Testnet / `arcTestnet` / `eip155:5042002`.
   - Asset: USDC.
   - Proof: payment receipt or Arc transaction hash stored in payment logs.

2. Naira bridge
   - Provider: Flutterwave sandbox.
   - Purpose: familiar local deposit and withdrawal story.
   - Proof: sandbox checkout, verification, and payout request status.
   - Boundary: Flutterwave does not settle creator tips.

## End-to-End Flow

1. Creator creates a listing with X URL, category, Arc wallet, and suggested Naira tip.
2. Fan creates a budget with interests, max tip, and duplicate protections.
3. App reads actual fan wallet/Gateway balance before agent execution.
4. Agent ranks listings by category match, reputation, affordability, content quality, and remaining budget.
5. Agent calls the same x402-protected tip endpoint a normal fan uses.
6. Circle Gateway verifies and settles payment on Arc Testnet.
7. KoboLink appends a payment log only after verified settlement.
8. Budget ledger marks spend and prevents duplicate listing/creator tips.
9. UI shows creator balance, payment proof, agent decisions, and bridge status.
10. `npm run demo:full` packages the evidence into `proofs/day7.json`.

## Current Status

Completed:

- Arc Testnet wallet balance and signed transfer proof.
- x402 `402 -> paid -> settled` proof through Circle Gateway.
- Creator listing form and public feed.
- User-facing fan tip route with persistent settlement logs.
- Fan budget policy and Gateway balance checks.
- Autonomous agent that tips 3 creators with real x402/Circle proofs.
- Flutterwave sandbox checkout and verified deposit credit.
- Proof Center UI and Day 7 combined proof artifact.

Known gap:

- Flutterwave sandbox Naira payout request is blocked by account IP whitelisting. This is documented as a bridge limitation, not a creator-tip settlement failure.