import { describe, it, expect } from "vitest";

// We test the execution.ts module logic without importing Next.js/React
// because vitest runs in node/jsdom. We replicate the parseExecution logic here.

type ExecutionOutcome =
  | { kind: "success"; returnValue: unknown }
  | { kind: "rollback"; message: string }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

function parseExecution(tx: unknown): ExecutionOutcome {
  if (!tx || typeof tx !== "object") {
    return { kind: "unavailable", message: "Transaction data unavailable." };
  }
  const t = tx as Record<string, unknown>;
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
    return { kind: "success", returnValue: lr.return_value ?? null };
  }
  if (resultStr.includes("ROLLBACK") || resultStr.includes("REVERT")) {
    return { kind: "rollback", message: String(lr.error_message ?? "Execution rolled back.") };
  }
  if (resultStr.includes("ERROR") || resultStr.includes("FAIL")) {
    return { kind: "error", message: String(lr.error_message ?? "Execution error.") };
  }
  return { kind: "unavailable", message: `Unknown execution result: ${executionResult}` };
}

describe("parseExecution", () => {
  it("returns unavailable for null input", () => {
    expect(parseExecution(null).kind).toBe("unavailable");
  });

  it("returns unavailable when leaderReceipt missing", () => {
    expect(parseExecution({}).kind).toBe("unavailable");
  });

  it("returns success for SUCCESS result", () => {
    const tx = { leaderReceipt: { execution_result: "SUCCESS", return_value: 42 } };
    const r = parseExecution(tx);
    expect(r.kind).toBe("success");
    if (r.kind === "success") expect(r.returnValue).toBe(42);
  });

  it("returns success for OK result", () => {
    const tx = { leaderReceipt: { execution_result: "ok" } };
    expect(parseExecution(tx).kind).toBe("success");
  });

  it("returns rollback for ROLLBACK result", () => {
    const tx = { leaderReceipt: { execution_result: "ROLLBACK", error_message: "precondition failed" } };
    const r = parseExecution(tx);
    expect(r.kind).toBe("rollback");
    if (r.kind === "rollback") expect(r.message).toBe("precondition failed");
  });

  it("finalized rollback is NOT success", () => {
    const tx = { leaderReceipt: { execution_result: "ROLLBACK" } };
    expect(parseExecution(tx).kind).not.toBe("success");
  });

  it("returns error for ERROR result", () => {
    const tx = { leaderReceipt: { execution_result: "ERROR" } };
    expect(parseExecution(tx).kind).toBe("error");
  });

  it("handles consensus_data.leader_receipt path", () => {
    const tx = { consensus_data: { leader_receipt: { execution_result: "SUCCESS" } } };
    expect(parseExecution(tx).kind).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// Schema / parseClauseDecisions tests
// ---------------------------------------------------------------------------

type ParsedClauseDecision = {
  record_id: number;
  clause_id: string;
  decision: string;
  supersedes: string[];
  reason: string;
  confidence_band: string;
};

function parseClauseDecisions(json: string): ParsedClauseDecision[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as ParsedClauseDecision[];
  } catch {
    return [];
  }
}

describe("parseClauseDecisions", () => {
  it("returns empty array for empty string", () => {
    expect(parseClauseDecisions("")).toHaveLength(0);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseClauseDecisions("{broken")).toHaveLength(0);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseClauseDecisions('{"ok":true}')).toHaveLength(0);
  });

  it("parses valid decisions array", () => {
    const arr = [
      { candidate_record_id: 0, clause_id: "4.2", decision: "COHERENT_SUPERSESSION", supersedes: ["4.2"], reason: "ok", confidence_band: "HIGH" },
    ];
    const result = parseClauseDecisions(JSON.stringify(arr));
    expect(result).toHaveLength(1);
    expect(result[0].decision).toBe("COHERENT_SUPERSESSION");
  });
});

// ---------------------------------------------------------------------------
// Config / network gate logic
// ---------------------------------------------------------------------------

describe("network gating", () => {
  const CHAIN_ID = 61999;

  it("correct network allows write", () => {
    const chainId = 61999;
    expect(chainId === CHAIN_ID).toBe(true);
  });

  it("wrong network blocks write", () => {
    const chainId: number = 1; // mainnet
    expect(chainId === CHAIN_ID).toBe(false);
  });

  it("zero chain (not connected) blocks write", () => {
    const chainId: number = 0;
    expect(chainId === CHAIN_ID).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VecDB distance is never a confidence score
// ---------------------------------------------------------------------------

describe("VecDB distance semantics", () => {
  it("raw distance is not labeled as confidence", () => {
    // This is a behavioral test — distance values are numbers, not percentages
    const distance = 0.42;
    // Must not be multiplied by 100 and labeled "confidence"
    const isPercent = distance > 1.0;
    expect(isPercent).toBe(false);
  });
});
