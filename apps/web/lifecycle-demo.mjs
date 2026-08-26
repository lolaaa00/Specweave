#!/usr/bin/env node
/**
 * SpecWeave lifecycle demo — propose → review → finalize.
 *
 * Proposes a REVISE to §1-1 of Standard 0, waits for AI consensus review,
 * then finalizes to bump the canonical version.
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

const COMMIT = "c94072951e483510329670aa427fba3fa6944f45";
const RAW    = `https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/${COMMIT}`;

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
  console.log();

  if (!process.env.PRIVATE_KEY) {
    console.error("ERROR: PRIVATE_KEY env var required");
    process.exit(1);
  }
  const account = createAccount(process.env.PRIVATE_KEY);
  const client  = createClient({ chain: studionet, endpoint: RPC, account });
  console.log("Account:", account.address);

  // Read current state
  const clauseCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_clause_count", args: [] }));
  const proposalCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_proposal_count", args: [] }));
  console.log(`Clauses on-chain: ${clauseCount}, Existing proposals: ${proposalCount}`);
  console.log();

  // ------------------------------------------------------------
  // Step 1 — propose_release
  // REVISE §1-1 to tighten the wording
  // ------------------------------------------------------------
  const candidate = {
    operation: "REVISE",
    clause_id: "1-1",
    previous_record_id: 0,
    section_path: "general.scope",
    normative_level: 0,
    text: "This specification defines the normative requirements that all compliant protocol implementations MUST satisfy.",
    source_url: `${RAW}/README.md`,
    source_digest: "sha256:" + "d".repeat(64),
  };

  const proposeHash = await callWrite(
    client,
    "propose_release",
    [
      0,                // standard_id
      0,                // base_version
      COMMIT,           // commit_sha
      `${RAW}/package.json`,
      "sha256:" + "e".repeat(64),
      [candidate],
    ],
    "PROPOSE",
  );

  // Determine the new proposal_id
  const newProposalCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_proposal_count", args: [] }));
  const proposalId = newProposalCount - 1;
  console.log(`\nProposal ID: ${proposalId}`);

  // ------------------------------------------------------------
  // Step 2 — review_release (AI consensus — may take several minutes)
  // ------------------------------------------------------------
  console.log("\nStep 2: review_release — waiting for AI consensus (this may take 3-10 min)…");
  const reviewHash = await callWrite(client, "review_release", [proposalId], "REVIEW");

  // ------------------------------------------------------------
  // Step 3 — finalize_release
  // ------------------------------------------------------------
  console.log("\nStep 3: finalize_release…");
  const finalizeHash = await callWrite(client, "finalize_release", [proposalId], "FINALIZE");

  // ------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------
  console.log("\n=== Lifecycle demo complete ===");
  console.log(`Proposal #${proposalId} finalized. Standard 0 is now at v1.`);
  console.log();
  console.log("TX hashes:");
  console.log(`  propose:  ${proposeHash}`);
  console.log(`  review:   ${reviewHash}`);
  console.log(`  finalize: ${finalizeHash}`);
  console.log();
  console.log("View on frontend: https://specweave.vercel.app/versions");
}

main().catch(e => { console.error("\nERROR:", e.message ?? e); process.exit(1); });
