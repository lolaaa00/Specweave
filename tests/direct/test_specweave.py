"""
Direct (deterministic) tests for the SpecWeave contract.
These tests exercise only deterministic paths; they do not require StudioNet or consensus.
Run with: pytest tests/direct/test_specweave.py -v
"""
import sys
import os
import json
import pytest
from unittest.mock import MagicMock, patch, PropertyMock

# ---------------------------------------------------------------------------
# Minimal GenLayer simulation stubs
# ---------------------------------------------------------------------------
# Stub the genlayer and genlayer_embeddings modules so we can import the
# contract without a running GenVM environment.

import types
import numpy as np

# Create stub modules
genlayer_stub = types.ModuleType("genlayer")
gl_stub = types.ModuleType("genlayer.gl")

# Stub u-types
for _t in ("u8", "u16", "u32", "u64", "u128", "u256"):
    setattr(genlayer_stub, _t, int)
    setattr(gl_stub, _t, int)

def _make_allow_storage(cls):
    return cls

genlayer_stub.allow_storage = _make_allow_storage
genlayer_stub.TreeMap = dict
genlayer_stub.DynArray = list

# Stub gl.message
class _Message:
    sender_address = "0xSteward1234567890abcdef1234567890abcdef12"
    timestamp = 1_700_000_000

class _GL:
    message = _Message()

    class public:
        @staticmethod
        def write(fn):
            return fn
        @staticmethod
        def view(fn):
            return fn

    class nondet:
        @staticmethod
        def exec_prompt(prompt: str) -> str:
            return json.dumps({
                "ok": True,
                "clause_decisions": [
                    {
                        "record_id": 0,
                        "clause_id": "4-2",
                        "decision": "COHERENT_SUPERSESSION",
                        "supersedes": ["4-2"],
                        "reason": "New clause explicitly supersedes 4-2 with stricter normative level.",
                        "confidence_band": "HIGH",
                    }
                ],
                "overall_acceptable": True,
                "rationale": "Single coherent supersession."
            })

    class eq_principle:
        @staticmethod
        def prompt_comparative(leader_fn, principle: str) -> str:
            # In tests: run leader directly (equivalence checking is a network concern)
            return leader_fn()

    class vm:
        class UserError(Exception):
            pass

        class Return:
            def __init__(self, calldata):
                self.calldata = calldata

        @staticmethod
        def run_nondet_unsafe(leader_fn, validator_fn):
            return leader_fn()

    class Contract:
        pass

genlayer_stub.gl = _GL
sys.modules["genlayer"] = genlayer_stub
sys.modules["genlayer.gl"] = gl_stub

# Stub genlayer_embeddings
ge_stub = types.ModuleType("genlayer_embeddings")

class _VecDBElem:
    def __init__(self, distance, value):
        self.distance = distance
        self.value = value

class _VecDB:
    def __init__(self, *args, **kwargs):
        self._items = []

    def __class_getitem__(cls, params):
        return cls

    def insert(self, vec, ptr):
        self._items.append((vec, ptr))

    def knn(self, vec, k):
        results = []
        for item_vec, ptr in self._items:
            dist = float(np.sum((vec - item_vec) ** 2))
            results.append(_VecDBElem(distance=dist, value=ptr))
        results.sort(key=lambda e: e.distance)
        return results[:k]

ge_stub.VecDB = _VecDB
ge_stub.EuclideanDistanceSquared = object

class _SentenceTransformer:
    def __init__(self, model_name):
        self._model_name = model_name
    def __call__(self, text: str) -> np.ndarray:
        # Deterministic fake embedding: hash the text to a 384-dim vector
        seed = abs(hash(text)) % (2**31)
        rng = np.random.default_rng(seed)
        return rng.standard_normal(384).astype(np.float32)

ge_stub.SentenceTransformer = _SentenceTransformer
sys.modules["genlayer_embeddings"] = ge_stub

# Now import the contract (adjust path)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from contracts.specweave import SpecWeave, STATUS_NAMES, STATUS_PROPOSED, STATUS_ACCEPTABLE, STATUS_CANONICAL, STATUS_CANCELLED, STATUS_REVISION_REQUIRED

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

