"use client";

import { useState } from "react";

import type { PaymentLog } from "../src/payments/tips.js";

export function PayButton({ listingId }: { listingId: string }) {
  const [log, setLog] = useState<PaymentLog | null>(null);
  const [error, setError] = useState("");

  async function pay() {
    setError("");
    const response = await fetch(`/x402/pay/${listingId}`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) return setError(body.error ?? "payment failed");
    setLog(body.log);
  }

  return (
    <div className="paybox">
      <button className="button" type="button" onClick={pay}>Run testnet tip</button>
      {error && <p>{error}</p>}
      {log && <p>Settled {log.amountUsdc} USDC · <code>{log.transactionHash}</code></p>}
    </div>
  );
}
