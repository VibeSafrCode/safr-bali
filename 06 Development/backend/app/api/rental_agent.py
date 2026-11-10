"""One-client rental operations with separate Owner-provisioned credentials."""

from calendar import monthrange
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import re
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, UUID4, ValidationError, field_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.web_admin import require_admin_write
from app.api.web_portal import token_hash
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.life_services import LifeService, RentalAgentGrant
from app.models.user import User
from app.schemas.life_services import LifeServiceCreate, LifeServiceFields, LifeServiceUpdate
from app.services.life_services import LifeServiceConflict, create_life_service, life_service_projection, update_life_service


PRIVATE = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"}
RENTAL_KINDS = ("housing", "bike")
AGENT_FIELDS = {
    "id", "user_id", "kind", "title", "housing_type", "rental_mode", "start_date", "end_date",
    "price_amount", "price_currency", "price_unit", "link_url", "public_contact",
    "electricity_account_number", "version",
}


class PrivateRentalRoute(APIRoute):
    def get_route_handler(self):
        handle = super().get_route_handler()

        async def private(request: Request):
            try:
                response = await handle(request)
            except RequestValidationError:
                return JSONResponse({"detail": "Invalid rental agent request"}, status_code=422, headers=PRIVATE)
            except HTTPException as exc:
                return JSONResponse({"detail": exc.detail}, status_code=exc.status_code,
                                    headers={**(exc.headers or {}), **PRIVATE})
            response.headers.update(PRIVATE)
            return response

        return private


router = APIRouter(route_class=PrivateRentalRoute)
owner_router = APIRouter(route_class=PrivateRentalRoute)


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class RequestIdentity(AgentRequest):
    request_id: UUID4


class ClientLookup(AgentRequest):
    telegram_id: int = Field(strict=True, gt=0)


class RentalFields(RequestIdentity):
    title: str | None = Field(default=None, max_length=200)
    housing_type: Literal["guesthouse", "hotel", "apartment", "villa"] | None = None
    rental_mode: Literal["fixed", "monthly"] = "fixed"
    start_date: str | None = None
    end_date: str | None = None
    price_amount: str | None = Field(default=None, pattern=r"^[0-9]{1,14}(\.[0-9]{1,2})?$")
    price_currency: Literal["IDR", "USD", "USDT", "RUB"] = "IDR"
    price_unit: Literal["period", "month", "day"] = "period"
    link_url: str | None = Field(default=None, max_length=2000)
    public_contact: str | None = Field(default=None, max_length=1000)
    electricity_account_number: str | None = Field(default=None, pattern=r"^[0-9]{1,32}$")


class RentalCreate(RentalFields):
    kind: Literal["housing", "bike"]
    title: str = Field(min_length=1, max_length=200)
    start_date: str


class RentalUpdate(RentalFields):
    expected_version: int = Field(strict=True, gt=0, le=2147483646)


class QuotePeriod(AgentRequest):
    start_date: date
    end_date: date

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def require_calendar_date(cls, value):
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise ValueError("Calendar date required")
        return value


@contextmanager
def transaction():
    with SessionLocal() as db:
        try:
            if db.bind.dialect.name == "postgresql":
                db.execute(text("SET LOCAL lock_timeout = '2000ms'"))
                db.execute(text("SET LOCAL statement_timeout = '5000ms'"))
            yield db
            db.commit()
        except DBAPIError as exc:
            raise HTTPException(503, "Rental operation unavailable; verify before retrying") from exc
        except LifeServiceConflict as exc:
            raise HTTPException(409, "Rental request conflicts with the saved record") from exc
        except ValidationError as exc:
            raise HTTPException(422, "Invalid rental fields") from exc


