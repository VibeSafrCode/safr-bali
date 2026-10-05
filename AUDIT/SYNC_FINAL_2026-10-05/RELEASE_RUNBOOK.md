# Local release candidate — gates and rollback

Current status: BOTH AUTHORIZED BOUNDARIES DEPLOYED AND VERIFIED. Runtime and
both frontend build IDs are `fe3d9570737f1684850ddb48d624c86476e8a9c7`, catalog4.
See `PRODUCTION_RELEASE_fe3d957.md` for actual receipts and rollback references.
The local candidate and first-release instructions below remain historical;
do not rerun their migration/proxy operations on the current runtime.

## D1/D2 release path — executed

Exact-revision CI passed before activation. D1 adds no migration and no Nginx
change. A new private backup/isolated restore on a7 passed, then backend/source,
guarded D1-only catalog publication, paired immutable statics, six actual public
RU/EN bot-linked route checks and finally bot activation. The prior ee7 source,
static targets and private backup are retained; database rollback is not a
source/static rollback step. Admin catalog restore remains a separate audited
publication. Preserve historical customer/case data and current additive schema.

Publication wrapper runs from the backend working directory so existing .env
resolution works. Its actual delta is seven changed initial amounts plus one
already-correct 9m D1 standard, two new2.5m extension rows and four CONTACT
transitions. Do not force an eighth change. Dry/apply hash/version and live FX
checks remain mandatory. A bounded one-shot restores the FX timer in finally
and ExecStopPost; this is not a TTL/formula change. Use TimeoutStartSec for a
oneshot (RuntimeMaxSec alone does not bound its activation).

Freshness-gated verification may need a normal existing FX-service refresh;
never relax freshness, invent a rate or modify stale deadlines for a PASS.
The final verified public request path used ordinary curl over TLS through
Cloudflare, no proxy/redirect/challenge bypass, explicit HTTP200 and fixed
hostnames. Local TLS timeouts and a Python HTTP-client error are retained as
failed checks, not relabeled as PASS. Final server-edge proof passed.

## Superseding release authorization (2026-10-05)

The Founder subsequently authorized scoped push and deployment of this candidate,
followed by the D1/D2 packet. The preceding status records the historical local
checkpoint only; it is not evidence of publication. Actual commit, PostgreSQL
proof, proxy boundary, activation and live verification must be recorded separately.
Production preflight found runtime `61fb53569721711600ba513d1f56e42a90d07eb7`
and schema `c8e3f7a1d502`. The assembled candidate preserves the authoritative
runtime and backports approved security/readiness/Points protections; source-review
passed. All 17 VibeDiz production changes match the integrated source hashes.
The original canonical checkout remains OS-restricted and untouched; the established
preserved copies and a separate assembly checkout are used without bypassing that
restriction. Do not claim production release before the following gates pass.

## Sources and preservation

Candidate `SYNC-FINAL-2026-10-05-LOCAL`; frontend baseline `64fb3429cd435af8da9867f0e30a5f03044b95e2`, authoritative runtime baseline `a44228303714237cf30af4476868b834b480bd45`.

Use the preserved working copies, exact path manifests and hashes. Do not bypass the canonical workspace's OS access restriction. Preserve four protected governance documents, native WIP, local design/source assets and unrelated changes. Do not commit all dirty files. Do not treat current HEAD as the new release revision.

The frontend copy has a scoped backend mirror, not the full authoritative life/onboarding/reminder runtime. Assemble frontend from its workspace and backend/bot from authoritative runtime; reconcile into the approved Git workflow explicitly. Do not overwrite the runtime with the mirror.

## Local reproducible critical checks

Use installed project Node and Python dependencies; do not install/open a personal browser.

From astro-site:
```sh
node --import ../react-app/node_modules/tsx/dist/loader.mjs --test tests/registry-publication.test.mjs tests/registry-public-output.test.mjs tests/service-registry-parity.test.mjs tests/registry-price-bindings.test.mjs tests/public-selector-policy.test.mjs
node node_modules/astro/bin/astro.mjs check
node node_modules/astro/bin/astro.mjs build --config scripts/registry-preview.config.mjs
```

