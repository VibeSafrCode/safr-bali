# BALI-LIFE-001: backup and isolated restoration gate

Status: prepared for review; not executed against production. This is a release
operator procedure, separate from publication, production migration and activation.
The accompanying `verify-life-release-backup.py` never starts/stops application
services, sends customer messages, migrates production, or drops a database.

Local validation: `AUDIT/test_life_release_backup_worker.py` passed its DB worker and entrypoint tests
against synthetic PostgreSQL 16 fixtures on 2026-09-22. This exercised snapshot
dump/restoration, wrong-marker and changed-migration rejection, owner/sequence
checks, source preservation and the complete isolated U-D-U cycle. The Linux
root orchestration (runuser, archives, real runtime mapping) is still unexecuted.
The process-group interruption guard also passed a separate controlled test.

## Exact scope

- Live source must remain `7283caceb7862ee8bc65637306fcfd87761ebd32`, with clean
  tracked files and no untracked non-ignored files.
- Live Alembic state must be exactly `d7a2f9c4e816`; `life_services` must not exist.
- The only migration accepted is `e9b3d7a5c201_add_client_life_services.py`, SHA-256
  `92efcd9a382a35c0722525ebc581869b76d0edd326b02f7e3a7a79e3806f4c51`.
- Expected Linux runtime location: `/opt/safr/safr-bali`. Backend/bot `.env` files
  and `06 Development/bot/app/data` must exist. The operator runs the reviewed
  script from a separate root-owned staging directory, outside the live checkout.
- Only local PostgreSQL at `/var/run/postgresql`, using the backend `.env` port
  (default 5432), is supported. The database name is parsed without sourcing the
  file. The configured DB username must equal the non-superuser owner of `users`.
  URL query options, non-local hosts, autonomous extensions/subscriptions/event
  triggers/foreign servers, changed source or schema cause a stop for review.

No server inspection was completed during preparation: the read-only SSH attempt
timed out during banner exchange. These preconditions must be checked on the real
server; they are not claimed as observed facts by this document.

Integration preflight subsequently verified the live service cwd/env and the
runtime endpoint vs peer database/postmaster identity. The first execution
stopped before backup because the legacy `/var/backups/safr-bali` is mode 0755.
Its permissions and files were left unchanged. Use the dedicated private
`/var/backups/safr-bali-life` parent instead, created 0700 by the script.

## Review before execution

1. Review the exact script and candidate bytes. Confirm the candidate remains the
   additive single-table migration and there are no production-write code paths.
2. Independently verify the live backend service uses this checkout and `.env`,
   with no alternative `DATABASE_URL` injected by systemd or its drop-ins. Inspect
   service paths/EnvironmentFiles; never paste environment values into chat/logs.
3. Check local peer access for the postgres OS account, readable runtime Python
   libraries (`psycopg`, SQLAlchemy, Alembic), PostgreSQL client/server version
   compatibility, and capacity for a database clone. The script requires at least
   2 GiB and three times the database size free on the backup and PGDATA volumes.
4. Confirm `/var/backups/safr-bali-life` is root-owned mode 0700, or absent with a
   suitable root-owned `/var/backups` parent. Existing permissive directories are
   rejected, never silently chmodded.
5. Preserve the current immutable frontend artifact directories and record their
   active symlink targets in the separate release record. This procedure backs up
   backend/bot runtime, bot JSON and both env files; it does not copy frontend
   deployment directories or virtualenvs and is not an infrastructure backup.

The source revision check means this gate must run before advancing the live
checkout. Stage the candidate migration and this script outside the live repo.

## Operator invocation — only after review

Use a unique root-owned staging directory. These example paths contain no secret.
Place the reviewed files there using the normal approved release transport; do
not execute the command as part of merely reviewing this document.

```bash
sudo "/opt/safr/safr-bali/06 Development/backend/.venv/bin/python" \
  /root/bali-life-release-staging/verify-life-release-backup.py \
  --candidate /root/bali-life-release-staging/e9b3d7a5c201_add_client_life_services.py \
  --execute-reviewed-verification
```

