"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet-provider";
import { ds } from "@/lib/genlayer/data-source";
import * as contract from "@/lib/genlayer/contract";
import type { Standard, ClauseListItem } from "@/lib/genlayer/schema";
import { NetworkGate } from "@/components/ui/NetworkGate";
import { TransactionRail, type TxState } from "@/components/ui/TransactionRail";
import { RefBlock } from "@/components/ui/RefBlock";
import { NormativeBadge } from "@/components/ui/StatusBadge";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

const STANDARD_ID = 0;

export default function ReleaseDesk() {
  const { account, mode } = useWallet();
  const [standard, setStandard] = useState<Standard | null>(null);
  const [clauses, setClauses] = useState<ClauseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);

  // Form state
  const [commitSha, setCommitSha] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestDigest, setManifestDigest] = useState("");
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<number>>(new Set());

  // TX state
  const [tx, setTx] = useState<TxState>({ stage: "idle" });
  const [proposedId, setProposedId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setLoading(false); setContractError("no_contract"); return; }
    Promise.all([
      ds.getStandard(STANDARD_ID),
      ds.listClauses(STANDARD_ID, 0, 50),
    ]).then(([stdR, clR]) => {
      if (stdR.ok) setStandard(stdR.data);
      else setContractError(stdR.message);
      if (clR.ok) setClauses(clR.data.filter(c => c.active));
      setLoading(false);
    });
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (commitSha.length !== 40) errs.commitSha = "Must be exactly 40-character commit SHA.";
    if (!manifestUrl.startsWith("https://")) errs.manifestUrl = "Must be an HTTPS URL.";
    if (manifestDigest.length < 10) errs.manifestDigest = "Digest too short.";
    if (selectedClauseIds.size === 0) errs.clauses = "Select at least one changed clause.";
    if (selectedClauseIds.size > 20) errs.clauses = "Max 20 changed clauses per proposal.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const doPropose = async () => {
    if (!account || !standard) return;
    setTx({ stage: "awaiting_signature" });
    const changedIds = Array.from(selectedClauseIds);
    const result = await contract.proposeRelease(
      account,
      mode,
      STANDARD_ID,
      standard.canonical_version,
      commitSha,
      manifestUrl,
      manifestDigest,
      changedIds.length,
      changedIds,
      (stage, txHash, elapsed) => setTx({ stage, txHash, elapsed }),
    );

    if (result.ok) {
      const proposalId = result.returnValue !== null && result.returnValue !== undefined
        ? Number(result.returnValue)
        : null;
      setTx({ stage: "finalized_success", txHash: result.txHash, message: `Proposal submitted.${proposalId !== null ? ` ID: ${proposalId}` : ""}` });
      if (proposalId !== null) setProposedId(proposalId);
    } else if (result.kind === "wrong_network") {
      setTx({ stage: "error", message: result.reason });
    } else if (result.kind === "user_rejected") {
      setTx({ stage: "idle" });
    } else if (result.kind === "undetermined") {
      setTx({ stage: "undetermined", txHash: result.txHash, message: result.reason });
    } else {
      setTx({ stage: result.kind === "rollback" ? "finalized_rollback" : "error", txHash: result.txHash, message: result.reason });
    }
  };

  const handlePropose = async () => {
    if (!validate()) return;
    await doPropose();
  };

  const toggleClause = (id: number) => {
    setSelectedClauseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <div style={{ padding: "2rem 1.25rem", color: "var(--ink-faint)", fontSize: "13px" }}>Loading…</div>;

  if (contractError === "no_contract") {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div className="empty-state">Contract not configured. Set <code className="font-mono-spec" style={{ fontSize: "11px" }}>NEXT_PUBLIC_SPECWEAVE_CONTRACT</code>.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontWeight: 700, fontSize: "18px", margin: "0 0 0.25rem" }}>Release Desk</h1>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>
          Propose a commit-pinned release for semantic review on StudioNet
        </p>
      </div>

      {/* Base version gate */}
      {standard && (
        <div className="ref-block" style={{ marginBottom: "1.5rem" }}>
          <span className="spec-label">Current canonical version</span>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.25rem" }}>
            <span className="version-plate">v{standard.canonical_version}</span>
            <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
              Release will be based on <strong>v{standard.canonical_version}</strong>. If canonical advances before finalization, the proposal will be stale.
            </span>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <RefBlock label="Current manifest" url={standard.initial_manifest_url} digest={standard.canonical_manifest_digest} />
          </div>
        </div>
      )}

      {/* Three-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 280px", gap: "1.5rem" }}>
        {/* Left: Commit + manifest */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "1rem" }}>Commit + Manifest</h2>

          <div style={{ marginBottom: "0.75rem" }}>
            <label className="spec-label" htmlFor="commit-sha">Commit SHA (40 chars)</label>
            <input
              id="commit-sha"
              className="spec-input font-mono-spec"
              style={{ fontSize: "12px" }}
              value={commitSha}
              onChange={e => setCommitSha(e.target.value.trim())}
              placeholder="abcdef1234567890abcdef1234567890abcdef12"
              maxLength={40}
            />
            {formErrors.commitSha && <div className="error-msg">{formErrors.commitSha}</div>}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <label className="spec-label" htmlFor="manifest-url">Manifest URL (commit-pinned GitHub raw)</label>
            <input
              id="manifest-url"
              className="spec-input"
              style={{ fontSize: "12px" }}
              value={manifestUrl}
              onChange={e => setManifestUrl(e.target.value.trim())}
              placeholder="https://raw.githubusercontent.com/org/spec/SHA/manifest.json"
            />
            {formErrors.manifestUrl && <div className="error-msg">{formErrors.manifestUrl}</div>}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <label className="spec-label" htmlFor="manifest-digest">Manifest digest (sha256:...)</label>
            <input
              id="manifest-digest"
              className="spec-input font-mono-spec"
              style={{ fontSize: "12px" }}
              value={manifestDigest}
              onChange={e => setManifestDigest(e.target.value.trim())}
              placeholder="sha256:..."
            />
            {formErrors.manifestDigest && <div className="error-msg">{formErrors.manifestDigest}</div>}
          </div>
        </div>

        {/* Center: Changed clause list */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "1rem" }}>
            Changed Clauses ({selectedClauseIds.size} selected)
            {formErrors.clauses && <span className="error-msg" style={{ marginLeft: "0.5rem" }}>{formErrors.clauses}</span>}
          </h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: "2px", maxHeight: "400px", overflowY: "auto" }}>
            {clauses.length === 0 ? (
              <div style={{ padding: "1rem", color: "var(--ink-faint)", fontSize: "12px" }}>No active clauses found.</div>
            ) : (
              clauses.map((cl) => (
                <label
                  key={cl.record_id}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: selectedClauseIds.has(cl.record_id) ? "var(--cobalt-bg)" : "transparent",
                    alignItems: "flex-start",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedClauseIds.has(cl.record_id)}
                    onChange={() => toggleClause(cl.record_id)}
                    style={{ marginTop: "2px", flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <span className="font-mono-spec" style={{ fontSize: "12px", fontWeight: 600 }}>§{cl.clause_id}</span>
                      <NormativeBadge level={cl.normative_level} name={cl.normative_name} />
                      <span style={{ fontSize: "10px", color: "var(--ink-faint)" }}>{cl.section_path}</span>
                    </div>
                    <p className="font-prose" style={{ margin: "0.2rem 0 0", fontSize: "12px", lineHeight: 1.5, color: "var(--ink-muted)" }}>
                      {cl.text.slice(0, 100)}{cl.text.length > 100 ? "…" : ""}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Right: Submit + status */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "1rem" }}>Submit</h2>

          <NetworkGate>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                <p style={{ margin: "0 0 0.25rem" }}>This will submit a release proposal to StudioNet. The proposal will then be eligible for semantic review.</p>
              </div>
              <button
                className="btn-primary"
                onClick={handlePropose}
                disabled={tx.stage === "awaiting_signature" || tx.stage === "consensus_pending"}
              >
                {tx.stage === "awaiting_signature" ? "Awaiting signature…" : "Propose Release"}
              </button>
            </div>
          </NetworkGate>

          <div style={{ marginTop: "1rem" }}>
            <TransactionRail tx={tx} onReset={() => setTx({ stage: "idle" })} onRetry={doPropose} />
          </div>

          {proposedId !== null && (
            <div style={{ marginTop: "1rem" }}>
              <Link
                href={`/releases/${proposedId}/diff`}
                className="btn-secondary"
                style={{ textDecoration: "none", display: "block", textAlign: "center", fontSize: "12px" }}
              >
                View proposal #{proposedId} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
