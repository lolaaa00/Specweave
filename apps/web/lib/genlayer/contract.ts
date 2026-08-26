"use client";

import { CONTRACT_ADDRESS, CHAIN_ID } from "./config";
import { createReadClient, createWriteClient, getChainId } from "./client";
import { parseExecution } from "./execution";
import type {
  Standard, Clause, ClauseListItem, ReleaseProposal, ReleaseListItem,
  PreviewOverlaps, SupersessionGraph, CandidateClause,
} from "./schema";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_RETRIES = 90; // 7.5 minutes

// Terminal statuses that end polling
const TERMINAL_STATUSES = new Set([
  "FINALIZED", "CANCELED",
  "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
]);

function contractAddr(): `0x${string}` {
  if (!CONTRACT_ADDRESS) throw new Error("Contract address not configured. Set NEXT_PUBLIC_SPECWEAVE_CONTRACT.");
  return CONTRACT_ADDRESS as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

async function callView<T>(method: string, args: unknown[] = []): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createReadClient() as unknown as any;
  const result = await client.readContract({
    address: contractAddr(),
    functionName: method,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: args as any[],
  });
  return result as T;
}

// ---------------------------------------------------------------------------
// Write result type
// ---------------------------------------------------------------------------

export type WriteResult =
  | { ok: true; txHash: string; returnValue: unknown }
  | { ok: false; txHash?: string; reason: string; kind: "rollback" | "error" | "unavailable" | "wrong_network" | "user_rejected" | "undetermined" };

// ---------------------------------------------------------------------------
// Write helper
// ---------------------------------------------------------------------------

export type WriteProgressCallback = (stage: "submitted" | "consensus_pending", txHash: string, elapsed: number) => void;

import type { WalletMode } from "../wallet-provider";

