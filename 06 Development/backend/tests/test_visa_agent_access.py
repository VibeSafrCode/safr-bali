"""Actual finite grant/lookup/replay services on synthetic SQLite; not PG races."""
import base64
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.models
from app.db.base import Base
from app.core.config import settings
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaType, VisaProcess, VisaEvent
from app.models.visa_agent import VisaAgentCredential, VisaAgentScope, VisaAgentSubmission
from app.services import visa_agent_access as access
from app.services.visa_lifecycle import append_event, VisaLifecycleError
from app.services.visa_event_guard import exact_visa_event_replay, visa_request_fingerprint, VisaEventGuardBlocked

NOW = datetime(2026, 10, 30, 9, tzinfo=timezone.utc)


@pytest.fixture
def data(monkeypatch):
    engine = create_engine('sqlite:///:memory:')
    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    root = User(telegram_id=100, ref_code='agent-root', role='admin', status='active')
    client = User(telegram_id=200, ref_code='agent-client', status='active')
    foreign = User(telegram_id=300, ref_code='agent-foreign', status='active')
    db.add_all([root, client, foreign]);db.flush()
    kind = VisaType(country_code='ID', code='E33G', name='Synthetic only', version=1, rules_verified=False)
    db.add(kind);db.flush()
    case = VisaCase(user_id=client.id, visa_type_id=kind.id, assigned_admin_id=root.id)
    db.add(case);db.commit()
    monkeypatch.setattr(settings, 'DEFAULT_ADMIN_TELEGRAM_ID', 100)
    monkeypatch.setattr(settings, 'VISA_AGENT_REFERENCE_LOOKUP_KEY', base64.urlsafe_b64encode(b'x' * 32).decode())
    try: yield db, factory, root, client, foreign, case
    finally: db.close();engine.dispose()


def issue(db, root, **changes):
    return access.issue_credential(db, **dict(owner_id=root.id, name='Synthetic agent', operations=7,
        expires_at=NOW + timedelta(days=1), request_key='synthetic-agent-issue', now=NOW, **changes))


def scope(db, root, credential, client, **changes):
    values = dict(owner_id=root.id, credential_id=credential.id, client_id=client.id, case_id=None,
        operations=7, expires_at=NOW + timedelta(hours=12), reason='Synthetic approved scope', now=NOW)
    return access.grant_scope(db, **(values | changes))


def denied(call, code=403):
    with pytest.raises(HTTPException) as error: call()
    assert error.value.status_code == code
    assert 'va_' not in error.value.detail


def test_machine_identity_is_not_user_token_shown_once_and_expiry_is_enforced(data):
    db, _, root, client, _, _ = data
    before = db.query(User).count()
    credential, raw = issue(db, root);db.commit()
    assert db.query(User).count() == before
    assert raw not in str(db.execute(select(VisaAgentCredential.__table__)).all())
    assert access.authenticate(db, raw, now=NOW).id == credential.id
    denied(lambda: access.authenticate(db, 'service-or-owner-token', now=NOW), 401)
    denied(lambda: access.authenticate(db, raw, now=NOW + timedelta(days=1)), 401)
    denied(lambda: issue(db, root), 409)
    denied(lambda: access.issue_credential(db, owner_id=client.id, name='other', operations=7,
        expires_at=NOW + timedelta(days=1), request_key='other-synthetic-key', now=NOW))


def test_client_register_grant_does_not_open_old_cases_or_foreign_clients(data):
    db, _, root, client, foreign, case = data
    credential, _ = issue(db, root)
    granted = scope(db, root, credential, client);db.commit()
    assert access.authorize(db, credential_id=credential.id, client_id=client.id, case_id=None,
        operation=access.REGISTER, now=NOW)[1].id == granted.id
    for operation in (access.READ, access.STATUS, True):
        denied(lambda: access.authorize(db, credential_id=credential.id, client_id=client.id,
            case_id=case.id, operation=operation, now=NOW))
    denied(lambda: access.authorize(db, credential_id=credential.id, client_id=foreign.id,
        case_id=None, operation=access.REGISTER, now=NOW))
    denied(lambda: scope(db, root, credential, foreign, case_id=case.id))


