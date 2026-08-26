"""
SpecWeave v2 — Comprehensive deterministic tests.
Tests cover: validation, state machine, consensus hardening, finalization,
multi-release lifecycle, adversarial consensus output, and VecDB invariants.

Run with: pytest tests/direct/test_specweave.py -v
"""
import sys
import os
import json
import pytest
from unittest.mock import MagicMock

import types
import numpy as np

# ---------------------------------------------------------------------------
# Minimal GenLayer simulation stubs
# ---------------------------------------------------------------------------

genlayer_stub = types.ModuleType("genlayer")
gl_stub = types.ModuleType("genlayer.gl")

for _t in ("u8", "u16", "u32", "u64", "u128", "u256"):
    setattr(genlayer_stub, _t, int)
    setattr(gl_stub, _t, int)

genlayer_stub.allow_storage = lambda cls: cls
genlayer_stub.TreeMap = dict
genlayer_stub.DynArray = list


class _Message:
    sender_address = "0xSteward1234567890abcdef1234567890abcdef12"


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
            # Default: returns empty — tests override this
            return json.dumps({"ok": False, "error": "stub"})

    class eq_principle:
        @staticmethod
        def prompt_comparative(leader_fn, principle: str) -> str:
            return leader_fn()

    class vm:
        class UserError(Exception):
            pass

    class Contract:
        pass


genlayer_stub.gl = _GL
sys.modules["genlayer"] = genlayer_stub
sys.modules["genlayer.gl"] = gl_stub

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

    def get(self, key, default=None):
        return None


ge_stub.VecDB = _VecDB
ge_stub.EuclideanDistanceSquared = object


class _SentenceTransformer:
    def __init__(self, model_name):
        pass

    def __call__(self, text: str) -> np.ndarray:
        seed = abs(hash(text)) % (2 ** 31)
        rng = np.random.default_rng(seed)
        return rng.standard_normal(384).astype(np.float32)


ge_stub.SentenceTransformer = _SentenceTransformer
sys.modules["genlayer_embeddings"] = ge_stub

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from contracts.specweave import (
    SpecWeave, Standard, Clause, CandidateClause, ReleaseProposal, SupersessionEdge,
    STATUS_PROPOSED, STATUS_UNDER_REVIEW, STATUS_ACCEPTABLE,
    STATUS_REVISION_REQUIRED, STATUS_CANONICAL, STATUS_CANCELLED,
    STATUS_NAMES,
    DECISION_COHERENT_NEW, DECISION_COHERENT_SUPERSESSION,
    DECISION_DUPLICATE_RULE, DECISION_SEMANTIC_CONFLICT, DECISION_INSUFFICIENT_CONTEXT,
    OPERATION_ADD, OPERATION_REVISE, OPERATION_SUPERSEDE,
    MAX_TEXT_LEN, MAX_CANDIDATES_PER_RELEASE, COMMIT_SHA_LEN,
)

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

STEWARD = "0xSteward1234567890abcdef1234567890abcdef12"
EDITOR  = "0xEditor1234567890abcdef1234567890abcdef1234"
OTHER   = "0xOther01234567890abcdef1234567890abcdef1234"

COMMIT_A = "a" * 40
COMMIT_B = "b" * 40

CHARTER_URL  = "https://raw.githubusercontent.com/org/spec/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/charter.md"
MANIFEST_URL_A = f"https://raw.githubusercontent.com/org/spec/{COMMIT_A}/manifest.json"
MANIFEST_URL_B = f"https://raw.githubusercontent.com/org/spec/{COMMIT_B}/manifest.json"
MANIFEST_DIGEST = "sha256:" + "a" * 64
SOURCE_URL_A = f"https://raw.githubusercontent.com/org/spec/{COMMIT_A}/clauses.md"
SOURCE_URL_B = f"https://raw.githubusercontent.com/org/spec/{COMMIT_B}/clauses.md"
SOURCE_DIGEST = "sha256:" + "b" * 64
CHARTER_DIGEST = "sha256:" + "c" * 64
INITIAL_MANIFEST_URL = "https://raw.githubusercontent.com/org/spec/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v0-manifest.json"
INITIAL_MANIFEST_DIGEST = "sha256:" + "d" * 64

# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------

def make_contract():
    c = SpecWeave()
    _GL.message.sender_address = STEWARD
    return c


def create_standard(c, name="Test Protocol Spec") -> int:
    _GL.message.sender_address = STEWARD
    return int(c.create_standard(
        name, CHARTER_URL, CHARTER_DIGEST,
        INITIAL_MANIFEST_URL, INITIAL_MANIFEST_DIGEST,
    ))


def register_clause(c, sid, clause_id="1-1", normative_level=0,
                    text=None, section_path="general.scope",
                    source_url=None, source_digest=None) -> int:
    _GL.message.sender_address = STEWARD
    text = text or f"Normative text for clause {clause_id}."
    return int(c.register_initial_clause(
        standard_id=sid,
        clause_id=clause_id,
        section_path=section_path,
        normative_level=normative_level,
        text=text,
        source_url=source_url or SOURCE_URL_A,
        source_digest=source_digest or SOURCE_DIGEST,
    ))


def make_add_candidate(clause_id, commit_sha=COMMIT_A, text=None,
                       section_path="general.scope", normative_level=0):
    return {
        "operation": "ADD",
        "clause_id": clause_id,
        "previous_record_id": 0,
        "section_path": section_path,
        "normative_level": normative_level,
        "text": text or f"New clause {clause_id} normative content.",
        "source_url": f"https://raw.githubusercontent.com/org/spec/{commit_sha}/clauses.md",
        "source_digest": "sha256:" + "e" * 64,
    }


def make_revise_candidate(clause_id, previous_record_id, commit_sha=COMMIT_A,
                          text=None, section_path="general.scope", normative_level=0):
    return {
        "operation": "REVISE",
        "clause_id": clause_id,
        "previous_record_id": previous_record_id,
        "section_path": section_path,
        "normative_level": normative_level,
        "text": text or f"Revised text for {clause_id}.",
        "source_url": f"https://raw.githubusercontent.com/org/spec/{commit_sha}/clauses.md",
        "source_digest": "sha256:" + "f" * 64,
    }


