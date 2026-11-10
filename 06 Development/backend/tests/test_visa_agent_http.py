"""Actual HTTP/session/CSRF/Bearer + SQLite transactions; no portal/Telegram I/O.

Not PostgreSQL races, installed service, or official observation verification.
"""
import base64
import hashlib
from datetime import datetime, timedelta, timezone, date
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.api import visa_agent as api, web_portal
from app.api.web_admin import admin_csrf_token
from app.core.config import settings
from app.db.base import Base
from app.models.user import User
from app.models.web_portal import WebSession
from app.models.visa_lifecycle import VisaCase, VisaType, VisaProcess, VisaEvent, VisaNotificationDelivery, VisaDocument
from app.models.visa_agent import VisaAgentCredential, VisaAgentScope, VisaAgentSubmission
from app.services import visa_agent_operations as operations
from app.services.visa_lifecycle import PIIEnvelopeCipher


@pytest.fixture
def data(monkeypatch):
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def foreign_keys(c, _): c.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    with factory() as db:
        db.add_all([User(id=1, telegram_id=100, ref_code='OWNER', role='admin', status='active'),
            User(id=2, telegram_id=200, ref_code='PRIVATE-CLIENT', first_name='PRIVATE', status='active'),
            User(id=3, telegram_id=300, ref_code='PRIVATE-FOREIGN', status='active')])
        db.flush()
        db.add(VisaType(id=1, country_code='ID', code='E33G', name='Synthetic only', version=1, active=True, rules_verified=False))
        for actor in (1, 2):
            db.add(WebSession(user_id=actor, token_hash=web_portal.token_hash(f'synthetic-agent-owner-{actor}'),
                expires_at=now + timedelta(days=1), last_seen_at=now))
        db.commit()
    for module in (api, web_portal): monkeypatch.setattr(module, 'SessionLocal', factory)
    for key, value in {'DEFAULT_ADMIN_TELEGRAM_ID': 100, 'APPLICATION_URL': 'https://app.invalid',
        'VISA_LIFECYCLE_ENABLED': True, 'CLIENT_CABINET_ENABLED': True, 'ADMIN_CLIENT_CRM_ENABLED': True,
        'VISA_EXTERNAL_TRACKER_ENABLED': False, 'VISA_AI_IMPORT_ENABLED': False,
        'RATE_LIMIT_PER_MINUTE': 100000, 'VISA_PII_KEY_VERSION': 'test',
        'VISA_PII_KEYS': json.dumps({'test': base64.urlsafe_b64encode(b'p' * 32).decode()}),
        'VISA_AGENT_REFERENCE_LOOKUP_KEY': base64.urlsafe_b64encode(b'h' * 32).decode()}.items():
        monkeypatch.setattr(settings, key, value)
    app = FastAPI();app.include_router(api.router);app.include_router(api.owner_router)
    assert app.dependency_overrides == {}
    client = TestClient(app, raise_server_exceptions=False)
    client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, 'synthetic-agent-owner-1')
    owner = {'Origin': 'https://app.invalid', 'X-CSRF-Token': admin_csrf_token('synthetic-agent-owner-1')}
    state = {'client': client, 'factory': factory, 'now': now, 'owner': owner}
    try: yield state
    finally: client.close();engine.dispose()


def provision(d, suffix='first', mask=7, client_id=2):
    c = d['client']
    result = c.post('/api/web/admin/visa-agents', headers=d['owner'], json={
        'name': 'Synthetic agent', 'operation_mask': mask, 'expires_at': (d['now'] + timedelta(days=1)).isoformat(),
        'request_id': 'synthetic-issue-' + suffix})
    assert result.status_code == 201, result.text
    value = result.json();credential = value['credential_id']
    response = c.post(f'/api/web/admin/visa-agents/{credential}/scopes', headers=d['owner'], json={
        'client_user_id': client_id, 'operation_mask': mask, 'expires_at': (d['now'] + timedelta(hours=12)).isoformat(),
        'reason': 'Synthetic approved scope'})
    assert response.status_code == 201, response.text
    return credential, {'Authorization': 'Bearer ' + value['token']}, response.json()['scope_id']


