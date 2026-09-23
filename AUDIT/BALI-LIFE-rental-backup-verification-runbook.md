# Rental extension: reviewed backup and isolated restore gate

Prepared 2026-09-23. **Primary executed the reviewed backup/restore gate successfully at 08:26Z on 2026-09-23.** Production stayed on e9 during verification. The separate activation subsequently deployed runtime b67c078 and schema f2c8a4d6e901 with frontend 5c0a47c. This packet describes the backup/restore gate, not application activation. The preparing specialist used no browser or production access. The old dirty runtime-release document is untouched.

## Exact inputs and scope

- Live Git base: `bd6d7e7c08ff40eb4953bda6b7938b0da4ca2218`, clean tracked and untracked non-ignored state.
- Source schema: exactly `e9b3d7a5c201`. The existing `public.life_services` table must exist, share the non-superuser `users` owner, and have none of the new rental columns.
- Candidate: only `f2c8a4d6e901_extend_life_service_rentals.py`, SHA-256 `a7d1415740f19872a984145a2fac46aa75c0ace8e00a901bf9660a3964455ec8`.
- Standalone worker: `AUDIT/verify-rental-release-backup.py`. It imports only its libraries and hash-pinned candidate, never app startup or generic Alembic `upgrade head`.
- New unique root-only backup directories under `/var/backups/safr-bali-rentals`. Existing permissive/symlink backup parents are rejected, never modified.
- Fresh clone name `bali_rentals_verify_<24 hex>`, postgres owner, connection limit zero, CONNECT revoked from PUBLIC/runtime, and a per-run database comment. Existing names are never reused. No database is dropped and no service is changed.

## Required operator preflight

Review this exact worker and migration before any execution. Verify effective backend systemd configuration including EnvironmentFile/overrides and actual DATABASE_URL mapping; privately confirm the configured TCP/local endpoint and `/var/run/postgresql` socket refer to the same cluster. Matching database name/port alone is insufficient. The new `--runtime-mapping-confirmed` flag records that independent operator check; it is not an automatic systemd/cluster-identity test.

Confirm local peer access as postgres, installed compatible `pg_dump`/`pg_restore`, readable backend Python with psycopg/SQLAlchemy/Alembic/dotenv, and capacity. The worker requires at least 2 GiB and 3× source database size free in both backup and PGDATA volumes. It rejects unexpected extensions, subscriptions, foreign servers, and event triggers. Required runtime paths are backend/bot `.env` and bot `app/data`; configuration is parsed, not shell-sourced.

Stage the worker and exact candidate outside `/opt/safr/safr-bali` in a unique root-only directory. Run this gate **before advancing the live Git checkout**, because the source revision is pinned. Do not paste secrets, raw row values, dumps, or private logs into chat/Git.

## Operator invocation — only after explicit review

Example staging paths are illustrative. This command was not run by the preparing specialist:

```sh
sudo "/opt/safr/safr-bali/06 Development/backend/.venv/bin/python" \
  /root/bali-rental-release-staging/verify-rental-release-backup.py \
  --candidate /root/bali-rental-release-staging/f2c8a4d6e901_extend_life_service_rentals.py \
  --runtime-mapping-confirmed \
  --execute-reviewed-verification
```

Linux/root and both explicit flags are required. Production credentials are never passed in argv or subprocess environment. Database commands use local peer authentication through `runuser -u postgres`; all backup/log/manifest files remain root-only.

## What the gate proves

The database dump and original row fingerprints use one exported read-only REPEATABLE READ snapshot. Runtime and env archives are separate instants, not a globally atomic DB+bot-JSON backup. The worker creates `runtime.tar.gz`, `env.tar.gz`, `database.dump`, private manifests/logs, backup checksums before restoration, and final checksums/proof only after success. Runtime includes backend/bot and bot data, excluding virtualenv/bytecode and separately archived `.env`; immutable frontend artifacts/offsite backups are outside scope.

Restore uses a new restricted database without `--clean`, `--create`, or owner suppression. All original table rows/counts/column-definition hashes/owners must equal the exported baseline, including existing life-service rows. Only Alembic's version row is compared separately.

Only the pinned candidate runs, and only against the guarded clone:

`e9b3d7a5c201 → f2c8a4d6e901 → e9b3d7a5c201 → f2c8a4d6e901`.