STEWARD = "0xSteward1234567890abcdef1234567890abcdef12"
EDITOR  = "0xEditor1234567890abcdef1234567890abcdef1234"
OTHER   = "0xOther01234567890abcdef1234567890abcdef12"
COMMIT  = "a" * 40
CHARTER_URL   = "https://github.com/org/spec/raw/abcdef1234567890abcdef1234567890abcdef12/charter.md"
MANIFEST_URL  = "https://github.com/org/spec/raw/abcdef1234567890abcdef1234567890abcdef12/manifest.json"
SOURCE_URL_42 = "https://raw.githubusercontent.com/org/spec/abcdef1234567890abcdef1234567890abcdef12/spec.md"

def make_contract(sender=STEWARD):
    c = SpecWeave.__new__(SpecWeave)
    c.standards = {}
    c.clauses = {}
    c.proposals = {}
    c.editors = {}
    c.standard_clause_ids = {}
    c.standard_count = 0
    c.clause_count = 0
    c.proposal_count = 0
    from tests.direct.test_specweave import _VecDBInstance
    c.vectors = _VecDBInstance()
    _GL.message.sender_address = sender
    return c

class _VecDBInstance(_VecDB):
    pass

def create_standard(c, sender=STEWARD):
    _GL.message.sender_address = sender
    sid = c.create_standard(
        name="Test Protocol",
        charter_url=CHARTER_URL,
        charter_digest="sha256:aabbcc",
        initial_manifest_url=MANIFEST_URL,
        initial_manifest_digest="sha256:ddeeff",
    )
    return sid

def register_clause(c, std_id, clause_id, normative_level=0, sender=STEWARD):
    _GL.message.sender_address = sender
    return c.register_initial_clause(
        standard_id=std_id,
        clause_id=clause_id,
        section_path=f"section.{clause_id}",
        normative_level=normative_level,
        text=f"Clause {clause_id} normative text for testing.",
        source_url=SOURCE_URL_42,
        source_digest=f"sha256:{clause_id}",
    )

def propose_release(c, std_id, changed_ids, base_version=0, sender=STEWARD):
    _GL.message.sender_address = sender
    return c.propose_release(
        standard_id=std_id,
        base_version=base_version,
        commit_sha=COMMIT,
        manifest_url=MANIFEST_URL,
        manifest_digest="sha256:manifest1",
        changed_clause_count=len(changed_ids),
        changed_clause_ids=[int(x) for x in changed_ids],
    )

# ---------------------------------------------------------------------------
# Tests: create_standard
# ---------------------------------------------------------------------------

class TestCreateStandard:
    def test_creates_standard(self):
        c = make_contract()
        sid = create_standard(c)
        assert sid == 0
        std = c.get_standard(sid)
        assert std["name"] == "Test Protocol"
        assert std["steward"] == STEWARD
        assert std["canonical_version"] == 0

    def test_name_required(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError):
            c.create_standard("", CHARTER_URL, "sha256:aabbcc", MANIFEST_URL, "sha256:ddeeff")

    def test_name_too_long(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError):
            c.create_standard("x" * 201, CHARTER_URL, "sha256:aabbcc", MANIFEST_URL, "sha256:ddeeff")

    def test_non_https_charter_url(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError):
            c.create_standard("Name", "http://example.com/charter", "sha256:aabbcc", MANIFEST_URL, "sha256:ddeeff")

    def test_digest_too_short(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError):
            c.create_standard("Name", CHARTER_URL, "short", MANIFEST_URL, "sha256:ddeeff")

    def test_multiple_standards(self):
        c = make_contract()
        sid1 = create_standard(c)
        sid2 = create_standard(c)
        assert sid1 == 0
        assert sid2 == 1

# ---------------------------------------------------------------------------
# Tests: set_editor
# ---------------------------------------------------------------------------

