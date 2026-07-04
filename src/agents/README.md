# Autonomous Payment Agent

The agent operates on current creator-attached X listings only. It reads a Gateway-backed fan budget, applies deterministic policy checks, calls the x402 payment endpoint, and records only settled payment proofs.

The agent refuses to complete a real run unless the requested number of tips have unique settlement proof.
