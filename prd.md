# SpecWeave — Product Requirements Document (PRD)

## 1. Product summary

**Semantic merge control for open standards and RFC-style specifications.**

SpecWeave is a release gate for standards that are drafted off-chain in Git or documents. A version candidate submits a commit-pinned manifest of changed clauses. VecDB retrieves semantically overlapping accepted clauses from anywhere in the standard, catching conflicts that a line diff misses. GenLayer validators decide whether the candidate is coherent with the existing standard, intentionally supersedes named clauses, duplicates an existing rule or requires revision. The accepted canonical version hash is then advanced on-chain.

The product uses a deliberate operating model:

1. high-frequency domain work happens off-chain;
2. a bounded, immutable/public artifact or case is frozen;
3. the Intelligent Contract retrieves only relevant semantic memory;
4. validators judge the semantic question independently;
5. deterministic contract code decides whether/how authoritative state changes.

## 2. Problem

The product must settle:

> **which commit-pinned specification release becomes the canonical version and which earlier clauses it supersedes**

The problem is not that a backend cannot produce an answer. A backend can. The problem is that when multiple parties care about the final result, letting one operator/model author the authoritative state reintroduces the trust assumption GenLayer is meant to remove.

## 3. Why GenLayer is load-bearing

Delete GenLayer and the system loses at least one of:

- independent access to public evidence;
- independent semantic judgment;
- agreement on decision-critical meaning;
- a shared immutable result other contracts can consume.

VecDB alone does not fix this. Similarity only identifies relevant history.

## 4. Goals

- Fast normal workflow off-chain.
- Explicit escalation to shared judgment.
- Project-owned semantic institutional memory.
- Version-bound rules/evidence.
- Deterministic, inspectable state changes.
- Composable final receipts.
- Distinct domain-specific user experience.
- Honest failure/abstain states.
- Real StudioNet deployment proof before release claims.

## 5. Non-goals

- replacing GitHub/Git drafting
- voting on whether a standard is politically desirable
- parsing unlimited-size documents inside one transaction
- formal verification
- silent auto-merge

## 6. Actors

| Actor | Role |
| --- | --- |
| standards editor | Participates in the domain workflow; exact authorization is defined in TRD/contract state. |
| working-group contributor | Participates in the domain workflow; exact authorization is defined in TRD/contract state. |
| implementer | Participates in the domain workflow; exact authorization is defined in TRD/contract state. |
| reviewer | Participates in the domain workflow; exact authorization is defined in TRD/contract state. |
| GenLayer validator | Participates in the domain workflow; exact authorization is defined in TRD/contract state. |
| downstream protocol/tool | Participates in the domain workflow; exact authorization is defined in TRD/contract state. |

## 7. Scope split

### Off-chain

Drafting, Git commits, issues, discussion and full specification documents. The submission manifest extracts only bounded changed clauses and immutable raw URLs.

### On-chain

Standard charter; canonical version digest; clause registry; semantic clause vectors; release proposals; supersession graph; consensus coherence result; version receipts.

### Semantic memory

Every accepted clause gets an embedding of clause ID, section path, normative strength (MUST/SHOULD/MAY), defined terms and bounded text. A release candidate embeds each changed clause and retrieves up to 5 semantically overlapping accepted clauses across the entire standard. Exact referenced clause IDs are always included regardless of distance.

### Consensus question

For each changed clause, do validators agree it is COHERENT_NEW, COHERENT_SUPERSESSION, DUPLICATE_RULE, SEMANTIC_CONFLICT or INSUFFICIENT_CONTEXT relative to the current canonical standard? The release is ACCEPTABLE only if every changed clause is coherent and all supersessions are explicit and bounded.

## 8. MVP

One GitHub-hosted specification, commit-pinned manifest generator, bounded changed clauses, semantic overlap retrieval, release review, explicit supersession and canonical version advancement on StudioNet.