def propose_with_add(c, sid, clause_id="2-1", commit=COMMIT_A) -> int:
    _GL.message.sender_address = STEWARD
    manifest = f"https://raw.githubusercontent.com/org/spec/{commit}/manifest.json"
    cand = make_add_candidate(clause_id, commit)
    return int(c.propose_release(
        standard_id=sid, base_version=0,
        commit_sha=commit, manifest_url=manifest,
        manifest_digest=MANIFEST_DIGEST,
        candidates=[cand],
    ))


def propose_with_revise(c, sid, clause_id, previous_record_id, commit=COMMIT_A) -> int:
    _GL.message.sender_address = STEWARD
    manifest = f"https://raw.githubusercontent.com/org/spec/{commit}/manifest.json"
    cand = make_revise_candidate(clause_id, previous_record_id, commit)
    return int(c.propose_release(
        standard_id=sid, base_version=0,
        commit_sha=commit, manifest_url=manifest,
        manifest_digest=MANIFEST_DIGEST,
        candidates=[cand],
    ))


def force_acceptable(c, pid, cand_id, clause_id, decision=None, supersedes=None):
    """Force a proposal to ACCEPTABLE by directly writing the status and decisions."""
    p = c.proposals[pid]
    dec = decision or DECISION_COHERENT_NEW
    sups = supersedes if supersedes is not None else []
    decisions = json.dumps([{
        "candidate_record_id": int(cand_id),
        "clause_id": clause_id,
        "decision": dec,
        "supersedes": sups,
        "reason": "Forced for test.",
        "confidence_band": "HIGH",
    }])
    c.proposals[pid] = ReleaseProposal(
        standard_id=p.standard_id, proposer=p.proposer,
        base_version=p.base_version, commit_sha=p.commit_sha,
        manifest_url=p.manifest_url, manifest_digest=p.manifest_digest,
        candidate_count=p.candidate_count,
        status=STATUS_ACCEPTABLE,
        clause_decisions_json=decisions,
        rationale="Test setup.",
        proposed_at=p.proposed_at, reviewed_at=0,
        candidate_ids_json=p.candidate_ids_json,
    )


def make_exec_prompt(candidate_id, clause_id, decision=DECISION_COHERENT_NEW, supersedes=None):
    def _exec_prompt(prompt: str) -> str:
        return json.dumps({
            "ok": True,
            "clause_decisions": [{
                "candidate_record_id": int(candidate_id),
                "clause_id": clause_id,
                "decision": decision,
                "supersedes": supersedes or [],
                "reason": "Test decision.",
                "confidence_band": "HIGH",
            }],
            "overall_acceptable": decision in (DECISION_COHERENT_NEW, DECISION_COHERENT_SUPERSESSION),
            "rationale": "Test rationale.",
        })
    return staticmethod(_exec_prompt)


# ---------------------------------------------------------------------------
# Tests: create_standard validation
# ---------------------------------------------------------------------------

