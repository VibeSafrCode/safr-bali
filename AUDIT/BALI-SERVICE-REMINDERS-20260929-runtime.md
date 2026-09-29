# Service expiry reminders — local backend and bot verification

Date: 2026-09-29. Scope: local implementation and synthetic verification only.
This record is not evidence of publication, deployment, activation, or a real
Telegram delivery. No production connection or customer message was made.

## Implemented contract

- Global policy defaults to disabled when no active setting exists. A configured
  root administrator can read, preview, save, and restore versioned policies;
  writes require the existing authenticated session, trusted origin, and CSRF
  token. Saves compare `expected_version` and append an administrative audit.
- Policy defaults use total service duration: more than 100 days receives
  40/30/15/7/3/2/1; at most 100 days receives 15/7/3/2/1. Monthly rentals always
  use the short schedule. Offsets, threshold, and enabled state are editable.
- Scheduling uses calendar dates in `Asia/Makassar`, the exact current offset,
  confirmed visa stay dates, and published Life services. A service must have
  started. Open-ended monthly rentals are skipped; no end date is invented.
- Materialization runs only from the service-token-protected claim endpoint,
  with independent bounded source windows and exclusion of existing ledger keys.
  Reads and synthetic previews do not enqueue messages.
- Deduplication binds source, end date, offset, and recipient; changing a policy
  version cannot replay the same threshold. A changed end date gets a different
  key. Claim rechecks publication, current dates, schedule, consent, owner, and
  client state. Consent or policy disable suppresses pending deliveries.
- Each delivery has exactly one Visa/Life source FK. Delivery payloads explicitly
  select public fields. Internal notes and owner details are excluded.
- Claim leases expire into `UNKNOWN`; there is no automatic resend. The bot sends
  once, retries only the idempotent acknowledgement, and treats ambiguous send
  exceptions as `UNKNOWN`. Client routes are `#/visas`, `#/life`, and `#/support`.
- Life owner projections provide saved consent, availability, and a reason:
  `disabled`, `no_end_date`, `not_current`, or null. Legacy editors preserve
  saved opt-out when the additive field is absent from their request.

## Completed verification

All executable checks below used isolated Python virtual environments and
synthetic fixtures; Telegram sending was mocked.

| Check | Result |
| --- | --- |
| Backend reminder scheduling, API, and Life-service regression modules | 66 passed |
| Existing visa staff/reminders and administrative safety modules | 14 passed |
| Bot reminder adapter module | 4 passed |
| Git whitespace validation | Passed |

The 66-test run covers the exact 100/101-day boundary; 10-day preview applicability;
monthly preview metadata; missing end/start dates; Bali midnight; bounded-window
progress; hidden, owner-changed, opted-out, and date-changed sources; policy changes;
deduplication; stale leases; UNKNOWN suppression; settlement replay; single-source
constraints; root authorization; CSRF/origin; service-token gate; owner isolation;
legacy opt-out preservation; CAS conflict; policy restore; and saved version history.
The bot tests cover Russian/English text, all four service kinds, canonical links,
allowlisted payload fields, invalid payload refusal, timeout, and ack-only retry.

Existing `datetime.utcnow()` deprecation warnings remain. An initial test collection
failure was corrected by importing the shared API fixture through the `tests`
package. The final backend run passed after matching production's disabled autoflush.

## PostgreSQL gate — completed 2026-09-29

Six opt-in checks were added in `tests/test_service_reminders_postgres.py`, guarded
by `BALI_REMINDER_PG_TEST_URL`. The URL must identify an isolated temporary Unix
socket; tests assert no TCP listener and generate dedicated synthetic databases.

They cover pristine upgrade → downgrade → upgrade; downgrade refusal with used
ledger, consent, or policy history; concurrent claim, settlement replay, expired
lease handling; and concurrent policy CAS. The baseline is current metadata minus
this additive migration, stamped at `a9c28b017d60`; this does not validate the full
historical migration chain.

The earlier sandbox initialization restriction was resolved using a scoped,
headless PostgreSQL 16.14 cluster bound only to a private Unix socket. All six
reminder checks and five other-service checks passed (11 total). Separately, all
28 historical migrations ran on an empty database without stamping. Combined
b7/c8 upgrade → downgrade → upgrade and used-state downgrade refusal passed.

Synthetic before/after backup restores preserve row fingerprints, original table
schema, constraints, indexes, ownership and sequences. The reviewed production
backup helper was also exercised over all six isolated transitions. PostgreSQL
TEMP LIKE reparsing normalizes equivalent CHECK cast representations without
ignoring predicates. The exact new sequence alone is excluded after upgrade;
original sequence states are preserved. Four comparator tests, including eleven
negative schema mutations, passed. The owned temporary cluster was stopped and
its artifacts retained. No production migration or real delivery occurred.

Migration `b7d2e6a9c410` follows `a9c28b017d60`, adds Life consent and the delivery
ledger/indexes, and defaults to no active reminder policy. Its downgrade is designed
to require an exclusive PostgreSQL transaction and refuse existing ledger, consent,
or policy history. A fresh production backup and isolated restore of that backup
remain required before production migration. Application rollback should retain
the additive schema after use.

## Remaining decisions and release boundary

- Open-ended monthly renewal behavior awaits a product decision; the implementation
  currently skips records without an explicit end date.
- Frontend/design evidence belongs to the primary integration handoff and is not
  asserted by this backend/bot record.
- Real Telegram delivery, the deployment database migration, production revision,
  operational rollback verification, and deliberate policy activation remain
  unverified and outside this local test run.
- Disabling policy suppresses pending items. A delivery already claimed may be
  in flight; Telegram cannot be recalled by a subsequent policy or consent change.
- UNKNOWN outcomes deliberately prefer avoiding duplicate customer messages.
  Do not automatically reset UNKNOWN rows for retry.
