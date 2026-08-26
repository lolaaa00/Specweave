"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ds } from "@/lib/genlayer/data-source";
import type { SupersessionGraph, SupersessionNode } from "@/lib/genlayer/schema";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

const STANDARD_ID = 0;

export default function GraphPage() {
  const [graph, setGraph] = useState<SupersessionGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setError("no_contract"); setLoading(false); return; }
    ds.getGraph(STANDARD_ID).then(r => {
      if (r.ok) setGraph(r.data);
      else setError(r.message);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: "2rem 1.25rem", color: "var(--ink-faint)", fontSize: "13px" }}>Loading graph…</div>;

  if (error === "no_contract") {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div className="empty-state">Contract not configured.</div>
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div className="empty-state" style={{ color: "var(--redline)" }}>{error ?? "Unavailable"}</div>
      </div>
    );
  }

  const supersededNodes = graph.nodes.filter(n => !n.active);
  const activeNodes = graph.nodes.filter(n => n.active);

  return (
    <div style={{ maxWidth: "1050px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: "18px", margin: "0 0 0.25rem" }}>Supersession Graph</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>
            Clause lineage with version labels · {graph.nodes.length} clause{graph.nodes.length !== 1 ? "s" : ""} · {graph.edges.length} supersession{graph.edges.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--border-strong)", borderRadius: "2px", overflow: "hidden" }}>
          {(["graph", "list"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "0.25rem 0.6rem", fontSize: "11px",
              background: view === v ? "var(--ink)" : "transparent",
              color: view === v ? "var(--paper)" : "var(--ink-muted)",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              fontWeight: view === v ? 600 : 400,
            }}>{v === "graph" ? "Visual" : "List"}</button>
          ))}
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="empty-state">No clauses found. Register initial clauses first.</div>
      ) : view === "list" ? (
        <ListView graph={graph} />
      ) : (
        <GraphView graph={graph} activeNodes={activeNodes} supersededNodes={supersededNodes} />
      )}
    </div>
  );
}

function GraphView({
  graph,
  activeNodes,
  supersededNodes,
}: {
  graph: SupersessionGraph;
  activeNodes: SupersessionNode[];
  supersededNodes: SupersessionNode[];
}) {
  // Simple engineering-style graph: version columns with clause boxes and connector lines
  const versions = new Set<number>();
  graph.nodes.forEach(n => {
    versions.add(n.introduced_version);
    if (!n.active) versions.add(n.superseded_version);
  });
  const versionsSorted = Array.from(versions).sort((a, b) => a - b);

  const nodesByIntro: Record<number, SupersessionNode[]> = {};
  graph.nodes.forEach(n => {
    if (!nodesByIntro[n.introduced_version]) nodesByIntro[n.introduced_version] = [];
    nodesByIntro[n.introduced_version].push(n);
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 0, minWidth: `${versionsSorted.length * 220}px` }}>
        {versionsSorted.map((ver) => (
          <div key={ver} style={{ flex: 1, minWidth: "200px", borderRight: "1px solid var(--border)" }}>
            {/* Version header */}
            <div style={{
              padding: "0.4rem 0.75rem",
              background: "var(--surface-alt)",
              borderBottom: "2px solid var(--border-strong)",
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              <span className="version-plate">v{ver}</span>
            </div>

            {/* Clauses introduced in this version */}
            <div style={{ padding: "0.75rem" }}>
              {(nodesByIntro[ver] ?? []).map(node => (
                <div key={node.record_id} style={{
                  border: `1px solid ${node.active ? "var(--border-strong)" : "var(--redline)"}`,
                  borderLeft: `3px solid ${node.active ? "var(--cobalt)" : "var(--redline)"}`,
                  borderRadius: "2px",
                  padding: "0.4rem 0.5rem",
                  marginBottom: "0.5rem",
                  background: node.active ? "white" : "var(--redline-bg)",
                  opacity: node.active ? 1 : 0.7,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="font-mono-spec" style={{ fontSize: "12px", fontWeight: 700 }}>§{node.clause_id}</span>
                    {!node.active && (
                      <span style={{ fontSize: "9px", color: "var(--redline)", border: "1px solid var(--redline)", padding: "0 3px", borderRadius: "1px" }}>
                        →v{node.superseded_version}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--ink-faint)", marginTop: "0.1rem" }}>
                    {node.normative_name} · {node.section_path}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {graph.edges.length > 0 && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "2px" }}>
          <span className="spec-label">Supersession edges</span>
          {graph.edges.map((e, i) => (
            <div key={i} style={{ fontSize: "12px", marginTop: "0.4rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className="font-mono-spec" style={{ fontSize: "11px" }}>§{e.old_clause_id}</span>
              <span style={{ color: "var(--redline)" }}>→ superseded at</span>
              <span className="version-plate">v{e.at_version}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListView({ graph }: { graph: SupersessionGraph }) {
  return (
    <table className="spec-table">
      <thead>
        <tr>
          <th>Clause ID</th>
          <th>Section</th>
          <th>Normative</th>
          <th>Introduced</th>
          <th>Superseded</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {[...graph.nodes].sort((a, b) => a.section_path.localeCompare(b.section_path)).map(n => (
          <tr key={n.record_id}>
            <td><span className="font-mono-spec" style={{ fontSize: "12px" }}>§{n.clause_id}</span></td>
            <td style={{ fontSize: "12px", color: "var(--ink-muted)" }}>{n.section_path}</td>
            <td style={{ fontSize: "11px" }}>{n.normative_name}</td>
            <td><span className="version-plate">v{n.introduced_version}</span></td>
            <td>
              {n.active
                ? <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>—</span>
                : <span className="version-plate" style={{ background: "var(--redline)", color: "white" }}>v{n.superseded_version}</span>
              }
            </td>
            <td>
              {n.active
                ? <span style={{ fontSize: "10px", color: "var(--status-canonical)" }}>active</span>
                : <span style={{ fontSize: "10px", color: "var(--redline)" }}>superseded</span>
              }
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
