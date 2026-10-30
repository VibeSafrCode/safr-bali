"""Actual own-network formatter with synthetic projection; no HTTP/Telegram/data writes."""
import unittest
from unittest.mock import AsyncMock, patch
from app.services.referrals import format_own_network_summary


class OwnPartnerNetworkTests(unittest.IsolatedAsyncioTestCase):
    async def test_restricted_actor_never_reads_legacy_contact_store(self):
        projection = {'restricted_partner': True, 'direct_count': 1,
            'nodes': [{'label': '№1', 'level': 1, 'created_at': '2026-10-30'}], 'has_more': False}
        with patch('app.services.backend_client.get_own_referral_network', AsyncMock(return_value=projection)) as api, \
                patch('app.services.referrals.format_network_summary', side_effect=AssertionError('private store')):
            result = await format_own_network_summary(99)
            api.assert_awaited_once_with(99)
            self.assertIn('№1', result)
            self.assertIn('2026-10-30', result)

    async def test_unavailable_unknown_or_invalid_projection_has_no_pii_fallback(self):
        for projection in (None, {}, {'restricted_partner': 'yes', 'direct_count': 1, 'nodes': []},
                {'restricted_partner': True, 'direct_count': 1,
                'nodes': [{'label': '№1', 'level': 1, 'created_at': None, 'username': 'PRIVATE'}]}):
            with patch('app.services.backend_client.get_own_referral_network', AsyncMock(return_value=projection)), \
                    patch('app.services.referrals.format_network_summary', side_effect=AssertionError('private store')):
                result = await format_own_network_summary(99)
                self.assertIn('недоступна', result)
                self.assertNotIn('PRIVATE', result)

    async def test_restricted_payload_rejects_contact_shaped_dates_labels_and_invalid_bounds(self):
        good = {'label': '№1', 'level': 1, 'created_at': None}
        rows = [[{**good, 'label': 'PRIVATE'}], [{**good, 'created_at': 'PRIVATE'}],
            [{**good, 'created_at': '2026-99-99'}], [{**good, 'level': True}], [{**good, 'level': 33}],
            [{**good, 'phone': 'PRIVATE'}], [good] * 101]
        for nodes in rows:
            value = {'restricted_partner': True, 'direct_count': 1, 'nodes': nodes}
            with patch('app.services.backend_client.get_own_referral_network', AsyncMock(return_value=value)), \
                    patch('app.services.referrals.format_network_summary', side_effect=AssertionError('private store')):
                result = await format_own_network_summary(99)
                self.assertIn('недоступна', result)
                self.assertNotIn('PRIVATE', result)

    async def test_only_server_confirmed_nonpartner_keeps_existing_behavior(self):
        with patch('app.services.backend_client.get_own_referral_network', AsyncMock(return_value={'restricted_partner': False})), \
                patch('app.services.referrals.format_network_summary', return_value='existing') as legacy:
            self.assertEqual(await format_own_network_summary(99), 'existing')
            legacy.assert_called_once_with(99)

    async def test_truncated_projection_is_explicit_without_contacts_or_unreachable_link(self):
        value = {'restricted_partner': True, 'direct_count': 5051, 'nodes': [],
                 'has_more': True, 'page_limited': True, 'next_offset': None}
        with patch('app.services.backend_client.get_own_referral_network', AsyncMock(return_value=value)), \
                patch('app.services.referrals.format_network_summary', side_effect=AssertionError('private store')):
            result = await format_own_network_summary(99)
            self.assertIn('Показана часть сети', result)
            self.assertNotIn('http', result)
