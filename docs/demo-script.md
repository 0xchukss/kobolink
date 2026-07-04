# KoboLink 3-Minute Demo Script

## 0:00-0:20 - Problem

Nigerian X creators publish valuable threads every day, but monetizing one useful post is still awkward. Subscriptions are too heavy, manual tips are easy to forget, and local users think in Naira even when settlement is onchain.

## 0:20-0:40 - Product

KoboLink is an autonomous tipping agent for Nigerian X creators. Creators list content in Naira/Kobo. Fans fund a budget. The agent decides who to tip, then x402/Circle settles USDC on Arc Testnet.

## 0:40-1:05 - Creator Listing

Show the creator listing form and public feed. Point out X handle, category, Arc wallet, thread URL, suggested Naira tip, Kobo amount, and USDC equivalent.

## 1:05-1:35 - Fan Budget

Show the fan budget panel. Use the NGN 2,000 budget, interests like AI/fintech/startups, max tip cap, category preferences, and duplicate protections. Mention the app checks actual wallet/Gateway balance before the agent spends.

## 1:35-2:10 - Agent Run

Show the agent reasoning panel or run `npm run demo:agent`. The agent tips 3 creators, explains each decision, skips anything outside policy, and updates remaining budget. Emphasize that the agent calls the same x402 payment route a normal fan tip uses.

## 2:10-2:35 - Settlement Proof

Open the Proof Center. Show Arc transfer proof, x402 `402 -> paid -> settled`, latest payment log, and the Day 5 agent proof with 3 unique Circle Gateway receipts on `arcTestnet`.

## 2:35-2:50 - Naira Bridge

Show the Flutterwave bridge panel. Explain: Flutterwave is only the familiar Naira bridge. Arc/Circle/x402 is the creator-tip settlement rail. The verified sandbox deposit credited NGN 2,000; Naira payout is blocked until Flutterwave IP whitelisting is enabled.

## 2:50-3:00 - Close

KoboLink turns Nigerian creator communities into autonomous nanopayment economies: priced locally in Kobo, decided by an agent, and settled as USDC on Arc.

## Backup Terminal Proof

```bash
npm test
npm run ui:build
npm run demo:full
```

Use `proofs/day7.json` as the final proof package during the recording.