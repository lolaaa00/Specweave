"use client";

import { useEffect, useState } from "react";
import { explorerTxUrl } from "@/lib/genlayer/config";

export type TxStage =
  | "idle"
  | "awaiting_signature"
  | "submitted"
  | "consensus_pending"
  | "finalized_success"
  | "finalized_rollback"
  | "undetermined"
  | "error";

export interface TxState {
  stage: TxStage;
  txHash?: string;
  message?: string;
  returnValue?: unknown;
  elapsed?: number;
}

const ACTIVE_STAGES: TxStage[] = ["awaiting_signature", "submitted", "consensus_pending"];

export function TransactionRail({
  tx,
  onReset,
  onRetry,
}: {
  tx: TxState;
  onReset?: () => void;
  onRetry?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (ACTIVE_STAGES.includes(tx.stage)) {
      if (startedAt === null) setStartedAt(Date.now());
      const id = setInterval(() => setTick((t) => t + 1), 1000);
      return () => clearInterval(id);
    } else {
      setStartedAt(null);
      setTick(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.stage]);

  if (tx.stage === "idle") return null;

  const elapsedSec = startedAt !== null ? Math.round((Date.now() - startedAt) / 1000) : (tx.elapsed ?? 0);
  const showTimer = ACTIVE_STAGES.includes(tx.stage) && elapsedSec > 0;
  const canDismiss = !ACTIVE_STAGES.includes(tx.stage);
  const isSuccess = tx.stage === "finalized_success";
  const isError = tx.stage === "finalized_rollback" || tx.stage === "error";
  const isUndetermined = tx.stage === "undetermined";

  // Suppress TS unused warning on tick (used for re-render)
  void tick;

  return (
    <div
      className="tx-rail"
      role="status"
      aria-live="polite"
      data-stage={tx.stage}
      style={{
        borderColor: isSuccess
          ? "rgba(26,107,43,0.4)"
          : isError
          ? "rgba(192,57,43,0.35)"
          : isUndetermined
          ? "rgba(122,75,0,0.35)"
          : undefined,
        background: isSuccess
          ? "#F0FAF2"
          : isError
          ? "#FDF1F0"
          : isUndetermined
          ? "#FFFBEE"
          : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1, minWidth: 0 }}>

          {/* Stage label row */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <StageIndicator stage={tx.stage} />
            <span style={{
              fontSize: "12px",
              fontWeight: 600,
              color: isSuccess
                ? "var(--status-canonical)"
                : isError
                ? "var(--redline)"
                : isUndetermined
                ? "var(--status-review)"
                : "var(--ink-muted)",
            }}>
              <StageText stage={tx.stage} />
            </span>
            {showTimer && (
              <span style={{
                fontSize: "11px",
                color: "var(--ink-faint)",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {elapsedSec}s
              </span>
            )}
          </div>

          {/* TX hash */}
          {tx.txHash && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="provenance-tag">tx</span>
              <a
                href={explorerTxUrl(tx.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono-spec"
                style={{ fontSize: "11px", color: "var(--cobalt)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {tx.txHash.slice(0, 14)}…{tx.txHash.slice(-6)}
              </a>
            </div>
          )}

          {/* Message */}
          {tx.message && (
            <span style={{
              fontSize: "12px",
              color: isError ? "var(--redline)" : isUndetermined ? "var(--status-review)" : "var(--ink-muted)",
              lineHeight: 1.5,
            }}>
              {tx.message}
            </span>
          )}

          {/* Consensus guidance */}
          {tx.stage === "consensus_pending" && (
            <span style={{ fontSize: "11px", color: "var(--ink-faint)", marginTop: "0.1rem" }}>
              GenLayer validators are independently reviewing. This takes 2–5 minutes.
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
          {isUndetermined && onRetry && (
            <button className="btn-primary" style={{ fontSize: "11px", padding: "0.25rem 0.65rem" }} onClick={onRetry}>
              Retry
            </button>
          )}
          {canDismiss && onReset && (
            <button className="btn-secondary" style={{ fontSize: "11px", padding: "0.25rem 0.55rem" }} onClick={onReset}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StageIndicator({ stage }: { stage: TxStage }) {
  if (stage === "consensus_pending") {
    return (
      <div className="consensus-dots">
        <span /><span /><span />
      </div>
    );
  }
  if (stage === "submitted") {
    return <div className="tx-spinner" />;
  }
  if (stage === "awaiting_signature") {
    return <div className="tx-spinner" style={{ borderTopColor: "var(--cobalt)" }} />;
  }
  if (stage === "finalized_success") {
    return <span style={{ fontSize: "13px", color: "var(--status-canonical)" }}>✓</span>;
  }
  if (stage === "finalized_rollback" || stage === "error") {
    return <span style={{ fontSize: "13px", color: "var(--redline)" }}>✕</span>;
  }
  if (stage === "undetermined") {
    return <span style={{ fontSize: "13px", color: "var(--status-review)" }}>⚡</span>;
  }
  return null;
}

function StageText({ stage }: { stage: TxStage }) {
  const labels: Record<TxStage, string> = {
    idle: "",
    awaiting_signature: "Awaiting signature…",
    submitted: "Submitted to StudioNet…",
    consensus_pending: "Consensus in progress…",
    finalized_success: "Finalized — success",
    finalized_rollback: "Finalized — rolled back",
    undetermined: "UNDETERMINED — validators did not agree",
    error: "Error",
  };
  return <>{labels[stage]}</>;
}
