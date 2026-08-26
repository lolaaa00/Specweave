# SpecWeave — Project Memory

> This is a **repository-local project memory file**, not model/session memory. Agents should read it from disk. Keep it concise enough to scan, but update it whenever a durable decision changes.

## Project identity

**Name:** SpecWeave  
**Tagline:** Semantic merge control for open standards and RFC-style specifications.  
**Core thesis:** SpecWeave is a release gate for standards that are drafted off-chain in Git or documents. A version candidate submits a commit-pinned manifest of changed clauses. VecDB retrieves semantically overlapping accepted clauses from anywhere in the standard, catching conflicts that a line diff misses. GenLayer validators decide whether the candidate is coherent with the existing standard, intentionally supersedes named clauses, duplicates an existing rule or requires revision. The accepted canonical version hash is then advanced on-chain.

### What the system ultimately settles

which commit-pinned specification release becomes the canonical version and which earlier clauses it supersedes

### Core actors

- standards editor
- working-group contributor
- implementer
- reviewer
- GenLayer validator
- downstream protocol/tool

## Current status

**Phase:** Documentation / pre-implementation blueprint  
**Code status:** Not started in this pack  
**StudioNet contract:** Not deployed yet  
**Live frontend:** Not deployed yet  
**Last durable update:** 2026-08-23

The first implementing agent must not invent fake deployment addresses, transaction hashes, test counts or live URLs. Add them here only after they exist and have been verified.

## Non-negotiable product boundary

### Off-chain

Drafting, Git commits, issues, discussion and full specification documents. The submission manifest extracts only bounded changed clauses and immutable raw URLs.

### On-chain

Standard charter; canonical version digest; clause registry; semantic clause vectors; release proposals; supersession graph; consensus coherence result; version receipts.

### Semantic memory

Every accepted clause gets an embedding of clause ID, section path, normative strength (MUST/SHOULD/MAY), defined terms and bounded text. A release candidate embeds each changed clause and retrieves up to 5 semantically overlapping accepted clauses across the entire standard. Exact referenced clause IDs are always included regardless of distance.

### Consensus question

For each changed clause, do validators agree it is COHERENT_NEW, COHERENT_SUPERSESSION, DUPLICATE_RULE, SEMANTIC_CONFLICT or INSUFFICIENT_CONTEXT relative to the current canonical standard? The release is ACCEPTABLE only if every changed clause is coherent and all supersessions are explicit and bounded.

## Frozen engineering defaults

- StudioNet chain ID: `61999`
- RPC: `https://studio.genlayer.com/api`
- Explorer: `https://explorer-studio.genlayer.com`
- `genlayer-js`: `1.1.8`
- Next.js: `16.3.2`
- React: `19.2.4`
- React DOM: `19.2.4`
- TypeScript: `^5`
- Tailwind: `^4`
- Writes: injected EIP-1193 wallet only
- Backend signer: forbidden
- Vector model baseline: `all-MiniLM-L6-v2` / 384 dimensions
- Similarity semantics: retrieval only
- Live data: no silent fixture fallback
- Finality: wait for FINALIZED, then inspect GenVM execution before success

## Contract invariants

- Release base_version must equal current canonical version at review/finalization.
- All GitHub source URLs must be commit-pinned when used as immutable evidence.
- Active clause IDs are unique within a standard.
- COHERENT_SUPERSESSION must name active clause IDs and deterministically deactivate them only on finalization.
- No clause update occurs if any changed clause is conflict/revision-required.
- Similarity cannot create an implicit supersession.

## Scope lock

### MVP

One GitHub-hosted specification, commit-pinned manifest generator, bounded changed clauses, semantic overlap retrieval, release review, explicit supersession and canonical version advancement on StudioNet.

### Explicit non-goals

- replacing GitHub/Git drafting
- voting on whether a standard is politically desirable
- parsing unlimited-size documents inside one transaction
- formal verification
- silent auto-merge

## Known edge cases to preserve during implementation

- Two clauses in distant sections become contradictory after a wording change; vector overlap should surface them.
- Release built on stale base version: reject deterministically before consensus.
- Manifest claims a changed clause whose raw source digest does not match; fail closed.
- Normative word changes SHOULD to MUST with similar semantics; validators must treat normative level as decision-critical.
- Large release exceeds changed-clause bound; split into staged proposals rather than increasing prompt size blindly.

## UI identity

- Archetype: **standards document + redline editor + engineering drafting table**
- Signature: The canonical spec is a continuous document. Release review overlays semantic conflicts as margin redlines and cross-links to distant clauses with ruled connector lines.
- Fonts: Inter Tight for UI/headings; JetBrains Mono for clause IDs and diffs; Source Serif 4 for normative prose
- Geometry: full-bleed document columns, margin clause numbers, redline gutters, 2px radius, no floating feature cards
- Motion: diff reveal and connector tracing only; no dashboard animation

Do not let implementation drift into a generic centered hero + three cards + gradient dashboard. `ui/ux.md` is authoritative.

## Decision log

| Date | Decision | Reason | Supersedes |
|---|---|---|---|
| 2026-08-23 | Keep high-volume activity off-chain and settle bounded authoritative state on GenLayer. | Mirrors the project's central off-chain-work/on-chain-settlement thesis and keeps consensus purposeful. | — |
| 2026-08-23 | Use contract-owned VecDB as semantic recall, never as an automatic verdict. | Similarity is relatedness, not truth. | — |
| 2026-08-23 | Injected wallet is the only write identity. | Matches existing hardened repository behavior and avoids hidden custody. | — |
| 2026-08-23 | Fail closed on missing public evidence or malformed consensus output. | A weak answer must not silently become authoritative state. | — |
| 2026-08-23 | UI follows the project-specific design language in `ui/ux.md`. | The ten projects must be visually and structurally distinct. | — |

## Source conventions inherited from existing repositories

The implementation plan intentionally follows proven patterns from these owner repositories:

- `ometere123/intent-guard/package.json` — `genlayer-js` 1.1.8, Next.js 16.3.2, React 19.2.4.
- `ometere123/intent-guard/src/components/wallet-provider.tsx` — explicit injected wallet flow, network gating and wallet event handling.
- `ometere123/intent-guard/src/lib/genlayer/contract.ts` — wait for FINALIZED, re-read transaction and inspect GenVM execution.
- `ometere123/scopelock/contracts/scopelock.py` — native `genlayer_embeddings.VecDB`, 384-dimensional `all-MiniLM-L6-v2`, bounded KNN precedent retrieval.
- Owner research, *GenLayer VectorDB + Vector Embeddings* (Aug 2026) — embeddings provide semantic representation, VecDB persistent semantic memory/search, consensus judges meaning; embeddings are not truth or encryption.

## Open decisions

These are allowed to be decided during implementation, but must be recorded here when settled:

- Exact deployed contract address and deployment source commit.
- Exact public hosting URL.
- Final object-store/database provider if the selected default in `architecture.md` proves unsuitable.
- Whether a second network besides StudioNet is supported after the StudioNet proof is complete.
- Performance limits discovered for the project's actual VecDB population and KNN size.

## Agent continuity rule

At the end of every work session:

1. Ensure `handoff.md` has the most recent factual state.
2. Update this file only for durable decisions/status changes.
3. Do not paste long implementation logs here; keep those in `handoff.md`.
4. Never record secrets, private keys, seed phrases or private source material.
