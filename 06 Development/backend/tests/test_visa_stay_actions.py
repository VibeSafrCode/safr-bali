"""Synthetic SQLite logic/API fixtures. Not PostgreSQL row-lock proof."""
from datetime import date, datetime, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import visa_lifecycle as api
from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaEvent, VisaNotificationDelivery, VisaType
from app.services import visa_stay_actions as actions
from app.services.visa_stay_estimates import ENTRY_ESTIMATE_EVENT, EVENT_TYPE as SELECTION_EVENT


@pytest.fixture
def fixture(monkeypatch):
    # ASGI sync handlers execute in a worker thread. Share this synthetic
    # in-memory fixture only; this does NOT emulate PostgreSQL concurrency.
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    owner = User(telegram_id=1001, ref_code="synthetic-owner", role="client", status="active", locale="en")
    other = User(telegram_id=1002, ref_code="synthetic-other", role="client", status="active", locale="ru")
    db.add_all([owner, other]); db.flush()
    kind = VisaType(country_code="ID", code="E33G", name="Synthetic E33G only", version=1, rules_verified=False)
    db.add(kind); db.flush()
    case = VisaCase(user_id=owner.id, visa_type_id=kind.id, assigned_admin_id=other.id, publication_status="PUBLISHED",
                    lifecycle_status="ISSUED_NOT_ACTIVATED", service_status="COMPLETED",
                    issued_on=date(2026, 10, 1), entry_deadline=date(2026, 11, 1),
                    stay_end=date(2027, 10, 9), expected_stay_end=date(2027, 11, 9),
                    extensions_used=0, version=1, date_source="PRIVATE-SOURCE-NOT-FOR-CLIENT",
                    dates_confirmed_by=other.id, dates_confirmed_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.add(case); db.commit()
    monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(actions, "bali_today", lambda: date(2026, 10, 23))
    for name in ("VISA_LIFECYCLE_ENABLED", "CLIENT_CABINET_ENABLED", "ADMIN_CLIENT_CRM_ENABLED"):
        monkeypatch.setattr(settings, name, True)
    monkeypatch.setattr(settings, "VISA_EXTERNAL_TRACKER_ENABLED", False)
    monkeypatch.setattr(settings, "VISA_AI_IMPORT_ENABLED", False)
    try:
        yield db, factory, owner, other, case
    finally:
        db.close(); engine.dispose()


def entry(**updates):
    values = dict(entered_on=date(2026, 10, 10), expected_version=1, idempotency_key="synthetic-entry-key-0001")
    values.update(updates)
    return api.EntryUpdate(**values)


def extension(**updates):
    values = dict(kind="RECEIVED", reported_on=date(2026, 10, 22),
                  reported_stay_end=date(2028, 10, 9), expected_version=1,
                  idempotency_key="synthetic-extension-key-0001")
    values.update(updates)
    return api.ExtensionReportUpdate(**values)


def saved(factory, case_id):
    with factory() as db:
        row = db.get(VisaCase, case_id)
        return {field: getattr(row, field) for field in ("version", "entered_on", "lifecycle_status", "stay_end", "expected_stay_end", "extensions_used", "date_source", "dates_confirmed_by", "dates_confirmed_at")}


def select_initial_rule(fixture, monkeypatch, *, keep_confirmed=False, **changes):
    db, _, _, admin, case = fixture
    admin.role = "admin"
    if not keep_confirmed:
        case.stay_end = None; case.expected_stay_end = None
    db.commit()
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", admin.telegram_id)
    rule = dict(action="SELECT", purpose="INITIAL", visa_type_id=case.visa_type_id,
                visa_type_version=1, variant_id="synthetic-365", unit="day", duration=365,
                counting_policy="base_excluded", month_end_policy="clamp", effective_from="2020-01-01")
    rule.update(changes)
    result = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=1,
        idempotency_key="synthetic-initial-selection-0001", reason="Synthetic explicit provisional rule",
        processes=[], stay_estimate_selection=rule), admin)
    return rule, result