async function sendWrite(
  account: string,
  mode: WalletMode,
  method: string,
  args: unknown[],
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  // Independent network gate
  if (mode === "injected") {
    const chainId = await getChainId();
    if (chainId !== CHAIN_ID) {
      return { ok: false, reason: `Wrong network (got ${chainId}, expected ${CHAIN_ID}). Switch to StudioNet.`, kind: "wrong_network" };
    }
  }

  if (mode === "none") {
    return { ok: false, reason: "No wallet connected.", kind: "error" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createWriteClient(account, mode === "generated" ? "generated" : "injected") as unknown as any;
  let txHash: string | undefined;

  try {
    const hash = await client.writeContract({
      address: contractAddr(),
      functionName: method,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: args as any[],
      value: BigInt(0),
    });
    txHash = hash as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      return { ok: false, reason: "Transaction rejected by user.", kind: "user_rejected" };
    }
    return { ok: false, reason: msg, kind: "error" };
  }

  onProgress?.("submitted", txHash, 0);

  // Poll for terminal status
  const startTime = Date.now();
  for (let i = 0; i < POLL_MAX_RETRIES; i++) {
    await sleep(POLL_INTERVAL_MS);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    onProgress?.("consensus_pending", txHash, elapsed);

    try {
      const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
      if (tx && typeof tx === "object") {
        const t = tx as Record<string, unknown>;
        const status = ((t.status ?? t.transactionStatus ?? "") as string).toUpperCase();

        if (status === "FINALIZED") {
          const outcome = parseExecution(tx);
          if (outcome.kind === "success") {
            return { ok: true, txHash, returnValue: outcome.returnValue };
          }
          return { ok: false, txHash, reason: outcome.message, kind: outcome.kind as "rollback" | "error" | "unavailable" };
        }

        if (status === "UNDETERMINED") {
          return {
            ok: false, txHash,
            reason: "Validators could not reach agreement (UNDETERMINED). Nothing was written. You can retry the same action.",
            kind: "undetermined",
          };
        }

        if (status === "VALIDATORS_TIMEOUT") {
          return {
            ok: false, txHash,
            reason: "Validators timed out before reaching consensus. Nothing was written. You can retry.",
            kind: "undetermined",
          };
        }

        if (status === "LEADER_TIMEOUT") {
          return {
            ok: false, txHash,
            reason: "Leader timed out before proposing a result. Nothing was written. You can retry.",
            kind: "undetermined",
          };
        }

        if (status === "CANCELED") {
          return { ok: false, txHash, reason: "Transaction was cancelled on-chain.", kind: "error" };
        }
      }
    } catch {
      // continue polling
    }
  }

  return {
    ok: false,
    txHash,
    reason: `Transaction ${txHash} did not reach a terminal status within timeout. Check the explorer for its current state.`,
    kind: "unavailable",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Public contract API — reads
// ---------------------------------------------------------------------------

export async function getStandard(standardId: number): Promise<Standard> {
  return callView<Standard>("get_standard", [standardId]);
}
export async function getClause(clauseRecordId: number): Promise<Clause> {
  return callView<Clause>("get_clause", [clauseRecordId]);
}
export async function getRelease(proposalId: number): Promise<ReleaseProposal> {
  return callView<ReleaseProposal>("get_release", [proposalId]);
}
export async function getStandardCount(): Promise<number> {
  return Number(await callView<string | number>("get_standard_count"));
}
export async function getClauseCount(): Promise<number> {
  return Number(await callView<string | number>("get_clause_count"));
}
export async function getProposalCount(): Promise<number> {
  return Number(await callView<string | number>("get_proposal_count"));
}
export async function listClausesForStandard(standardId: number, offset: number, limit: number): Promise<ClauseListItem[]> {
  return callView<ClauseListItem[]>("list_clauses_for_standard", [standardId, offset, limit]);
}
export async function listProposalsForStandard(standardId: number, offset: number, limit: number): Promise<ReleaseListItem[]> {
  return callView<ReleaseListItem[]>("list_proposals_for_standard", [standardId, offset, limit]);
}
export async function getSupersessionGraph(standardId: number): Promise<SupersessionGraph> {
  return callView<SupersessionGraph>("get_supersession_graph", [standardId]);
}
export async function getCandidate(candidateRecordId: number): Promise<CandidateClause> {
  return callView<CandidateClause>("get_candidate", [candidateRecordId]);
}
export async function getCandidateCount(): Promise<number> {
  return Number(await callView<string | number>("get_candidate_count"));
}
export async function previewOverlaps(proposalId: number, candidateIndex: number, k: number): Promise<PreviewOverlaps> {
  return callView<PreviewOverlaps>("preview_overlaps", [proposalId, candidateIndex, k]);
}
export async function isEditor(standardId: number, address: string): Promise<boolean> {
  return callView<boolean>("is_editor", [standardId, address]);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createStandard(
  account: string, mode: WalletMode,
  name: string, charterUrl: string, charterDigest: string,
  initialManifestUrl: string, initialManifestDigest: string,
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "create_standard",
    [name, charterUrl, charterDigest, initialManifestUrl, initialManifestDigest], onProgress);
}

export async function setEditor(
  account: string, mode: WalletMode,
  standardId: number, editorAddress: string, enabled: boolean,
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "set_editor", [standardId, editorAddress, enabled], onProgress);
}

export async function registerInitialClause(
  account: string, mode: WalletMode,
  standardId: number, clauseId: string, sectionPath: string,
  normativeLevel: number, text: string, sourceUrl: string, sourceDigest: string,
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "register_initial_clause",
    [standardId, clauseId, sectionPath, normativeLevel, text, sourceUrl, sourceDigest], onProgress);
}

export interface CandidateInput {
  operation: "ADD" | "REVISE" | "SUPERSEDE";
  clause_id: string;
  previous_record_id: number;
  section_path: string;
  normative_level: number;
  text: string;
  source_url: string;
  source_digest: string;
}

export async function proposeRelease(
  account: string, mode: WalletMode,
  standardId: number, baseVersion: number, commitSha: string,
  manifestUrl: string, manifestDigest: string,
  candidates: CandidateInput[],
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "propose_release",
    [standardId, baseVersion, commitSha, manifestUrl, manifestDigest, candidates],
    onProgress);
}

export async function reviewRelease(
  account: string, mode: WalletMode,
  proposalId: number,
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "review_release", [proposalId], onProgress);
}

export async function finalizeRelease(
  account: string, mode: WalletMode,
  proposalId: number,
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "finalize_release", [proposalId], onProgress);
}

export async function cancelRelease(
  account: string, mode: WalletMode,
  proposalId: number,
  onProgress?: WriteProgressCallback,
): Promise<WriteResult> {
  return sendWrite(account, mode, "cancel_release", [proposalId], onProgress);
}
