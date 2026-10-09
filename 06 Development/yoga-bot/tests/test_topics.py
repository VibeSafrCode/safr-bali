"""Registry topic context must not depend on menu publication eligibility."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock

from aiogram import Bot

from tests.test_foundation import DUMMY_TOKEN, OfflineSession
from tests.test_shared_intake import config, incoming
from yoga_bot.api_client import IntakeReceipt
from yoga_bot.catalog import ServiceLink
from yoga_bot.config import RuntimeConfigError
from yoga_bot.intake_state import IntakeState
from yoga_bot.menu import Menus
from yoga_bot.runtime import create_dispatcher
from yoga_bot.topics import MAX_RECORDS, MAX_REGISTRY_BYTES, load_known_topics

NON_MENU = ("c1_extension", "family", "knowledge_family_documents", "partners")


def registry(root, ids):
    data = {"schemaVersion": 1, "records": [{"contentId": cid, "kind": "knowledge",
        "candidate": {"exposure": "preview_only"}} for cid in ids]}
    (root / "service-registry.v1.json").write_text(json.dumps(data), encoding="utf-8")


class TopicRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_known_ids_include_non_menu_records_without_routes_or_publication_gates(self):
        longest = "a" * 60
        registry(self.root, (*NON_MENU, longest))
        self.assertEqual(load_known_topics(self.root), frozenset((*NON_MENU, longest)))

    def test_invalid_duplicate_or_unbounded_records_are_rejected(self):
        for ids in (("family", "family"), ("a" * 61,), ("Admin",), ("../family",), (None,)):
            registry(self.root, ids)
            with self.assertRaises(RuntimeConfigError):
                load_known_topics(self.root)
        for data in ({"schemaVersion": True, "records": []}, {"schemaVersion": 1, "records": {}},
                {"schemaVersion": 1, "records": [{}] * (MAX_RECORDS + 1)}):
            (self.root / "service-registry.v1.json").write_text(json.dumps(data))
            with self.assertRaises(RuntimeConfigError):
                load_known_topics(self.root)

    def test_oversized_input_is_rejected_before_json_decode(self):
        (self.root / "service-registry.v1.json").write_bytes(b" " * (MAX_REGISTRY_BYTES + 1))
        with self.assertRaisesRegex(RuntimeConfigError, "^topic_registry_too_large$"):
            load_known_topics(self.root)

    def test_missing_invalid_json_and_invalid_utf8_do_not_expose_paths_or_fall_back(self):
        with self.assertRaisesRegex(RuntimeConfigError, "^topic_registry_unavailable$"):
            load_known_topics(self.root)
        for value in (b"broken JSON", b"\xff"):
            (self.root / "service-registry.v1.json").write_bytes(value)
            with self.assertRaisesRegex(RuntimeConfigError, "^topic_registry_unavailable$"):
                load_known_topics(self.root)


class TopicIntakeTests(unittest.IsolatedAsyncioTestCase):
    async def test_known_non_menu_context_is_exact_inbound_and_unknown_stays_general(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            registry(root, ("c1", *NON_MENU))
            state = IntakeState(root)
            settings = config(shared_root=root, state_directory=root)
            services = (ServiceLink("c1", "/bali/visas/c1/", "/en/bali/visas/c1/", "C1", "C1"),)
            client = AsyncMock()
            client.inbound.return_value = IntakeReceipt(conversation_id=77, message_id=123, idempotent_replay=False)
            session = OfflineSession()
            bot = Bot(DUMMY_TOKEN, session=session)
            self.addAsyncCleanup(session.close)
            dp = create_dispatcher(settings, services, client=client, intake_state=state)
            for index, cid in enumerate((*NON_MENU, "admin_spoof")):
                previous_calls = client.inbound.await_count
                await dp._process_update(bot, incoming(500 + index * 2, "/start svc_" + cid))
                self.assertEqual(client.inbound.await_count, previous_calls)
                topic = cid if cid in NON_MENU else "general"
                self.assertEqual(state.context(101)["topic"], topic)
                await dp._process_update(bot, incoming(501 + index * 2, "Synthetic question"))
                self.assertEqual(client.inbound.await_args.args[0].topic, topic)
            # Topic-only IDs do not become service links or published routes.
            page = Menus(settings, services).page("en", 0)
            urls = [button.url for row in page.buttons for button in row if button.url]
            self.assertEqual(urls, [settings.origin + "/en/bali/visas/c1/"])


if __name__ == "__main__":
    unittest.main()
