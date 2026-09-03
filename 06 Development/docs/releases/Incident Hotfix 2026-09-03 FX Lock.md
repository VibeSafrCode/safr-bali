# Incident hotfix — 2026-09-03 FX lock

Release state: `DEPLOYED / VERIFIED`.

## Impact and cause

- Static pages continued to return `200`, but the backend API stopped responding,
  making authentication and the calculator unavailable.
- A calculator request refreshed canonical FX inside its database transaction,
  retained the transaction advisory lock, and then awaited other market providers.
- A second async request synchronously waited for that lock and blocked the single
  Uvicorn event loop. Systemd still saw a live process, so it did not restart it.

## Recovery and permanent controls

- The stuck FX job and backend were stopped through systemd; PostgreSQL rolled
  back the abandoned transactions and released their locks.
- Calculator requests now consume only the already-published canonical FX
  version. Only the bounded background job refreshes canonical FX.
- Automatic refresh uses `pg_try_advisory_xact_lock` and returns immediately when
  another writer owns the lock, instead of blocking an async caller.
- Exchange-rate cache reuse now requires the exact current canonical FX snapshot;
  stale-but-allowed FX is explicitly marked stale and expired FX fails closed.
- The FX oneshot has a 30-second start timeout and 10-second stop timeout.

## Evidence

- Code/release commit: `d9f23291dffe00b40c6b5ef350664ad82b33e0f3`.
- Targeted catalog/calculator/API regression: `27 passed`.
- Full backend regression: `171 passed`, `11 skipped`; the only failure was the
  environment-dependent local PostgreSQL connectivity smoke. Production database
  health passed after release.
- Production checkout matches the release commit; backend and database health
  pass; calculator and auth routes respond; 20 parallel health and 20 parallel
  catalog requests all returned `200`.
- FX timer completed successfully after deployment and published fresh LIVE FX
  version/publication `4042`. PostgreSQL showed zero advisory waiters and zero
  idle-in-transaction sessions older than ten seconds.
- No migration, customer-data mutation or customer message was involved.