After upgrade, fingerprinting excludes **only** `housing_type`, `rental_mode`, and `quantity` from `public.life_services`; their exact definitions and null/fixed/1 values are verified separately. Every pre-existing life-service field remains covered. After downgrade, all original columns are compared with no exclusion. No existing life table is removed or ignored.

Sequence definitions, owners, and owned-by dependencies must match source→restore. Sequence `last_value`/`is_called` are non-MVCC and may advance on a live source while dumping. Therefore their baseline is the actual restored dump state; all sequence states, owners, definitions, and dependencies must remain identical across every U-D-U step. The worker does not falsely claim live counters share the row snapshot instant.

Source reads are read-only. The only source-after proof is unchanged e9 schema and source prerequisites; live customer activity may legitimately change production rows during verification. No production UPDATE, migration, application startup, customer message, or cleanup occurs. This is not a complete constraint/index/function/ACL equality proof; exact candidate hash plus bounded reviewed DDL and row/column/owner/sequence checks define its scope.

Connection establishment is bounded to 10 seconds, worker SQL to 180 seconds, migration lock waits to 10 seconds, idle transactions to 600 seconds, source dump lock waits to 10 seconds, and dump execution to 600 seconds. The outer process group is bounded to 900 seconds, including restore and descendants; interrupted/timed-out groups are terminated. Restore may reset session SQL timeout settings internally, so its hard limit is the outer process-group deadline. No infinite wait is intended.

## Focused local evidence and limitations

`AUDIT/test_rental_release_backup_worker.py`: **3 passed** on 2026-09-23. This is the only suite exercised for worker preparation. The DB fixture was newly created and empty on an owned socket-only PostgreSQL 16 cluster; the test ran the entire repository migration chain to e9 and seeded an existing housing draft with null dates, a published bike with decimal price/version, and hidden insurance, plus synthetic private contacts/notes. It then exercised actual exported-snapshot pg_dump, restricted restore, all-table comparisons, existing life rows, all sequence facts/state, full U-D-U, source preservation, wrong-marker/changed-candidate rejection, explicit execution guard, and process-group interruption behavior. No real customer data was used.

Invocation from repository root, using the existing local Python environment:

```sh
SAFR_RENTAL_BACKUP_FIXTURE_URL="$RENTAL_TEST_DATABASE_URL" \
  "$TEST_PYTHON" -m pytest \
  AUDIT/test_rental_release_backup_worker.py -q --disable-warnings
```

The fixture URL is synthetic/local and passwordless. Re-running needs a **new empty** `bali_rental_fixture_` database on the owned private socket; this test intentionally refuses reusing populated input. Source fixture, generated owner role, and clone are retained locally for inspection. The specialist stopped the local PostgreSQL cluster after the test. Linux root orchestration (`runuser`, real archives/permissions/capacity/runtime mapping) remains unexecuted. The final explicit pg_dump lock-wait option was syntax-checked with installed pg_dump help; no unrelated test matrix was rerun.

## Acceptance and failure handling

Activation lesson: keep backup execution umask 077 separate from Git source
checkout umask 022. Six changed Python files inherited 0600 during activation,
blocking the www-data FX reader. Their original 0644 modes were restored from
the verified archive; config.py 0640 and .env modes were unchanged. The FX service
then succeeded and public snapshot 27294 was fresh at 08:42:27Z. Never broadly
chmod the repository or secret files to repair this; verify exact prior modes.

Review the private `proof.private.json` and verify `SHA256SUMS` within the exact root-only run directory. Record only sanitized PASS, source Git/schema, candidate hash, aggregate table/sequence counts, and gate outcomes. A partial dump or any failed stage is not acceptance. Completed backup files can be validated with `BACKUP_SHA256SUMS` if a later gate fails.

Artifacts and clone remain after both success and failure. Cleanup is a separate explicitly scoped operator action after exact target/marker/session checks; no blanket drop command is provided. Local backups do not establish host-loss recovery.

Once real rental metadata exists, migration downgrade refuses to erase it and takes an exclusive table lock before checking. Prefer application rollback retaining the additive schema; never invent an expiry or silently delete metadata to make a downgrade succeed. Passing this prepared worker does not prove production migration, deployed revision, activation, visual behavior, or rollback activation.
