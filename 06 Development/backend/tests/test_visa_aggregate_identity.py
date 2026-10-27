"""Synthetic aggregate transaction/replay coverage, NOT PostgreSQL races."""
from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.api import visa_lifecycle as api
from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401
from app.models.admin_safety import StaffGrant
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaCaseAssignment, VisaEvent, VisaNotificationDelivery, VisaProcess, VisaType
from app.services.visa_event_guard import visa_request_fingerprint
from app.services.visa_stay_estimates import EVENT_TYPE as ESTIMATE_EVENT


@pytest.fixture
def fixture(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False); db = factory()
    actor = User(telegram_id=100, ref_code="synthetic-root", role="admin", status="active", locale="en")
    client = User(telegram_id=200, ref_code="synthetic-client", role="client", status="active", locale="en")
    db.add_all([actor, client]); db.flush()
    kind = VisaType(country_code="ID", code="E33G", name="Synthetic E33G only", version=1, rules_verified=False)
    db.add(kind); db.flush()
    case = VisaCase(user_id=client.id, visa_type_id=kind.id, assigned_admin_id=actor.id,
                    entry_deadline=date(2026, 10, 31), stay_end=date(2027, 10, 1),
                    date_source="Synthetic document", dates_confirmed_by=actor.id,
                    dates_confirmed_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.add(case); db.commit()
    monkeypatch.setattr(api, "SessionLocal", factory)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", actor.telegram_id)
    for name in ["VISA_LIFECYCLE_ENABLED", "CLIENT_CABINET_ENABLED", "ADMIN_CLIENT_CRM_ENABLED"]:
        monkeypatch.setattr(settings, name, True)
    monkeypatch.setattr(settings, "VISA_EXTERNAL_TRACKER_ENABLED", False)
    monkeypatch.setattr(settings, "VISA_AI_IMPORT_ENABLED", False)
    try:
        yield db, factory, actor, client, case
    finally:
        db.close(); engine.dispose()


def payload(**changes):
    values = dict(service_status="DOCUMENTS_REQUIRED", expected_version=1,
                  reason="Synthetic aggregate update", idempotency_key="aggregate-identity-key-0001",
                  notify_client=False,
                  processes=[api.ProcessAggregateItem(process_type="APPLICATION", external_status="PROCESSING")])
    values.update(changes)
    if "stay_action" in changes and "reason" not in changes:
        values["reason"] = "Synthetic verified staff confirmation"
    return api.VisaAggregateUpdate(**values)


def snapshot(factory, case_id):
    with factory() as db:
        row = db.get(VisaCase, case_id)
        return {"version": row.version, "status": row.service_status,
                "events": db.query(VisaEvent).count(), "processes": db.query(VisaProcess).count(),
                "deliveries": db.query(VisaNotificationDelivery).count()}


def manager(db, actor, case):
    other = User(telegram_id=301, ref_code="synthetic-manager", role="client", status="active", locale="en")
    db.add(other); db.flush()
    grant = StaffGrant(user_id=other.id, role_code="visa_manager", granted_by_admin_id=actor.id,
                       grant_reason="Synthetic grant", grant_idempotency_key="aggregate-grant-key-0001")
    db.add(grant); db.flush()
    assigned = VisaCaseAssignment(visa_case_id=case.id, staff_user_id=other.id, staff_grant_id=grant.id,
                                 assigned_by_admin_id=actor.id, assignment_reason="Synthetic assignment",
                                 assignment_idempotency_key="aggregate-assignment-key-0001")
    db.add(assigned); db.commit()
    return other, grant, assigned


def test_exact_replay_precedes_stale_version_and_does_not_repeat_process(fixture):
    _, factory, actor, _, case = fixture
    first = api.admin_update_aggregate(case.id, payload(), actor)
    second = api.admin_update_aggregate(case.id, payload(), actor)
    assert first["version"] == second["version"] == 2
    assert snapshot(factory, case.id) == {"version": 2, "status": "DOCUMENTS_REQUIRED", "events": 1, "processes": 1, "deliveries": 0}


@pytest.mark.parametrize("change", [
    {"service_status": "COMPLETED"}, {"reason": "Different reason"}, {"expected_version": 2},
    {"notify_client": True}, {"processes": []}, {"show_to_client": True},
])
def test_same_key_changed_request_is_conflict_without_mutation(fixture, change):
    _, factory, actor, _, case = fixture
    api.admin_update_aggregate(case.id, payload(), actor); before = snapshot(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(**change), actor)
    assert error.value.status_code == 409 and error.value.detail == "VISA_EVENT_KEY_CONFLICT"
    assert snapshot(factory, case.id) == before


def test_key_is_bound_to_case_actor_and_operation(fixture):
    db, factory, actor, client, case = fixture
    other, _, _ = manager(db, actor, case)
    api.admin_update_aggregate(case.id, payload(), actor)
    before = snapshot(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(), other)
    assert error.value.status_code == 409
    second = VisaCase(user_id=client.id, visa_type_id=case.visa_type_id, assigned_admin_id=actor.id)
    db.add(second); db.commit()
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(second.id, payload(), actor)
    assert error.value.status_code == 409 and snapshot(factory, second.id)["version"] == 1
    assert snapshot(factory, case.id) == before


@pytest.mark.parametrize("kind", ["CASE_PUBLISHED", "CLIENT_ENTRY_RECORDED", "CASE_UPDATED"])
def test_foreign_operation_or_legacy_unbound_key_is_not_success(fixture, kind):
    db, factory, actor, _, case = fixture
    db.add(VisaEvent(visa_case_id=case.id, actor_user_id=actor.id, event_type=kind, source="admin",
                     idempotency_key="aggregate-identity-key-0001", visibility="INTERNAL", after={}))
    db.commit(); before = snapshot(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(), actor)
    assert error.value.status_code == 409 and snapshot(factory, case.id) == before


@pytest.mark.parametrize("revocation", ["grant", "assignment", "principal", "mismatched_grant_owner"])
def test_fresh_authorization_before_replay_and_mutation(fixture, revocation):
    db, factory, actor, client, case = fixture
    other, grant, assigned = manager(db, actor, case)
    api.admin_update_aggregate(case.id, payload(), other)
    if revocation == "principal": other.status = "blocked"
    elif revocation == "assignment": assigned.revoked_at = datetime.now(timezone.utc)
    elif revocation == "grant": grant.revoked_at = datetime.now(timezone.utc)
    else: grant.user_id = client.id
    db.commit(); before = snapshot(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(), other)
    assert error.value.status_code in {403, 404} and snapshot(factory, case.id) == before


def test_event_insert_failure_rolls_back_case_process_and_delivery(fixture):
    _, factory, actor, _, case = fixture
    before = snapshot(factory, case.id)
    def fail(session, *_args):
        if any(isinstance(row, VisaEvent) and row.event_type == "CASE_UPDATED" for row in session.new):
            raise IntegrityError("synthetic event insert failure", {}, Exception("synthetic unique race"))
    sa_event.listen(Session, "before_flush", fail)
    try:
        with pytest.raises(HTTPException) as error:
            api.admin_update_aggregate(case.id, payload(show_to_client=True, notify_client=True), actor)
        assert error.value.status_code == 409
    finally:
        sa_event.remove(Session, "before_flush", fail)
    assert snapshot(factory, case.id) == before


@pytest.mark.parametrize("version", [True, "1", 1.1, 0])
def test_expected_version_is_strict(version):
    with pytest.raises(ValidationError): payload(expected_version=version)


def test_request_fingerprint_is_canonical_but_not_value_or_presence_agnostic():
    assert visa_request_fingerprint({"a": 1, "b": 2}) == visa_request_fingerprint({"b": 2, "a": 1})
    assert visa_request_fingerprint({"a": 1}) != visa_request_fingerprint({"a": 1, "b": None})
    with pytest.raises(ValueError): visa_request_fingerprint({"a": float("nan")})


def selection(case, **changes):
    values = dict(action="SELECT", purpose="INITIAL", visa_type_id=case.visa_type_id,
                  visa_type_version=1, variant_id="explicit-365-not-inferred",
                  unit="day", duration=365, counting_policy="base_excluded",
                  month_end_policy="clamp", effective_from="2020-01-01")
    values.update(changes)
    return values


def save_selection(case, actor, **changes):
    values = dict(entered_on=date(2026, 10, 23), stay_estimate_selection=selection(case))
    values.update(changes)
    return api.admin_update_aggregate(case.id, payload(**values), actor)


def staff_action_case(fixture, monkeypatch, *, status="ACTIVE"):
    db, factory, actor, client, case = fixture
    monkeypatch.setattr(api, "bali_today", lambda: date(2026, 10, 23))
    case.lifecycle_status = status
    db.commit()
    return db, factory, actor, client, case


def entry_action(**changes):
    return dict(kind="CONFIRM_ENTRY", entered_on="2026-10-23", source_reference="Synthetic entry stamp", **changes)


def extension_action(process_id, **changes):
    value = dict(kind="CONFIRM_EXTENSION", process_id=process_id, document_stay_end="2028-10-01",
                 source_reference="Synthetic extension document")
    value.update(changes)
    return value


def extension_process(db, case):
    process = VisaProcess(visa_case_id=case.id, process_type="EXTENSION", external_status="ISSUED")
    db.add(process); db.commit()
    return process


def test_staff_entry_and_explicit_period_share_transaction_without_legal_expiry(fixture, monkeypatch):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch, status="ISSUED_NOT_ACTIVATED")
    request = payload(processes=[], stay_action=entry_action(), stay_estimate_selection=selection(case))
    result = api.admin_update_aggregate(case.id, request, actor)
    assert result["version"] == 2 and result["entered_on"] == date(2026, 10, 23)
    assert result["stay_estimates"]["initial"]["estimated_end"] == "2027-10-23"
    assert result["stay_end"] == date(2027, 10, 1) and result["extensions_used"] == 0
    assert result["date_source"] == "Synthetic document" and result["lifecycle_status"] == "ACTIVE"
    assert result["stay_reports"]["entry_provenance"] == "staff_confirmed"
    replay = api.admin_update_aggregate(case.id, request, actor)
    assert replay["version"] == 2
    with factory() as check:
        events = check.query(VisaEvent).all()
        assert sorted(e.event_type for e in events) == ["CASE_UPDATED", ESTIMATE_EVENT]
        assert all(e.source == "admin" and e.actor_user_id == actor.id for e in events)


