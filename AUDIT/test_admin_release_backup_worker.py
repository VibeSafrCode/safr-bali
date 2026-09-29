"""No-network proof-comparison regressions; PostgreSQL SQL is checked separately."""
import copy
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("admin_backup_worker", Path(__file__).with_name("verify-admin-release-backup.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def index(keys, owner="runtime"):
    return ["synthetic complete definition", owner, True, True, True, False, None,
            None, "btree", False, False, False, keys, [], None]


def table(name):
    return {"schema": "public", "table": name, "owner": "runtime", "kind": "r",
            "persistence": "p", "rls": False, "force_rls": False,
            "columns": [["id", "integer", True, None, "", "", None]],
            "constraints": {}, "indexes": {"existing_index": index(["id"])}}


class SchemaProofTests(unittest.TestCase):
    def setUp(self):
        self.baseline = {"public.life_services": table("life_services"), "public.visa_cases": table("visa_cases")}
        self.expected_checks = {name: "reviewed new " + name for name in worker.CHANGED_CHECKS}
        self.baseline["public.life_services"]["constraints"] = {
            name: ["c", "reviewed old " + name, True, False, False, False, True, 0]
            for name in worker.CHANGED_CHECKS
        }

    def check(self, current, revision):
        # Exercise the comparison independently of SQL extraction. A separate
        # real-PostgreSQL U-D-U gate tests extraction and CHECK normalization.
        with patch.object(worker, "schema_fingerprint", return_value=copy.deepcopy(current)), \
             patch.object(worker, "normalized_schema_checks", side_effect=lambda _conn, facts: facts), \
             patch.object(worker, "assert_ledger_schema") as ledger:
            worker.assert_schema_preserved(None, self.baseline, revision, "runtime", self.expected_checks)
            self.assertEqual(ledger.call_count, int(revision != worker.BASE_REVISION))

    def upgraded(self, revision):
        current = copy.deepcopy(self.baseline)
        current[worker.LEDGER_TABLE] = {"synthetic": "ledger validated separately"}
        current["public.life_services"]["columns"].append(["notifications_enabled", "boolean", True, "true", "", "", None])
        current["public.life_services"]["indexes"]["ix_life_services_expiry"] = index(["publication_status", "end_date", "id"])
        current["public.visa_cases"]["indexes"]["ix_visa_cases_expiry"] = index(["publication_status", "stay_end", "id"])
        if revision == worker.CANDIDATE_REVISION:
            for name, definition in self.expected_checks.items():
                current["public.life_services"]["constraints"][name][1] = definition
        return current

    def test_accepts_only_reviewed_revision_shapes_without_mutating_baseline(self):
        original = copy.deepcopy(self.baseline)
        self.check(self.baseline, worker.BASE_REVISION)
        for revision in (worker.MIDDLE_REVISION, worker.CANDIDATE_REVISION):
            self.check(self.upgraded(revision), revision)
        self.assertEqual(self.baseline, original)

    def test_baseline_detects_changed_or_missing_original_schema(self):
        for change in ("constraint", "index", "owner", "type", "new_table"):
            with self.subTest(change=change):
                current = copy.deepcopy(self.baseline)
                life = current["public.life_services"]
                if change == "constraint":
                    life["constraints"].pop(next(iter(worker.CHANGED_CHECKS)))
                elif change == "index":
                    life["indexes"]["existing_index"][0] = "changed predicate"
                elif change == "owner":
                    life["owner"] = "different_owner"
                elif change == "type":
                    life["columns"][0][1] = "bigint"
                else:
                    current["public.unreviewed"] = table("unreviewed")
                with self.assertRaises(RuntimeError):
                    self.check(current, worker.BASE_REVISION)

    def test_candidate_rejects_changes_outside_exact_allowlist(self):
        for change in ("wrong_check", "unvalidated_check", "missing_index", "wrong_index_keys", "wrong_consent_default", "unrelated_index"):
            with self.subTest(change=change):
                current = self.upgraded(worker.CANDIDATE_REVISION)
                life = current["public.life_services"]
                if change == "wrong_check":
                    life["constraints"][next(iter(worker.CHANGED_CHECKS))][1] = "CHECK (true)"
                elif change == "unvalidated_check":
                    life["constraints"][next(iter(worker.CHANGED_CHECKS))][2] = False
                elif change == "missing_index":
                    life["indexes"].pop("ix_life_services_expiry")
                elif change == "wrong_index_keys":
                    life["indexes"]["ix_life_services_expiry"][12] = ["id", "end_date", "publication_status"]
                elif change == "wrong_consent_default":
                    life["columns"][-1][3] = "false"
                else:
                    life["indexes"]["unexpected_index"] = index(["id"])
                with self.assertRaises(RuntimeError):
                    self.check(current, worker.CANDIDATE_REVISION)


class SequenceExclusionTests(unittest.TestCase):
    def test_excludes_only_exact_new_sequence_and_only_after_upgrade(self):
        names = ["users_id_seq", "service_expiry_archive_id_seq", "service_expiry_deliveries_id_seq"]
        rows = [("public", name, "runtime", "integer", 1, 1, 2147483647, 1, 1, False) for name in names]

        class Connection:
            def execute(self, query, params=None):
                if "FROM pg_sequence" in query:
                    return SimpleNamespace(fetchall=lambda: rows)
                if "FROM pg_depend" in query:
                    return SimpleNamespace(fetchall=lambda: [])
                return SimpleNamespace(fetchone=lambda: (17, True))

        # This fake adapts psycopg's formatting interface only; it never opens a
        # database or claims to validate PostgreSQL SQL syntax.
        driver = SimpleNamespace(sql=SimpleNamespace(SQL=str, Identifier=str))
        with patch.dict(sys.modules, {"psycopg": driver}):
            base = worker.sequence_fingerprint(Connection(), include_values=True)
            upgraded = worker.sequence_fingerprint(Connection(), include_values=True, upgraded=True)
        self.assertEqual(set(base), {"public." + name for name in names})
        self.assertEqual(set(upgraded), {"public.users_id_seq", "public.service_expiry_archive_id_seq"})
        self.assertEqual(upgraded["public.service_expiry_archive_id_seq"], base["public.service_expiry_archive_id_seq"])


if __name__ == "__main__":
    unittest.main()