def registration(d, **changes):
    return dict(request_id='synthetic-register-1', client_user_id=2, visa_type_id=1,
        application_reference='SYNTHETIC-APPLICATION-REFERENCE', confirmed_submission=True,
        provider='id_evisa', country_code='ID', process_type='APPLICATION', source='id_evisa_portal',
        raw_status='Waiting Verification', observed_at=(d['now'] - timedelta(hours=2)).isoformat()) | changes


def status(d, **changes):
    return dict(request_id='synthetic-status-1', expected_version=1, raw_status='Processing',
        source='id_evisa_portal', observed_at=(d['now'] - timedelta(hours=1)).isoformat()) | changes


def register(d, headers, **changes):
    result = d['client'].post('/api/visa-agent/submissions', headers=headers, json=registration(d, **changes))
    assert result.status_code == 201, result.text
    return result.json()


def counts(d):
    with d['factory']() as db:
        return [db.query(model).count() for model in (User, VisaCase, VisaProcess, VisaEvent, VisaAgentSubmission, VisaNotificationDelivery)]


ISSUED_ACCESS = '/api/web/admin/visa-agents/issued-document-access'
SYNTHETIC_PDF = b'%PDF-1.4\nsynthetic-issued-document'


def configure_issued_storage(monkeypatch, path):
    path.mkdir(mode=0o700)
    for name, value in {
        'VISA_DOCUMENT_STORAGE_ROOT': str(path), 'VISA_DOCUMENT_SCANNER_COMMAND': '/usr/bin/true',
        'VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED': True, 'VISA_DOCUMENT_RETENTION_POLICY': 'archive_only',
        'VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256': 'a' * 64,
    }.items():
        monkeypatch.setattr(settings, name, value)


@pytest.fixture
def issued_cases(data, monkeypatch, tmp_path):
    data['storage'] = tmp_path / 'visa-docs'
    configure_issued_storage(monkeypatch, data['storage'])
    with data['factory'].begin() as db:
        db.add(VisaType(id=2, country_code='ID', code='D1', name='Synthetic D1', version=1, active=True))
        db.add(VisaType(id=3, country_code='ID', code='OTHER', name='Other visa', version=1, active=True))
        db.flush()
        for case_id, user_id, type_id, custom_name in (
            (1, 2, 3, 'Indonesia D1'), (2, 3, 2, None), (3, 2, 3, 'Unrelated D1 extension'),
        ):
            db.add(VisaCase(id=case_id, user_id=user_id, visa_type_id=type_id, assigned_admin_id=1,
                           custom_visa_name=custom_name,
                           lifecycle_status='NOT_ISSUED', service_status='DOCUMENTS_REQUIRED',
                           publication_status='PUBLISHED', notifications_enabled=True))
    return data


def issued_approval(**changes):
    return {
        'request_id': 'synthetic-issued-approval', 'client_user_id': 2, 'case_id': 1, 'expected_version': 1,
        'issued_on': '2026-01-03', 'entry_deadline': '2026-12-31', 'visa_number': 'SYNTHETIC-D1-NUMBER',
        'pdf_sha256': hashlib.sha256(SYNTHETIC_PDF).hexdigest(),
    } | changes


def issue_d1(d, **changes):
    response = d['client'].post(ISSUED_ACCESS, headers=d['owner'], json=issued_approval(**changes))
    assert response.status_code == 201, response.text
    assert response.headers['cache-control'] == 'private, no-store'
    return response.json()


def upload_d1(d, token, *, case=1, request_id='synthetic-issued-import', body=SYNTHETIC_PDF, suffix=''):
    return d['client'].post(f'/api/visa-agent/cases/{case}/issued-document' + suffix, content=body, headers={
        'Authorization': f'Bearer {token}', 'Idempotency-Key': request_id, 'Content-Type': 'application/pdf',
    })


