# BALI-TASK-072 — Canonical price and FX system

Release state: `DEPLOYED / VERIFIED`.

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

## Verification evidence

- Independent three-option architecture/security/data challenge: versioned
  PostgreSQL hybrid selected.
- Isolated PostgreSQL backup restore: six pricing tables and Alembic head
  verified.
- Migration upgrade → downgrade → upgrade: PASS.
- Official Indodax rehearsal: `LIVE`; 28 catalog items; FX/catalog version 1.
- Backend: 170 passed, 11 expected skips. Bot: 83 passed. Shared parity:
  10 passed. React unit/build contracts: 19 + 40 passed. Astro: 93 pages,
  0 diagnostics and 26/26 contracts.

- GitHub branch and production checkout: `97b13ad9a6938e0e0e9a59688bd308bff8dd0654`;
  application artifacts: `fe5cf2cd73c1fc196148d0612c56ad479733d509`.
- Fresh production PostgreSQL backup, checksum and isolated restore PASS;
  isolated `c6a4e8b2d915 → d7a2f9c4e816 → c6a4e8b2d915 → d7a2f9c4e816` PASS.
- Production schema: `d7a2f9c4e816`; one-time root publication: 28 items.
- `safr-bali-pricing-fx.timer` active; refresh result `success`; accepted FX is
  LIVE/fresh from `INDODAX_PUBLIC_ORDER_BOOK`.
- Canonical enforcement is enabled. Backend, bot, public site, Admin and Mini
  App resolve the same projection/catalog/FX versions; representative E33G,
  housing and All Indonesia values were verified without customer writes or
  messages.
