"""Real workflow migration proof on an owned, Unix-socket-only PostgreSQL.

Opt in with BALI_TEST_POSTGRES_BIN (directory containing initdb and pg_ctl).
No application settings, external database URL or credentials are loaded.
"""

from importlib.util import module_from_spec, spec_from_file_location
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa
from sqlalchemy.pool import NullPool


pytestmark = pytest.mark.skipif(
    not os.environ.get("BALI_TEST_POSTGRES_BIN"),
    reason="Requires opt-in owned local PostgreSQL binaries",
)
CHECK_NAMES = {"ck_visa_case_service_status", "ck_visa_process_external_status"}
LIFECYCLE_CODES = (
    "NOT_ISSUED", "ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING",
    "EXTENDED", "EXPIRED", "CANCELLED", "REFUSED",
)
TABLES = ("users", "visa_cases", "visa_processes", "visa_events", "unrelated_fixture")


def revision():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/f3a9d2c6b810_expand_visa_workflow_statuses.py"
    spec = spec_from_file_location(path.stem, path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


@pytest.fixture(scope="module")
def owned_postgres():
    binaries = Path(os.environ["BALI_TEST_POSTGRES_BIN"]).resolve()
    for executable in ("initdb", "pg_ctl"):
        if not (binaries / executable).is_file():
            pytest.fail(f"Required PostgreSQL binary is unavailable: {executable}")
    directory = Path(tempfile.mkdtemp(prefix="visa-workflow-postgres-"))
    cluster = directory / "data"
    log = directory / "postgres.log"
    # The fresh cluster has no credentials or application data. Do not inherit
    # PostgreSQL connection/service/password variables into its subprocesses.
    postgres_env = {"PATH": str(binaries), "LC_ALL": "C"}
    engine = None

    def run(executable, *arguments, timeout):
        try:
            subprocess.run(
                [str(binaries / executable), *arguments], check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                timeout=timeout, env=postgres_env,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            detail = log.read_text(encoding="utf-8", errors="replace")[-3000:] if log.exists() else (error.stderr or b"").decode(errors="replace")
            raise RuntimeError(f"Owned synthetic PostgreSQL {executable} failed: {detail}") from None

    try:
        run("initdb", "-D", str(cluster), "-A", "trust", "-U", "visa_workflow_test",
            "--no-locale", "--encoding=UTF8", timeout=30)
        # A unique socket directory isolates this cluster even though the socket
        # port is fixed. Empty listen_addresses prevents every TCP listener.
        options = f"-c listen_addresses='' -p 55432 -k {shlex.quote(str(directory))}"
        run("pg_ctl", "-D", str(cluster), "-w", "-t", "10", "-l", str(log),
            "-o", options, "start", timeout=15)
        empty_passfile = directory / "empty.pgpass"
        empty_passfile.touch(mode=0o600)
        engine = sa.create_engine(
            sa.engine.URL.create("postgresql+psycopg", username="visa_workflow_test",
                                 host=str(directory), port=55432, database="postgres"),
            poolclass=NullPool,
            connect_args={"connect_timeout": 2, "passfile": str(empty_passfile),
                          "options": "-c statement_timeout=10000 -c lock_timeout=5000"},
        )
        with engine.connect() as connection:
            assert connection.execute(sa.text("SHOW listen_addresses")).scalar_one() == ""
            assert connection.execute(sa.text("SELECT current_user")).scalar_one() == "visa_workflow_test"
            assert Path(connection.execute(sa.text("SHOW data_directory")).scalar_one()).resolve() == cluster.resolve()
            version = connection.execute(sa.text("SHOW server_version")).scalar_one()
            print(f"Owned PostgreSQL {version}: isolated Unix socket, TCP disabled")
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        if (cluster / "postmaster.pid").exists():
            # Target only the exact data directory created by this fixture.
            # If shutdown fails, the exception prevents deleting live data.
            run("pg_ctl", "-D", str(cluster), "-w", "-t", "10", "-m", "fast", "stop", timeout=15)
        shutil.rmtree(directory)
        print("Owned PostgreSQL fixture cleaned; synthetic temporary directory removed")


@pytest.fixture
def migration_db(owned_postgres):
    migration = revision()
    schema = f"visa_workflow_{uuid.uuid4().hex}"
    with owned_postgres.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            metadata = sa.MetaData()
            users = sa.Table("users", metadata,
                sa.Column("id", sa.Integer, primary_key=True), sa.Column("marker", sa.Text, nullable=False))
            cases = sa.Table("visa_cases", metadata,
                sa.Column("id", sa.Integer, primary_key=True),
                sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
                sa.Column("service_status", sa.String(32), nullable=False),
                sa.Column("lifecycle_status", sa.String(32), nullable=False),
                sa.Column("version", sa.Integer, nullable=False),
                sa.Column("stay_end", sa.Date), sa.Column("marker", sa.Text),
                sa.CheckConstraint(migration._check("service_status", migration.OLD_SERVICE_CODES), name="ck_visa_case_service_status"),
                sa.CheckConstraint(migration._check("lifecycle_status", LIFECYCLE_CODES), name="ck_visa_case_lifecycle_status"),
                sa.CheckConstraint("version > 0", name="ck_visa_case_version_positive"))
            processes = sa.Table("visa_processes", metadata,
                sa.Column("id", sa.Integer, primary_key=True),
                sa.Column("visa_case_id", sa.Integer, sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
                sa.Column("external_status", sa.String(32), nullable=False),
                sa.Column("raw_external_status", sa.Text), sa.Column("reference_mask", sa.String(32)),
                sa.CheckConstraint(migration._check("external_status", migration.OLD_EXTERNAL_CODES), name="ck_visa_process_external_status"))
            events = sa.Table("visa_events", metadata,
                sa.Column("id", sa.Integer, primary_key=True),
                sa.Column("visa_case_id", sa.Integer, sa.ForeignKey("visa_cases.id", ondelete="RESTRICT"), nullable=False),
                sa.Column("visa_process_id", sa.Integer, sa.ForeignKey("visa_processes.id", ondelete="SET NULL")),
                sa.Column("payload", sa.JSON, nullable=False))
            unrelated = sa.Table("unrelated_fixture", metadata,
                sa.Column("id", sa.Integer, primary_key=True), sa.Column("marker", sa.Text))
            sa.Index("ix_fixture_case_user", cases.c.user_id)
            sa.Index("ix_fixture_process_case", processes.c.visa_case_id)
            sa.Index("ix_fixture_event_case", events.c.visa_case_id)
            metadata.create_all(connection)
            connection.execute(users.insert().values(id=1, marker="synthetic-user-preserved"))
            for index, status in enumerate(migration.OLD_SERVICE_CODES, start=1):
                connection.execute(cases.insert().values(
                    id=index, user_id=1, service_status=status,
                    lifecycle_status=LIFECYCLE_CODES[(index - 1) % len(LIFECYCLE_CODES)],
                    version=index, marker=f"legacy-case-{index}",
                ))
            for index, status in enumerate(migration.OLD_EXTERNAL_CODES, start=1):
                connection.execute(processes.insert().values(
                    id=index, visa_case_id=index, external_status=status,
                    raw_external_status=f" Original provider #{index}: {status}\n  исходный текст ",
                    reference_mask=f"masked-{index}",
                ))
            connection.execute(events.insert().values(
                id=1, visa_case_id=1, visa_process_id=1, payload={"marker": "immutable-history"}))
            connection.execute(unrelated.insert().values(id=1, marker="preserve-unrelated"))
            with Operations.context(MigrationContext.configure(connection)):
                yield connection, migration
        finally:
            # All objects belong to this synthetic schema in the owned cluster.
            transaction.rollback()


def rows(connection):
    return {
        table: connection.execute(sa.text(f'SELECT to_jsonb(t) FROM "{table}" t ORDER BY id')).scalars().all()
        for table in TABLES
    }


def structure(connection):
    return {
        "tables": connection.execute(sa.text("""
            SELECT c.relname, c.oid, c.relfilenode, pg_get_userbyid(c.relowner)
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=current_schema() AND c.relkind='r' ORDER BY c.relname
        """)).all(),
        "indexes": connection.execute(sa.text("""
            SELECT tablename, indexname, indexdef FROM pg_indexes
            WHERE schemaname=current_schema() ORDER BY tablename, indexname
        """)).all(),
        "other_constraints": connection.execute(sa.text("""
            SELECT conrelid::regclass::text, conname, contype, pg_get_constraintdef(oid), convalidated
            FROM pg_constraint WHERE connamespace=current_schema()::regnamespace
            AND conname NOT IN ('ck_visa_case_service_status','ck_visa_process_external_status')
            ORDER BY conrelid::regclass::text, conname
        """)).all(),
    }


def workflow_checks(connection):
    return connection.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid), convalidated FROM pg_constraint
        WHERE connamespace=current_schema()::regnamespace
        AND conname IN ('ck_visa_case_service_status','ck_visa_process_external_status') ORDER BY conname
    """)).all()


def must_reject(connection, statement, expected_constraint):
    with pytest.raises(sa.exc.IntegrityError) as error:
        with connection.begin_nested():
            connection.execute(sa.text(statement))
    assert error.value.orig.diag.constraint_name == expected_constraint


def verify_codes_and_other_guards(connection, migration, *, expanded):
    allowed_service = migration.SERVICE_CODES if expanded else migration.OLD_SERVICE_CODES
    allowed_external = migration.EXTERNAL_CODES if expanded else migration.OLD_EXTERNAL_CODES
    checks = workflow_checks(connection)
    assert {check.conname for check in checks} == CHECK_NAMES
    assert all(check.convalidated for check in checks)
    probe = connection.begin_nested()
    try:
        for table, column, allowed in (
            ("visa_cases", "service_status", allowed_service),
            ("visa_processes", "external_status", allowed_external),
        ):
            for code in allowed:
                connection.execute(sa.text(f"UPDATE {table} SET {column}=:code WHERE id=1"), {"code": code})
                assert connection.execute(sa.text(f"SELECT {column} FROM {table} WHERE id=1")).scalar_one() == code
            for code in ("IN_PROGRESS", "UNRECOGNIZED"):
                expected = "ck_visa_case_service_status" if table == "visa_cases" else "ck_visa_process_external_status"
                must_reject(connection, f"UPDATE {table} SET {column}='{code}' WHERE id=1", expected)
        if not expanded:
            for table, column, codes, old_codes, constraint in (
                ("visa_cases", "service_status", migration.SERVICE_CODES, migration.OLD_SERVICE_CODES, "ck_visa_case_service_status"),
                ("visa_processes", "external_status", migration.EXTERNAL_CODES, migration.OLD_EXTERNAL_CODES, "ck_visa_process_external_status"),
            ):
                for code in set(codes) - set(old_codes):
                    must_reject(connection, f"UPDATE {table} SET {column}='{code}' WHERE id=1", constraint)
        must_reject(connection, "UPDATE visa_cases SET lifecycle_status='ISSUED' WHERE id=1", "ck_visa_case_lifecycle_status")
        must_reject(connection, "UPDATE visa_cases SET version=0 WHERE id=1", "ck_visa_case_version_positive")
        must_reject(connection, "UPDATE visa_processes SET visa_case_id=999999 WHERE id=1", "visa_processes_visa_case_id_fkey")
        must_reject(connection, "DELETE FROM visa_cases WHERE id=1", "visa_processes_visa_case_id_fkey")
        must_reject(connection, "UPDATE visa_events SET visa_process_id=999999 WHERE id=1", "visa_events_visa_process_id_fkey")
    finally:
        probe.rollback()


def test_real_upgrade_downgrade_upgrade_preserves_legacy_rows_raw_indexes_and_foreign_keys(migration_db):
    connection, migration = migration_db
    baseline_rows = rows(connection)
    baseline_structure = structure(connection)
    baseline_checks = workflow_checks(connection)
    assert len(baseline_rows["visa_cases"]) == len(migration.OLD_SERVICE_CODES)
    assert len(baseline_rows["visa_processes"]) == len(migration.OLD_EXTERNAL_CODES)
    for step, expanded in ((migration.upgrade, True), (migration.downgrade, False), (migration.upgrade, True)):
        step()
        assert rows(connection) == baseline_rows
        # Unchanged OID/relfilenode proves neither table was copied/replaced.
        assert structure(connection) == baseline_structure
        verify_codes_and_other_guards(connection, migration, expanded=expanded)
        assert rows(connection) == baseline_rows
        if not expanded:
            assert workflow_checks(connection) == baseline_checks


@pytest.mark.parametrize("table,column", [
    ("visa_cases", "service_status"), ("visa_processes", "external_status"),
])
def test_real_downgrade_refuses_every_new_code_before_schema_or_data_changes(migration_db, table, column):
    connection, migration = migration_db
    migration.upgrade()
    codes = migration.SERVICE_CODES if table == "visa_cases" else migration.EXTERNAL_CODES
    old_codes = migration.OLD_SERVICE_CODES if table == "visa_cases" else migration.OLD_EXTERNAL_CODES
    original_structure = structure(connection)
    original_checks = workflow_checks(connection)
    for code in sorted(set(codes) - set(old_codes)):
        connection.execute(sa.text(f"UPDATE {table} SET {column}=:code WHERE id=1"), {"code": code})
        before = rows(connection)
        statements = []

        def record(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        sa.event.listen(connection, "before_cursor_execute", record)
        try:
            with pytest.raises(RuntimeError, match="Expanded visa workflow statuses exist"):
                migration.downgrade()
        finally:
            sa.event.remove(connection, "before_cursor_execute", record)
        assert len(statements) == 4
        assert statements[:3] == [
            "SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '30s'",
            "LOCK TABLE visa_cases, visa_processes IN ACCESS EXCLUSIVE MODE",
        ]
        assert statements[3].startswith("SELECT EXISTS")
        assert rows(connection) == before
        assert structure(connection) == original_structure
        assert workflow_checks(connection) == original_checks
        locked_tables = connection.execute(sa.text("""
            SELECT c.relname FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
            WHERE l.pid=pg_backend_pid() AND l.mode='AccessExclusiveLock' AND l.granted
            AND c.relnamespace=current_schema()::regnamespace
            AND c.relname IN ('visa_cases','visa_processes') ORDER BY c.relname
        """)).scalars().all()
        assert locked_tables == ["visa_cases", "visa_processes"]
