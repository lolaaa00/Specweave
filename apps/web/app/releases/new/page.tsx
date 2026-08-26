"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet-provider";
import { ds } from "@/lib/genlayer/data-source";
import * as contract from "@/lib/genlayer/contract";
import type { Standard, ClauseListItem } from "@/lib/genlayer/schema";
import type { CandidateInput } from "@/lib/genlayer/contract";
import { NetworkGate } from "@/components/ui/NetworkGate";
import { TransactionRail, type TxState } from "@/components/ui/TransactionRail";
import { RefBlock } from "@/components/ui/RefBlock";
import { NormativeBadge } from "@/components/ui/StatusBadge";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

const STANDARD_ID = 0;
const NORMATIVE_LEVELS: Array<{ value: number; label: string }> = [
  { value: 0, label: "MUST" },
  { value: 1, label: "SHOULD" },
  { value: 2, label: "MAY" },
];

type Operation = "ADD" | "REVISE" | "SUPERSEDE";

interface CandidateForm {
  id: string; // local key only
  operation: Operation;
  clause_id: string;
  previous_record_id: string; // input as string, parsed to number
  section_path: string;
  normative_level: number;
  text: string;
  source_url: string;
  source_digest: string;
}

function blankCandidate(): CandidateForm {
  return {
    id: Math.random().toString(36).slice(2),
    operation: "ADD",
    clause_id: "",
    previous_record_id: "0",
    section_path: "",
    normative_level: 0,
    text: "",
    source_url: "",
    source_digest: "",
  };
}