@pytest.mark.parametrize("source", ["account", "mini_app", "telegram"])
def test_entry_calculates_explicit_initial_rule_once_in_same_transaction_without_confirming_it(fixture, monkeypatch, source):
    _, factory, owner, _, case = fixture
    _, selected = select_initial_rule(fixture, monkeypatch)
    assert selected["stay_estimates"]["initial"]["state"] == "BASE_REQUIRED"
    before = saved(factory, case.id)
    body = entry(expected_version=2)
    result = api._entry(case.id, body, owner, source)
    slot = result["stay_estimates"]["initial"]
    assert slot["state"] == "READY" and slot["base"] == "2026-10-10" and slot["estimated_end"] == "2027-10-10"
    assert slot["base_provenance"] == "client_report" and slot["provenance"] == "administrator_provisional"
    assert slot["calculated_from_entry_report"] is True and slot["confirmation_required"] is True
    assert result["lifecycle_status"] == before["lifecycle_status"] and result["stay_end"] is None
    replay = api._entry(case.id, body, owner, source)
    assert replay["idempotent_replay"] is True and replay["stay_estimates"] == result["stay_estimates"]
    with factory() as check:
        derived = check.query(VisaEvent).filter_by(event_type=ENTRY_ESTIMATE_EVENT).one()
        trigger = check.get(VisaEvent, derived.after["entry_event_id"])
        assert trigger.event_type == "CLIENT_ENTRY_RECORDED" and derived.source == trigger.source == source
        assert derived.actor_user_id == trigger.actor_user_id == owner.id and derived.visibility == "INTERNAL"
        assert derived.after["resulting_case_version"] == 3
        assert check.query(VisaEvent).count() == 4 and check.query(VisaNotificationDelivery).count() == 0
    assert "selection_event_id" not in str(slot) and "entry_event_id" not in str(slot) and "actor_user_id" not in str(slot)


@pytest.mark.parametrize("gap", ["clear", "invalid", "type", "interval", "calendar"])
def test_domain_rule_gap_keeps_entry_fact_but_never_invents_a_countdown(fixture, monkeypatch, gap):
    db, factory, owner, admin, case = fixture
    changes = {"effective_from": "2026-10-20"} if gap == "interval" else {"unit": "month", "duration": 1, "month_end_policy": "reject"} if gap == "calendar" else {}
    if gap == "calendar":
        case.issued_on = date(2026, 1, 1); db.commit()
    select_initial_rule(fixture, monkeypatch, **changes)
    expected_version = 2
    if gap == "clear":
        api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=2, processes=[],
            idempotency_key="synthetic-clear-selection-0001", reason="Synthetic clear", stay_estimate_selection={"action": "CLEAR", "purpose": "INITIAL"}), admin)
        expected_version = 3
    elif gap == "invalid":
        db.add(VisaEvent(visa_case_id=case.id, actor_user_id=admin.id, source="admin", event_type=SELECTION_EVENT, visibility="INTERNAL", after={})); db.commit()
    elif gap == "type":
        db.get(VisaType, case.visa_type_id).version += 1; db.commit()
    result = api._entry(case.id, entry(expected_version=expected_version, entered_on=date(2026, 1, 31) if gap == "calendar" else date(2026, 10, 10)), owner, "account")
    assert result["entered_on"] is not None and result["stay_estimates"]["initial"]["state"] != "READY"
    assert result["stay_estimates"]["initial"]["estimated_end"] is None
    with factory() as check: assert check.query(VisaEvent).filter_by(event_type=ENTRY_ESTIMATE_EVENT).count() == 0


