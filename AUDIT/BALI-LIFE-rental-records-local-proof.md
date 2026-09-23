# Rental records: local backend implementation and proof

Date: 2026-09-23. Source base: `bd6d7e7c08ff40eb4953bda6b7938b0da4ca2218` in `bali-runtime-workspace`.

This is local implementation evidence, **not a release, production migration, backup, or deployment claim**. No browser was run. No commit or push was made by the backend specialist. The pre-existing dirty `AUDIT/BALI-LIFE-001-runtime-release.md` was not edited.

## API contract

Existing life-service endpoints and response envelopes remain unchanged. The three additive fields appear in both authorized staff and own-client web/mini-app projections:

| Field | Contract and legacy default |
| --- | --- |
| `housing_type` | `guesthouse`, `hotel`, `apartment`, `villa`, or null; only housing may have a non-null value. Legacy/default null. |
| `rental_mode` | `fixed` or `monthly`; insurance must be fixed. Legacy/default fixed. |
| `quantity` | Strict JSON integer, 1 through 2147483647. Only bikes may have quantity other than 1. Legacy/default 1. |

Published fixed rentals require title, start date, and end date. Published monthly rentals require title and start date; end date is optional and, when present, must not precede start date. No timestamp or expiry is invented. Insurance still requires title and end date. Partial drafts remain valid; no housing type is retroactively required for existing housing records.

The backend does not multiply price by quantity, perform currency conversion, reinterpret `price_unit`, or change payment/order state. The stored decimal amount remains the entered total. Monthly records may preserve an existing price unit and optional end date; the frontend contract is to preserve these on unrelated saves, while an explicit rental-mode change may deliberately select monthly pricing and clear the date.

`owner_details` and `internal_note` remain staff-only, excluded from client projections and audit content. `public_contact` remains a separate, explicitly public field; nothing copies private owner data into it. Existing real-root identity, session, CSRF, and client ownership checks are unchanged.

Create idempotency retains the pre-migration fingerprint when new fields have legacy defaults; material new details participate in the fingerprint. Actor/client binding remains intact. PUT still uses optimistic `expected_version`. Omitted additive fields in legacy snapshots preserve stored rental metadata; an incompatible merged snapshot fails closed with a conflict rather than erasing metadata.

## Registered-service filter

`GET /api/web/admin/users` and `GET /api/web/admin/clients` accept `has_services=true|false`. `no_services=true` remains the negative compatibility alias; combining it with `has_services=true` returns 422. Filtering happens before pagination and shares the badge predicates:

- Visa: PUBLISHED/HIDDEN and neither service nor lifecycle cancelled; an expired but registered visa still counts.
- Life service: PUBLISHED/HIDDEN; DRAFT and ARCHIVED do not count. An optional/expired rental end date does not turn a registered record into a draft.
- Order: paid, not cancelled, and no cancellation timestamp. An unpaid request alone does not count.
- Visa managers remain restricted to their authorized visa cases. Life services, unrelated cases, and orders do not leak through either the badge or positive/negative filter.

## Migration requirement and rollback boundary

The inspected starting head was `e9b3d7a5c201`. New single head `f2c8a4d6e901` adds the three columns and their checks, and extends the publication check for monthly rentals. Existing columns, rows, ownership, dates, prices, private contacts, and create fingerprints are not rewritten. Defaults are fixed / 1 / null.

Apply the migration before activating application code that queries the new columns. This packet does not authorize or claim production execution; production backup/restore/release evidence remains the primary conversation's responsibility.

Downgrade obtains a transaction-scoped `ACCESS EXCLUSIVE` table lock **before** checking for new metadata. It refuses to proceed if any housing type, monthly mode, or non-default quantity is present. This prevents both silent metadata loss and the check/write race. Never invent an end date to make rollback pass. Prefer retaining the additive schema for an application rollback; deliberate schema rollback after real use needs explicit data-preservation/reconciliation planning. The lock is intentionally strong and may wait for writers; an operator should use bounded lock/statement timeouts during any reviewed migration operation.

## Non-browser verification

Working directory for the commands below: `bali-runtime-workspace/06 Development/backend`. Interpreter used: `$TEST_PYTHON` (existing local Python 3.12 test environment). Tokens below are synthetic test values, not production credentials.

Focused API/schema/replay/privacy/filter checks:

```sh
DATABASE_URL='sqlite:///:memory:' SERVICE_API_TOKEN=test-service ADMIN_API_TOKEN=test-admin \
  "$TEST_PYTHON" -m pytest \
  tests/test_life_services.py tests/test_registered_services.py -q
```

Result: **63 passed**.

Final complete ordinary backend run:

```sh
DATABASE_URL='sqlite:///:memory:' SERVICE_API_TOKEN=test-service ADMIN_API_TOKEN=test-admin \
  "$TEST_PYTHON" -m pytest -q --disable-warnings
```

Result: **279 passed, 18 skipped, 19 subtests passed**; 3921 existing-style datetime deprecation warnings. The 18 skips are PostgreSQL-gated tests without `SAFR_TEST_POSTGRES_URL`; five new migration cases were separately exercised below. One intermediate run exposed a positional-call signature regression in `admin_clients`; the final signature preserves that caller contract and the full rerun passed. No remaining baseline failure was observed.

Local PostgreSQL 16 fixture cluster: private Unix socket, port 55437, existing synthetic migration database. Network listening was disabled. The invocation used a local fixture role, no password or production DSN. Set `TEST_POSTGRES_URL` to the isolated fixture DSN; never a production database:

```sh
SAFR_TEST_POSTGRES_URL="$TEST_POSTGRES_URL" \
  DATABASE_URL='sqlite:///:memory:' SERVICE_API_TOKEN=test-service ADMIN_API_TOKEN=test-admin \
  "$TEST_PYTHON" -m pytest \
  tests/test_life_service_rental_migration_postgres.py -q --disable-warnings
```

Result: **5 passed**. Each test creates a unique synthetic schema inside a transaction and rolls that whole transaction back. The tests execute the actual e9 and f2 migration modules; they do not alter any pre-existing schema/table/row.

Evidence covers e9→f2→e9→f2 preservation of legacy life-service rows (including null-ended draft, exact decimal price, private notes, dates, timestamps, versions, fingerprints), users/unrelated fixture rows, and table owners; published monthly null expiry; database checks; each independent metadata-loss downgrade guard; and exact lock-before-check SQL ordering. This is not a production-sized restored-database proof or a claim of complete schema/sequence equality. Existing PostgreSQL race tests were not rerun in this bounded extension task.

The locally restarted PostgreSQL cluster was stopped after testing; its fixture data was not deleted. Final `alembic heads`: `f2c8a4d6e901 (head)`. Whitespace check passed.

## Backend ownership

Changed backend files: `app/models/life_services.py`, `app/schemas/life_services.py`, `app/services/life_services.py`, `app/services/registered_services.py`, `app/api/web_admin.py`, `app/api/visa_lifecycle.py`, `tests/test_life_services.py`, `tests/test_registered_services.py`, new `alembic/versions/f2c8a4d6e901_extend_life_service_rentals.py`, and new `tests/test_life_service_rental_migration_postgres.py`. Frontend implementation and integration are owned by the primary conversation and editor specialist.