export default function ReleaseDesk() {
  const { account, mode } = useWallet();
  const [standard, setStandard] = useState<Standard | null>(null);
  const [clauses, setClauses] = useState<ClauseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);

  // Global form state
  const [commitSha, setCommitSha] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestDigest, setManifestDigest] = useState("");

  // Candidates list
  const [candidates, setCandidates] = useState<CandidateForm[]>([blankCandidate()]);

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

  const updateCandidate = (idx: number, patch: Partial<CandidateForm>) => {
    setCandidates(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const addCandidate = () => setCandidates(prev => [...prev, blankCandidate()]);

  const removeCandidate = (idx: number) => {
    setCandidates(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!/^[0-9a-fA-F]{40}$/.test(commitSha)) errs.commitSha = "Must be exactly 40 hexadecimal characters.";
    if (!manifestUrl.startsWith("https://raw.githubusercontent.com/")) errs.manifestUrl = "Must be a commit-pinned raw.githubusercontent.com URL.";
    if (!manifestDigest.startsWith("sha256:") || manifestDigest.length !== 71) errs.manifestDigest = "Must be sha256:<64 hex chars>.";
    if (candidates.length === 0) errs.candidates = "At least one candidate required.";
    if (candidates.length > 20) errs.candidates = "Max 20 candidates per proposal.";

    const seenClauseIds = new Set<string>();
    candidates.forEach((c, i) => {
      const prefix = `cand_${i}`;
      if (!c.clause_id.trim()) errs[`${prefix}_clause_id`] = "Clause ID required.";
      if (seenClauseIds.has(c.clause_id)) errs[`${prefix}_clause_id`] = "Duplicate clause_id in this proposal.";
      if (c.clause_id) seenClauseIds.add(c.clause_id);
      if (!c.section_path.trim()) errs[`${prefix}_section_path`] = "Section path required.";
      if (!c.text.trim()) errs[`${prefix}_text`] = "Text required.";
      if (c.text.length > 2000) errs[`${prefix}_text`] = "Text exceeds 2000 character limit.";
      if (!c.source_url.startsWith("https://raw.githubusercontent.com/")) errs[`${prefix}_source_url`] = "Must be a commit-pinned raw.githubusercontent.com URL.";
      if (!c.source_digest.startsWith("sha256:") || c.source_digest.length !== 71) errs[`${prefix}_source_digest`] = "Must be sha256:<64 hex chars>.";
      if ((c.operation === "REVISE") && (!c.previous_record_id || parseInt(c.previous_record_id) < 0)) {
        errs[`${prefix}_previous_record_id`] = "Previous canonical record ID required for REVISE.";
      }
    });

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const doPropose = async () => {
    if (!account || !standard) return;
    setTx({ stage: "awaiting_signature" });

    const candidateInputs: CandidateInput[] = candidates.map(c => ({
      operation: c.operation,
      clause_id: c.clause_id.trim(),
      previous_record_id: parseInt(c.previous_record_id) || 0,
      section_path: c.section_path.trim(),
      normative_level: c.normative_level,
      text: c.text.trim(),
      source_url: c.source_url.trim(),
      source_digest: c.source_digest.trim(),
    }));

    const result = await contract.proposeRelease(
      account, mode,
      STANDARD_ID,
      standard.canonical_version,
      commitSha.trim(),
      manifestUrl.trim(),
      manifestDigest.trim(),
      candidateInputs,
      (stage, txHash, elapsed) => setTx({ stage, txHash, elapsed }),
    );

    if (result.ok) {
      const proposalId = result.returnValue !== null && result.returnValue !== undefined
        ? Number(result.returnValue) : null;
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
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.25rem" }}>
          <Link href="/" style={{ fontSize: "12px", color: "var(--cobalt)", textDecoration: "none" }}>← Standard</Link>
          <h1 style={{ fontWeight: 700, fontSize: "18px", margin: 0 }}>Release Desk</h1>
        </div>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>
          Propose a commit-pinned release for semantic review on StudioNet
        </p>
      </div>

      {/* Base version gate */}
      {standard && (
        <div className="ref-block" style={{ marginBottom: "1.5rem" }}>
          <span className="spec-label">Current canonical version</span>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.25rem", flexWrap: "wrap" }}>
            <span className="version-plate">v{standard.canonical_version}</span>
            <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
              Release will target <strong>v{standard.canonical_version + 1}</strong>. If canonical advances before finalization, the proposal will be stale.
            </span>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <RefBlock label="Current manifest" url={standard.initial_manifest_url} digest={standard.canonical_manifest_digest} />
          </div>
        </div>
      )}

      {/* Two-column layout: commit info + submit */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "1rem" }}>Commit + Manifest</h2>
          <div style={{ marginBottom: "0.75rem" }}>
            <label className="spec-label" htmlFor="commit-sha">Commit SHA (40 hex chars)</label>
            <input
              id="commit-sha"
              className="spec-input font-mono-spec"
              style={{ fontSize: "12px" }}
              value={commitSha}
              onChange={e => setCommitSha(e.target.value.trim())}
              placeholder="abcdef1234567890abcdef1234567890abcdef12"
              maxLength={40}
              aria-describedby={formErrors.commitSha ? "err-commit-sha" : undefined}
            />
            {formErrors.commitSha && <div id="err-commit-sha" className="error-msg" role="alert">{formErrors.commitSha}</div>}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <label className="spec-label" htmlFor="manifest-url">Manifest URL</label>
            <input
              id="manifest-url"
              className="spec-input"
              style={{ fontSize: "12px" }}
              value={manifestUrl}
              onChange={e => setManifestUrl(e.target.value.trim())}
              placeholder="https://raw.githubusercontent.com/org/spec/SHA/manifest.json"
              aria-describedby={formErrors.manifestUrl ? "err-manifest-url" : undefined}
            />
            {formErrors.manifestUrl && <div id="err-manifest-url" className="error-msg" role="alert">{formErrors.manifestUrl}</div>}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <label className="spec-label" htmlFor="manifest-digest">Manifest digest (sha256:…)</label>
            <input
              id="manifest-digest"
              className="spec-input font-mono-spec"
              style={{ fontSize: "12px" }}
              value={manifestDigest}
              onChange={e => setManifestDigest(e.target.value.trim())}
              placeholder="sha256:aabbcc…"
              aria-describedby={formErrors.manifestDigest ? "err-manifest-digest" : undefined}
            />
            {formErrors.manifestDigest && <div id="err-manifest-digest" className="error-msg" role="alert">{formErrors.manifestDigest}</div>}
          </div>
        </div>

        {/* Submit column */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "1rem" }}>Submit</h2>
          <NetworkGate>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                <p style={{ margin: "0 0 0.25rem" }}>
                  Submits {candidates.length} candidate clause{candidates.length !== 1 ? "s" : ""} for semantic review on StudioNet.
                </p>
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

      {/* Candidates */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontWeight: 600, fontSize: "13px", margin: 0 }}>
            Candidate Clauses ({candidates.length})
            {formErrors.candidates && <span className="error-msg" style={{ marginLeft: "0.5rem" }}>{formErrors.candidates}</span>}
          </h2>
          <button
            className="btn-secondary"
            style={{ fontSize: "11px", padding: "0.25rem 0.6rem" }}
            onClick={addCandidate}
            disabled={candidates.length >= 20}
          >
            + Add clause
          </button>
        </div>

        {candidates.map((cand, i) => (
          <CandidateEditor
            key={cand.id}
            index={i}
            cand={cand}
            clauses={clauses}
            errors={formErrors}
            onChange={patch => updateCandidate(i, patch)}
            onRemove={() => removeCandidate(i)}
            canRemove={candidates.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateEditor({
  index,
  cand,
  clauses,
  errors,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  cand: CandidateForm;
  clauses: ClauseListItem[];
  errors: Record<string, string>;
  onChange: (patch: Partial<CandidateForm>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const prefix = `cand_${index}`;
  const needsPrevious = cand.operation === "REVISE";

  // When switching to REVISE, auto-fill previous_record_id from matching clause
  const autofillFromClause = (clauseId: string) => {
    const match = clauses.find(cl => cl.clause_id === clauseId);
    if (match && cand.operation === "REVISE") {
      onChange({ clause_id: clauseId, previous_record_id: String(match.record_id) });
    } else {
      onChange({ clause_id: clauseId });
    }
  };

  return (
    <div style={{
      marginBottom: "1.25rem",
      padding: "1rem",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      background: "var(--paper-raised)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <span style={{ fontWeight: 600, fontSize: "13px" }}>Clause {index + 1}</span>
        {canRemove && (
          <button
            className="btn-danger"
            style={{ fontSize: "11px", padding: "0.15rem 0.5rem" }}
            onClick={onRemove}
            aria-label={`Remove candidate ${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>

      {/* Operation type */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="spec-label">Operation</label>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
          {(["ADD", "REVISE", "SUPERSEDE"] as Operation[]).map(op => (
            <label key={op} style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer", fontSize: "12px" }}>
              <input
                type="radio"
                name={`${prefix}_op`}
                value={op}
                checked={cand.operation === op}
                onChange={() => onChange({ operation: op, previous_record_id: op === "REVISE" ? cand.previous_record_id : "0" })}
              />
              {op}
            </label>
          ))}
        </div>
        <div style={{ fontSize: "11px", color: "var(--ink-faint)", marginTop: "0.2rem" }}>
          {cand.operation === "ADD" && "Net-new clause (clause_id must not already exist in the standard)."}
          {cand.operation === "REVISE" && "Replaces existing canonical clause with same clause_id. Requires the current canonical record ID."}
          {cand.operation === "SUPERSEDE" && "New clause_id that semantically supersedes one or more existing clauses."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div>
          <label className="spec-label" htmlFor={`${prefix}_clause_id`}>Clause ID</label>
          {cand.operation === "REVISE" ? (
            <select
              id={`${prefix}_clause_id`}
              className="spec-input"
              style={{ fontSize: "12px" }}
              value={cand.clause_id}
              onChange={e => autofillFromClause(e.target.value)}
            >
              <option value="">— select existing clause —</option>
              {clauses.map(cl => (
                <option key={cl.record_id} value={cl.clause_id}>
                  §{cl.clause_id} — {cl.text.slice(0, 50)}{cl.text.length > 50 ? "…" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${prefix}_clause_id`}
              className="spec-input font-mono-spec"
              style={{ fontSize: "12px" }}
              value={cand.clause_id}
              onChange={e => onChange({ clause_id: e.target.value.trim() })}
              placeholder="e.g. 3-1"
              aria-describedby={errors[`${prefix}_clause_id`] ? `err-${prefix}-clause` : undefined}
            />
          )}
          {errors[`${prefix}_clause_id`] && <div id={`err-${prefix}-clause`} className="error-msg" role="alert">{errors[`${prefix}_clause_id`]}</div>}
        </div>

        <div>
          <label className="spec-label" htmlFor={`${prefix}_section_path`}>Section path</label>
          <input
            id={`${prefix}_section_path`}
            className="spec-input font-mono-spec"
            style={{ fontSize: "12px" }}
            value={cand.section_path}
            onChange={e => onChange({ section_path: e.target.value.trim() })}
            placeholder="e.g. security.transport"
            aria-describedby={errors[`${prefix}_section_path`] ? `err-${prefix}-sp` : undefined}
          />
          {errors[`${prefix}_section_path`] && <div id={`err-${prefix}-sp`} className="error-msg" role="alert">{errors[`${prefix}_section_path`]}</div>}
        </div>
      </div>

      {/* Previous record ID for REVISE */}
      {needsPrevious && (
        <div style={{ marginBottom: "0.75rem" }}>
          <label className="spec-label" htmlFor={`${prefix}_prev`}>Previous canonical record ID</label>
          <input
            id={`${prefix}_prev`}
            className="spec-input font-mono-spec"
            style={{ fontSize: "12px", width: "12rem" }}
            value={cand.previous_record_id}
            onChange={e => onChange({ previous_record_id: e.target.value })}
            placeholder="Record ID of current canonical clause"
            aria-describedby={errors[`${prefix}_previous_record_id`] ? `err-${prefix}-prev` : undefined}
          />
          <div style={{ fontSize: "11px", color: "var(--ink-faint)", marginTop: "0.2rem" }}>
            Auto-filled when selecting from the clause dropdown above. Visible in the clause index.
          </div>
          {errors[`${prefix}_previous_record_id`] && <div id={`err-${prefix}-prev`} className="error-msg" role="alert">{errors[`${prefix}_previous_record_id`]}</div>}
        </div>
      )}

      {/* Normative level */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="spec-label">Normative level</label>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
          {NORMATIVE_LEVELS.map(({ value, label }) => (
            <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer", fontSize: "12px" }}>
              <input
                type="radio"
                name={`${prefix}_norm`}
                value={value}
                checked={cand.normative_level === value}
                onChange={() => onChange({ normative_level: value })}
              />
              <NormativeBadge level={value} name={label} />
            </label>
          ))}
        </div>
      </div>

      {/* Clause text */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="spec-label" htmlFor={`${prefix}_text`}>
          Proposed text <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>({cand.text.length}/2000)</span>
        </label>
        <textarea
          id={`${prefix}_text`}
          className="spec-input"
          style={{ fontSize: "13px", minHeight: "6rem", resize: "vertical", fontFamily: "var(--font-prose)" }}
          value={cand.text}
          onChange={e => onChange({ text: e.target.value })}
          placeholder="The normative text of this clause. Write in precise, unambiguous language appropriate for a specification."
          maxLength={2000}
          aria-describedby={errors[`${prefix}_text`] ? `err-${prefix}-text` : undefined}
        />
        {errors[`${prefix}_text`] && <div id={`err-${prefix}-text`} className="error-msg" role="alert">{errors[`${prefix}_text`]}</div>}
      </div>

      {/* Source URL + digest */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="spec-label" htmlFor={`${prefix}_url`}>Source URL (commit-pinned)</label>
          <input
            id={`${prefix}_url`}
            className="spec-input"
            style={{ fontSize: "11px" }}
            value={cand.source_url}
            onChange={e => onChange({ source_url: e.target.value.trim() })}
            placeholder="https://raw.githubusercontent.com/org/spec/SHA/file.md"
            aria-describedby={errors[`${prefix}_source_url`] ? `err-${prefix}-url` : undefined}
          />
          {errors[`${prefix}_source_url`] && <div id={`err-${prefix}-url`} className="error-msg" role="alert">{errors[`${prefix}_source_url`]}</div>}
        </div>
        <div>
          <label className="spec-label" htmlFor={`${prefix}_digest`}>Source digest (sha256:…)</label>
          <input
            id={`${prefix}_digest`}
            className="spec-input font-mono-spec"
            style={{ fontSize: "11px" }}
            value={cand.source_digest}
            onChange={e => onChange({ source_digest: e.target.value.trim() })}
            placeholder="sha256:aabbcc…"
            aria-describedby={errors[`${prefix}_source_digest`] ? `err-${prefix}-dig` : undefined}
          />
          {errors[`${prefix}_source_digest`] && <div id={`err-${prefix}-dig`} className="error-msg" role="alert">{errors[`${prefix}_source_digest`]}</div>}
        </div>
      </div>
    </div>
  );
}
