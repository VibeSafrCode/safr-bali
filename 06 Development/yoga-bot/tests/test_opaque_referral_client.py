import json
import unittest
from types import SimpleNamespace

import httpx

from yoga_bot.api_client import ChannelClient, BackendContractError


class OpaqueAccountContractTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, payload, *, actor=101):
        async def transport(request):
            self.assertEqual(request.url.path, '/api/yoga-channel/account/me')
            self.assertEqual(json.loads(request.content), {'sender_telegram_id': actor, 'chat_id': actor})
            return httpx.Response(200, json=payload)
        client = ChannelClient(SimpleNamespace(backend_origin='http://127.0.0.1:8000', service_api_token='synthetic'),
            transport=httpx.MockTransport(transport))
        try:
            return await client.account(actor=actor, chat=actor)
        finally:
            await client.close()

    def payload(self, code):
        return dict(telegram_id=101, user_id=7, ref_code='TG101', referral_payload=code,
            level_1_count=2, total_count=3, balance=0, orders_count=0, orders=[])

    async def test_actual_http_client_accepts_opaque_code_and_disabled_issuance(self):
        for code in ('r_ABCDEFGH', None):
            self.assertEqual((await self.request(self.payload(code))).referral_payload, code)

    async def test_id_fallback_wrong_actor_counts_or_order_mismatch_is_refused(self):
        cases = [self.payload('ref_101'), self.payload('TG101'),
            {**self.payload('r_ABCDEFGH'), 'telegram_id':102},
            {**self.payload('r_ABCDEFGH'), 'level_1_count':4},
            {**self.payload('r_ABCDEFGH'), 'orders_count':1}]
        for payload in cases:
            with self.assertRaises(BackendContractError):
                await self.request(payload)
