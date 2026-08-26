"use client";

import { useEffect, useState } from "react";
import { ds } from "@/lib/genlayer/data-source";
import type { Standard } from "@/lib/genlayer/schema";
import { CONTRACT_ADDRESS, RPC_ENDPOINT, CHAIN_ID } from "@/lib/genlayer/config";

const STANDARD_ID = 0;

export default function CanonicalReceipt() {
  const [standard, setStandard] = useState<Standard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setError("no_contract"); setLoading(false); return; }
    ds.getStandard(STANDARD_ID).then(r => {
      if (r.ok) setStandard(r.data);
      else setError(r.message);
      setLoading(false);
    });
  }, []);

  const receipt = standard ? {
    specweave_version: "1.0",
    chain: "studionet",
    chain_id: CHAIN_ID,
    contract: CONTRACT_ADDRESS,
    rpc: RPC_ENDPOINT,
    standard_id: STANDARD_ID,
    standard_name: standard.name,
    canonical_version: standard.canonical_version,
    canonical_manifest_digest: standard.canonical_manifest_digest,
    clause_count: standard.clause_count,
    steward: standard.steward,
    generated_at: new Date().toISOString(),
  } : null;

  const receiptJson = receipt ? JSON.stringify(receipt, null, 2) : "";

  const copy = () => {
    if (!receiptJson) return;
    navigator.clipboard.writeText(receiptJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontWeight: 700, fontSize: "18px", margin: "0 0 0.25rem" }}>Canonical Receipt</h1>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted)" }}>
          Machine-oriented current version, clause digest root and integration data.
          Read-only. Sourced live from the deployed contract.
        </p>
      </div>

      {loading && <p style={{ color: "var(--ink-faint)", fontSize: "13px" }}>Loading…</p>}
      {!loading && error === "no_contract" && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>Contract not configured. Set <code className="font-mono-spec" style={{ fontSize: "11px" }}>NEXT_PUBLIC_SPECWEAVE_CONTRACT</code>.</p>
        </div>
      )}
      {!loading && error && error !== "no_contract" && (
        <div className="empty-state" style={{ color: "var(--redline)" }}>{error}</div>
      )}
      {!loading && !error && receipt && (
        <>
          {/* Key metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: "2px", padding: "0.75rem" }}>
              <span className="spec-label">Canonical version</span>
              <div style={{ marginTop: "0.25rem" }}>
                <span className="version-plate" style={{ fontSize: "18px", padding: "4px 12px" }}>v{receipt.canonical_version}</span>
              </div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: "2px", padding: "0.75rem" }}>
              <span className="spec-label">Clause count</span>
              <div style={{ marginTop: "0.25rem", fontSize: "20px", fontWeight: 700 }}>{receipt.clause_count}</div>
            </div>
          </div>

          {/* Manifest digest */}
          <div style={{ marginBottom: "1.25rem", border: "1px solid var(--border)", borderRadius: "2px", padding: "0.75rem" }}>
            <span className="spec-label">Canonical manifest digest</span>
            <div className="digest" style={{ marginTop: "0.25rem" }}>{receipt.canonical_manifest_digest}</div>
          </div>

          {/* Contract ref */}
          <div style={{ marginBottom: "1.25rem", border: "1px solid var(--border)", borderRadius: "2px", padding: "0.75rem" }}>
            <span className="spec-label">Contract address · StudioNet ({CHAIN_ID})</span>
            <div className="digest" style={{ marginTop: "0.25rem" }}>{CONTRACT_ADDRESS}</div>
          </div>

          {/* JSON receipt */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span className="spec-label">Machine-readable receipt</span>
              <button className="btn-secondary" style={{ fontSize: "11px", padding: "0.2rem 0.5rem" }} onClick={copy}>
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            </div>
            <pre
              className="font-mono-spec"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "2px",
                padding: "1rem",
                fontSize: "11px",
                lineHeight: 1.6,
                overflowX: "auto",
                margin: 0,
              }}
            >
              {receiptJson}
            </pre>
          </div>

          <div style={{ marginTop: "1rem", fontSize: "11px", color: "var(--ink-faint)" }}>
            Receipt generated at: {receipt.generated_at}. Data sourced live from contract — not cached.
          </div>
        </>
      )}
    </div>
  );
}
