import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import type { Address, Hex } from "viem";

import { config } from "../config/env.js";
import { addressFromPrivateKey, assertAddress, assertPrivateKey } from "../payments/arc.js";

const zeroAddress = "0x0000000000000000000000000000000000000000";

export function getFanPrivateKey(): Hex {
  return assertPrivateKey(
    "KOBOLINK_FAN_PRIVATE_KEY",
    process.env.KOBOLINK_FAN_PRIVATE_KEY ?? process.env.ARC_TESTNET_PRIVATE_KEY,
  );
}

export function getFanAddress(): Address {
  const privateKey = process.env.KOBOLINK_FAN_PRIVATE_KEY ?? process.env.ARC_TESTNET_PRIVATE_KEY;
  if (privateKey) return addressFromPrivateKey(assertPrivateKey("KOBOLINK_FAN_PRIVATE_KEY", privateKey));

  return assertAddress("KOBOLINK_FAN_ADDRESS", process.env.KOBOLINK_FAN_ADDRESS ?? config.circle.devWalletAddress);
}

export function getCreatorAddress(): Address {
  const value = process.env.KOBOLINK_CREATOR_ADDRESS ?? config.x402.payToAddress;
  const address = assertAddress("KOBOLINK_CREATOR_ADDRESS or X402_PAY_TO_ADDRESS", value);

  if (address.toLowerCase() === zeroAddress) {
    throw new Error("Set KOBOLINK_CREATOR_ADDRESS or X402_PAY_TO_ADDRESS to the creator receiving wallet before running payment proofs.");
  }

  return address;
}

export function makeGatewayClient(privateKey: Hex): GatewayClient {
  return new GatewayClient({
    chain: config.circle.gatewayChain as SupportedChainName,
    privateKey,
    rpcUrl: config.arc.rpcUrl,
  });
}
