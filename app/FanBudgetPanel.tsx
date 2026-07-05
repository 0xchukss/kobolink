"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useSendTransaction, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { useAppAuthFetch } from "./AppApiAuthContext.js";

import type { BudgetLedger, FanBudget, GatewayBalanceSnapshot } from "../src/budgets/fan-budget.js";
import type { PaymentAgentDecision } from "../src/agents/payment-agent.js";
import type { CreatorCategory } from "../src/creator/listings.js";

type BudgetState = {
  budget: FanBudget | null;
  ledger: BudgetLedger | null;
  wallet: GatewayBalanceSnapshot | null;
  usdcTokenAddress?: string | null;
};

type FanBudgetPanelProps = {
  categories: readonly string[];
  ngnPerUsdc: number;
  showSetup?: boolean;
  showAgentRunner?: boolean;
};

type PanelStatus = {
  kind: "idle" | "loading" | "success" | "error";
  message: string;
};

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const fallbackPolicyCategories: CreatorCategory[] = ["ai", "fintech", "startups", "news", "music", "crypto"];

export function FanBudgetPanel({ categories, ngnPerUsdc, showSetup = true, showAgentRunner = true }: FanBudgetPanelProps) {
  const authFetch = useAppAuthFetch();
  const [state, setState] = useState<BudgetState>({ budget: null, ledger: null, wallet: null, usdcTokenAddress: null });
  const [decisions, setDecisions] = useState<PaymentAgentDecision[]>([]);
  const [budgetNgn, setBudgetNgn] = useState("2000");
  const [maxTipNgn, setMaxTipNgn] = useState("250");
  const [period, setPeriod] = useState<"daily" | "weekly">("weekly");
  const [depositUsdc, setDepositUsdc] = useState("");
  const [status, setStatus] = useState<PanelStatus>({ kind: "idle", message: "Ready" });
  const { open } = useAppKit();
  const { isConnected } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<"authorize" | "deposit" | "run" | null>(null);

  useEffect(() => {
    if (isConnected && pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      if (action === "authorize") void authorizeBudget();
      else if (action === "deposit") void depositToGateway();
      else if (action === "run") void runAgent();
    }
  }, [isConnected, pendingAction]);

  const policyCategories = useMemo(() => {
    const valid = categories.filter((category): category is CreatorCategory => isCreatorCategory(category));
    return valid.length ? valid : fallbackPolicyCategories;
  }, [categories]);

  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    authFetch("/api/fan-budget", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as BudgetState & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load budget");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setState(payload);
        if (payload.budget) {
          setBudgetNgn(String(payload.budget.budgetNgn));
          setMaxTipNgn(String(payload.budget.policy.maxTipNgn));
          setPeriod(payload.budget.policy.period);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not load budget" });
      });

    return () => {
      active = false;
    };
  }, [authFetch, isConnected]);

  async function refreshBalance() {
    if (!isConnected) return;
    setStatus({ kind: "loading", message: "Refreshing Gateway balance..." });
    try {
      const response = await authFetch("/api/fan-budget", { cache: "no-store" });
      const payload = await response.json() as BudgetState & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not refresh balance");
      setState(payload);
      setStatus({ kind: "success", message: "Balance updated" });
      setTimeout(() => setStatus({ kind: "idle", message: "Ready" }), 2000);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not refresh balance" });
    }
  }

  async function authorizeBudget() {
    if (!isConnected) {
      setPendingAction("authorize");
      void open();
      return;
    }

    setStatus({ kind: "loading", message: "Checking Gateway balance" });
    setDecisions([]);

    try {
      const response = await authFetch("/api/fan-budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          budgetNgn: Number(budgetNgn),
          maxTipNgn: Number(maxTipNgn),
          period,
          interests: policyCategories,
          preferredCategories: policyCategories,
          duplicateListingProtection: true,
          duplicateCreatorProtection: true,
        }),
      });
      const payload = await response.json() as BudgetState & { error?: string };
      if (!response.ok || !payload.budget || !payload.ledger) throw new Error(payload.error ?? "Could not authorize budget");

      setState(payload);
      setStatus({ kind: "success", message: `Authorized ${formatNaira(payload.budget.budgetNgn)}` });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not authorize budget" });
    }
  }

  async function depositToGateway() {
    const amountUsdc = Number(depositUsdc);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      setStatus({ kind: "error", message: "Enter a USDC deposit amount" });
      return;
    }

    if (!isConnected) {
      setPendingAction("deposit");
      void open();
      return;
    }

    try {
      let fanAddress = state.wallet?.fanAddress;

      if (!fanAddress) {
        setStatus({ kind: "loading", message: "Provisioning agent wallet..." });
        const res = await authFetch("/api/fan-budget", { cache: "no-store" });
        const payload = await res.json() as BudgetState & { error?: string, agentWallet?: { address: string } };
        if (!res.ok) throw new Error(payload.error ?? "Could not provision agent wallet");
        setState(payload);
        fanAddress = payload.wallet?.fanAddress ?? payload.agentWallet?.address;
        if (!fanAddress) throw new Error("Agent wallet not provisioned yet.");
      }

      const usdcAddress = state.usdcTokenAddress;
      if (!usdcAddress) throw new Error("USDC token address could not be resolved. Verify Circle Gateway connectivity.");

      setStatus({ kind: "loading", message: "Awaiting wallet approval..." });
      
      const hash = await writeContractAsync({
        address: usdcAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [fanAddress as `0x${string}`, parseUnits(amountUsdc.toString(), 6)],
      });

      setStatus({ kind: "loading", message: "Sending USDC to Agent Wallet..." });
      await publicClient!.waitForTransactionReceipt({ hash });

      setStatus({ kind: "loading", message: "Depositing USDC to Circle Gateway..." });
      const response = await authFetch("/api/gateway/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountUsdc,
          requiredBudgetUsdc: requestedBudgetUsdc,
        }),
      });
      const payload = await response.json() as { wallet?: GatewayBalanceSnapshot; after?: GatewayBalanceSnapshot; error?: string };
      if (!response.ok || (!payload.wallet && !payload.after)) throw new Error(payload.error ?? "Could not deposit to Gateway");

      setState((current) => ({ ...current, wallet: payload.wallet ?? payload.after ?? current.wallet }));
      setStatus({ kind: "success", message: "Deposit submitted. Waiting for indexing..." });

      // Poll every 4 seconds, up to 10 times to automatically update once Circle Gateway credits the deposit
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await authFetch("/api/fan-budget", { cache: "no-store" });
          const data = await res.json() as BudgetState;
          if (res.ok && data.wallet) {
            setState((current) => ({ ...current, wallet: data.wallet, usdcTokenAddress: data.usdcTokenAddress ?? current.usdcTokenAddress }));
            if (data.wallet.gatewayAvailableUsdc > (wallet?.gatewayAvailableUsdc ?? 0)) {
              setStatus({ kind: "success", message: "Deposit credited to Gateway!" });
              clearInterval(interval);
              setTimeout(() => setStatus({ kind: "idle", message: "Ready" }), 3000);
              return;
            }
          }
        } catch (e) {
          // ignore polling errors
        }
        if (attempts >= 10) {
          clearInterval(interval);
        }
      }, 4000);

    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not deposit to Gateway" });
    }
  }

  async function runAgent() {
    if (!isConnected) {
      setPendingAction("run");
      void open();
      return;
    }

    setStatus({ kind: "loading", message: "Settling x402 tips" });

    try {
      const response = await authFetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetTipCount: 3 }),
      });
      const payload = await response.json() as BudgetState & { decisions?: PaymentAgentDecision[]; tipped?: unknown[]; uniqueProofCount?: number; error?: string };
      if (payload.budget && payload.ledger && payload.wallet) {
        setState({ budget: payload.budget, ledger: payload.ledger, wallet: payload.wallet });
      }
      if (payload.decisions) setDecisions(payload.decisions);

      if (!response.ok || !payload.budget || !payload.ledger || !payload.wallet || !payload.decisions) {
        throw new Error(payload.error ?? "Could not run agent");
      }

      setStatus({ kind: "success", message: `${payload.tipped?.length ?? 0} tips settled / ${payload.uniqueProofCount ?? 0} proofs` });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not run agent" });
    }
  }

  const ledger = state.ledger;
  const wallet = state.wallet;
  const budget = state.budget;
  const requestedBudgetNgn = Number(budgetNgn);
  const requestedBudgetUsdc = Number.isFinite(requestedBudgetNgn) && requestedBudgetNgn > 0 && ngnPerUsdc > 0 ? requestedBudgetNgn / ngnPerUsdc : 0;
  const gatewayShortfallUsdc = Math.max(0, requestedBudgetUsdc - (wallet?.gatewayAvailableUsdc ?? 0));
  const depositAmountUsdc = Number(depositUsdc);
  const canDepositGateway = Boolean(Number.isFinite(depositAmountUsdc) && depositAmountUsdc > 0 && status.kind !== "loading");

  return (
    <section className={showSetup ? "fan-budget-panel" : "fan-budget-panel agent-run-panel"} id="fan-budget">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">{showSetup ? "USDC agent wallet" : "Autonomous agent"}</p>
          <h2>{showSetup ? "Fund agent budget" : "Run paying agent"}</h2>
        </div>
        {status.kind !== "idle" && status.message !== "Ready" && status.message !== "Wallet connection required" ? <span className={"status-dot " + status.kind}>{status.message}</span> : null}
      </div>


      {showSetup ? (
        <>
          <div className="gateway-funding" aria-label="USDC budget funding source">
            <div>
              <span>Account agent wallet</span>
              <strong>
                {wallet ? shortAddress(wallet.fanAddress) : (
                  <span className="provisioning-status" title="Your per-account agent wallet is being created on Arc testnet. This takes a few seconds. Refresh the balance if it persists.">
                    Provisioning
                    <span aria-hidden="true" className="info-hint">?</span>
                    <span className="sr-only">Your per-account agent wallet is being created on Arc testnet. This takes a few seconds. Refresh the balance if it persists.</span>
                  </span>
                )}
              </strong>
              {!wallet ? (
                <small>Your agent wallet is being created on Arc testnet. This usually takes a few seconds. Use Refresh Balance if it persists.</small>
              ) : null}
              <small>Send Arc testnet USDC to this per-account agent wallet, then deposit it to Circle Gateway for autonomous spending.</small>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Gateway spending balance</span>
                <button 
                  onClick={() => void refreshBalance()} 
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", textDecoration: "underline", color: "inherit", opacity: 0.7 }}
                  type="button"
                >
                  Refresh Balance
                </button>
              </div>
              <strong>{wallet ? formatUsdc(wallet.gatewayAvailableUsdc) + " spendable" : "Gateway balance pending"}</strong>
              <small>{wallet ? "Agent wallet balance: " + formatUsdc(wallet.walletUsdc) + ". " : ""}{gatewayShortfallUsdc > 0 ? formatUsdc(gatewayShortfallUsdc) + " more needed for this budget." : "Current Gateway balance covers this budget."}</small>
              <label className="gateway-deposit-input">
                <span>Deposit amount, USDC</span>
                <input inputMode="decimal" min="0" placeholder={gatewayShortfallUsdc > 0 ? gatewayShortfallUsdc.toFixed(6) : "0.100000"} step="0.000001" type="number" value={depositUsdc} onChange={(event) => setDepositUsdc(event.target.value)} />
              </label>
              <button
                className="secondary-action wallet-connect-action"
                disabled={!canDepositGateway}
                onClick={() => void depositToGateway()}
                title={canDepositGateway ? undefined : "Enter a USDC deposit amount above to enable this button."}
                type="button"
              >
                Deposit to Gateway
              </button>
              {!canDepositGateway ? (
                <small className="deposit-disabled-hint">
                  {status.kind === "loading" ? "Waiting for the current operation to finish." : "Enter a deposit amount above to unlock this button."}
                </small>
              ) : null}
            </div>
            <div>
              <span>Agent authority</span>
              <strong>{formatNaira(Number.isFinite(requestedBudgetNgn) ? requestedBudgetNgn : 0)} spending budget</strong>
              <small>{formatUsdc(requestedBudgetUsdc)} required for this cap. Each public account should get its own scoped agent and budget ledger.</small>
            </div>
          </div>

          <div className="budget-grid">
            <label>
              <span>Spending budget, Naira display</span>
              <input inputMode="numeric" min={50} value={budgetNgn} onChange={(event) => setBudgetNgn(event.target.value)} type="number" />
            </label>
            <label>
              <span>Max agent tip per creator</span>
              <input inputMode="numeric" min={50} value={maxTipNgn} onChange={(event) => setMaxTipNgn(event.target.value)} type="number" />
            </label>
            <label>
              <span>Budget period</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value === "daily" ? "daily" : "weekly")}>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </label>
          </div>

          <div className="budget-actions">
            <button className="primary-action" onClick={() => void authorizeBudget()} type="button">Authorize agent budget</button>
          </div>
        </>
      ) : null}

      {showAgentRunner ? (
        <div className="budget-actions agent-run-actions">
          <button className="primary-action" disabled={!budget} onClick={() => void runAgent()} type="button">Run paying agent</button>
        </div>
      ) : null}

      <div className="ledger-grid" aria-label="Budget ledger">
        <Metric label="Funded" value={ledger ? formatNaira(ledger.fundedNgn) : "--"} detail={ledger ? formatUsdc(ledger.fundedUsdc) : "USDC"} />
        <Metric label="Reserved" value={ledger ? formatNaira(ledger.reservedNgn) : "--"} detail={ledger ? formatUsdc(ledger.reservedUsdc) : "USDC"} />
        <Metric label="Spent" value={ledger ? formatNaira(ledger.spentNgn) : "--"} detail={ledger ? formatUsdc(ledger.spentUsdc) : "USDC"} />
        <Metric label="Remaining" value={ledger ? formatNaira(ledger.remainingNgn) : "--"} detail={ledger ? formatUsdc(ledger.remainingUsdc) : "USDC"} />
      </div>

      <div className="wallet-proof">
        <span>Actual Gateway balance</span>
        <strong>{wallet ? formatUsdc(wallet.gatewayAvailableUsdc) : "Checking on run"}</strong>
        <small>{wallet ? `${wallet.fullyFunded ? "Fully covers" : "Below full cap"} ${budget ? formatNaira(budget.budgetNgn) : "budget"} / checked ${wallet.checkedAt}` : "Create a budget to verify the funded testnet wallet."}</small>
      </div>

      {budget ? (
        <div className="policy-summary">
          <span>{budget.policy.period} cap</span>
          <span>{formatNaira(budget.policy.maxTipNgn)} max tip</span>
          <span>account scoped agent</span>
          <span>duplicate protection on</span>
        </div>
      ) : null}

      {decisions.length ? (
        <div className="reasoning-panel">
          <div className="reasoning-heading">
            <span>Agent reasoning</span>
            <strong>{decisions.filter((decision) => decision.status === "tipped").length} paid</strong>
          </div>
          <div className="agent-decisions">
            {decisions.map((decision) => (
              <article className={decision.status} key={`${decision.listingId}-${decision.reason}`}>
                <strong>{decision.creatorHandle}</strong>
                <span>{formatNaira(decision.amountNgn)} / {formatUsdc(decision.amountUsdc)} / score {decision.score}</span>
                <div>
                  <p>{decision.reason}</p>
                  <ProofLink decision={decision} />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ProofLink({ decision }: { decision: PaymentAgentDecision }) {
  const href = decision.proof?.explorerUrl ?? decision.proof?.receiptUrl;
  const label = decision.proof?.transactionHash ?? decision.proof?.paymentReceipt;
  if (!href || !label) return null;

  return <a className="proof-link" href={href} rel="noreferrer" target="_blank">{label}</a>;
}

function isCreatorCategory(value: string): value is CreatorCategory {
  return ["ai", "fintech", "startups", "news", "music", "crypto"].includes(value);
}

function shortAddress(address: string): string {
  return address.length > 12 ? address.slice(0, 6) + "..." + address.slice(-4) : address;
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatUsdc(value: number): string {
  return `${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} USDC`;
}
