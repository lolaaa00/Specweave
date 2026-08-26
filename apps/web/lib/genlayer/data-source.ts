"use client";

// Single live/fixture boundary.
// In live mode (IS_LIVE=true), all data comes from the deployed contract.
// There is no silent fallback; missing contract = explicit unavailable state.

import { IS_LIVE, CONTRACT_ADDRESS } from "./config";
import * as contract from "./contract";
import type {
  Standard, Clause, ClauseListItem, ReleaseProposal, ReleaseListItem,
  PreviewOverlaps, SupersessionGraph,
} from "./schema";

export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "no_contract" | "rpc_error" | "not_found"; message: string };

function noContract(): DataResult<never> {
  return {
    ok: false,
    reason: "no_contract",
    message: `Contract address not configured. Set NEXT_PUBLIC_SPECWEAVE_CONTRACT in .env.local.`,
  };
}

async function wrap<T>(fn: () => Promise<T>): Promise<DataResult<T>> {
  if (!IS_LIVE) return { ok: false, reason: "no_contract", message: "Data mode is not live." };
  if (!CONTRACT_ADDRESS) return noContract();
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found") || msg.includes("revert")) {
      return { ok: false, reason: "not_found", message: msg };
    }
    return { ok: false, reason: "rpc_error", message: msg };
  }
}

export const ds = {
  getStandard: (id: number) => wrap(() => contract.getStandard(id)),
  getClause: (id: number) => wrap(() => contract.getClause(id)),
  getRelease: (id: number) => wrap(() => contract.getRelease(id)),
  getStandardCount: () => wrap(() => contract.getStandardCount()),
  getClauseCount: () => wrap(() => contract.getClauseCount()),
  getProposalCount: () => wrap(() => contract.getProposalCount()),
  listClauses: (standardId: number, offset: number, limit: number) =>
    wrap(() => contract.listClausesForStandard(standardId, offset, limit)),
  listProposals: (standardId: number, offset: number, limit: number) =>
    wrap(() => contract.listProposalsForStandard(standardId, offset, limit)),
  getGraph: (standardId: number) => wrap(() => contract.getSupersessionGraph(standardId)),
  previewOverlaps: (proposalId: number, idx: number, k: number) =>
    wrap(() => contract.previewOverlaps(proposalId, idx, k)),
  isEditor: (standardId: number, address: string) =>
    wrap(() => contract.isEditor(standardId, address)),
};
