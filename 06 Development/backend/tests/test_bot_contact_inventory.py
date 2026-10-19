"""Pure inventory regression: registration is unknown, never consent/reachability."""
import builtins
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services.bot_contact_inventory import main_legacy_snapshot


class MainLegacySnapshotTests(unittest.TestCase):
    def setUp(self):
        self.users = [SimpleNamespace(id=11, locale="en", bot_status="active"),
                      SimpleNamespace(id=22, locale="ru", bot_status="active")]
        self.contacts = {22: SimpleNamespace(id=7, status="blocked")}

    def test_exact_existing_binding_and_unknown_classification(self):
        result = main_legacy_snapshot(self.users, self.contacts)
        expected = hashlib.sha256(json.dumps([[11, "en", "active", None, None],
                                              [22, "ru", "active", 7, "blocked"]],
                                            separators=(",", ":")).encode()).hexdigest()
        self.assertEqual(result, {"candidate_count": 2, "new_unknown_contacts": 1,
            "snapshot_sha256": expected, "source": "legacy_main_registration",
            "private_reachability": "NOT_CONFIRMED"})

    def test_empty_inventory_is_not_missing_source_or_private_proof(self):
        result = main_legacy_snapshot([], {})
        self.assertEqual(result["candidate_count"], 0)
        self.assertEqual(result["snapshot_sha256"], hashlib.sha256(b"[]").hexdigest())
        self.assertEqual(result["private_reachability"], "NOT_CONFIRMED")

    def test_existing_active_blocked_unknown_contacts_are_not_new(self):
        for status in ("active", "blocked", "unknown"):
            result = main_legacy_snapshot(self.users, {u.id: SimpleNamespace(id=i, status=status)
                for i, u in enumerate(self.users, 1)})
            self.assertEqual(result["new_unknown_contacts"], 0)
            self.assertEqual(result["private_reachability"], "NOT_CONFIRMED")

    def test_same_count_changed_identity_locale_contact_id_or_status_changes_hash(self):
        before = main_legacy_snapshot(self.users, self.contacts)["snapshot_sha256"]
        for field, value in (("id", 33), ("locale", "ja"), ("bot_status", "unknown")):
            users = deepcopy(self.users);setattr(users[0], field, value)
            self.assertNotEqual(main_legacy_snapshot(users, self.contacts)["snapshot_sha256"], before)
        for field, value in (("id", 8), ("status", "active")):
            contacts = deepcopy(self.contacts);setattr(contacts[22], field, value)
            self.assertNotEqual(main_legacy_snapshot(self.users, contacts)["snapshot_sha256"], before)

    def test_missing_or_foreign_locale_remains_exact_not_silently_rewritten(self):
        for locale in (None, "", "zh-Hans"):
            users = [SimpleNamespace(id=11, locale=locale, bot_status="active")]
            expected = hashlib.sha256(json.dumps([[11, locale, "active", None, None]],
                                                separators=(",", ":")).encode()).hexdigest()
            self.assertEqual(main_legacy_snapshot(users, {})["snapshot_sha256"], expected)

    def test_projection_does_not_change_inputs_or_expose_rows(self):
        before = deepcopy((self.users, self.contacts))
        result = main_legacy_snapshot(self.users, self.contacts)
        self.assertEqual((self.users, self.contacts), before)
        self.assertEqual(set(result), {"candidate_count", "new_unknown_contacts", "snapshot_sha256", "source", "private_reachability"})
        self.assertNotIn("telegram", json.dumps(result))

    def test_module_import_does_not_load_orm_settings_startup_or_transport(self):
        original = builtins.__import__
        def guarded(name, *args, **kwargs):
            if name.startswith(("sqlalchemy", "app.models", "app.core", "app.main", "httpx", "aiogram", "psycopg")):
                raise AssertionError("Pure projection imported a side-effect-capable module")
            return original(name, *args, **kwargs)
        file = Path(__file__).resolve().parents[1]/"app/services/bot_contact_inventory.py"
        spec = importlib.util.spec_from_file_location("synthetic_pure_inventory", file)
        with patch("builtins.__import__", guarded):
            module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            self.assertEqual(module.main_legacy_snapshot([], {})["candidate_count"], 0)


if __name__ == "__main__":
    unittest.main()