def test_staff_entry_without_rule_does_not_invent_expiry_or_activate_without_confirmed_end(fixture, monkeypatch):
    db, _, actor, _, case = staff_action_case(fixture, monkeypatch, status="ISSUED_NOT_ACTIVATED")
    case.stay_end = None; db.commit()
    result = api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action()), actor)
    assert result["stay_end"] is None and result["lifecycle_status"] == "ISSUED_NOT_ACTIVATED"
    assert result["stay_estimates"]["initial"]["state"] == "NOT_SELECTED"


def test_staff_entry_rule_failure_rolls_back_entry_and_other_changes(fixture, monkeypatch):
    _, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action(),
            stay_estimate_selection=selection(case, effective_from="2027-01-01")), actor)
    assert error.value.status_code == 422
    with factory() as check:
        row = check.get(VisaCase, case.id)
        assert row.entered_on is None and row.version == 1
        assert check.query(VisaEvent).count() == 0


@pytest.mark.parametrize("status", ["NOT_ISSUED", "EXPIRED", "CANCELLED", "REFUSED"])
def test_staff_fast_actions_never_revive_terminal_or_unissued_even_for_root(fixture, monkeypatch, status):
    _, factory, actor, _, case = staff_action_case(fixture, monkeypatch, status=status)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action()), actor)
    assert error.value.status_code == 422 and snapshot(factory, case.id)["version"] == 1


