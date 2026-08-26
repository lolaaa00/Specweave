"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ds } from "@/lib/genlayer/data-source";
import type { Standard, ClauseListItem } from "@/lib/genlayer/schema";
import { StatusBadge, NormativeBadge } from "@/components/ui/StatusBadge";
import { RefBlock } from "@/components/ui/RefBlock";
import { CONTRACT_ADDRESS } from "@/lib/genlayer/config";

const STANDARD_ID = 0; // For MVP, we focus on standard 0

export default function StandardReader() {
  const [standard, setStandard] = useState<Standard | null>(null);
  const [clauses, setClauses] = useState<ClauseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) {
      setLoading(false);
      setError("no_contract");
      return;
    }
    const load = async () => {
      setLoading(true);
      const stdResult = await ds.getStandard(STANDARD_ID);
      if (!stdResult.ok) {
        if (stdResult.reason === "not_found") {
          setError("empty");
        } else {
          setError(stdResult.message);
        }
        setLoading(false);
        return;
      }
      setStandard(stdResult.data);
      const clauseResult = await ds.listClauses(STANDARD_ID, 0, 50);
      if (clauseResult.ok) setClauses(clauseResult.data);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem 1.25rem" }}>
      {(!loading && !error && !standard) || loading || error ? <ProductHero /> : null}
      {loading && <LoadingState />}
      {!loading && error === "no_contract" && <NoContractState />}
      {!loading && error === "empty" && <EmptyState />}
      {!loading && error && error !== "no_contract" && error !== "empty" && (
        <UnavailableState message={error} />
      )}
      {!loading && !error && standard && (
        <>
          <ProductHero compact />
          <DocumentView standard={standard} clauses={clauses} />
        </>
      )}
    </div>
  );
}

function DocumentView({ standard, clauses }: { standard: Standard; clauses: ClauseListItem[] }) {
  // Sort by section_path
  const sorted = [...clauses].sort((a, b) => a.section_path.localeCompare(b.section_path));
  const active = sorted.filter(c => c.active);
  const superseded = sorted.filter(c => !c.active);

  return (
    <div>
      {/* Version plate + standard header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "0.5rem" }}>
          <h1 style={{ fontWeight: 700, fontSize: "20px", margin: 0 }}>{standard.name}</h1>
          <span className="version-plate">v{standard.canonical_version}</span>
          <Link href="/versions" style={{ fontSize: "12px", color: "var(--cobalt)", textDecoration: "none" }}>
            version history →
          </Link>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", fontSize: "12px", color: "var(--ink-muted)" }}>
          <span>Steward: <span className="font-mono-spec" style={{ fontSize: "11px" }}>{standard.steward.slice(0,6)}…{standard.steward.slice(-4)}</span></span>
          <span>{standard.clause_count} clauses · {standard.editor_count} editor{standard.editor_count !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Charter ref */}
      <div style={{ marginBottom: "1.5rem" }}>
        <RefBlock label="Charter" url={standard.charter_url} digest={standard.charter_digest} />
      </div>

      {/* Current manifest */}
      <div style={{ marginBottom: "2rem" }}>
        <RefBlock label="Current canonical manifest" url={standard.initial_manifest_url} digest={standard.canonical_manifest_digest} />
      </div>

      {/* Normative document */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontWeight: 600, fontSize: "14px", margin: 0 }}>Normative Clauses ({active.length})</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/clauses" className="btn-secondary" style={{ fontSize: "11px", padding: "0.2rem 0.6rem", textDecoration: "none", display: "inline-block" }}>Full index →</Link>
            <Link href="/releases/new" className="btn-primary" style={{ fontSize: "11px", padding: "0.2rem 0.6rem", textDecoration: "none", display: "inline-block" }}>Propose release</Link>
          </div>
        </div>

        {active.length === 0 ? (
          <div className="empty-state">
            <p style={{ margin: 0 }}>No active clauses. Register initial clauses to begin.</p>
          </div>
        ) : (
          <div>
            {active.map((cl) => (
              <ClauseRow key={cl.record_id} clause={cl} />
            ))}
          </div>
        )}

        {superseded.length > 0 && (
          <details style={{ marginTop: "2rem" }}>
            <summary style={{ fontSize: "12px", color: "var(--ink-faint)", cursor: "pointer", marginBottom: "0.75rem" }}>
              Superseded clauses ({superseded.length})
            </summary>
            {superseded.map((cl) => (
              <ClauseRow key={cl.record_id} clause={cl} superseded />
            ))}
          </details>
        )}
      </section>

      {/* Quick nav */}
      <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", gap: "1rem", fontSize: "12px" }}>
        <Link href="/releases/new" style={{ color: "var(--cobalt)", textDecoration: "none" }}>Propose a release →</Link>
        <Link href="/graph" style={{ color: "var(--cobalt)", textDecoration: "none" }}>Supersession graph →</Link>
        <Link href="/canonical" style={{ color: "var(--cobalt)", textDecoration: "none" }}>Machine receipt →</Link>
      </div>
    </div>
  );
}