def test_owner_approves_exact_document_and_agent_imports_it_once(issued_cases):
    d = issued_cases
    c = d['client']
    assert c.post(ISSUED_ACCESS, json=issued_approval()).status_code == 403
    assert c.post(ISSUED_ACCESS, headers=d['owner'], json=issued_approval(case_id=3)).status_code == 409
    assert c.post(ISSUED_ACCESS, headers=d['owner'], json=issued_approval(entry_deadline='2025-01-01')).status_code == 422
    credential = issue_d1(d)
    token = credential['token']
    agent = {'Authorization': f'Bearer {token}'}
    active = c.post(f'{ISSUED_ACCESS}/1/status', headers=d['owner'])
    assert active.status_code == 200 and active.json() == {k: v for k, v in credential.items() if k != 'token'}
    assert c.post(ISSUED_ACCESS, headers=d['owner'], json=issued_approval(request_id='other-approved-key')).status_code == 409
    _, old, _ = provision(d)
    assert upload_d1(d, old['Authorization'][7:]).status_code == 403
    before = c.get('/api/visa-agent/cases/1', headers=agent)
    assert before.status_code == 200 and before.headers['cache-control'] == 'private, no-store'
    assert before.json() == {'case_id': 1, 'version': 1, 'lifecycle_status': 'NOT_ISSUED',
                             'issued_on': None, 'entry_deadline': None, 'document': None}
    assert c.get('/api/visa-agent/cases/2', headers=agent).status_code == 403
    assert c.post(f"/api/web/admin/visa-agents/{credential['credential_id']}/scopes", headers=d['owner'], json={
        'client_user_id': 3, 'case_id': 2, 'operation_mask': 1,
        'expires_at': (d['now'] + timedelta(hours=12)).isoformat(), 'reason': 'Synthetic grant expansion',
    }).status_code == 422
    assert c.post('/api/visa-agent/submissions', headers=agent, json=registration(d)).status_code == 403
    assert upload_d1(d, token, case=2).status_code == 403
    assert upload_d1(d, token, suffix='?notify_client=true').status_code == 422
    assert upload_d1(d, token, body=b'%PDF-wrong-bytes').status_code == 409
    response = upload_d1(d, token)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result == {'case_id': 1, 'document_id': 1, 'version': 2, 'idempotent_replay': False}
    after = c.get('/api/visa-agent/cases/1', headers=agent)
    assert after.status_code == 200
    assert after.json() == {'case_id': 1, 'version': 2, 'lifecycle_status': 'ISSUED_NOT_ACTIVATED',
                            'issued_on': '2026-01-03', 'entry_deadline': '2026-12-31',
                            'document': {'id': 1, 'checksum_sha256': hashlib.sha256(SYNTHETIC_PDF).hexdigest()}}
    assert upload_d1(d, token).json() == result | {'idempotent_replay': True}
    assert upload_d1(d, token, request_id='synthetic-new-import').status_code == 409
    assert c.post(ISSUED_ACCESS, headers=d['owner'], json=issued_approval(
        request_id='synthetic-other-number', case_id=2, client_user_id=3, visa_number='DIFFERENT-NUMBER')).status_code == 409
    assert c.post(ISSUED_ACCESS, headers=d['owner'], json=issued_approval(
        request_id='synthetic-other-file', case_id=2, client_user_id=3, visa_number='synthetic-d1-number',
        pdf_sha256=hashlib.sha256(b'%PDF-different').hexdigest())).status_code == 409
    with d['factory']() as db:
        case = db.get(VisaCase, 1)
        assert case.lifecycle_status == 'ISSUED_NOT_ACTIVATED' and case.version == 2
        assert case.issued_on == date(2026, 1, 3) and case.entry_deadline == date(2026, 12, 31)
        assert case.dates_confirmed_by == 1 and case.dates_confirmed_at
        assert case.service_status == 'DOCUMENTS_REQUIRED' and case.publication_status == 'PUBLISHED'
        assert case.entered_on is case.stay_end is case.extension_window_start is None
        assert db.query(VisaProcess).count() == db.query(VisaNotificationDelivery).count() == 0
        doc = db.query(VisaDocument).one()
        assert doc.visibility == 'INTERNAL' and doc.visa_case_id == 1
        assert doc.document_type == 'ISSUED_VISA' and doc.checksum_sha256 == hashlib.sha256(SYNTHETIC_PDF).hexdigest()
        stored = d['storage'] / doc.storage_key
        assert stored.stat().st_mode & 0o777 == 0o600
        assert SYNTHETIC_PDF not in stored.read_bytes()
        assert PIIEnvelopeCipher.from_settings().decrypt_bytes(stored.read_bytes(),
            context=f'visa-document:2:{doc.upload_idempotency_key}') == SYNTHETIC_PDF
        approved, imported = db.query(VisaEvent).order_by(VisaEvent.id).all()
        assert approved.event_type == operations.ISSUED_APPROVED and approved.actor_user_id == 1
        assert imported.event_type == operations.ISSUED_IMPORTED and imported.actor_user_id is None
        assert imported.actor_agent_credential_id == credential['credential_id']
        assert imported.after['approval_event_id'] == approved.id
        assert all(row.visibility == 'INTERNAL' and 'SYNTHETIC-D1-NUMBER' not in str(row.after)
                   for row in (approved, imported))
    assert c.post(f"/api/web/admin/visa-agents/{credential['credential_id']}/revoke",
                  headers=d['owner'], json={'reason': 'Synthetic Owner revoke'}).status_code == 200
    assert upload_d1(d, token).status_code == 401
    assert c.get('/api/visa-agent/cases/1', headers=agent).status_code == 401


