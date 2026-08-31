from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from app.api.web_admin import require_admin_write, require_web_admin
from app.core.config import settings
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.catalog_pricing import (
    CatalogPublication,
    FxMarketSnapshot,
    PriceCatalogItem,
    PriceCatalogVersion,
)
from app.models.user import User
from app.services.catalog_pricing import (
    FxUnavailable,
    PricingConflict,
    PricingError,
    create_manual_fx_override,
    latest_fx_snapshot,
    latest_publication,
    preview_catalog,
    projection_payload,
    publish_catalog,
    refresh_fx_snapshot,
    restore_catalog,
    usdt_to_canonical_idr,
)


public_router = APIRouter(
    prefix="/api/catalog",
    tags=["price-catalog"],
    dependencies=[Depends(rate_limit)],
)
admin_router = APIRouter(
    prefix="/api/web/admin/pricing",
    tags=["admin-price-catalog"],
    dependencies=[Depends(rate_limit)],
)


def require_pricing_root(user: User = Depends(require_web_admin)) -> User:
    if user.telegram_id != settings.DEFAULT_ADMIN_TELEGRAM_ID:
        raise HTTPException(status_code=403, detail="Root admin required for pricing")
    return user


def require_pricing_root_write(user: User = Depends(require_admin_write)) -> User:
    if user.telegram_id != settings.DEFAULT_ADMIN_TELEGRAM_ID:
        raise HTTPException(status_code=403, detail="Root admin required for pricing")
    return user


class CatalogItemRequest(BaseModel):
    sku: Optional[str] = Field(default=None, max_length=200)
    entity_type: Literal["VISA", "SERVICE"]
    entity_key: str = Field(min_length=1, max_length=160)
    option_code: str = Field(min_length=1, max_length=160)
    label_ru: str = Field(min_length=1, max_length=255)
    label_en: str = Field(min_length=1, max_length=255)
    price_qualifier: Literal["EXACT", "FROM", "VARIABLE", "CONTACT"]
    amount_idr: Optional[int] = Field(default=None, gt=0)
    amount_usdt: Optional[Decimal] = Field(default=None, gt=0)
    show_price: bool
    fee_verification_status: Literal["VERIFIED", "NEEDS_VERIFICATION"]
    fee_note_ru: Optional[str] = Field(default=None, max_length=2000)
    fee_note_en: Optional[str] = Field(default=None, max_length=2000)
    sort_order: int = Field(default=0, ge=0, le=100000)

    @model_validator(mode="after")
    def amount_matches_qualifier(self):
        priced = self.price_qualifier in {"EXACT", "FROM"}
        supplied_amounts = int(self.amount_idr is not None) + int(self.amount_usdt is not None)
        if (priced and supplied_amounts != 1) or (not priced and supplied_amounts != 0):
            raise ValueError("exact/from requires exactly one IDR or USDT amount")
        if self.show_price and (
            not priced or self.fee_verification_status != "VERIFIED"
        ):
            raise ValueError("Only verified exact/from prices may be shown")
        return self


class CatalogPreviewRequest(BaseModel):
    items: list[CatalogItemRequest] = Field(min_length=1, max_length=500)


class CatalogPublishRequest(CatalogPreviewRequest):
    expected_publication_version: int = Field(ge=0)
    effective_from: datetime
    reason: str = Field(min_length=3, max_length=2000)


class CatalogRestoreRequest(BaseModel):
    restore_catalog_version: int = Field(gt=0)
    expected_publication_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=2000)


class ManualFxOverrideRequest(BaseModel):
    ask_idr_per_usdt: Decimal = Field(gt=0)
    bid_idr_per_usdt: Decimal = Field(gt=0)
    expires_at: datetime
    expected_publication_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=2000)


def _item_dict(item: CatalogItemRequest, fx: FxMarketSnapshot) -> dict:
    value = item.model_dump()
    amount_usdt = value.pop("amount_usdt", None)
    if amount_usdt is not None:
        value["amount_idr"] = int(usdt_to_canonical_idr(amount_usdt, fx.ask_idr_per_usdt))
    return value