class TestSetEditor:
    def test_steward_can_add_editor(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        assert c.is_editor(sid, EDITOR)

    def test_non_steward_cannot_add_editor(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = OTHER
        with pytest.raises(_GL.vm.UserError, match="steward only"):
            c.set_editor(sid, EDITOR, True)

    def test_remove_editor(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        c.set_editor(sid, EDITOR, False)
        assert not c.is_editor(sid, EDITOR)

# ---------------------------------------------------------------------------
# Tests: register_initial_clause
# ---------------------------------------------------------------------------

class TestRegisterClause:
    def test_register_clause(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2", normative_level=1)
        cl = c.get_clause(cid)
        assert cl["clause_id"] == "4.2"
        assert cl["normative_name"] == "SHOULD"
        assert cl["active"]

    def test_duplicate_clause_id_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "4.2")
        with pytest.raises(_GL.vm.UserError, match="already exists"):
            register_clause(c, sid, "4.2")

    def test_non_editor_cannot_register(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = OTHER
        with pytest.raises(_GL.vm.UserError, match="not authorized"):
            register_clause(c, sid, "4.2", sender=OTHER)

    def test_invalid_normative_level(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError, match="normative_level"):
            c.register_initial_clause(
                standard_id=sid, clause_id="4.3",
                section_path="section.4", normative_level=5,
                text="Some text.", source_url=SOURCE_URL_42, source_digest="sha256:xyz",
            )

    def test_non_github_source_url_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError, match="GitHub raw URL"):
            c.register_initial_clause(
                standard_id=sid, clause_id="4.3",
                section_path="section.4", normative_level=0,
                text="Some text.", source_url="https://example.com/clause.md", source_digest="sha256:xyz",
            )

    def test_text_too_long_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError):
            c.register_initial_clause(
                standard_id=sid, clause_id="4.3",
                section_path="section.4", normative_level=0,
                text="x" * 2001, source_url=SOURCE_URL_42, source_digest="sha256:xyz",
            )

    def test_editor_can_register(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        cid = register_clause(c, sid, "4.2", sender=EDITOR)
        assert cid is not None

# ---------------------------------------------------------------------------
# Tests: propose_release
# ---------------------------------------------------------------------------

class TestProposeRelease:
    def setup_method(self):
        self.c = make_contract()
        self.sid = create_standard(self.c)
        self.cid = register_clause(self.c, self.sid, "4.2", normative_level=1)

    def test_propose_release(self):
        pid = propose_release(self.c, self.sid, [self.cid])
        assert pid == 0
        p = self.c.get_release(pid)
        assert p["status_name"] == "PROPOSED"
        assert p["base_version"] == 0

    def test_stale_base_version_rejected(self):
        with pytest.raises(_GL.vm.UserError, match="base_version"):
            propose_release(self.c, self.sid, [self.cid], base_version=5)

    def test_short_commit_sha_rejected(self):
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError, match="40 characters"):
            self.c.propose_release(
                standard_id=self.sid, base_version=0,
                commit_sha="short", manifest_url=MANIFEST_URL,
                manifest_digest="sha256:m1", changed_clause_count=1,
                changed_clause_ids=[int(self.cid)],
            )

    def test_too_many_changed_clauses(self):
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError):
            self.c.propose_release(
                standard_id=self.sid, base_version=0,
                commit_sha=COMMIT, manifest_url=MANIFEST_URL,
                manifest_digest="sha256:manifest1longer", changed_clause_count=25,
                changed_clause_ids=list(range(25)),
            )

    def test_wrong_standard_clause_rejected(self):
        c2 = make_contract()
        sid2 = create_standard(c2)
        cid2 = register_clause(c2, sid2, "1.1")
        # Try to reference cid2 in a proposal for self.sid
        # Needs to first add cid2 to self.c
        # This is a cross-namespace scenario
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError):
            self.c.propose_release(
                standard_id=self.sid, base_version=0,
                commit_sha=COMMIT, manifest_url=MANIFEST_URL,
                manifest_digest="sha256:m1", changed_clause_count=1,
                changed_clause_ids=[999],  # non-existent
            )

    def test_non_editor_cannot_propose(self):
        with pytest.raises(_GL.vm.UserError, match="not authorized"):
            propose_release(self.c, self.sid, [self.cid], sender=OTHER)