def test_stale_approval_and_scanner_failure_leave_no_partial_import(issued_cases, monkeypatch):
    d = issued_cases
    token = issue_d1(d)['token']
    monkeypatch.setattr(settings, 'VISA_DOCUMENT_SCANNER_COMMAND', '/usr/bin/false')
    assert upload_d1(d, token).status_code == 422
    with d['factory'].begin() as db:
        case = db.get(VisaCase, 1)
        assert case.version == 1 and case.issued_on is None
        assert db.query(VisaDocument).count() == 0 and db.query(VisaEvent).count() == 1
        case.version = 2
    monkeypatch.setattr(settings, 'VISA_DOCUMENT_SCANNER_COMMAND', '/usr/bin/true')
    assert upload_d1(d, token).status_code == 409
    assert list(d['storage'].iterdir()) == []
    with d['factory']() as db:
        case = db.get(VisaCase, 1)
        assert case.version == 2 and case.lifecycle_status == 'NOT_ISSUED'
        assert db.query(VisaDocument).count() == 0 and db.query(VisaEvent).count() == 1


def test_three_actual_operations_keep_legal_money_and_delivery_facts_separate(data):
    credential, headers, _ = provision(data)
    first = register(data, headers)
    c = data['client'];pid, cid = first['process_id'], first['case_id']
    read = c.get(f'/api/visa-agent/cases/{cid}', headers=headers)
    assert read.status_code == 200 and read.json()['processes'][0]['external_status'] == 'WAITING_VERIFICATION'
    assert read.headers['cache-control'] == 'private, no-store'
    assert 'PRIVATE' not in read.text and 'REFERENCE' not in read.text and 'token' not in read.text
    changed = c.post(f'/api/visa-agent/processes/{pid}/observations', headers=headers, json=status(data))
    assert changed.status_code == 200 and changed.json()['version'] == 2
    before_replay = counts(data)
    replay = c.post(f'/api/visa-agent/processes/{pid}/observations', headers=headers, json=status(data))
    assert replay.status_code == 200 and replay.json() == dict(changed.json(), idempotent_replay=True)
    assert counts(data) == before_replay
    issued = c.post(f'/api/visa-agent/processes/{pid}/observations', headers=headers,
        json=status(data, request_id='synthetic-issued-1', expected_version=2, raw_status='Visa Issued',
                    observed_at=(data['now'] - timedelta(minutes=10)).isoformat()))
    assert issued.status_code == 200
    with data['factory']() as db:
        case, process = db.get(VisaCase, cid), db.get(VisaProcess, pid)
        assert (case.service_status, case.lifecycle_status, case.publication_status) == ('CLIENT_REQUESTED', 'NOT_ISSUED', 'DRAFT')
        assert case.stay_end is None and case.issued_on is None and case.dates_confirmed_by is None
        assert case.notifications_enabled is False and process.tracking_enabled is False
        assert process.external_status == 'ISSUED'
        assert PIIEnvelopeCipher.from_settings().decrypt(process.reference_envelope, context='visa-case:2:process') == registration(data)['application_reference']
        events = db.query(VisaEvent).all()
        assert all(e.actor_agent_credential_id == credential and e.actor_user_id is None for e in events)
        assert registration(data)['application_reference'] not in json.dumps([e.after for e in events])
    assert counts(data) == [3, 1, 1, 3, 1, 0]