def _raise_pricing_http(error: Exception) -> None:
    headers = {"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"}
    if isinstance(error, PricingConflict):
        raise HTTPException(status_code=409, detail=str(error), headers=headers) from error
    if isinstance(error, FxUnavailable):
        raise HTTPException(status_code=503, detail=str(error), headers=headers) from error
    raise HTTPException(status_code=422, detail=str(error), headers=headers) from error


def _publication_summary(db, publication: Optional[CatalogPublication]) -> Optional[dict]:
    if publication is None:
        return None
    catalog = db.get(PriceCatalogVersion, publication.catalog_version_id)
    fx = db.get(FxMarketSnapshot, publication.fx_snapshot_id)
    return {
        "projection_id": f"pricing-projection-v{publication.version}",
        "publication_version": publication.version,
        "catalog_version": catalog.version if catalog else None,
        "fx_version": fx.version if fx else None,
        "published_at": publication.published_at,
        "reason": publication.reason,
    }


@public_router.get("/pricing")
def public_pricing(response: Response):
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    db = SessionLocal()
    try:
        try:
            payload = projection_payload(db)
        except (PricingError, FxUnavailable) as error:
            _raise_pricing_http(error)
        response.headers["X-Pricing-Projection"] = payload["projection_id"]
        return payload
    finally:
        db.close()


@admin_router.get("")
def admin_pricing_overview(user: User = Depends(require_pricing_root)):
    db = SessionLocal()
    try:
        publication = latest_publication(db)
        active_fx = db.get(FxMarketSnapshot, publication.fx_snapshot_id) if publication else None
        history = db.query(CatalogPublication).order_by(CatalogPublication.version.desc()).limit(50).all()
        catalog_history = db.query(PriceCatalogVersion).order_by(PriceCatalogVersion.version.desc()).limit(50).all()
        fx_history = db.query(FxMarketSnapshot).order_by(FxMarketSnapshot.version.desc()).limit(50).all()
        active_items: list[PriceCatalogItem] = []
        if publication is not None:
            active_items = db.query(PriceCatalogItem).filter_by(
                catalog_version_id=publication.catalog_version_id
            ).order_by(PriceCatalogItem.entity_type, PriceCatalogItem.entity_key, PriceCatalogItem.sort_order).all()
        return {
            "active": _publication_summary(db, publication),
            "active_fx": ({
                "version": active_fx.version,
                "ask_idr_per_usdt": active_fx.ask_idr_per_usdt,
                "acceptance_method": active_fx.acceptance_method,
                "observed_at": active_fx.observed_at,
                "fresh_until": active_fx.fresh_until,
                "stale_until": active_fx.stale_until,
                "is_manual_override": active_fx.is_manual_override,
                "override_expires_at": active_fx.override_expires_at,
            } if active_fx else None),
            "items": [{
                "sku": item.sku,
                "entity_type": item.entity_type,
                "entity_key": item.entity_key,
                "option_code": item.option_code,
                "label_ru": item.label_ru,
                "label_en": item.label_en,
                "price_qualifier": item.price_qualifier,
                "amount_idr": item.amount_idr,
                "show_price": item.show_price,
                "fee_verification_status": item.fee_verification_status,
                "fee_note_ru": item.fee_note_ru,
                "fee_note_en": item.fee_note_en,
                "sort_order": item.sort_order,
            } for item in active_items],
            "publication_history": [_publication_summary(db, item) for item in history],
            "catalog_history": [{
                "version": item.version,
                "effective_from": item.effective_from,
                "created_at": item.created_at,
                "reason": item.reason,
                "restored_from_version_id": item.restored_from_version_id,
            } for item in catalog_history],
            "fx_history": [{
                "version": item.version,
                "source": item.source_code,
                "ask_idr_per_usdt": item.ask_idr_per_usdt,
                "best_ask_idr_per_usdt": item.best_ask_idr_per_usdt,
                "bid_idr_per_usdt": item.bid_idr_per_usdt,
                "acceptance_method": item.acceptance_method,
                "accepted_notional_usdt": item.accepted_notional_usdt,
                "change_bps_from_previous": item.change_bps_from_previous,
                "observed_at": item.observed_at,
                "fresh_until": item.fresh_until,
                "stale_until": item.stale_until,
                "is_manual_override": item.is_manual_override,
                "override_expires_at": item.override_expires_at,
            } for item in fx_history],
        }
    finally:
        db.close()


