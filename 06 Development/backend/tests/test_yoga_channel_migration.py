"""Additive U-D-U, logical restore and optional owned-PG concurrency evidence.

SQLite runs offline. PostgreSQL tests require BALI_TEST_POSTGRES_BIN and reuse
the existing owned Unix-socket-only fixture; never accept production URLs.
"""
from concurrent.futures import ThreadPoolExecutor
from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session

import app.models
from app.db.base import Base
from app.models.web_portal import WebConversation, WebMessage
from app.models.yoga_channel import YogaChannelBinding, YogaDelivery
from app.services import yoga_channel as service
from tests.test_yoga_channel import NOW, POLICY, intake
from tests.test_visa_workflow_postgres import owned_postgres

YOGA = {"yoga_channel_bindings", "yoga_inbound_receipts", "yoga_deliveries"}


def revision():
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/a1f9c3d7e620_add_yoga_channel_delivery.py'
    spec = spec_from_file_location(path.stem, path)
    module = module_from_spec(spec); spec.loader.exec_module(module)
    assert module.down_revision == 'f3a9d2c6b810'
    return module


def create_baseline(c):
    Base.metadata.create_all(c, tables=[t for name, t in Base.metadata.tables.items() if name not in YOGA])
    c.execute(sa.text('CREATE TABLE yoga_test_sentinel (id INTEGER PRIMARY KEY, amount VARCHAR(30), payload VARCHAR(100))'))
    c.execute(sa.text("INSERT INTO yoga_test_sentinel VALUES (1,'123.45','unchanged order-price witness')"))
    with Session(bind=c) as db:
        conversation = WebConversation(source='website', route_context={'section': 'existing'}, created_at=NOW, updated_at=NOW)
        db.add(conversation); db.flush()
        db.add(WebMessage(conversation_id=conversation.id, author_type='client', body='Existing canonical message', visibility='client', created_at=NOW))
        db.flush()


def state(c, *, include_yoga=False):
    inspector = sa.inspect(c)
    result = {}
    for name in inspector.get_table_names():
        if name in YOGA and not include_yoga: continue
        rows = c.execute(sa.text('SELECT * FROM "' + name + '"')).all()
        result[name] = {'rows': sorted((tuple(map(str, r)) for r in rows)),
            'columns': [(r['name'], str(r['type']), r['nullable']) for r in inspector.get_columns(name)],
            'indexes': json.loads(json.dumps(inspector.get_indexes(name), default=str, sort_keys=True))}
    return result


def test_sqlite_upgrade_downgrade_upgrade_and_independent_restore(tmp_path):
    source = tmp_path / 'synthetic.sqlite'
    engine = sa.create_engine('sqlite:///' + str(source))
    migration = revision()
    with engine.begin() as c:
        create_baseline(c)
        before = state(c)
        with Operations.context(MigrationContext.configure(c)):
            for operation in (migration.upgrade, migration.downgrade, migration.upgrade):
                operation()
                assert state(c) == before
    engine.dispose()
    restored = tmp_path / 'restored.sqlite'
    with sqlite3.connect(source) as src, sqlite3.connect(restored) as dst:
        src.backup(dst)
        assert list(src.iterdump()) == list(dst.iterdump())
    clone_engine = sa.create_engine('sqlite:///' + str(restored))
    with clone_engine.begin() as c:
        assert state(c) == before
        assert YOGA.issubset(sa.inspect(c).get_table_names())
    clone_engine.dispose()


def test_used_history_downgrade_refuses_and_raw_binding_changes_refused(tmp_path):
    engine = sa.create_engine('sqlite:///' + str(tmp_path / 'used.sqlite'))
    migration = revision()
    with engine.begin() as c:
        create_baseline(c)
        with Operations.context(MigrationContext.configure(c)): migration.upgrade()
        with Session(bind=c) as db:
            created = intake(db)
            db.flush()
        for statement in ('UPDATE yoga_channel_bindings SET topic=\'other\'', 'DELETE FROM yoga_channel_bindings'):
            with pytest.raises(sa.exc.IntegrityError, match='immutable'):
                with c.begin_nested(): c.execute(sa.text(statement))
        with pytest.raises(RuntimeError, match='history exists'):
            with Operations.context(MigrationContext.configure(c)): migration.downgrade()
        assert c.execute(sa.text('SELECT count(*) FROM yoga_deliveries')).scalar_one() == 3
        assert c.execute(sa.text('SELECT count(*) FROM web_messages')).scalar_one() == 2
    engine.dispose()


PG = pytest.mark.skipif(not os.environ.get('BALI_TEST_POSTGRES_BIN'), reason='Explicit owned PostgreSQL gate not configured')


@PG
def test_postgres_additive_udu_immutable_history_guard(owned_postgres):
    schema = 'yoga_proof_' + uuid.uuid4().hex
    with owned_postgres.connect() as c:
        transaction = c.begin()
        try:
            c.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            c.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            create_baseline(c)
            before = state(c)
            migration = revision()
            with Operations.context(MigrationContext.configure(c)):
                for operation in (migration.upgrade, migration.downgrade, migration.upgrade):
                    operation()
                    assert state(c) == before
                with Session(bind=c) as db:
                    intake(db); db.flush()
                with pytest.raises(RuntimeError, match='history exists'):
                    migration.downgrade()
            with pytest.raises(sa.exc.DBAPIError, match='immutable'):
                with c.begin_nested():
                    c.execute(sa.text("UPDATE yoga_channel_bindings SET topic='other'"))
        finally:
            transaction.rollback()


