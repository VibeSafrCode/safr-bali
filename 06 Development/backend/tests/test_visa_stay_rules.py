"""Synthetic policies only: not certification of any immigration duration."""
from dataclasses import FrozenInstanceError, replace
from datetime import date, datetime, timezone
import unittest

from app.services.visa_stay import StayRule, StayRuleError, estimate_stay_end, validate_entry_report


def rule(**updates):
    values = dict(rule_id="synthetic-selected-rule", version=1, visa_type_id=7,
                  visa_type_version=3, variant_id="selected-not-name-inferred",
                  unit="day", duration=365, basis="entry", counting_policy="base_included",
                  month_end_policy="clamp", timezone="Asia/Makassar",
                  verification_kind="administrator_provisional", source_reference="synthetic test only",
                  effective_from=date(2020, 1, 1), effective_until=None)
    values.update(updates)
    return StayRule(**values)


class StayRuleTests(unittest.TestCase):
    def test_selected_day_durations_have_explicit_inclusivity(self):
        base = date(2026, 10, 23)
        for duration in (1, 30, 60, 180, 365):
            for included in (True, False):
                with self.subTest(duration=duration, included=included):
                    result = estimate_stay_end(rule(duration=duration, counting_policy="base_included" if included else "base_excluded"), entered_on=base, current_stay_end=None)
                    self.assertEqual((result.end - base).days, duration - int(included))
                    self.assertTrue(result.snapshot()["estimated"])

    def test_365_days_is_not_a_calendar_year_across_leap_day(self):
        base = date(2027, 3, 1)
        days = estimate_stay_end(rule(), entered_on=base, current_stay_end=None)
        year = estimate_stay_end(rule(unit="year", duration=1), entered_on=base, current_stay_end=None)
        self.assertEqual(days.end, date(2028, 2, 28))
        self.assertEqual(year.end, date(2028, 2, 29))

    def test_calendar_month_clamps_only_when_selected(self):
        base = date(2028, 1, 31)
        result = estimate_stay_end(rule(unit="month", duration=1, counting_policy="base_excluded"), entered_on=base, current_stay_end=None)
        self.assertEqual(result.end, date(2028, 2, 29))
        with self.assertRaises(StayRuleError):
            estimate_stay_end(rule(unit="month", duration=1, month_end_policy="reject"), entered_on=base, current_stay_end=None)

    def test_leap_anniversary_and_inclusivity_order_are_explicit(self):
        result = estimate_stay_end(rule(unit="year", duration=1), entered_on=date(2028, 2, 29), current_stay_end=None)
        self.assertEqual(result.end, date(2029, 2, 27))

    def test_extension_uses_saved_expiry_not_entry_or_today(self):
        result = estimate_stay_end(rule(basis="current_stay_end", duration=30, counting_policy="base_excluded"), entered_on=date(2026, 1, 1), current_stay_end=date(2026, 10, 23))
        self.assertEqual(result.base, date(2026, 10, 23))
        self.assertEqual(result.end, date(2026, 11, 22))
        with self.assertRaises(StayRuleError):
            rule(basis="current_stay_end")

    def test_missing_or_timestamp_base_never_falls_back_to_now(self):
        for base in (None, "2026-10-23", datetime(2026, 10, 23, tzinfo=timezone.utc)):
            with self.subTest(base=base), self.assertRaises(StayRuleError):
                estimate_stay_end(rule(), entered_on=base, current_stay_end=None)
        with self.assertRaises(StayRuleError):
            estimate_stay_end(None, entered_on=date(2026, 10, 23), current_stay_end=None)

    def test_invalid_policy_fields_fail_closed(self):
        for updates in ({"unit": "weeks"}, {"duration": 0}, {"duration": True}, {"version": True},
                        {"duration": 36501}, {"variant_id": ""}, {"rule_id": " "},
                        {"timezone": "UTC"}, {"verification_kind": "verified"},
                        {"counting_policy": "automatic"}, {"month_end_policy": "automatic"},
                        {"basis": "today"}, {"effective_until": date(2019, 1, 1)}):
            with self.subTest(updates=updates), self.assertRaises(StayRuleError):
                rule(**updates)

    def test_effective_interval_uses_selected_base_date(self):
        selected = rule(effective_from=date(2026, 10, 1), effective_until=date(2026, 10, 31))
        for base in (date(2026, 9, 30), date(2026, 11, 1)):
            with self.assertRaises(StayRuleError):
                estimate_stay_end(selected, entered_on=base, current_stay_end=None)
        for base in (date(2026, 10, 1), date(2026, 10, 31)):
            self.assertEqual(estimate_stay_end(selected, entered_on=base, current_stay_end=None).base, base)

    def test_snapshot_is_immutable_and_keeps_its_original_version(self):
        selected = rule()
        result = estimate_stay_end(selected, entered_on=date(2026, 10, 23), current_stay_end=None)
        later = replace(selected, version=2, duration=30)
        self.assertEqual(result.rule.duration, 365)
        self.assertEqual(result.snapshot()["rule"]["version"], 1)
        self.assertEqual(later.version, 2)
        copy = result.snapshot()
        copy["rule"]["duration"] = 5
        self.assertEqual(result.rule.duration, 365)
        with self.assertRaises(FrozenInstanceError):
            selected.duration = 30

    def test_overflow_is_a_bounded_domain_error(self):
        for selected in (rule(), rule(unit="year", duration=100)):
            with self.assertRaises(StayRuleError):
                estimate_stay_end(selected, entered_on=date(9999, 12, 31), current_stay_end=None)

    def test_invalid_enum_types_are_domain_errors_not_server_type_errors(self):
        for field in ("unit", "basis", "counting_policy", "month_end_policy", "verification_kind"):
            for value in ([], {}, None, True):
                with self.subTest(field=field, value=value), self.assertRaises(StayRuleError):
                    rule(**{field: value})

    def test_inclusive_final_date_max_does_not_have_intermediate_overflow(self):
        for selected, base in ((rule(duration=1), date.max),
                               (rule(unit="year", duration=1), date(9999, 1, 1)),
                               (rule(unit="month", duration=1), date(9999, 12, 1))):
            self.assertEqual(estimate_stay_end(selected, entered_on=base, current_stay_end=None).end, date.max)

    def test_snapshot_roundtrip_is_strict_and_does_not_apply_newer_rules(self):
        snapshot = rule().snapshot()
        self.assertEqual(StayRule.from_snapshot(snapshot), rule())
        for update in ({"extra": 1}, {"effective_from": "20261023"}, {"effective_from": "2026-02-30"},
                       {"effective_until": []}, {"version": True}, {"unit": []}):
            with self.subTest(update=update), self.assertRaises(StayRuleError):
                StayRule.from_snapshot({**snapshot, **update})
        del snapshot["variant_id"]
        with self.assertRaises(StayRuleError):
            StayRule.from_snapshot(snapshot)