@admin_router.post("/preview")
def admin_preview_catalog(
    payload: CatalogPreviewRequest,
    user: User = Depends(require_pricing_root),
):
    db = SessionLocal()
    try:
        publication = latest_publication(db)
        fx = db.get(FxMarketSnapshot, publication.fx_snapshot_id) if publication else latest_fx_snapshot(db)
        if fx is None:
            raise HTTPException(status_code=503, detail="No authoritative FX snapshot")
        try:
            return preview_catalog([_item_dict(item, fx) for item in payload.items], fx)
        except PricingError as error:
            _raise_pricing_http(error)
    finally:
        db.close()


@admin_router.post("/publish", status_code=201)
def admin_publish_catalog(
    payload: CatalogPublishRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=255),
    admin: User = Depends(require_pricing_root_write),
):
    db = SessionLocal()
    try:
        try:
            active = latest_publication(db)
            fx = db.get(FxMarketSnapshot, active.fx_snapshot_id) if active else latest_fx_snapshot(db)
            if fx is None:
                raise FxUnavailable("No authoritative FX snapshot")
            publication = publish_catalog(
                db,
                items=[_item_dict(item, fx) for item in payload.items],
                expected_publication_version=payload.expected_publication_version,
                effective_from=payload.effective_from,
                reason=payload.reason,
                idempotency_key=idempotency_key,
                actor_id=admin.id,
            )
            db.commit()
            return _publication_summary(db, publication)
        except (PricingError, PricingConflict, FxUnavailable) as error:
            db.rollback()
            _raise_pricing_http(error)
    finally:
        db.close()


@admin_router.post("/restore", status_code=201)
def admin_restore_catalog(
    payload: CatalogRestoreRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=255),
    admin: User = Depends(require_pricing_root_write),
):
    db = SessionLocal()
    try:
        try:
            publication = restore_catalog(
                db,
                restore_catalog_version=payload.restore_catalog_version,
                expected_publication_version=payload.expected_publication_version,
                reason=payload.reason,
                idempotency_key=idempotency_key,
                actor_id=admin.id,
            )
            db.commit()
            return _publication_summary(db, publication)
        except (PricingError, PricingConflict, FxUnavailable) as error:
            db.rollback()
            _raise_pricing_http(error)
    finally:
        db.close()


@admin_router.post("/fx/refresh", status_code=201)
async def admin_refresh_fx(admin: User = Depends(require_pricing_root_write)):
    db = SessionLocal()
    try:
        try:
            snapshot, status = await refresh_fx_snapshot(db, force=True)
            db.commit()
            return {"status": status, "fx_version": snapshot.version, "active": _publication_summary(db, latest_publication(db))}
        except (PricingError, FxUnavailable) as error:
            db.rollback()
            _raise_pricing_http(error)
    finally:
        db.close()


@admin_router.post("/fx/override", status_code=201)
def admin_override_fx(
    payload: ManualFxOverrideRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=255),
    admin: User = Depends(require_pricing_root_write),
):
    db = SessionLocal()
    try:
        try:
            snapshot = create_manual_fx_override(
                db,
                ask_idr_per_usdt=payload.ask_idr_per_usdt,
                bid_idr_per_usdt=payload.bid_idr_per_usdt,
                expires_at=payload.expires_at,
                reason=payload.reason,
                actor_id=admin.id,
                expected_publication_version=payload.expected_publication_version,
                idempotency_key=idempotency_key,
            )
            db.commit()
            return {"fx_version": snapshot.version, "active": _publication_summary(db, latest_publication(db))}
        except (PricingError, PricingConflict) as error:
            db.rollback()
            _raise_pricing_http(error)
    finally:
        db.close()
