"use client";

// Robust parsing of GenVM leader execution result
// A FINALIZED transaction is NOT necessarily a success.

export type ExecutionOutcome =
  | { kind: "success"; returnValue: unknown }
  | { kind: "rollback"; message: string }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

export function parseExecution(tx: unknown): ExecutionOutcome {
  if (!tx || typeof tx !== "object") {
    return { kind: "unavailable", message: "Transaction data unavailable." };
  }

  const t = tx as Record<string, unknown>;

  // genlayer-js 1.1.8 shape
  const leaderReceipt =
    t.leaderReceipt ??
    t.leader_receipt ??
    (t.consensus_data as Record<string, unknown>)?.["leader_receipt"] ??
    null;

  if (!leaderReceipt || typeof leaderReceipt !== "object") {
    return { kind: "unavailable", message: "Leader receipt not found in transaction." };
  }

  const lr = leaderReceipt as Record<string, unknown>;
  const executionResult = lr.execution_result ?? lr.executionResult ?? lr.result ?? null;

  if (executionResult === null || executionResult === undefined) {
    return { kind: "unavailable", message: "Execution result field missing." };
  }

  const resultStr = String(executionResult).toUpperCase();

  if (resultStr === "SUCCESS" || resultStr === "OK") {
    const returnValue = lr.return_value ?? lr.returnValue ?? null;
    return { kind: "success", returnValue };
  }

  if (resultStr.includes("ROLLBACK") || resultStr.includes("REVERT")) {
    const msg = (lr.error_message ?? lr.message ?? "Execution rolled back.") as string;
    return { kind: "rollback", message: msg };
  }

  if (resultStr.includes("ERROR") || resultStr.includes("FAIL")) {
    const msg = (lr.error_message ?? lr.message ?? "Execution error.") as string;
    return { kind: "error", message: msg };
  }

  return { kind: "unavailable", message: `Unknown execution result: ${executionResult}` };
}

export function isSuccess(outcome: ExecutionOutcome): outcome is { kind: "success"; returnValue: unknown } {
  return outcome.kind === "success";
}
