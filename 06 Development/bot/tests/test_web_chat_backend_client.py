"""Actual HTTP client parsers with synthetic HTTPX transport, never Telegram."""
from copy import deepcopy
import asyncio
import importlib.util
import json
from pathlib import Path
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

import httpx


def load_client():
    config = ModuleType("app.core.config")
    config.settings = SimpleNamespace(BACKEND_API_URL="https://fixture.invalid",
                                     BACKEND_SERVICE_TOKEN="synthetic-f01-service")
    file = Path(__file__).resolve().parents[1] / "app/services/backend_client.py"
    spec = importlib.util.spec_from_file_location("_safr_f01_http_client_contract", file)
    module = importlib.util.module_from_spec(spec)
    with patch.dict("sys.modules", {"app.core.config": config}):
        spec.loader.exec_module(module)
    return module


class WebChatBackendClientContract(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = load_client()
        self.real_async_client = httpx.AsyncClient
        self.calls = []
        self.response = {"event_id": 7, "attempt_id": "synthetic-attempt",
                         "status": "claimed", "send_authorized": True}
        self.status = 200
        self.failure = None
        self.raw_body = None

    def transport(self, request):
        self.calls.append(request)
        if self.failure:
            if self.failure is asyncio.CancelledError:
                raise asyncio.CancelledError()
            raise self.failure("synthetic transport outcome", request=request)
        if self.raw_body is not None:
            return httpx.Response(self.status, content=self.raw_body)
        return httpx.Response(self.status, json=self.response)

    def http_client(self, **kwargs):
        return self.real_async_client(transport=httpx.MockTransport(self.transport), trust_env=False, **kwargs)

    async def claim(self):
        return await self.client.claim_web_event_delivery(
            7, attempt_id="synthetic-attempt", primary_ids=[1101], observer_ids=[2202],
            source_payload={"message_id": 21}, message_body="Synthetic exact message")

    async def test_only_exact_committed_claim_ack_authorizes_transport(self):
        good = deepcopy(self.response)
        denied = [None, [], "claimed", {},
                  {**good, "event_id": True}, {**good, "event_id": 7.0}, {**good, "event_id": "7"},
                  {**good, "event_id": 8}, {**good, "attempt_id": "other"},
                  {**good, "status": "pending"}, {**good, "status": "settling"}, {**good, "send_authorized": False},
                  {**good, "send_authorized": "true"}, {**good, "send_authorized": 1}]
        with patch.object(self.client.httpx, "AsyncClient", side_effect=self.http_client):
            self.assertTrue(await self.claim())
            request = self.calls[-1]
            self.assertEqual(str(request.url), "https://fixture.invalid/api/web/staff/outbox/7/delivery-claim")
            self.assertEqual(request.headers["X-Service-Token"], "synthetic-f01-service")
            self.assertEqual(json.loads(request.content), {
                "attempt_id": "synthetic-attempt", "primary_ids": [1101], "observer_ids": [2202],
                "source_payload": {"message_id": 21}, "message_body": "Synthetic exact message"})
            for body in denied:
                with self.subTest(body=body):
                    self.response = body
                    self.assertFalse(await self.claim())
            self.response = good
            for status in (401, 403, 409, 500, 503):
                with self.subTest(status=status):
                    self.status = status
                    with self.assertLogs(self.client.logger, level="ERROR"):
                        self.assertFalse(await self.claim())

    async def test_lost_or_invalid_claim_response_never_grants_send(self):
        with patch.object(self.client.httpx, "AsyncClient", side_effect=self.http_client):
            self.raw_body = b"not-json"
            with self.assertLogs(self.client.logger, level="ERROR"):
                self.assertFalse(await self.claim())
            self.raw_body = None
            for failure in (httpx.ReadTimeout, httpx.ConnectError):
                self.failure = failure
                with self.subTest(failure=failure), self.assertLogs(self.client.logger, level="ERROR"):
                    self.assertFalse(await self.claim())

    async def test_receipt_and_settlement_require_boolean_ack_and_keep_attempt(self):
        receipt = {"attempt_id": "synthetic-forged", "status": "failed", "recipient_ids": [1101], "error_code": "synthetic-unknown",
                   "delivery_results": {"1101": "delivered", "2202": "unknown"}}
        with patch.object(self.client.httpx, "AsyncClient", side_effect=self.http_client):
            for body, accepted in [({"ok": True}, True), ({"ok": 1}, False),
                                   ({"ok": "true"}, False), ({"ok": False}, False), ([], False), ({}, False)]:
                self.response = body
                with self.subTest(body=body):
                    self.assertIs(await self.client.journal_web_event_delivery(
                        7, attempt_id="synthetic-attempt", receipt=receipt), accepted)
                    self.assertEqual(json.loads(self.calls[-1].content), {**receipt, "attempt_id": "synthetic-attempt"})
                    self.assertIs(await self.client.mark_web_event_delivered(
                        7, receipt["recipient_ids"], status=receipt["status"], error_code=receipt["error_code"],
                        delivery_results=receipt["delivery_results"], attempt_id="synthetic-attempt"), accepted)
                    self.assertEqual(json.loads(self.calls[-1].content), {**receipt, "attempt_id": "synthetic-attempt"})

    async def test_disabled_client_does_not_create_transport(self):
        self.client.settings.BACKEND_SERVICE_TOKEN = ""
        with patch.object(self.client.httpx, "AsyncClient") as factory:
            self.assertFalse(await self.claim())
            self.assertFalse(await self.client.journal_web_event_delivery(7, attempt_id="synthetic-attempt", receipt={}))
            self.assertFalse(await self.client.mark_web_event_delivered(7, []))
            factory.assert_not_called()

    async def test_journal_and_settlement_invalid_or_lost_ack_return_false(self):
        with patch.object(self.client.httpx, "AsyncClient", side_effect=self.http_client):
            for scenario in ("invalid-json", "denied", "lost-ack"):
                self.raw_body = b"not-json" if scenario == "invalid-json" else None
                self.status = 403 if scenario == "denied" else 200
                self.failure = httpx.ReadTimeout if scenario == "lost-ack" else None
                with self.subTest(scenario=scenario), self.assertLogs(self.client.logger, level="ERROR"):
                    before = len(self.calls)
                    self.assertFalse(await self.client.journal_web_event_delivery(7, attempt_id="synthetic-attempt", receipt={}))
                    self.assertFalse(await self.client.mark_web_event_delivered(7, [], attempt_id="synthetic-attempt"))
                    self.assertEqual(len(self.calls) - before, 2)

    async def test_cancelled_claim_propagates_without_retry(self):
        self.failure = asyncio.CancelledError
        with patch.object(self.client.httpx, "AsyncClient", side_effect=self.http_client):
            with self.assertRaises(asyncio.CancelledError):
                await self.claim()
        self.assertEqual(len(self.calls), 1)

    async def test_conversation_lookup_preserves_exact_message_id(self):
        self.response = {"id": 11, "messages": []}
        with patch.object(self.client.httpx, "AsyncClient", side_effect=self.http_client):
            self.assertEqual(await self.client.get_web_conversation(11, message_id=21), self.response)
        self.assertEqual(self.calls[0].url.params["message_id"], "21")
        self.assertEqual(self.calls[0].url.path, "/api/web/staff/conversations/11")


if __name__ == "__main__":
    unittest.main()