@pytest.mark.parametrize("field,value", [("entered_on", None), ("stay_end", "2028-01-01"),
                                        ("lifecycle_status", "ACTIVE"), ("date_source", "Other source")])
def test_staff_action_rejects_parallel_ordinary_date_status_fields(fixture, monkeypatch, field, value):
    _, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action(), **{field: value}), actor)
    assert error.value.status_code == 422 and snapshot(factory, case.id)["version"] == 1


def test_staff_extension_confirmed_once_even_with_a_new_key(fixture, monkeypatch):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    process = extension_process(db, case)
    request = payload(processes=[], stay_action=extension_action(process.id))
    first = api.admin_update_aggregate(case.id, request, actor)
    assert first["stay_end"] == date(2028, 10, 1) and first["extensions_used"] == 1
    assert first["lifecycle_status"] == "EXTENDED" and first["version"] == 2
    assert api.admin_update_aggregate(case.id, request, actor)["extensions_used"] == 1
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[],
            idempotency_key="new-extension-confirm-key", stay_action=extension_action(process.id, document_stay_end="2029-10-01")), actor)
    assert error.value.status_code == 409
    with factory() as check:
        row = check.get(VisaCase, case.id); event = check.query(VisaEvent).one()
        assert row.extensions_used == 1 and row.stay_end == date(2028, 10, 1)
        assert event.after["stay_action"]["previous_stay_end"] == "2027-10-01"
        assert event.after["stay_action"]["previous_extensions_used"] == 0