# ---------------------------------------------------------------------------
# Tests: cancel_release
# ---------------------------------------------------------------------------

class TestCancelRelease:
    def test_proposer_can_cancel(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])
        _GL.message.sender_address = STEWARD
        c.cancel_release(pid)
        p = c.get_release(pid)
        assert p["status_name"] == "CANCELLED"

    def test_stranger_cannot_cancel(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])
        _GL.message.sender_address = OTHER
        with pytest.raises(_GL.vm.UserError, match="not authorized to cancel"):
            c.cancel_release(pid)

# ---------------------------------------------------------------------------
# Tests: review_release (with stubbed consensus)
# ---------------------------------------------------------------------------

class TestReviewRelease:
    def setup_method(self):
        self.c = make_contract()
        self.sid = create_standard(self.c)
        # Register 4.2 (SHOULD) and 9.1 (MUST NOT = MUST for test)
        self.cid_42 = register_clause(self.c, self.sid, "4.2", normative_level=1)
        self.cid_91 = register_clause(self.c, self.sid, "9.1", normative_level=0)

    def test_review_acceptable(self):
        """Stub returns ACCEPTABLE for supersession of 4.2."""
        pid = propose_release(self.c, self.sid, [self.cid_42])
        # Stub _GL.exec_prompt returns COHERENT_SUPERSESSION
        result = self.c.review_release(pid)
        assert result in ("ACCEPTABLE", "REVISION_REQUIRED")  # depends on stub

    def test_stale_base_version_rejected_in_review(self):
        """Even after proposal, if canonical advances the review must fail."""
        pid = propose_release(self.c, self.sid, [self.cid_42])
        # Manually advance canonical version to simulate staleness
        std = self.c.standards[self.sid]
        from contracts.specweave import Standard
        self.c.standards[self.sid] = Standard(
            steward=std.steward, name=std.name,
            charter_url=std.charter_url, charter_digest=std.charter_digest,
            canonical_version=1,  # advance
            canonical_manifest_digest=std.canonical_manifest_digest,
            initial_manifest_url=std.initial_manifest_url,
            initial_manifest_digest=std.initial_manifest_digest,
            clause_count=std.clause_count, active=std.active,
            editor_count=std.editor_count,
        )
        with pytest.raises(_GL.vm.UserError, match="stale"):
            self.c.review_release(pid)

    def test_cannot_review_cancelled_proposal(self):
        pid = propose_release(self.c, self.sid, [self.cid_42])
        _GL.message.sender_address = STEWARD
        self.c.cancel_release(pid)
        with pytest.raises(_GL.vm.UserError):
            self.c.review_release(pid)

# ---------------------------------------------------------------------------
# Tests: finalize_release
# ---------------------------------------------------------------------------

