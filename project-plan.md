# SpecWeave — Project Plan

## Mission

Build **SpecWeave** into a complete contract + frontend product, using the specifications in this folder as the source of truth.

SpecWeave is a release gate for standards that are drafted off-chain in Git or documents. A version candidate submits a commit-pinned manifest of changed clauses. VecDB retrieves semantically overlapping accepted clauses from anywhere in the standard, catching conflicts that a line diff misses. GenLayer validators decide whether the candidate is coherent with the existing standard, intentionally supersedes named clauses, duplicates an existing rule or requires revision. The accepted canonical version hash is then advanced on-chain.

## MVP target

One GitHub-hosted specification, commit-pinned manifest generator, bounded changed clauses, semantic overlap retrieval, release review, explicit supersession and canonical version advancement on StudioNet.

## Planning principles

1. Do not build the UI first and retrofit a weak contract.
2. Do not build consensus before deterministic state/version/size guards.
3. Do not store high-frequency work on-chain simply because it is easy to model.
4. Do not turn VecDB into a classifier. It is context retrieval.
5. Do not call a deployment “done” until a real StudioNet lifecycle is exercised.
6. Do not create fake fallback data in live mode.
7. Every meaningful work unit updates `handoff.md` immediately.
8. When a durable decision changes, update `memory.md` in the same work unit.

## Reference demo the implementation must support

Seed an initial mini-standard with 12 clauses, propose a commit-pinned release changing three clauses, surface one distant semantic conflict, revise the manifest to make supersession explicit, then finalize the coherent release and show canonical version advancement.

## Phase 0 — Repository and truth scaffold

- Create the recommended repository tree.
- Copy these blueprint docs verbatim first; do not rewrite them from memory.
- Add package manifests with pinned baseline versions.
- Add `.env.example` with StudioNet variables and no secrets.
- Create a placeholder README that explicitly says not deployed yet.
- Initialize `handoff.md` workflow and commit.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 1 — Deterministic contract skeleton

- Add dependency header and imports.
- Implement storage dataclasses, enums and counters.
- Implement create/register deterministic methods and view methods.
- Implement all size, role, namespace and version guards.
- Write direct tests for creation, invalid inputs, ownership, pagination and forbidden transitions.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 2 — Semantic memory

- Add the project-specific `VectorPointer`.
- Implement normalized embedding text exactly around: Every accepted clause gets an embedding of clause ID, section path, normative strength (MUST/SHOULD/MAY), defined terms and bounded text. A release candidate embeds each changed clause and retrieves up to 5 semantically overlapping accepted clauses across the entire standard. Exact referenced clause IDs are always included regardless of distance.
- Insert only invariant-approved records.
- Implement bounded KNN + namespace/version filters.
- Expose a preview view for testing/audit.
- Add tests proving a semantically related but out-of-namespace record cannot authorize anything.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 3 — Consensus path

- Define strict decision envelope and allowed enums.
- Implement leader logic for: For each changed clause, do validators agree it is COHERENT_NEW, COHERENT_SUPERSESSION, DUPLICATE_RULE, SEMANTIC_CONFLICT or INSUFFICIENT_CONTEXT relative to the current canonical standard? The release is ACCEPTABLE only if every changed clause is coherent and all supersessions are explicit and bounded.
- Implement independent validator reasoning rather than format-only validation.
- Treat fetched evidence as hostile/untrusted data.
- Add deterministic post-consensus validation.
- Add explicit abstain/failure path.
- Forge incorrect leader outputs in tests and prove rejection.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 4 — Off-chain work plane

- Git-first frontend with no application database in MVP. Next.js server routes can fetch/cache commit-pinned raw GitHub manifests and clause files but never mutate Git or sign chain transactions. A small CLI script can generate the bounded release manifest.
- Implement wallet challenge/verify if off-chain roles require identity.
- Implement immutable/public artifact bundle generation and digesting.
- Never add a server signer.
- Add upload/data bounds and content-type validation.
- Document retention/publicity policy.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 5 — GenLayer web client

- Implement config/client/read-client modules.
- Implement injected-wallet provider and network gate.
- Implement typed contract reads and schema verification.
- Implement write helper and FINALIZED + GenVM execution check.
- Implement one live/fixtures boundary; production live mode never silently falls back.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 6 — Distinct frontend

- Implement the visual archetype: standards document + redline editor + engineering drafting table.
- Build routes around domain records, not generic cards.
- Build the semantic-memory context view.
- Build the transaction rail and authoritative receipt.
- Implement responsive/mobile behavior.
- Implement all empty/error/abstain states from `ui/ux.md`.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 7 — Integration and adversarial testing

- Wire backend artifact bundle to contract submission.
- Verify every frontend-required contract method against schema.
- Run deterministic/direct suites.
- Run wallet-session regressions.
- Test malformed RPC/contract data.
- Test missing evidence, stale version and forged consensus output.
- Run production build/typecheck/lint.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 8 — StudioNet proof

