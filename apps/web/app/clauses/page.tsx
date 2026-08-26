"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ds } from "@/lib/genlayer/data-source";
import type { ClauseListItem } from "@/lib/genlayer/schema";
import { NormativeBadge } from "@/components/ui/StatusBadge";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

const STANDARD_ID = 0;
const PAGE_SIZE = 50;

export default function ClausesPage() {
  const [clauses, setClauses] = useState<ClauseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "superseded">("active");
  const [normFilter, setNormFilter] = useState<"" | "0" | "1" | "2">("");

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setLoading(false); setError("no_contract"); return; }
    ds.listClauses(STANDARD_ID, 0, PAGE_SIZE).then((r) => {
      if (r.ok) setClauses(r.data);
      else setError(r.message);
      setLoading(false);
    });
  }, []);

  const displayed = clauses
    .filter((c) => {
      if (filter === "active") return c.active;
      if (filter === "superseded") return !c.active;
      return true;
    })
    .filter((c) => {
      if (!normFilter) return true;
      return c.normative_level === parseInt(normFilter);
    })
    .sort((a, b) => a.section_path.localeCompare(b.section_path));

  return (
    <div style={{ maxWidth: "1050px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: "18px", margin: "0 0 0.25rem" }}>Clause Index</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>
            All clauses for standard {STANDARD_ID} · live from chain
          </p>
        </div>
        <Link href="/releases/new" className="btn-primary" style={{ textDecoration: "none", fontSize: "12px", padding: "0.3rem 0.75rem" }}>
          Propose release
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "center" }}>
        <div style={{ display: "flex", border: "1px solid var(--border-strong)", borderRadius: "2px", overflow: "hidden" }}>
          {(["active", "all", "superseded"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "11px",
                fontWeight: filter === f ? 600 : 400,
                background: filter === f ? "var(--ink)" : "transparent",
                color: filter === f ? "var(--paper)" : "var(--ink-muted)",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {f === "active" ? "Active" : f === "all" ? "All" : "Superseded"}
            </button>
          ))}
        </div>
        <select
          value={normFilter}
          onChange={(e) => setNormFilter(e.target.value as "" | "0" | "1" | "2")}
          className="spec-input"
          style={{ width: "auto", minWidth: "120px", padding: "0.25rem 0.5rem" }}
          aria-label="Filter by normative level"
        >
          <option value="">Any normative</option>
          <option value="0">MUST</option>
          <option value="1">SHOULD</option>
          <option value="2">MAY</option>
        </select>
        <span style={{ fontSize: "12px", color: "var(--ink-faint)" }}>{displayed.length} clause{displayed.length !== 1 ? "s" : ""}</span>
      </div>

      {loading && <p style={{ color: "var(--ink-faint)", fontSize: "13px" }}>Loading…</p>}
      {!loading && error === "no_contract" && (
        <div className="empty-state">Contract not configured. Set <code className="font-mono-spec" style={{ fontSize: "11px" }}>NEXT_PUBLIC_SPECWEAVE_CONTRACT</code>.</div>
      )}
      {!loading && error && error !== "no_contract" && (
        <div className="empty-state" style={{ color: "var(--redline)" }}>{error}</div>
      )}
      {!loading && !error && displayed.length === 0 && (
        <div className="empty-state">No clauses match the current filter.</div>
      )}
      {!loading && !error && displayed.length > 0 && (
        <table className="spec-table">
          <thead>
            <tr>
              <th style={{ width: "70px" }}>Clause ID</th>
              <th>Section</th>
              <th style={{ width: "80px" }}>Normative</th>
              <th>Text</th>
              <th style={{ width: "60px" }}>Ver.</th>
              <th style={{ width: "70px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((cl) => (
              <tr key={cl.record_id} id={`record-${cl.record_id}`}>
                <td>
                  <span className="font-mono-spec" style={{ fontSize: "12px" }}>{cl.clause_id}</span>
                  <div style={{ fontSize: "10px", color: "var(--ink-faint)" }}>#{cl.record_id}</div>
                </td>
                <td style={{ fontSize: "12px", color: "var(--ink-muted)" }}>{cl.section_path}</td>
                <td><NormativeBadge level={cl.normative_level} name={cl.normative_name} /></td>
                <td className="font-prose" style={{ fontSize: "13px", lineHeight: 1.5, maxWidth: "400px" }}>
                  {cl.text.slice(0, 180)}{cl.text.length > 180 ? "…" : ""}
                </td>
                <td style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
                  {cl.active ? `v${cl.introduced_version}` : `v${cl.introduced_version}→v${cl.superseded_version}`}
                </td>
                <td>
                  {cl.active
                    ? <span style={{ fontSize: "10px", color: "var(--status-canonical)", fontFamily: "var(--font-mono-spec)" }}>active</span>
                    : <span style={{ fontSize: "10px", color: "var(--ink-faint)", textDecoration: "line-through" }}>superseded</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
