"""Three-operation visa-agent grants. Callers own the transaction and commit.

No credentials/grants are provisioned by migration or startup. No CRM User is
created for the machine. Current locks are held through replay/write/commit.
"""
import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_

from app.core.config import settings
from app.models.user import User
from app.models.visa_lifecycle import VisaCase
from app.models.visa_agent import VisaAgentCredential, VisaAgentScope, VisaAgentSubmission
from app.services.visa_event_guard import lock_visa_event_key

READ, REGISTER, STATUS = 1, 2, 4


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def deny(code=403):
    raise HTTPException(status_code=code, detail='Visa agent access denied')


def _active(row, now):
    return row is not None and row.revoked_at is None and utc(row.expires_at) > utc(now)


def _mask(value):
    if type(value) is not int or not 1 <= value <= 7:
        raise HTTPException(status_code=422, detail='Invalid visa agent operations')
    return value


def _owner(db, owner_id):
    owner = db.query(User).filter(User.id == owner_id).populate_existing().with_for_update(read=True, nowait=True).first()
    if (not owner or owner.status != 'active' or owner.role != 'admin'
            or settings.DEFAULT_ADMIN_TELEGRAM_ID <= 0 or owner.telegram_id != settings.DEFAULT_ADMIN_TELEGRAM_ID):
        deny()
    return owner


def _credential(db, credential_id, now):
    row = db.query(VisaAgentCredential).filter_by(id=credential_id).populate_existing().with_for_update(nowait=True).first()
    if not _active(row, now):
        deny()
    return row