def test_owner_csrf_and_bearer_are_distinct_and_secret_is_returned_once(data):
    c = data['client']
    body = {'name': 'Synthetic', 'operation_mask': 7, 'expires_at': (data['now'] + timedelta(days=1)).isoformat(), 'request_id': 'synthetic-unique-issue'}
    for headers in ({}, {'Origin': 'https://app.invalid'}, {**data['owner'], 'Origin': 'https://evil.invalid'}):
        assert c.post('/api/web/admin/visa-agents', headers=headers, json=body).status_code == 403
    issued = c.post('/api/web/admin/visa-agents', headers=data['owner'], json=body)
    assert issued.status_code == 201 and issued.headers['cache-control'] == 'private, no-store'
    repeat = c.post('/api/web/admin/visa-agents', headers=data['owner'], json=body)
    assert repeat.status_code == 409 and issued.json()['token'] not in repeat.text
    c.cookies.set(settings.WEB_SESSION_COOKIE_NAME, 'synthetic-agent-owner-2')
    assert c.post('/api/web/admin/visa-agents', json=body, headers={'Origin': 'https://app.invalid',
        'X-CSRF-Token': admin_csrf_token('synthetic-agent-owner-2')}).status_code == 403
    c.cookies.set(settings.WEB_SESSION_COOKIE_NAME, 'synthetic-agent-owner-1')
    assert c.get('/api/visa-agent/cases/1').status_code == 401  # Owner cookie is not machine auth.
    assert c.get('/api/visa-agent/cases/1', headers={'X-Service-Token': settings.SERVICE_API_TOKEN}).status_code == 401
    c.cookies.clear()
    assert c.post('/api/web/admin/visa-agents', headers=data['owner'], json=body).status_code == 401


def test_registration_exact_retry_natural_binding_and_changed_payload_conflict(data):
    _, headers, _ = provision(data)
    first = register(data, headers)
    replay = register(data, headers)
    assert replay == dict(first, idempotent_replay=True)
    natural = register(data, headers, request_id='synthetic-register-2')
    assert natural['already_registered'] and natural['case_id'] == first['case_id']
    changed = data['client'].post('/api/visa-agent/submissions', headers=headers,
        json=registration(data, raw_status='Processing'))
    assert changed.status_code == 409
    assert counts(data) == [3, 1, 1, 2, 1, 0]


def test_revoked_scope_and_expired_credential_deny_even_exact_replay(data):
    credential, headers, grant = provision(data)
    result = register(data, headers)
    c = data['client']
    revoked = c.post(f'/api/web/admin/visa-agents/{credential}/revoke', headers=data['owner'],
        json={'scope_id': grant, 'reason': 'Synthetic scope revoked'})
    assert revoked.status_code == 200
    assert c.post('/api/visa-agent/submissions', headers=headers, json=registration(data)).status_code == 403
    assert c.get(f"/api/visa-agent/cases/{result['case_id']}", headers=headers).status_code == 403
    with data['factory']() as db:
        db.get(VisaAgentCredential, credential).expires_at = data['now'] - timedelta(seconds=1);db.commit()
    assert c.post(f"/api/visa-agent/processes/{result['process_id']}/observations", headers=headers, json=status(data)).status_code == 401
    assert counts(data) == [3, 1, 1, 1, 1, 0]