- Deploy a frozen source commit to StudioNet.
- Record address and deployment tx.
- Verify deployed source/schema.
- Execute the reference demo with real transactions.
- Capture at least one live consensus success.
- Capture at least one fail-closed/abstain path where feasible.
- Re-read all final state from chain.
- Update handoff/memory with exact facts only.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.
## Phase 9 — Release hardening

- Deploy hosted frontend in live mode.
- Exercise one write from hosted UI.
- Audit all copy for fabricated/unproven claims.
- Confirm no generated/local private-key path exists.
- Confirm backend has no signer secret.
- Run accessibility/responsive pass.
- Freeze release tag/commit and create reviewer-oriented deployment evidence.

**Exit gate:** All work is logged in `handoff.md`; relevant tests for this phase pass or the blocker is explicitly recorded.


## Workstreams and ownership

| Workstream | Primary outputs | Release blocker? |
|---|---|---|
| Intelligent Contract | State machine, VecDB, consensus, views | Yes |
| Direct/testing | Invariants, forged leader rejection, ABI/schema | Yes |
| Off-chain plane | High-volume workflow + immutable bundles | Yes where architecture uses service |
| Web3 client | Injected wallet, reads/writes/finality | Yes |
| UI/UX | Domain-specific routes and states | Yes |
| StudioNet proof | Deployment + live transaction evidence | Yes |
| Documentation | Handoff, memory, deployment truth | Yes |

## Contract milestone checklist

- Implement and test `create_standard(name, charter_url, charter_digest, initial_manifest_url, initial_manifest_digest) -> standard_id`.
- Implement and test `set_editor(standard_id, editor_address, enabled)`.
- Implement and test `register_initial_clause(standard_id, clause_id, section_path, normative_level, text, source_url, source_digest) -> clause_record_id`.
- Implement and test `propose_release(standard_id, base_version, commit_sha, manifest_url, manifest_digest, changed_clause_count) -> proposal_id`.
- Implement and test `review_release(proposal_id) -> clause decisions`.
- Implement and test `finalize_release(proposal_id) -> canonical version`.
- Implement and test `cancel_release(proposal_id)`.
- Implement and test `get_standard(standard_id)`.
- Implement and test `get_clause(clause_record_id)`.
- Implement and test `get_release(proposal_id)`.
- Implement and test `preview_overlaps(proposal_id, changed_clause_index, k)`.

## Invariant checklist

- Test: Release base_version must equal current canonical version at review/finalization.
- Test: All GitHub source URLs must be commit-pinned when used as immutable evidence.
- Test: Active clause IDs are unique within a standard.
- Test: COHERENT_SUPERSESSION must name active clause IDs and deterministically deactivate them only on finalization.
- Test: No clause update occurs if any changed clause is conflict/revision-required.
- Test: Similarity cannot create an implicit supersession.

## UX milestone checklist

- Build and verify: Standard reader.
- Build and verify: Clause index.
- Build and verify: Release desk.
- Build and verify: Semantic diff view.
- Build and verify: Conflict matrix.
- Build and verify: Supersession graph.
- Build and verify: Version ledger.
- Build and verify: Implementation-facing canonical receipt.

## Risk register

| Risk | Early signal | Mitigation |
|---|---|---|
| Consensus prompts too large | timeouts/rotation spikes | lower KNN/evidence bounds; split cases |
| VecDB namespace contamination | irrelevant candidates | deterministic namespace/version filters |
| Backend becomes de facto authority | UI trusts DB status | chain re-read is authoritative after every final action |
| Wrong-chain wallet writes | user wallet not 61999 | write gate in UI and client helper |
| Finalized rollback shown as success | receipt-only logic | inspect GenVM execution |
| UI drifts generic | component-kit/default template | enforce `ui/ux.md` screenshot review |
| Public evidence disappears | validator fetch failures | immutable/content-addressed refs + abstain |
| Runtime API differs from plan | compile/lint/integration failure | verify current SDK, log exact change, do not invent API |
| Overclaim in README | branch only unit-tested | proof table distinguishes direct vs live |

## Project-specific edge-case backlog

- Two clauses in distant sections become contradictory after a wording change; vector overlap should surface them.
- Release built on stale base version: reject deterministically before consensus.
- Manifest claims a changed clause whose raw source digest does not match; fail closed.
- Normative word changes SHOULD to MUST with similar semantics; validators must treat normative level as decision-critical.
- Large release exceeds changed-clause bound; split into staged proposals rather than increasing prompt size blindly.

## Definition of complete

The project is complete only when:

- the MVP flow works end to end;
- the contract is deployed on StudioNet;
- at least one real consensus path is proven;
- the frontend is wired to that contract;
- injected wallet is the only write mechanism;
- contract reads are authoritative;
- direct and frontend checks pass;
- UI is recognizably distinct;
- evidence and VecDB behavior are bounded;
- `memory.md` and `handoff.md` contain the exact final state.
