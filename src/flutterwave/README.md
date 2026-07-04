# Flutterwave Bridge

Flutterwave is the Naira bridge only. Runtime deposit and payout paths call the real Flutterwave sandbox API; KoboLink does not create local pending bridge intents or fake credited balances.

Verified Naira balance is counted only from receipts that:
- came from provider mode `real_flutterwave_sandbox`
- match a successful Flutterwave transaction verification
- include the expected `tx_ref`, transaction id, currency, and amount
- are backed by matching `proofs/real-bridge-checkout.json` and `proofs/real-bridge-deposit.json` artifacts for runtime balance and real-mode readiness

Creator tips are not settled by Flutterwave. Tips settle through Arc/Circle/x402 as USDC. Naira payout requests are accepted only when current settled creator-tip earnings cover the requested amount after prior accepted payouts.
