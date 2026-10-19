"""Root-admin message preparation and credential-bound bot delivery protocol."""
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func

from app.api.onboarding import publish_content
from app.api.web_admin import require_admin_write, require_web_admin
from app.core.config import settings
from app.core.security import _safe_compare
from app.db.session import SessionLocal
from app.models.admin_action import AdminAction
from app.models.bot_messaging import BotCampaign, BotCampaignRecipient
from app.models.onboarding import OnboardingDelivery
from app.models.user import User
from app.models.service import Service
from app.services import bot_messaging as svc, onboarding

BotKey = Literal["safrway", "yoga"]


def enabled():
    if not settings.BOT_MESSAGING_ENABLED:
        raise HTTPException(404, "Bot messaging is not enabled")


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Cookie, X-Service-Token"


admin_router = APIRouter(prefix="/api/web/admin/messaging", dependencies=[Depends(enabled), Depends(private_response)])
bot_router = APIRouter(prefix="/api/bot-messaging", dependencies=[Depends(private_response)])


def principal(x_service_token: str = Header(default="", alias="X-Service-Token")):
    main, yoga = settings.SERVICE_API_TOKEN, settings.YOGA_SERVICE_API_TOKEN
    if main and _safe_compare(main, settings.ADMIN_API_TOKEN):
        raise HTTPException(503, "Ambiguous bot credentials")
    if settings.YOGA_CHANNEL_ENABLED and yoga and _safe_compare(main, yoga):
        raise HTTPException(503, "Ambiguous bot credentials")
    if main.strip() and _safe_compare(main, x_service_token):
        return "safrway"
    if (settings.YOGA_CHANNEL_ENABLED and yoga.strip() and not _safe_compare(yoga, settings.ADMIN_API_TOKEN)
            and _safe_compare(yoga, x_service_token)):
        return "yoga"
    raise HTTPException(401, "Invalid bot credential")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Copy(Strict):
    welcome_text: str = Field(min_length=1, max_length=20000)
    followup_text: str = Field(min_length=1, max_length=10000)


class Revision(Strict):
    expected_revision: int = Field(ge=0)


class Draft(Revision):
    locales: dict[Literal["ru", "en"], Copy]


class Toggle(Revision):
    enabled: bool


def seed(bot_key):
    path = Path(__file__).resolve().parents[1] / "data"
    prefix = "onboarding_yoga_welcome" if bot_key == "yoga" else "onboarding_welcome"
    return {"locales": {locale: {"welcome_text": (path / f"{prefix}.{locale}.txt").read_text(),
        "followup_text": (path / f"onboarding_followup.{locale}.txt").read_text().rstrip("\n")}
        for locale in ("ru", "en")}}


def check_copy(content, bot_key):
    if set(content.get("locales", {})) != {"ru", "en"}:
        raise svc.MessagingConflict("Both welcome languages are required")
    previews = {locale: onboarding.preview(onboarding.content_for_locale(content, locale)) for locale in ("ru", "en")}
    if not all(item["valid"] for item in previews.values()):
        raise svc.MessagingConflict("Welcome text must fit two messages and the follow-up one")
    if bot_key == "yoga" and any("safrway" in value.casefold() for item in content["locales"].values() for value in item.values()):
        raise svc.MessagingConflict("Wrong brand in Yoga copy")
    return previews


def policy_projection(db, bot_key):
    row = onboarding.state(db, bot_key)
    try:
        previews = check_copy(row.draft, bot_key)
    except (ValueError, KeyError):
        previews = None
    return {"bot_key": bot_key, "revision": row.revision, "enabled": row.enabled,
            "published_version": row.published_version, "draft": row.draft,
            "prepared": seed(bot_key), "preview": previews}


