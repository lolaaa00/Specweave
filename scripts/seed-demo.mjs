#!/usr/bin/env node
/**
 * SpecWeave — Demo seed script.
 * Seeds the mini-protocol spec with 12 clauses using the GenLayer CLI.
 *
 * Usage:
 *   CONTRACT=<address> node scripts/seed-demo.mjs
 *
 * Requires: genlayer CLI authenticated to StudioNet, contract deployed.
 * This script produces REAL on-chain transactions; it is not a mock.
 */

import { spawnSync } from "child_process";

const CONTRACT = process.env.CONTRACT;
if (!CONTRACT) {
  console.error("Set CONTRACT=<deployed_contract_address>");
  process.exit(1);
}

const RPC = "https://studio.genlayer.com/api";

// Placeholder commit-pinned URLs — replace with real spec repo for production.
const BASE_COMMIT = "0000000000000000000000000000000000000000";
const CHARTER_URL = `https://github.com/specweave/demo-spec/raw/${BASE_COMMIT}/charter.md`;
const MANIFEST_URL = `https://github.com/specweave/demo-spec/raw/${BASE_COMMIT}/v0-manifest.json`;

function write(method, ...args) {
  // Args are passed as separate elements to avoid shell quoting issues.
  const argv = ["write", "--rpc", RPC, CONTRACT, method, "--args", ...args.map(String)];
  console.log(`\n$ genlayer ${argv.slice(0, 5).join(" ")} --args ...`);
  const r = spawnSync("genlayer", argv, { encoding: "utf8", timeout: 300000 });
  if (r.error) { console.error("Spawn error:", r.error.message); process.exit(1); }
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  // Extract tx hash from output
  const match = r.stdout.match(/0x[0-9a-fA-F]{64}/);
  console.log("  TX:", match?.[0] ?? "(no hash)");
  return match?.[0];
}

console.log("=== SpecWeave Demo Seed ===");
console.log("Contract:", CONTRACT);

console.log("\n1. Creating standard...");
const createTx = write(
  "create_standard",
  "Demo Protocol Specification v0",
  CHARTER_URL,
  "sha256:charter-digest-placeholder",
  MANIFEST_URL,
  "sha256:manifest-v0-placeholder",
);
console.log("  create_standard TX:", createTx);

// Clause IDs use hyphens (not dots) to avoid CLI BigInt parse errors.
const CLAUSES = [
  { id: "1-1", section: "general.scope", normative: 0, text: "This specification defines the behavior of compliant protocol implementations." },
  { id: "1-2", section: "general.scope", normative: 2, text: "Implementations MAY support extensions defined in companion specifications." },
  { id: "2-1", section: "connection.establishment", normative: 0, text: "Clients MUST establish a TLS 1.3 connection before transmitting data." },
  { id: "2-2", section: "connection.establishment", normative: 0, text: "Servers MUST reject connections that do not present a valid certificate." },
  { id: "3-1", section: "message.format", normative: 0, text: "Messages MUST be encoded in UTF-8." },
  { id: "3-2", section: "message.format", normative: 1, text: "Implementations SHOULD validate message checksums before processing." },
  { id: "4-1", section: "retry.policy", normative: 0, text: "Clients MUST implement exponential backoff for transient failures." },
  { id: "4-2", section: "retry.policy", normative: 1, text: "Clients SHOULD retry transient failures after 30 seconds." },
  { id: "5-1", section: "error.handling", normative: 0, text: "Implementations MUST return error codes defined in Appendix A." },
  { id: "7-1", section: "security.general", normative: 0, text: "Implementations MUST NOT downgrade security negotiation." },
  { id: "9-1", section: "authentication.retry", normative: 0, text: "Clients MUST NOT retry authentication failures." },
  { id: "10-1", section: "versioning", normative: 1, text: "Implementations SHOULD advertise supported protocol versions during handshake." },
];

const SOURCE_URL = `https://raw.githubusercontent.com/specweave/demo-spec/${BASE_COMMIT}/spec.md`;

console.log("\n2. Registering 12 initial clauses...");
for (const cl of CLAUSES) {
  write(
    "register_initial_clause",
    "0",          // standard_id
    cl.id,
    cl.section,
    String(cl.normative),
    cl.text,
    SOURCE_URL,
    `sha256:clause-${cl.id}-placeholder`,
  );
  console.log(`  Registered §${cl.id}`);
}

console.log("\n=== Seed complete ===");
console.log("Standard ID: 0 — 12 clauses registered.");
console.log("Now propose a release changing clause 4.2 to demonstrate the semantic conflict with 9.1.");