The MVP is not considered complete until a hosted frontend performs the critical path against a real StudioNet deployment.

## 9. User stories

- As a **standards editor**, I can configure the authoritative rules/charter and see exactly which version every case uses.
- As a **working-group contributor**, I can perform normal work off-chain and escalate only the bounded cases that need shared judgment.
- As a **implementer**, I can inspect the public evidence and related semantic history without treating similarity as truth.
- As a **reviewer**, I receive bounded, versioned inputs and can reject a semantically wrong leader decision.
- As an external integrator, I can read a typed final receipt without trusting the backend or scraping rationale prose.

## 10. Lifecycle

Product statuses:

- DRAFT_OFFCHAIN
- PROPOSED
- UNDER_REVIEW
- ACCEPTABLE
- REVISION_REQUIRED
- REJECTED
- CANONICAL
- SUPERSEDED

Generic lifecycle:

```text
normal off-chain work
 -> freeze bounded public artifact/case
 -> on-chain submit
 -> deterministic preflight
 -> bounded semantic retrieval
 -> consensus
 -> deterministic validation/state transition
 -> finalized receipt
 -> frontend authoritative re-read
```

## 11. Product surfaces

| Route | Product surface | Primary action |
| --- | --- | --- |
| / | Standard reader | Open clause/release |
| /clauses | Clause index | Open clause |
| /releases/new | Release desk | Propose release |
| /releases/[id]/diff | Semantic diff view | Run review |
| /releases/[id]/conflicts | Conflict matrix | Inspect conflict |
| /graph | Supersession graph | Inspect lineage |
| /versions | Version ledger | Open canonical receipt |
| /canonical | Implementation-facing receipt | Copy |

The visual composition for each route is specified in `ui/ux.md`.

## 12. Functional requirements

### FR-1 — Public browsing

Where a record is public, the user can inspect it without connecting a wallet.

### FR-2 — Explicit wallet identity

Wallet connection occurs only after user action. Production writes are injected-wallet only and network-gated.

### FR-3 — Versioned top-level configuration

Rules/charter/rubric/manifests that affect a decision are versioned and visible in the resulting receipt.

### FR-4 — Off-chain work plane

Routine/high-volume work does not require one transaction per action.

### FR-5 — Immutable escalation

Before chain submission, the user can inspect the exact bounded artifact/reference/digest being committed. Editing afterward produces a new digest/version.

### FR-6 — Related-memory preview

The product can show relevant semantic memories, clearly labeled as related context.

### FR-7 — Consensus trigger

The eligible actor can trigger the project-specific review. Long-running consensus is represented as stages, not fake percentage progress.

### FR-8 — Fail closed

Unavailable evidence, malformed outputs, stale state or validator disagreement cannot silently become a positive decision.

### FR-9 — Authoritative receipt

A final receipt includes record ID, contract/network, input version/digests, memory IDs, decision-critical output, tx/finality and resulting state.

### FR-10 — Append-only history

Historical decisions remain inspectable after later versions/corrections.

### FR-11 — Integrator surface

Stable view methods expose machine-readable final status.

## 13. Product-specific contract capabilities

- create_standard(name, charter_url, charter_digest, initial_manifest_url, initial_manifest_digest) -> standard_id
- set_editor(standard_id, editor_address, enabled)
- register_initial_clause(standard_id, clause_id, section_path, normative_level, text, source_url, source_digest) -> clause_record_id
- propose_release(standard_id, base_version, commit_sha, manifest_url, manifest_digest, changed_clause_count) -> proposal_id
- review_release(proposal_id) -> clause decisions
- finalize_release(proposal_id) -> canonical version
- cancel_release(proposal_id)
- get_standard(standard_id)
- get_clause(clause_record_id)
- get_release(proposal_id)
- preview_overlaps(proposal_id, changed_clause_index, k)

## 14. Product-specific rules

