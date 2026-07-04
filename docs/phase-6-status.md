# Phase 6 Status: Flutterwave Sandbox Naira Bridge

Status: passed for verified Naira deposit and bridge UI/API on 2026-06-29.

## What Works

- Fan can create a Flutterwave sandbox checkout for a Naira budget deposit.
- Hosted Flutterwave checkout returned a real sandbox payment link.
- Sandbox card payment was completed through Flutterwave checkout.
- The app verified the Flutterwave transaction by transaction ID.
- Demo Naira balance is credited only after verification.
- Creator withdrawal supports two clearly separated paths:
  - USDC withdrawal request to an Arc wallet.
  - Naira payout request through Flutterwave sandbox.
- UI separates rails:
  - Flutterwave = familiar Naira bridge.
  - Arc/Circle/x402 = USDC creator tip settlement.

## Live Proof

Proof file: `proofs/day6.json`

Deposit:

- Amount: NGN 2,000
- USDC equivalent: 1.290323 USDC
- Status: `credit_applied`
- Provider mode: `real_flutterwave_sandbox`
- Transaction ID: `10334429`
- Response: `Transaction fetched successfully`
- Credited demo balance: NGN 2,000 / 1.290323 USDC

Withdrawal paths:

- Arc wallet withdrawal: `arc_wallet_requested`
- Flutterwave Naira payout request: `sandbox_api_error`
- Flutterwave response: `Please enable IP Whitelisting to access this service`

The payout call reached Flutterwave with valid sandbox keys, but this sandbox account requires transfer IP whitelisting before `/v3/transfers` can succeed.

## Verification

- `npm run demo:bridge`: created real Flutterwave checkout and recorded payout status.
- Hosted checkout completed with sandbox card, PIN, and OTP.
- `POST /api/bridge/deposit/verify`: verified transaction `10334429` and credited demo balance.
- `npm test`: 45 tests passing.
- `npm run ui:build`: passed.

Known warning:

- `next build` still reports the existing Turbopack NFT warning from file-backed local stores. It does not block demo execution.