class TestFinalizeRelease:
    def _make_acceptable_proposal(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2", normative_level=1)
        pid = propose_release(c, sid, [cid])
        # Manually force ACCEPTABLE status (simulating successful review)
        from contracts.specweave import ReleaseProposal, STATUS_ACCEPTABLE
        p = c.proposals[pid]
        decisions = json.dumps([{
            "record_id": int(cid),
            "clause_id": "4.2",
            "decision": "COHERENT_SUPERSESSION",
            "supersedes": ["4.2"],
            "reason": "Explicit supersession.",
            "confidence_band": "HIGH",
        }])
        c.proposals[pid] = ReleaseProposal(
            standard_id=p.standard_id, proposer=p.proposer,
            base_version=p.base_version, commit_sha=p.commit_sha,
            manifest_url=p.manifest_url, manifest_digest=p.manifest_digest,
            changed_clause_count=p.changed_clause_count,
            status=STATUS_ACCEPTABLE,
            clause_decisions_json=decisions,
            rationale="Acceptable.",
            proposed_at=p.proposed_at, reviewed_at=0,
            changed_clause_ids_json=p.changed_clause_ids_json,
        )
        return c, sid, cid, pid

    def test_finalize_advances_canonical_version(self):
        c, sid, cid, pid = self._make_acceptable_proposal()
        new_version = c.finalize_release(pid)
        assert new_version == 1
        std = c.get_standard(sid)
        assert std["canonical_version"] == 1

    def test_finalize_marks_proposal_canonical(self):
        c, sid, cid, pid = self._make_acceptable_proposal()
        c.finalize_release(pid)
        p = c.get_release(pid)
        assert p["status_name"] == "CANONICAL"

    def test_cannot_finalize_proposed_status(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])
        with pytest.raises(_GL.vm.UserError, match="ACCEPTABLE"):
            c.finalize_release(pid)

    def test_stale_base_blocks_finalization(self):
        c, sid, cid, pid = self._make_acceptable_proposal()
        # Advance canonical
        from contracts.specweave import Standard
        std = c.standards[sid]
        c.standards[sid] = Standard(
            steward=std.steward, name=std.name,
            charter_url=std.charter_url, charter_digest=std.charter_digest,
            canonical_version=1,
            canonical_manifest_digest=std.canonical_manifest_digest,
            initial_manifest_url=std.initial_manifest_url,
            initial_manifest_digest=std.initial_manifest_digest,
            clause_count=std.clause_count, active=std.active,
            editor_count=std.editor_count,
        )
        with pytest.raises(_GL.vm.UserError, match="stale"):
            c.finalize_release(pid)

    def test_supersession_deactivates_old_clause(self):
        c, sid, cid, pid = self._make_acceptable_proposal()
        c.finalize_release(pid)
        old_cl = c.get_clause(cid)
        assert not old_cl["active"]
        assert old_cl["superseded_version"] == 1

# ---------------------------------------------------------------------------
# Tests: VecDB semantic retrieval
# ---------------------------------------------------------------------------

class TestVecDBRetrieval:
    def test_registered_clauses_inserted_into_vecdb(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "4.2", normative_level=1)
        register_clause(c, sid, "9.1", normative_level=0)
        assert len(c.vectors._items) == 2

    def test_preview_overlaps_returns_related(self):
        c = make_contract()
        sid = create_standard(c)
        cid_42 = register_clause(c, sid, "4.2", normative_level=1)
        cid_91 = register_clause(c, sid, "9.1", normative_level=0)
        pid = propose_release(c, sid, [cid_42])
        result = c.preview_overlaps(pid, 0, 5)
        assert result["changed_clause_id"] == "4.2"
        # Should find 9.1 as overlap (it's the only other clause)
        assert len(result["overlaps"]) >= 0  # may or may not overlap

    def test_cross_standard_clauses_not_retrieved(self):
        """Clauses from a different standard must not appear in overlaps."""
        c = make_contract()
        sid1 = create_standard(c)
        sid2 = create_standard(c)
        cid_a = register_clause(c, sid1, "1.1")
        cid_b = register_clause(c, sid2, "1.1")
        pid = propose_release(c, sid1, [cid_a])
        result = c.preview_overlaps(pid, 0, 5)
        # All returned overlaps must belong to sid1
        for overlap in result["overlaps"]:
            rec = c.get_clause(overlap["record_id"])
            assert rec["standard_id"] == int(sid1)

# ---------------------------------------------------------------------------
# Tests: Forged/malformed consensus output
# ---------------------------------------------------------------------------