class TestCreateStandard:
    def test_creates_standard_with_valid_args(self):
        c = make_contract()
        sid = create_standard(c)
        assert sid == 0
        std = c.get_standard(sid)
        assert std["name"] == "Test Protocol Spec"
        assert std["steward"] == STEWARD
        assert std["canonical_version"] == 0
        assert std["active"] is True

    def test_rejects_empty_name(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="name"):
            c.create_standard("", CHARTER_URL, CHARTER_DIGEST, INITIAL_MANIFEST_URL, INITIAL_MANIFEST_DIGEST)

    def test_rejects_non_sha256_digest(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="digest"):
            c.create_standard("X", CHARTER_URL, "not-a-digest", INITIAL_MANIFEST_URL, INITIAL_MANIFEST_DIGEST)

    def test_rejects_short_hex_digest(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="64 characters"):
            c.create_standard("X", CHARTER_URL, "sha256:" + "a" * 63, INITIAL_MANIFEST_URL, INITIAL_MANIFEST_DIGEST)

    def test_rejects_non_hex_in_digest(self):
        c = make_contract()
        bad = "sha256:" + "z" * 64
        with pytest.raises(_GL.vm.UserError, match="non-hex"):
            c.create_standard("X", CHARTER_URL, bad, INITIAL_MANIFEST_URL, INITIAL_MANIFEST_DIGEST)

    def test_rejects_http_charter_url(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="HTTPS"):
            c.create_standard("X", "http://example.com/charter", CHARTER_DIGEST, INITIAL_MANIFEST_URL, INITIAL_MANIFEST_DIGEST)

    def test_multiple_standards_independent(self):
        c = make_contract()
        sid1 = create_standard(c, "Spec A")
        sid2 = create_standard(c, "Spec B")
        assert sid1 != sid2
        assert c.get_standard(sid1)["name"] == "Spec A"
        assert c.get_standard(sid2)["name"] == "Spec B"


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
        assert c.get_standard(sid)["editor_count"] == 1

    def test_editor_can_register_clauses(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        _GL.message.sender_address = EDITOR
        cid = c.register_initial_clause(sid, "1-1", "general", 0, "Text.", SOURCE_URL_A, SOURCE_DIGEST)
        assert cid >= 0

    def test_non_editor_cannot_register(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = OTHER
        with pytest.raises(_GL.vm.UserError, match="not authorized"):
            c.register_initial_clause(sid, "1-1", "general", 0, "Text.", SOURCE_URL_A, SOURCE_DIGEST)

    def test_non_steward_cannot_set_editor(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = OTHER
        with pytest.raises(_GL.vm.UserError, match="steward"):
            c.set_editor(sid, EDITOR, True)

    def test_remove_editor_decrements_count(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        assert c.get_standard(sid)["editor_count"] == 1
        c.set_editor(sid, EDITOR, False)
        assert c.get_standard(sid)["editor_count"] == 0
        assert not c.is_editor(sid, EDITOR)

    def test_idempotent_add_editor(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        c.set_editor(sid, EDITOR, True)  # no-op
        assert c.get_standard(sid)["editor_count"] == 1


# ---------------------------------------------------------------------------
# Tests: register_initial_clause validation
# ---------------------------------------------------------------------------

class TestRegisterInitialClause:
    def test_registers_clause_successfully(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        cl = c.get_clause(cid)
        assert cl["clause_id"] == "1-1"
        assert cl["active"] is True
        assert cl["introduced_version"] == 0

    def test_rejects_duplicate_clause_id(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        with pytest.raises(_GL.vm.UserError, match="already exists"):
            register_clause(c, sid, "1-1")

    def test_rejects_invalid_normative_level(self):
        c = make_contract()
        sid = create_standard(c)
        with pytest.raises(_GL.vm.UserError, match="normative_level"):
            c.register_initial_clause(sid, "1-1", "s", 3, "T.", SOURCE_URL_A, SOURCE_DIGEST)

    def test_rejects_empty_text(self):
        c = make_contract()
        sid = create_standard(c)
        with pytest.raises(_GL.vm.UserError, match="text"):
            c.register_initial_clause(sid, "1-1", "s", 0, "", SOURCE_URL_A, SOURCE_DIGEST)

    def test_rejects_text_too_long(self):
        c = make_contract()
        sid = create_standard(c)
        with pytest.raises(_GL.vm.UserError):
            c.register_initial_clause(sid, "1-1", "s", 0, "x" * (MAX_TEXT_LEN + 1), SOURCE_URL_A, SOURCE_DIGEST)

    def test_rejects_non_sha256_source_digest(self):
        c = make_contract()
        sid = create_standard(c)
        with pytest.raises(_GL.vm.UserError, match="sha256"):
            c.register_initial_clause(sid, "1-1", "s", 0, "T.", SOURCE_URL_A, "bad-digest")

    def test_rejects_after_first_release(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        # Standard now at v1; initial registration blocked
        with pytest.raises(_GL.vm.UserError, match="initial clause registration"):
            register_clause(c, sid, "9-9")

    def test_different_standards_same_clause_id_allowed(self):
        c = make_contract()
        sid1 = create_standard(c, "Spec A")
        sid2 = create_standard(c, "Spec B")
        register_clause(c, sid1, "1-1")
        cid2 = register_clause(c, sid2, "1-1")
        assert cid2 >= 0

    def test_clause_count_increments(self):
        c = make_contract()
        sid = create_standard(c)
        for i in range(5):
            register_clause(c, sid, f"{i}-1")
        assert c.get_standard(sid)["clause_count"] == 5

    def test_clause_inserted_into_vecdb(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        assert len(c.vectors._items) == 1


# ---------------------------------------------------------------------------
# Tests: propose_release — commit SHA validation
# ---------------------------------------------------------------------------

class TestCommitShaValidation:
    def _propose(self, c, sid, commit_sha):
        _GL.message.sender_address = STEWARD
        register_clause(c, sid, "X-1")
        manifest = f"https://raw.githubusercontent.com/org/spec/{commit_sha}/m.json"
        cand = make_add_candidate("Y-1", commit_sha)
        return c.propose_release(
            standard_id=sid, base_version=0,
            commit_sha=commit_sha, manifest_url=manifest,
            manifest_digest=MANIFEST_DIGEST, candidates=[cand],
        )

    def test_valid_lowercase_hex_sha_accepted(self):
        c = make_contract()
        sid = create_standard(c)
        pid = self._propose(c, sid, "a" * 40)
        assert pid >= 0

    def test_valid_uppercase_hex_sha_accepted(self):
        c = make_contract()
        sid = create_standard(c)
        pid = self._propose(c, sid, "A" * 40)
        assert pid >= 0

    def test_39_char_sha_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        with pytest.raises(_GL.vm.UserError, match="40 characters"):
            self._propose(c, sid, "a" * 39)

    def test_41_char_sha_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        with pytest.raises(_GL.vm.UserError, match="40 characters"):
            self._propose(c, sid, "a" * 41)

    def test_non_hex_sha_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        bad = "g" * 40
        with pytest.raises(_GL.vm.UserError, match="hexadecimal"):
            self._propose(c, sid, bad)

    def test_sha_with_space_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        bad = "a" * 39 + " "
        with pytest.raises(_GL.vm.UserError):
            self._propose(c, sid, bad)


# ---------------------------------------------------------------------------
# Tests: propose_release — URL validation
# ---------------------------------------------------------------------------

class TestUrlValidation:
    def test_manifest_url_must_be_raw_githubusercontent(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("2-1", COMMIT_A)
        with pytest.raises(_GL.vm.UserError, match="raw.githubusercontent.com"):
            c.propose_release(
                sid, 0, COMMIT_A,
                "https://github.com/org/spec/blob/aaaa/m.json",  # wrong host
                MANIFEST_DIGEST, [cand],
            )

    def test_manifest_url_sha_must_match_commit_sha(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("2-1", COMMIT_A)
        wrong_sha_url = f"https://raw.githubusercontent.com/org/spec/{COMMIT_B}/m.json"
        with pytest.raises(_GL.vm.UserError, match="does not match"):
            c.propose_release(sid, 0, COMMIT_A, wrong_sha_url, MANIFEST_DIGEST, [cand])

    def test_manifest_url_mutable_branch_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("2-1", COMMIT_A)
        mutable_url = "https://raw.githubusercontent.com/org/spec/main/m.json"
        with pytest.raises(_GL.vm.UserError, match="mutable branch"):
            c.propose_release(sid, 0, COMMIT_A, mutable_url, MANIFEST_DIGEST, [cand])

    def test_source_url_must_contain_same_commit_sha(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("2-1", COMMIT_B)  # different commit in source URL
        with pytest.raises(_GL.vm.UserError, match="does not match"):
            c.propose_release(
                sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand]
            )

    def test_http_url_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("2-1", COMMIT_A)
        cand["source_url"] = f"http://raw.githubusercontent.com/org/spec/{COMMIT_A}/clauses.md"
        with pytest.raises(_GL.vm.UserError, match="HTTPS"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand])


# ---------------------------------------------------------------------------
# Tests: propose_release — candidate validation
# ---------------------------------------------------------------------------

class TestCandidateValidation:
    def test_add_candidate_accepted(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        p = c.get_release(pid)
        assert p["candidate_count"] == 1
        assert p["status_name"] == "PROPOSED"

    def test_add_to_existing_active_clause_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("1-1")  # already exists
        with pytest.raises(_GL.vm.UserError, match="already exists as active"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand])

    def test_revise_existing_clause_accepted(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        _GL.message.sender_address = STEWARD
        cand = make_revise_candidate("1-1", cid)
        pid = c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand])
        assert pid >= 0

    def test_revise_wrong_previous_record_id_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        _GL.message.sender_address = STEWARD
        cand = make_revise_candidate("1-1", int(cid) + 99)  # wrong record ID
        with pytest.raises(_GL.vm.UserError, match="previous_record_id must match"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand])

    def test_revise_nonexistent_clause_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_revise_candidate("9-9", 0)
        with pytest.raises(_GL.vm.UserError, match="not found in canonical"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand])

    def test_duplicate_clause_id_in_candidates_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cands = [make_add_candidate("2-1"), make_add_candidate("2-1")]  # duplicate
        with pytest.raises(_GL.vm.UserError, match="duplicate clause_id"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, cands)

    def test_empty_candidates_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError, match="at least one"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [])

    def test_too_many_candidates_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cands = [make_add_candidate(f"{i}-1") for i in range(MAX_CANDIDATES_PER_RELEASE + 1)]
        with pytest.raises(_GL.vm.UserError, match="too many"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, cands)

    def test_invalid_operation_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("2-1")
        cand["operation"] = "HACK"
        with pytest.raises(_GL.vm.UserError, match="operation"):
            c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, [cand])

    def test_stale_base_version_rejected(self):
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        # Advance canonical to v1
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        # Now try proposing with base_version=0 (stale)
        _GL.message.sender_address = STEWARD
        cand = make_add_candidate("3-1", COMMIT_B)
        with pytest.raises(_GL.vm.UserError, match="base_version"):
            c.propose_release(sid, 0, COMMIT_B, MANIFEST_URL_B, MANIFEST_DIGEST, [cand])


# ---------------------------------------------------------------------------
# Tests: cancel_release
# ---------------------------------------------------------------------------

class TestCancelRelease:
    def test_proposer_can_cancel(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        _GL.message.sender_address = STEWARD
        c.cancel_release(pid)
        assert c.get_release(pid)["status_name"] == "CANCELLED"

    def test_steward_can_cancel_others_proposal(self):
        c = make_contract()
        sid = create_standard(c)
        _GL.message.sender_address = STEWARD
        c.set_editor(sid, EDITOR, True)
        _GL.message.sender_address = EDITOR
        pid = propose_with_add(c, sid, "2-1")
        _GL.message.sender_address = STEWARD
        c.cancel_release(pid)
        assert c.get_release(pid)["status_name"] == "CANCELLED"

    def test_non_proposer_cannot_cancel(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        _GL.message.sender_address = OTHER
        with pytest.raises(_GL.vm.UserError, match="not authorized"):
            c.cancel_release(pid)

    def test_cannot_cancel_canonical(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        _GL.message.sender_address = STEWARD
        with pytest.raises(_GL.vm.UserError, match="cannot cancel"):
            c.cancel_release(pid)


# ---------------------------------------------------------------------------
# Tests: review_release — consensus hardening
# ---------------------------------------------------------------------------

class TestReviewReleaseHardening:
    def _setup(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        return c, sid, pid, cand_id

    def test_malformed_json_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        _GL.nondet.exec_prompt = staticmethod(lambda p: "NOT JSON{{")
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"
        assert c.get_release(pid)["status_name"] == "REVISION_REQUIRED"

    def test_ok_false_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        _GL.nondet.exec_prompt = staticmethod(lambda p: json.dumps({"ok": False}))
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_missing_clause_decisions_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        _GL.nondet.exec_prompt = staticmethod(lambda p: json.dumps({"ok": True}))
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_duplicate_candidate_id_in_decisions_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        def _dup(p):
            return json.dumps({"ok": True, "clause_decisions": [
                {"candidate_record_id": cand_id, "clause_id": "2-1", "decision": DECISION_COHERENT_NEW,
                 "supersedes": [], "reason": "a", "confidence_band": "HIGH"},
                {"candidate_record_id": cand_id, "clause_id": "2-1", "decision": DECISION_COHERENT_NEW,
                 "supersedes": [], "reason": "b", "confidence_band": "HIGH"},
            ], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_dup)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_extra_invented_candidate_id_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        def _extra(p):
            return json.dumps({"ok": True, "clause_decisions": [
                {"candidate_record_id": cand_id, "clause_id": "2-1", "decision": DECISION_COHERENT_NEW,
                 "supersedes": [], "reason": "ok", "confidence_band": "HIGH"},
                {"candidate_record_id": 9999, "clause_id": "hack", "decision": DECISION_COHERENT_NEW,
                 "supersedes": [], "reason": "hack", "confidence_band": "HIGH"},
            ], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_extra)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_missing_candidate_id_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        _GL.nondet.exec_prompt = staticmethod(lambda p: json.dumps({
            "ok": True, "clause_decisions": [],
            "overall_acceptable": False, "rationale": "x"
        }))
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_wrong_clause_id_for_candidate_fails_closed(self):
        c, sid, pid, cand_id = self._setup()
        def _wrong_clause(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_id,
                "clause_id": "WRONG-ID",  # doesn't match candidate's actual clause_id
                "decision": DECISION_COHERENT_NEW,
                "supersedes": [], "reason": "ok", "confidence_band": "HIGH",
            }], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_wrong_clause)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_invalid_decision_enum_degrades(self):
        c, sid, pid, cand_id = self._setup()
        def _bad_enum(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_id, "clause_id": "2-1",
                "decision": "INVENTED_ENUM",
                "supersedes": [], "reason": "x", "confidence_band": "HIGH",
            }], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_bad_enum)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_invented_supersession_clause_id_degrades(self):
        c, sid, pid, cand_id = self._setup()
        def _invented_sup(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_id, "clause_id": "2-1",
                "decision": DECISION_COHERENT_SUPERSESSION,
                "supersedes": ["nonexistent-99"],
                "reason": "x", "confidence_band": "HIGH",
            }], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_invented_sup)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_empty_supersedes_for_coherent_supersession_degrades(self):
        c, sid, pid, cand_id = self._setup()
        def _empty_sup(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_id, "clause_id": "2-1",
                "decision": DECISION_COHERENT_SUPERSESSION,
                "supersedes": [],  # empty — invalid
                "reason": "x", "confidence_band": "HIGH",
            }], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_empty_sup)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_overall_acceptable_not_trusted_from_llm(self):
        """LLM says overall_acceptable=True but with SEMANTIC_CONFLICT — must be REVISION_REQUIRED."""
        c, sid, pid, cand_id = self._setup()
        def _lie(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_id, "clause_id": "2-1",
                "decision": DECISION_SEMANTIC_CONFLICT,
                "supersedes": [], "reason": "conflict", "confidence_band": "HIGH",
            }], "overall_acceptable": True,  # LLM lies
            "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_lie)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_revise_candidate_with_coherent_new_degrades_to_conflict(self):
        """A REVISE candidate must be COHERENT_SUPERSESSION. COHERENT_NEW must be degraded."""
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        pid = propose_with_revise(c, sid, "1-1", cid)
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]

        def _wrong_decision(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_id, "clause_id": "1-1",
                "decision": DECISION_COHERENT_NEW,  # wrong for REVISE
                "supersedes": [], "reason": "x", "confidence_band": "HIGH",
            }], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_wrong_decision)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_cannot_review_cancelled_proposal(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        _GL.message.sender_address = STEWARD
        c.cancel_release(pid)
        with pytest.raises(_GL.vm.UserError):
            c.review_release(pid)

    def test_cannot_review_stale_proposal(self):
        """If canonical advanced since proposal, review fails."""
        c = make_contract()
        sid = create_standard(c)
        cid = register_clause(c, sid, "1-1")
        pid1 = propose_with_add(c, sid, "2-1")
        cand1 = json.loads(c.proposals[pid1].candidate_ids_json)[0]
        force_acceptable(c, pid1, cand1, "2-1")
        c.finalize_release(pid1)
        # Now propose another one (base_version=0 already rejected by propose_release)
        # Simulate by manually creating a stale proposal
        c.proposals[99] = ReleaseProposal(
            standard_id=sid, proposer=STEWARD,
            base_version=0,  # stale
            commit_sha=COMMIT_B,
            manifest_url=MANIFEST_URL_B, manifest_digest=MANIFEST_DIGEST,
            candidate_count=1, status=STATUS_PROPOSED,
            clause_decisions_json="", rationale="",
            proposed_at=0, reviewed_at=0,
            candidate_ids_json="[999]",
        )
        with pytest.raises(_GL.vm.UserError, match="stale"):
            c.review_release(99)

    def test_successful_coherent_new_review(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        _GL.nondet.exec_prompt = make_exec_prompt(cand_id, "2-1", DECISION_COHERENT_NEW)
        result = c.review_release(pid)
        assert result == "ACCEPTABLE"
        assert c.get_release(pid)["status_name"] == "ACCEPTABLE"

    def test_semantic_conflict_gives_revision_required(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        _GL.nondet.exec_prompt = make_exec_prompt(cand_id, "2-1", DECISION_SEMANTIC_CONFLICT)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"

    def test_cross_proposal_candidate_id_rejected(self):
        """A candidate from proposal A cannot appear in proposal B's decisions."""
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        pid_a = propose_with_add(c, sid, "2-1")
        cand_a = json.loads(c.proposals[pid_a].candidate_ids_json)[0]
        # Cancel proposal A
        c.cancel_release(pid_a)
        # Create proposal B
        pid_b = propose_with_add(c, sid, "3-1")
        cand_b = json.loads(c.proposals[pid_b].candidate_ids_json)[0]

        def _cross_proposal(p):
            return json.dumps({"ok": True, "clause_decisions": [{
                "candidate_record_id": cand_a,  # belongs to different proposal
                "clause_id": "3-1",
                "decision": DECISION_COHERENT_NEW,
                "supersedes": [], "reason": "x", "confidence_band": "HIGH",
            }], "overall_acceptable": True, "rationale": "x"})
        _GL.nondet.exec_prompt = staticmethod(_cross_proposal)
        result = c.review_release(pid_b)
        assert result == "REVISION_REQUIRED"


# ---------------------------------------------------------------------------
# Tests: finalize_release
# ---------------------------------------------------------------------------

class TestFinalizeRelease:
    def test_finalize_advances_canonical_version(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        new_v = c.finalize_release(pid)
        assert new_v == 1
        assert c.get_standard(sid)["canonical_version"] == 1

    def test_finalize_marks_proposal_canonical(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        assert c.get_release(pid)["status_name"] == "CANONICAL"

    def test_add_candidate_creates_new_canonical_clause(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        # New canonical clause should exist
        ck = f"{sid}:2-1"
        assert ck in c.standard_clause_ids
        new_rid = c.standard_clause_ids[ck]
        cl = c.get_clause(new_rid)
        assert cl["active"] is True
        assert cl["introduced_version"] == 1

    def test_revise_creates_new_clause_and_deactivates_old(self):
        c = make_contract()
        sid = create_standard(c)
        old_cid = register_clause(c, sid, "1-1", text="Original text.")
        pid = propose_with_revise(c, sid, "1-1", old_cid)
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        c.finalize_release(pid)

        # Old record must be inactive
        old_cl = c.get_clause(old_cid)
        assert old_cl["active"] is False
        assert old_cl["superseded_version"] == 1

        # New canonical for same clause_id must be active
        ck = f"{sid}:1-1"
        new_rid = c.standard_clause_ids[ck]
        assert new_rid != old_cid
        new_cl = c.get_clause(new_rid)
        assert new_cl["active"] is True
        assert new_cl["introduced_version"] == 1

    def test_revise_stores_supersession_edge(self):
        c = make_contract()
        sid = create_standard(c)
        old_cid = register_clause(c, sid, "1-1")
        pid = propose_with_revise(c, sid, "1-1", old_cid)
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        c.finalize_release(pid)

        # Check supersession edge exists
        assert len(c.supersession_edges) == 1
        edge = c.supersession_edges[0]
        assert int(edge.old_record_id) == int(old_cid)
        new_ck = f"{sid}:1-1"
        new_rid = c.standard_clause_ids[new_ck]
        assert int(edge.new_record_id) == int(new_rid)
        assert edge.at_version == 1

    def test_supersession_graph_has_real_edges(self):
        c = make_contract()
        sid = create_standard(c)
        old_cid = register_clause(c, sid, "1-1")
        pid = propose_with_revise(c, sid, "1-1", old_cid)
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        c.finalize_release(pid)

        graph = c.get_supersession_graph(sid)
        assert len(graph["edges"]) == 1
        edge = graph["edges"][0]
        assert "old_record_id" in edge
        assert "new_record_id" in edge
        assert edge["old_record_id"] != edge["new_record_id"]
        assert edge["at_version"] == 1

    def test_cannot_finalize_proposed_status(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        with pytest.raises(_GL.vm.UserError, match="ACCEPTABLE"):
            c.finalize_release(pid)

    def test_stale_base_blocks_finalization(self):
        c = make_contract()
        sid = create_standard(c)
        pid1 = propose_with_add(c, sid, "2-1")
        cand1 = json.loads(c.proposals[pid1].candidate_ids_json)[0]
        force_acceptable(c, pid1, cand1, "2-1")
        c.finalize_release(pid1)

        # Create another proposal then manually set acceptable with stale base
        pid2 = int(c.proposal_count)
        c.proposals[pid2] = ReleaseProposal(
            standard_id=sid, proposer=STEWARD,
            base_version=0, commit_sha=COMMIT_B,  # stale base
            manifest_url=MANIFEST_URL_B, manifest_digest=MANIFEST_DIGEST,
            candidate_count=1, status=STATUS_ACCEPTABLE,
            clause_decisions_json=json.dumps([{
                "candidate_record_id": 0, "clause_id": "x",
                "decision": DECISION_COHERENT_NEW, "supersedes": [],
                "reason": "x", "confidence_band": "HIGH",
            }]),
            rationale="x", proposed_at=0, reviewed_at=0,
            candidate_ids_json="[0]",
        )
        with pytest.raises(_GL.vm.UserError, match="stale"):
            c.finalize_release(pid2)

    def test_manifest_digest_updates_on_finalize(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        std = c.get_standard(sid)
        assert std["canonical_manifest_digest"] == MANIFEST_DIGEST

    def test_new_canonical_clause_embedded_in_vecdb(self):
        c = make_contract()
        sid = create_standard(c)
        init_vec_count = len(c.vectors._items)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        # One new vector entry for the new canonical clause
        assert len(c.vectors._items) == init_vec_count + 1


# ---------------------------------------------------------------------------
# Tests: multi-release lifecycle (critical end-to-end path)
# ---------------------------------------------------------------------------

class TestMultiReleaseLifecycle:
    """
    v0: initial clauses "1-1", "2-1"
    v1: ADD "3-1" → canonical
    v2: REVISE "1-1" → new text, supersedes old
    v3: ADD "4-1", then stale proposal from v1 must fail
    """

    def test_full_lifecycle(self):
        c = make_contract()
        sid = create_standard(c)

        # v0: register two initial clauses
        cid_11 = register_clause(c, sid, "1-1", text="Clause 1-1 original.")
        cid_21 = register_clause(c, sid, "2-1", text="Clause 2-1 original.")
        assert c.get_standard(sid)["canonical_version"] == 0

        # v1: ADD "3-1"
        pid1 = propose_with_add(c, sid, "3-1")
        cand1 = json.loads(c.proposals[pid1].candidate_ids_json)[0]
        force_acceptable(c, pid1, cand1, "3-1")
        v1 = c.finalize_release(pid1)
        assert v1 == 1
        assert c.get_standard(sid)["canonical_version"] == 1
        # "3-1" is now canonical
        ck_31 = f"{sid}:3-1"
        assert ck_31 in c.standard_clause_ids
        cid_31_v1 = c.standard_clause_ids[ck_31]
        assert c.get_clause(cid_31_v1)["active"] is True

        # v2: REVISE "1-1" — need to use v1 commit and base_version=1
        _GL.message.sender_address = STEWARD
        cand_v2 = {
            "operation": "REVISE",
            "clause_id": "1-1",
            "previous_record_id": int(cid_11),
            "section_path": "general.scope",
            "normative_level": 0,
            "text": "Clause 1-1 revised text MUST comply.",
            "source_url": f"https://raw.githubusercontent.com/org/spec/{COMMIT_B}/clauses.md",
            "source_digest": "sha256:" + "f" * 64,
        }
        pid2 = c.propose_release(
            sid, 1, COMMIT_B, MANIFEST_URL_B, MANIFEST_DIGEST, [cand_v2]
        )
        cand2_id = json.loads(c.proposals[pid2].candidate_ids_json)[0]
        force_acceptable(c, pid2, cand2_id, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        v2 = c.finalize_release(pid2)
        assert v2 == 2

        # Old "1-1" record must be inactive
        assert c.get_clause(cid_11)["active"] is False
        assert c.get_clause(cid_11)["superseded_version"] == 2

        # New "1-1" record must be active with revised text
        new_cid_11 = c.standard_clause_ids[f"{sid}:1-1"]
        assert new_cid_11 != cid_11
        new_cl = c.get_clause(new_cid_11)
        assert new_cl["active"] is True
        assert "revised" in new_cl["text"].lower()
        assert new_cl["introduced_version"] == 2

        # Supersession edge must exist
        assert len(c.supersession_edges) >= 1

        # v3: ADD "4-1"
        commit_c = "c" * 40
        _GL.message.sender_address = STEWARD
        pid3 = c.propose_release(
            sid, 2,
            commit_c,
            f"https://raw.githubusercontent.com/org/spec/{commit_c}/m.json",
            MANIFEST_DIGEST,
            [make_add_candidate("4-1", commit_c)],
        )
        cand3_id = json.loads(c.proposals[pid3].candidate_ids_json)[0]
        force_acceptable(c, pid3, cand3_id, "4-1")
        v3 = c.finalize_release(pid3)
        assert v3 == 3

        # All active clauses: "1-1" (new), "2-1", "3-1", "4-1" = 4
        all_clauses = c.list_clauses_for_standard(sid, 0, 50)
        active = [cl for cl in all_clauses if cl["active"]]
        assert len(active) == 4

        # Graph has 1 edge (from v2 revision of "1-1")
        graph = c.get_supersession_graph(sid)
        assert len(graph["edges"]) == 1
        edge = graph["edges"][0]
        assert int(edge["old_record_id"]) == int(cid_11)

        # Stale proposal (base_version=1) after v3 must fail
        _GL.message.sender_address = STEWARD
        stale_commit = "d" * 40
        with pytest.raises(_GL.vm.UserError, match="base_version"):
            c.propose_release(
                sid, 1, stale_commit,
                f"https://raw.githubusercontent.com/org/spec/{stale_commit}/m.json",
                MANIFEST_DIGEST,
                [make_add_candidate("5-1", stale_commit)],
            )

    def test_duplicate_finalization_fails(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        with pytest.raises(_GL.vm.UserError, match="ACCEPTABLE"):
            c.finalize_release(pid)  # already CANONICAL

    def test_two_proposals_same_clause_id_second_uses_new_base(self):
        """After v1 finalizes, a new proposal for same clause_id must use base_version=1."""
        c = make_contract()
        sid = create_standard(c)
        old_cid = register_clause(c, sid, "1-1")

        # v1: REVISE 1-1
        pid1 = propose_with_revise(c, sid, "1-1", old_cid)
        cand1 = json.loads(c.proposals[pid1].candidate_ids_json)[0]
        force_acceptable(c, pid1, cand1, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        c.finalize_release(pid1)
        new_cid = c.standard_clause_ids[f"{sid}:1-1"]

        # v2: REVISE 1-1 again with new record ID
        commit_b = "b" * 40
        _GL.message.sender_address = STEWARD
        cand_v2 = make_revise_candidate("1-1", int(new_cid), commit_b,
                                        text="1-1 twice revised.")
        pid2 = c.propose_release(
            sid, 1, commit_b,
            f"https://raw.githubusercontent.com/org/spec/{commit_b}/m.json",
            MANIFEST_DIGEST, [cand_v2],
        )
        cand2 = json.loads(c.proposals[pid2].candidate_ids_json)[0]
        force_acceptable(c, pid2, cand2, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        v2 = c.finalize_release(pid2)
        assert v2 == 2


# ---------------------------------------------------------------------------
# Tests: VecDB semantics
# ---------------------------------------------------------------------------

class TestVecDBSemantics:
    def test_initial_clauses_embedded(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        register_clause(c, sid, "2-1")
        assert len(c.vectors._items) == 2

    def test_finalization_embeds_new_canonical_not_old(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        initial_count = len(c.vectors._items)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "2-1")
        c.finalize_release(pid)
        # Exactly one new embedding (for the new canonical clause)
        assert len(c.vectors._items) == initial_count + 1

    def test_revise_embeds_new_not_old_again(self):
        c = make_contract()
        sid = create_standard(c)
        old_cid = register_clause(c, sid, "1-1")
        initial_count = len(c.vectors._items)
        pid = propose_with_revise(c, sid, "1-1", old_cid)
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        force_acceptable(c, pid, cand_id, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        c.finalize_release(pid)
        # One new vector for the revised clause (old one remains but filter by active)
        assert len(c.vectors._items) == initial_count + 1

    def test_preview_overlaps_uses_candidate_text(self):
        """preview_overlaps should embed candidate text, not old canonical text."""
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1", text="Connection security requirements.")
        register_clause(c, sid, "2-1", text="TLS handshake must be performed.")
        old_cid = register_clause(c, sid, "3-1", text="Authentication credentials.")
        # Propose a revision that makes clause 3-1 about TLS (semantically closer to 2-1)
        pid = propose_with_revise(c, sid, "3-1", old_cid)
        result = c.preview_overlaps(pid, 0, 5)
        assert "candidate_clause_id" in result
        assert result["candidate_clause_id"] == "3-1"
        assert result["operation"] == "REVISE"
        # The old record (3-1) should NOT appear in overlaps (it's the one being revised)
        overlap_clause_ids = [o["clause_id"] for o in result["overlaps"]]
        assert "3-1" not in overlap_clause_ids or len(result["overlaps"]) == 0

    def test_cross_standard_clauses_excluded_from_overlaps(self):
        c = make_contract()
        sid1 = create_standard(c, "Spec A")
        sid2 = create_standard(c, "Spec B")
        register_clause(c, sid1, "1-1")
        register_clause(c, sid2, "1-1")  # same clause_id, different standard
        pid = propose_with_add(c, sid1, "2-1")
        result = c.preview_overlaps(pid, 0, 5)
        for overlap in result["overlaps"]:
            # All overlaps must belong to standard sid1
            rec = c.get_clause(overlap["record_id"])
            assert rec["standard_id"] == int(sid1)

    def test_inactive_clauses_excluded_from_overlaps(self):
        c = make_contract()
        sid = create_standard(c)
        old_cid = register_clause(c, sid, "1-1", text="Authentication token MUST be included.")
        # Finalize a revision — old clause becomes inactive
        pid1 = propose_with_revise(c, sid, "1-1", old_cid)
        cand1 = json.loads(c.proposals[pid1].candidate_ids_json)[0]
        force_acceptable(c, pid1, cand1, "1-1",
                         decision=DECISION_COHERENT_SUPERSESSION, supersedes=["1-1"])
        c.finalize_release(pid1)
        assert c.get_clause(old_cid)["active"] is False

        # Now propose another change and check overlaps don't include inactive clause
        commit_b = "b" * 40
        _GL.message.sender_address = STEWARD
        pid2 = c.propose_release(
            sid, 1, commit_b,
            f"https://raw.githubusercontent.com/org/spec/{commit_b}/m.json",
            MANIFEST_DIGEST,
            [make_add_candidate("3-1", commit_b, text="Authentication token MUST be included.")],
        )
        result = c.preview_overlaps(pid2, 0, 5)
        # old_cid should not appear (it's inactive)
        overlap_record_ids = [o["record_id"] for o in result["overlaps"]]
        assert int(old_cid) not in overlap_record_ids


# ---------------------------------------------------------------------------
# Tests: views
# ---------------------------------------------------------------------------

class TestViews:
    def test_get_standard_not_found(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="not found"):
            c.get_standard(999)

    def test_get_clause_not_found(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="not found"):
            c.get_clause(999)

    def test_get_release_not_found(self):
        c = make_contract()
        with pytest.raises(_GL.vm.UserError, match="not found"):
            c.get_release(999)

    def test_get_candidate(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        cand = c.get_candidate(cand_id)
        assert cand["clause_id"] == "2-1"
        assert cand["operation"] == "ADD"
        assert cand["proposal_id"] == pid

    def test_list_clauses_for_standard(self):
        c = make_contract()
        sid = create_standard(c)
        for i in range(5):
            register_clause(c, sid, f"{i}-1")
        result = c.list_clauses_for_standard(sid, 0, 10)
        assert len(result) == 5

    def test_list_proposals_for_standard(self):
        c = make_contract()
        sid = create_standard(c)
        propose_with_add(c, sid, "2-1")
        propose_with_add(c, sid, "3-1")  # note: both same base=0
        result = c.list_proposals_for_standard(sid, 0, 10)
        assert len(result) == 2

    def test_list_proposals_returns_candidate_count(self):
        c = make_contract()
        sid = create_standard(c)
        propose_with_add(c, sid, "2-1")
        result = c.list_proposals_for_standard(sid, 0, 10)
        assert result[0]["candidate_count"] == 1

    def test_supersession_graph_empty_initially(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        graph = c.get_supersession_graph(sid)
        assert len(graph["nodes"]) == 1
        assert len(graph["edges"]) == 0

    def test_counters(self):
        c = make_contract()
        sid = create_standard(c)
        register_clause(c, sid, "1-1")
        propose_with_add(c, sid, "2-1")
        assert int(c.get_standard_count()) == 1
        assert int(c.get_clause_count()) == 1  # only initial registered
        assert int(c.get_proposal_count()) == 1
        assert int(c.get_candidate_count()) == 1  # one candidate created

    def test_release_view_has_candidate_ids_json(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        r = c.get_release(pid)
        assert "candidate_ids_json" in r
        ids = json.loads(r["candidate_ids_json"])
        assert len(ids) == 1


# ---------------------------------------------------------------------------
# Tests: adversarial finalization
# ---------------------------------------------------------------------------

class TestAdversarialFinalization:
    def test_non_coherent_decision_blocks_finalization(self):
        c = make_contract()
        sid = create_standard(c)
        pid = propose_with_add(c, sid, "2-1")
        cand_id = json.loads(c.proposals[pid].candidate_ids_json)[0]
        # Force ACCEPTABLE but with a SEMANTIC_CONFLICT decision (shouldn't happen in practice)
        p = c.proposals[pid]
        bad_decisions = json.dumps([{
            "candidate_record_id": cand_id,
            "clause_id": "2-1",
            "decision": DECISION_SEMANTIC_CONFLICT,
            "supersedes": [], "reason": "x", "confidence_band": "HIGH",
        }])
        c.proposals[pid] = ReleaseProposal(
            standard_id=p.standard_id, proposer=p.proposer,
            base_version=p.base_version, commit_sha=p.commit_sha,
            manifest_url=p.manifest_url, manifest_digest=p.manifest_digest,
            candidate_count=p.candidate_count,
            status=STATUS_ACCEPTABLE,
            clause_decisions_json=bad_decisions,
            rationale="bad", proposed_at=p.proposed_at, reviewed_at=0,
            candidate_ids_json=p.candidate_ids_json,
        )
        with pytest.raises(_GL.vm.UserError, match="non-coherent"):
            c.finalize_release(pid)

    def test_duplicate_supersession_across_candidates_rejected(self):
        """Two candidates cannot both supersede the same canonical clause."""
        c = make_contract()
        sid = create_standard(c)
        target_cid = register_clause(c, sid, "1-1")

        _GL.message.sender_address = STEWARD
        # Two SUPERSEDE candidates both claiming to supersede "1-1"
        cands = [
            {
                "operation": "SUPERSEDE",
                "clause_id": "2-1",
                "previous_record_id": 0,
                "section_path": "new.section",
                "normative_level": 0,
                "text": "New superseding clause A.",
                "source_url": SOURCE_URL_A,
                "source_digest": "sha256:" + "e" * 64,
            },
            {
                "operation": "SUPERSEDE",
                "clause_id": "3-1",
                "previous_record_id": 0,
                "section_path": "another.section",
                "normative_level": 0,
                "text": "New superseding clause B.",
                "source_url": SOURCE_URL_A,
                "source_digest": "sha256:" + "f" * 64,
            },
        ]
        pid = c.propose_release(sid, 0, COMMIT_A, MANIFEST_URL_A, MANIFEST_DIGEST, cands)
        cand_ids = json.loads(c.proposals[pid].candidate_ids_json)

        # Both try to supersede "1-1" — second should degrade to SEMANTIC_CONFLICT
        def _both_supersede_same(p):
            return json.dumps({"ok": True, "clause_decisions": [
                {
                    "candidate_record_id": cand_ids[0], "clause_id": "2-1",
                    "decision": DECISION_COHERENT_SUPERSESSION,
                    "supersedes": ["1-1"], "reason": "ok", "confidence_band": "HIGH",
                },
                {
                    "candidate_record_id": cand_ids[1], "clause_id": "3-1",
                    "decision": DECISION_COHERENT_SUPERSESSION,
                    "supersedes": ["1-1"],  # duplicate — should be caught
                    "reason": "ok", "confidence_band": "HIGH",
                },
            ], "overall_acceptable": True, "rationale": "x"})

        _GL.nondet.exec_prompt = staticmethod(_both_supersede_same)
        result = c.review_release(pid)
        assert result == "REVISION_REQUIRED"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