def test_explicit_case_scope_and_revocation_are_fresh_even_with_cached_objects(data):
    db, factory, root, client, _, case = data
    credential, raw = issue(db, root)
    granted = scope(db, root, credential, client, case_id=case.id, operations=access.READ);db.commit()
    assert access.authorize(db, credential_id=credential.id, client_id=client.id, case_id=case.id,
        operation=access.READ, now=NOW)[1].id == granted.id
    db.commit()
    with factory() as other:
        access.revoke(other, owner_id=root.id, credential_id=credential.id, scope_id=granted.id,
            reason='Synthetic scope revoked', now=NOW);other.commit()
    denied(lambda: access.authorize(db, credential_id=credential.id, client_id=client.id,
        case_id=case.id, operation=access.READ, now=NOW))
    access.revoke(db, owner_id=root.id, credential_id=credential.id, reason='Synthetic credential revoked', now=NOW);db.commit()
    denied(lambda: access.authenticate(db, raw, now=NOW), 401)
    assert db.execute(select(VisaAgentScope.revoked_at).where(VisaAgentScope.id == granted.id)).scalar_one() is not None
    assert db.get(VisaAgentCredential, credential.id) is not None


def test_masks_expiry_and_revoked_owner_cannot_expand_access(data):
    db, _, root, client, _, case = data
    credential, _ = issue(db, root)
    granted = scope(db, root, credential, client, case_id=case.id, operations=access.READ)
    denied(lambda: access.authorize(db, credential_id=credential.id, client_id=client.id,
        case_id=case.id, operation=access.STATUS, now=NOW))
    denied(lambda: access.authorize(db, credential_id=credential.id, client_id=client.id,
        case_id=case.id, operation=access.READ, now=NOW + timedelta(hours=12)))
    root.status = 'blocked';db.flush()
    denied(lambda: access.authorize(db, credential_id=credential.id, client_id=client.id,
        case_id=case.id, operation=access.READ, now=NOW))
    assert granted.revoked_at is None


def test_binding_lookup_is_stable_across_token_rotation_but_key_drift_fails_closed(data, monkeypatch):
    db, _, root, client, _, case = data
    credential, _ = issue(db, root)
    granted = scope(db, root, credential, client)
    first, key_id = access.application_fingerprint(db, provider='id_evisa', country='ID', reference='2221026C1234567')
    process = VisaProcess(visa_case_id=case.id, process_type='APPLICATION', external_status='UNKNOWN')
    db.add(process);db.flush()
    binding = VisaAgentSubmission(provider='id_evisa', country_code='ID', application_fingerprint=first,
        lookup_key_id=key_id, client_user_id=client.id, visa_type_id=case.visa_type_id, visa_case_id=case.id,
        visa_process_id=process.id, credential_id=credential.id, scope_id=granted.id)
    db.add(binding);db.commit()
    credential.token_hash = '0' * 64;db.flush()
    assert access.application_fingerprint(db, provider='id_evisa', country='ID', reference='2221026C1234567') == (first, key_id)
    assert '2221026C1234567' not in first
    assert access.authorize(db, credential_id=credential.id, client_id=client.id,
        case_id=case.id, operation=access.READ, now=NOW)[2].id == case.id
    monkeypatch.setattr(settings, 'VISA_AGENT_REFERENCE_LOOKUP_KEY', base64.urlsafe_b64encode(b'y' * 32).decode())
    denied(lambda: access.application_fingerprint(db, provider='id_evisa', country='ID', reference='2221026C1234567'), 503)