def authenticate(db, bearer, *, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(bearer, str) or re.fullmatch(r'va_[A-Za-z0-9_-]{43}', bearer) is None:
        deny(401)
    digest = hashlib.sha256(bearer.encode('ascii')).hexdigest()
    row = db.query(VisaAgentCredential).filter_by(token_hash=digest).populate_existing().with_for_update(nowait=True).first()
    if not _active(row, now) or not hmac.compare_digest(row.token_hash, digest):
        deny(401)
    return row


def issue_credential(db, *, owner_id, name, operations, expires_at, request_key, now=None):
    now = now or datetime.now(timezone.utc)
    owner = _owner(db, owner_id)
    if (not isinstance(name, str) or not 1 <= len(name.strip()) <= 100 or
            expires_at.tzinfo is None or not utc(now) < utc(expires_at) or
            (utc(expires_at) - utc(now)).days > 90 or not isinstance(request_key, str) or
            re.fullmatch(r'[A-Za-z0-9_-]{8,80}', request_key) is None):
        raise HTTPException(status_code=422, detail='Invalid visa agent credential request')
    key = hashlib.sha256(('visa-agent-issue:' + request_key).encode()).hexdigest()
    lock_visa_event_key(db, 'visa-agent-issue:' + key)
    if db.query(VisaAgentCredential.id).filter_by(provisioning_key=key).first():
        raise HTTPException(status_code=409, detail='Credential already issued; revoke before replacing')
    raw = 'va_' + secrets.token_urlsafe(32)
    row = VisaAgentCredential(name=name.strip(), token_hash=hashlib.sha256(raw.encode('ascii')).hexdigest(),
        provisioning_key=key, operation_mask=_mask(operations), expires_at=utc(expires_at), created_by_user_id=owner.id)
    db.add(row);db.flush()
    return row, raw


def grant_scope(db, *, owner_id, credential_id, client_id, case_id, operations, expires_at, reason, now=None):
    now = now or datetime.now(timezone.utc)
    credential = _credential(db, credential_id, now)
    owner = _owner(db, owner_id)
    if (expires_at.tzinfo is None or not utc(now) < utc(expires_at) <= utc(credential.expires_at)
            or not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 300):
        raise HTTPException(status_code=422, detail='Invalid visa agent scope request')
    mask = _mask(operations)
    if mask & credential.operation_mask != mask:
        deny()
    client = db.query(User).filter_by(id=client_id, status='active').with_for_update(read=True, nowait=True).first()
    if not client:
        deny()
    if case_id is not None:
        case = db.query(VisaCase).filter_by(id=case_id, user_id=client_id).with_for_update(nowait=True).first()
        if not case or case.publication_status == 'ARCHIVED':
            deny()
    duplicate = db.query(VisaAgentScope.id).filter_by(credential_id=credential.id,
        client_user_id=client_id, visa_case_id=case_id, revoked_at=None).first()
    if duplicate:
        raise HTTPException(status_code=409, detail='Active visa agent scope already exists')
    row = VisaAgentScope(credential_id=credential.id, client_user_id=client_id, visa_case_id=case_id,
        responsible_user_id=owner.id, operation_mask=mask, expires_at=utc(expires_at),
        granted_by_user_id=owner.id, grant_reason=reason.strip())
    db.add(row);db.flush()
    return row


def authorize(db, *, credential_id, client_id, case_id, operation, now=None):
    now = now or datetime.now(timezone.utc)
    credential = _credential(db, credential_id, now)
    if type(operation) is not int or operation not in (READ, REGISTER, STATUS) or credential.operation_mask & operation != operation:
        deny()
    client = db.query(User).filter_by(id=client_id, status='active').with_for_update(read=True, nowait=True).first()
    if not client:
        deny()
    if case_id is None and operation != REGISTER:
        deny()
    case = None
    if case_id is not None:
        case = db.query(VisaCase).filter_by(id=case_id, user_id=client_id).populate_existing().with_for_update(nowait=True).first()
        if not case or case.publication_status == 'ARCHIVED':
            deny()
    candidates = db.query(VisaAgentScope).filter(VisaAgentScope.credential_id == credential.id,
        VisaAgentScope.client_user_id == client_id, VisaAgentScope.revoked_at.is_(None),
        or_(VisaAgentScope.visa_case_id == case_id, VisaAgentScope.visa_case_id.is_(None))).order_by(
            VisaAgentScope.visa_case_id.is_(None), VisaAgentScope.id).populate_existing().with_for_update(nowait=True).all()
    for scope in candidates:
        if not _active(scope, now) or scope.operation_mask & operation != operation:
            continue
        if case_id is not None and scope.visa_case_id is None:
            # A client grant never opens that client's unrelated old cases.
            owned = db.query(VisaAgentSubmission.id).filter_by(credential_id=credential.id,
                scope_id=scope.id, client_user_id=client_id, visa_case_id=case_id).first()
            if not owned:
                continue
        _owner(db, scope.responsible_user_id)
        return credential, scope, case
    deny()


def revoke(db, *, owner_id, credential_id, reason, scope_id=None, now=None):
    now = now or datetime.now(timezone.utc)
    # Revoke even an expired credential; never delete the identity or audit.
    credential = db.query(VisaAgentCredential).filter_by(id=credential_id).populate_existing().with_for_update(nowait=True).first()
    owner = _owner(db, owner_id)
    if not credential:
        deny()
    if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 300:
        raise HTTPException(status_code=422, detail='Invalid visa agent revoke reason')
    row = credential if scope_id is None else db.query(VisaAgentScope).filter_by(
        id=scope_id, credential_id=credential_id).populate_existing().with_for_update(nowait=True).first()
    if not row:
        deny()
    if row.revoked_at is None:
        row.revoked_at, row.revoked_by_user_id, row.revoke_reason = utc(now), owner.id, reason.strip()
        db.flush()
    return row


def application_fingerprint(db, *, provider, country, reference):
    if (provider != 'id_evisa' or country != 'ID' or not isinstance(reference, str)
            or re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]{2,119}', reference) is None):
        raise HTTPException(status_code=422, detail='Invalid application identity')
    if db.get_bind().dialect.name == 'postgresql' and db.connection().get_isolation_level() != 'READ COMMITTED':
        raise HTTPException(status_code=503, detail='Visa agent writer isolation unavailable')
    # Registration only, after credential verification; released at its commit.
    # Re-read the durable key id after this shared, nonblocking transaction lock.
    lock_visa_event_key(db, 'visa-agent-lookup-key-v1')
    try:
        raw = settings.VISA_AGENT_REFERENCE_LOOKUP_KEY
        key = base64.b64decode(raw + '=' * (-len(raw) % 4), altchars=b'-_', validate=True)
        if len(key) != 32:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=503, detail='Visa agent lookup key unavailable') from None
    key_id = hashlib.sha256(b'visa-agent-lookup-v1:' + key).hexdigest()
    # Fail closed on an accidental key rotation instead of creating duplicates.
    if db.query(VisaAgentSubmission.id).filter(VisaAgentSubmission.lookup_key_id != key_id).first():
        raise HTTPException(status_code=503, detail='Visa agent lookup key mismatch')
    payload = ('visa-agent-application-v1\0' + provider + '\0' + country + '\0' + reference).encode()
    return 'v1:' + hmac.new(key, payload, hashlib.sha256).hexdigest(), key_id