def test_unrelated_extension_selection_preserves_the_initial_slot_identity_and_calculation(fixture, monkeypatch):
    _, _, owner, admin, case = fixture
    rule, _ = select_initial_rule(fixture, monkeypatch)
    first = api._entry(case.id, entry(expected_version=2), owner, "account")
    second = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=3, processes=[],
        idempotency_key="synthetic-extension-rule-0001", reason="Synthetic separate extension rule",
        stay_estimate_selection={**rule, "purpose": "EXTENSION", "duration": 30}), admin)
    assert second["stay_estimates"]["initial"] == first["stay_estimates"]["initial"]
    assert second["stay_estimates"]["extension"]["state"] == "BASE_REQUIRED"


def test_new_explicit_initial_selection_supersedes_derived_even_with_identical_rule_content(fixture, monkeypatch):
    _, _, owner, admin, case = fixture
    rule, _ = select_initial_rule(fixture, monkeypatch)
    first = api._entry(case.id, entry(expected_version=2), owner, "account")
    second = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=3, processes=[],
        idempotency_key="synthetic-reselect-initial-0001", reason="Synthetic explicit recalculation", stay_estimate_selection=rule), admin)
    assert second["stay_estimates"]["initial"]["rule"] == first["stay_estimates"]["initial"]["rule"]
    assert second["stay_estimates"]["initial"]["state"] == "READY"
    assert "calculated_from_entry_report" not in second["stay_estimates"]["initial"]
    cleared = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=4, processes=[],
        idempotency_key="synthetic-clear-after-derived-0001", reason="Synthetic clear",
        stay_estimate_selection={"action": "CLEAR", "purpose": "INITIAL"}), admin)
    assert cleared["stay_estimates"]["initial"]["state"] == "CLEARED"


def test_manager_entry_correction_hides_derived_and_clearing_does_not_reconsume_same_selection(fixture, monkeypatch):
    _, factory, owner, admin, case = fixture
    select_initial_rule(fixture, monkeypatch)
    api._entry(case.id, entry(expected_version=2), owner, "account")
    changed = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=3, processes=[],
        idempotency_key="synthetic-manager-entry-correction", reason="Synthetic correction", entered_on=date(2026, 10, 11)), admin)
    assert changed["stay_estimates"]["initial"]["state"] == "RECALC_REQUIRED"
    api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=4, processes=[],
        idempotency_key="synthetic-manager-entry-clear", reason="Synthetic clear entry", entered_on=None), admin)
    result = api._entry(case.id, entry(expected_version=5, idempotency_key="synthetic-new-trip-report", entered_on=date(2026, 10, 12)), owner, "account")
    assert result["stay_estimates"]["initial"]["state"] != "READY"
    with factory() as check: assert check.query(VisaEvent).filter_by(event_type=ENTRY_ESTIMATE_EVENT).count() == 1
    # A manager can explicitly select a NEW INITIAL operation for a new trip;
    # it is not the old selection becoming reusable from a null date alone.
    api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(expected_version=6, processes=[],
        idempotency_key="synthetic-explicit-new-trip-selection", reason="Synthetic new explicit trip",
        entered_on=None, stay_estimate_selection=dict(action="SELECT", purpose="INITIAL", visa_type_id=case.visa_type_id,
            visa_type_version=1, variant_id="synthetic-365", unit="day", duration=365, counting_policy="base_excluded",
            month_end_policy="clamp", effective_from="2020-01-01")), admin)
    third = api._entry(case.id, entry(expected_version=7, idempotency_key="synthetic-explicit-new-trip-entry", entered_on=date(2026, 10, 13)), owner, "account")
    assert third["stay_estimates"]["initial"]["state"] == "READY" and third["stay_estimates"]["initial"]["base"] == "2026-10-13"


