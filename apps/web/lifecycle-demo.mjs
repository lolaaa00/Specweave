#!/usr/bin/env node
/**
 * SpecWeave lifecycle demo — propose → review → finalize.
 *
 * Proposes v1 of Standard 0 (two ADD clauses), waits for AI consensus review
 * with live evidence binding, then finalizes to bump canonical version to 1.
 *
 * Usage (from apps/web/):
 *   PRIVATE_KEY=0x<your_key> node lifecycle-demo.mjs
 */

import { readFileSync } from "fs";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    const raw = readFileSync(new URL(".env.local", import.meta.url), "utf8");
    const vars = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim();
    }
    return vars;
  } catch { return {}; }
}

const env = loadEnv();
const CONTRACT = process.env.CONTRACT ?? env.NEXT_PUBLIC_SPECWEAVE_CONTRACT;
const RPC      = env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";

if (!CONTRACT) {
  console.error("ERROR: set CONTRACT=0x… or NEXT_PUBLIC_SPECWEAVE_CONTRACT in .env.local");
  process.exit(1);
}

// Commit SHA where source clause files and manifest live.
// These files are immutable at this commit — changing them would change the SHA-256 digest.
const COMMIT       = "8f7769e3d1c63a3af0c8e62de56b5cdff3cd04c9";
const RAW_BASE     = `https://raw.githubusercontent.com/lolaaa00/Specweave/${COMMIT}`;
const MANIFEST_URL = `${RAW_BASE}/demo/standard/manifest-v1.json`;

// Real SHA-256 digest of manifest-v1.json at the above commit, verified locally.
const MANIFEST_DIGEST = "sha256:c56ce19e2c970cc1580f3875bb851f43d33bd8997229983cc02c858cd99b2fe9";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFinalized(client, hash, label, timeoutSec = 600) {
  const polls = Math.ceil(timeoutSec / 5);
  for (let i = 0; i < polls; i++) {
    await sleep(5000);
    try {
      const tx = await client.getTransaction({ hash });
      const s = String(tx?.statusName ?? "").toUpperCase();
      process.stdout.write(`\r  ${label} ${hash.slice(0, 14)}… ${s} (${i * 5}s)   `);
      if (s === "FINALIZED") { console.log(); return; }
      if (["CANCELED", "FAILED", "ROLLBACK"].includes(s)) throw new Error(`TX ${hash} → ${s}`);
    } catch (e) {
      if (e.message?.startsWith("TX ")) throw e;
    }
  }
  throw new Error(`TX ${hash} timed out after ${timeoutSec}s`);
}

