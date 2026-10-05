# Production checkpoint — 2026-10-05 19:23 UTC

## Delivered boundary

The approved C1/eVOA/E33G integration is published to GitHub `main` and deployed.
Exact source and both public build IDs:
`ee7a5aeb9ac6c7f0db202762396a831ce0b47491`.

This closes the **first** release boundary, not the subsequent D1/D2 import.
The earlier HOLD/local-only checkpoints remain historical evidence and must not
be presented as the current release state.

- Exact-revision CI run `37356225675`: bot, Next/Vinext, Astro/React and
  backend/PostgreSQL jobs all SUCCESS, including browser/Lighthouse gates.
- Backend and bot active; production schema `a7e4c9d2f105`; analytics remains
  disabled. FX and YouTube timers active. No customer messages were sent for QA.
- Fresh exact-candidate backup, isolated restore and c8→a7→c8→a7 verification
  passed before production migration. Data/order/sequence invariants passed.
  This is not a claim of independently compared PostgreSQL ACL/RLS/functions.
- 658 immutable frontend artifact files passed full membership/byte-hash review.
  Manifest SHA256 `dd340bceab58e41a2860f88003d7a6aa95b46b969bbf41d9fc513be4962a3206`.
- Separate prepare, proxy, runtime, price and static activation gates passed.
  Backend/bot source and both static build IDs are exact, not inferred from a push.

## Real edge proof

Two ordinary baseline requests reached this origin with the actual edge-trace
client IP. A spoofed `CF-Connecting-IP` request received 403 and its own unique
nonce never appeared in the origin log during the full eight-second window.
An X-Forwarded-For/X-Real-IP probe returned 200, with the same actual client IP.
Four live probes plus one trace request are distinct from seven CI proxy fixtures.
No security setting, browser identity, allow-list or challenge bypass was used.
No IP, unrelated access logs, secrets or PII are included in this report.

## Catalog publication

Existing guarded publisher added only:

- `service:visa-extension:c1-extension` = 2,000,000 IDR.
- `service:visa-extension:voa-extension` = 850,000 IDR.

Existing C1 issuance remains 2,000,000 IDR. E33G remains 12/14 million IDR per
person. All prior catalog rows and historical orders are retained; write guards
exclude order/client tables. Indodax, Decimal formulas, nearest-$5 approximation,
freshness TTL and bounded-stale policy were not changed.

Two attempts safely aborted before any price commit: publication-version race,
then expired freshness. FX timer was restored after each attempt. The final
bounded window invoked **existing** `refresh_fx_snapshot(force=True)`, verified
the effective published non-manual snapshot and ≥50 seconds freshness, then
reviewed dry-run hash/version and applied the same two-SKU delta. The FX timer
was restored immediately. No check was weakened and no rate was invented.

At the actual public capture: catalog version 3, publication version 43818,
FX version 43816, `fresh`, `INDODAX_PUBLIC_ORDER_BOOK`, `usdtidr`, observed
19:23:05 UTC, fresh-until 19:24:05 UTC. These are time-stamped observations,
not a promise that this snapshot remains fresh indefinitely.

## Public verification

- `safrway.online/build-version.json` and `app.safrway.online/build-version.json`:
  HTTP 200, exact ee7 revision.
- RU C1, EN C1 extension and AR E33G: HTTP 200, H1/canonical present, no noindex.
- Canonical public catalog: HTTP 200, approved prices and fresh authoritative FX.
- Public YouTube cache: HTTP 200, 10 videos. Refresh service and timer enabled;
  key remains private. This does not attest key restrictions/rotation in Google.

Full actual browser evidence on the source: Astro 151 PASS, 0 FAIL, four existing
optional manual screenshot skips; React main 123 PASS/eight legitimate skips;
Life 15 PASS/no skips; VibeDiz independently reviewed scoped AR320 and four SPB
frames. Production smoke checks above do not relabel all pages as browser-tested
in production or claim actual external search-engine indexing.

## Retained recovery state

Private backup/proof/activation records remain at
`/var/backups/safr-bali-sync/sync-20261005T183341Z-mggj8ig8` (root-only).
Former runtime `61fb53569721711600ba513d1f56e42a90d07eb7` and prior immutable static
directories are retained. Additive a7 is retained on rollback; no production
database downgrade/drop or destructive data cleanup was executed.

Native/unrelated work, protected governance documents and visual originals were
not included in scoped release commits. D1/D2 now proceeds from this verified
integration boundary; it is not yet deployed at this checkpoint.