def test_extension_forecast_needs_explicit_consumption_and_history_is_preserved(fixture, monkeypatch):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    process = extension_process(db, case)
    case.expected_stay_end = date(2028, 10, 1); db.commit()
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], stay_action=extension_action(process.id)), actor)
    assert error.value.status_code == 422 and snapshot(factory, case.id)["version"] == 1
    result = api.admin_update_aggregate(case.id, payload(processes=[],
        stay_action=extension_action(process.id, clear_expected_stay_end=True)), actor)
    assert result["expected_stay_end"] is None
    with factory() as check:
        event = check.query(VisaEvent).one()
        assert event.before["expected_stay_end"] == "2028-10-01"
        assert event.after["stay_action"]["clear_expected_stay_end"] is True


@pytest.mark.parametrize("change", ["foreign", "remove", "change_type", "expired_date", "forecast"])
def test_extension_action_guards_process_and_date_binding(fixture, monkeypatch, change):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    process = extension_process(db, case); changes = {}; processes = []
    if change == "foreign":
        other = VisaCase(user_id=case.user_id, visa_type_id=case.visa_type_id, assigned_admin_id=actor.id)
        db.add(other); db.flush(); process.visa_case_id = other.id; db.commit()
    elif change == "remove": processes = [api.ProcessAggregateItem(id=process.id, action="REMOVE")]
    elif change == "change_type": processes = [api.ProcessAggregateItem(id=process.id, process_type="APPLICATION", external_status="ISSUED")]
    elif change == "expired_date": changes["document_stay_end"] = "2026-01-01"
    elif change == "forecast": changes["document_stay_end"] = "2029-01-01"
    values = {"stay_estimate_selection": selection(case, purpose="EXTENSION", counting_policy="base_excluded")} if change == "forecast" else {}
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=processes,
            stay_action=extension_action(process.id, **changes), **values), actor)
    assert error.value.status_code in {404, 422} and snapshot(factory, case.id)["version"] == 1


def test_staff_action_requires_key_and_rechecks_revoked_assignment(fixture, monkeypatch):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], idempotency_key=None, stay_action=entry_action()), actor)
    assert error.value.status_code == 422
    other, _, assignment = manager(db, actor, case)
    request = payload(processes=[], stay_action=entry_action())
    api.admin_update_aggregate(case.id, request, other)
    assignment.revoked_at = datetime.now(timezone.utc); db.commit()
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, request, other)
    assert error.value.status_code == 404 and snapshot(factory, case.id)["version"] == 2


@pytest.mark.parametrize("extra", [{"actor_user_id": 1}, {"extensions_used": 5}, {"confirmed_at": "2026-10-23"}])
def test_staff_action_does_not_accept_supplied_privileged_fields(extra):
    with pytest.raises(ValidationError):
        payload(stay_action={**entry_action(), **extra})


@pytest.mark.parametrize("bad", [None, {}, {"process_id": None}, {"process_id": "1"}, {"process_id": True},
                                {"provenance": "client_report"}, {"extensions_used": True},
                                {"previous_extensions_used": -1}, {"document_stay_end": "2026-02-29"}])
def test_malformed_present_staff_history_never_allows_second_confirmation(fixture, monkeypatch, bad):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    process = extension_process(db, case)
    api.admin_update_aggregate(case.id, payload(processes=[], stay_action=extension_action(process.id)), actor)
    with factory() as tamper:
        event = tamper.query(VisaEvent).one()
        marker = event.after["stay_action"]
        event.after = {**event.after, "stay_action": None if bad is None else {} if not bad else {**marker, **bad}}
        tamper.commit()
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[], idempotency_key="different-confirm-request",
            stay_action=extension_action(process.id, document_stay_end="2029-10-01")), actor)
    assert error.value.status_code == 409
    with factory() as check:
        assert check.get(VisaCase, case.id).extensions_used == 1


