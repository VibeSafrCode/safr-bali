# BALI-TASK-072 — Canonical price and FX system

Release state: `LOCAL_RELEASE_CANDIDATE` (production evidence pending).

## Outcome

- One versioned IDR price catalog for visas and services.
- One accepted FX snapshot/version for bot, public site, Admin and Mini App.
- Root-only Admin preview, publish, restore, live refresh and time-bounded manual
  override with audit and optimistic concurrency.
- Existing commercial history is immutable: new Order/VisaCase records bind a
  price/FX snapshot and later publications do not rewrite it.
- Legacy user-visible commercial copies were removed from bot/shared content and
  the public All Indonesia PDF; all surfaces consume `/api/catalog/pricing`.

## FX policy

- Official source: Indodax public `/api/pairs`, `/api/depth/usdtidr` and
  `/api/server_time` (milliseconds).
- Accepted ask: Decimal sell-depth VWAP for 2,000 USDT.
- Fresh/stale: 60 seconds / 15 minutes. After expiry exact IDR remains and
  derived USDT is unavailable.
- Rounding: IDR ÷ ask, `ROUND_HALF_UP` to 0.01 USDT; Admin USDT input rounds IDR
  upward to 1,000 IDR.
- Safety: 1 MiB payload, 5 minute clock skew, crossed/thin-book rejection,
  5% anomaly breaker, retries at 0/250/750 ms, root override maximum 24 hours.

## Local evidence

- Independent three-option architecture/security/data challenge: versioned
  PostgreSQL hybrid selected.
- Isolated PostgreSQL backup restore: six pricing tables and Alembic head
  verified.
- Migration upgrade → downgrade → upgrade: PASS.
- Official Indodax rehearsal: `LIVE`; 28 catalog items; FX/catalog version 1.
- Backend: 170 passed, 11 expected skips. Bot: 83 passed. Shared parity:
  10 passed. React unit/build contracts: 19 + 40 passed. Astro: 93 pages,
  0 diagnostics and 26/26 contracts.

Production backup, restore proof, migration, bootstrap, timer activation,
cutover, exact SHA and representative four-surface parity remain release gates.
