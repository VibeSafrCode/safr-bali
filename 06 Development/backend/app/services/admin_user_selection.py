"""One root-admin user selection for lists and reviewed message audiences."""
from datetime import date, datetime, timedelta
from sqlalchemy import func, or_
from app.models.user import User
from app.models.order import Order
from app.models.service import Service
from app.models.visa_lifecycle import VisaCase
from app.models.web_portal import WebConversation
from app.models.life_services import LifeService
from app.services.registered_services import registered_service_user_predicate
from app.services.visa_lifecycle import active_visa_case_predicate, current_visa_case_predicate


def select_users(db, *, q=None, status_filter=None, joined_from=None, joined_to=None,
                 has_visas=None, visa_expires_within=None, never_dialogued=False,
                 no_services=False, has_services=None, service_category=None, service_categories=None):
    query = db.query(User)
    joined_from = datetime.fromisoformat(joined_from) if isinstance(joined_from, str) else joined_from
    joined_to = datetime.fromisoformat(joined_to) if isinstance(joined_to, str) else joined_to
    current_visa = db.query(VisaCase.id).filter(VisaCase.user_id == User.id, current_visa_case_predicate()).exists()
    if q and q.strip():
        value = q.strip().removeprefix("@")
        terms = [column.ilike(f"%{value}%") for column in (User.username, User.first_name, User.last_name)]
        terms.append((func.coalesce(User.first_name, "") + " " + func.coalesce(User.last_name, "")).ilike(f"%{value}%"))
        if value.isdigit() and int(value) <= 2**63 - 1:
            terms.extend([User.id == int(value), User.telegram_id == int(value)])
        query = query.filter(or_(*terms))
    if status_filter:
        query = query.filter(User.status == status_filter)
    if joined_from:
        query = query.filter(User.created_at >= joined_from)
    if joined_to:
        query = query.filter(User.created_at < joined_to)
    if has_visas is not None:
        query = query.filter(current_visa if has_visas else ~current_visa)
    if visa_expires_within:
        if visa_expires_within not in {7, 15, 30, 45, 60}:
            raise ValueError("Unsupported visa expiry period")
        today = date.today()
        query = query.filter(db.query(VisaCase.id).filter(VisaCase.user_id == User.id,
            active_visa_case_predicate(), VisaCase.stay_end.is_not(None), VisaCase.stay_end >= today,
            VisaCase.stay_end <= today + timedelta(days=visa_expires_within)).exists())
    if never_dialogued:
        query = query.filter(~db.query(WebConversation.id).filter(WebConversation.user_id == User.id).exists())
    if no_services and has_services is True:
        raise ValueError("has_services and no_services are mutually exclusive")
    if no_services or has_services is not None:
        registered = registered_service_user_predicate(db, include_life_services=True)
        query = query.filter(registered if has_services else ~registered)
    if service_category and service_category.strip():
        category = service_category.strip()
        query = query.filter(current_visa if category == "visa" else db.query(Order.id).join(
            Service, Service.id == Order.service_id).filter(Order.user_id == User.id, Order.status != "cancelled",
            or_(Service.category == category, Service.slug == category)).exists())
    if service_categories is not None:
        if (not isinstance(service_categories, list) or not 1 <= len(service_categories) <= 20
                or any(not isinstance(value, str) or not value.strip() or len(value) > 100 for value in service_categories)):
            raise ValueError("Select one or more valid service categories")
        predicates = []
        for category in set(value.strip() for value in service_categories):
            order = db.query(Order.id).join(Service, Service.id == Order.service_id).filter(
                Order.user_id == User.id, Order.status != "cancelled",
                or_(Service.category == category, Service.slug == category)).exists()
            manual = db.query(LifeService.id).filter(LifeService.user_id == User.id,
                LifeService.kind == category, LifeService.publication_status.in_(("PUBLISHED", "HIDDEN"))).exists()
            predicates.extend([order, manual])
            if category == "visa": predicates.append(current_visa)
        query = query.filter(or_(*predicates))
    return query
