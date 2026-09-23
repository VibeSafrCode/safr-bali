# BALI-SERVICES-20260923 — combined services release

Status: LOCAL IMPLEMENTATION / RELEASE VERIFICATION PENDING.
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
- Founder requested only critical remaining tests: no repeat full-suite matrix.
  Required safety gates remain fresh backup/restore/migration proof and a short
  post-release version/health/route verification. Browser runtime unverified.

## Remaining release gates

Exact final tests, scoped commits, remote revision verification, fresh production
backup and isolated restore/upgrade-downgrade-upgrade proof, artifact digest,
schema upgrade, paired runtime/frontend activation, exact deployed revision,
health/auth-denial/route/FX checks. Never deploy new editor against old schema.
Retain previous artifacts/runtime for rollback; do not downgrade populated
rental columns. Pause writes to new rental records before any old-runtime rollback.

No unrelated paid-order auto-publication, referral, protected-document, native
or other feature direction is introduced by this sprint.
