"""Actual HTTP/session/CSRF/Bearer + SQLite transactions; no portal/Telegram I/O.

Not PostgreSQL races, installed service, or official observation verification.
"""
import base64
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
from app.models.visa_lifecycle import VisaCase, VisaType, VisaProcess, VisaEvent, VisaNotificationDelivery
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