async function callWrite(client, method, args, label) {
  process.stdout.write(`\n[${label}] submitting ${method}… `);
  const hash = await client.writeContract({
    address: CONTRACT, functionName: method, args, value: BigInt(0),
  });
  console.log(`TX: ${hash}`);
  await waitFinalized(client, hash, label);
  console.log(`  ✓ ${label} finalized`);
  return hash;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== SpecWeave Lifecycle Demo ===");
  console.log("Contract:", CONTRACT);
  console.log("RPC:     ", RPC);
  console.log("Manifest:", MANIFEST_URL);
  console.log();

  if (!process.env.PRIVATE_KEY) {
    console.error("ERROR: PRIVATE_KEY env var required");
    process.exit(1);
  }
  const account = createAccount(process.env.PRIVATE_KEY);
  const client  = createClient({ chain: studionet, endpoint: RPC, account });
  console.log("Account:", account.address);

  // Read current state
  const clauseCount   = Number(await client.readContract({ address: CONTRACT, functionName: "get_clause_count", args: [] }));
  const proposalCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_proposal_count", args: [] }));
  const std           = await client.readContract({ address: CONTRACT, functionName: "get_standard", args: [0] });
  console.log(`Clauses on-chain: ${clauseCount}, Existing proposals: ${proposalCount}`);
  console.log(`Standard 0 canonical version: ${std.canonical_version}`);
  console.log();

  if (Number(std.canonical_version) !== 0) {
    console.log("Standard 0 is already past v0. Adjust base_version or use a different demo.");
    process.exit(0);
  }

  // ------------------------------------------------------------
  // Candidates — two ADD clauses matching manifest-v1.json exactly
  // ------------------------------------------------------------
  const candidates = [
    {
      operation: "ADD",
      clause_id: "1-1",
      previous_record_id: 0,
      section_path: "1.1",
      normative_level: 0,
      text: "Every release of a standard governed by SpecWeave MUST be accompanied by a canonical manifest that records the exact set of normative changes, the commit SHA at which those changes were authored, and a cryptographic digest of each source artifact. The manifest itself MUST be published at an immutable, commit-pinned URL before the release proposal is submitted for review.",
      source_url: `${RAW_BASE}/demo/standard/clauses/clause-1-1-v1.md`,
      source_digest: "sha256:15dc46fefc59630f2069db998af2bbc60488267301e4b67ab3bf85f2c288579a",
    },
    {
      operation: "ADD",
      clause_id: "1-2",
      previous_record_id: 0,
      section_path: "1.2",
      normative_level: 0,
      text: "A release proposal MUST NOT be finalized unless every candidate clause change receives a COHERENT_NEW or COHERENT_SUPERSESSION decision from the GenLayer validator consensus. Proposals containing DUPLICATE_RULE, SEMANTIC_CONFLICT, or INSUFFICIENT_CONTEXT decisions MUST be returned with REVISION_REQUIRED status. The proposer MUST then submit a corrected proposal; an existing proposal with REVISION_REQUIRED status is terminal and cannot be resubmitted for review.",
      source_url: `${RAW_BASE}/demo/standard/clauses/clause-1-2-v1.md`,
      source_digest: "sha256:105ab8a5783315b3da999fc3788b2fa41112a7ae0e4713a9634eece9f87e91d0",
    },
  ];

  // ------------------------------------------------------------
  // Step 1 — propose_release
  // ------------------------------------------------------------
  const proposeHash = await callWrite(
    client,
    "propose_release",
    [
      0,               // standard_id
      0,               // base_version
      COMMIT,          // commit_sha
      MANIFEST_URL,    // manifest_url (HTTPS, integrity verified by digest)
      MANIFEST_DIGEST, // manifest_digest
      candidates,
    ],
    "PROPOSE",
  );

  const newProposalCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_proposal_count", args: [] }));
  const proposalId = newProposalCount - 1;
  console.log(`\nProposal ID: ${proposalId}`);

  // ------------------------------------------------------------
  // Step 2 — review_release (AI consensus + live evidence fetch)
  // Validators will:
  //   1. Fetch MANIFEST_URL and verify SHA-256 = MANIFEST_DIGEST
  //   2. Parse manifest JSON and bind candidates exactly
  //   3. Fetch each source_url and verify SHA-256 = source_digest
  //   4. Run semantic adjudication via gl.eq_principle.prompt_comparative
  // ------------------------------------------------------------
  console.log("\nStep 2: review_release — validators fetching evidence + AI consensus (3-10 min)…");
  const reviewHash = await callWrite(client, "review_release", [proposalId], "REVIEW");

  // Check result
  const proposal = await client.readContract({ address: CONTRACT, functionName: "get_release", args: [proposalId] });
  console.log(`  Status: ${proposal.status_name}, evidence_verified: ${proposal.evidence_verified}`);

  if (proposal.status_name !== "ACCEPTABLE") {
    console.log("\nProposal was not accepted. Rationale:", proposal.rationale);
    console.log("Decisions:", proposal.clause_decisions_json);
    process.exit(1);
  }

  // ------------------------------------------------------------
  // Step 3 — finalize_release
  // ------------------------------------------------------------
  console.log("\nStep 3: finalize_release…");
  const finalizeHash = await callWrite(client, "finalize_release", [proposalId], "FINALIZE");

  // ------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------
  const stdAfter = await client.readContract({ address: CONTRACT, functionName: "get_standard", args: [0] });
  console.log("\n=== Lifecycle demo complete ===");
  console.log(`Standard 0 canonical version: ${stdAfter.canonical_version}`);
  console.log(`Canonical manifest digest:    ${stdAfter.canonical_manifest_digest}`);
  console.log();
  console.log("TX hashes:");
  console.log(`  propose:  ${proposeHash}`);
  console.log(`  review:   ${reviewHash}`);
  console.log(`  finalize: ${finalizeHash}`);
  console.log();
  console.log("View on frontend: https://specweave.vercel.app/versions");
}

main().catch(e => { console.error("\nERROR:", e.message ?? e); process.exit(1); });