@pytest.mark.parametrize("field,value", [
    ("entry_event_id", 9999), ("selection_event_id", 9999), ("resulting_case_version", True),
    ("base", "2026-10-11"), ("estimated_end", "2028-01-01"), ("rule_id", "wrong"),
    ("initial_slot_digest", "wrong"), ("base_provenance", "official"), ("estimated", False),
    ("case_id", 9999), ("visa_type_version", 2), ("initial_selection_case_version", 9999),
])
def test_malformed_latest_derived_never_falls_back_to_older_success(fixture, monkeypatch, field, value):
    _, factory, owner, _, case = fixture
    select_initial_rule(fixture, monkeypatch)
    api._entry(case.id, entry(expected_version=2), owner, "account")
    with factory() as check:
        good = check.query(VisaEvent).filter_by(event_type=ENTRY_ESTIMATE_EVENT).one()
        check.add(VisaEvent(visa_case_id=case.id, actor_user_id=owner.id, source="account", event_type=ENTRY_ESTIMATE_EVENT,
                           visibility="INTERNAL", after={**good.after, field: value})); check.commit()
    result = api._detail_for_user(case.id, owner)
    assert result["stay_estimates"]["initial"]["state"] == "RECALC_REQUIRED"
    assert result["stay_estimates"]["initial"]["estimated_end"] is None


def test_derived_insert_failure_rolls_back_entry_fact_version_and_trigger_event(fixture, monkeypatch):
    _, factory, owner, _, case = fixture
    select_initial_rule(fixture, monkeypatch); before = saved(factory, case.id)
    def refuse(_mapper, _connection, target):
        if target.event_type == ENTRY_ESTIMATE_EVENT:
            raise IntegrityError("synthetic derived failure", {}, Exception("synthetic"))
    event.listen(VisaEvent, "before_insert", refuse)
    try:
        with pytest.raises(HTTPException) as error: api._entry(case.id, entry(expected_version=2), owner, "account")
        assert error.value.status_code == 409
    finally:
        event.remove(VisaEvent, "before_insert", refuse)
    assert saved(factory, case.id) == before
    with factory() as check:
        assert check.query(VisaEvent).filter(VisaEvent.event_type.in_(["CLIENT_ENTRY_RECORDED", ENTRY_ESTIMATE_EVENT])).count() == 0


def test_derived_estimate_preserves_an_existing_confirmed_expiry_and_extension_forecast(fixture, monkeypatch):
    _, factory, owner, _, case = fixture
    select_initial_rule(fixture, monkeypatch, keep_confirmed=True); before = saved(factory, case.id)
    result = api._entry(case.id, entry(expected_version=2), owner, "account")
    assert result["stay_estimates"]["initial"]["estimated_end"] == "2027-10-10"
    after = saved(factory, case.id)
    for field in ("stay_end", "expected_stay_end", "lifecycle_status", "extensions_used", "date_source", "dates_confirmed_by", "dates_confirmed_at"):
        assert after[field] == before[field]


@pytest.mark.parametrize("unit,duration,policy,expected", [
    ("year", 1, "base_excluded", "2025-02-28"),
    ("year", 1, "base_included", "2025-02-27"),
    ("day", 366, "base_excluded", "2025-03-01"),
])
def test_entry_calculation_uses_the_explicit_calendar_and_inclusion_policy(fixture, monkeypatch, unit, duration, policy, expected):
    db, _, owner, _, case = fixture
    case.issued_on = date(2024, 1, 1); db.commit()
    select_initial_rule(fixture, monkeypatch, unit=unit, duration=duration, counting_policy=policy)
    result = api._entry(case.id, entry(expected_version=2, entered_on=date(2024, 2, 29)), owner, "account")
    assert result["stay_estimates"]["initial"]["estimated_end"] == expected


