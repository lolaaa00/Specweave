#!/usr/bin/env node
/**
 * SpecWeave seed script — creates standard 0 and registers 12 initial clauses.
 *
 * Usage (from apps/web/):
 *   PRIVATE_KEY=0x<your_key> node seed.mjs
 *
 * Reads CONTRACT from .env.local automatically.
 */

import { readFileSync } from "fs";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// ---------------------------------------------------------------------------
// Load config
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
  console.error("ERROR: contract address not found. Set CONTRACT=0x... or NEXT_PUBLIC_SPECWEAVE_CONTRACT in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Real commit-pinned references (genlayer-studio @ main, 2025-08-26)
// ---------------------------------------------------------------------------
const COMMIT = "c94072951e483510329670aa427fba3fa6944f45";
const RAW    = `https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/${COMMIT}`;

// Syntactically valid sha256 digests (hex content doesn't need to match the
// actual file hash for the demo seed — the contract only checks the format).
const D_CHARTER  = "sha256:" + "a".repeat(64);
const D_MANIFEST = "sha256:" + "b".repeat(64);
const D_CLAUSE   = "sha256:" + "c".repeat(64);

const CLAUSES = [
  { id: "1-1",  section: "general.scope",          normative: 0, text: "This specification defines the normative behavior of compliant protocol implementations." },
  { id: "1-2",  section: "general.scope",          normative: 2, text: "Implementations MAY support extensions defined in companion specifications." },
  { id: "2-1",  section: "connection.tls",         normative: 0, text: "Clients MUST establish a TLS 1.3 connection before transmitting any application data." },
  { id: "2-2",  section: "connection.tls",         normative: 0, text: "Servers MUST reject connections that do not present a valid certificate chain." },
  { id: "3-1",  section: "message.encoding",       normative: 0, text: "All messages MUST be encoded in UTF-8 without a byte-order mark." },
  { id: "3-2",  section: "message.encoding",       normative: 1, text: "Implementations SHOULD validate message checksums before processing payload." },
  { id: "4-1",  section: "retry.policy",           normative: 0, text: "Clients MUST implement exponential backoff for all transient failure responses." },
  { id: "4-2",  section: "retry.policy",           normative: 1, text: "Clients SHOULD NOT retry requests that fail with a 4xx authentication error." },
  { id: "5-1",  section: "error.codes",            normative: 0, text: "Implementations MUST return error codes as defined in Appendix A of this specification." },
  { id: "7-1",  section: "security.negotiation",   normative: 0, text: "Implementations MUST NOT permit downgrade of negotiated security parameters." },
  { id: "9-1",  section: "authentication.failure", normative: 0, text: "Clients MUST NOT automatically retry requests that fail authentication." },
  { id: "10-1", section: "versioning",             normative: 1, text: "Implementations SHOULD advertise all supported protocol versions during the initial handshake." },
];

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

function makeClient(account) {
  return createClient({ chain: studionet, endpoint: RPC, account });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFinalized(client, hash) {
  console.log(`    TX: ${hash}`);
  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    try {
      const tx = await client.getTransaction({ hash });
      // statusName is the string field; status is a numeric code
      const statusName = String(tx?.statusName ?? tx?.status ?? "").toUpperCase();
      process.stdout.write(`\r    ${hash.slice(0,14)}… ${statusName} (${i * 5}s)   `);
      if (statusName === "FINALIZED") { console.log(); return "FINALIZED"; }
      if (["CANCELED", "FAILED", "ROLLBACK"].includes(statusName)) {
        throw new Error(`TX ${hash} → ${statusName}`);
      }
    } catch (e) {
      if (e.message?.includes("TX ")) throw e;
      process.stdout.write(`\r    polling… (${i * 5}s, rpc err)   `);
    }
  }
  throw new Error(`TX ${hash} timed out after 7.5 min`);
}

async function callWrite(client, method, args) {
  process.stdout.write(`  ${method} `);
  const hash = await client.writeContract({
    address: CONTRACT,
    functionName: method,
    args,
    value: BigInt(0),
  });
  const status = await waitFinalized(client, hash);
  console.log(` ✓ (${hash.slice(0, 12)}… ${status})`);
  return hash;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== SpecWeave Seed ===");
  console.log("Contract:", CONTRACT);
  console.log("RPC:     ", RPC);
  console.log("Commit:  ", COMMIT);

  // Account: use PRIVATE_KEY env var, or generate a throwaway key
  let account;
  if (process.env.PRIVATE_KEY) {
    account = createAccount(process.env.PRIVATE_KEY);
    console.log("Account: ", account.address, "(from PRIVATE_KEY)");
  } else {
    // Generate a fresh key — only works if you fund it first
    const pk = generatePrivateKey();
    account = createAccount(pk);
    console.log("Account: ", account.address, "(generated — fund this address on StudioNet first)");
    console.log("Key:     ", pk, "(save this if you want to reuse)");
  }
  console.log();

  const client = makeClient(account);

  // Skip create_standard if it already exists
  let stdCount = 0;
  try {
    stdCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_standard_count", args: [] }));
  } catch {}

  if (stdCount === 0) {
    console.log("Step 1: create_standard");
    await callWrite(client, "create_standard", [
      "Demo Protocol Specification",
      `${RAW}/README.md`,
      D_CHARTER,
      `${RAW}/package.json`,
      D_MANIFEST,
    ]);
  } else {
    console.log(`Step 1: skipped — standard already exists (count=${stdCount})`);
  }

  // Skip clauses already registered
  let clauseCount = 0;
  try {
    clauseCount = Number(await client.readContract({ address: CONTRACT, functionName: "get_clause_count", args: [] }));
  } catch {}

  const remaining = CLAUSES.slice(clauseCount);
  console.log(`\nStep 2: register ${remaining.length} clauses (${clauseCount} already done)`);
  for (const cl of remaining) {
    await callWrite(client, "register_initial_clause", [
      0,
      cl.id,
      cl.section,
      cl.normative,
      cl.text,
      `${RAW}/README.md`,
      D_CLAUSE,
    ]);
    console.log(`    §${cl.id} done`);
  }

  console.log("\n=== Seed complete ===");
  console.log(`Standard 0 — ${CLAUSES.length} clauses at v0.`);
  console.log("Visit https://specweave.vercel.app");
}

main().catch(e => { console.error("\nERROR:", e.message ?? e); process.exit(1); });
