from __future__ import annotations

import importlib.util
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("youtube_cli.py")
SPEC = importlib.util.spec_from_file_location("safr_youtube_cli", MODULE_PATH)
assert SPEC and SPEC.loader
youtube_cli = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = youtube_cli
SPEC.loader.exec_module(youtube_cli)


class YouTubeToolTests(unittest.TestCase):
    def inventory(self) -> dict:
        channel = "channel"
        return {
            "schema_version": 1,
            "channel": {"channel_id": channel, "title": "SAFRWAY", "uploads_playlist_id": "uploads"},
            "videos": [
                {
                    "video_id": "visa", "channel_id": channel, "source": "authorized_uploads_playlist",
                    "privacy_status": "public", "title": "Виза E33G на Бали",
                    "description": "00:20 документы и ITAS\nwrite@example.com " + "x" * 700, "tags": ["Bali"],
                    "thumbnails": {
                        "safe": {"url": "https://i.ytimg.com/vi/visa/default.jpg", "width": 120, "height": 90},
                        "unsafe": {"url": "http://evil.invalid/pixel", "width": 1, "height": 1},
                    },
                },
                {
                    "video_id": "home", "channel_id": channel, "source": "authorized_uploads_playlist",
                    "privacy_status": "public", "title": "Аренда виллы в Убуде",
                    "description": "Как выбрать жильё", "tags": [],
                },
                {
                    "video_id": "unknown", "channel_id": channel, "source": "authorized_uploads_playlist",
                    "privacy_status": "public", "title": "Один день",
                    "description": "Без тематических маркеров", "tags": [],
                },
                {
                    "video_id": "private", "channel_id": channel, "source": "authorized_uploads_playlist",
                    "privacy_status": "private", "title": "Внутренний черновик", "description": "Виза", "tags": [],
                },
            ],
            "playlists": [
                {"playlist_id": "p1", "title": "SAFRWAY · Bali · Visas", "privacy_status": "private", "video_ids": ["visa"]},
                {"playlist_id": "p2", "title": "SAFRWAY · Bali · Housing", "privacy_status": "private", "video_ids": []},
            ],
        }

    def rules(self, *, reviewed: bool = False) -> dict:
        return {
            "schema_version": 1, "minimum_score": 3, "review_margin": 2,
            "weights": {"title": 5, "tags": 4, "description": 2, "timecodes": 3},
            "topics": [
                {"key": "visas", "playlist_title": "SAFRWAY · Bali · Visas", "routes": ["/bali/visas/"], "keywords": ["виза", "itas", "b1"], "exclude": []},
                {"key": "housing", "playlist_title": "SAFRWAY · Bali · Housing", "routes": ["/bali/housing/"], "keywords": ["вилл*", "жиль*", "аренд*"], "exclude": []},
            ],
            "overrides": {"unknown": {"topics": []}} if reviewed else {},
        }

    def reviewed_classification(self, inventory: dict | None = None) -> dict:
        return youtube_cli.classify_inventory(inventory or self.inventory(), self.rules(reviewed=True))

    def private_dir(self, parent: str) -> Path:
        path = Path(parent) / "private"
        path.mkdir(mode=0o700)
        return path

    def test_classification_is_deterministic_and_marks_unknown_and_nonpublic(self) -> None:
        first = youtube_cli.classify_inventory(self.inventory(), self.rules())
        self.assertEqual(first, youtube_cli.classify_inventory(self.inventory(), self.rules()))
        by_id = {row["video_id"]: row for row in first["videos"]}
        self.assertEqual(by_id["visa"]["topics"], ["visas"])
        self.assertEqual(by_id["home"]["topics"], ["housing"])
        self.assertEqual(by_id["unknown"]["review_reasons"], ["no_match"])
        self.assertEqual(by_id["private"]["review_reasons"], ["not_public"])

    def test_short_code_uses_word_boundaries_and_ties_require_review(self) -> None:
        inventory = self.inventory()
        inventory["videos"][2]["title"] = "Слаб1ое совпадение"
        classification = youtube_cli.classify_inventory(inventory, self.rules())
        unknown = next(row for row in classification["videos"] if row["video_id"] == "unknown")
        self.assertEqual(unknown["topics"], [])
        tie_rules = self.rules()
        tie_rules["topics"][1]["keywords"] = ["виза", "itas"]
        tie = youtube_cli.classify_inventory(self.inventory(), tie_rules)
        visa = next(row for row in tie["videos"] if row["video_id"] == "visa")
        self.assertTrue(visa["review"])
        self.assertIn("topic_tie", visa["review_reasons"])

    def test_stale_override_is_rejected(self) -> None:
        rules = self.rules()
        rules["overrides"] = {"absent": {"topics": []}}
        with self.assertRaisesRegex(youtube_cli.OperatorError, "absent from this inventory"):
            youtube_cli.classify_inventory(self.inventory(), rules)

    def test_plan_is_hash_and_channel_bound_additive_and_private(self) -> None:
        inventory = self.inventory()
        classification = self.reviewed_classification(inventory)
        plan = youtube_cli.build_plan(inventory, classification)
        self.assertEqual(plan["mode"], "additive_only")
        self.assertNotIn("remove_video", {row["action"] for row in plan["operations"]})
        self.assertEqual(
            {row["privacy_status"] for row in plan["playlist_bindings"]},
            {"private"},
        )
        self.assertTrue(any(row.get("video_id") == "visa" for row in plan["operations"]))
        add = next(row for row in plan["operations"] if row.get("video_id") == "home")
        self.assertEqual(add["playlist_id"], "p2")
        self.assertEqual(add["video_title"], "Аренда виллы в Убуде")
        unsigned = {key: value for key, value in plan.items() if key != "plan_sha256"}
        self.assertEqual(plan["plan_sha256"], youtube_cli.sha256_payload(unsigned))
        missing = self.inventory()
        missing["playlists"] = missing["playlists"][:1]
        create_plan = youtube_cli.build_plan(missing, self.reviewed_classification(missing))
        create = next(row for row in create_plan["operations"] if row["action"] == "create_playlist")
        self.assertEqual(create["privacy_status"], "private")
        public_target = self.inventory()
        public_target["playlists"][0]["privacy_status"] = "public"
        with self.assertRaisesRegex(youtube_cli.OperatorError, "separate publication gate"):
            youtube_cli.build_plan(public_target, self.reviewed_classification(public_target))
        altered = dict(classification)
        altered["channel_id"] = "another"
        with self.assertRaisesRegex(youtube_cli.OperatorError, "channel ids"):
            youtube_cli.build_plan(inventory, altered)
        mislabeled = dict(classification)
        mislabeled["videos"] = [dict(row) for row in classification["videos"]]
        mislabeled["videos"][0]["title"] = "Misleading title"
        with self.assertRaisesRegex(youtube_cli.OperatorError, "display metadata"):
            youtube_cli.build_plan(inventory, mislabeled)

    def test_plan_refuses_unresolved_public_video(self) -> None:
        inventory = self.inventory()
        classification = youtube_cli.classify_inventory(inventory, self.rules())
        with self.assertRaisesRegex(youtube_cli.OperatorError, "Founder review"):
            youtube_cli.build_plan(inventory, classification)

    def test_snapshot_is_reviewed_public_bounded_and_sanitized(self) -> None:
        inventory = self.inventory()
        snapshot = youtube_cli.site_snapshot(inventory, self.reviewed_classification(inventory))
        encoded = json.dumps(snapshot)
        self.assertNotIn("private", encoded)
        self.assertNotIn("write@example.com", encoded)
        self.assertNotIn("evil.invalid", encoded)
        visa = snapshot["topics"][0]["videos"][0]
        self.assertLessEqual(len(visa["description"]), youtube_cli.PUBLIC_DESCRIPTION_LIMIT)
        self.assertEqual(set(visa["thumbnails"]), {"safe"})
        self.assertNotIn("uploads_playlist_id", snapshot["channel"])

    def test_private_material_requires_dedicated_0700_directory(self) -> None:
        with self.assertRaises(youtube_cli.OperatorError):
            youtube_cli.require_private_path(MODULE_PATH, must_exist=True)
        with tempfile.TemporaryDirectory(dir="/private/tmp") as directory:
            os.chmod(directory, 0o755)
            before = stat.S_IMODE(Path(directory).stat().st_mode)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "0700"):
                youtube_cli.write_private_json(Path(directory) / "token.json", {"secret": True})
            self.assertEqual(stat.S_IMODE(Path(directory).stat().st_mode), before)

    def test_private_writer_is_0600_and_atomic(self) -> None:
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            private = self.private_dir(parent)
            path = private / "token.json"
            youtube_cli.write_private_json(path, {"version": 1})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            with mock.patch.object(youtube_cli.os, "replace", side_effect=OSError("stop")):
                with self.assertRaises(OSError):
                    youtube_cli.write_private_json(path, {"version": 2})
            self.assertEqual(json.loads(path.read_text()), {"version": 1})

    def test_symlinked_private_parent_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            target = self.private_dir(parent)
            link = Path(parent) / "linked-private"
            link.symlink_to(target, target_is_directory=True)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "symlinks"):
                youtube_cli.write_private_json(link / "token.json", {"secret": True})

    def test_actual_oauth_scopes_are_enforced(self) -> None:
        youtube_cli.validate_token_scopes({"scope": youtube_cli.SCOPES["readonly"]}, "readonly")
        with self.assertRaisesRegex(youtube_cli.OperatorError, "do not exactly match"):
            youtube_cli.validate_token_scopes({"scope": youtube_cli.SCOPES["manage"]}, "readonly")
        with self.assertRaisesRegex(youtube_cli.OperatorError, "do not exactly match"):
            youtube_cli.validate_token_scopes({"scope": ""}, "manage")

    def test_refresh_cannot_expand_actual_scope(self) -> None:
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            token_path = self.private_dir(parent) / "token.json"
            token = {
                "schema_version": 1,
                "scope_profile": "readonly",
                "scope": youtube_cli.SCOPES["readonly"],
                "access_token": "old",
                "refresh_token": "refresh",
                "expires_at": 0,
                "client_id": "client",
                "client_secret": "secret",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
            youtube_cli.write_private_json(token_path, token)
            refreshed = {"access_token": "new", "scope": youtube_cli.SCOPES["manage"]}
            with mock.patch.object(youtube_cli, "form_request", return_value=refreshed):
                with self.assertRaisesRegex(youtube_cli.OperatorError, "do not exactly match"):
                    youtube_cli.load_token(token_path, required_profile="readonly")
            self.assertEqual(youtube_cli.read_private_json(token_path)["access_token"], "old")

    def test_oauth_callback_enforces_state_and_publishes_result(self) -> None:
        def run(path: str, expected_state: str) -> dict[str, str]:
            handler = object.__new__(youtube_cli._OAuthHandler)
            handler.path = path
            handler.expected_state = expected_state
            handler.wfile = io.BytesIO()
            handler.send_response = mock.Mock()
            handler.send_header = mock.Mock()
            handler.end_headers = mock.Mock()
            youtube_cli._OAuthHandler.response = {}
            handler.do_GET()
            return youtube_cli._OAuthHandler.response

        self.assertEqual(run("/?state=wrong&code=secret-code", "expected"), {"error": "state_mismatch"})
        self.assertEqual(run("/?state=expected&code=secret-code", "expected"), {"code": "secret-code"})

    def test_snapshot_and_plan_hash_tampering_are_rejected(self) -> None:
        inventory = self.inventory()
        classification = self.reviewed_classification(inventory)
        altered = dict(classification)
        altered["inventory_sha256"] = "0" * 64
        with self.assertRaisesRegex(youtube_cli.OperatorError, "exact channel inventory"):
            youtube_cli.site_snapshot(inventory, altered)
        plan = youtube_cli.build_plan(inventory, classification)
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            journal = self.private_dir(parent) / "journal.json"
            with self.assertRaisesRegex(youtube_cli.OperatorError, "checksum"):
                youtube_cli.apply_plan(self.FakeApi(), plan, "0" * 64, journal_path=journal)
            self.assertFalse(journal.exists())

    class FakeApi:
        def __init__(
            self,
            *,
            channel: str = "channel",
            members: dict[str, set[str]] | None = None,
            fail_add: bool = False,
            fail_after_add: bool = False,
            wrong_owner: bool = False,
        ):
            self.channel = channel
            self.playlists = {
                "p1": {"id": "p1", "snippet": {"title": "SAFRWAY · Bali · Visas"}, "status": {"privacyStatus": "private"}},
                "p2": {"id": "p2", "snippet": {"title": "SAFRWAY · Bali · Housing"}, "status": {"privacyStatus": "private"}},
            }
            self.members = members or {"p1": {"visa"}, "p2": set()}
            self.fail_add = fail_add
            self.fail_after_add = fail_after_add
            self.wrong_owner = wrong_owner
            self.membership_reads: dict[str, int] = {}
            self.hide_next_membership: tuple[str, str] | None = None
            self.posts = 0

        def request(self, method, resource, *, params=None, body=None):
            if method == "GET" and resource == "channels":
                return {"items": [{"id": self.channel}]}
            if method == "GET" and resource == "videos":
                ids = str((params or {}).get("id") or "").split(",")
                return {"items": [{"id": video_id, "snippet": {"channelId": "another" if self.wrong_owner else self.channel}, "status": {"privacyStatus": "public"}} for video_id in ids if video_id]}
            if method == "POST" and resource == "playlistItems":
                self.posts += 1
                if self.fail_add:
                    raise youtube_cli.OperatorError("ambiguous transport failure")
                snippet = body["snippet"]
                self.members.setdefault(snippet["playlistId"], set()).add(snippet["resourceId"]["videoId"])
                if self.fail_after_add:
                    self.fail_after_add = False
                    self.hide_next_membership = (snippet["playlistId"], snippet["resourceId"]["videoId"])
                    raise youtube_cli.OperatorError("ambiguous response after accepted add")
                return {"id": "membership"}
            raise AssertionError((method, resource, params, body))

        def pages(self, resource, *, params):
            if resource == "playlists":
                yield {"items": list(self.playlists.values())}
                return
            if resource == "playlistItems":
                playlist_id = params["playlistId"]
                self.membership_reads[playlist_id] = self.membership_reads.get(playlist_id, 0) + 1
                visible = set(self.members.get(playlist_id, set()))
                if self.hide_next_membership and self.hide_next_membership[0] == playlist_id:
                    visible.discard(self.hide_next_membership[1])
                    self.hide_next_membership = None
                yield {"items": [{"contentDetails": {"videoId": video_id}} for video_id in sorted(visible)]}
                return
            raise AssertionError((resource, params))

    def test_apply_preflights_owner_fetches_membership_once_and_is_idempotent(self) -> None:
        plan = youtube_cli.build_plan(self.inventory(), self.reviewed_classification())
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            private = self.private_dir(parent)
            wrong_journal = private / "wrong-journal.json"
            wrong = self.FakeApi(wrong_owner=True)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "not a public upload"):
                youtube_cli.apply_plan(wrong, plan, plan["plan_sha256"], journal_path=wrong_journal)
            self.assertEqual(wrong.posts, 0)
            api = self.FakeApi()
            journal = private / "journal.json"
            result = youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal)
            self.assertEqual(api.posts, 1)
            self.assertEqual(max(api.membership_reads.values()), 1)
            self.assertEqual({row["status"] for row in result["results"]}, {"added", "already_exists"})
            second = youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal)
            self.assertEqual(api.posts, 1)
            self.assertEqual({row["status"] for row in second["results"]}, {"already_exists"})

    def test_apply_lock_is_external_private_and_rejects_concurrent_apply(self) -> None:
        plan = youtube_cli.build_plan(self.inventory(), self.reviewed_classification())
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            journal = self.private_dir(parent) / "journal.json"
            api = self.FakeApi()
            with youtube_cli.exclusive_apply_lock(journal) as lock_path:
                self.assertFalse(youtube_cli._inside(lock_path, youtube_cli.REPO_ROOT))
                self.assertEqual(stat.S_IMODE(lock_path.stat().st_mode), 0o600)
                with self.assertRaisesRegex(youtube_cli.OperatorError, "already running"):
                    youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal)
            self.assertEqual(api.posts, 0)
            self.assertFalse(journal.exists())

    def test_apply_rejects_live_playlist_privacy_drift(self) -> None:
        plan = youtube_cli.build_plan(self.inventory(), self.reviewed_classification())
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            journal = self.private_dir(parent) / "journal.json"
            api = self.FakeApi()
            api.playlists["p2"]["status"]["privacyStatus"] = "public"
            with self.assertRaisesRegex(youtube_cli.OperatorError, "missing or changed"):
                youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal)
            self.assertEqual(api.posts, 0)

    def test_apply_journals_unknown_and_reconciles_before_retry(self) -> None:
        plan = youtube_cli.build_plan(self.inventory(), self.reviewed_classification())
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            journal_path = self.private_dir(parent) / "journal.json"
            failing = self.FakeApi(fail_add=True)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "ambiguous"):
                youtube_cli.apply_plan(failing, plan, plan["plan_sha256"], journal_path=journal_path)
            journal = youtube_cli.read_private_json(journal_path)
            self.assertEqual(journal["status"], "partial")
            self.assertEqual(len(journal["unknown"]), 1)
            recovered = self.FakeApi(members={"p1": {"visa"}, "p2": {"home"}})
            result = youtube_cli.apply_plan(recovered, plan, plan["plan_sha256"], journal_path=journal_path)
            self.assertEqual(recovered.posts, 0)
            self.assertEqual({row["status"] for row in result["results"]}, {"already_exists"})
            self.assertEqual(youtube_cli.read_private_json(journal_path)["status"], "complete")

    def test_unknown_add_waits_for_eventual_membership_without_reposting(self) -> None:
        plan = youtube_cli.build_plan(self.inventory(), self.reviewed_classification())
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            journal_path = self.private_dir(parent) / "journal.json"
            api = self.FakeApi(fail_after_add=True)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "accepted add"):
                youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal_path)
            self.assertEqual(api.posts, 1)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "UNKNOWN add-video"):
                youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal_path)
            self.assertEqual(api.posts, 1)
            result = youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal_path)
            self.assertEqual(api.posts, 1)
            self.assertEqual({row["status"] for row in result["results"]}, {"already_exists"})

    def test_founder_approved_unknown_retry_is_one_attempt_and_journaled(self) -> None:
        plan = youtube_cli.build_plan(self.inventory(), self.reviewed_classification())
        with tempfile.TemporaryDirectory(dir="/private/tmp") as parent:
            journal_path = self.private_dir(parent) / "journal.json"
            api = self.FakeApi(fail_add=True)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "ambiguous"):
                youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal_path)
            self.assertEqual(api.posts, 1)
            with self.assertRaisesRegex(youtube_cli.OperatorError, "--approve-unknown-add-retry 0:1"):
                youtube_cli.apply_plan(api, plan, plan["plan_sha256"], journal_path=journal_path)
            self.assertEqual(api.posts, 1)
            api.fail_add = False
            youtube_cli.apply_plan(
                api,
                plan,
                plan["plan_sha256"],
                journal_path=journal_path,
                approved_unknown_add_retries={"0:1"},
            )
            self.assertEqual(api.posts, 2)
            row = youtube_cli.read_private_json(journal_path)["operations"][0]
            self.assertEqual(row["attempt_count"], 2)
            self.assertEqual(row["retry_decisions"][0]["unknown_attempt"], 1)
            self.assertEqual(
                row["retry_decisions"][0]["decision"],
                "founder_approved_retry_after_missing_membership",
            )


if __name__ == "__main__":
    unittest.main()
