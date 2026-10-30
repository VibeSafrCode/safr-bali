"""Finite agent races on the existing owned, socket-only PostgreSQL fixture.

No external DB URL, production connection, new runner or local auto-bootstrap.
"""
import base64
from datetime import datetime, timedelta, timezone
from importlib.util import spec_from_file_location, module_from_spec
import json
import os
from pathlib import Path
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

import app.models
from app.api.visa_agent import Registration, StatusObservation
from app.core.config import settings
from app.db.base import Base
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaProcess, VisaType, VisaEvent
from app.models.visa_agent import VisaAgentSubmission
from app.services import visa_agent_access as access, visa_agent_operations as operations
from app.services.visa_event_guard import VisaEventGuardBlocked
from app.services.visa_lifecycle import PIIEnvelopeCipher
from tests.test_visa_workflow_postgres import owned_postgres

pytestmark = pytest.mark.skipif(not os.environ.get('BALI_TEST_POSTGRES_BIN'),
                              reason='Requires existing owned PostgreSQL runtime')
REFERENCE = 'SYNTHETIC-PG-APPLICATION-1'


@pytest.fixture
def pgdata(owned_postgres, monkeypatch):
    schema = 'visa_agent_' + uuid.uuid4().hex
    with owned_postgres.begin() as c: c.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
    bind = owned_postgres.execution_options(schema_translate_map={None: schema})
    Base.metadata.create_all(bind)
    factory = sessionmaker(bind=bind, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(settings, 'DEFAULT_ADMIN_TELEGRAM_ID', 100)
    monkeypatch.setattr(settings, 'VISA_PII_KEY_VERSION', 'synthetic')
    monkeypatch.setattr(settings, 'VISA_PII_KEYS', json.dumps({'synthetic': base64.urlsafe_b64encode(b'p' * 32).decode()}))
    monkeypatch.setattr(settings, 'VISA_AGENT_REFERENCE_LOOKUP_KEY', base64.urlsafe_b64encode(b'a' * 32).decode())
    with factory() as db:
        db.add_all([User(id=1, telegram_id=100, ref_code='PG-OWNER', role='admin', status='active'),
            User(id=2, telegram_id=200, ref_code='PG-CLIENT', status='active')]);db.flush()
        db.add(VisaType(id=1, country_code='ID', code='E33G', name='Synthetic PG only', version=1, active=True));db.flush()
        db.add(VisaCase(id=1, user_id=2, visa_type_id=1, assigned_admin_id=1, service_status='CLIENT_REQUESTED',
            notifications_enabled=False));db.flush()
        db.add(VisaProcess(id=1, visa_case_id=1, process_type='APPLICATION', external_status='UNKNOWN',
            reference_envelope=PIIEnvelopeCipher.from_settings().encrypt(REFERENCE, context='visa-case:2:process')))
        credentials = []
        for index in range(2):
            credential, raw = access.issue_credential(db, owner_id=1, name='Synthetic PG agent', operations=7,
                expires_at=now + timedelta(days=1), request_key=f'synthetic-pg-issue-{index}', now=now)
            scope = access.grant_scope(db, owner_id=1, credential_id=credential.id, client_id=2, case_id=None,
                operations=7, expires_at=now + timedelta(hours=12), reason='Synthetic PG grant', now=now)
            credentials.append((credential.id, raw, scope.id))
        db.commit()
    yield factory, credentials, now
    # The existing module fixture removes its entire owned synthetic cluster.


def binding(db, credential, scope, fingerprint, key_id):
    db.add(VisaAgentSubmission(provider='id_evisa', country_code='ID', application_fingerprint=fingerprint,
        lookup_key_id=key_id, client_user_id=2, visa_type_id=1, visa_case_id=1, visa_process_id=1,
        credential_id=credential.id, scope_id=scope.id))
    db.flush()


def test_first_binding_two_credentials_and_different_keys_cannot_create_duplicate(pgdata, monkeypatch):
    factory, credentials, now = pgdata
    with factory() as first, factory() as second:
        actor = access.authenticate(first, credentials[0][1])
        _, scope, _ = access.authorize(first, credential_id=actor.id, client_id=2, case_id=None, operation=access.REGISTER)
        fingerprint, key_id = access.application_fingerprint(first, provider='id_evisa', country='ID', reference=REFERENCE)
        binding(first, actor, scope, fingerprint, key_id)
        monkeypatch.setattr(settings, 'VISA_AGENT_REFERENCE_LOOKUP_KEY', base64.urlsafe_b64encode(b'b' * 32).decode())
        other = access.authenticate(second, credentials[1][1])
        access.authorize(second, credential_id=other.id, client_id=2, case_id=None, operation=access.REGISTER)
        with pytest.raises(VisaEventGuardBlocked, match='BUSY'):
            access.application_fingerprint(second, provider='id_evisa', country='ID', reference=REFERENCE)
        second.rollback();first.commit()
        access.authenticate(second, credentials[1][1])
        with pytest.raises(HTTPException) as error:
            access.application_fingerprint(second, provider='id_evisa', country='ID', reference=REFERENCE)
        assert error.value.status_code == 503
        second.rollback()
    monkeypatch.setattr(settings, 'VISA_AGENT_REFERENCE_LOOKUP_KEY', base64.urlsafe_b64encode(b'a' * 32).decode())
    with factory() as owner:
        access.grant_scope(owner, owner_id=1, credential_id=credentials[1][0], client_id=2, case_id=1,
            operations=7, expires_at=now + timedelta(hours=10), reason='Synthetic explicit same application')
        owner.commit()
    with factory() as second:
        actor = access.authenticate(second, credentials[1][1])
        payload = Registration(request_id='synthetic-pg-existing-app', client_user_id=2, visa_type_id=1,
            application_reference=REFERENCE, confirmed_submission=True, provider='id_evisa', country_code='ID',
            process_type='APPLICATION', source='id_evisa_portal', raw_status='Waiting Verification', observed_at=now)
        result = operations.register_submission(second, actor, payload);second.commit()
        assert result['already_registered'] and result['case_id'] == 1 and result['process_id'] == 1
        assert second.query(VisaCase).count() == second.query(VisaProcess).count() == second.query(VisaAgentSubmission).count() == 1


def test_inflight_revoke_and_case_cas_have_ordered_commit_retry_without_lost_update(pgdata):
    factory, credentials, now = pgdata
    with factory() as owner:
        actor = access.authenticate(owner, credentials[0][1])
        _, scope, _ = access.authorize(owner, credential_id=actor.id, client_id=2, case_id=None, operation=access.REGISTER)
        fingerprint, key_id = access.application_fingerprint(owner, provider='id_evisa', country='ID', reference=REFERENCE)
        binding(owner, actor, scope, fingerprint, key_id);owner.commit()
        access.grant_scope(owner, owner_id=1, credential_id=credentials[1][0], client_id=2, case_id=1,
            operations=7, expires_at=now + timedelta(hours=10), reason='Synthetic CAS participant');owner.commit()
    payload = StatusObservation(request_id='synthetic-pg-status-one', expected_version=1,
        raw_status='Processing', source='id_evisa_portal', observed_at=now)
    competing = payload.model_copy(update={'request_id': 'synthetic-pg-status-two', 'raw_status': 'Visa Issued'})
    with factory() as first, factory() as second:
        actor = access.authenticate(first, credentials[0][1])
        result = operations.observe_status(first, actor, 1, payload)
        assert result['version'] == 2
        with pytest.raises(sa.exc.DBAPIError) as revoke_conflict:
            access.revoke(second, owner_id=1, credential_id=actor.id, reason='Synthetic in-flight revoke')
        assert revoke_conflict.value.orig.sqlstate == '55P03'
        second.rollback()
        other = access.authenticate(second, credentials[1][1])
        with pytest.raises(sa.exc.DBAPIError) as case_conflict:
            operations.observe_status(second, other, 1, competing)
        assert case_conflict.value.orig.sqlstate == '55P03'
        second.rollback();first.commit()
        other = access.authenticate(second, credentials[1][1])
        with pytest.raises(HTTPException) as error: operations.observe_status(second, other, 1, competing)
        assert error.value.status_code == 409
        second.rollback()
        access.revoke(second, owner_id=1, credential_id=credentials[0][0], reason='Synthetic committed revoke');second.commit()
        with pytest.raises(HTTPException) as error: access.authenticate(first, credentials[0][1])
        assert error.value.status_code == 401
        first.rollback()
        assert second.get(VisaCase, 1).version == 2
        assert second.get(VisaProcess, 1).external_status == 'PROCESSING'
        assert second.query(VisaEvent).count() == 1


def test_actual_additive_upgrade_preserves_old_columns_on_postgres(owned_postgres):
    schema = 'visa_agent_migration_' + uuid.uuid4().hex
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/f13a7c5d920b_add_finite_visa_agent_identity.py'
    spec = spec_from_file_location(path.stem, path);migration = module_from_spec(spec);spec.loader.exec_module(migration)
    with owned_postgres.begin() as c:
        c.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
        c.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
        for name in ('users', 'visa_types', 'visa_cases', 'visa_processes'):
            c.execute(sa.text(f'CREATE TABLE {name} (id INTEGER PRIMARY KEY)'))
            c.execute(sa.text(f'INSERT INTO {name} VALUES (1)'))
        c.execute(sa.text('CREATE TABLE visa_events (id INTEGER PRIMARY KEY, actor_user_id INTEGER, source VARCHAR(40), body TEXT)'))
        c.execute(sa.text("INSERT INTO visa_events VALUES (1,1,'admin','unchanged human history')"))
        before = c.execute(sa.text('SELECT id,actor_user_id,source,body FROM visa_events')).all()
        with Operations.context(MigrationContext.configure(c)): migration.upgrade()
        assert c.execute(sa.text('SELECT id,actor_user_id,source,body FROM visa_events')).all() == before
        assert c.execute(sa.text('SELECT actor_agent_credential_id FROM visa_events')).scalar_one() is None
        for name in ('visa_agent_credentials', 'visa_agent_scopes', 'visa_agent_submissions'):
            assert c.execute(sa.text(f'SELECT count(*) FROM {name}')).scalar_one() == 0
