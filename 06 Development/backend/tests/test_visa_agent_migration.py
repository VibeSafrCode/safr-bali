"""Execute the actual additive migration over a minimal legacy SQLite schema.

This preserves representative old rows, not a PG restore/concurrency proof.
"""
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa


def test_actual_upgrade_preserves_human_event_and_provisions_nothing():
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/f13a7c5d920b_add_finite_visa_agent_identity.py'
    spec = spec_from_file_location(path.stem, path)
    migration = module_from_spec(spec);spec.loader.exec_module(migration)
    assert migration.down_revision == 'e73b2c9a610f'
    engine = sa.create_engine('sqlite:///:memory:')
    try:
        with engine.begin() as c:
            for name in ('users', 'visa_types', 'visa_cases', 'visa_processes'):
                c.execute(sa.text(f'CREATE TABLE {name} (id INTEGER PRIMARY KEY)'))
                c.execute(sa.text(f'INSERT INTO {name} (id) VALUES (1)'))
            c.execute(sa.text('CREATE TABLE visa_events (id INTEGER PRIMARY KEY, actor_user_id INTEGER, source VARCHAR(40), body TEXT)'))
            c.execute(sa.text("INSERT INTO visa_events VALUES (1,1,'admin','existing private history')"))
            before = c.execute(sa.text('SELECT id,actor_user_id,source,body FROM visa_events')).all()
            with Operations.context(MigrationContext.configure(c)):
                migration.upgrade()
            assert c.execute(sa.text('SELECT id,actor_user_id,source,body FROM visa_events')).all() == before
            assert c.execute(sa.text('SELECT actor_agent_credential_id FROM visa_events')).scalar_one() is None
            for name in ('visa_agent_credentials', 'visa_agent_scopes', 'visa_agent_submissions'):
                assert c.execute(sa.text(f'SELECT count(*) FROM {name}')).scalar_one() == 0
            indexes = {i['name'] for i in sa.inspect(c).get_indexes('visa_agent_scopes')}
            assert indexes == {'uq_visa_agent_client_scope', 'uq_visa_agent_case_scope'}
            with pytest.raises(sa.exc.IntegrityError):
                with c.begin_nested():
                    c.execute(sa.text("INSERT INTO visa_events VALUES (2,1,'admin','invalid dual actor',1)"))
            with pytest.raises(RuntimeError, match='additive'):
                with Operations.context(MigrationContext.configure(c)): migration.downgrade()
    finally:
        engine.dispose()