def test_newer_invalid_staff_marker_does_not_fall_back_to_old_confirmed_entry(fixture, monkeypatch):
    db, factory, actor, client, case = staff_action_case(fixture, monkeypatch)
    api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action()), actor)
    with factory() as mutate:
        row = mutate.get(VisaCase, case.id)
        mutate.add(VisaEvent(visa_case_id=case.id, actor_user_id=actor.id, event_type="CASE_UPDATED", source="admin",
                            visibility="INTERNAL", after={"stay_action": None}))
        mutate.commit()
        result = api._card(mutate, row, client_view=True)
        assert result["stay_reports"]["entry_provenance"] == "legacy_unknown"
        assert "date_source" not in result and "Synthetic entry stamp" not in str(result)


@pytest.mark.parametrize("status", ["CANCELLED", "REJECTED"])
def test_terminal_extension_process_cannot_be_confirmed(fixture, monkeypatch, status):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    process = extension_process(db, case); process.external_status = status; db.commit()
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], stay_action=extension_action(process.id)), actor)
    assert error.value.status_code == 422 and snapshot(factory, case.id)["version"] == 1


@pytest.mark.parametrize("reason", ["   ", "Manual admin aggregate update"])
def test_staff_action_requires_specific_meaningful_reason(fixture, monkeypatch, reason):
    _, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action(), reason=reason), actor)
    assert error.value.status_code == 422 and snapshot(factory, case.id)["version"] == 1


def test_two_distinct_confirmed_extensions_increment_once_each_with_independent_replays(fixture, monkeypatch):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    first_process = extension_process(db, case)
    first = payload(processes=[], stay_action=extension_action(first_process.id))
    assert api.admin_update_aggregate(case.id, first, actor)["extensions_used"] == 1
    second_process = extension_process(db, case)
    second = payload(processes=[], expected_version=2, idempotency_key="second-real-extension-key",
                     stay_action=extension_action(second_process.id, document_stay_end="2029-10-01"))
    assert api.admin_update_aggregate(case.id, second, actor)["extensions_used"] == 2
    for request in [first, second]:
        assert api.admin_update_aggregate(case.id, request, actor)["extensions_used"] == 2
    with factory() as check:
        assert check.get(VisaCase, case.id).version == 3 and check.query(VisaEvent).count() == 2


@pytest.mark.parametrize("side,field,value", [("before", "extensions_used", True), ("after", "extensions_used", "1"),
    ("before", "stay_end", "2027-09-30"), ("after", "stay_end", "2028-09-30")])
def test_outer_counter_and_date_history_binding_failure_does_not_mutate(fixture, monkeypatch, side, field, value):
    db, factory, actor, _, case = staff_action_case(fixture, monkeypatch)
    process = extension_process(db, case)
    api.admin_update_aggregate(case.id, payload(processes=[], stay_action=extension_action(process.id)), actor)
    with factory() as mutate:
        event = mutate.query(VisaEvent).one(); setattr(event, side, {**getattr(event, side), field: value}); mutate.commit()
    before = snapshot(factory, case.id)
    with pytest.raises(HTTPException) as error:
        api.admin_update_aggregate(case.id, payload(processes=[], expected_version=2, idempotency_key="outer-history-mismatch-key",
            stay_action=extension_action(process.id, document_stay_end="2029-10-01")), actor)
    assert error.value.status_code == 409 and snapshot(factory, case.id) == before
    with factory() as check:
        row = check.get(VisaCase, case.id)
        assert row.stay_end == date(2028, 10, 1) and row.extensions_used == 1


def test_staff_confirmation_preserves_client_report_and_exports_no_evidence(fixture, monkeypatch):
    db, factory, actor, client, case = staff_action_case(fixture, monkeypatch)
    case.entered_on = date(2026, 10, 23)
    db.add(VisaEvent(visa_case_id=case.id, actor_user_id=client.id, source="account", event_type="CLIENT_ENTRY_RECORDED",
                     visibility="INTERNAL", after={"entered_on": "2026-10-23", "provenance": "client_report"})); db.commit()
    api.admin_update_aggregate(case.id, payload(processes=[], stay_action=entry_action()), actor)
    with factory() as check:
        row = check.get(VisaCase, case.id); card = api._card(check, row, timeline=True, client_view=True)
        assert card["stay_reports"]["entry_provenance"] == "staff_confirmed"
        assert check.query(VisaEvent).filter_by(event_type="CLIENT_ENTRY_RECORDED").count() == 1
        for private in ["Synthetic entry stamp", "Synthetic verified staff confirmation", "source_reference", "actor_user_id", "dates_confirmed_by"]:
            assert private not in str(card)