def utc(value):
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def principal(db, authorization: str):
    match = re.fullmatch(r"Bearer (ra_[A-Za-z0-9_-]{43})", authorization)
    if not match:
        raise HTTPException(401, "Rental agent authentication required")
    grant = db.query(RentalAgentGrant).filter_by(token_hash=token_hash(match[1])).with_for_update().first()
    if not grant or grant.revoked_at is not None or utc(grant.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(401, "Rental agent authentication required")
    users = db.query(User).filter(User.id.in_((grant.client_user_id, grant.owner_user_id)),
                                  User.status == "active").order_by(User.id).with_for_update(read=True).all()
    active = {user.id: user for user in users}
    owner = active.get(grant.owner_user_id)
    client = active.get(grant.client_user_id)
    if (not client or not owner or owner.role != "admin" or
            owner.telegram_id != settings.DEFAULT_ADMIN_TELEGRAM_ID):
        raise HTTPException(401, "Rental agent authentication required")
    return grant, client


def records(db, client):
    return db.query(LifeService).filter(LifeService.user_id == client.id, LifeService.kind.in_(RENTAL_KINDS),
                                        LifeService.publication_status == "PUBLISHED")


def record(db, client, service_id):
    row = records(db, client).filter(LifeService.id == service_id).first()
    if row is None:
        raise HTTPException(404, "Rental not found")
    return row


def projection(row):
    return {name: value for name, value in life_service_projection(row).items() if name in AGENT_FIELDS}


def audit_context(grant, payload):
    return {"credential_id": grant.id, "request_id": str(payload.request_id)}


@router.post("/client/lookup")
def lookup(payload: ClientLookup, authorization: str = Header(default="")):
    with transaction() as db:
        _, client = principal(db, authorization)
        if client.telegram_id != payload.telegram_id:
            raise HTTPException(404, "Client not found")
        return {"client_id": client.id}


@router.get("/services")
def list_rentals(after_id: int = 0, authorization: str = Header(default="")):
    if after_id < 0:
        raise HTTPException(422, "Invalid cursor")
    with transaction() as db:
        _, client = principal(db, authorization)
        rows = records(db, client).filter(LifeService.id > after_id).order_by(LifeService.id).limit(51).all()
        return {"items": [projection(row) for row in rows[:50]], "next_after_id": rows[49].id if len(rows) > 50 else None}


@router.get("/services/{service_id}")
def get_rental(service_id: int, authorization: str = Header(default="")):
    with transaction() as db:
        _, client = principal(db, authorization)
        return projection(record(db, client, service_id))


@router.post("/services", status_code=201)
def create_rental(payload: RentalCreate, authorization: str = Header(default="")):
    with transaction() as db:
        grant, client = principal(db, authorization)
        fields = LifeServiceCreate(
            **payload.model_dump(exclude={"request_id"}),
            idempotency_key=f"rental-agent:{grant.id}:{payload.request_id}",
            publication_status="PUBLISHED", notifications_enabled=False,
        )
        row, replay = create_life_service(db, user_id=client.id, actor_id=grant.owner_user_id, payload=fields,
                                          agent_audit=audit_context(grant, payload))
        if row.kind not in RENTAL_KINDS or row.publication_status != "PUBLISHED":
            raise HTTPException(409, "Rental is no longer visible")
        result = jsonable_encoder({**projection(row), "idempotent_replay": replay})
        return JSONResponse(result, status_code=200 if replay else 201)


@router.patch("/services/{service_id}")
def update_rental(service_id: int, payload: RentalUpdate, authorization: str = Header(default="")):
    changes = payload.model_dump(exclude_unset=True, exclude={"request_id", "expected_version"})
    if not changes:
        raise HTTPException(422, "Rental fields required")
    with transaction() as db:
        grant, client = principal(db, authorization)
        row = record(db, client, service_id)
        fields = {name: getattr(row, name) for name in LifeServiceFields.model_fields}
        row = update_life_service(db, user_id=client.id, record_id=row.id, actor_id=grant.owner_user_id,
                                  payload=LifeServiceUpdate(**{**fields, **changes}, expected_version=payload.expected_version),
                                  agent_audit=audit_context(grant, payload))
        return projection(row)


def anniversary(anchor, month):
    year, index = divmod(anchor.year * 12 + anchor.month - 1 + month, 12)
    return date(year, index + 1, min(anchor.day, monthrange(year, index + 1)[1]))


def rental_period_amount(row, start, end):
    if (row.price_amount is None or row.start_date is None or start < row.start_date or
            (row.end_date is not None and end > row.end_date)):
        return None
    if row.price_unit == "period":
        return row.price_amount if (start, end) == (row.start_date, row.end_date) else None
    if row.price_unit == "day":
        return row.price_amount * (end - start).days
    if row.price_unit == "month" and row.rental_mode == "monthly":
        anchor = row.start_date
        first = (start.year - anchor.year) * 12 + start.month - anchor.month
        last = (end.year - anchor.year) * 12 + end.month - anchor.month
        if last > first and anniversary(anchor, first) == start and anniversary(anchor, last) == end:
            return row.price_amount * (last - first)
    return None


@router.post("/services/{service_id}/quote")
def quote_rental(service_id: int, payload: QuotePeriod, authorization: str = Header(default="")):
    if not 0 < (payload.end_date - payload.start_date).days <= 370:
        raise HTTPException(422, "Choose a period of 1 to 370 calendar days")
    with transaction() as db:
        _, client = principal(db, authorization)
        row = record(db, client, service_id)
        amount = rental_period_amount(row, payload.start_date, payload.end_date)
        return {"service_id": row.id, "version": row.version, "start_date": payload.start_date,
                "end_date_exclusive": payload.end_date, "currency": row.price_currency,
                "nominal_amount": format(amount, ".2f") if amount is not None else None,
                "payments_status": "unknown", "balance_due": None, "electricity_amount": None,
                "fx": "manual_confirmation"}


@owner_router.post("/{user_id}/life-services/agent/grants/list")
def grants(user_id: int, owner: User = Depends(require_admin_write)):
    with transaction() as db:
        rows = db.query(RentalAgentGrant).filter_by(client_user_id=user_id).order_by(
            RentalAgentGrant.id.desc()).limit(50).all()
        return {"items": [{"credential_id": row.id, "expires_at": row.expires_at,
                           "revoked_at": row.revoked_at} for row in rows]}


@owner_router.post("/{user_id}/life-services/agent/grants", status_code=201)
def issue(user_id: int, payload: RequestIdentity, owner: User = Depends(require_admin_write)):
    with transaction() as db:
        client = db.query(User.id).filter_by(id=user_id, status="active").with_for_update().first()
        if not client or user_id == owner.id:
            raise HTTPException(404, "Client not found")
        now = datetime.now(timezone.utc)
        request_id = str(payload.request_id)
        if db.query(RentalAgentGrant.id).filter_by(client_user_id=user_id, issue_request_id=request_id).first():
            raise HTTPException(409, "This grant request was already processed")
        if db.query(RentalAgentGrant.id).filter_by(client_user_id=user_id, revoked_at=None).filter(
                RentalAgentGrant.expires_at > now).first():
            raise HTTPException(409, "Revoke the active grant before issuing another")
        token = "ra_" + secrets.token_urlsafe(32)
        grant = RentalAgentGrant(client_user_id=user_id, owner_user_id=owner.id, issue_request_id=request_id, token_hash=token_hash(token),
                                 issued_at=now, expires_at=now + timedelta(days=30))
        db.add(grant)
        db.flush()
        db.add(AdminAction(admin_user_id=owner.id, action_type="RENTAL_AGENT_GRANTED", entity_type="rental_agent_grant",
                           entity_id=grant.id, details={"user_id": user_id, **audit_context(grant, payload)}))
        return {"credential_id": grant.id, "token": token, "expires_at": grant.expires_at}


@owner_router.post("/{user_id}/life-services/agent/grants/{credential_id}/revoke")
def revoke(user_id: int, credential_id: int, payload: RequestIdentity, owner: User = Depends(require_admin_write)):
    with transaction() as db:
        grant = db.query(RentalAgentGrant).filter_by(id=credential_id, client_user_id=user_id).with_for_update().first()
        if grant is None:
            raise HTTPException(404, "Grant not found")
        if grant.revoked_at is None:
            grant.revoked_at = datetime.now(timezone.utc)
            db.add(AdminAction(admin_user_id=owner.id, action_type="RENTAL_AGENT_REVOKED", entity_type="rental_agent_grant",
                               entity_id=grant.id, details={"user_id": user_id, **audit_context(grant, payload)}))
        return {"credential_id": credential_id, "revoked": True}
