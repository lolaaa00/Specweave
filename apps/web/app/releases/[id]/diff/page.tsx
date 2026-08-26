"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ds } from "@/lib/genlayer/data-source";
import * as contract from "@/lib/genlayer/contract";
import type { ReleaseProposal, Clause, PreviewOverlaps, ParsedClauseDecision } from "@/lib/genlayer/schema";
import { parseClauseDecisions } from "@/lib/genlayer/schema";
import { StatusBadge, DecisionBadge, NormativeBadge } from "@/components/ui/StatusBadge";
import { TransactionRail, type TxState } from "@/components/ui/TransactionRail";
import { NetworkGate } from "@/components/ui/NetworkGate";
import { RefBlock } from "@/components/ui/RefBlock";
import { useWallet } from "@/lib/wallet-provider";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

export default function DiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = parseInt(id);
  const { account, mode } = useWallet();

  const [proposal, setProposal] = useState<ReleaseProposal | null>(null);
  const [changedClauses, setChangedClauses] = useState<Clause[]>([]);
  const [overlaps, setOverlaps] = useState<PreviewOverlaps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ stage: "idle" });

  const load = async () => {
    if (!CONTRACT_ADDRESS) { setError("no_contract"); setLoading(false); return; }
    const r = await ds.getRelease(proposalId);
    if (!r.ok) { setError(r.message); setLoading(false); return; }
    setProposal(r.data);

    // Load changed clauses
    const ids: number[] = JSON.parse(r.data.changed_clause_ids_json || "[]");
    const clauseResults = await Promise.all(ids.map(cid => ds.getClause(cid)));
    setChangedClauses(clauseResults.filter(cr => cr.ok).map(cr => (cr as { ok: true; data: Clause }).data));

    // Load overlaps for each changed clause
    if (r.data.status_name !== "PROPOSED" && r.data.status_name !== "REVISION_REQUIRED") {
      setOverlaps([]);
    } else {
      const overlapResults = await Promise.all(
        ids.map((_, i) => ds.previewOverlaps(proposalId, i, 5))
      );
      setOverlaps(overlapResults.filter(o => o.ok).map(o => (o as { ok: true; data: PreviewOverlaps }).data));
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, [proposalId]);

  const handleReview = async () => {
    if (!account || !proposal) return;
    setTx({ stage: "awaiting_signature" });
    const result = await contract.reviewRelease(
      account, mode, proposalId,
      (stage, txHash, elapsed) => setTx({ stage, txHash, elapsed }),
    );
    if (result.ok) {
      setTx({ stage: "finalized_success", txHash: result.txHash, message: "Review complete. Re-reading state…" });
      await load();
    } else if (result.kind === "user_rejected") {
      setTx({ stage: "idle" });
    } else if (result.kind === "undetermined") {
      setTx({ stage: "undetermined", txHash: result.txHash, message: result.reason });
    } else {
      setTx({ stage: result.kind === "rollback" ? "finalized_rollback" : "error", txHash: result.txHash, message: result.reason });
    }
  };

  const handleFinalize = async () => {
    if (!account || !proposal) return;
    setTx({ stage: "awaiting_signature" });
    const result = await contract.finalizeRelease(
      account, mode, proposalId,
      (stage, txHash, elapsed) => setTx({ stage, txHash, elapsed }),
    );
    if (result.ok) {
      setTx({ stage: "finalized_success", txHash: result.txHash, message: `Finalized! New canonical version: ${result.returnValue}` });
      await load();
    } else if (result.kind === "user_rejected") {
      setTx({ stage: "idle" });
    } else if (result.kind === "undetermined") {
      setTx({ stage: "undetermined", txHash: result.txHash, message: result.reason });
    } else {
      setTx({ stage: result.kind === "rollback" ? "finalized_rollback" : "error", txHash: result.txHash, message: result.reason });
    }
  };

  const handleCancel = async () => {
    if (!account || !proposal) return;
    if (!confirm("Cancel this proposal?")) return;
    setTx({ stage: "awaiting_signature" });
    const result = await contract.cancelRelease(
      account, mode, proposalId,
      (stage, txHash, elapsed) => setTx({ stage, txHash, elapsed }),
    );
    if (result.ok) {
      setTx({ stage: "finalized_success", txHash: result.txHash, message: "Proposal cancelled." });
      await load();
    } else if (result.kind === "user_rejected") {
      setTx({ stage: "idle" });
    } else {
      setTx({ stage: "error", txHash: result.txHash, message: result.reason });
    }
  };

  if (loading) return <div style={{ padding: "2rem 1.25rem", color: "var(--ink-faint)", fontSize: "13px" }}>Loading proposal…</div>;
  if (error) return <div style={{ padding: "2rem 1.25rem" }}><div className="empty-state" style={{ color: "var(--redline)" }}>{error}</div></div>;
  if (!proposal) return null;

  const decisions = parseClauseDecisions(proposal.clause_decisions_json);
  const canReview = ["PROPOSED", "REVISION_REQUIRED"].includes(proposal.status_name);
  const canFinalize = proposal.status_name === "ACCEPTABLE";
  const canCancel = ["PROPOSED", "UNDER_REVIEW", "ACCEPTABLE", "REVISION_REQUIRED"].includes(proposal.status_name);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <Link href="/" style={{ fontSize: "12px", color: "var(--cobalt)", textDecoration: "none" }}>← Standard</Link>
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <h1 style={{ fontWeight: 700, fontSize: "16px", margin: 0 }}>Release Proposal #{proposal.proposal_id}</h1>
            <StatusBadge status={proposal.status_name} />
          </div>
          <div style={{ display: "flex", gap: "1rem", fontSize: "12px", color: "var(--ink-muted)" }}>
            <span>Base: <span className="version-plate">v{proposal.base_version}</span></span>
            <span className="font-mono-spec" style={{ fontSize: "11px" }}>{proposal.commit_sha.slice(0, 10)}…</span>
            <span>{proposal.changed_clause_count} changed clause{proposal.changed_clause_count !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href={`/releases/${proposalId}/conflicts`} className="btn-secondary" style={{ textDecoration: "none", fontSize: "11px", padding: "0.25rem 0.6rem" }}>
              Conflict matrix →
            </Link>
            {canCancel && (
              <button className="btn-danger" style={{ fontSize: "11px", padding: "0.25rem 0.6rem" }} onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manifest ref */}
      <div style={{ marginBottom: "1.25rem" }}>
        <RefBlock label="Release manifest" url={proposal.manifest_url} digest={proposal.manifest_digest} />
      </div>

      {/* TX rail */}
      <div style={{ marginBottom: "1rem" }}>
        <TransactionRail tx={tx} onReset={() => setTx({ stage: "idle" })} onRetry={canReview ? handleReview : canFinalize ? handleFinalize : undefined} />
      </div>

      {/* Rationale if reviewed */}
      {proposal.rationale && (
        <div style={{ marginBottom: "1.25rem", padding: "0.75rem", background: "var(--surface)", borderRadius: "2px", border: "1px solid var(--border)" }}>
          <span className="spec-label">Review rationale</span>
          <p className="font-prose" style={{ margin: "0.25rem 0 0", fontSize: "13px", lineHeight: 1.6 }}>{proposal.rationale}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {canReview && (
          <NetworkGate>
            <button
              className="btn-primary"
              onClick={handleReview}
              disabled={tx.stage === "awaiting_signature" || tx.stage === "consensus_pending"}
            >
              {tx.stage === "awaiting_signature" ? "Awaiting signature…" : "Run Semantic Review"}
            </button>
          </NetworkGate>
        )}
        {canFinalize && (
          <NetworkGate>
            <button
              className="btn-primary"
              onClick={handleFinalize}
              disabled={tx.stage === "awaiting_signature"}
              style={{ background: "var(--status-canonical)" }}
            >
              Finalize Release →
            </button>
          </NetworkGate>
        )}
        {proposal.status_name === "UNDER_REVIEW" && (
          <span style={{ fontSize: "12px", color: "var(--status-review)" }}>Review in progress… Do not refresh.</span>
        )}
      </div>

      {/* Semantic diff view: Changed clauses with redline overlays */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem" }}>
        {/* Center: Document redline */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "0.75rem" }}>Changed Clauses</h2>
          {changedClauses.map((cl, i) => {
            const dec = decisions.find(d => d.record_id === cl.record_id);
            const overlap = overlaps.find(o => o.changed_clause_record_id === cl.record_id);
            return (
              <ChangedClausePanel key={cl.record_id} clause={cl} decision={dec} overlapCount={overlap?.overlaps.length ?? 0} />
            );
          })}
        </div>

        {/* Right: Semantic overlaps / callouts */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "0.75rem" }}>Semantic Overlaps</h2>
          <p style={{ fontSize: "11px", color: "var(--ink-faint)", marginBottom: "0.75rem" }}>
            Retrieved from VecDB. Raw distances shown — these are context, not verdicts.
          </p>
          {overlaps.length === 0 && (
            <div style={{ fontSize: "12px", color: "var(--ink-faint)" }}>
              {canReview
                ? "Run semantic review to retrieve overlapping clauses."
                : "No overlap preview available at this status."}
            </div>
          )}
          {overlaps.map((o) => (
            <div key={o.changed_clause_id} style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "0.4rem" }}>
                Overlaps for §{o.changed_clause_id}
              </div>
              {o.overlaps.length === 0 ? (
                <div style={{ fontSize: "11px", color: "var(--ink-faint)" }}>No eligible semantic memory found.</div>
              ) : (
                o.overlaps.map((ov) => (
                  <div key={ov.record_id} className="semantic-card" style={{ marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.2rem" }}>
                      <span className="font-mono-spec" style={{ fontSize: "11px", fontWeight: 600 }}>§{ov.clause_id}</span>
                      <span style={{ fontSize: "10px", color: "var(--ink-faint)" }}>{ov.normative_level}</span>
                      <span style={{ fontSize: "10px", color: "var(--ink-faint)", marginLeft: "auto" }}>
                        dist: {ov.distance.toFixed(3)}
                      </span>
                    </div>
                    <p className="font-prose" style={{ margin: 0, fontSize: "11px", lineHeight: 1.5, color: "var(--ink-muted)" }}>
                      {ov.text.slice(0, 120)}{ov.text.length > 120 ? "…" : ""}
                    </p>
                    {!ov.active && (
                      <span style={{ fontSize: "10px", color: "var(--redline)" }}>superseded</span>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChangedClausePanel({
  clause,
  decision,
  overlapCount,
}: {
  clause: Clause;
  decision?: ParsedClauseDecision;
  overlapCount: number;
}) {
  const hasConflict = decision?.decision === "SEMANTIC_CONFLICT";
  const isSupersession = decision?.decision === "COHERENT_SUPERSESSION";

  return (
    <div
      style={{
        marginBottom: "1.25rem",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "1.25rem",
      }}
    >
      <div
        className={hasConflict ? "redline-marker" : isSupersession ? "change-marker" : ""}
        style={{ paddingLeft: hasConflict || isSupersession ? "0.75rem" : 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <span className="font-mono-spec" style={{ fontSize: "13px", fontWeight: 700 }}>§{clause.clause_id}</span>
          <NormativeBadge level={clause.normative_level} name={clause.normative_name} />
          <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>{clause.section_path}</span>
          {decision && <DecisionBadge decision={decision.decision} />}
          {overlapCount > 0 && !decision && (
            <span style={{ fontSize: "10px", color: "var(--cobalt)", background: "var(--cobalt-bg)", padding: "1px 5px", borderRadius: "2px" }}>
              {overlapCount} semantic overlap{overlapCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <p className="font-prose" style={{ margin: "0 0 0.5rem", fontSize: "14px", lineHeight: 1.7 }}>
          {clause.text}
        </p>

        {decision?.reason && (
          <div style={{ fontSize: "12px", color: hasConflict ? "var(--redline)" : "var(--ink-muted)", borderTop: "1px solid var(--border)", paddingTop: "0.4rem", marginTop: "0.4rem" }}>
            <span className="spec-label" style={{ display: "inline", marginRight: "0.4rem" }}>Validator reason:</span>
            {decision.reason}
          </div>
        )}

        {decision?.supersedes && decision.supersedes.length > 0 && (
          <div style={{ fontSize: "12px", marginTop: "0.4rem" }}>
            <span className="spec-label" style={{ display: "inline", marginRight: "0.4rem" }}>Supersedes:</span>
            {decision.supersedes.map(s => (
              <span key={s} className="font-mono-spec" style={{ fontSize: "11px", marginRight: "0.4rem", color: "var(--cobalt)" }}>§{s}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <a
          href={clause.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "11px", color: "var(--cobalt)", textDecoration: "none" }}
        >
          Source →
        </a>
        <span style={{ fontSize: "10px", color: "var(--ink-faint)", marginLeft: "0.5rem" }}>{clause.source_digest}</span>
      </div>
    </div>
  );
}