function ClauseRow({ clause, superseded = false }: { clause: ClauseListItem; superseded?: boolean }) {
  return (
    <div
      className={`stagger-item${superseded ? "" : " clause-row"}`}
      style={{
        display: "grid",
        gridTemplateColumns: "3rem 1fr",
        borderBottom: "1px solid var(--border)",
        opacity: superseded ? 0.5 : 1,
      }}
    >
      {/* Margin clause number */}
      <div style={{ borderRight: "1px solid var(--border)", paddingRight: "0.5rem", paddingTop: "0.75rem" }}>
        <span className="clause-num">§{clause.clause_id}</span>
      </div>

      {/* Clause content */}
      <div
        style={{
          padding: "0.75rem 0 0.75rem 1rem",
          borderLeft: superseded
            ? "none"
            : clause.introduced_version > 0
            ? "2px solid var(--marker-dark)"
            : "2px solid transparent",
          paddingLeft: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <NormativeBadge level={clause.normative_level} name={clause.normative_name} />
          <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
            {clause.section_path}
          </span>
          {superseded && (
            <span style={{ fontSize: "10px", color: "var(--redline)" }}>
              superseded at v{clause.superseded_version}
            </span>
          )}
          {!superseded && clause.introduced_version > 0 && (
            <span style={{ fontSize: "10px", color: "var(--marker-dark)" }}>
              v{clause.introduced_version}
            </span>
          )}
        </div>
        <p
          className="font-prose"
          style={{ margin: 0, fontSize: "14px", lineHeight: 1.65, color: superseded ? "var(--ink-faint)" : "var(--ink)" }}
        >
          {clause.text}
        </p>
        <div style={{ marginTop: "0.35rem" }}>
          <Link
            href={`/clauses#record-${clause.record_id}`}
            style={{ fontSize: "11px", color: "var(--cobalt)", textDecoration: "none" }}
          >
            #{clause.record_id}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProductHero({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div style={{
        marginBottom: "1.75rem",
        padding: "1rem 1.25rem",
        background: "var(--paper-raised)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        boxShadow: "var(--shadow-sm)",
        animation: "fadeIn 0.4s ease-out both",
      }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontWeight: 700, fontSize: "13px" }}>SpecWeave</span>
          <span className="provenance-tag" style={{ fontSize: "10px" }}>· studionet · 0xC5d2…b52A</span>
        </div>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted)", lineHeight: 1.6 }}>
          Semantic release gate for open standards — GenLayer validators independently review each changed clause via{" "}
          <span className="font-mono-spec" style={{ fontSize: "10px" }}>gl.eq_principle.prompt_comparative</span>.
          No single party controls the gate.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "2.5rem", animation: "fadeUp 0.4s ease-out both" }}>
      {/* Hero */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <h1 style={{ fontWeight: 700, fontSize: "28px", letterSpacing: "-0.02em" }}>SpecWeave</h1>
          <span className="provenance-tag">on GenLayer</span>
        </div>
        <p style={{ margin: 0, fontSize: "15px", color: "var(--ink-muted)", lineHeight: 1.65, maxWidth: "600px" }}>
          A tamper-resistant semantic gate between a proposed commit and a published standard version.
          No version bump without validator consensus.
        </p>
      </div>

      {/* Three pillars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          {
            title: "What it does",
            body: "SpecWeave's Intelligent Contract asks GenLayer validators to independently review each changed clause for coherence, conflicts, and supersessions — before any version bump is allowed.",
          },
          {
            title: "Who it's for",
            body: "Standards bodies and open-source specification projects that need an auditable, cryptographically anchored semantic review step between a proposed commit and a published release.",
          },
          {
            title: "Why consensus",
            body: "One reviewer can be wrong or dishonest. GenLayer runs the same AI review across N validators using gl.eq_principle.prompt_comparative — a malicious leader simply fails consensus.",
          },
        ].map(({ title, body }, i) => (
          <div
            key={title}
            className="stagger-item"
            style={{
              padding: "1rem 1.1rem",
              background: "var(--paper-raised)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "var(--shadow-sm)",
              animationDelay: `${i * 0.08}s`,
            }}
          >
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--cobalt)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</div>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted)", lineHeight: 1.65 }}>{body}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "1rem", fontSize: "11px", color: "var(--ink-faint)", borderTop: "1px solid var(--border)", paddingTop: "0.65rem", flexWrap: "wrap" }}>
        <span className="font-mono-spec" style={{ fontSize: "10px" }}>chain:61999</span>
        <span>·</span>
        <span className="font-mono-spec" style={{ fontSize: "10px" }}>0xC5d2…b52A</span>
        <span>·</span>
        <span>43 contract tests</span>
        <span>·</span>
        <span>gl.eq_principle.prompt_comparative</span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ paddingTop: "0.5rem" }}>
      <div className="skeleton" style={{ height: "28px", width: "180px", marginBottom: "0.75rem" }} />
      <div className="skeleton" style={{ height: "14px", width: "320px", marginBottom: "0.4rem" }} />
      <div className="skeleton" style={{ height: "14px", width: "240px", marginBottom: "1.5rem" }} />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--border)", padding: "0.75rem 0", alignItems: "flex-start" }}>
          <div className="skeleton" style={{ height: "12px", width: "2rem", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: "12px", width: "60%", marginBottom: "0.35rem" }} />
            <div className="skeleton" style={{ height: "12px", width: "90%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoContractState() {
  return (
    <div className="empty-state" style={{ textAlign: "left" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "0.5rem" }}>Contract not configured</h2>
      <p style={{ margin: "0 0 0.75rem", color: "var(--ink-muted)", fontSize: "13px" }}>
        Set <code className="font-mono-spec" style={{ fontSize: "12px", background: "var(--surface)", padding: "1px 4px" }}>NEXT_PUBLIC_SPECWEAVE_CONTRACT</code> in{" "}
        <code className="font-mono-spec" style={{ fontSize: "12px", background: "var(--surface)", padding: "1px 4px" }}>.env.local</code> to point to a deployed SpecWeave contract on StudioNet.
      </p>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>
        Deploy the contract: <code className="font-mono-spec" style={{ fontSize: "11px" }}>cd contracts && genlayer deploy specweave.py --network studionet</code>
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p style={{ margin: "0 0 0.5rem", fontSize: "14px" }}>No standard found at index 0.</p>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>
        Use the CLI script to seed an initial standard, or connect a wallet with steward rights to create one.
      </p>
    </div>
  );
}

function UnavailableState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <p style={{ margin: "0 0 0.5rem", fontSize: "14px", color: "var(--redline)" }}>Contract unavailable</p>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-faint)" }}>{message}</p>
    </div>
  );
}
