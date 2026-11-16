"""Finite agent races on the existing owned, socket-only PostgreSQL fixture.

No external DB URL, production connection, new runner or local auto-bootstrap.
"""
import base64
import hashlib
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
from app.api.visa_agent import IssuedDocumentAccess, Registration, StatusObservation
from app.core.config import settings
from app.db.base import Base
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaProcess, VisaType, VisaEvent, VisaDocument
from app.models.visa_agent import VisaAgentSubmission
from app.services import visa_agent_access as access, visa_agent_operations as operations
from app.services.document_storage import commit_protected_upload, prepare_protected_document
from app.services.visa_event_guard import VisaEventGuardBlocked
from app.services.visa_lifecycle import PIIEnvelopeCipher
from tests.test_visa_workflow_postgres import owned_postgres
from tests.test_visa_agent_http import configure_issued_storage, issued_approval, SYNTHETIC_PDF

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


def prepare_test_document(factory, token, case_id, body):
    with factory() as db:
        actor = access.authenticate(db, token)
        case, _, approval = operations.issued_document_admission(db, actor, case_id)
        user_id, key = case.user_id, approval.after['document_key']
    return prepare_protected_document(body, user_id=user_id, upload_key=key,
                                      checksum=hashlib.sha256(body).hexdigest())


def test_issued_document_race_and_replay_postgres(pgdata, monkeypatch, tmp_path):
    factory, _, _ = pgdata
    storage = tmp_path / 'visa-docs'
    configure_issued_storage(monkeypatch, storage)
    second_pdf = b'%PDF-1.4\nother copy of the same synthetic visa'
    with factory.begin() as db:
        db.add(VisaType(id=2, country_code='ID', code='D1', name='Synthetic D1', version=1, active=True))
        db.flush()
        for case_id in (2, 3):
            db.add(VisaCase(id=case_id, user_id=2, visa_type_id=2, assigned_admin_id=1))
        db.flush()
        db.add(VisaDocument(user_id=2, visa_case_id=1, document_type='MANUAL', display_name='Synthetic manual',
                            storage_key='manual.enc', upload_idempotency_key='visa-issued-v1:manual-token',
                            visibility='INTERNAL', uploaded_by_admin_id=1))
        first = operations.issue_document_access(db, 1, IssuedDocumentAccess(**issued_approval(case_id=2)))
        # The two approved files have different bytes but the same visa number.
        second = operations.issue_document_access(db, 1, IssuedDocumentAccess(**issued_approval(
            case_id=3, request_id='synthetic-second-approved', pdf_sha256=hashlib.sha256(second_pdf).hexdigest())))
    first_prepared = prepare_test_document(factory, first['token'], 2, SYNTHETIC_PDF)
    second_prepared = prepare_test_document(factory, second['token'], 3, second_pdf)
    with factory() as writer, factory() as contender:
        actor = access.authenticate(writer, first['token'])
        saved = operations.import_issued_document(writer, actor, 2, 'synthetic-import-pg', first_prepared)
        other = access.authenticate(contender, second['token'])
        with pytest.raises(VisaEventGuardBlocked):
            operations.import_issued_document(contender, other, 3, 'synthetic-import-pg', second_prepared)
        contender.rollback()
        commit_protected_upload(writer)
        other = access.authenticate(contender, second['token'])
        with pytest.raises(HTTPException) as conflict:
            operations.import_issued_document(contender, other, 3, 'synthetic-import-pg', second_prepared)
        assert conflict.value.status_code == 409
        contender.rollback()
        monkeypatch.setattr(settings, 'VISA_AGENT_REFERENCE_LOOKUP_KEY', base64.urlsafe_b64encode(b'b' * 32).decode())
        other = access.authenticate(contender, second['token'])
        with pytest.raises(HTTPException) as mismatched_key:
            operations.import_issued_document(contender, other, 3, 'synthetic-import-pg', second_prepared)
        assert mismatched_key.value.status_code == 503
        contender.rollback()
        actor = access.authenticate(contender, first['token'])
        replay = operations.import_issued_document(contender, actor, 2, 'synthetic-import-pg', first_prepared)
        assert replay == saved | {'idempotent_replay': True}
        assert contender.get(VisaCase, 3).version == 1
        assert contender.query(VisaDocument).count() == 2
        assert len(list(storage.iterdir())) == 1


