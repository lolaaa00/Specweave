"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ds } from "@/lib/genlayer/data-source";
import type { ReleaseProposal, Clause, PreviewOverlaps, ParsedClauseDecision } from "@/lib/genlayer/schema";
import { parseClauseDecisions } from "@/lib/genlayer/schema";
import { StatusBadge, DecisionBadge } from "@/components/ui/StatusBadge";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

export default function ConflictMatrix({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const proposalId = parseInt(id);

  const [proposal, setProposal] = useState<ReleaseProposal | null>(null);
  const [changedClauses, setChangedClauses] = useState<Clause[]>([]);
  const [overlaps, setOverlaps] = useState<PreviewOverlaps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setError("no_contract"); setLoading(false); return; }
    (async () => {
      const r = await ds.getRelease(proposalId);
      if (!r.ok) { setError(r.message); setLoading(false); return; }
      setProposal(r.data);

      const ids: number[] = JSON.parse(r.data.changed_clause_ids_json || "[]");
      const clauses = await Promise.all(ids.map(cid => ds.getClause(cid)));
      setChangedClauses(clauses.filter(c => c.ok).map(c => (c as { ok: true; data: Clause }).data));

      const overlapResults = await Promise.all(ids.map((_, i) => ds.previewOverlaps(proposalId, i, 5)));
      setOverlaps(overlapResults.filter(o => o.ok).map(o => (o as { ok: true; data: PreviewOverlaps }).data));
      setLoading(false);
    })();
  }, [proposalId]);

  if (loading) return <div style={{ padding: "2rem 1.25rem", color: "var(--ink-faint)", fontSize: "13px" }}>Loading…</div>;
  if (error || !proposal) return (
    <div style={{ padding: "2rem 1.25rem" }}>
      <div className="empty-state" style={{ color: "var(--redline)" }}>{error ?? "Not found"}</div>
    </div>
  );

  const decisions = parseClauseDecisions(proposal.clause_decisions_json);

  // Build matrix: changed clauses (rows) × affected existing clauses (columns)
  // Columns = union of all overlapping clause IDs
  const allOverlapClauseIds = new Set<string>();
  overlaps.forEach(o => o.overlaps.forEach(ov => allOverlapClauseIds.add(ov.clause_id)));
  const overlapClauseIdsSorted = Array.from(allOverlapClauseIds).sort();

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <Link href={`/releases/${proposalId}/diff`} style={{ fontSize: "12px", color: "var(--cobalt)", textDecoration: "none" }}>← Diff view</Link>
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <h1 style={{ fontWeight: 700, fontSize: "16px", margin: 0 }}>Conflict Matrix</h1>
        <StatusBadge status={proposal.status_name} />
      </div>

      <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginBottom: "1.25rem" }}>
        Changed clauses (rows) × semantically overlapping accepted clauses (columns). Cells show the validator decision enum — not similarity confidence. Raw distances are for context only.
      </p>

      {overlapClauseIdsSorted.length === 0 || changedClauses.length === 0 ? (
        <div className="empty-state">
          No semantic overlaps retrieved yet. Run the review from the diff view first.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="spec-table" style={{ minWidth: `${200 + overlapClauseIdsSorted.length * 140}px` }}>
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Changed clause</th>
                {overlapClauseIdsSorted.map(cid => (
                  <th key={cid} style={{ minWidth: "130px" }}>
                    <span className="font-mono-spec" style={{ fontSize: "11px" }}>§{cid}</span>
                  </th>
                ))}
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {changedClauses.map((cl) => {
                const o = overlaps.find(ov => ov.changed_clause_record_id === cl.record_id);
                const dec = decisions.find(d => d.record_id === cl.record_id);
                return (
                  <tr key={cl.record_id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        <span className="font-mono-spec" style={{ fontSize: "12px", fontWeight: 700 }}>§{cl.clause_id}</span>
                        <span style={{ fontSize: "10px", color: "var(--ink-faint)" }}>{cl.section_path}</span>
                        <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>{cl.normative_name}</span>
                      </div>
                    </td>
                    {overlapClauseIdsSorted.map(cid => {
                      const ov = o?.overlaps.find(x => x.clause_id === cid);
                      if (!ov) return <td key={cid}><span style={{ color: "var(--ink-faint)", fontSize: "11px" }}>—</span></td>;
                      return (
                        <td key={cid}>
                          <div style={{ fontSize: "11px" }}>
                            <div style={{ color: "var(--ink-faint)", marginBottom: "0.2rem" }}>
                              dist: {ov.distance.toFixed(3)}
                            </div>
                            {ov.active ? (
                              <span style={{ fontSize: "10px", color: "var(--status-canonical)" }}>active</span>
                            ) : (
                              <span style={{ fontSize: "10px", color: "var(--ink-faint)", textDecoration: "line-through" }}>superseded</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td>
                      {dec ? <DecisionBadge decision={dec.decision} /> : <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>pending review</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {decisions.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "0.75rem" }}>Decision Summary</h2>
          {decisions.map((d) => (
            <div key={d.record_id} style={{ marginBottom: "0.5rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span className="font-mono-spec" style={{ fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>§{d.clause_id}</span>
              <DecisionBadge decision={d.decision} />
              <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>{d.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