def test_machine_audit_exact_replay_keeps_human_contract_separate(data):
    db, _, root, _, _, case = data
    credential, _ = issue(db, root)
    fingerprint = visa_request_fingerprint({'operation': 'synthetic'})
    append_event(db, case, event_type='AGENT_OBSERVED', source='visa_agent', actor_user_id=None,
        actor_agent_credential_id=credential.id, idempotency_key='synthetic-agent-event-1', after={'request_fingerprint': fingerprint})
    common = dict(key='synthetic-agent-event-1', case_id=case.id, source='visa_agent', event_type='AGENT_OBSERVED', fingerprint=fingerprint)
    assert exact_visa_event_replay(db, actor_user_id=None, actor_agent_credential_id=credential.id, **common)
    with pytest.raises(VisaEventGuardBlocked): exact_visa_event_replay(db, actor_user_id=None, **common)
    with pytest.raises(VisaLifecycleError):
        append_event(db, case, event_type='AGENT_OBSERVED', source='visa_agent', actor_user_id=root.id, actor_agent_credential_id=credential.id)
    human = append_event(db, case, event_type='SYNTHETIC', source='admin', actor_user_id=root.id,
        idempotency_key='synthetic-human-event-1', after={'request_fingerprint': fingerprint})
    assert human.actor_agent_credential_id is None
    assert exact_visa_event_replay(db, key=human.idempotency_key, case_id=case.id, actor_user_id=root.id,
        source='admin', event_type='SYNTHETIC', fingerprint=fingerprint)


def test_multiple_applications_use_existing_case_but_application_and_process_remain_unique(data):
    db, _, root, client, _, case = data
    credential, _ = issue(db, root)
    granted = scope(db, root, credential, client)
    processes = [VisaProcess(visa_case_id=case.id, process_type=kind, external_status='UNKNOWN')
                 for kind in ('APPLICATION', 'EXTENSION')]
    db.add_all(processes);db.flush()
    bindings = []
    with patch.object(access, 'lock_visa_event_key', wraps=access.lock_visa_event_key) as lock:
        for index, process in enumerate(processes):
            fingerprint, key_id = access.application_fingerprint(db, provider='id_evisa', country='ID', reference=f'SYNTHETIC-APPLICATION-{index}')
            binding = VisaAgentSubmission(provider='id_evisa', country_code='ID', application_fingerprint=fingerprint,
                lookup_key_id=key_id, client_user_id=client.id, visa_type_id=case.visa_type_id, visa_case_id=case.id,
                visa_process_id=process.id, credential_id=credential.id, scope_id=granted.id)
            db.add(binding);db.flush();bindings.append(binding)
        assert [call.args[1] for call in lock.call_args_list] == ['visa-agent-lookup-key-v1'] * 2
    assert db.query(VisaAgentSubmission).filter_by(visa_case_id=case.id).count() == 2
    extra_process = VisaProcess(visa_case_id=case.id, process_type='APPLICATION', external_status='UNKNOWN')
    db.add(extra_process);db.flush()
    with pytest.raises(IntegrityError, match='provider.*country_code.*application_fingerprint'):
        with db.begin_nested():
            db.add(VisaAgentSubmission(provider='id_evisa', country_code='ID', application_fingerprint=bindings[0].application_fingerprint,
                lookup_key_id=key_id, client_user_id=client.id, visa_type_id=case.visa_type_id, visa_case_id=case.id,
                visa_process_id=extra_process.id, credential_id=credential.id, scope_id=granted.id))
            db.flush()
    with pytest.raises(IntegrityError, match='visa_process_id'):
        with db.begin_nested():
            db.add(VisaAgentSubmission(provider='id_evisa', country_code='ID', application_fingerprint='v1:' + 'f' * 64,
                lookup_key_id=key_id, client_user_id=client.id, visa_type_id=case.visa_type_id, visa_case_id=case.id,
                visa_process_id=processes[1].id, credential_id=credential.id, scope_id=granted.id))
            db.flush()
    assert db.query(VisaAgentSubmission).count() == 2


def test_ordinary_grant_reads_do_not_take_registration_lookup_lock(data):
    db, _, root, client, _, case = data
    credential, raw = issue(db, root)
    scope(db, root, credential, client, case_id=case.id, operations=access.READ)
    with patch.object(access, 'lock_visa_event_key', wraps=access.lock_visa_event_key) as lock:
        access.authenticate(db, raw, now=NOW)
        access.authorize(db, credential_id=credential.id, client_id=client.id,
            case_id=case.id, operation=access.READ, now=NOW)
        lock.assert_not_called()
