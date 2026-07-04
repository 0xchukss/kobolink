# Phase 1 Scope

## Goal

Create a proof-first foundation for KoboLink: an autonomous tipping layer for Nigerian X creators, priced in Kobo/Naira and settled as USDC on Arc through x402.

## MVP definition

The hackathon MVP is successful when:

1. A Nigerian X creator can attach an existing X post link, paste the post content, and optionally add media links.
2. A fan can define a tipping budget.
3. An autonomous agent can choose creators to tip and explain why.
4. Tips settle in USDC on Arc through x402.
5. The UI shows local Naira/Kobo equivalents.
6. Flutterwave sandbox demonstrates Naira deposit and withdrawal flows.

Phase 1 proves the payment spine is real before the product UI expands.

## Demo personas

### 1. Nigerian X Creator

- Example: Adaobi Okoro.
- Goal: earn from individual X posts without forcing fans into subscriptions.
- Demo action: attach an existing AI/fintech X post, paste its content/media links, and set a suggested tip.

### 2. Fan / Community Member

- Example: Chuks.
- Goal: support useful Nigerian creators with a small weekly budget.
- Demo action: fund a demo budget and ask the tipping agent to support AI creators.

### 3. Autonomous Tipping Agent

- Example: KoboLink Tipping Agent.
- Goal: evaluate content, decide who deserves support, and execute x402/Arc tips.
- Demo action: tip three creators, explain the decisions, and show remaining budget.

## Day 1 stack

- Frontend: Next.js App Router.
- Backend: Next API routes plus Node proof scripts.
- Settlement: Arc Testnet, Circle Gateway `arcTestnet`, x402.
- Naira bridge: Flutterwave sandbox only.
- Wallet/RPC tooling: `viem`.
- Proof artifact: `proofs/day1.json`.

## Day 1 proof commands

```bash
npm run proof:create-wallets
npm run proof:arc-balance
npm run proof:arc-transfer
npm run proof:x402-payment
```

## Current status

Completed:

- Repo runs locally.
- TypeScript builds.
- Next production build passes.
- Browser verification passes: page has content and no Next.js error overlay.
- Product scope is clear.
- Payment boundaries are explicit.
- Test wallets are generated into ignored `.env.local`.
- Arc Testnet balance is read through the RPC.
- Real Arc Testnet transfer from fan to creator succeeds.
- x402 protected endpoint returns `402` before payment.
- Circle Gateway verifies and settles the x402 payment on `arcTestnet`.
- `proofs/day1.json` records current proof state.

Proof evidence:

- Fan: `0x6BAeB217DBF5B53c9A1Ba88750fFF6c0cA7931E3`
- Agent: `0x940BC8e06210D248C5d834E9533633C36A62f916`
- Creator: `0x68e7DB2E572e0e58bea085b28689b9948DF70aAD`
- Arc tx hash: `0xc8bd910ecec9ed911478132cb788955cb5a9adc301241375faaa438d22f8b802`
- Arc explorer: `https://testnet.arcscan.app/tx/0xc8bd910ecec9ed911478132cb788955cb5a9adc301241375faaa438d22f8b802`
- x402 challenge status: `402`
- x402 amount: `0.01` USDC
- Circle Gateway settlement ID: `c9403191-59c1-42b6-b340-1df38fd5d563`
- Gateway available balance after x402 payment: `0.99` USDC

## Next action

Wire the verified proof path into the user-facing tip route so a listing tip uses the working x402/Circle Gateway settlement flow instead of a demo log.

Then continue Phase 2:

```bash
npm run demo:listings
```

## Risks and mitigations

- Risk: product looks like a generic tipping marketplace.
  - Mitigation: make the autonomous tipping agent the hero.
- Risk: Naira integration is overclaimed.
  - Mitigation: describe Flutterwave as sandbox on/off-ramp demo only.
- Risk: no visible payment proof.
  - Mitigation: every proof command writes `proofs/day1.json` and the current x402 proof settles through Circle Gateway.
- Risk: too much scope.
  - Mitigation: avoid social feeds, mobile apps, production payouts, and complex analytics until core tipping works.

## Do not build yet

- Full creator marketplace.
- Production bank payout compliance.
- Real-time X scraping.
- Complex recommendation engine.
- Native mobile app.