def test_protected_file_follows_known_and_unknown_commit_outcomes(pgdata, monkeypatch, tmp_path):
    factory, _, _ = pgdata
    storage = tmp_path / 'visa-docs'
    configure_issued_storage(monkeypatch, storage)
    unrelated = storage / 'unrelated.enc'
    unrelated.write_bytes(b'private synthetic file from another transaction')
    schema = factory.kw['bind'].get_execution_options()['schema_translate_map'][None]
    with factory.begin() as db:
        db.execute(sa.text(f'CREATE TABLE "{schema}".commit_probe (owner_id int REFERENCES '
                           f'"{schema}".users(id) DEFERRABLE INITIALLY DEFERRED)'))
        db.add(VisaType(id=2, country_code='ID', code='D1', name='Synthetic D1', version=1, active=True))
        db.flush()
        db.add(VisaCase(id=2, user_id=2, visa_type_id=2, assigned_admin_id=1))
        db.flush()
        grant = operations.issue_document_access(db, 1, IssuedDocumentAccess(**issued_approval(case_id=2)))

    prepared = prepare_test_document(factory, grant['token'], 2, SYNTHETIC_PDF)
    with factory() as db:
        db.execute(sa.text(f'INSERT INTO "{schema}".commit_probe VALUES (-1)'))
        actor = access.authenticate(db, grant['token'])
        operations.import_issued_document(db, actor, 2, 'synthetic-commit-check', prepared)
        assert len(list(storage.iterdir())) == 2
        with pytest.raises(sa.exc.IntegrityError) as rejected:
            commit_protected_upload(db)
        assert rejected.value.orig.sqlstate == '23503'
        assert list(storage.iterdir()) == [unrelated]
        assert db.get(VisaCase, 2).version == 1
        assert db.query(VisaDocument).count() == 0
        db.rollback()

        actor = access.authenticate(db, grant['token'])
        result = operations.import_issued_document(db, actor, 2, 'synthetic-commit-check', prepared)
        actual_commit = db.commit

        def lost_acknowledgement():
            actual_commit()
            raise sa.exc.DBAPIError(None, None, ConnectionError('Synthetic lost commit ACK'), connection_invalidated=True)

        monkeypatch.setattr(db, 'commit', lost_acknowledgement)
        with pytest.raises(sa.exc.DBAPIError) as unknown:
            commit_protected_upload(db)
        assert unknown.value.connection_invalidated

    with factory() as db:
        stored = db.query(VisaDocument).one()
        assert (storage / stored.storage_key).is_file()
        assert unrelated.read_bytes() == b'private synthetic file from another transaction'
        actor = access.authenticate(db, grant['token'])
        assert operations.import_issued_document(db, actor, 2, 'synthetic-commit-check', prepared) == (
            result | {'idempotent_replay': True}
        )


def test_issued_grant_migration_keeps_old_rows_and_refuses_destructive_downgrade(owned_postgres):
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/c7e4b29d1f60_allow_case_scoped_issued_document_import.py'
    spec = spec_from_file_location(path.stem, path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    schema = 'issued_migration_' + uuid.uuid4().hex
    with owned_postgres.begin() as c:
        c.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
        c.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
        c.execute(sa.text('CREATE TABLE visa_agent_credentials (id int PRIMARY KEY, operation_mask int NOT NULL, '
                          'CONSTRAINT ck_visa_agent_operations CHECK (operation_mask BETWEEN 1 AND 7))'))
        c.execute(sa.text('CREATE TABLE visa_agent_scopes (id int PRIMARY KEY, credential_id int REFERENCES '
                          'visa_agent_credentials(id), visa_case_id int, operation_mask int NOT NULL, '
                          'CONSTRAINT ck_visa_agent_scope_operations CHECK (operation_mask BETWEEN 1 AND 7))'))
        c.execute(sa.text('INSERT INTO visa_agent_credentials VALUES (1, 7)'))
        c.execute(sa.text('INSERT INTO visa_agent_scopes VALUES (1, 1, NULL, 7)'))
        with Operations.context(MigrationContext.configure(c)):
            migration.upgrade()
            migration.downgrade()
            migration.upgrade()
            assert c.execute(sa.text('SELECT * FROM visa_agent_scopes')).all() == [(1, 1, None, 7)]
            with pytest.raises(sa.exc.IntegrityError), c.begin_nested():
                c.execute(sa.text('INSERT INTO visa_agent_credentials VALUES (2, 9)'))
            c.execute(sa.text('INSERT INTO visa_agent_credentials VALUES (2, 8)'))
            with pytest.raises(sa.exc.IntegrityError), c.begin_nested():
                c.execute(sa.text('INSERT INTO visa_agent_scopes VALUES (2, 2, NULL, 8)'))
            c.execute(sa.text('INSERT INTO visa_agent_scopes VALUES (2, 2, 22, 8)'))
            with pytest.raises(RuntimeError, match='code-only rollback'):
                migration.downgrade()
            assert c.execute(sa.text('SELECT id FROM visa_agent_scopes ORDER BY id')).scalars().all() == [1, 2]
