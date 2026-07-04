# x402

The x402 payment route returns a real `402 Payment Required` challenge, verifies the Circle Gateway payment payload, settles it through the facilitator, and records the resulting Arc/Circle proof.

Payment requirements are rejected if the network, asset, amount, recipient wallet, or Gateway verifying contract differs from the listing requirement.
