# BALI-LIFE-001 runtime release — 2026-09-22

Status: candidate locally verified; not activated. Founder authorized scoped
implementation, Git publication and deployment following VibeDis handoff.

## Exact boundary

Base: `7283caceb7862ee8bc65637306fcfd87761ebd32`, verified clean in production.
Frontend is a separate integration based on `7c23c7592b2d06c7181e79227a60de8aaa8f7faf`.
Do not deploy that frontend branch's unrelated/unactivated backend or proxy code.
This runtime changes only manual life services and registered-service indicators;
bot delivery, pricing, approved visa text and historical prices remain unchanged.
CI frontend toolchain mirrors the already validated Node 24.19.0 / official
pnpm action pin from the frontend release branch; no gates are weakened.

## Behavior

Root Admin creates housing/bike/insurance drafts for existing active clients,
publishes, hides or archives with optimistic versions and actor-bound idempotency.
Clients see only their own published records through web or signed Mini App
sessions. Staff-only owner details and notes are excluded by explicit projection.
Prices are exact decimal strings with explicit currency and period; no FX or
historic order-price mutation occurs. No customer messages are sent.
Registered-service marks include saved PUBLISHED/HIDDEN life services only for
root Admin; managers do not receive this independent service information.

## Evidence before publication

- Exact-runtime full backend: 259 PASS and 19 subtests; 13 PostgreSQL cases
  passed separately, including idempotency, races and private projections.
- Isolated U-D-U plus dump/restore: PASS; 42 existing data tables unchanged.
- Independent static API/security/data review: no observed P0/P1 blockers.
- Migration: `d7a2f9c4e816` → `e9b3d7a5c201`, adds only `life_services`.
- Migration SHA256: `92efcd9a382a35c0722525ebc581869b76d0edd326b02f7e3a7a79e3806f4c51`.
- Backup worker synthetic tests, execution guard and process cancellation: PASS.
- Server read-only preflight: service working directory/environment mapping,
  runtime TCP vs peer DB/postmaster identity, clean base and preserved FX config
  `0640 root:www-data` all PASS.
- Fresh production backup/isolated restore and U-D-U: PASS, all 42 original
  tables equal through restore/upgrade/downgrade/upgrade; checksums verified.
  Live schema remains d7a2f9c4e816 at this checkpoint. Clone is private and retained.
- GitHub run 35742892059 at runtime 61a05ce: backend/PostgreSQL and bot PASS.
  Two historical unused-frontend CI failures were traced to missing public build
  env and stale pricing fixture/dialog locators; repaired from the existing
  frontend baseline without product-code changes. Repeat CI pending.
- Local bot dependency installation timed out; bot PASS above is GitHub evidence.

## Release / rollback

Run reviewed backup verification before production migration; retain root-only
dump, runtime/env archives, checksum and isolated restore proof. Publish exact
runtime/frontend commits and require green relevant gates before activation.
Apply exact migration, restart backend only (bot unchanged), then activate the
paired immutable frontend artifacts. Check schema/health/auth denial and live
FX freshness. Preserve config file permissions and existing secrets unchanged.

Rollback runtime to the base above, frontend to `visa-client-69959204be20`.
Retain the additive table and its data during application rollback. Schema
downgrade drops new client records and is NOT the routine production rollback.
No deploy, live login/Telegram-device check or customer-data edit is claimed yet.