The review config disables the YouTube updater and avoids production pricing fetch. Build preserves the server-only raw imports and existing strict same-origin CSP.

From shared:
```sh
node scripts/validate-service-registry.mjs
node --test tests/next-stage-drafts.test.mjs
```

From react-app:
```sh
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
```

Backend critical tests must run from an empty temporary cwd, synthetic SQLite and environment, explicit PYTHONPATH to authoritative backend; never load .env or start real bot. Evidence includes analytics consent/role/privacy, backup/restore/isolated migration U-D-U and preview GET-only/data visibility checks.

Browser scripts `astro-site/tests/registry-public-browser.mjs` and `react-app/tests/client-account-preview-browser.mjs` own/close one isolated headless browser/server, mock APIs, block external requests and use synthetic data. Specify the known local headless executable explicitly. An error is FAIL, not PASS. No customer or consent/analytics production write is permitted by local QA.

## Authorized release sequence, after exact-revision gates

1. Reconcile exact WIP through OS-authorized checkouts and the established preserved frontend/runtime copies; never bypass the restricted canonical workspace. Review a scoped integration diff and record frontend/runtime sources, final commit and immutable artifact SHA. Run CI appropriate to that exact revision.
2. Perform production database backup using the established secured runbook. Restore to isolated PostgreSQL and prove data counts/invariants. Exercise full current migration chain through upgrade → downgrade → upgrade in the isolated database. Save sanitized evidence without dumps, DSNs or client records.
3. Analytics `a7e4c9d2f105` follows `c8e3f7a1d502`. Ensure actual runtime head and predecessor files, not only five mirrored predecessors. A used analytics downgrade must refuse destruction; rollback does not silently erase events.
4. Prepare full catalog draft through existing owner mechanism with current expected publication version. Preview approved 2 extension options (or separately intended 10 operations). Verify additive identities, catalog/FX parity and totals. Preserve previous full published snapshot. Publish only through audited owner path; never seed/reset a live catalog.
5. Keep analytics disabled initially. Migration PASS is not consent-policy approval. Validate current privacy notice/UI, source/service allowlists, explicit owner/technical grants and DNT/GPC/receipt behavior before activating.
6. Reconcile `deploy/nginx/client-account-preview.proposal.conf` into actual deployed Nginx. Dedicated preview path allows only same-origin framing, no-store/noindex; preserve stricter policies elsewhere. Remove conflicting X-Frame-Options DENY on this dedicated response only if present; do not weaken the whole site. Run Nginx syntax validation before activation.
7. Deploy immutable frontend/backend/bot artifacts; preserve previous known-good artifact and route/schema information. Preserve explicit FX reader source permissions and secret modes; do not propagate private-backup umask into checkout.
8. Verify **actual deployed revision**, health/readiness and schema; 140 approved locale routes/canonical/hreflang/sitemap plus representative RU/EN/AR rendering. Verify service CTA attribution, root preview GET-only/ordinary-client denial and cache headers.
9. Verify existing FX source/freshness TTL/version; representative bot/site/Mini App/Admin amounts must use the same published catalog/FX projection. No silent stale USD, no independent price copies. Historic order snapshots must remain unchanged. A synthetic rate in QA is not the current production rate.
10. Record exact release/rollback evidence, residual gates and a separate approval boundary for client announcements. Do not broadcast customers as an implicit deployment step.

## Rollback

Before any activation, preserve previous full catalog publication and artifacts. Prefer existing audited catalog rollback to the previous full snapshot; never recalculate historical order prices.

If preview is faulty, remove its entry link/frontend route/router and dedicated Nginx stanza as one bounded rollback, leaving the ordinary cabinet/auth untouched. It has no schema migration.

If analytics is faulty, owner-disable ingestion, restore previous frontend/backend artifacts consistent with the current schema, preserve additive tables/history. Do not drop a populated table or bypass migration guard.

Draft15/Partners/untranslated pages remain outside public manifest: do not enable/index them as part of current14×10 rollback/release.