@pytest.mark.parametrize('field', ['actor_user_id', 'actor_agent_credential_id', 'service_status', 'stay_end', 'publication_status', 'notify_client', 'payment_status', 'points'])
def test_forbidden_fields_fail_without_echo_or_mutation(data, field):
    _, headers, _ = provision(data)
    result = register(data, headers)
    response = data['client'].post(f"/api/visa-agent/processes/{result['process_id']}/observations", headers=headers,
        json=status(data, **{field: 'PRIVATE-INPUT'}))
    assert response.status_code == 422 and 'PRIVATE-INPUT' not in response.text
    assert counts(data) == [3, 1, 1, 1, 1, 0]


def test_cas_conflict_unknown_stale_and_regression_do_not_overwrite_confirmed_status(data):
    _, headers, _ = provision(data)
    result = register(data, headers, raw_status='Processing')
    url = f"/api/visa-agent/processes/{result['process_id']}/observations"
    c = data['client']
    assert c.post(url, headers=headers, json=status(data, expected_version=99)).status_code == 409
    for version, raw, minutes, outcome in [(1, 'Unknown Portal State', 60, 'UNKNOWN_STATUS'),
            (2, 'Visa Issued', 120, 'STALE_OBSERVATION'), (3, 'Waiting Payment', 30, 'STATUS_CONFLICT')]:
        response = c.post(url, headers=headers, json=status(data, request_id=f'synthetic-observed-{version}',
            expected_version=version, raw_status=raw, observed_at=(data['now'] - timedelta(minutes=minutes)).isoformat()))
        assert response.status_code == 200, response.text
        assert response.json()['observation'] == outcome
    with data['factory']() as db:
        assert db.get(VisaProcess, result['process_id']).external_status == 'PROCESSING'
        case = db.get(VisaCase, result['case_id'])
        assert case.requires_attention and case.version == 4 and case.stay_end is None
        assert case.service_status == 'CLIENT_REQUESTED' and case.publication_status == 'DRAFT'


def test_client_register_grant_does_not_read_or_bind_old_manual_case(data):
    _, headers, _ = provision(data)
    with data['factory']() as db:
        case = VisaCase(user_id=2, visa_type_id=1, assigned_admin_id=1, service_status='PAID', publication_status='PUBLISHED',
            lifecycle_status='ACTIVE', stay_end=date(2027, 1, 1), date_source='Synthetic original', dates_confirmed_by=1,
            dates_confirmed_at=data['now'])
        db.add(case);db.flush()
        process = VisaProcess(visa_case_id=case.id, process_type='APPLICATION', external_status='PROCESSING')
        db.add(process);db.commit();cid, pid = case.id, process.id
    c = data['client']
    assert c.get(f'/api/visa-agent/cases/{cid}', headers=headers).status_code == 403
    response = c.post('/api/visa-agent/submissions', headers=headers,
        json=registration(data, case_id=cid, process_id=pid, expected_version=1))
    assert response.status_code == 403
    assert counts(data) == [3, 1, 1, 0, 0, 0]


def test_fault_after_case_creation_rolls_back_all_agent_writes(data, monkeypatch):
    _, headers, _ = provision(data)
    def reject(*args, **kwargs): raise RuntimeError('synthetic injected failure')
    monkeypatch.setattr(operations, 'append_event', reject)
    response = data['client'].post('/api/visa-agent/submissions', headers=headers, json=registration(data))
    assert response.status_code == 500
    assert counts(data) == [3, 0, 0, 0, 0, 0]