@admin_router.get("/policy/{bot_key}")
def read_policy(bot_key: BotKey, actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        return policy_projection(db, bot_key)


def change_policy(bot_key, payload, actor, operation):
    with SessionLocal() as db:
        onboarding.bot_transaction_lock(db, bot_key)
        try:
            svc._root(db, actor)
        except svc.MessagingConflict as error:
            raise HTTPException(403, "Root administrator is required") from error
        row = onboarding.state(db, bot_key)
        if row.revision != payload.expected_revision:
            raise HTTPException(409, "Welcome policy changed")
        try:
            operation(db, row)
            row.revision += 1
            db.add(AdminAction(admin_user_id=actor.id, action_type="BOT_WELCOME_POLICY_UPDATED",
                entity_type="onboarding", entity_id=row.id, details={"bot_key": bot_key, "revision": row.revision}))
            db.commit()
        except (svc.MessagingConflict, ValueError) as error:
            db.rollback()
            raise HTTPException(409, str(error)) from error
        return policy_projection(db, bot_key)


@admin_router.put("/policy/{bot_key}/draft")
def save_draft(bot_key: BotKey, payload: Draft, actor=Depends(require_admin_write)):
    content = {"locales": {key: copy.model_dump() for key, copy in payload.locales.items()}}
    try:
        check_copy(content, bot_key)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return change_policy(bot_key, payload, actor, lambda db, row: setattr(row, "draft", content))


@admin_router.post("/policy/{bot_key}/publish")
def publish_policy(bot_key: BotKey, payload: Revision, actor=Depends(require_admin_write)):
    def operation(db, row):
        check_copy(row.draft, bot_key)
        publish_content(db, row, actor, row.draft)
    return change_policy(bot_key, payload, actor, operation)


@admin_router.post("/policy/{bot_key}/toggle")
def toggle_policy(bot_key: BotKey, payload: Toggle, actor=Depends(require_admin_write)):
    def operation(db, row):
        if payload.enabled and not row.published_version:
            raise svc.MessagingConflict("Publish the welcome first")
        if payload.enabled and not row.enabled:
            row.activation_cutoff = onboarding.utc()
        row.enabled = payload.enabled
        if not row.enabled:
            from app.models.onboarding import OnboardingEnrollment
            db.query(OnboardingDelivery).filter(OnboardingDelivery.state == "PENDING",
                OnboardingDelivery.enrollment_id.in_(db.query(OnboardingEnrollment.id).filter_by(bot_key=bot_key))).update(
                    {"state": "SUPPRESSED"}, synchronize_session=False)
    return change_policy(bot_key, payload, actor, operation)


class AudienceFilters(Strict):
    q: str | None = Field(default=None, max_length=120)
    joined_from: datetime | None = Field(default=None, strict=False)
    joined_to: datetime | None = Field(default=None, strict=False)
    has_visas: bool | None = None
    visa_expires_within: Literal[7, 15, 30, 45, 60] | None = None
    never_dialogued: bool = False
    no_services: bool = False
    has_services: bool | None = None
    service_category: str | None = Field(default=None, max_length=100)
    service_categories: list[str] | None = Field(default=None, min_length=1, max_length=20)


@admin_router.get("/audience-options")
def audience_options(actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        values = {value for (value,) in db.query(Service.category).filter(Service.category.is_not(None)).distinct() if value}
        values.update({"visa", "housing", "bike", "insurance", "other"})
        return {"service_categories": sorted(values)}


class Campaign(Strict):
    bot_key: BotKey
    kind: Literal["announcement", "welcome_backfill"]
    title: str = Field(min_length=1, max_length=200)
    filters: AudienceFilters | None = None
    user_ids: list[int] = Field(default_factory=list, max_length=5000)
    content: dict[Literal["ru", "en"], str] | None = None
    content_version: int | None = Field(default=None, gt=0)
    followup: bool = False
    legacy_main_once: bool = False


def campaign_projection(db, row):
    counts = dict(db.query(BotCampaignRecipient.state, func.count()).filter_by(campaign_id=row.id).group_by(BotCampaignRecipient.state).all())
    return {"id": row.id, "bot_key": row.bot_key, "kind": row.kind, "title": row.title,
            "state": row.state, "revision": row.revision, "counts": counts, "snapshot_sha256": row.snapshot_sha256}


@admin_router.get("/campaigns/{campaign_id}/recipients")
def recipients(campaign_id: int, actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        campaign = db.get(BotCampaign, campaign_id)
        if campaign is None:
            raise HTTPException(404, "Campaign not found")
        rows = db.query(BotCampaignRecipient, User).join(User, User.id == BotCampaignRecipient.user_id).filter(
            BotCampaignRecipient.campaign_id == campaign_id).order_by(User.id).limit(svc.MAX_RECIPIENTS).all()
        enrollment_ids = [row.enrollment_id for row, _ in rows if row.enrollment_id]
        delivery_counts = {}
        for enrollment_id, state, count in db.query(OnboardingDelivery.enrollment_id, OnboardingDelivery.state, func.count()).filter(
                OnboardingDelivery.enrollment_id.in_(enrollment_ids)).group_by(OnboardingDelivery.enrollment_id, OnboardingDelivery.state):
            delivery_counts.setdefault(enrollment_id, {})[state] = count
        # Root-only review uses canonical IDs/names, never raw Telegram IDs.
        return {"campaign_id": campaign_id, "items": [{"user_id": user.id,
            "name": " ".join(value for value in (user.first_name, user.last_name) if value) or f"#{user.id}",
            "username": user.username, "locale": row.locale, "state": row.state,
            "deliveries": delivery_counts.get(row.enrollment_id, {})}
            for row, user in rows]}


@admin_router.get("/campaigns")
def campaigns(actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        return {"items": [campaign_projection(db, row) for row in db.query(BotCampaign).order_by(BotCampaign.id.desc()).limit(50)]}


@admin_router.post("/campaigns", status_code=201)
def create_campaign(payload: Campaign, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            row = svc.create_campaign(db, actor=actor, bot_key=payload.bot_key, kind=payload.kind,
                title=payload.title, audience={"filters": payload.filters.model_dump(mode="json", exclude_none=True, exclude_defaults=True) if payload.filters else {},
                                             "user_ids": payload.user_ids, "legacy_main_once": payload.legacy_main_once}, content=payload.content,
                content_version=payload.content_version, followup=payload.followup)
            db.commit()
            return campaign_projection(db, row)
        except ValueError as error:
            db.rollback(); raise HTTPException(409, str(error)) from error


class Confirmation(Revision):
    snapshot_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    idempotency_key: str = Field(min_length=8, max_length=100)
    allow_unverified_main_once: bool = False


class LegacyMainImport(Strict):
    expected_snapshot_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


@admin_router.get("/legacy-main")
def legacy_main_inventory(actor=Depends(require_web_admin)):
    with SessionLocal() as db:
        return svc.main_legacy_inventory(db)[1]


@admin_router.post("/legacy-main")
def stage_legacy_main(payload: LegacyMainImport, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            result = svc.bootstrap_main_legacy(db, actor=actor, **payload.model_dump())
            db.commit(); return result
        except ValueError as error:
            db.rollback(); raise HTTPException(409, str(error)) from error


@admin_router.post("/campaigns/{campaign_id}/preview")
def preview_campaign(campaign_id: int, payload: Revision, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            result = svc.preview_campaign(db, campaign_id, actor=actor, expected_revision=payload.expected_revision)
            db.commit(); return result
        except ValueError as error:
            db.rollback(); raise HTTPException(409, str(error)) from error


@admin_router.post("/campaigns/{campaign_id}/confirm")
def confirm_campaign(campaign_id: int, payload: Confirmation, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            row, replay = svc.confirm_campaign(db, campaign_id, actor=actor, **payload.model_dump())
            db.commit(); return {**campaign_projection(db, row), "idempotent_replay": replay}
        except ValueError as error:
            row = db.get(BotCampaign, campaign_id)
            safe = row is not None and row.confirmation_key is None and row.state in {"DRAFT", "PREVIEW", "CANCELLED"}
            db.rollback()
            raise HTTPException(409, {"code": str(error), "safe_to_repreview": safe,
                "campaign_id": campaign_id, "request_key": payload.idempotency_key}) from error


@admin_router.post("/campaigns/{campaign_id}/cancel")
def cancel_campaign(campaign_id: int, payload: Revision, actor=Depends(require_admin_write)):
    with SessionLocal() as db:
        try:
            row = svc.cancel_campaign(db, campaign_id, actor=actor, expected_revision=payload.expected_revision)
            db.commit(); return campaign_projection(db, row)
        except ValueError as error:
            db.rollback(); raise HTTPException(409, str(error)) from error


class Contact(Strict):
    telegram_id: int = Field(gt=0, lt=2**63)
    private_chat_id: int = Field(gt=0, lt=2**63)
    message_id: int = Field(gt=0, lt=2**63)
    occurred_at: datetime = Field(strict=False)
    locale: Literal["ru", "en"]

    @model_validator(mode="after")
    def private_actor(self):
        if self.private_chat_id != self.telegram_id or self.occurred_at.tzinfo is None:
            raise ValueError("A private Telegram contact with a timezone is required")
        return self


@bot_router.post("/contact", dependencies=[Depends(enabled)])
def record_contact(payload: Contact, bot_key=Depends(principal)):
    with SessionLocal() as db:
        user = db.query(User).filter_by(telegram_id=payload.telegram_id).one_or_none()
        if user is None:
            raise HTTPException(404, "Register the canonical account first")
        try:
            _, first = svc.record_private_contact(db, user, bot_key=bot_key, locale=payload.locale,
                event=f"private:{payload.telegram_id}:{payload.message_id}", occurred_at=payload.occurred_at)
            db.commit(); return {"accepted": True, "first_contact": first}
        except ValueError as error:
            db.rollback(); raise HTTPException(409, str(error)) from error


@bot_router.post("/claim", dependencies=[Depends(enabled)])
def claim(bot_key=Depends(principal)):
    with SessionLocal() as db:
        welcome = onboarding.claim(db, bot_key=bot_key)
        result = [{"delivery_kind": "welcome", **item} for item in welcome] if welcome else svc.claim_announcement(db, bot_key=bot_key)
        db.commit(); return result


class Settlement(Strict):
    delivery_kind: Literal["welcome", "campaign"]
    lease_token: str = Field(min_length=1, max_length=64)
    state: Literal["DELIVERED", "FAILED", "UNKNOWN", "RETRY"]
    telegram_message_id: str | None = Field(default=None, max_length=64)
    error_code: str | None = Field(default=None, max_length=80)
    delivered_at: datetime | None = Field(default=None, strict=False)
    retry_after_seconds: int | None = Field(default=None, ge=1, le=86400)


@bot_router.post("/deliveries/{delivery_id}/settle")
def settle(delivery_id: int, payload: Settlement, bot_key=Depends(principal)):
    with SessionLocal() as db:
        try:
            if payload.delivery_kind == "welcome":
                row = onboarding.settle(db, delivery_id, payload.lease_token, payload.state,
                    payload.telegram_message_id, payload.error_code, confirmed_at=payload.delivered_at,
                    bot_key=bot_key, retry_after_seconds=payload.retry_after_seconds,
                    allow_enqueue=settings.BOT_MESSAGING_ENABLED)
            else:
                row = svc.settle_announcement(db, delivery_id, bot_key=bot_key,
                    lease_token=payload.lease_token, outcome=payload.state, message_id=payload.telegram_message_id,
                    error_code=payload.error_code, delivered_at=payload.delivered_at, retry_after_seconds=payload.retry_after_seconds,
                    allow_enqueue=settings.BOT_MESSAGING_ENABLED)
            db.commit(); return {"state": row.state}
        except ValueError as error:
            db.rollback(); raise HTTPException(409, str(error)) from error
