import type { Hex } from "viem";

import { getFanPrivateKey, makeGatewayClient } from "../proofs/env-wallets.js";
import { buildGatewayBalanceSnapshot, type GatewayBalanceSnapshot } from "./fan-budget.js";

export async function readFanGatewayBalance(requiredBudgetUsdc: number): Promise<GatewayBalanceSnapshot> {
  return readGatewayBalanceForPrivateKey(getFanPrivateKey(), requiredBudgetUsdc);
}

export async function readGatewayBalanceForPrivateKey(privateKey: Hex, requiredBudgetUsdc: number): Promise<GatewayBalanceSnapshot> {
  const client = makeGatewayClient(privateKey);
  const balances = await client.getBalances();

  return buildGatewayBalanceSnapshot({
    fanAddress: client.address,
    walletUsdc: Number(balances.wallet.formatted),
    gatewayAvailableUsdc: Number(balances.gateway.formattedAvailable),
    gatewayTotalUsdc: Number(balances.gateway.formattedTotal),
    requiredBudgetUsdc,
  });
}