Without the explicit flag the script refuses execution. It also refuses non-Linux
or non-root execution. No DB password is passed through argv, subprocess environment
or output: PostgreSQL commands run through `runuser -u postgres` and local peer auth.

## What execution creates

Each run creates a new root-only directory beneath `/var/backups/safr-bali-life`:

- `runtime.tar.gz`: current backend/bot tree and bot runtime data, preserving file
  modes/ownership; excludes virtualenvs, bytecode/cache and `.env`.
- `env.tar.gz`: both complete environment files. Treat this and runtime/config
  archives as credentials, regardless of whether their names say “env”.
- `database.dump`: custom-format dump with original object owners/ACLs.
- Private baseline, target, proof and log files; all mode 0600 under mode 0700.
- `BACKUP_SHA256SUMS` immediately after backup; `SHA256SUMS` after all gates pass.

The database dump and table fingerprints share one exported read-only
REPEATABLE READ snapshot. Fingerprints contain table counts, aggregates of
SHA-256 row hashes, owners and column-definition hashes. No customer row values
are printed or persisted as verification reports; the database dump itself
contains production data and must remain private.

A unique `bali_life_verify_<24 hex characters>` database is created, owned by
postgres, with connection limit zero and CONNECT revoked from PUBLIC/runtime.
Ordinary runtime roles cannot use it; PostgreSQL superusers remain privileged.
No app or bot is started against it.
The database is restored without `--clean`, `--create` or ownership suppression.
Its unique name, owner, connection limit and per-run comment are verified before
every migration. Existing database names are never reused.

The worker imports only Alembic/SQLAlchemy and the exact hash-checked migration.
It does not import application settings/startup, full Alembic env.py, or run a
generic `upgrade head`. It applies only the candidate in the restored database:

`d7a2f9c4e816 → e9b3d7a5c201 → d7a2f9c4e816 → e9b3d7a5c201`.

After restoration and each step, every original table's count/hash/columns/owner
must match the backup snapshot. Upgrade must add an empty life-services table;
its owner and sequence owner must match `users`. Downgrade may remove only that
new table. Exact Alembic versions are checked separately. A final read-only query
confirms production is still at `d7a2f9c4e816` with no life-services table.

## Acceptance and retained artifacts

The operator must inspect the private proof locally and verify `SHA256SUMS` from
inside the exact printed backup directory. Copy only the PASS outcome, source
revision, migration hash, table-count total and gate results into the sanitized
release record. Do not paste raw private logs, counts by customer-related table,
DB dump, environment archives or backend config into Git/chat.

Any failure is a failed gate, even if a dump file exists. The script leaves the
run directory and any isolated database intact and performs no broad cleanup.
Use `BACKUP_SHA256SUMS` to validate completed backups after a later gate fails.
A partial backup without that file is not a verified backup. Investigate from
root-only logs and start a new unique run after resolving the cause.

The isolated DB intentionally remains for controlled inspection. Cleanup is a
separate action: resolve the exact retained name and marker from its private
manifest, verify no sessions, and confirm it differs from production before
authorizing deletion. This document intentionally supplies no blanket drop command.

## Limits and rollback boundary

- Runtime/env archives and the PostgreSQL snapshot are separate instants. Live
  bot JSON can change during tar; tar failures stop the gate. A globally atomic
  DB+JSON backup would require a separate coordinated write pause.
- Reading and hashing the full database consumes I/O and holds a snapshot. SQL,
  lock waits, dump and process groups have timeouts; choose a quiet release window.
- A clone occupies disk and contains the same PII as production. Restrictive
  database access does not replace host security, retention or controlled cleanup.
- These backups are local; host-loss/offsite recovery is a separate existing gate.
- Passing this script does not perform or prove production migration, runtime
  activation, deployed revision, browser smoke, live auth or rollback activation.
- After production later gains real life-service rows, prefer application rollback
  while retaining the additive table. A schema downgrade would delete those rows
  and requires a fresh backup and a deliberate data-preservation decision.
