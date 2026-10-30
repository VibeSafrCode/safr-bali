"""Finite observed-state operations over the existing visa domain.

Caller authenticates and owns ONE transaction through guards, event and commit.
No payment, legal dates, publication, PDF, delivery or notification mutations.
"""
import hashlib
import json
from datetime import datetime, timezone, timedelta
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy.orm.attributes import set_committed_value

from app.core.visa_workflow_statuses import _SOURCE
from app.models.visa_lifecycle import VisaCase, VisaType, VisaProcess, VisaEvent
from app.models.visa_agent import VisaAgentSubmission
from app.services import visa_agent_access as access
from app.services.visa_event_guard import lock_visa_event_key, visa_request_fingerprint, exact_visa_event_replay
from app.services.visa_lifecycle import append_event, PIIEnvelopeCipher, mask_identifier

RANK = {'WAITING_PAYMENT': 0, 'WAITING_VERIFICATION': 1, 'PROCESSING': 2, 'ISSUED': 3}


@lru_cache(maxsize=1)
def _aliases():
    # Existing shared status vocabulary; these are normalized SAFRWAY codes,
    # never a claim that the portal itself uses our internal codes.
    rows = json.loads(_SOURCE.read_text(encoding='utf8'))['external']
    return {' '.join(value.split()).casefold(): row['code'] for row in rows if row['code'] in RANK
            for value in (row['code'], *row.get('aliases', []))}


def fail(code=409):
    raise HTTPException(status_code=code, detail='Visa agent operation conflict')


def _key(credential, request_id):
    return 'visa-agent:' + hashlib.sha256(f'{credential.id}:{request_id}'.encode()).hexdigest()


def _event_replay(db, credential, key, fingerprint, event_type):
    event = db.query(VisaEvent).filter_by(idempotency_key=key).first()
    if event is None:
        return None
    exact_visa_event_replay(db, key=key, case_id=event.visa_case_id, actor_user_id=None,
        actor_agent_credential_id=credential.id, source='visa_agent', event_type=event_type, fingerprint=fingerprint)
    result = event.after.get('result')
    if not isinstance(result, dict):
        fail()
    return dict(result, idempotent_replay=True)


def _specific_process(db, credential, scope, case, process_id):
    process = db.query(VisaProcess).filter_by(id=process_id, visa_case_id=case.id).populate_existing().with_for_update(nowait=True).first()
    if process is None:
        access.deny()
    if scope.visa_case_id is None and not db.query(VisaAgentSubmission.id).filter_by(
            credential_id=credential.id, scope_id=scope.id, client_user_id=case.user_id,
            visa_case_id=case.id, visa_process_id=process.id).first():
        access.deny()
    return process


def read_case(db, credential, case_id):
    case = db.get(VisaCase, case_id)
    if not case:
        access.deny()
    _, scope, case = access.authorize(db, credential_id=credential.id, client_id=case.user_id,
        case_id=case.id, operation=access.READ)
    processes = db.query(VisaProcess).filter_by(visa_case_id=case.id)
    if scope.visa_case_id is None:
        processes = processes.filter(VisaProcess.id.in_(db.query(VisaAgentSubmission.visa_process_id).filter_by(
            credential_id=credential.id, scope_id=scope.id, client_user_id=case.user_id, visa_case_id=case.id)))
    return {'case_id': case.id, 'client_user_id': case.user_id, 'visa_type_id': case.visa_type_id,
        'country_code': case.country_code, 'version': case.version,
        'processes': [{'process_id': p.id, 'process_type': p.process_type, 'external_status': p.external_status,
                       'last_checked_at': p.last_checked_at} for p in processes.order_by(VisaProcess.id).limit(100)]}


def _observe(case, process, payload):
    observed = access.utc(payload.observed_at)
    if observed > datetime.now(timezone.utc) + timedelta(minutes=5):
        fail(422)
    target = _aliases().get(' '.join(payload.raw_status.split()).casefold())
    if process.last_checked_at and observed <= access.utc(process.last_checked_at):
        outcome = 'STALE_OBSERVATION'
    elif target is None:
        outcome = 'UNKNOWN_STATUS'
    elif process.external_status != 'UNKNOWN' and (process.external_status not in RANK or RANK[target] < RANK[process.external_status]):
        outcome = 'STATUS_CONFLICT'
    else:
        outcome = 'OBSERVED'
        if process.external_status != target:
            process.last_changed_at = observed
        process.external_status, process.raw_external_status = target, payload.raw_status
    if outcome != 'STALE_OBSERVATION':
        process.last_checked_at = observed
        process.last_error_code = None if outcome == 'OBSERVED' else 'AGENT_' + outcome
    if outcome != 'OBSERVED':
        case.requires_attention = True
        if not case.attention_reason:
            case.attention_reason = 'agent:' + outcome.lower()
    process.updated_at = datetime.now(timezone.utc)
    return outcome


def _cas(db, case, expected):
    if expected is None or case.version != expected:
        fail()
    changed = db.query(VisaCase).filter_by(id=case.id, version=expected).update(
        {'version': expected + 1, 'updated_at': datetime.now(timezone.utc)}, synchronize_session=False)
    if changed != 1:
        fail()
    set_committed_value(case, 'version', expected + 1)


def _journal(db, credential, scope, case, process, payload, *, key, fingerprint, event_type, outcome, reused=False):
    result = {'case_id': case.id, 'process_id': process.id, 'version': case.version,
              'observation': outcome, 'already_registered': reused}
    append_event(db, case, event_type=event_type, source='visa_agent', actor_user_id=None,
        actor_agent_credential_id=credential.id, visa_process_id=process.id, idempotency_key=key,
        after={'scope_id': scope.id, 'request_fingerprint': fingerprint, 'source': payload.source,
               'observed_at': payload.observed_at.isoformat(), 'raw_status': payload.raw_status,
               'result': result})
    return dict(result, idempotent_replay=False)