def test_second_agent_or_foreign_client_cannot_duplicate_or_claim_submission(data):
    _, first_headers, _ = provision(data)
    result = register(data, first_headers)
    _, other_headers, _ = provision(data, suffix='second')
    c = data['client']
    assert c.get(f"/api/visa-agent/cases/{result['case_id']}", headers=other_headers).status_code == 403
    assert c.post('/api/visa-agent/submissions', headers=other_headers, json=registration(data)).status_code == 403
    _, foreign_headers, _ = provision(data, suffix='foreign', client_id=3)
    conflict = c.post('/api/visa-agent/submissions', headers=foreign_headers, json=registration(data, client_user_id=3))
    assert conflict.status_code == 409 and 'PRIVATE' not in conflict.text
    assert counts(data) == [3, 1, 1, 1, 1, 0]


def test_revoked_manual_case_grant_cannot_be_replaced_by_unrelated_client_grant(data):
    credential, headers, _ = provision(data)
    c = data['client']
    with data['factory']() as db:
        case = VisaCase(user_id=2, visa_type_id=1, assigned_admin_id=1, service_status='PAID', publication_status='PUBLISHED')
        db.add(case);db.flush()
        process = VisaProcess(visa_case_id=case.id, process_type='APPLICATION', external_status='UNKNOWN')
        db.add(process);db.commit();cid, pid = case.id, process.id
    granted = c.post(f'/api/web/admin/visa-agents/{credential}/scopes', headers=data['owner'], json={
        'client_user_id': 2, 'case_id': cid, 'operation_mask': 7,
        'expires_at': (data['now'] + timedelta(hours=10)).isoformat(), 'reason': 'Synthetic manual case grant'})
    assert granted.status_code == 201
    case_scope = granted.json()['scope_id']
    registered = register(data, headers, case_id=cid, process_id=pid, expected_version=1)
    assert registered['case_id'] == cid
    assert c.get(f'/api/visa-agent/cases/{cid}', headers=headers).status_code == 200
    c.post(f'/api/web/admin/visa-agents/{credential}/revoke', headers=data['owner'],
        json={'scope_id': case_scope, 'reason': 'Synthetic manual scope revoked'})
    assert c.get(f'/api/visa-agent/cases/{cid}', headers=headers).status_code == 403
    assert c.post('/api/visa-agent/submissions', headers=headers,
        json=registration(data, case_id=cid, process_id=pid, expected_version=1)).status_code == 403
    assert c.post(f'/api/visa-agent/processes/{pid}/observations', headers=headers, json=status(data, expected_version=2)).status_code == 403


def test_explicit_case_scope_precedes_client_scope_and_revoke_restores_process_boundary(data):
    credential, headers, _ = provision(data)
    first = register(data, headers)
    cid = first['case_id'];c = data['client']
    with data['factory']() as db:
        process = VisaProcess(visa_case_id=cid, process_type='EXTENSION', external_status='UNKNOWN')
        db.add(process);db.commit();second_id = process.id
    grant = c.post(f'/api/web/admin/visa-agents/{credential}/scopes', headers=data['owner'], json={
        'client_user_id': 2, 'case_id': cid, 'operation_mask': 7, 'reason': 'Synthetic explicit whole case',
        'expires_at': (data['now'] + timedelta(hours=10)).isoformat()})
    assert grant.status_code == 201
    second = register(data, headers, request_id='synthetic-register-ext', process_type='EXTENSION',
        application_reference='SYNTHETIC-SECOND-APPLICATION', case_id=cid, process_id=second_id, expected_version=1)
    assert second['process_id'] == second_id
    assert len(c.get(f'/api/visa-agent/cases/{cid}', headers=headers).json()['processes']) == 2
    response = c.post(f'/api/visa-agent/processes/{second_id}/observations', headers=headers,
        json=status(data, expected_version=2))
    assert response.status_code == 200
    assert c.post(f'/api/web/admin/visa-agents/{credential}/revoke', headers=data['owner'],
        json={'scope_id': grant.json()['scope_id'], 'reason': 'Synthetic case revoke'}).status_code == 200
    before_denied = counts(data)
    remaining = c.get(f'/api/visa-agent/cases/{cid}', headers=headers)
    assert remaining.status_code == 200
    assert [p['process_id'] for p in remaining.json()['processes']] == [first['process_id']]
    assert c.post(f'/api/visa-agent/processes/{second_id}/observations', headers=headers,
        json=status(data, expected_version=2)).status_code == 403  # Before replay.
    retry = c.post('/api/visa-agent/submissions', headers=headers, json=registration(data,
        request_id='synthetic-register-ext', process_type='EXTENSION', application_reference='SYNTHETIC-SECOND-APPLICATION',
        case_id=cid, process_id=second_id, expected_version=1))
    assert retry.status_code == 403
    assert counts(data) == before_denied
    with data['factory']() as db:
        assert db.get(VisaCase, cid).version == 3
        assert db.get(VisaProcess, second_id).external_status == 'PROCESSING'
    own = c.post(f"/api/visa-agent/processes/{first['process_id']}/observations", headers=headers,
        json=status(data, request_id='synthetic-owned-process', expected_version=3))
    assert own.status_code == 200


