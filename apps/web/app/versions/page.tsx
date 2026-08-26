"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ds } from "@/lib/genlayer/data-source";
import type { Standard, ReleaseListItem } from "@/lib/genlayer/schema";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CONTRACT_ADDRESS, explorerTxUrl } from "@/lib/genlayer/config";

const STANDARD_ID = 0;

export default function VersionLedger() {
  const [standard, setStandard] = useState<Standard | null>(null);
  const [proposals, setProposals] = useState<ReleaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setError("no_contract"); setLoading(false); return; }
    Promise.all([ds.getStandard(STANDARD_ID), ds.listProposals(STANDARD_ID, 0, 50)]).then(([sr, pr]) => {
      if (sr.ok) setStandard(sr.data);
      else setError(sr.message);
      if (pr.ok) setProposals(pr.data.sort((a, b) => b.proposal_id - a.proposal_id));
      setLoading(false);
    });
  }, []);

  const canonical = proposals.filter(p => p.status_name === "CANONICAL");
  const inProgress = proposals.filter(p => !["CANONICAL", "REJECTED", "CANCELLED"].includes(p.status_name));
  const closed = proposals.filter(p => ["REJECTED", "CANCELLED"].includes(p.status_name));

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: "18px", margin: "0 0 0.25rem" }}>Version Ledger</h1>
          {standard && (
            <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted)" }}>
              {standard.name} · current canonical: <span className="version-plate">v{standard.canonical_version}</span>
            </p>
          )}
        </div>
        <Link href="/releases/new" className="btn-primary" style={{ textDecoration: "none", fontSize: "12px", padding: "0.3rem 0.75rem" }}>
          Propose release
        </Link>
      </div>

      {loading && <p style={{ color: "var(--ink-faint)", fontSize: "13px" }}>Loading…</p>}
      {!loading && error === "no_contract" && <div className="empty-state">Contract not configured.</div>}
      {!loading && error && error !== "no_contract" && <div className="empty-state" style={{ color: "var(--redline)" }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Canonical releases — RFC-style table */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "0.75rem" }}>Canonical Releases</h2>
            {canonical.length === 0 ? (
              <div className="empty-state">No canonical releases yet. Propose and finalize a release to advance the canonical version.</div>
            ) : (
              <table className="spec-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>Ver.</th>
                    <th>Proposal</th>
                    <th>Commit SHA</th>
                    <th>Manifest digest</th>
                    <th>Changed clauses</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {canonical.map(p => (
                    <tr key={p.proposal_id}>
                      <td><span className="version-plate">v{p.base_version + 1}</span></td>
                      <td>
                        <Link href={`/releases/${p.proposal_id}/diff`} style={{ color: "var(--cobalt)", textDecoration: "none", fontSize: "12px" }}>
                          #{p.proposal_id}
                        </Link>
                      </td>
                      <td><span className="font-mono-spec" style={{ fontSize: "11px" }}>{p.commit_sha.slice(0, 12)}…</span></td>
                      <td><span className="digest" style={{ fontSize: "10px" }}>—</span></td>
                      <td style={{ fontSize: "12px" }}>{p.changed_clause_count}</td>
                      <td style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
                        {p.proposed_at ? new Date(p.proposed_at * 1000).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* In-progress proposals */}
          {inProgress.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "0.75rem" }}>In Progress</h2>
              <table className="spec-table">
                <thead>
                  <tr>
                    <th>Proposal</th>
                    <th>Base ver.</th>
                    <th>Status</th>
                    <th>Changed</th>
                    <th>Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {inProgress.map(p => (
                    <tr key={p.proposal_id}>
                      <td>
                        <Link href={`/releases/${p.proposal_id}/diff`} style={{ color: "var(--cobalt)", textDecoration: "none", fontSize: "12px" }}>
                          #{p.proposal_id}
                        </Link>
                      </td>
                      <td><span className="version-plate">v{p.base_version}</span></td>
                      <td><StatusBadge status={p.status_name} /></td>
                      <td style={{ fontSize: "12px" }}>{p.changed_clause_count}</td>
                      <td style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
                        {p.proposed_at ? new Date(p.proposed_at * 1000).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Closed */}
          {closed.length > 0 && (
            <details>
              <summary style={{ fontSize: "12px", color: "var(--ink-faint)", cursor: "pointer", marginBottom: "0.75rem" }}>
                Rejected / Cancelled ({closed.length})
              </summary>
              <table className="spec-table">
                <thead>
                  <tr>
                    <th>Proposal</th>
                    <th>Status</th>
                    <th>Base ver.</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(p => (
                    <tr key={p.proposal_id}>
                      <td>
                        <Link href={`/releases/${p.proposal_id}/diff`} style={{ color: "var(--cobalt)", textDecoration: "none", fontSize: "12px" }}>
                          #{p.proposal_id}
                        </Link>
                      </td>
                      <td><StatusBadge status={p.status_name} /></td>
                      <td><span className="version-plate">v{p.base_version}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}
