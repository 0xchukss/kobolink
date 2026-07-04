"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppAuthFetch } from "./AppApiAuthContext.js";

import type { FlutterwaveBridgeSnapshot, FlutterwaveDepositReceipt } from "../src/flutterwave/bridge.js";

type StatusState = {
  kind: "idle" | "loading" | "success" | "error";
  message: string;
};

type FlutterwaveBridgePanelProps = {
  initialState: FlutterwaveBridgeSnapshot;
};

export function FlutterwaveBridgePanel({ initialState }: FlutterwaveBridgePanelProps) {
  const authFetch = useAppAuthFetch();
  const [state, setState] = useState<FlutterwaveBridgeSnapshot | null>(initialState);
  const [status, setStatus] = useState<StatusState>({ kind: "idle", message: "Ready" });
  const [depositAmount, setDepositAmount] = useState("");
  const [fanEmail, setFanEmail] = useState("");
  const [fanName, setFanName] = useState("");
  const [fanPhone, setFanPhone] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [verifyReceiptId, setVerifyReceiptId] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/bridge", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as FlutterwaveBridgeSnapshot & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load bridge");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setState(payload);
        const latestPending = payload.deposits.find((deposit) => deposit.status === "checkout_created");
        if (latestPending) setVerifyReceiptId(latestPending.id);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not load bridge" });
      });

    return () => {
      active = false;
    };
  }, []);

  const latestDeposit = state?.deposits[0];
  const proofBackedDepositIds = useMemo(() => new Set(state?.proofBackedDepositIds ?? []), [state?.proofBackedDepositIds]);
  const canCreateDeposit = isPositiveAmount(depositAmount) && fanEmail.trim().length > 0 && fanName.trim().length > 0;
  const canVerifyDeposit = Boolean(verifyReceiptId && transactionId.trim());

  async function createDeposit() {
    setStatus({ kind: "loading", message: "Creating checkout" });

    try {
      const response = await authFetch("/api/bridge/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountNgn: Number(depositAmount),
          email: fanEmail,
          name: fanName,
          phoneNumber: fanPhone,
        }),
      });
      const payload = await response.json() as { receipt?: FlutterwaveDepositReceipt; state?: FlutterwaveBridgeSnapshot; error?: string };
      if (!response.ok || !payload.receipt || !payload.state) throw new Error(payload.error ?? "Could not create deposit");

      setState(payload.state);
      setVerifyReceiptId(payload.receipt.id);
      setStatus({ kind: payload.receipt.status === "checkout_created" ? "success" : "error", message: statusLabel(payload.receipt.status) });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not create deposit" });
    }
  }

  async function verifyDeposit() {
    setStatus({ kind: "loading", message: "Verifying payment" });

    try {
      const response = await authFetch("/api/bridge/deposit/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receiptId: verifyReceiptId, transactionId }),
      });
      const payload = await response.json() as { receipt?: FlutterwaveDepositReceipt; state?: FlutterwaveBridgeSnapshot; error?: string };
      if (!response.ok || !payload.receipt || !payload.state) throw new Error(payload.error ?? "Could not verify deposit");

      setState(payload.state);
      setStatus({ kind: payload.receipt.status === "credit_applied" ? "success" : "error", message: statusLabel(payload.receipt.status) });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not verify deposit" });
    }
  }

  return (
    <section className="bridge-panel fan-bridge-panel" id="naira-bridge">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Fan funding</p>
          <h2>Fund with Naira</h2>
        </div>
        {status.kind !== "idle" || status.message !== "Ready" ? <span className={"status-dot " + status.kind}>{status.message}</span> : null}
      </div>

      <div className="bridge-ledger fan-bridge-ledger">
        <Metric label="Verified balance" value={state ? formatNaira(state.verifiedNairaBalance) : "--"} detail={state ? formatUsdc(state.verifiedUsdcEquivalent) : "USDC available"} />
      </div>

      <div className="bridge-forms bridge-forms-single">
        <div className="bridge-form-block primary-bridge-form">
          <h3>Fan deposit</h3>
          <div className="form-grid two">
            <label>
              <span>Amount</span>
              <input inputMode="numeric" min={50} placeholder="2000" type="number" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
            </label>
            <label>
              <span>Fan email</span>
              <input inputMode="email" placeholder="fan@example.com" value={fanEmail} onChange={(event) => setFanEmail(event.target.value)} />
            </label>
          </div>
          <div className="form-grid two">
            <label>
              <span>Fan name</span>
              <input placeholder="Fan name" value={fanName} onChange={(event) => setFanName(event.target.value)} />
            </label>
            <label>
              <span>Phone, optional</span>
              <input inputMode="tel" placeholder="08000000000" value={fanPhone} onChange={(event) => setFanPhone(event.target.value)} />
            </label>
          </div>
          <button className="secondary-action" disabled={!canCreateDeposit} onClick={() => void createDeposit()} type="button">Create checkout</button>
          <div className="verify-row">
            <label>
              <span>Receipt</span>
              <select value={verifyReceiptId} onChange={(event) => setVerifyReceiptId(event.target.value)}>
                <option value="">Select receipt</option>
                {state?.deposits.map((deposit) => <option key={deposit.id} value={deposit.id}>{deposit.txRef}</option>)}
              </select>
            </label>
            <label>
              <span>Transaction ID</span>
              <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Flutterwave transaction_id" />
            </label>
          </div>
          <button className="secondary-action" disabled={!canVerifyDeposit} onClick={() => void verifyDeposit()} type="button">Verify and credit</button>
        </div>
      </div>

      <div className="bridge-receipts bridge-receipts-single">
        <ReceiptBlock title="Latest deposit" receipt={latestDeposit} proofBacked={latestDeposit ? proofBackedDepositIds.has(latestDeposit.id) : false} />
      </div>
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

function ReceiptBlock({ title, receipt, proofBacked = false }: { title: string; receipt?: FlutterwaveDepositReceipt; proofBacked?: boolean }) {
  return (
    <article>
      <span>{title}</span>
      {receipt ? (
        <>
          <strong>{depositDisplayStatus(receipt, proofBacked)}</strong>
          <small>{proofBacked ? "Verified and credited" : "Checkout created. Verify payment to credit balance."}</small>
          <code>{receipt.txRef}</code>
          {receipt.checkoutUrl ? <a href={receipt.checkoutUrl} rel="noreferrer" target="_blank">Open checkout</a> : null}
          {receipt.responseMessage ? <p>{receipt.responseMessage}</p> : null}
        </>
      ) : <strong>No receipt yet</strong>}
    </article>
  );
}

function isPositiveAmount(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function statusLabel(status: string): string {
  return status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function depositDisplayStatus(receipt: FlutterwaveDepositReceipt, proofBacked: boolean): string {
  if (receipt.status === "credit_applied" && !proofBacked) return "Verified, proof pending";
  return statusLabel(receipt.status);
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatUsdc(value: number): string {
  const fixed = value.toFixed(6);
  const trimmed = fixed.replace(/0+$/, "");
  return (trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed) + " USDC";
}
