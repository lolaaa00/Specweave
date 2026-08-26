# SpecWeave — Handoff Document

_Last updated: 2026-08-25_

---

## Deployed Contract

| Field | Value |
|---|---|
| Network | StudioNet (chain ID 61999) |
| RPC | `https://studio.genlayer.com/api` |
| Contract Address | `0x28D728CB4015Bc5248e7A144C7f3Bd9053ca3b1C` |
| Deploy TX | `0xe3026985bd7ab03b5ea12c11b396555bb7cb9d275054bb8573adbb8ee38a68a1` |
| Source | `contracts/specweave.py` |

### On-Chain State (seeded)

- **Standards:** 2 (IDs 0 and 1; standard 0 holds all demo clauses)
- **Clauses:** 12 active clauses under standard 0
- **Releases:** 0 proposed

### Seed Transaction Hashes

| Clause | TX |
|---|---|
| create_standard | `0x3f6c6d970a8ccc2afef397fdeef87f053769507bef93c437b902072d50995f94` |
| §1-1 | `0x6cf9dfd759aa6355ed6114c49602cb838245825d4603e3ac1cc85ec2d98bec16` |
| §1-2 | `0x120f971029e240d7c1ce0c701cc00c92ea73e9a4990d85a7fda4541f09fa6322` |
| §2-1 | `0xe5a965eac454ceaefefd7009178666e9cfb75b09ba823d74306690f30660137a` |
| §2-2 | `0x3f2ee4ce9fdc1867c9f16a433d9771f743e2b406e62ca1d2ae83f8e228bc25a8` |
| §3-1 | `0xe812f0087e187f3cb8bc93b0fb02bf2339dc5b8b349eeef4829f35c1fa9a6f76` |
| §3-2 | `0x4f5dfce7768c072e52b1d6c622a3ba56298efa10938f8b219d7e2f202ad204af` |
| §4-1 | `0x6d40c967db265147c6d410d770060727059c3e702a1d134e8ee335d52771a02d` |
| §4-2 | `0x898f349e900708ce5c95b4b86d8e9fb0e35ea5943aae25a84e54b282a2399b98` |
| §5-1 | `0xbf18a0ee140b066026fe1008be688c54bb7c4f418a27dcc0f0165a839caefd59` |
| §7-1 | `0x8ba7e5e975ca271787af5728e64afb21732659d83fa03efe6c0c55448517913c` |
| §9-1 | `0x8954368e7b94a51dff9ec5f490cf0ee76d78cc79dcbe1ab42c0e97901854c4fd` |
| §10-1 | `0xd9759e4b0bce0fceeb6b66f000e0455ea9a451c6b36f3374fed52475da30dc66` |

---

## Architecture

```
contracts/specweave.py          GenLayer Intelligent Contract
apps/web/                       Next.js 16 frontend (no backend)
  app/                          Page routes
  components/                   UI components
  lib/genlayer/                 Contract client, schema, execution parser
  lib/wallet-provider.tsx       EIP-1193 injected wallet context
scripts/
  verify-schema.mjs             RPC schema verification
  seed-demo.mjs                 Demo data seeding
tests/direct/                   43 pytest contract unit tests
```

**No separate backend.** The frontend talks directly to the GenLayer RPC (`https://studio.genlayer.com/api`) via `genlayer-js 1.1.8`.

---

## Frontend Config

`.env.local` (not committed):
```
NEXT_PUBLIC_GENLAYER_CHAIN=studionet
NEXT_PUBLIC_GENLAYER_ENDPOINT=https://studio.genlayer.com/api
NEXT_PUBLIC_SPECWEAVE_CONTRACT=0xC5d26b02f6829244031771c39dbb5cd15162b52A
NEXT_PUBLIC_SPECWEAVE_DATA=live
```

Set `NEXT_PUBLIC_SPECWEAVE_CONTRACT` in Vercel environment variables for production.

---

## Test Status

| Suite | Status |
|---|---|
| `tests/direct/test_specweave.py` (43 tests) | ✓ All pass |
| `apps/web` vitest (16 tests) | ✓ All pass |
| TypeScript typecheck | ✓ Clean |
| Schema verification | ✓ All 18 methods present |

Run contract tests:
```bash
cd tests/direct && python -m pytest -p no:gltest -v
```

Run frontend tests:
```bash
cd apps/web && npm test
```

---

## Deployment

### Vercel (frontend)

1. Import `apps/web/` into Vercel
2. Set environment variable: `NEXT_PUBLIC_SPECWEAVE_CONTRACT=0xC5d26b02f6829244031771c39dbb5cd15162b52A`
3. `vercel.json` is present and pre-configured

### Contract redeployment

```bash
genlayer deploy --contract contracts/specweave.py --rpc https://studio.genlayer.com/api
CONTRACT=<new_address> node scripts/verify-schema.mjs
CONTRACT=<new_address> node scripts/seed-demo.mjs
```

---

## Key Implementation Notes

### Contract (`contracts/specweave.py`)
- `from __future__ import annotations` **must not** be present — GenVM schema reader introspects type annotations at runtime; making them strings breaks `gen_getContractSchema`.
- `gl.message.sender_address` returns an `Address` object, not `str`. Always wrap with `str()` before storing or comparing.
- `gl.message.timestamp` **does not exist**. Use `int(time.time())` for Unix timestamps (deterministic per transaction in GenVM).
- `gl.message` fields: `sender_address`, `origin_address`, `contract_address`, `value`, `chain_id`. Timestamp via stdlib.
- `propose_release` accepts `changed_clause_ids: list` (not a JSON string) — the contract JSON-encodes it internally for storage.
- Consensus decision validation (`_post_consensus_gate`) fails closed: any malformed JSON or invalid enum causes the release to revert to `REVISION_REQUIRED`.
- VecDB is used for semantic overlap retrieval only, not as truth. The final decision is from consensus.
- Clause IDs with dot notation (`1.1`) should not be passed via the CLI `--args` flag as the parser tries to BigInt them. Use hyphen format (`1-1`) in the seed script.
- CLI array args: pass `[7]` as a single arg (not as individual elements) to pass a list to a contract method.
- CLI syntax: `genlayer write <contractAddress> <method> --args <arg1> <arg2>...` (positional args before flags).

### Frontend (`apps/web/`)
- No private keys anywhere — wallet is injected via `window.ethereum` (EIP-1193).
- Transaction success requires checking `execution_result === "SUCCESS"` in the leader receipt, not just TX finality.
- All contract reads return `DataResult<T>` with typed error reasons; the UI gates on `result.ok`.

---

## Routes

| Route | Description |
|---|---|
| `/` | Standard reader (normative document view) |
| `/clauses` | Clause table with filter |
| `/releases/new` | Release proposal desk |
| `/releases/[id]/diff` | Semantic diff with AI decisions |
| `/releases/[id]/conflicts` | Conflict matrix |
| `/graph` | Supersession graph |
| `/versions` | RFC-style version ledger |
| `/canonical` | Machine-readable canonical receipt |
