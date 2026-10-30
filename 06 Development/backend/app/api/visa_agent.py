"""Three finite machine operations plus existing Owner-authorized provisioning."""
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.api.web_admin import require_admin_write
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.user import User
from app.services import visa_agent_access as access, visa_agent_operations as operations
from app.services.visa_event_guard import VisaEventGuardBlocked
from app.services.visa_lifecycle import ensure_feature_enabled, VisaLifecycleError, PIIConfigurationError


class PrivateValidationRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def private(request):
            try:
                return await handler(request)
            except RequestValidationError:
                return reply({'detail': 'Invalid visa agent request'}, status=422)
        return private


router = APIRouter(prefix='/api/visa-agent', tags=['visa-agent'], route_class=PrivateValidationRoute,
                   dependencies=[Depends(rate_limit)])
owner_router = APIRouter(prefix='/api/web/admin/visa-agents', tags=['web-admin'], route_class=PrivateValidationRoute,
                         dependencies=[Depends(rate_limit)])
Positive = Annotated[StrictInt, Field(gt=0)]
Mask = Annotated[StrictInt, Field(ge=1, le=7)]
Key = Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{8,80}$')]


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)


class Observation(StrictRequest):
    request_id: Key
    raw_status: str = Field(min_length=1, max_length=80, pattern=r'^[A-Za-z0-9 _&/-]+$')
    source: Literal['id_evisa_portal']
    observed_at: datetime

    @field_validator('observed_at')
    @classmethod
    def aware_observation(cls, value):
        if value.tzinfo is None:
            raise ValueError('Timezone required')
        return value.astimezone(timezone.utc)


class Registration(Observation):
    client_user_id: Positive
    visa_type_id: Positive
    application_reference: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9._/-]{2,119}$')
    confirmed_submission: Literal[True]
    provider: Literal['id_evisa']
    country_code: Literal['ID']
    process_type: Literal['APPLICATION', 'EXTENSION']
    case_id: Positive | None = None
    process_id: Positive | None = None
    expected_version: Positive | None = None

    @model_validator(mode='after')
    def explicit_existing_process(self):
        if (self.case_id is None) != (self.process_id is None) or (self.case_id is None) != (self.expected_version is None):
            raise ValueError('Existing process requires case and version')
        return self


class StatusObservation(Observation):
    expected_version: Positive


class CredentialRequest(StrictRequest):
    name: str = Field(min_length=1, max_length=100)
    operation_mask: Mask
    expires_at: datetime
    request_id: Key


class ScopeRequest(StrictRequest):
    client_user_id: Positive
    case_id: Positive | None = None
    operation_mask: Mask
    expires_at: datetime
    reason: str = Field(min_length=3, max_length=300)


class RevokeRequest(StrictRequest):
    scope_id: Positive | None = None
    reason: str = Field(min_length=3, max_length=300)


def reply(value, *, status=200):
    return JSONResponse(jsonable_encoder(value), status_code=status, headers={
        'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow'})


@contextmanager
def transaction():
    db = SessionLocal()
    try:
        ensure_feature_enabled()
        if db.get_bind().dialect.name == 'postgresql':
            db.execute(text("SET LOCAL statement_timeout = '5s'"))
            db.execute(text("SET LOCAL lock_timeout = '1s'"))
        yield db
        db.commit()
    except (VisaEventGuardBlocked, IntegrityError, DBAPIError):
        db.rollback()
        raise HTTPException(status_code=409, detail='Visa agent conflict; retry the same request') from None
    except (PIIConfigurationError, VisaLifecycleError):
        db.rollback()
        raise HTTPException(status_code=503, detail='Visa agent operation unavailable') from None
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def principal(db, authorization, request):
    if request.query_params:
        raise HTTPException(status_code=422, detail='Unexpected visa agent parameter')
    if not isinstance(authorization, str) or not authorization.startswith('Bearer '):
        access.deny(401)
    return access.authenticate(db, authorization[7:])


@router.get('/cases/{case_id}')
def read(case_id: int, request: Request, authorization: str = Header(default='')):
    with transaction() as db:
        actor = principal(db, authorization, request)
        value = operations.read_case(db, actor, case_id)
    return reply(value)


@router.post('/submissions', status_code=201)
def register(payload: Registration, request: Request, authorization: str = Header(default='')):
    with transaction() as db:
        actor = principal(db, authorization, request)
        value = operations.register_submission(db, actor, payload)
    return reply(value, status=201)


@router.post('/processes/{process_id}/observations')
def observe(process_id: int, payload: StatusObservation, request: Request, authorization: str = Header(default='')):
    with transaction() as db:
        actor = principal(db, authorization, request)
        value = operations.observe_status(db, actor, process_id, payload)
    return reply(value)


@owner_router.post('', status_code=201)
def issue(payload: CredentialRequest, owner: User = Depends(require_admin_write)):
    if payload.expires_at.tzinfo is None:
        raise HTTPException(status_code=422, detail='Timezone required')
    with transaction() as db:
        credential, secret = access.issue_credential(db, owner_id=owner.id, name=payload.name,
            operations=payload.operation_mask, expires_at=payload.expires_at, request_key=payload.request_id)
        value = {'credential_id': credential.id, 'token': secret, 'expires_at': credential.expires_at}
    return reply(value, status=201)


@owner_router.post('/{credential_id}/scopes', status_code=201)
def grant(credential_id: int, payload: ScopeRequest, owner: User = Depends(require_admin_write)):
    if payload.expires_at.tzinfo is None:
        raise HTTPException(status_code=422, detail='Timezone required')
    with transaction() as db:
        scope = access.grant_scope(db, owner_id=owner.id, credential_id=credential_id, client_id=payload.client_user_id,
            case_id=payload.case_id, operations=payload.operation_mask, expires_at=payload.expires_at, reason=payload.reason)
        value = {'scope_id': scope.id, 'credential_id': scope.credential_id, 'expires_at': scope.expires_at}
    return reply(value, status=201)


@owner_router.post('/{credential_id}/revoke')
def revoke(credential_id: int, payload: RevokeRequest, owner: User = Depends(require_admin_write)):
    with transaction() as db:
        result = access.revoke(db, owner_id=owner.id, credential_id=credential_id, scope_id=payload.scope_id, reason=payload.reason)
        value = {'revoked': True, 'scope_id': payload.scope_id, 'credential_id': credential_id}
    return reply(value)
