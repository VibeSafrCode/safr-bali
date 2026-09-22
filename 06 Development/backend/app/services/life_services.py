"""Atomic manual-service mutations and explicit public projection."""

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.models.admin_action import AdminAction
from app.models.life_services import LifeService
from app.schemas.life_services import LifeServiceCreate, LifeServiceUpdate


class LifeServiceConflict(ValueError):
    pass


class LifeServiceNotFound(ValueError):
    pass


PUBLIC_FIELDS = (
    "id", "user_id", "kind", "title", "description", "link_url", "start_date", "end_date",
    "price_currency", "price_unit", "public_contact", "publication_status", "version",
)


def life_service_projection(row: LifeService, *, staff: bool = False) -> dict:
    result = {key: getattr(row, key) for key in PUBLIC_FIELDS}
    result["price_amount"] = format(row.price_amount, ".2f") if row.price_amount is not None else None
    for key in ("created_at", "updated_at"):
        value = getattr(row, key)
        result[key] = (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()
    if staff:
        result.update(owner_details=row.owner_details, internal_note=row.internal_note)
    return result


def _payload_hash(payload: LifeServiceCreate) -> str:
    content = payload.model_dump(mode="json", exclude={"idempotency_key"})
    # Equivalent exact amounts must replay regardless of trailing zeros.
    if payload.price_amount is not None:
        content["price_amount"] = format(payload.price_amount, ".2f")
    return hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _replay(row, *, user_id: int, actor_id: int, fingerprint: str):
    if (row.user_id != user_id or row.created_by_admin_id != actor_id
            or row.create_payload_hash != fingerprint):
        raise LifeServiceConflict("Idempotency key belongs to a different request")
    return row, True


def create_life_service(db, *, user_id: int, actor_id: int, payload: LifeServiceCreate):
    fingerprint = _payload_hash(payload)
    existing = db.query(LifeService).filter_by(create_idempotency_key=payload.idempotency_key).first()
    if existing is not None:
        return _replay(existing, user_id=user_id, actor_id=actor_id, fingerprint=fingerprint)
    row = LifeService(
        **payload.model_dump(exclude={"idempotency_key"}), user_id=user_id,
        created_by_admin_id=actor_id, updated_by_admin_id=actor_id,
        create_idempotency_key=payload.idempotency_key, create_payload_hash=fingerprint,
    )
    # Each API call owns its transaction. A failed unique insert is rolled back
    # before resolving the winning request; no service or audit row is duplicated.
    try:
        db.add(row)
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.query(LifeService).filter_by(create_idempotency_key=payload.idempotency_key).first()
        if existing is None:
            raise
        return _replay(existing, user_id=user_id, actor_id=actor_id, fingerprint=fingerprint)
    db.add(AdminAction(
        admin_user_id=actor_id, action_type="LIFE_SERVICE_CREATED", entity_type="life_service", entity_id=row.id,
        details={"user_id": user_id, "kind": row.kind, "publication_status": row.publication_status, "version": 1},
    ))
    db.flush()
    return row, False


def update_life_service(db, *, user_id: int, record_id: int, actor_id: int, payload: LifeServiceUpdate):
    row = db.query(LifeService).filter_by(id=record_id, user_id=user_id).first()
    if row is None:
        raise LifeServiceNotFound("Service not found")
    fields = payload.model_dump(exclude={"expected_version"})
    previous_status = row.publication_status
    changed_fields = sorted(key for key, value in fields.items() if getattr(row, key) != value)
    # Compare-and-swap protects even databases where SELECT FOR UPDATE is unavailable.
    result = db.execute(
        update(LifeService).where(
            LifeService.id == record_id, LifeService.user_id == user_id,
            LifeService.version == payload.expected_version,
        ).values(
            **fields, version=payload.expected_version + 1, updated_by_admin_id=actor_id,
            updated_at=datetime.now(timezone.utc),
        ).execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise LifeServiceConflict("Service changed; reload it before saving again")
    db.add(AdminAction(
        admin_user_id=actor_id, action_type="LIFE_SERVICE_UPDATED", entity_type="life_service", entity_id=row.id,
        details={"user_id": user_id, "kind": payload.kind, "previous_publication_status": previous_status,
                 "publication_status": payload.publication_status, "version": payload.expected_version + 1,
                 "changed_fields": changed_fields},
    ))
    db.flush()
    db.refresh(row)
    return row
