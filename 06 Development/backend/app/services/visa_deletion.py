from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

import app.models  # noqa: F401 - registers the complete FK graph in Base.metadata
from app.core.config import settings
from app.db.base import Base
from app.models.admin_safety import VisaCaseDeletionTombstone
from app.models.user import User
from app.models.visa_lifecycle import (
    ClientInternalNote,
    CredentialVaultItem,
    VisaCase,
    VisaDocument,
    VisaEvent,
    VisaNotificationDelivery,
    VisaProcess,
    VisaType,
)


CASE_OWNED_MODELS = (
    CredentialVaultItem,
    ClientInternalNote,
    VisaDocument,
    VisaNotificationDelivery,
    VisaEvent,
    VisaProcess,
)
CASE_OWNED_TABLES = frozenset(model.__tablename__ for model in CASE_OWNED_MODELS)


class VisaDeleteBlocked(RuntimeError):
    pass


def _normalized_reason(value: str) -> str:
    return " ".join(value.split())


@dataclass(frozen=True)
class VisaDeletePlan:
    case_id: int
    visa_type_code: str
    dependency_counts: dict[str, int]
    unexpected_dependencies: tuple[str, ...]
    protected_files_present: bool

    @property
    def executable(self) -> bool:
        return not self.unexpected_dependencies and not self.protected_files_present


def _unexpected_fk_tables() -> tuple[str, ...]:
    inbound: set[str] = set()
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if any(foreign_key.target_fullname == "visa_cases.id" for foreign_key in column.foreign_keys):
                inbound.add(table.name)
    return tuple(sorted(inbound - CASE_OWNED_TABLES))


def build_visa_delete_plan(db: Session, case_id: int) -> VisaDeletePlan:
    row = db.query(VisaCase).filter(VisaCase.id == case_id).first()
    if row is None:
        raise VisaDeleteBlocked("Visa case not found")
    if row.publication_status != "ARCHIVED":
        raise VisaDeleteBlocked("Visa case must be archived before permanent deletion")
    visa_type = db.query(VisaType.code).filter(VisaType.id == row.visa_type_id).scalar()
    counts = {
        model.__tablename__: db.query(model).filter(model.visa_case_id == case_id).count()
        for model in CASE_OWNED_MODELS
    }
    documents = db.query(VisaDocument).filter(VisaDocument.visa_case_id == case_id).all()
    protected_files_present = any(
        bool(item.storage_key or item.upload_idempotency_key or item.checksum_sha256)
        for item in documents
    )
    return VisaDeletePlan(
        case_id=case_id,
        visa_type_code=str(visa_type or "OTHER"),
        dependency_counts=counts,
        unexpected_dependencies=_unexpected_fk_tables(),
        protected_files_present=protected_files_present,
    )


def permanently_delete_visa_case(
    db: Session,
    *,
    case_id: int,
    expected_version: int,
    actor: User,
    reason: str,
    idempotency_key: str,
) -> tuple[VisaCaseDeletionTombstone, bool]:
    normalized_reason = _normalized_reason(reason)
    existing = db.query(VisaCaseDeletionTombstone).filter(
        VisaCaseDeletionTombstone.idempotency_key == idempotency_key
    ).first()
    if existing:
        if (
            existing.visa_case_id != case_id
            or existing.actor_admin_id != actor.id
            or existing.expected_version != expected_version
            or _normalized_reason(existing.reason) != normalized_reason
        ):
            raise VisaDeleteBlocked("Idempotency key belongs to another delete")
        return existing, True
    row = db.query(VisaCase).filter(VisaCase.id == case_id).with_for_update().first()
    if row is None:
        raise VisaDeleteBlocked("Visa case not found")
    if row.version != expected_version:
        raise VisaDeleteBlocked("Visa case changed")
    plan = build_visa_delete_plan(db, case_id)
    if plan.unexpected_dependencies:
        raise VisaDeleteBlocked("Unexpected VisaCase dependencies block deletion")
    if plan.protected_files_present:
        raise VisaDeleteBlocked("Protected document cleanup transaction is not configured")
    for model in CASE_OWNED_MODELS:
        db.query(model).filter(model.visa_case_id == case_id).delete(synchronize_session=False)
    db.delete(row)
    tombstone = VisaCaseDeletionTombstone(
        visa_case_id=case_id,
        visa_type_code=plan.visa_type_code,
        actor_admin_id=actor.id,
        reason=normalized_reason,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
        dependency_counts=plan.dependency_counts,
    )
    db.add(tombstone)
    db.flush()
    return tombstone, False
