import type { ReleaseStatus } from "@/lib/genlayer/schema";

const STATUS_CLASS_MAP: Record<string, string> = {
  PROPOSED: "status-proposed",
  UNDER_REVIEW: "status-review",
  ACCEPTABLE: "status-acceptable",
  REVISION_REQUIRED: "status-revision",
  REJECTED: "status-rejected",
  CANONICAL: "status-canonical",
  CANCELLED: "status-cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASS_MAP[status] ?? "status-cancelled";
  return (
    <span className={`status-badge ${cls}`}>{status.replace("_", " ")}</span>
  );
}

const DECISION_LABELS: Record<string, string> = {
  COHERENT_NEW: "Coherent New",
  COHERENT_SUPERSESSION: "Coherent Supersession",
  DUPLICATE_RULE: "Duplicate Rule",
  SEMANTIC_CONFLICT: "Semantic Conflict",
  INSUFFICIENT_CONTEXT: "Insufficient Context",
};

export function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span className={`status-badge decision-${decision}`} style={{ fontSize: "10px" }}>
      {DECISION_LABELS[decision] ?? decision}
    </span>
  );
}

export function NormativeBadge({ level, name }: { level: number; name: string }) {
  return (
    <span
      className={`status-badge normative-${name}`}
      style={{
        fontSize: "10px",
        border: "1px solid var(--border-strong)",
        color: level === 0 ? "var(--ink)" : level === 1 ? "var(--ink-muted)" : "var(--ink-faint)",
        background: "transparent",
      }}
    >
      {name}
    </span>
  );
}