- Release base_version must equal current canonical version at review/finalization.
- All GitHub source URLs must be commit-pinned when used as immutable evidence.
- Active clause IDs are unique within a standard.
- COHERENT_SUPERSESSION must name active clause IDs and deterministically deactivate them only on finalization.
- No clause update occurs if any changed clause is conflict/revision-required.
- Similarity cannot create an implicit supersession.

## 15. Public evidence requirements

- HTTPS/content-addressed and validator-accessible.
- Digest/version bound.
- Bounded before prompt construction.
- Treated as untrusted data.
- No private secrets in chain/VecDB.
- Unavailable source produces no invented positive result.

## 16. Primary demo fixture

Mini protocol spec has clause 4.2 `Clients SHOULD retry after 30s` and clause 9.1 `Clients MUST NOT retry authentication failures`. New clause changes retry behavior to `MUST retry all failures after 10s`, creating distant semantic conflict.

The fixture should seed local UI/direct tests. It is not proof until a corresponding live StudioNet path is executed.

## 17. Required edge behavior

- Two clauses in distant sections become contradictory after a wording change; vector overlap should surface them.
- Release built on stale base version: reject deterministically before consensus.
- Manifest claims a changed clause whose raw source digest does not match; fail closed.
- Normative word changes SHOULD to MUST with similar semantics; validators must treat normative level as decision-critical.
- Large release exceeds changed-clause bound; split into staged proposals rather than increasing prompt size blindly.

## 18. UX requirements

UI identity:

- **Archetype:** standards document + redline editor + engineering drafting table
- **Signature:** The canonical spec is a continuous document. Release review overlays semantic conflicts as margin redlines and cross-links to distant clauses with ruled connector lines.
- **Fonts:** Inter Tight for UI/headings; JetBrains Mono for clause IDs and diffs; Source Serif 4 for normative prose
- **Geometry:** full-bleed document columns, margin clause numbers, redline gutters, 2px radius, no floating feature cards
- **Motion:** diff reveal and connector tracing only; no dashboard animation

The wallet must remain utility chrome. The main artifact/work object dominates.

## 19. Security requirements

1. Backend never signs GenLayer writes.
2. Wrong-chain writes are blocked both in UI and client helper.
3. Finalized rollback/error is not success.
4. Unknown RPC/contract shape fails closed.
5. Prompt-injection-like fetched content cannot alter governing rules.
6. Similarity cannot directly authorize state.
7. Stale versions cannot mutate newer state.
8. Decision enums/IDs are deterministically bounded.
9. Public storage contains no secrets/private source material.
10. No live-mode fabricated fallback.

## 20. Success metrics

- 100% of writes injected-wallet signed.
- 100% final successes verified through GenVM execution + authoritative re-read.
- 0 silent fixture fallback in live mode.
- 0 VecDB distance displayed as truth/confidence.
- 100% final decisions expose input versions/digests.
- One happy-path and one fail-closed/abstain path demonstrated before release.
- Fresh agent can implement from this pack + repository files without prior chat context.

## 21. Acceptance criteria

- [ ] Contract state/API implements the intended domain lifecycle.
- [ ] Direct tests cover every invariant.
- [ ] VecDB insert/retrieval rules are tested.
- [ ] Validator rejects a well-formed wrong leader payload in direct mode where tooling permits.
- [ ] Off-chain service cannot author chain truth.
- [ ] Hosted UI follows `ui/ux.md`.
- [ ] Hosted UI reads deployed StudioNet state.
- [ ] Contract schema verified.
- [ ] StudioNet consensus path proven.
- [ ] Wallet/network regressions tested.
- [ ] Deployment facts recorded in `handoff.md`/`memory.md`.
- [ ] README/submission copy distinguishes live proof from direct-test coverage.

## 22. Reference end-to-end demo

Seed an initial mini-standard with 12 clauses, propose a commit-pinned release changing three clauses, surface one distant semantic conflict, revise the manifest to make supersession explicit, then finalize the coherent release and show canonical version advancement.