@PG
def test_postgres_duplicate_updates_and_skip_locked_claims(owned_postgres):
    schema = 'yoga_concurrency_' + uuid.uuid4().hex
    with owned_postgres.begin() as c:
        c.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
        c.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
        create_baseline(c)
        with Operations.context(MigrationContext.configure(c)): revision().upgrade()

    def operation(action):
        with owned_postgres.connect() as c:
            c.execute(sa.text(f'SET search_path TO "{schema}"')); c.commit()
            with Session(bind=c) as db:
                if action == 'inbound': result = intake(db)
                else: result = service.claim(db, bot_key='safrway', policy=POLICY, now=NOW, limit=1)
                db.commit()
                return result
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(operation, ['inbound'] * 4))
        assert len({r['message_id'] for r in results}) == 1
        assert sum(not r['idempotent_replay'] for r in results) == 1
        with ThreadPoolExecutor(max_workers=4) as pool:
            batches = list(pool.map(operation, ['claim'] * 4))
        claimed = [r for batch in batches for r in batch]
        assert len(claimed) == 2 and len({r['id'] for r in claimed}) == 2
    finally:
        # Only the UUID-named synthetic schema in the owned isolated cluster.
        with owned_postgres.begin() as c:
            c.execute(sa.text(f'DROP SCHEMA "{schema}" CASCADE'))


@PG
def test_postgres_backup_restore_keeps_history_and_source_immutability(owned_postgres, tmp_path):
    """Restore an actual custom-format dump to another owned synthetic DB.

    No app/production URL, credentials or client records are loaded. The fixture
    proves a fresh cluster, private Unix socket and disabled TCP before yielding.
    """
    schema = 'yoga_restore_' + uuid.uuid4().hex
    clone_name = 'yoga_clone_' + uuid.uuid4().hex
    binaries = Path(os.environ['BALI_TEST_POSTGRES_BIN']).resolve()
    for name in ('pg_dump', 'pg_restore'):
        assert (binaries / name).is_file(), 'Owned PostgreSQL restore binary required'
    url = owned_postgres.url
    assert url.username == 'visa_workflow_test' and Path(url.host).name.startswith('visa-workflow-postgres-')
    archive = tmp_path / 'synthetic-yoga.dump'
    arguments = ['--host', url.host, '--port', str(url.port), '--username', url.username, '--no-password']
    passfile = Path(url.host) / 'empty.pgpass'
    assert passfile.is_file() and passfile.read_bytes() == b'', 'Owned empty passfile required'
    clean_environment = {'PATH': str(binaries), 'LC_ALL': 'C', 'PGPASSFILE': str(passfile)}
    clone = None
    clone_created = False
    try:
        with owned_postgres.begin() as c:
            c.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            c.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            create_baseline(c)
            with Operations.context(MigrationContext.configure(c)): revision().upgrade()
            with Session(bind=c) as db:
                intake(db); db.flush()
            before = state(c, include_yoga=True)
        subprocess.run([str(binaries / 'pg_dump'), *arguments, '--dbname', url.database,
            '--format=custom', '--schema', schema, '--file', str(archive)],
            check=True, capture_output=True, timeout=30, env=clean_environment)
        assert archive.stat().st_size > 0
        with owned_postgres.connect().execution_options(isolation_level='AUTOCOMMIT') as c:
            c.execute(sa.text(f'CREATE DATABASE "{clone_name}"')); clone_created = True
        clone = sa.create_engine(url.set(database=clone_name), poolclass=sa.pool.NullPool,
            connect_args={'connect_timeout': 2, 'passfile': str(passfile),
                'options': '-c statement_timeout=10000 -c lock_timeout=5000'})
        subprocess.run([str(binaries / 'pg_restore'), *arguments, '--dbname', clone_name,
            '--exit-on-error', '--no-owner', str(archive)], check=True, capture_output=True,
            timeout=30, env=clean_environment)
        with clone.begin() as c:
            c.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            assert state(c, include_yoga=True) == before
            with pytest.raises(sa.exc.DBAPIError, match='immutable'):
                with c.begin_nested(): c.execute(sa.text("UPDATE yoga_channel_bindings SET topic='other'"))
            with pytest.raises(RuntimeError, match='history exists'):
                with Operations.context(MigrationContext.configure(c)): revision().downgrade()
    finally:
        if clone is not None: clone.dispose()
        if clone_created:
            with owned_postgres.connect().execution_options(isolation_level='AUTOCOMMIT') as c:
                # Exact UUID-named database created above, in this owned cluster.
                c.execute(sa.text(f'DROP DATABASE "{clone_name}"'))
        with owned_postgres.begin() as c:
            c.execute(sa.text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