@pytest.mark.parametrize("source", ["account", "mini_app", "telegram"])
def test_entry_is_owner_report_not_activation_or_legal_expiry(fixture, source):
    db, factory, owner, other, case = fixture
    before = saved(factory, case.id)
    result = api._entry(case.id, entry(), owner, source)
    assert result["version"] == 2 and result["entered_on"] == date(2026, 10, 10)
    assert result["lifecycle_status"] == before["lifecycle_status"]
    assert result["stay_reports"]["entry_provenance"] == "client_report"
    assert "PRIVATE-SOURCE" not in str(result) and "date_source" not in result
    after = saved(factory, case.id)
    for field in ("stay_end", "expected_stay_end", "extensions_used", "date_source", "dates_confirmed_by", "dates_confirmed_at"):
        assert after[field] == before[field]
    with factory() as check:
        assert check.query(VisaEvent).count() == 1
        assert check.query(VisaNotificationDelivery).count() == 0


def test_exact_replay_precedes_stale_version_but_different_body_or_source_is_conflict(fixture):
    _, factory, owner, _, case = fixture
    first = api._entry(case.id, entry(), owner, "account")
    replay = api._entry(case.id, entry(), owner, "account")
    assert replay["version"] == first["version"] == 2 and replay["idempotent_replay"] is True
    for payload, source in ((entry(entered_on=date(2026, 10, 11)), "account"), (entry(), "mini_app"), (entry(expected_version=2), "account")):
        with pytest.raises(HTTPException) as error:
            api._entry(case.id, payload, owner, source)
        assert error.value.status_code == 409
    assert saved(factory, case.id)["version"] == 2


