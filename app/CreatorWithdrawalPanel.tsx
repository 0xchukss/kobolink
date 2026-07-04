"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppAuthFetch } from "./AppApiAuthContext.js";

import type { CreatorBalance } from "../src/payments/tips.js";
import type { BridgeWithdrawalReceipt, FlutterwaveBridgeSnapshot } from "../src/flutterwave/bridge.js";
import { creatorWithdrawalAvailability } from "../src/flutterwave/withdrawal-guard.js";

type StatusState = {
  kind: "idle" | "loading" | "success" | "error";
  message: string;
};

type CreatorWithdrawalPanelProps = {
  balances: CreatorBalance[];
  initialState: FlutterwaveBridgeSnapshot;
};

export function CreatorWithdrawalPanel({ balances, initialState }: CreatorWithdrawalPanelProps) {
  const authFetch = useAppAuthFetch();
  const [state, setState] = useState<FlutterwaveBridgeSnapshot | null>(initialState);
  const [status, setStatus] = useState<StatusState>({ kind: "idle", message: "Ready" });
  const [creatorHandle, setCreatorHandle] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/bridge", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as FlutterwaveBridgeSnapshot & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load withdrawals");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setState(payload);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not load withdrawals" });
      });

    return () => {
      active = false;
    };
  }, []);

  const latestWithdrawal = state?.withdrawals[0];
  const totalSettledNgn = balances.reduce((sum, balance) => sum + balance.amountNgn, 0);
  const totalSettledUsdc = balances.reduce((sum, balance) => sum + balance.amountUsdc, 0);
  const bestCreatorHandle = useMemo(() => balances.find((balance) => balance.creatorHandle)?.creatorHandle, [balances]);
  const withdrawalAvailability = useMemo(() => {
    if (!state || !creatorHandle.trim()) return undefined;
    try {
      return creatorWithdrawalAvailability({
        creatorHandle,
        paymentState: { balances },
        bridgeState: state,
      });
    } catch {
      return undefined;
    }
  }, [balances, creatorHandle, state]);
  const withdrawAmountNgn = Number(withdrawAmount);
  const withdrawalWithinBalance = Boolean(withdrawalAvailability && Number.isFinite(withdrawAmountNgn) && withdrawAmountNgn > 0 && withdrawAmountNgn <= withdrawalAvailability.availableNgn);
  const canRequestWithdrawal = withdrawalWithinBalance && creatorHandle.trim().length > 0 && /^\d{3}$/.test(bankCode.trim()) && /^\d{10}$/.test(accountNumber.trim());

  useEffect(() => {
    if (bestCreatorHandle && !creatorHandle) setCreatorHandle(bestCreatorHandle.replace(/^@/, ""));
  }, [bestCreatorHandle, creatorHandle]);

  async function requestWithdrawal() {
    setStatus({ kind: "loading", message: "Requesting payout" });

    try {
      const response = await authFetch("/api/bridge/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorHandle,
          amountNgn: Number(withdrawAmount),
          bankCode,
          accountNumber,
        }),
      });
      const payload = await response.json() as { receipt?: BridgeWithdrawalReceipt; state?: FlutterwaveBridgeSnapshot; error?: string };
      if (!response.ok || !payload.receipt || !payload.state) throw new Error(payload.error ?? "Could not create withdrawal");

      setState(payload.state);
      setStatus({ kind: payload.receipt.status === "sandbox_api_error" ? "error" : "success", message: statusLabel(payload.receipt.status) });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not create withdrawal" });
    }
  }

  return (
    <details className="creator-withdrawal-panel withdrawal-dropdown">
      <summary>
        <span>Creator withdrawal</span>
        <strong>Request payout</strong>
      </summary>
      <div className="withdrawal-dropdown-body">
        <div className="creator-earnings-summary">
          <div>
            <span>Creator receives</span>
            <strong>Tips settle to the listing Arc wallet.</strong>
            <small>KoboLink records the x402/Circle proof, then the creator balance is counted from settled tips only.</small>
          </div>
          <div>
            <span>Settled earnings</span>
            <strong>{formatNaira(totalSettledNgn)}</strong>
            <small>{formatUsdc(totalSettledUsdc)} available across listed creators.</small>
          </div>
        </div>
        <div className="form-grid two">
          <label>
            <span>Creator</span>
            <input placeholder="creatorhandle" value={creatorHandle} onChange={(event) => setCreatorHandle(event.target.value)} />
          </label>
          <label>
            <span>Amount</span>
            <input inputMode="numeric" min={50} placeholder="150" type="number" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} />
          </label>
        </div>
        <div className="form-grid two">
          <label>
            <span>Bank code</span>
            <input inputMode="numeric" maxLength={3} placeholder="044" value={bankCode} onChange={(event) => setBankCode(event.target.value)} />
          </label>
          <label>
            <span>Account number</span>
            <input inputMode="numeric" maxLength={10} placeholder="0690000032" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
          </label>
        </div>
        <small>Available from settled creator tips: {withdrawalAvailability ? formatNaira(withdrawalAvailability.availableNgn) : formatNaira(0)}</small>
        {status.kind !== "idle" || status.message !== "Ready" ? <p className={"inline-status " + status.kind}>{status.message}</p> : null}
        <button className="secondary-action" disabled={!canRequestWithdrawal} onClick={() => void requestWithdrawal()} type="button">Request withdrawal</button>
        {latestWithdrawal ? (
          <article className="withdrawal-receipt">
            <span>Latest payout request</span>
            <strong>{statusLabel(latestWithdrawal.status)}</strong>
            <code>{latestWithdrawal.reference}</code>
            {latestWithdrawal.responseMessage ? <p>{latestWithdrawal.responseMessage}</p> : null}
          </article>
        ) : null}
      </div>
    </details>
  );
}

function statusLabel(status: string): string {
  if (status === "sandbox_api_error") return "Payout unavailable";
  return status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatUsdc(value: number): string {
  const fixed = value.toFixed(6);
  const trimmed = fixed.replace(/0+$/, "");
  return (trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed) + " USDC";
}
