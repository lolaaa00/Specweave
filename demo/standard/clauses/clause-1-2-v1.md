## §1-2 — Semantic Coherence Gate

A release proposal MUST NOT be finalized unless every candidate clause change
receives a COHERENT_NEW or COHERENT_SUPERSESSION decision from the
GenLayer validator consensus. Proposals containing DUPLICATE_RULE,
SEMANTIC_CONFLICT, or INSUFFICIENT_CONTEXT decisions MUST be returned with
REVISION_REQUIRED status. The proposer MUST then submit a corrected proposal;
an existing proposal with REVISION_REQUIRED status is terminal and cannot be
resubmitted for review.

Normative level: MUST
Section: 1.2 Semantic Gate