def test_scope_expiry_applies_to_exact_registration_replay_without_minting_new_case(data):
    credential, headers, grant = provision(data)
    first = register(data, headers)
    with data['factory']() as db:
        db.get(VisaAgentScope, grant).expires_at = data['now'] - timedelta(seconds=1);db.commit()
    c = data['client']
    assert c.post('/api/visa-agent/submissions', headers=headers, json=registration(data)).status_code == 403
    assert c.get(f"/api/visa-agent/cases/{first['case_id']}", headers=headers).status_code == 403
    assert c.post(f"/api/visa-agent/processes/{first['process_id']}/observations", headers=headers, json=status(data)).status_code == 403
    assert counts(data) == [3, 1, 1, 1, 1, 0]


@pytest.mark.parametrize('expired', [False, True])
def test_new_client_grant_does_not_inherit_prior_scope_bindings_but_explicit_case_grant_can(data, expired):
    credential, headers, original_scope = provision(data)
    first = register(data, headers);cid = first['case_id'];c = data['client']
    if expired:
        with data['factory']() as db:
            db.get(VisaAgentScope, original_scope).expires_at = data['now'] - timedelta(seconds=1);db.commit()
    assert c.post(f'/api/web/admin/visa-agents/{credential}/revoke', headers=data['owner'],
        json={'scope_id': original_scope, 'reason': 'Synthetic old scope replaced'}).status_code == 200
    new = c.post(f'/api/web/admin/visa-agents/{credential}/scopes', headers=data['owner'], json={
        'client_user_id': 2, 'operation_mask': 7, 'expires_at': (data['now'] + timedelta(hours=10)).isoformat(),
        'reason': 'Synthetic new client scope'})
    assert new.status_code == 201 and new.json()['scope_id'] != original_scope
    assert c.get(f'/api/visa-agent/cases/{cid}', headers=headers).status_code == 403
    assert c.post('/api/visa-agent/submissions', headers=headers, json=registration(data)).status_code == 403
    assert c.post(f"/api/visa-agent/processes/{first['process_id']}/observations", headers=headers, json=status(data)).status_code == 403
    assert counts(data) == [3, 1, 1, 1, 1, 0]
    case_grant = c.post(f'/api/web/admin/visa-agents/{credential}/scopes', headers=data['owner'], json={
        'client_user_id': 2, 'case_id': cid, 'operation_mask': 7, 'expires_at': (data['now'] + timedelta(hours=10)).isoformat(),
        'reason': 'Synthetic explicit old case approval'})
    assert case_grant.status_code == 201
    assert c.get(f'/api/visa-agent/cases/{cid}', headers=headers).status_code == 200
    assert register(data, headers) == dict(first, idempotent_replay=True)
    assert counts(data) == [3, 1, 1, 1, 1, 0]