@pytest.mark.parametrize("status", ["NOT_ISSUED", "EXPIRED", "CANCELLED", "REFUSED"])
def test_entry_does_not_reanimate_terminal_or_unissued_case(fixture, status):
    db, factory, owner, _, case = fixture
    case.lifecycle_status = status; db.commit()
    before = saved(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api._entry(case.id, entry(), owner, "account")
    assert error.value.status_code == 422 and saved(factory, case.id) == before


@pytest.mark.parametrize("value", [date(2026, 10, 24), date(2026, 9, 30), date(2026, 11, 2)])
def test_entry_date_guard_is_atomic(fixture, value):
    _, factory, owner, _, case = fixture
    before = saved(factory, case.id)
    with pytest.raises(HTTPException):
        api._entry(case.id, entry(entered_on=value), owner, "account")
    assert saved(factory, case.id) == before
    with factory() as check:
        assert check.query(VisaEvent).count() == 0


@pytest.mark.parametrize("visibility", ["DRAFT", "HIDDEN", "ARCHIVED"])
def test_nonpublic_case_is_inaccessible_for_entry_and_extension(fixture, visibility):
    db, factory, owner, _, case = fixture
    case.publication_status = visibility; db.commit()
    for call, body in ((api._entry, entry()), (api._extension_report, extension())):
        with pytest.raises(HTTPException) as error:
            call(case.id, body, owner, "account")
        assert error.value.status_code == 404
    assert saved(factory, case.id)["version"] == 1


def test_wrong_owner_inactive_actor_and_stale_version_do_not_mutate(fixture):
    db, factory, owner, other, case = fixture
    for actor, payload, code in ((other, entry(), 404), (owner, entry(expected_version=2), 409)):
        with pytest.raises(HTTPException) as error:
            api._entry(case.id, payload, actor, "account")
        assert error.value.status_code == code
    owner.status = "blocked"; db.commit()
    with pytest.raises(HTTPException) as error:
        api._extension_report(case.id, extension(), owner, "account")
    assert error.value.status_code == 404 and saved(factory, case.id)["version"] == 1


def test_key_of_another_case_actor_or_operation_never_counts_as_success(fixture):
    db, factory, owner, other, case = fixture
    db.add(VisaEvent(visa_case_id=case.id, actor_user_id=other.id, event_type="CASE_UPDATED",
                     source="admin", idempotency_key=entry().idempotency_key,
                     after={"request": {"entered_on": "2026-10-10", "expected_version": 1}}))
    db.commit()
    with pytest.raises(HTTPException) as error:
        api._entry(case.id, entry(), owner, "account")
    assert error.value.status_code == 409 and saved(factory, case.id)["version"] == 1
    result = api._extension_report(case.id, extension(), owner, "account")
    with pytest.raises(HTTPException) as error:
        api._entry(case.id, entry(expected_version=2, idempotency_key=extension().idempotency_key), owner, "account")
    assert error.value.status_code == 409 and result["version"] == 2


@pytest.mark.parametrize("kind", ["APPLIED", "RECEIVED"])
@pytest.mark.parametrize("status", ["ACTIVE", "EXPIRED"])
def test_extension_report_does_not_change_legal_dates_status_or_number(fixture, kind, status):
    db, factory, owner, _, case = fixture
    case.lifecycle_status = status; db.commit()
    before = saved(factory, case.id)
    body = extension(kind=kind)
    result = api._extension_report(case.id, body, owner, "account")
    assert result["stay_reports"]["extension"] == {"kind": kind, "reported_on": "2026-10-22", "reported_stay_end": "2028-10-09", "provenance": "client_report", "verified": False}
    replay = api._extension_report(case.id, body, owner, "account")
    assert replay["idempotent_replay"] is True
    after = saved(factory, case.id)
    for field in before:
        if field != "version": assert after[field] == before[field]
    assert after["version"] == 2
    with factory() as check:
        assert check.query(VisaEvent).count() == 1 and check.query(VisaNotificationDelivery).count() == 0


def test_same_extension_report_with_new_key_does_not_duplicate_event(fixture):
    _, factory, owner, _, case = fixture
    api._extension_report(case.id, extension(), owner, "account")
    with pytest.raises(HTTPException) as error:
        api._extension_report(case.id, extension(expected_version=2, idempotency_key="synthetic-second-extension-key"), owner, "account")
    assert error.value.status_code == 409 and saved(factory, case.id)["version"] == 2


def test_event_insert_failure_rolls_back_case_and_never_succeeds(fixture):
    _, factory, owner, _, case = fixture
    before = saved(factory, case.id)
    def refuse(*args):
        raise IntegrityError("synthetic event conflict", {}, Exception("synthetic"))
    event.listen(VisaEvent, "before_insert", refuse)
    try:
        with pytest.raises(HTTPException) as error:
            api._entry(case.id, entry(), owner, "account")
        assert error.value.status_code == 409
    finally:
        event.remove(VisaEvent, "before_insert", refuse)
    assert saved(factory, case.id) == before


@pytest.mark.parametrize("values", [{}, {"expected_version": True}, {"expected_version": 1.5}, {"expected_version": 0}, {"expected_version": 1, "lifecycle_status": "ACTIVE"}])
def test_entry_contract_requires_strict_version_and_rejects_injected_fields(values):
    with pytest.raises(ValidationError):
        api.EntryUpdate(entered_on="2026-10-10", idempotency_key="synthetic-entry", **values)


def test_malformed_historical_report_is_not_a_client_payload_or_crash(fixture):
    db, factory, owner, _, case = fixture
    db.add(VisaEvent(visa_case_id=case.id, actor_user_id=owner.id, event_type="CLIENT_EXTENSION_REPORTED", source="account", after={"provenance": "client_report", "report": {"kind": [], "reported_on": "<secret>", "private_note": "NEVER EXPOSE"}}))
    db.commit()
    result = api._detail_for_user(case.id, owner)
    assert result["stay_reports"]["extension"] is None and "NEVER EXPOSE" not in str(result)


def test_route_parity_preserves_existing_auth_dependencies():
    web = next(r for r in api.web_router.routes if r.path.endswith("/{case_id}/extension-report"))
    mini = next(r for r in api.mini_router.routes if r.path.endswith("/{case_id}/extension-report"))
    service = next(r for r in api.service_router.routes if r.path.endswith("/cases/{case_id}/extension-report"))
    assert api.require_client_write in [d.call for d in web.dependant.dependencies]
    assert api.require_mini_app_user in [d.call for d in mini.dependant.dependencies]
    assert api.require_service_token in [d.call for d in service.dependant.dependencies]


def test_request_key_cannot_be_replayed_on_another_owned_case(fixture):
    db, factory, owner, other, case = fixture
    api._entry(case.id, entry(), owner, "account")
    second = VisaCase(user_id=owner.id, visa_type_id=case.visa_type_id, assigned_admin_id=other.id,
                      publication_status="PUBLISHED", lifecycle_status="ISSUED_NOT_ACTIVATED", version=1)
    db.add(second); db.commit()
    with pytest.raises(HTTPException) as error:
        api._entry(second.id, entry(), owner, "account")
    assert error.value.status_code == 409 and saved(factory, second.id)["version"] == 1
    assert saved(factory, second.id)["entered_on"] is None


@pytest.mark.parametrize("updates", [{"reported_on": date(2026, 10, 24)}, {"reported_on": date(2026, 9, 30)}, {"reported_stay_end": date(2027, 10, 9)}, {"reported_stay_end": date(2026, 10, 21)}])
def test_invalid_extension_reports_leave_case_and_events_unchanged(fixture, updates):
    _, factory, owner, _, case = fixture
    before = saved(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api._extension_report(case.id, extension(**updates), owner, "account")
    assert error.value.status_code == 422 and saved(factory, case.id) == before


def test_http_web_csrf_schema_and_response_match_actual_route(fixture, monkeypatch):
    _, factory, owner, _, case = fixture
    monkeypatch.setattr(settings, "APPLICATION_URL", "http://synthetic.test")
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 10000)
    app = FastAPI(); app.include_router(api.web_router)
    # Synthetic identity only. Real Origin/CSRF dependencies are NOT overridden.
    app.dependency_overrides[api.session_user] = lambda: owner
    body = {"entered_on": "2026-10-10", "expected_version": 1, "idempotency_key": "synthetic-http-entry"}
    with TestClient(app) as client:
        path = f"/api/web/visa-cases/{case.id}/entry"
        client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, "synthetic-session")
        assert client.post(path, json=body).status_code == 403
        headers = {"Origin": "http://synthetic.test", "X-CSRF-Token": api.admin_csrf_token("synthetic-session")}
        assert client.post(path, json={"entered_on": "2026-10-10", "idempotency_key": "synthetic-http-entry"}, headers=headers).status_code == 422
        result = client.post(path, json=body, headers=headers)
        assert result.status_code == 200
        data = result.json()
        assert data["entered_on"] == "2026-10-10" and data["version"] == 2
        assert data["lifecycle_status"] == "ISSUED_NOT_ACTIVATED"
        assert data["stay_reports"]["entry_provenance"] == "client_report"
        assert "PRIVATE-SOURCE" not in result.text
        assert client.post(path, json=body, headers=headers).json()["idempotent_replay"] is True


def test_http_service_requires_actual_token_and_preserves_owner_report(fixture, monkeypatch):
    _, factory, owner, _, case = fixture
    monkeypatch.setattr(settings, "SERVICE_API_TOKEN", "synthetic-scoped-service-token")
    app = FastAPI(); app.include_router(api.service_router)
    path = f"/api/service/visa-lifecycle/users/by-telegram/{owner.telegram_id}/cases/{case.id}/extension-report"
    body = {"kind": "APPLIED", "reported_on": "2026-10-22", "reported_stay_end": None,
            "expected_version": 1, "idempotency_key": "synthetic-http-extension"}
    with TestClient(app) as client:
        assert client.post(path, json=body).status_code == 401
        result = client.post(path, json=body, headers={"X-Service-Token": "synthetic-scoped-service-token"})
        assert result.status_code == 200 and result.json()["version"] == 2
        assert result.json()["stay_reports"]["extension"]["verified"] is False
    assert saved(factory, case.id)["extensions_used"] == 0