def register_submission(db, credential, payload):
    _, scope, case = access.authorize(db, credential_id=credential.id, client_id=payload.client_user_id,
        case_id=payload.case_id, operation=access.REGISTER)
    application, key_id = access.application_fingerprint(db, provider=payload.provider,
        country=payload.country_code, reference=payload.application_reference)
    key = _key(credential, payload.request_id)
    lock_visa_event_key(db, key)
    fingerprint = visa_request_fingerprint(dict(payload.model_dump(mode='json', exclude={'application_reference'}),
                                               application_fingerprint=application))
    binding = db.query(VisaAgentSubmission).filter_by(provider=payload.provider, country_code=payload.country_code,
        application_fingerprint=application).one_or_none()
    existing = db.query(VisaEvent).filter_by(idempotency_key=key).first()
    if existing:
        prior_case = db.get(VisaCase, existing.visa_case_id)
        if prior_case is None:
            fail()
        _, current_scope, prior_case = access.authorize(db, credential_id=credential.id, client_id=prior_case.user_id,
            case_id=prior_case.id, operation=access.REGISTER)
        _specific_process(db, credential, current_scope, prior_case, existing.visa_process_id)
        return _event_replay(db, credential, key, fingerprint, 'AGENT_SUBMISSION_REGISTERED')
    if binding:
        if (binding.client_user_id != payload.client_user_id or binding.visa_type_id != payload.visa_type_id or
                payload.case_id is not None and binding.visa_case_id != payload.case_id or
                payload.process_id is not None and binding.visa_process_id != payload.process_id):
            fail()
        _, scope, case = access.authorize(db, credential_id=credential.id, client_id=payload.client_user_id,
            case_id=binding.visa_case_id, operation=access.REGISTER)
        process = _specific_process(db, credential, scope, case, binding.visa_process_id)
        if process.process_type != payload.process_type:
            fail()
        # A new key for an already registered submission never overwrites an observation.
        return _journal(db, credential, scope, case, process, payload, key=key, fingerprint=fingerprint,
            event_type='AGENT_SUBMISSION_REGISTERED', outcome='ALREADY_REGISTERED', reused=True)
    kind = db.query(VisaType).filter_by(id=payload.visa_type_id, country_code=payload.country_code, active=True).first()
    if kind is None or kind.code == 'OTHER':
        fail(422)
    if case is None:
        case = VisaCase(user_id=payload.client_user_id, visa_type_id=kind.id, country_code=payload.country_code,
            assigned_admin_id=scope.responsible_user_id, service_status='CLIENT_REQUESTED',
            publication_status='DRAFT', notifications_enabled=False, external_tracking_enabled=False)
        db.add(case);db.flush()
        process = VisaProcess(visa_case_id=case.id, process_type=payload.process_type, external_status='UNKNOWN', tracking_enabled=False)
        db.add(process);db.flush()
    else:
        if scope.visa_case_id is None:
            # Linking an unbound manual process requires an explicit case grant.
            access.deny()
        if (case.visa_type_id != kind.id or case.country_code != payload.country_code or
                case.lifecycle_status in {'EXPIRED', 'CANCELLED', 'REFUSED'}):
            fail()
        process = db.query(VisaProcess).filter_by(id=payload.process_id, visa_case_id=case.id).populate_existing().with_for_update(nowait=True).first()
        if process is None or process.process_type != payload.process_type:
            fail()
        if process.reference_envelope and PIIEnvelopeCipher.from_settings().decrypt(
                process.reference_envelope, context=f'visa-case:{case.user_id}:process') != payload.application_reference:
            fail()
        _cas(db, case, payload.expected_version)
    if process.reference_envelope is None:
        process.reference_envelope = PIIEnvelopeCipher.from_settings().encrypt(payload.application_reference,
            context=f'visa-case:{case.user_id}:process')
        process.reference_mask = mask_identifier(payload.application_reference)
    outcome = _observe(case, process, payload)
    db.add(VisaAgentSubmission(provider=payload.provider, country_code=payload.country_code,
        application_fingerprint=application, lookup_key_id=key_id, client_user_id=case.user_id,
        visa_type_id=kind.id, visa_case_id=case.id, visa_process_id=process.id,
        credential_id=credential.id, scope_id=scope.id))
    db.flush()
    return _journal(db, credential, scope, case, process, payload, key=key, fingerprint=fingerprint,
        event_type='AGENT_SUBMISSION_REGISTERED', outcome=outcome)


def observe_status(db, credential, process_id, payload):
    process = db.get(VisaProcess, process_id)
    case = db.get(VisaCase, process.visa_case_id) if process else None
    if not case:
        access.deny()
    _, scope, case = access.authorize(db, credential_id=credential.id, client_id=case.user_id,
        case_id=case.id, operation=access.STATUS)
    process = _specific_process(db, credential, scope, case, process_id)
    key = _key(credential, payload.request_id)
    lock_visa_event_key(db, key)
    fingerprint = visa_request_fingerprint(dict(payload.model_dump(mode='json'), process_id=process.id))
    replay = _event_replay(db, credential, key, fingerprint, 'AGENT_STATUS_OBSERVED')
    if replay is not None:
        return replay
    if case.lifecycle_status in {'EXPIRED', 'CANCELLED', 'REFUSED'}:
        fail()
    _cas(db, case, payload.expected_version)
    outcome = _observe(case, process, payload)
    return _journal(db, credential, scope, case, process, payload, key=key, fingerprint=fingerprint,
        event_type='AGENT_STATUS_OBSERVED', outcome=outcome)
