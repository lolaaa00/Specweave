#!/usr/bin/env node
/**
 * SpecWeave — Full lifecycle demo.
 * Proposes, reviews, and finalizes a release on the seeded contract.
 *
 * Usage:
 *   CONTRACT=<address> node scripts/lifecycle-demo.mjs
 *
 * Requires: genlayer CLI, contract deployed and seeded (standard 0 with 12 clauses).
 */

import { spawnSync } from "child_process";

const CONTRACT = process.env.CONTRACT;
const RPC = "https://studio.genlayer.com/api";
if (!CONTRACT) {
  console.error("Set CONTRACT=<deployed_contract_address>");
  process.exit(1);
}

function read(method, ...args) {
  const argv = ["call", "--rpc", RPC, CONTRACT, method];
  if (args.length > 0) argv.push("--args", ...args.map(String));
  const r = spawnSync("genlayer", argv, { encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) { console.error(r.stderr?.slice(0, 300)); process.exit(1); }
  // Parse result line after "Result:"
  const match = r.stdout.match(/Result:\s*\n([^\n]+)/);
  return match?.[1]?.trim();
}

function write(method, ...args) {
  const argv = ["write", "--rpc", RPC, CONTRACT, method, "--args", ...args.map(String)];
  console.log(`\n$ genlayer write ... ${CONTRACT} ${method}`);
  const r = spawnSync("genlayer", argv, { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) { console.error(r.stderr?.slice(0, 300) || r.stdout.slice(0, 300)); process.exit(1); }
  const match = r.stdout.match(/0x[0-9a-fA-F]{64}/);
  const tx = match?.[0];
  console.log("  TX:", tx);
  return tx;
}

function receipt(txHash) {
  const argv = ["receipt", "--rpc", RPC, txHash];
  const r = spawnSync("genlayer", argv, { encoding: "utf8", timeout: 60000 });
  return r.stdout;
}

console.log("=== SpecWeave Lifecycle Demo ===");
console.log("Contract:", CONTRACT);

// Verify state
const clauseCount = read("get_clause_count");
const proposalCount = read("get_proposal_count");
console.log(`\nState: ${clauseCount} clauses, ${proposalCount} proposals`);
if (Number(clauseCount) < 12) {
  console.error("Need 12 clauses seeded first. Run seed-demo.mjs.");
  process.exit(1);
}

// Propose a release: change clause record_id=7 (§4-2, retry policy)
// New text: retry window increased from 30s to 5 minutes for better network resilience
console.log("\n1. propose_release (changing §4-2, record_id=7)...");
const proposeTx = write(
  "propose_release",
  "0",  // standard_id
  "0",  // base_version (current canonical)
  "abc1234def5678abc1234def5678abc1234def56",  // commit_sha (40 chars)
  "https://raw.githubusercontent.com/specweave/demo-spec/abc1234def5678abc1234def5678abc1234def56/v1-manifest.json",
  "sha256:v1-manifest-digest-placeholder-for-demo",
  "1",  // changed_clause_count
  "[7]" // changed_clause_ids (record_id 7 = §4-2)
);
console.log("  propose TX:", proposeTx);

// Check proposal count increased
const proposalCountAfter = read("get_proposal_count");
if (Number(proposalCountAfter) < 1) {
  const rec = receipt(proposeTx);
  console.error("Proposal failed. Receipt:", rec.slice(0, 500));
  process.exit(1);
}
console.log(`  proposal_count now: ${proposalCountAfter}`);

// Review the release (proposal_id=0)
console.log("\n2. review_release (proposal_id=0, triggers AI consensus)...");
const reviewTx = write("review_release", "0");
console.log("  review TX:", reviewTx);

// Get release status
const releaseData = read("get_release", "0");
console.log("  release status:", releaseData);

// Finalize if acceptable
console.log("\n3. finalize_release (proposal_id=0)...");
const finalizeTx = write("finalize_release", "0");
console.log("  finalize TX:", finalizeTx);

// Final state
const finalProposalData = read("get_release", "0");
console.log("\n=== Final release state ===");
console.log(finalProposalData);

const standardData = read("get_standard", "0");
console.log("\n=== Standard state ===");
console.log(standardData);

console.log("\n=== Lifecycle complete ===");