def test_selected_estimate_is_separate_from_confirmed_dates_status_and_count(fixture):
    _, factory, actor, _, case = fixture
    result = save_selection(case, actor)
    estimate = result["stay_estimates"]["initial"]
    assert estimate["state"] == "READY" and estimate["estimated_end"] == "2027-10-23"
    assert estimate["provenance"] == "administrator_provisional" and estimate["confirmation_required"]
    assert result["stay_end"] == date(2027, 10, 1) and result["expected_stay_end"] is None
    assert result["lifecycle_status"] == "NOT_ISSUED" and result["extensions_used"] == 0
    assert result["visa_type"]["id"] == case.visa_type_id
    with factory() as db:
        row = db.get(VisaCase, case.id)
        assert row.date_source == "Synthetic document" and row.dates_confirmed_at == datetime(2026, 10, 1)
        event = db.query(VisaEvent).filter_by(event_type=ESTIMATE_EVENT).one()
        assert event.visibility == "INTERNAL" and event.source == "admin" and event.actor_user_id == actor.id
        assert event.after["slots"]["INITIAL"]["rule"]["verification_kind"] == "administrator_provisional"


def test_selection_replay_is_exact_and_does_not_append_another_snapshot(fixture):
    _, factory, actor, _, case = fixture
    first = save_selection(case, actor)
    assert save_selection(case, actor)["stay_estimates"] == first["stay_estimates"]
    assert snapshot(factory, case.id)["events"] == 2
    with pytest.raises(HTTPException) as error:
        save_selection(case, actor, stay_estimate_selection=selection(case, duration=30))
    assert error.value.status_code == 409 and snapshot(factory, case.id)["events"] == 2


@pytest.mark.parametrize("change", [
    {"idempotency_key": None}, {"stay_estimate_selection": None},
    {"stay_estimate_selection": {"action": "SELECT", "purpose": "INITIAL", "verification_kind": "official_source"}},
])
def test_selection_requires_key_explicit_clear_and_no_client_trusted_verification(fixture, change):
    _, factory, actor, _, case = fixture
    before = snapshot(factory, case.id)
    with pytest.raises((HTTPException, ValidationError)):
        save_selection(case, actor, **change)
    assert snapshot(factory, case.id) == before


def test_independent_initial_extension_slots_and_clear_marker(fixture):
    _, factory, actor, _, case = fixture
    save_selection(case, actor)
    extended = save_selection(case, actor, entered_on=date(2026, 10, 23), expected_version=2,
        idempotency_key="estimate-extension-0001", stay_estimate_selection=selection(case, purpose="EXTENSION", duration=30))
    assert extended["stay_estimates"]["initial"]["estimated_end"] == "2027-10-23"
    assert extended["stay_estimates"]["extension"]["base"] == "2027-10-01"
    assert extended["stay_estimates"]["extension"]["estimated_end"] == "2027-10-31"
    cleared = api.admin_update_aggregate(case.id, payload(expected_version=3, processes=[],
        idempotency_key="estimate-clear-0001", stay_estimate_selection={"action": "CLEAR", "purpose": "INITIAL"}), actor)
    assert cleared["stay_estimates"]["initial"]["state"] == "CLEARED"
    assert cleared["stay_estimates"]["initial"]["estimated_end"] is None
    assert cleared["stay_estimates"]["extension"]["estimated_end"] == "2027-10-31"
    assert snapshot(factory, case.id)["events"] == 6


def test_unrelated_case_version_change_does_not_expire_the_selected_base(fixture):
    _, _, actor, _, case = fixture
    first = save_selection(case, actor)
    second = api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[],
        idempotency_key="estimate-unrelated-0001", requires_attention=True), actor)
    assert second["version"] == 3 and second["stay_estimates"] == first["stay_estimates"]


@pytest.mark.parametrize("purpose,date_field,new_base", [
    ("INITIAL", "entered_on", date(2026, 10, 24)),
    ("EXTENSION", "stay_end", date(2027, 10, 20)),
])
def test_changed_base_requires_explicit_recalc_not_silent_next_extension(fixture, purpose, date_field, new_base):
    _, _, actor, _, case = fixture
    first = save_selection(case, actor, stay_estimate_selection=selection(case, purpose=purpose))
    old_end = first["stay_estimates"][purpose.lower()]["estimated_end"]
    second = api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[],
        idempotency_key="estimate-base-changed-0001", **{date_field: new_base}), actor)
    stale = second["stay_estimates"][purpose.lower()]
    assert old_end and stale["state"] == "RECALC_REQUIRED" and stale["estimated_end"] is None