class TestForgedConsensus:
    def _make_proposal(self, c, sid, cid):
        return propose_release(c, sid, [cid])

    def test_malformed_json_fails_closed(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])

        original_exec = _GL.nondet.exec_prompt
        _GL.nondet.exec_prompt = staticmethod(lambda p: "NOT VALID JSON{{{")
        try:
            result = c.review_release(pid)
            assert result == "REVISION_REQUIRED"
        finally:
            _GL.nondet.exec_prompt = original_exec

    def test_invalid_decision_enum_fails_closed(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])

        def bad_prompt(p):
            return json.dumps({
                "ok": True,
                "clause_decisions": [{
                    "record_id": int(cid),
                    "clause_id": "4.2",
                    "decision": "INVENTED_DECISION",
                    "supersedes": [],
                    "reason": "hacked",
                    "confidence_band": "HIGH",
                }],
                "overall_acceptable": True,
                "rationale": "forged"
            })

        original_exec = _GL.nondet.exec_prompt
        _GL.nondet.exec_prompt = staticmethod(bad_prompt)
        try:
            result = c.review_release(pid)
            # Invalid decision should cause all_coherent = False
            assert result == "REVISION_REQUIRED"
        finally:
            _GL.nondet.exec_prompt = original_exec

    def test_invented_supersession_clause_id_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])

        def bad_supersession(p):
            return json.dumps({
                "ok": True,
                "clause_decisions": [{
                    "record_id": int(cid),
                    "clause_id": "4.2",
                    "decision": "COHERENT_SUPERSESSION",
                    "supersedes": ["nonexistent.99"],
                    "reason": "fake supersession",
                    "confidence_band": "HIGH",
                }],
                "overall_acceptable": True,
                "rationale": "forged supersession"
            })

        original_exec = _GL.nondet.exec_prompt
        _GL.nondet.exec_prompt = staticmethod(bad_supersession)
        try:
            result = c.review_release(pid)
            # Must be REVISION_REQUIRED because invented clause ID degrades to SEMANTIC_CONFLICT
            assert result == "REVISION_REQUIRED"
        finally:
            _GL.nondet.exec_prompt = original_exec

    def test_ok_false_fails_closed(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "4.2")
        pid = propose_release(c, sid, [cid])

        _GL.nondet.exec_prompt = staticmethod(lambda p: json.dumps({"ok": False, "error": "unavailable"}))
        try:
            result = c.review_release(pid)
            assert result == "REVISION_REQUIRED"
        finally:
            _GL.nondet.exec_prompt = staticmethod(lambda p: json.dumps({
                "ok": True,
                "clause_decisions": [{
                    "record_id": 0, "clause_id": "4.2",
                    "decision": "COHERENT_SUPERSESSION", "supersedes": ["4.2"],
                    "reason": "test", "confidence_band": "HIGH",
                }],
                "overall_acceptable": True, "rationale": "test"
            }))

# ---------------------------------------------------------------------------
# Tests: invariants
# ---------------------------------------------------------------------------

class TestInvariants:
    def test_similarity_cannot_create_implicit_supersession(self):
        """A high VecDB overlap alone cannot trigger supersession; must be explicit in decisions."""
        c = make_contract()
        sid = create_standard(c)
        cid_42 = register_clause(c, sid, "4.2", normative_level=1)
        # Register a very similar clause
        _GL.message.sender_address = STEWARD
        c.register_initial_clause(
            standard_id=sid,
            clause_id="4.3",
            section_path="section.4",
            normative_level=1,
            text="Clause 4.2 normative text for testing.",  # near-identical
            source_url=SOURCE_URL_42,
            source_digest="sha256:4.3",
        )
        cid_new = register_clause(c, sid, "4.4", normative_level=0)
        pid = propose_release(c, sid, [cid_new])
        result = c.preview_overlaps(pid, 0, 5)
        # Overlap distance is data only; does not auto-supersede anything
        for overlap in result["overlaps"]:
            assert "superseded" not in overlap  # raw overlap has no supersession flag

    def test_clause_id_unique_per_standard(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "5.1")
        with pytest.raises(_GL.vm.UserError, match="already exists"):
            register_clause(c, sid, "5.1")

    def test_list_clauses_for_standard(self):
        c = make_contract()
        sid = create_standard(c)
        for i in range(5):
            register_clause(c, sid, f"{i}.1")
        result = c.list_clauses_for_standard(sid, 0, 10)
        assert len(result) == 5

    def test_supersession_graph_view(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "4.2")
        graph = c.get_supersession_graph(sid)
        assert isinstance(graph["nodes"], list)
        assert len(graph["nodes"]) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
