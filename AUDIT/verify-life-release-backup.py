#!/usr/bin/env python3
"""REVIEWED EXECUTION ONLY: production backup and isolated BALI-LIFE verification.

This script NEVER migrates the production database, changes a service, or drops
a database. It creates a sensitive root-only backup and one isolated restore DB.
Run with the production backend virtualenv Python as root; see the paired runbook.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone


SOURCE_REVISION = "7283caceb7862ee8bc65637306fcfd87761ebd32"
BASE_REVISION = "d7a2f9c4e816"
CANDIDATE_REVISION = "e9b3d7a5c201"
CANDIDATE_SHA256 = "92efcd9a382a35c0722525ebc581869b76d0edd326b02f7e3a7a79e3806f4c51"
REPO = Path("/opt/safr/safr-bali")
BACKUP_PARENT = Path("/var/backups/safr-bali-life")
RESULT_MARKER = "BALI_LIFE_RESULT="
ISOLATED_NAME = re.compile(r"^bali_life_verify_[a-f0-9]{24}$")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def connect(params, database, *, readonly=False):
    import psycopg
    connection = psycopg.connect(dbname=database, user=params["pg_user"], host=params["pg_socket"],
                                port=params["pg_port"], connect_timeout=10,
                                options="-c statement_timeout=180000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=600000 -c search_path=public,pg_catalog -c timezone=UTC -c extra_float_digits=3")
    connection.read_only = readonly
    return connection


def revision(connection):
    values = connection.execute("SELECT version_num FROM public.alembic_version").fetchall()
    require(values in ([(BASE_REVISION,)], [(CANDIDATE_REVISION,)]), "Unexpected schema revision")
    return values[0][0]


def assert_source(connection):
    require(revision(connection) == BASE_REVISION, "Production schema differs from the reviewed base")
    require(connection.execute("SELECT to_regclass('public.life_services')").fetchone()[0] is None,
            "life_services already exists; use a fresh release plan")
    # These features can execute work outside a restored database. Fail before
    # restoring them; normal SQL functions and application outbox rows are inert.
    checks = (
        "SELECT count(*) FROM pg_subscription",
        "SELECT count(*) FROM pg_foreign_server",
        "SELECT count(*) FROM pg_event_trigger",
        "SELECT count(*) FROM pg_extension WHERE extname NOT IN ('plpgsql','pgcrypto','uuid-ossp')",
    )
    require(all(connection.execute(sql).fetchone()[0] == 0 for sql in checks),
            "Unsupported autonomous database objects require separate review")


def fingerprint(connection):
    """Only counts, per-row SHA-256 aggregates, schema/owner facts leave PostgreSQL."""
    from psycopg import sql
    tables = connection.execute("""
        SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
          AND n.nspname <> 'information_schema'
        ORDER BY n.nspname, c.relname
    """).fetchall()
    result = {}
    for schema, table, owner in tables:
        if (schema, table) == ("public", "alembic_version"):
            continue
        query = sql.SQL("SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') FROM {}.{} t ORDER BY 1").format(
            sql.Identifier(schema), sql.Identifier(table))
        digest, count = hashlib.sha256(), 0
        with connection.cursor(name=f"life_fp_{uuid.uuid4().hex}") as cursor:
            cursor.execute(query)
            for (row_hash,) in cursor:
                digest.update(row_hash.encode("ascii") + b"\n")
                count += 1
        columns = connection.execute("""
            SELECT column_name, data_type, udt_name, is_nullable, column_default
            FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position
        """, (schema, table)).fetchall()
        result[f"{schema}.{table}"] = {"count": count, "sha256": digest.hexdigest(), "owner": owner,
                                      "columns_sha256": hashlib.sha256(json.dumps(columns).encode()).hexdigest()}
    return result


def emit_worker(result):
    # Snapshot mode reserves stdout for the custom-format database dump.
    print(RESULT_MARKER + json.dumps(result, sort_keys=True), file=sys.stderr, flush=True)


def pg_command(params, binary, *arguments):
    return [binary, "--host", params["pg_socket"], "--port", str(params["pg_port"]),
            "--username", params["pg_user"], *arguments]


def assert_isolated(connection, params):
    expected = params["isolated_db"]
    require(ISOLATED_NAME.fullmatch(expected) is not None and expected != params["production_db"], "Invalid isolated target")
    actual, owner, limit, marker = connection.execute("""
        SELECT current_database(), pg_get_userbyid(datdba), datconnlimit,
               shobj_description(oid, 'pg_database') FROM pg_database WHERE datname=current_database()
    """).fetchone()
    require(actual == expected and owner == params["pg_user"] and limit == 0 and marker == params["marker"],
            "Isolated database identity/owner/connection guard failed")
    require(not connection.execute("SELECT has_database_privilege(%s,%s,'CONNECT')",
                                   (params["runtime_role"], expected)).fetchone()[0], "Runtime role can connect to restored data")


def worker(params):
    """Runs only as the local postgres OS identity via runuser; no app imports."""
    from psycopg import sql
    mode = params["mode"]
    if mode in {"inspect", "snapshot"}:
        with connect(params, params["production_db"], readonly=True) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            assert_source(connection)
            configured = connection.execute("SELECT current_database(), current_setting('port')::integer").fetchone()
            require(configured == (params["production_db"], params["pg_port"]), "Local database mapping mismatch")
            runtime_role = connection.execute("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='users'").fetchone()[0]
            role = connection.execute("SELECT rolsuper FROM pg_roles WHERE rolname=%s", (runtime_role,)).fetchone()
            require(role is not None and not role[0], "Runtime table owner must not be a superuser")
            result = {"source_revision": BASE_REVISION, "runtime_role": runtime_role,
                      "database_size_bytes": connection.execute("SELECT pg_database_size(current_database())").fetchone()[0],
                      "data_directory": connection.execute("SHOW data_directory").fetchone()[0]}
            if mode == "snapshot":
                snapshot = connection.execute("SELECT pg_export_snapshot()").fetchone()[0]
                result["tables"] = fingerprint(connection)
                # The exported transaction remains open until pg_dump succeeds.
                subprocess.run(pg_command(params, "pg_dump", "--format=custom", "--snapshot", snapshot,
                                           "--dbname", params["production_db"]), stdout=sys.stdout.buffer,
                               stderr=sys.stderr, check=True, timeout=600)
            emit_worker(result)
        return
    if mode == "create-isolated":
        require(ISOLATED_NAME.fullmatch(params["isolated_db"]) is not None, "Invalid new database name")
        require(params["isolated_db"] != params["production_db"], "Refusing production target")
        with connect(params, "postgres") as connection:
            connection.autocommit = True
            require(connection.execute("SELECT 1 FROM pg_database WHERE datname=%s", (params["isolated_db"],)).fetchone() is None,
                    "Generated database already exists; refusing reuse")
            connection.execute(sql.SQL("CREATE DATABASE {} OWNER {} TEMPLATE template0 CONNECTION LIMIT 0").format(
                sql.Identifier(params["isolated_db"]), sql.Identifier(params["pg_user"])))
            connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(params["isolated_db"])))
            connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM {}").format(
                sql.Identifier(params["isolated_db"]), sql.Identifier(params["runtime_role"])))
            connection.execute(sql.SQL("COMMENT ON DATABASE {} IS {}").format(
                sql.Identifier(params["isolated_db"]), sql.Literal(params["marker"])))
        emit_worker({"created": True})
        return
    require(mode == "verify-isolated", "Unknown worker mode")
    with connect(params, params["isolated_db"]) as connection:
        assert_isolated(connection, params)
        require(revision(connection) == BASE_REVISION, "Restored schema is not the base")
        require(fingerprint(connection) == params["baseline"], "Restored tables differ from the exported snapshot")
    source = params["candidate_source"]
    require(hashlib.sha256(source.encode()).hexdigest() == CANDIDATE_SHA256, "Candidate migration hash mismatch")
    namespace = {"__name__": "reviewed_life_migration"}
    exec(compile(source, "reviewed_life_migration", "exec"), namespace)
    require(namespace["revision"] == CANDIDATE_REVISION and namespace["down_revision"] == BASE_REVISION,
            "Candidate revision chain mismatch")
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    import sqlalchemy as sa
    # Creator always connects to the guarded isolated database. No production URL
    # is ever passed into Alembic, and no environment/settings file is imported.
    engine = sa.create_engine("postgresql+psycopg://", creator=lambda: connect(params, params["isolated_db"]))
    steps = []
    for operation, old, new in (("upgrade", BASE_REVISION, CANDIDATE_REVISION),
                                ("downgrade", CANDIDATE_REVISION, BASE_REVISION),
                                ("upgrade", BASE_REVISION, CANDIDATE_REVISION)):
        with engine.begin() as connection:
            raw = connection.connection.driver_connection
            assert_isolated(raw, params)
            require(revision(raw) == old, "Unexpected isolated revision before migration")
            with Operations.context(MigrationContext.configure(connection)):
                namespace[operation]()
            changed = connection.execute(sa.text("UPDATE public.alembic_version SET version_num=:new WHERE version_num=:old"),
                                         {"old": old, "new": new})
            require(changed.rowcount == 1, "Schema version update was not singular")
        with connect(params, params["isolated_db"]) as check:
            assert_isolated(check, params)
            require(revision(check) == new, "Isolated revision verification failed")
            current = fingerprint(check)
            life = current.pop("public.life_services", None)
            require(current == params["baseline"], "Original data/columns/ownership changed")
            if operation == "upgrade":
                require(life is not None and life["count"] == 0 and life["owner"] == params["runtime_role"],
                        "New table ownership or emptiness failed")
                sequence_owner = check.execute("SELECT sequenceowner FROM pg_sequences WHERE schemaname='public' AND sequencename='life_services_id_seq'").fetchone()
                require(sequence_owner == (params["runtime_role"],), "New sequence owner mismatch")
                allowed = check.execute("SELECT has_table_privilege(%s,'public.life_services','SELECT,INSERT,UPDATE')", (params["runtime_role"],)).fetchone()[0]
                require(allowed, "Runtime owner lacks new-table access")
            else:
                require(life is None, "Downgrade left the feature table")
            steps.append({"operation": operation, "revision": new, "original_tables_equal": True})
    engine.dispose()
    emit_worker({"result": "PASS", "restore_equal": True, "steps": steps,
                 "original_tables": len(params["baseline"]), "runtime_cannot_connect_to_clone": True,
                 "new_table_and_sequence_owner_match": True})


def safe_run(command, *, stdout, stderr, input_bytes=None, stdin=None, timeout=900):
    """Bound the complete process group, including pg_dump descendants."""
    process = subprocess.Popen(command, stdout=stdout, stderr=stderr, stdin=subprocess.PIPE if input_bytes is not None else stdin,
                               start_new_session=True, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8"})
    try:
        process.communicate(input=input_bytes, timeout=timeout)
    except BaseException as exc:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        if isinstance(exc, subprocess.TimeoutExpired):
            raise RuntimeError("Bounded subprocess timed out; inspect the private run log") from None
        raise
    require(process.returncode == 0, "Subprocess failed; inspect the private run log")


def write_json(path, content):
    with path.open("x") as output:
        json.dump(content, output, sort_keys=True, indent=2)
        output.write("\n")


def write_checksums(backup, filename):
    with (backup / filename).open("x") as sums:
        for path in sorted(backup.iterdir()):
            if path.name == filename or not path.is_file():
                continue
            digest = hashlib.sha256()
            with path.open("rb") as artifact:
                for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                    digest.update(chunk)
            sums.write(f"{digest.hexdigest()}  {path.name}\n")
            require(path.stat().st_uid == 0 and not (path.stat().st_mode & 0o077), "Backup artifact permission mismatch")


def run_worker(params, backup, stage, *, dump=None):
    source = Path(__file__).read_text()
    log_path = backup / f"{stage}.private.log"
    with log_path.open("xb") as log:
        with (dump.open("xb") if dump is not None else open(os.devnull, "wb")) as output:
            safe_run(["runuser", "-u", "postgres", "--", sys.executable, "-c", source, "--worker"],
                     stdout=output, stderr=log, input_bytes=json.dumps(params).encode())
    results = [line[len(RESULT_MARKER):] for line in log_path.read_text().splitlines() if line.startswith(RESULT_MARKER)]
    require(len(results) == 1, "Worker did not produce one verification result")
    return json.loads(results[0])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True, help="Exact reviewed migration file, outside the live checkout")
    parser.add_argument("--execute-reviewed-verification", action="store_true", help="Create backups and the isolated restore DB; never migrate production")
    args = parser.parse_args()
    require(args.execute_reviewed_verification, "Explicit reviewed execution flag required")
    require(sys.platform.startswith("linux") and os.geteuid() == 0, "Run on the Linux server as root")
    os.umask(0o077)
    repo = REPO.resolve(strict=True)
    backend, bot = repo / "06 Development/backend", repo / "06 Development/bot"
    require(Path(sys.executable).resolve().is_file(), "Python executable unavailable")
    actual = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], timeout=10, text=True).strip()
    require(actual == SOURCE_REVISION, "Live source changed; rebase and review the release first")
    require(subprocess.run(["git", "-C", str(repo), "diff", "--quiet", "HEAD", "--"], timeout=10).returncode == 0,
            "Tracked runtime changes require review before release")
    require(not subprocess.check_output(["git", "-C", str(repo), "ls-files", "--others", "--exclude-standard"], timeout=10),
            "Untracked runtime files require review before release")
    candidate_path = args.candidate.resolve(strict=True)
    require(not candidate_path.is_relative_to(repo), "Stage the candidate outside the live checkout")
    candidate_bytes = candidate_path.read_bytes()
    require(hashlib.sha256(candidate_bytes).hexdigest() == CANDIDATE_SHA256, "Candidate bytes differ from reviewed migration")
    candidate_source = candidate_bytes.decode("utf-8")
    # Parse rather than source the env file: no shell interpolation or app imports.
    from dotenv import dotenv_values
    from sqlalchemy.engine import make_url
    values = dotenv_values(backend / ".env", interpolate=False)
    database_url = make_url(values.get("DATABASE_URL", ""))
    require(database_url.get_backend_name() == "postgresql" and database_url.host in {"127.0.0.1", "localhost", "::1", None},
            "Production database is not a confirmed local PostgreSQL target")
    require(not database_url.query, "Database URL options require explicit mapping review")
    require(bool(database_url.database) and database_url.database != "postgres", "Missing or unsafe production database name")
    # Local peer access avoids passing credentials in argv, environment or logs.
    params = {"pg_socket": "/var/run/postgresql", "pg_port": database_url.port or 5432,
              "pg_user": "postgres", "production_db": database_url.database}
    for relative in ("06 Development/backend/.env", "06 Development/bot/.env", "06 Development/bot/app/data"):
        path = repo / relative
        require(path.exists() and not path.is_symlink(), "Required backup path is missing or is a symlink")
    # Never follow a pre-existing backup-parent symlink or relax its permissions.
    if BACKUP_PARENT.exists():
        info = BACKUP_PARENT.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not (info.st_mode & 0o077),
                "Backup parent must already be a root-owned private directory")
    else:
        BACKUP_PARENT.mkdir(mode=0o700, parents=False)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = Path(tempfile.mkdtemp(prefix=f"bali-life-{timestamp}-", dir=BACKUP_PARENT))
    write_json(backup / "intent.json", {"source_revision": actual, "base_revision": BASE_REVISION,
                                       "candidate_revision": CANDIDATE_REVISION, "candidate_sha256": CANDIDATE_SHA256,
                                       "verification_script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                                       "created_at": timestamp, "production_migration": False})
    inspection = run_worker({**params, "mode": "inspect"}, backup, "inspect")
    params["runtime_role"] = inspection["runtime_role"]
    require(database_url.username == params["runtime_role"], "Configured DB user differs from users-table owner; review mapping")
    for volume in (BACKUP_PARENT, Path(inspection["data_directory"])):
        filesystem = os.statvfs(volume)
        require(filesystem.f_bavail * filesystem.f_frsize >= max(2 * 1024**3, inspection["database_size_bytes"] * 3),
                "Insufficient free space for backup and isolated restore")
    for archive, paths, exclusions in (
        ("runtime.tar.gz", ["06 Development/backend", "06 Development/bot"],
         ["--exclude=.venv", "--exclude=__pycache__", "--exclude=*.pyc", "--exclude=.env"]),
        ("env.tar.gz", ["06 Development/backend/.env", "06 Development/bot/.env"], []),
    ):
        with (backup / f"{archive}.private.log").open("xb") as log:
            safe_run(["tar", "--create", "--gzip", "--numeric-owner", "--file", str(backup / archive),
                      "--directory", str(repo), *exclusions, *paths], stdout=log, stderr=log)
    baseline = run_worker({**params, "mode": "snapshot"}, backup, "snapshot", dump=backup / "database.dump")
    write_json(backup / "baseline.private.json", baseline)
    # Preserve a verifiable backup even if a later restore or migration gate fails.
    write_checksums(backup, "BACKUP_SHA256SUMS")
    isolated = f"bali_life_verify_{uuid.uuid4().hex[:24]}"
    params.update(isolated_db=isolated, marker=f"BALI-LIFE-001 verification {isolated}", baseline=baseline["tables"],
                  candidate_source=candidate_source)
    write_json(backup / "isolated-target.private.json", {"database": isolated, "marker": params["marker"], "retained_for_review": True})
    run_worker({**params, "mode": "create-isolated"}, backup, "create-isolated")
    with (backup / "restore.private.log").open("xb") as log, (backup / "database.dump").open("rb") as dump:
        safe_run(["runuser", "-u", "postgres", "--", *pg_command(params, "pg_restore", "--exit-on-error", "--single-transaction",
                                                               "--dbname", isolated)], stdout=log, stderr=log, stdin=dump)
    proof = run_worker({**params, "mode": "verify-isolated"}, backup, "verify-isolated")
    # A fresh production read verifies that its Alembic state remains untouched.
    source_after = run_worker({**params, "mode": "inspect"}, backup, "source-after")
    require(source_after["source_revision"] == BASE_REVISION, "Production schema changed during verification")
    proof.update(source_git_revision=actual, migration_sha256=CANDIDATE_SHA256, production_revision_after=BASE_REVISION,
                 isolated_database_retained=isolated, backup_scope="PostgreSQL, backend/bot runtime and both env files")
    write_json(backup / "proof.private.json", proof)
    write_checksums(backup, "SHA256SUMS")
    print(f"PASS: private backup and isolated restore verification complete; review {backup}/proof.private.json")
    print("Production was not migrated or activated. The isolated database is retained; no cleanup was attempted.")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--worker"]:
            worker(json.load(sys.stdin))
        else:
            main()
    except BaseException as exc:
        # Exceptions/driver details may carry SQL or credentials. Keep stdout
        # sanitized; private worker logs contain only explicitly written results.
        if isinstance(exc, SystemExit):
            raise
        reason = str(exc) if type(exc) is RuntimeError else type(exc).__name__
        print(f"Verification stopped: {reason}; inspect the root-only run directory and runbook.", file=sys.stderr)
        sys.exit(1)
