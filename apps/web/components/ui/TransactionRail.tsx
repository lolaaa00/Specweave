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
  // Live elapsed ticker (increments every second while in an active stage)
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

  return (
    <div
      className="tx-rail"
      role="status"
      aria-live="polite"
      // Suppress exhaustive-deps lint for tick dep (intentional ticker)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data-tick={tick as any}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <StageLabel stage={tx.stage} />
            {showTimer && (
              <span style={{ fontSize: "11px", color: "var(--ink-faint)", fontVariantNumeric: "tabular-nums" }}>
                {elapsedSec}s
              </span>
            )}
          </div>

          {tx.txHash && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="provenance-tag">tx:</span>
              <a
                href={explorerTxUrl(tx.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono-spec"
                style={{ fontSize: "11px", color: "var(--cobalt)" }}
              >
                {tx.txHash.slice(0, 12)}…{tx.txHash.slice(-6)}
              </a>
            </div>
          )}

          {tx.message && (
            <span style={{
              fontSize: "12px",
              color: (tx.stage === "finalized_rollback" || tx.stage === "error")
                ? "var(--redline)"
                : tx.stage === "undetermined"
                ? "var(--status-review)"
                : "var(--ink-muted)",
            }}>
              {tx.message}
            </span>
          )}

          {tx.stage === "consensus_pending" && (
            <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
              GenLayer validators are reviewing. This takes 2–5 minutes. Safe to wait.
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
          {tx.stage === "undetermined" && onRetry && (
            <button className="btn-primary" style={{ fontSize: "11px", padding: "0.2rem 0.6rem" }} onClick={onRetry}>
              Retry
            </button>
          )}
          {canDismiss && onReset && (
            <button className="btn-secondary" style={{ fontSize: "11px", padding: "0.2rem 0.5rem" }} onClick={onReset}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StageLabel({ stage }: { stage: TxStage }) {
  const labels: Record<TxStage, { text: string; color: string }> = {
    idle: { text: "", color: "" },
    awaiting_signature: { text: "Awaiting signature…", color: "var(--ink-muted)" },
    submitted: { text: "Submitted to StudioNet…", color: "var(--status-review)" },
    consensus_pending: { text: "Consensus in progress…", color: "var(--status-review)" },
    finalized_success: { text: "Finalized — success.", color: "var(--status-canonical)" },
    finalized_rollback: { text: "Finalized — rolled back.", color: "var(--redline)" },
    undetermined: { text: "UNDETERMINED — validators did not agree.", color: "var(--status-review)" },
    error: { text: "Error.", color: "var(--redline)" },
  };
  const { text, color } = labels[stage];
  return <span style={{ fontSize: "12px", fontWeight: 600, color }}>{text}</span>;
}
