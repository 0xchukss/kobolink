# KoboLink Submission Checklist

## Local Proof

- [x] `npm run demo:full` passes and writes `proofs/day7.json`.
- [x] `proofs/day1.json` contains Arc transfer and x402/Circle settlement proof.
- [x] `proofs/day5.json` contains 3 autonomous agent tips with unique payment proofs.
- [x] `proofs/day6.json` contains verified Flutterwave sandbox deposit proof.
- [x] UI Proof Center shows Arc/x402, agent, payment log, Flutterwave bridge, and caveat status.
- [x] `npm test` passes after final changes.
- [x] `npm run ui:build` passes after final changes.

## Submission Assets

- [x] README explains problem, solution, sponsor tech, proof artifacts, setup, limitations, and roadmap.
- [x] `docs/architecture.md` explains payment boundaries and modules.
- [x] `docs/demo-script.md` is under 3 minutes.
- [x] `docs/phase-7-status.md` has current safe claims and external/manual gaps.
- [x] Screenshots captured from the final local UI.
- [ ] Demo video recorded and uploaded.

## External Links

- [ ] GitHub repo is public.
- [ ] Live app is deployed.
- [ ] Live app loads without error.
- [ ] Demo video link is public or shareable.
- [ ] Arc explorer and Circle receipt links used in the video open correctly.
- [ ] Submission form links are tested in an incognito/private window.

## Claims To Keep Clear

- Flutterwave is the Naira bridge.
- Arc/Circle/x402 settles creator tips as USDC.
- Flutterwave payout is not complete until IP whitelisting is enabled.
- This is a testnet/sandbox hackathon MVP, not production payouts.