class EntryReportGuardTests(unittest.TestCase):
    def check(self, **updates):
        values = dict(entered_on=date(2026, 10, 10), today=date(2026, 10, 23),
                      lifecycle_status="ISSUED_NOT_ACTIVATED", issued_on=date(2026, 10, 1),
                      entry_deadline=date(2026, 11, 1), current_stay_end=date(2027, 10, 9), existing_entered_on=None)
        values.update(updates)
        return validate_entry_report(**values)

    def test_issued_report_is_validation_only_and_does_not_activate(self):
        self.assertIsNone(self.check())

    def test_terminal_not_issued_and_unknown_states_cannot_reactivate(self):
        for state in ("NOT_ISSUED", "EXPIRED", "CANCELLED", "REFUSED", "UNKNOWN", [], {}, None):
            with self.subTest(state=state), self.assertRaises(StayRuleError):
                self.check(lifecycle_status=state)

    def test_future_before_issue_after_deadline_and_expired_end_require_review(self):
        for updates in ({"entered_on": date(2026, 10, 24)}, {"entered_on": date(2026, 9, 30)},
                        {"entry_deadline": date(2026, 10, 9)}, {"current_stay_end": date(2026, 10, 9)},
                        {"current_stay_end": date(2026, 10, 22)}):
            with self.subTest(updates=updates), self.assertRaises(StayRuleError):
                self.check(**updates)

    def test_recorded_entry_can_be_repeated_but_not_corrected_by_client(self):
        self.check(existing_entered_on=date(2026, 10, 10))
        with self.assertRaises(StayRuleError):
            self.check(existing_entered_on=date(2026, 10, 9))

    def test_date_only_contract_rejects_naive_and_aware_timestamps(self):
        for entered_on in ("2026-10-10", datetime(2026, 10, 10), datetime(2026, 10, 10, tzinfo=timezone.utc)):
            with self.assertRaises(StayRuleError):
                self.check(entered_on=entered_on)


if __name__ == "__main__":
    unittest.main()
