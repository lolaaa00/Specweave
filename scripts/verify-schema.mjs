#!/usr/bin/env node
/**
 * Verify that the deployed contract exposes all methods required by the frontend.
 * Usage: CONTRACT=<address> node scripts/verify-schema.mjs
 */

const CONTRACT = process.env.CONTRACT;
const ENDPOINT = process.env.ENDPOINT ?? "https://studio.genlayer.com/api";

const REQUIRED_METHODS = [
  "create_standard",
  "set_editor",
  "register_initial_clause",
  "propose_release",
  "review_release",
  "finalize_release",
  "cancel_release",
  "get_standard",
  "get_clause",
  "get_release",
  "preview_overlaps",
  "get_standard_count",
  "get_clause_count",
  "get_proposal_count",
  "list_clauses_for_standard",
  "list_proposals_for_standard",
  "get_supersession_graph",
  "is_editor",
];

if (!CONTRACT) {
  console.error("Usage: CONTRACT=<address> node scripts/verify-schema.mjs");
  process.exit(1);
}

console.log(`Verifying schema for contract ${CONTRACT} on ${ENDPOINT}...`);

try {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "gen_getContractSchema",
      params: [CONTRACT],
      id: 1,
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error("RPC error:", JSON.stringify(data.error));
    process.exit(1);
  }

  const schema = data.result;
  const methods = Object.keys(schema?.methods ?? schema?.abi ?? {});
  console.log("Methods found:", methods);

  const missing = REQUIRED_METHODS.filter(m => !methods.includes(m));
  if (missing.length > 0) {
    console.error("\nMISSING methods:", missing);
    process.exit(1);
  }

  console.log("\n✓ All required methods present.");
} catch (err) {
  console.error("Fetch error:", err.message);
  process.exit(1);
}
