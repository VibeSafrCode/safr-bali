"""Staff-recorded services, independent of conversations and account status."""
from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.models.life_services import LifeService
from app.models.order import Order
from app.models.user import User
from app.models.visa_lifecycle import VisaCase


def _registered_visas(query: Query) -> Query:
    return query.filter(
        VisaCase.publication_status.in_(("PUBLISHED", "HIDDEN")),
        VisaCase.service_status != "CANCELLED",
        VisaCase.lifecycle_status != "CANCELLED",
    )


def _registered_orders(db: Session) -> Query:
    return db.query(Order).filter(
        Order.payment_status == "paid", Order.status != "cancelled", Order.cancelled_at.is_(None),
    )


def _registered_life_services(db: Session) -> Query:
    return db.query(LifeService).filter(LifeService.publication_status.in_(("PUBLISHED", "HIDDEN")))


def registered_service_user_predicate(
    db: Session, *, visa_query: Query | None = None,
    include_orders: bool = True, include_life_services: bool = False,
):
    """Correlated user filter with exactly the badge's registration and scope rules."""
    cases = visa_query if visa_query is not None else db.query(VisaCase)
    predicates = [_registered_visas(cases).with_entities(VisaCase.id).filter(
        VisaCase.user_id == User.id,
    ).correlate(User).exists()]
    if include_orders:
        predicates.append(_registered_orders(db).with_entities(Order.id).filter(
            Order.user_id == User.id,
        ).correlate(User).exists())
    if include_life_services and include_orders:
        predicates.append(_registered_life_services(db).with_entities(LifeService.id).filter(
            LifeService.user_id == User.id,
        ).correlate(User).exists())
    return or_(*predicates)


def registered_service_user_ids(
    db: Session,
    user_ids: Iterable[int],
    *,
    visa_query: Query | None = None,
    include_orders: bool = True,
    include_life_services: bool = False,
) -> set[int]:
    """Return matching IDs in at most three queries, preserving caller visa scope.

    A published or hidden staff-created visa case counts until archived or
    cancelled; a saved draft alone does not count. An order counts only after payment has been confirmed. A new
    unpaid request, dialogue, or active account alone never qualifies. Root
    callers may explicitly include published/hidden manual life services;
    drafts and archived records never qualify. No payment inference is made.
    Managers pass their authorized case query and disable unrelated orders.
    That existing restricted scope also disables life services, even if the
    optional flag is accidentally enabled: visa assignments do not grant access
    to housing, bike or insurance records.
    """
    ids = set(user_ids)
    if not ids:
        return set()
    cases = visa_query if visa_query is not None else db.query(VisaCase)
    result = {user_id for (user_id,) in _registered_visas(cases).with_entities(VisaCase.user_id).filter(
        VisaCase.user_id.in_(ids),
    ).distinct().all()}
    if include_orders:
        result.update(user_id for (user_id,) in _registered_orders(db).with_entities(Order.user_id).filter(
            Order.user_id.in_(ids),
        ).distinct().all())
    if include_life_services and include_orders:
        result.update(user_id for (user_id,) in _registered_life_services(db).with_entities(LifeService.user_id).filter(
            LifeService.user_id.in_(ids),
        ).distinct().all())
    return result
