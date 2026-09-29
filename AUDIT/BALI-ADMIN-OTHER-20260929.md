# Admin integration: other services and visa safety — 2026-09-29

Local-only checkpoint. No production or Git publication. Existing reminder implementation and unrelated dirty work preserved.

## Contracts

- LifeService kind other reuses existing data fields. Publication requires title; dates are optional; quantity is positive and retained. Price is an agreed total, never recalculated from quantity.
- Fixed/monthly supported; no end date suppresses expiry notifications. Client web/Mini App projections omit owner_details/internal_note. Create idempotency and update CAS unchanged.
- Bot reminder allowlist supports other with neutral RU/EN labels.
- Visa date_source visible to staff but not client projections (including mutation/replay responses). Event rendering distinguishes absent fields from explicit null date clearing.

## Migration and rollback

Only new migration: c8e3f7a1d502_add_other_life_services.py, down_revision b7d2e6a9c410. Sole Alembic head c8e3f7a1d502. Previous reminder migration not rewritten.

Expands ck_life_services_kind, ck_life_services_quantity, ck_life_services_publish_complete. Existing rows preserved. Downgrade locks life_services and refuses if any other record exists. Never delete, hide or reclassify records to make downgrade pass. Application rollback also needs compatible readers once other records exist.

PostgreSQL offline upgrade SQL generation PASS. Actual PostgreSQL 16.14 validation
now PASS: clean full 28-revision chain without stamp, all 11 reminder/other PG tests,
combined a9→b7→c8→b7→a9→b7→c8, used-state downgrade refusal, synthetic before/after
dump/restore equality, and the reviewed backup helper's exact schema/data/sequence
comparators. The temporary socket-only cluster is stopped; artifacts retained.
Fresh production backup + isolated restore proof is still required before live
migration. Publication and production deployment are not claimed.

## Tests

- Backend tests/test_life_service_other.py + tests/test_life_services.py + tests/test_life_service_other_postgres.py: 62 passed, 5 skipped (no isolated PostgreSQL test URL), 8.11s.
- Bot test_service_reminders.py: 4 tests OK.
- Focused visa lifecycle/notification safety: 11 passed.
- git diff --check: PASS.

No real messages, external browser, production DB or client 14 used for verification. Full frontend scope/evidence lives in the release workspace AUDIT/BALI-ADMIN-LOCAL-20260929.md.

## Release handoff

Frontend implementation commit: 4e8e83bac98461b1bbf8e218ecbc1e9fa44e5b4c.
Runtime baseline: f711d3ab216caa8e98df7ec38955392f5b5acc3e.
The explicit Founder push/deploy approval was confirmed in the Designer handoff.
The current package excludes public Astro/YouTube WIP, native artifacts and
unrelated dirty files. Service-expiry policy and onboarding must remain OFF.

Read-only production preflight confirmed the original runtime, schema
a9c28b017d60 and disabled policies. Subsequent SSH publication/server connections
timed out. The connected GitHub integration reports read-only access (push=false).
No release activation, service restart or live migration has occurred.

Reviewed backup worker SHA256:
80a0fe6a733596c121a47c153b14cf7920fc19007fb61688ccc9e58fdf1035d9.
Production worker and migration files must be staged outside the live checkout;
run preflight again and obtain a fresh passing restore proof before activation.
Stop/drain writers before any application rollback compatibility check. Keep
additive schema; refuse old readers if any other-kind records have been created.