def test_missing_base_never_uses_today_and_later_date_needs_new_frozen_selection(fixture):
    _, _, actor, _, case = fixture
    first = api.admin_update_aggregate(case.id, payload(stay_estimate_selection=selection(case)), actor)
    assert first["stay_estimates"]["initial"]["state"] == "BASE_REQUIRED"
    assert first["stay_estimates"]["initial"]["base"] is None
    second = api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[],
        idempotency_key="estimate-base-added-0001", entered_on=date(2026, 10, 23)), actor)
    assert second["stay_estimates"]["initial"]["state"] == "RECALC_REQUIRED"
    third = save_selection(case, actor, expected_version=3, idempotency_key="estimate-explicit-recalc-0001", processes=[])
    assert third["stay_estimates"]["initial"]["state"] == "READY"


def test_historical_inactive_type_binding_not_active_type_code_inference(fixture):
    db, _, actor, _, case = fixture
    bound = db.get(VisaType, case.visa_type_id); bound.active = False
    newer = VisaType(country_code="ID", code="E33G", name="Same display code new version", version=2,
                     active=True, initial_stay_days=30, rules_verified=True)
    db.add(newer); db.commit()
    result = save_selection(case, actor)
    assert result["visa_type"]["version"] == 1
    assert result["stay_estimates"]["initial"]["rule"]["duration"] == 365


@pytest.mark.parametrize("change", [
    {"visa_type_id": 9999}, {"visa_type_version": 2}, {"duration": True},
    {"purpose": "EXTENSION", "counting_policy": "base_included"},
    {"effective_from": "2026-10-24"}, {"effective_until": "2019-12-31"},
    {"unit": "year", "duration": 101},
])
def test_invalid_type_policy_and_effective_date_roll_back_everything(fixture, change):
    _, factory, actor, _, case = fixture
    before = snapshot(factory, case.id)
    with pytest.raises((HTTPException, ValidationError)):
        save_selection(case, actor, stay_estimate_selection=selection(case, **change))
    assert snapshot(factory, case.id) == before


@pytest.mark.parametrize("bad", [None, [], {}, {"schema_version": True}])
def test_malformed_latest_snapshot_never_falls_back_to_previous_valid_one(fixture, bad):
    db, factory, actor, _, case = fixture
    save_selection(case, actor)
    db.add(VisaEvent(visa_case_id=case.id, event_type=ESTIMATE_EVENT, source="admin", actor_user_id=actor.id,
                     after=bad, visibility="INTERNAL")); db.commit()
    with factory() as fresh:
        result = api._card(fresh, fresh.get(VisaCase, case.id), client_view=True)
    assert all(slot["state"] == "INVALID_SNAPSHOT" and slot["estimated_end"] is None for slot in result["stay_estimates"].values())


def test_client_projection_excludes_private_snapshot_source_and_events(fixture):
    _, factory, actor, _, case = fixture
    save_selection(case, actor)
    with factory() as db:
        result = api._card(db, db.get(VisaCase, case.id), timeline=True, client_view=True)
    assert result["timeline"] == []
    assert "source_reference" not in str(result["stay_estimates"])
    assert "selected_at_case_version" not in str(result["stay_estimates"])
    assert "actor_user_id" not in str(result["stay_estimates"])


def test_estimate_insert_failure_rolls_back_parent_and_process_mutations(fixture):
    _, factory, actor, _, case = fixture
    before = snapshot(factory, case.id)
    def fail(session, *_args):
        if any(isinstance(row, VisaEvent) and row.event_type == ESTIMATE_EVENT for row in session.new):
            raise IntegrityError("synthetic estimate insert failure", {}, Exception("synthetic failure"))
    sa_event.listen(Session, "before_flush", fail)
    try:
        with pytest.raises(HTTPException) as error: save_selection(case, actor)
        assert error.value.status_code == 409
    finally:
        sa_event.remove(Session, "before_flush", fail)
    assert snapshot(factory, case.id) == before


