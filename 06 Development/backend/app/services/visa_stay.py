"""Pure stay estimates and report guards; no persistence or legal defaults.

The caller must select and persist an explicit versioned rule snapshot. This
module never infers a rule from a visa name, confirms a document, changes a
lifecycle, or writes the estimate into a confirmed legal date.
"""
from __future__ import annotations

from calendar import monthrange
from dataclasses import asdict, dataclass, fields
from datetime import date, timedelta


class StayRuleError(ValueError):
    pass


def _date(value: date, field: str) -> date:
    # datetime is a date subclass; accepting it would silently mix timezones.
    if type(value) is not date:
        raise StayRuleError(f"{field} must be a date-only value")
    return value


def _positive(value: int, field: str, maximum: int) -> None:
    if type(value) is not int or not 1 <= value <= maximum:
        raise StayRuleError(f"Invalid {field}")


def _one_of(value: str, options: set[str], field: str) -> None:
    if type(value) is not str or value not in options:
        raise StayRuleError(f"Unknown {field}")


@dataclass(frozen=True)
class StayRule:
    rule_id: str
    version: int
    visa_type_id: int
    visa_type_version: int
    variant_id: str
    unit: str
    duration: int
    basis: str
    counting_policy: str
    month_end_policy: str
    timezone: str
    verification_kind: str
    source_reference: str
    effective_from: date
    effective_until: date | None

    def __post_init__(self) -> None:
        for field in ("rule_id", "variant_id", "source_reference"):
            value = getattr(self, field)
            if not isinstance(value, str) or not value.strip() or len(value) > 2000:
                raise StayRuleError(f"Invalid {field}")
        for field in ("version", "visa_type_id", "visa_type_version"):
            _positive(getattr(self, field), field, 2**31 - 1)
        _one_of(self.unit, {"day", "month", "year"}, "duration unit")
        _positive(self.duration, "duration", {"day": 36500, "month": 1200, "year": 100}[self.unit])
        _one_of(self.basis, {"entry", "current_stay_end"}, "date basis")
        _one_of(self.counting_policy, {"base_included", "base_excluded"}, "counting policy")
        if self.basis == "current_stay_end" and self.counting_policy != "base_excluded":
            raise StayRuleError("An extension must not count the previous expiry twice")
        _one_of(self.month_end_policy, {"clamp", "reject"}, "month-end policy")
        if self.timezone != "Asia/Makassar":
            raise StayRuleError("Unsupported stay timezone")
        _one_of(self.verification_kind, {"official_source", "administrator_provisional"}, "rule provenance")
        _date(self.effective_from, "effective_from")
        if self.effective_until is not None:
            _date(self.effective_until, "effective_until")
            if self.effective_until < self.effective_from:
                raise StayRuleError("Invalid effective interval")

    def snapshot(self) -> dict:
        result = asdict(self)
        result["effective_from"] = self.effective_from.isoformat()
        result["effective_until"] = self.effective_until.isoformat() if self.effective_until else None
        return result

    @classmethod
    def from_snapshot(cls, value: dict) -> "StayRule":
        if type(value) is not dict or set(value) != {field.name for field in fields(cls)}:
            raise StayRuleError("Invalid rule snapshot fields")
        values = dict(value)
        for field in ("effective_from", "effective_until"):
            raw = values[field]
            if raw is None and field == "effective_until":
                continue
            try:
                if type(raw) is not str or len(raw) != 10:
                    raise ValueError
                parsed = date.fromisoformat(raw)
                if parsed.isoformat() != raw:
                    raise ValueError
                values[field] = parsed
            except ValueError as error:
                raise StayRuleError("Invalid rule snapshot date") from error
        return cls(**values)


@dataclass(frozen=True)
class StayEstimate:
    end: date
    base: date
    rule: StayRule

    def snapshot(self) -> dict:
        return {"estimated": True, "end": self.end.isoformat(),
                "base": self.base.isoformat(), "rule": self.rule.snapshot()}


def estimate_stay_end(
    rule: StayRule, *, entered_on: date | None, current_stay_end: date | None,
) -> StayEstimate:
    if not isinstance(rule, StayRule):
        raise StayRuleError("An explicit versioned stay rule is required")
    base = entered_on if rule.basis == "entry" else current_stay_end
    _date(base, rule.basis)
    if base < rule.effective_from or (rule.effective_until is not None and base > rule.effective_until):
        raise StayRuleError("Rule is not effective at the selected base date")
    try:
        included = rule.counting_policy == "base_included"
        if rule.unit == "day":
            end = base + timedelta(days=rule.duration - int(included))
        else:
            months = rule.duration * (12 if rule.unit == "year" else 1)
            absolute_month = base.year * 12 + base.month - 1 + months
            year, zero_month = divmod(absolute_month, 12)
            last_day = monthrange(year, zero_month + 1)[1]
            if base.day > last_day and rule.month_end_policy == "reject":
                raise StayRuleError("Calendar boundary requires manual review")
            # The only out-of-range anniversary that has an in-range inclusive
            # result is 10000-01-01. Avoid rejecting its final date.max result.
            if year == 10000 and zero_month == 0 and base.day == 1 and included:
                end = date.max
            else:
                end = date(year, zero_month + 1, min(base.day, last_day))
                # Calendar arithmetic first, then inclusivity.
                if included:
                    end -= timedelta(days=1)
    except (OverflowError, ValueError) as error:
        if isinstance(error, StayRuleError):
            raise
        raise StayRuleError("Stay estimate is outside the supported date range") from error
    return StayEstimate(end=end, base=base, rule=rule)


def validate_entry_report(
    *, entered_on: date, today: date, lifecycle_status: str,
    issued_on: date | None, entry_deadline: date | None,
    current_stay_end: date | None, existing_entered_on: date | None,
) -> None:
    """Validate a self-report; this does not activate a visa or confirm expiry.

    Authorization, strict replay, expected version and transaction locking are
    mandatory at the integration boundary, not substitutes for these guards.
    """
    entered_on, today = _date(entered_on, "entered_on"), _date(today, "today")
    _one_of(lifecycle_status, {"ISSUED_NOT_ACTIVATED", "ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED"}, "visa status; manager review required")
    if entered_on > today:
        raise StayRuleError("Entry cannot be in the future")
    for field, value in (("issued_on", issued_on), ("entry_deadline", entry_deadline),
                         ("current_stay_end", current_stay_end), ("existing_entered_on", existing_entered_on)):
        if value is not None:
            _date(value, field)
    if issued_on and entered_on < issued_on:
        raise StayRuleError("Entry precedes issue date")
    if entry_deadline and entered_on > entry_deadline:
        raise StayRuleError("Entry is after the entry deadline")
    if current_stay_end and (entered_on > current_stay_end or today > current_stay_end):
        raise StayRuleError("The saved expiry requires manager review")
    if existing_entered_on is not None and existing_entered_on != entered_on:
        raise StayRuleError("Entry correction requires manager review")
