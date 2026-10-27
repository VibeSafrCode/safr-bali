"""Explicit provisional stay selections, separate from confirmed legal dates.

Snapshots are append-only INTERNAL events in the aggregate transaction. A read
never recalculates or silently chains an old extension from a new expiry.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.visa_lifecycle import VisaCase, VisaEvent, VisaType
from app.services.visa_stay import StayRule, StayRuleError, estimate_stay_end

EVENT_TYPE = "STAY_ESTIMATE_UPDATED"
ENTRY_ESTIMATE_EVENT = "CLIENT_ENTRY_ESTIMATE_CALCULATED"
PURPOSES = {"INITIAL", "EXTENSION"}
TERMINAL = {"EXPIRED", "CANCELLED", "REFUSED"}


class StayEstimateBlocked(ValueError):
    pass


class StayEstimateSelection(BaseModel):
    model_config = {"extra": "forbid"}
    action: Literal["SELECT", "CLEAR"]
    purpose: Literal["INITIAL", "EXTENSION"]
    visa_type_id: int | None = Field(default=None, strict=True, ge=1)
    visa_type_version: int | None = Field(default=None, strict=True, ge=1)
    variant_id: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.:-]+$")
    unit: Literal["day", "month", "year"] | None = None
    duration: int | None = Field(default=None, strict=True, ge=1, le=36500)
    counting_policy: Literal["base_included", "base_excluded"] | None = None
    month_end_policy: Literal["clamp", "reject"] | None = None
    effective_from: date | None = None
    effective_until: date | None = None

    @model_validator(mode="after")
    def explicit_selection(self):
        fields = {"visa_type_id", "visa_type_version", "variant_id", "unit", "duration",
                  "counting_policy", "month_end_policy", "effective_from"}
        if self.action == "CLEAR":
            if self.model_fields_set - {"action", "purpose"}:
                raise ValueError("CLEAR accepts only purpose and action")
        elif any(getattr(self, key) is None for key in fields):
            raise ValueError("An explicit type, variant, period and counting policy are required")
        return self


def _base(row: VisaCase, purpose: str) -> date | None:
    return row.entered_on if purpose == "INITIAL" else row.stay_end


def _date(raw) -> date | None:
    if raw is None:
        return None
    if type(raw) is not str or len(raw) != 10:
        raise StayRuleError("Invalid snapshot date")
    result = date.fromisoformat(raw)
    if result.isoformat() != raw:
        raise StayRuleError("Invalid snapshot date")
    return result


def _provisional_identity(rule: StayRule) -> str:
    # Identical id+version must mean identical complete rule content, including
    # type binding, date basis, policies and effective interval. A variant label
    # is not a rule version and cannot identify365 and30days simultaneously.
    body = rule.snapshot()
    del body["rule_id"]
    encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return "provisional:" + hashlib.sha256(encoded.encode()).hexdigest()


def _selection_event(db, row: VisaCase):
    return db.query(VisaEvent).filter(VisaEvent.visa_case_id == row.id,
                                     VisaEvent.event_type == EVENT_TYPE).order_by(VisaEvent.id.desc()).first()


def _validate_bundle(row: VisaCase, event: VisaEvent | None) -> dict | None:
    # A dedicated event type makes even a malformed latest body authoritative:
    # never skip it in favour of an older convenient valid result.
    if event is None:
        return None
    value = event.after
    try:
        if event.source != "admin" or event.visibility != "INTERNAL" or event.actor_user_id is None:
            raise ValueError
        if type(value) is not dict or set(value) != {"schema_version", "case_id", "user_id", "visa_type_id", "visa_type_version", "slots"}:
            raise ValueError
        for key in ("schema_version", "case_id", "user_id", "visa_type_id", "visa_type_version"):
            if type(value[key]) is not int or value[key] < 1:
                raise ValueError
        if value["schema_version"] != 1 or value["case_id"] != row.id or value["user_id"] != row.user_id:
            raise ValueError
        if type(value["slots"]) is not dict or set(value["slots"]) != PURPOSES:
            raise ValueError
        for purpose, slot in value["slots"].items():
            if slot is None:
                continue
            if type(slot) is not dict or set(slot) != {"state", "rule", "base", "estimated_end", "selected_at_case_version"}:
                raise ValueError
            if type(slot["selected_at_case_version"]) is not int or not 1 <= slot["selected_at_case_version"] <= row.version:
                raise ValueError
            if slot["state"] == "CLEARED":
                if any(slot[key] is not None for key in ("rule", "base", "estimated_end")):
                    raise ValueError
                continue
            rule = StayRule.from_snapshot(slot["rule"])
            if (rule.visa_type_id != value["visa_type_id"] or rule.visa_type_version != value["visa_type_version"]
                    or rule.verification_kind != "administrator_provisional"
                    or rule.version != 1 or rule.rule_id != _provisional_identity(rule)
                    or rule.basis != ("entry" if purpose == "INITIAL" else "current_stay_end")):
                raise ValueError
            base, end = _date(slot["base"]), _date(slot["estimated_end"])
            if slot["state"] == "BASE_REQUIRED":
                if base is not None or end is not None:
                    raise ValueError
            elif slot["state"] == "READY" and base is not None and end is not None:
                computed = estimate_stay_end(rule, entered_on=base, current_stay_end=base)
                if computed.end != end:
                    raise ValueError
            else:
                raise ValueError
    except (TypeError, ValueError, KeyError) as error:
        raise StayEstimateBlocked("STAY_ESTIMATE_INVALID_SNAPSHOT_REVIEW_REQUIRED") from error
    return value


def _read_bundle(db, row: VisaCase) -> dict | None:
    return _validate_bundle(row, _selection_event(db, row))


def prepare_selection(db, row: VisaCase, visa_type: VisaType, selection: StayEstimateSelection,
                      *, next_version: int) -> dict:
    previous = _read_bundle(db, row)
    if previous and (previous["visa_type_id"] != visa_type.id or previous["visa_type_version"] != visa_type.version):
        raise StayEstimateBlocked("STAY_ESTIMATE_TYPE_CHANGED_REVIEW_REQUIRED")
    slots = dict(previous["slots"]) if previous else dict.fromkeys(PURPOSES)
    if selection.action == "CLEAR":
        slot = {"state": "CLEARED", "rule": None, "base": None, "estimated_end": None,
                "selected_at_case_version": next_version}
    else:
        if selection.visa_type_id != row.visa_type_id or selection.visa_type_id != visa_type.id or selection.visa_type_version != visa_type.version:
            raise StayEstimateBlocked("STAY_ESTIMATE_TYPE_BINDING_MISMATCH")
        if row.lifecycle_status in TERMINAL:
            raise StayEstimateBlocked("STAY_ESTIMATE_TERMINAL_CASE_REVIEW_REQUIRED")
        try:
            # Manual input can never claim official-source verification. No
            # legacy initial_stay_days, display name or editable verified flag
            # supplies an implicit duration, variant or counting convention.
            rule = StayRule(rule_id="pending-content-identity", version=1,
                            visa_type_id=visa_type.id, visa_type_version=visa_type.version,
                            variant_id=selection.variant_id, unit=selection.unit, duration=selection.duration,
                            basis="entry" if selection.purpose == "INITIAL" else "current_stay_end",
                            counting_policy=selection.counting_policy, month_end_policy=selection.month_end_policy,
                            timezone="Asia/Makassar", verification_kind="administrator_provisional",
                            source_reference="Explicit administrator provisional selection",
                            effective_from=selection.effective_from, effective_until=selection.effective_until)
            rule = replace(rule, rule_id=_provisional_identity(rule))
            base = _base(row, selection.purpose)
            estimate = estimate_stay_end(rule, entered_on=row.entered_on, current_stay_end=row.stay_end) if base is not None else None
        except StayRuleError as error:
            raise StayEstimateBlocked("STAY_ESTIMATE_RULE_OR_BASE_REQUIRES_REVIEW") from error
        slot = {"state": "READY" if estimate else "BASE_REQUIRED", "rule": rule.snapshot(),
                "base": estimate.base.isoformat() if estimate else None,
                "estimated_end": estimate.end.isoformat() if estimate else None,
                "selected_at_case_version": next_version}
    slots[selection.purpose] = slot
    return {"schema_version": 1, "case_id": row.id, "user_id": row.user_id,
            "visa_type_id": visa_type.id, "visa_type_version": visa_type.version, "slots": slots}


def _slot_digest(slot: dict) -> str:
    return hashlib.sha256(json.dumps(slot, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def prepare_entry_calculation(db, row: VisaCase, entered_on: date) -> dict | None:
    """Consume an explicit INITIAL selection once; domain gaps do not erase an entry fact.

    Caller holds the case lock, validates entry, then persists both events in
    one transaction. Database errors are deliberately NOT caught here.
    """
    selected = _selection_event(db, row)
    try:
        value = _validate_bundle(row, selected)
        kind = db.get(VisaType, row.visa_type_id)
        if value is None or kind is None or value["visa_type_id"] != kind.id or value["visa_type_version"] != kind.version:
            return None
        slot = value["slots"]["INITIAL"]
        if row.entered_on is not None or slot is None or slot["state"] != "BASE_REQUIRED":
            return None
        rule = StayRule.from_snapshot(slot["rule"])
        estimate = estimate_stay_end(rule, entered_on=entered_on, current_stay_end=row.stay_end)
    except (StayEstimateBlocked, StayRuleError):
        return None
    digest = _slot_digest(slot)
    # Clearing entered_on later does not make this same selection available
    # for another trip. A new explicit INITIAL selection has a new version.
    if db.query(VisaEvent.id).filter(VisaEvent.visa_case_id == row.id,
            VisaEvent.event_type == ENTRY_ESTIMATE_EVENT,
            VisaEvent.after["initial_slot_digest"].as_string() == digest).first():
        return None
    return {"schema_version": 1, "case_id": row.id, "user_id": row.user_id,
            "visa_type_id": kind.id, "visa_type_version": kind.version,
            "selection_event_id": selected.id, "initial_selection_case_version": slot["selected_at_case_version"],
            "initial_slot_digest": digest, "rule_id": rule.rule_id, "rule_version": rule.version,
            "base": estimate.base.isoformat(), "estimated_end": estimate.end.isoformat(),
            "resulting_case_version": row.version + 1, "estimated": True,
            "rule_provenance": "administrator_provisional", "base_provenance": "client_report"}


def _entry_calculation(db, row: VisaCase, value: dict, slot: dict) -> dict | None:
    latest = db.query(VisaEvent).filter(VisaEvent.visa_case_id == row.id,
            VisaEvent.event_type == ENTRY_ESTIMATE_EVENT).order_by(VisaEvent.id.desc()).first()
    if latest is None:
        return None
    data = latest.after
    # A different/reselected INITIAL slot never inherits an old calculation.
    # An unchanged INITIAL copied by an EXTENSION update keeps its identity.
    if isinstance(data, dict) and data.get("initial_slot_digest") != _slot_digest(slot):
        return None
    invalid = {"state": "RECALC_REQUIRED", "review_reason": "ENTRY_CALCULATION_INVALID"}
    try:
        required = {"schema_version", "case_id", "user_id", "visa_type_id", "visa_type_version",
                    "selection_event_id", "initial_selection_case_version", "initial_slot_digest",
                    "rule_id", "rule_version", "entry_event_id", "base", "estimated_end",
                    "resulting_case_version", "estimated", "rule_provenance", "base_provenance"}
        if type(data) is not dict or set(data) != required:
            raise ValueError
        ints = {"schema_version", "case_id", "user_id", "visa_type_id", "visa_type_version", "selection_event_id",
                "initial_selection_case_version", "rule_version", "entry_event_id", "resulting_case_version"}
        if any(type(data[key]) is not int or data[key] < 1 for key in ints):
            raise ValueError
        if (data["schema_version"] != 1 or data["case_id"] != row.id or data["user_id"] != row.user_id
                or data["visa_type_id"] != value["visa_type_id"] or data["visa_type_version"] != value["visa_type_version"]
                or data["initial_selection_case_version"] != slot["selected_at_case_version"]
                or data["estimated"] is not True or data["rule_provenance"] != "administrator_provisional"
                or data["base_provenance"] != "client_report" or data["resulting_case_version"] > row.version
                or latest.visibility != "INTERNAL" or latest.actor_user_id != row.user_id
                or latest.source not in {"account", "mini_app", "telegram"}):
            raise ValueError
        selected = db.get(VisaEvent, data["selection_event_id"])
        trigger = db.get(VisaEvent, data["entry_event_id"])
        newest_entry = db.query(VisaEvent.id).filter(VisaEvent.visa_case_id == row.id,
            VisaEvent.event_type == "CLIENT_ENTRY_RECORDED").order_by(VisaEvent.id.desc()).first()
        if (selected is None or selected.visa_case_id != row.id or selected.event_type != EVENT_TYPE
                or trigger is None or trigger.visa_case_id != row.id or trigger.event_type != "CLIENT_ENTRY_RECORDED"
                or trigger.actor_user_id != row.user_id or trigger.source != latest.source or trigger.visibility != "INTERNAL"
                or newest_entry is None or newest_entry[0] != trigger.id or not selected.id < trigger.id < latest.id):
            raise ValueError
        selected_value = _validate_bundle(row, selected)
        if selected_value is None or _slot_digest(selected_value["slots"]["INITIAL"]) != data["initial_slot_digest"]:
            raise ValueError
        before, after = trigger.before, trigger.after
        if (type(before) is not dict or type(after) is not dict or set(after) != {"request", "entered_on", "provenance"}
                or before.get("entered_on") is not None or after["provenance"] != "client_report"
                or type(after["request"]) is not dict or set(after["request"]) != {"expected_version", "entered_on"}
                or type(after["request"]["expected_version"]) is not int
                or after["request"]["expected_version"] < data["initial_selection_case_version"]
                or before.get("version") != after["request"]["expected_version"]
                or data["resulting_case_version"] != after["request"]["expected_version"] + 1
                or after["request"]["entered_on"] != data["base"] or after["entered_on"] != data["base"]
                or row.entered_on is None or row.entered_on.isoformat() != data["base"]):
            raise ValueError
        rule = StayRule.from_snapshot(slot["rule"])
        if rule.rule_id != data["rule_id"] or rule.version != data["rule_version"]:
            raise ValueError
        estimate = estimate_stay_end(rule, entered_on=row.entered_on, current_stay_end=row.stay_end)
        if estimate.end.isoformat() != data["estimated_end"] or _date(data["base"]) != estimate.base:
            raise ValueError
    except (StayEstimateBlocked, StayRuleError, TypeError, ValueError, KeyError):
        return invalid
    return {"state": "READY", "base": data["base"], "estimated_end": data["estimated_end"],
            "base_provenance": "client_report", "calculated_from_entry_report": True}


def stay_estimate_projection(db, row: VisaCase, visa_type: VisaType) -> dict:
    def empty(state, reason=None):
        return {purpose.lower(): {"purpose": purpose, "state": state, "estimated": True,
                                  "base": None, "estimated_end": None,
                                  **({"review_reason": reason} if reason else {})} for purpose in sorted(PURPOSES)}
    try:
        value = _read_bundle(db, row)
    except StayEstimateBlocked:
        return empty("INVALID_SNAPSHOT")
    if value is None:
        return empty("NOT_SELECTED")
    if value["visa_type_id"] != row.visa_type_id or value["visa_type_id"] != visa_type.id or value["visa_type_version"] != visa_type.version:
        return empty("REVIEW_REQUIRED", "TYPE_CHANGED")
    result = {}
    for purpose in sorted(PURPOSES):
        slot = value["slots"][purpose]
        if slot is None:
            result[purpose.lower()] = empty("NOT_SELECTED")[purpose.lower()]
            continue
        state, review_reason = slot["state"], None
        if state != "CLEARED":
            actual = _base(row, purpose)
            if row.lifecycle_status in TERMINAL:
                state = "REVIEW_REQUIRED"
                review_reason = "TERMINAL_CASE"
            elif (actual.isoformat() if actual is not None else None) != slot["base"]:
                state = "RECALC_REQUIRED"
        rule = slot["rule"]
        result[purpose.lower()] = {"purpose": purpose, "state": state, "estimated": True,
            "base": slot["base"], "estimated_end": slot["estimated_end"] if state == "READY" else None,
            **({"review_reason": review_reason} if review_reason else {}),
            "provenance": "administrator_provisional", "confirmation_required": True,
            "rule": {key: rule[key] for key in ("rule_id", "version", "variant_id", "unit", "duration", "counting_policy", "month_end_policy")} if rule else None}
        if purpose == "INITIAL" and slot["state"] == "BASE_REQUIRED" and row.lifecycle_status not in TERMINAL:
            derived = _entry_calculation(db, row, value, slot)
            if derived is not None:
                result[purpose.lower()].update(derived)
    return result
