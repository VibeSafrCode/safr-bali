"""Transactional, isolated-schema rental migration proof; no production target."""

import importlib.util
from decimal import Decimal
import os
from pathlib import Path
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa


pytestmark = pytest.mark.skipif(not os.environ.get("SAFR_TEST_POSTGRES_URL"), reason="Requires isolated SAFR_TEST_POSTGRES_URL")


def revision(filename):
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def migration_db():
    engine = sa.create_engine(os.environ["SAFR_TEST_POSTGRES_URL"])
    schema = f"life_rental_migration_{uuid.uuid4().hex}"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(sa.text("CREATE TABLE users (id integer PRIMARY KEY, marker text NOT NULL)"))
            connection.execute(sa.text("INSERT INTO users VALUES (1, 'synthetic-root'), (2, 'synthetic-client')"))
            connection.execute(sa.text("CREATE TABLE unrelated_fixture (id integer PRIMARY KEY, marker text)"))
            connection.execute(sa.text("INSERT INTO unrelated_fixture VALUES (1, 'preserve-this-row')"))
            with Operations.context(MigrationContext.configure(connection)):
                revision("e9b3d7a5c201_add_client_life_services.py").upgrade()
                connection.execute(sa.text("""
                    INSERT INTO life_services
                        (id, user_id, kind, title, start_date, end_date, price_amount,
                         price_currency, price_unit, owner_details, internal_note, publication_status,
                         version, created_by_admin_id, updated_by_admin_id, create_idempotency_key,
                         create_payload_hash, created_at, updated_at)
                    VALUES
                        (1, 2, 'housing', NULL, NULL, NULL, NULL, 'IDR', 'period', 'private owner',
                         'private note', 'DRAFT', 1, 1, 1, 'legacy-draft', repeat('a',64), now(), now()),
                        (2, 2, 'bike', 'Legacy bike', '2026-01-01', '2026-02-01', 1234567.89,
                         'IDR', 'month', 'private bike owner', NULL, 'PUBLISHED', 3, 1, 1,
                         'legacy-published', repeat('b',64), now(), now())
                """))
                yield connection, revision("f2c8a4d6e901_extend_life_service_rentals.py")
        finally:
            # Roll back the whole synthetic schema, not any pre-existing object.
            transaction.rollback()
    engine.dispose()


def rows(connection, table, *, extended=False):
    projection = "to_jsonb(t)"
    if extended:
        projection += " - 'housing_type' - 'rental_mode' - 'quantity'"
    return connection.execute(sa.text(f'SELECT {projection} FROM "{table}" t ORDER BY id')).scalars().all()


def test_upgrade_downgrade_upgrade_preserves_legacy_rows_and_owners(migration_db):
    connection, migration = migration_db
    before = {table: rows(connection, table) for table in ("users", "unrelated_fixture", "life_services")}
    owners = connection.execute(sa.text("SELECT tablename, tableowner FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).all()
    migration.upgrade()
    assert rows(connection, "life_services", extended=True) == before["life_services"]
    assert connection.execute(sa.text("SELECT housing_type, rental_mode, quantity FROM life_services ORDER BY id")).all() == [(None, "fixed", 1), (None, "fixed", 1)]
    migration.downgrade()
    assert rows(connection, "life_services") == before["life_services"]
    migration.upgrade()
    assert rows(connection, "life_services", extended=True) == before["life_services"]
    for table in ("users", "unrelated_fixture"):
        assert rows(connection, table) == before[table]
    assert connection.execute(sa.text("SELECT tablename, tableowner FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).all() == owners


def test_monthly_null_expiry_and_guarded_downgrade(migration_db):
    connection, migration = migration_db
    migration.upgrade()
    connection.execute(sa.text("UPDATE life_services SET rental_mode='monthly', quantity=3, end_date=NULL WHERE id=2"))
    assert connection.execute(sa.text("SELECT end_date, price_amount FROM life_services WHERE id=2")).one() == (None, Decimal("1234567.89"))
    statements = []

    def record_statement(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    sa.event.listen(connection, "before_cursor_execute", record_statement)
    try:
        with pytest.raises(RuntimeError, match="Rental metadata exists"):
            migration.downgrade()
    finally:
        sa.event.remove(connection, "before_cursor_execute", record_statement)
    assert statements[0] == "LOCK TABLE life_services IN ACCESS EXCLUSIVE MODE"
    assert statements[1].startswith("SELECT EXISTS")
    assert connection.execute(sa.text("SELECT rental_mode, quantity FROM life_services WHERE id=2")).one() == ("monthly", 3)
    assert connection.execute(sa.text("""
        SELECT EXISTS (SELECT 1 FROM pg_locks
        WHERE relation = 'life_services'::regclass AND pid = pg_backend_pid()
          AND mode = 'AccessExclusiveLock' AND granted)
    """)).scalar_one()
    for invalid in ("quantity=0", "housing_type='villa'", "rental_mode='fixed'"):
        with pytest.raises(sa.exc.IntegrityError):
            with connection.begin_nested():
                connection.execute(sa.text(f"UPDATE life_services SET {invalid} WHERE id=2"))


@pytest.mark.parametrize("change", [
    "housing_type='villa' WHERE id=1",
    "quantity=2 WHERE id=2",
    "rental_mode='monthly' WHERE id=2",
])
def test_downgrade_refuses_each_material_rental_field(migration_db, change):
    connection, migration = migration_db
    migration.upgrade()
    connection.execute(sa.text(f"UPDATE life_services SET {change}"))
    before = rows(connection, "life_services")
    with pytest.raises(RuntimeError, match="Rental metadata exists"):
        migration.downgrade()
    assert rows(connection, "life_services") == before