@pytest.mark.parametrize("status", ["EXPIRED", "CANCELLED", "REFUSED"])
def test_terminal_status_cannot_be_reactivated_by_an_estimate(fixture, status):
    db, factory, actor, _, case = fixture
    case.lifecycle_status = status; db.commit(); before = snapshot(factory, case.id)
    with pytest.raises(HTTPException): save_selection(case, actor)
    assert snapshot(factory, case.id) == before


def test_legacy_type_duration_and_verified_boolean_do_not_select_a_rule(fixture):
    db, factory, _, _, case = fixture
    kind = db.get(VisaType, case.visa_type_id); kind.initial_stay_days = 365; kind.rules_verified = True; db.commit()
    with factory() as fresh:
        result = api._card(fresh, fresh.get(VisaCase, case.id), client_view=True)
    assert result["stay_estimates"]["initial"]["state"] == "NOT_SELECTED"


@pytest.mark.parametrize("status", ["EXPIRED", "CANCELLED", "REFUSED"])
def test_terminal_estimate_explains_review_and_can_be_cleared_without_legal_date_change(fixture, status):
    db, factory, actor, _, case = fixture
    save_selection(case, actor)
    with factory() as fresh:
        row = fresh.get(VisaCase, case.id); row.lifecycle_status = status; fresh.commit()
        card = api._card(fresh, row, client_view=True)
    slot = card["stay_estimates"]["initial"]
    assert slot["state"] == "REVIEW_REQUIRED" and slot["review_reason"] == "TERMINAL_CASE"
    assert slot["estimated_end"] is None and slot["rule"]["duration"] == 365
    cleared = api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[],
        idempotency_key="estimate-terminal-clear-0001", stay_estimate_selection={"action": "CLEAR", "purpose": "INITIAL"}), actor)
    assert cleared["stay_estimates"]["initial"]["state"] == "CLEARED"
    assert cleared["lifecycle_status"] == status and cleared["stay_end"] == date(2027, 10, 1)


def test_type_binding_review_is_distinct_from_terminal_case_and_clear_stays_blocked(fixture):
    db, factory, actor, _, case = fixture
    save_selection(case, actor)
    with factory() as fresh:
        row = fresh.get(VisaCase, case.id); kind = fresh.get(VisaType, row.visa_type_id)
        kind.version += 1; fresh.commit()
        card = api._card(fresh, row, client_view=True)
    assert card["stay_estimates"]["initial"]["review_reason"] == "TYPE_CHANGED"
    with pytest.raises(HTTPException):
        api.admin_update_aggregate(case.id, payload(expected_version=2, processes=[],
            idempotency_key="estimate-type-clear-0001", stay_estimate_selection={"action": "CLEAR", "purpose": "INITIAL"}), actor)


@pytest.mark.parametrize("change", [
    {"duration": 30}, {"unit": "year", "duration": 1}, {"counting_policy": "base_included"},
    {"effective_from": "2021-01-01"}, {"month_end_policy": "reject"}, {"purpose": "EXTENSION"},
])
def test_changed_rule_content_cannot_reuse_same_id_and_version(fixture, change):
    _, _, actor, _, case = fixture
    first = save_selection(case, actor)["stay_estimates"]["initial"]["rule"]
    second = save_selection(case, actor, expected_version=2, processes=[],
        idempotency_key="estimate-rule-identity-0001", stay_estimate_selection=selection(case, **change))
    changed = second["stay_estimates"][change.get("purpose", "INITIAL").lower()]["rule"]
    assert first["rule_id"] != changed["rule_id"] and first["version"] == changed["version"] == 1


def test_equivalent_rule_content_has_stable_identity_but_tampered_snapshot_is_invalid(fixture):
    db, factory, actor, _, case = fixture
    first = save_selection(case, actor)["stay_estimates"]
    second = save_selection(case, actor, expected_version=2, processes=[], idempotency_key="estimate-same-content-0001")
    assert second["stay_estimates"] == first
    latest = db.query(VisaEvent).filter_by(event_type=ESTIMATE_EVENT).order_by(VisaEvent.id.desc()).first()
    import copy
    altered = copy.deepcopy(latest.after)
    altered["slots"]["INITIAL"]["rule"]["rule_id"] = "provisional:unversioned-variant"
    latest.after = altered; db.commit()
    with factory() as fresh:
        result = api._card(fresh, fresh.get(VisaCase, case.id), client_view=True)
    assert result["stay_estimates"]["initial"]["state"] == "INVALID_SNAPSHOT"
