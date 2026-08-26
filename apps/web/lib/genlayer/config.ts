export const CHAIN_ID = 61999;
export const CHAIN_NAME = "studionet";
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";
export const EXPLORER_BASE =
  "https://explorer-studio.genlayer.com";
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_SPECWEAVE_CONTRACT ?? "";
export const DATA_MODE =
  process.env.NEXT_PUBLIC_SPECWEAVE_DATA ?? "live";

export const IS_LIVE = DATA_MODE === "live";

export const REQUIRED_METHODS = [
  "create_standard",
  "set_editor",
  "register_initial_clause",
  "propose_release",
  "review_release",
  "finalize_release",
  "cancel_release",
  "get_standard",
  "get_clause",
  "get_release",
  "preview_overlaps",
  "get_standard_count",
  "get_clause_count",
  "get_proposal_count",
  "list_clauses_for_standard",
  "list_proposals_for_standard",
  "get_supersession_graph",
  "is_editor",
] as const;

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}
