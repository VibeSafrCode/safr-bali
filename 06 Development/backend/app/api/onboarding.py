from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.api.web_admin import require_web_admin, require_admin_write
from app.core.config import settings
from app.core.security import require_service_token
from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.onboarding import OnboardingVersion, OnboardingDelivery, OnboardingEnrollment
from app.models.user import User
from app.services import onboarding as service
from app.services.support_recipients import active_support_users

admin_router = APIRouter(prefix="/api/web/admin/onboarding", tags=["onboarding"])
service_router = APIRouter(prefix="/onboarding", dependencies=[Depends(require_service_token)])


class Content(BaseModel):
    welcome_text: str = Field(max_length=20000)
    followup_text: str = Field(max_length=10000)


class Revision(BaseModel):
    expected_revision: int = Field(ge=0)


class Draft(Content, Revision):
    pass


class Restore(Revision):
    version: int = Field(gt=0)


class Toggle(Revision):
    enabled: bool


def mutate(payload, actor, operation):
    with SessionLocal() as db:
        row = service.state(db)
        if row.revision != payload.expected_revision:
            raise HTTPException(409, "Onboarding revision changed")
        operation(db, row)
        row.revision += 1
        db.add(AdminAction(admin_user_id=actor.id, action_type="ONBOARDING_UPDATED", entity_type="onboarding",
            entity_id=1, details={"revision": row.revision, "operation": type(payload).__name__}))
        db.commit()
        return service.projection(db, row)


@admin_router.get("")
def read(user=Depends(require_web_admin)):
    with SessionLocal() as db:
        return service.projection(db, service.state(db))


@admin_router.post("/preview")
def preview(payload: Content, user=Depends(require_web_admin)):
    return service.preview(payload.model_dump())


@admin_router.put("/draft")
def draft(payload: Draft, actor=Depends(require_admin_write)):
    return mutate(payload, actor, lambda db, row: setattr(row, "draft", payload.model_dump(exclude={"expected_revision"})))


def publish_content(db, row, actor, content, restored=None):
    check = service.preview(content)
    if not check["valid"]:
        raise HTTPException(422, check["error"])
    latest = db.query(OnboardingVersion).order_by(OnboardingVersion.version.desc()).first()
    version = (latest.version if latest else 0) + 1
    db.add(OnboardingVersion(version=version, content=content, created_at=service.utc(),
        created_by=actor.id, restored_from_version=restored))
    row.published_version = version


@admin_router.post("/publish")
def publish(payload: Revision, actor=Depends(require_admin_write)):
    return mutate(payload, actor, lambda db, row: publish_content(db, row, actor, row.draft))


@admin_router.post("/restore")
def restore(payload: Restore, actor=Depends(require_admin_write)):
    def apply(db, row):
        source = db.get(OnboardingVersion, payload.version)
        if not source:
            raise HTTPException(404, "Version not found")
        row.draft = dict(source.content)
        publish_content(db, row, actor, source.content, payload.version)
    return mutate(payload, actor, apply)


@admin_router.post("/toggle")
def toggle(payload: Toggle, actor=Depends(require_admin_write)):
    def apply(db, row):
        if payload.enabled and not row.published_version:
            raise HTTPException(422, "Publish content before enabling")
        if payload.enabled and not row.enabled:
            row.activation_cutoff = service.utc()
        row.enabled = payload.enabled
        if not row.enabled:
            db.query(OnboardingDelivery).filter_by(state="PENDING").update({"state": "SUPPRESSED"})
    return mutate(payload, actor, apply)


@service_router.post("/claim")
def claim():
    with SessionLocal() as db:
        result = service.claim(db)
        db.commit()
        return result


class Settlement(BaseModel):
    lease_token: str
    state: str
    telegram_message_id: str | None = None
    error_code: str | None = None
    delivered_at: datetime | None = None


@service_router.post("/deliveries/{delivery_id}/settle")
def settle(delivery_id: int, payload: Settlement):
    with SessionLocal() as db:
        try:
            row = service.settle(db, delivery_id, payload.lease_token, payload.state,
                payload.telegram_message_id, payload.error_code, confirmed_at=payload.delivered_at)
        except ValueError as exc:
            raise HTTPException(409, str(exc))
        db.commit()
        return {"state": row.state}


class Help(BaseModel):
    telegram_id: int
    owner_only: bool = False


@service_router.post("/{enrollment_id}/help")
def help_request(enrollment_id: int, payload: Help):
    recipients = [settings.DEFAULT_ADMIN_TELEGRAM_ID]
    with SessionLocal() as db:
        if not payload.owner_only:
            recipients += [user.telegram_id for user in active_support_users(db)]
        try:
            result = service.request_help(db, enrollment_id, payload.telegram_id, recipients)
        except ValueError as exc:
            raise HTTPException(403, str(exc))
        db.commit()
        return result


@service_router.get("/{enrollment_id}/reply/{actor_id}")
def reply_authorization(enrollment_id: int, actor_id: int):
    if actor_id not in {settings.DEFAULT_ADMIN_TELEGRAM_ID, *settings.support_chat_ids}:
        raise HTTPException(403, "Recipient no longer authorized")
    with SessionLocal() as db:
        recipient = db.query(User).filter_by(telegram_id=actor_id, status="active").first()
        if recipient is None:
            raise HTTPException(403, "Recipient no longer active")
        if not service.can_reply(db, enrollment_id, actor_id):
            raise HTTPException(403, "No help request assigned to this recipient")
        enrollment = db.get(OnboardingEnrollment, enrollment_id)
        return {"client_telegram_id": db.get(User, enrollment.user_id).telegram_id}
