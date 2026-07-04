import type { ProofCenterSnapshot } from "../src/proofs/proof-center.js";

type ProofCenterPanelProps = {
  snapshot: ProofCenterSnapshot;
};

const statusLabels: Record<string, string> = {
  passed: "Passed",
  warning: "Warning",
  missing: "Missing",
};

export function ProofCenterPanel({ snapshot }: ProofCenterPanelProps) {
  return (
    <section className="proof-center reveal-block" id="proof-center" aria-label="KoboLink proof center">
      <div className="section-copy compact">
        <p className="eyebrow">Testnet proof</p>
        <h2>Proof Center</h2>
        <p>One place for the payment evidence: Arc transfer, x402 settlement, autonomous agent payments, creator feed depth, and Flutterwave sandbox bridge status.</p>
      </div>

      <div className="proof-center-summary">
        <div>
          <span>Creators</span>
          <strong>{snapshot.summary.creatorCount}</strong>
        </div>
        <div>
          <span>Listings</span>
          <strong>{snapshot.summary.listingCount}</strong>
        </div>
        <div>
          <span>Settled logs</span>
          <strong>{snapshot.summary.settledPaymentCount}</strong>
        </div>
        <div>
          <span>Agent proofs</span>
          <strong>{snapshot.summary.uniqueAgentProofCount}</strong>
        </div>
      </div>

      <div className="proof-center-grid">
        {snapshot.items.map((item) => (
          <article className={`proof-center-card ${item.status}`} key={item.id}>
            <div>
              <span>{item.rail}</span>
              <strong>{statusLabels[item.status]}</strong>
            </div>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            {item.href ? (
              <a href={item.href} target="_blank" rel="noreferrer">{item.proof ?? "Open proof"}</a>
            ) : item.proof ? (
              <code>{item.proof}</code>
            ) : null}
            <small>{item.source}</small>
          </article>
        ))}
      </div>

      {snapshot.caveats.length > 0 ? (
        <div className="proof-caveats">
          {snapshot.caveats.map((caveat) => <p key={caveat}>{caveat}</p>)}
        </div>
      ) : null}
    </section>
  );
}