# BALI-SERVICES-20260923 — combined services release

Status: DEPLOYED / CRITICAL VERIFICATION PASS.
Founder explicitly authorized implementation, push and deployment on 2026-09-23.
Do not infer completion from this authorization.

## Scope and integration boundary

- Public insurance (LUMA, SafetyWing, individual quote) in Bali, Thailand, Nepal,
  UAE; not Russia. Reuse prepared BALI-INSURANCE-001 shared catalogue/routes.
- Housing type (guesthouse/hotel/apartment/villa); bike quantity positive integer.
- Fixed/monthly rental editor, no required end date for monthly; exact agreed
  price is not multiplied by quantity. Private owner contact remains staff-only.
- Existing monthly end dates and price units survive unrelated edits. Explicit
  switching to monthly clears expiry and selects monthly pricing; it never charges.
- Client housing/bike cards show type/quantity, price, dates or monthly mode.
- Admin With services filter consistent with registered-service permissions.
- VibeDis countdown, five-tab navigation and defensive support-response parsing.
- Left-aligned service panels/grids; lighter global background only.

Runtime baseline: bd6d7e7c08ff40eb4953bda6b7938b0da4ca2218.
Frontend baseline: 250ce557cb3a5962928440b4eaebf284afc173c7.
Keep the separate source boundaries: unrelated backend/proxy changes in the
frontend branch are NOT included in production runtime.
Preserve unrelated native work and local visual artifacts.

## Design and independent review

VibeDis approved housing/bike specification and background stops:
rgba(4,17,16,.62) → .22 at 42% → .22 at 65% → .52.
Glass surfaces, brightness(.68), modal scrims and responsive columns unchanged.
Approval is specification/source-only, not browser visual evidence.
No local browser or preview server launched.

Independent review found and addressed downgrade guard/write race (table lock
before guard), preservation of existing monthly dates/price units, and arrival
date display on monthly cards. Final recheck pending.
React checklist: native labelled controls, positive integer validation, no new
network polling, interval cleanup, stale filter response protection and no hidden
owner fields in client projection. Countdown interval only updates local dates.

## Local evidence (intermediate)

- React final unit 57 PASS; build + 40 contracts PASS.
- Astro check: zero errors/warnings/hints; build 103 pages; 54 PASS / 1 SKIP.
  Actual bot renderer check skipped because its Python environment is unavailable.
- Backend specialist: 279 PASS + 19 subtests; 18 PostgreSQL-only cases skipped
  in ordinary suite. Isolated PostgreSQL migration/constraints proof: 5 PASS.
- Backend additive migration e9b3d7a5c201 → f2c8a4d6e901 preserves old values.
  Local U-D-U is not a production backup/restore verification.
- Production SSH recovered: baseline runtime/frontend unchanged, backend and
  bot active, backend liveness OK, clean tracked runtime. No mutation yet.
- Runtime implementation committed and pushed: b67c078bdab6e66f3d3afbd8cc289d36adb03f8a.
- Frontend committed and pushed: 5c0a47ca59931f552baac53ce5ce1eef1edd11db.
- Runtime CI 35836314539: Backend/PostgreSQL and bot jobs PASS; remaining
  historical frontend matrix cancelled following Founder's reduced-test request.
  Historical reference job failed; that frontend tree is not deployed.
  Actual frontend uses the separate commit above and passed local checks.
- Actual frontend commit intentionally skips a repeat full CI run per Founder.
  This is not an all-green CI or browser/visual acceptance claim.
- Founder requested only critical remaining tests: no repeat full-suite matrix.
  Required safety gates remain fresh backup/restore/migration proof and a short
  post-release version/health/route verification. Browser runtime unverified.

## Production backup gate — PASS

Read-only preflight confirmed effective runtime environment, working directory,
TCP/socket cluster identity and e9 schema. Fresh private backup and isolated
restore U-D-U completed successfully at 2026-09-23T08:26Z. Existing tables,
life-service values, owners and sequence state preserved on the restore clone.
Production remained e9 during this gate. Clone and backup retained privately.
Worker SHA256: 831ee77ba14c2e1d788154534f23d89c1b06441f8679c8279676c715e3586e4b.
Migration SHA256: a7d1415740f19872a984145a2fac46aa75c0ace8e00a901bf9660a3964455ec8.

First activation attempt rejected macOS archive metadata before changing source,
schema or live links. Repacked using COPYFILE_DISABLE=1 and --no-xattrs; archive
path/type/metadata guard passed locally. Clean artifact SHA256:

- Astro: 59ef55930e3bc11af340ad39fb3865599139638eeb289dffafa332059ef85b2a.
- React: f16ede0bce1e765deafc5c2e87735a77d709858f2d64117f8828e547ed34b0fd.

## Activation and post-release evidence

- Runtime deployed: b67c078bdab6e66f3d3afbd8cc289d36adb03f8a, exact clean checkout.
- Frontend source: 5c0a47ca59931f552baac53ce5ce1eef1edd11db.
  Immutable release: services-5c0a47c; public build_id: 5c0a47c.
- Production schema: f2c8a4d6e901; backend health/readiness PASS.
- Unauthenticated life-service endpoints deny access (401/403).
- Public HTTPS: build-version, Bali/UAE insurance and account/life all HTTP 200;
  insurance responses include LUMA and SafetyWing. Origin home/visa/Admin PASS.
- Bot remains active and unchanged; no client messages or test customer rows.
- FX postcheck caught a release permission regression: private backup umask had
  propagated into Git checkout, making six modified Python sources 0600.
  Restored those exact files to their original 0644 modes using the verified
  runtime archive; uid/gid matched, config.py stayed 0640 and .env untouched.
  Standard FX service then Result=success/ExecMainStatus=0. Public projection
  confirmed fresh version 27294, observed 2026-09-23T08:42:27.559393Z.
- Release script corrected to use 022 for Git checkout only, including rollback;
  backup/log handling remains private. The invariant is recorded in AGENTS.md.

Rollback artifacts and runtime baseline are retained. Do not downgrade populated
rental columns; application rollback keeps additive schema/data. Pause writes to
new rental records before an old-runtime rollback. The private restore clone and
backup remain; nothing was deleted.

## Residual verification limits

No local browser/visual run or real customer login was performed. VibeDis
approved the specification, not a production visual inspection. Reference-only
Next/Vinext export was not used for deployment and remains unverified for this
candidate. Full frontend CI was intentionally not repeated after the Founder
requested critical checks only. These omissions are not labelled PASS.

No unrelated paid-order auto-publication, referral, protected-document, native
or other feature direction is introduced by this sprint.
