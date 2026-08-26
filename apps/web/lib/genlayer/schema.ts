// Domain types matching contract view returns

export type NormativeLevel = 0 | 1 | 2; // MUST=0, SHOULD=1, MAY=2
export const NORMATIVE_NAMES: Record<number, string> = {
  0: "MUST",
  1: "SHOULD",
  2: "MAY",
};

export type ReleaseStatus =
  | "PROPOSED"
  | "UNDER_REVIEW"
  | "ACCEPTABLE"
  | "REVISION_REQUIRED"
  | "REJECTED"
  | "CANONICAL"
  | "CANCELLED";

export const STATUS_CLASSES: Record<ReleaseStatus, string> = {
  PROPOSED: "status-proposed",
  UNDER_REVIEW: "status-review",
  ACCEPTABLE: "status-acceptable",
  REVISION_REQUIRED: "status-revision",
  REJECTED: "status-rejected",
  CANONICAL: "status-canonical",
  CANCELLED: "status-cancelled",
};

export type ClauseDecision =
  | "COHERENT_NEW"
  | "COHERENT_SUPERSESSION"
  | "DUPLICATE_RULE"
  | "SEMANTIC_CONFLICT"
  | "INSUFFICIENT_CONTEXT";

export interface Standard {
  standard_id: number;
  steward: string;
  name: string;
  charter_url: string;
  charter_digest: string;
  canonical_version: number;
  canonical_manifest_digest: string;
  initial_manifest_url: string;
  initial_manifest_digest: string;
  clause_count: number;
  active: boolean;
  editor_count: number;
}

export interface Clause {
  record_id: number;
  standard_id: number;
  clause_id: string;
  section_path: string;
  normative_level: number;
  normative_name: string;
  text: string;
  source_url: string;
  source_digest: string;
  introduced_version: number;
  superseded_version: number;
  active: boolean;
}

export interface ClauseListItem {
  record_id: number;
  clause_id: string;
  section_path: string;
  normative_level: number;
  normative_name: string;
  text: string;
  introduced_version: number;
  superseded_version: number;
  active: boolean;
}

export interface ReleaseProposal {
  proposal_id: number;
  standard_id: number;
  proposer: string;
  base_version: number;
  commit_sha: string;
  manifest_url: string;
  manifest_digest: string;
  changed_clause_count: number;
  status: number;
  status_name: ReleaseStatus;
  clause_decisions_json: string;
  rationale: string;
  proposed_at: number;
  reviewed_at: number;
  changed_clause_ids_json: string;
}

export interface ReleaseListItem {
  proposal_id: number;
  base_version: number;
  commit_sha: string;
  changed_clause_count: number;
  status: number;
  status_name: ReleaseStatus;
  proposed_at: number;
}

export interface ParsedClauseDecision {
  record_id: number;
  clause_id: string;
  decision: ClauseDecision;
  supersedes: string[];
  reason: string;
  confidence_band: "HIGH" | "MEDIUM" | "LOW";
}

export interface OverlapResult {
  record_id: number;
  clause_id: string;
  section_path: string;
  normative_level: string;
  text: string;
  distance: number;
  active: boolean;
}

export interface PreviewOverlaps {
  changed_clause_record_id: number;
  changed_clause_id: string;
  overlaps: OverlapResult[];
}

export interface SupersessionNode {
  record_id: number;
  clause_id: string;
  section_path: string;
  normative_name: string;
  introduced_version: number;
  superseded_version: number;
  active: boolean;
}

export interface SupersessionEdge {
  from_record_id: number;
  from_clause_id: string;
  superseded_at_version: number;
}

export interface SupersessionGraph {
  nodes: SupersessionNode[];
  edges: SupersessionEdge[];
}

export function parseClauseDecisions(json: string): ParsedClauseDecision[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as ParsedClauseDecision[];
  } catch {
    return [];
  }
}
