"""Synthetic HTTP/cookie and real SQLite query tests, not Telegram or PG.

No authentication dependency overrides, external network, messages or real data.
The test schema is explicitly not a migration/production release proof.
"""

from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import mini_app, referrals, users, web_portal, yoga_channel
from app.core.config import settings
from app.models.mini_app_session import MiniAppSession
from app.models.order import Order
from app.models.points_ledger import PointsLedger
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.models.web_portal import WebSession
from app.services.referral_stats import direct_referral_count, own_partner_network


MAIN = 'synthetic-count-main-' + 'm' * 40
YOGA = 'synthetic-count-yoga-' + 'y' * 40
ADMIN = 'synthetic-count-admin-' + 'a' * 40
TABLES = (User, Referral, Service, Order, PointsLedger, WebSession, MiniAppSession)


class DirectReferralCountTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite+pysqlite:///:memory:', poolclass=StaticPool,
                                    connect_args={'check_same_thread': False})
        for model in TABLES:
            model.__table__.create(self.engine)
        self.Factory = sessionmaker(bind=self.engine)
        now = datetime.utcnow()
        parents = {2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 3, 9: 10, 12: 2}
        with self.Factory() as db:
            for actor in range(1, 13):
                db.add(User(id=actor, telegram_id=7000000 + actor,
                    ref_code='COUNT-' + str(actor), first_name='Synthetic ' + str(actor),
                    invited_by_user_id=parents.get(actor),
                    status='blocked' if actor == 7 else 'active', locale='en'))
            db.flush()
            for child, source in [(2, 'default_main_admin'), (3, 'explicit_referral'),
                                   (4, 'default_main_admin'), (5, 'yoga_partner_default'),
                                   (6, None), (7, 'existing')]:
                db.add(Referral(parent_user_id=1, child_user_id=child, level=1,
                                source=source, attribution_reason='synthetic'))
            db.add_all([Referral(parent_user_id=1, child_user_id=8, level=2, source='explicit_referral'),
                        Referral(parent_user_id=10, child_user_id=9, level=1, source='explicit_referral'),
                        Referral(parent_user_id=2, child_user_id=12, level=1, source=None)])
            db.add(PointsLedger(user_id=1, operation_type='synthetic', amount=52, balance_after=52))
            for actor in (1, 2, 10, 11):
                db.add(WebSession(user_id=actor, token_hash=web_portal.token_hash('web-count-' + str(actor)),
                    expires_at=now + timedelta(days=1), last_seen_at=now))
                db.add(MiniAppSession(user_id=actor, access_token_hash=mini_app.token_hash('mini-count-' + str(actor)),
                    refresh_token_hash=mini_app.token_hash('refresh-count-' + str(actor)),
                    init_data_hash=mini_app.token_hash('proof-count-' + str(actor)),
                    access_expires_at=now + timedelta(days=1), refresh_expires_at=now + timedelta(days=2),
                    last_seen_at=now))
            db.commit()
        self.patches = [patch.object(module, 'SessionLocal', self.Factory)
                        for module in (web_portal, mini_app, users, referrals, yoga_channel)]
        configured = {'ENVIRONMENT': 'local', 'RATE_LIMIT_PER_MINUTE': 100000,
            'YOGA_CHANNEL_ENABLED': True, 'YOGA_ACCOUNT_ENABLED': True, 'YOGA_MINI_APP_ENABLED': True,
            'YOGA_MINI_APP_ORIGIN': 'https://yoga-count.invalid', 'YOGA_SERVICE_API_TOKEN': YOGA,
            'SERVICE_API_TOKEN': MAIN, 'ADMIN_API_TOKEN': ADMIN,
            'PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED': False, 'BOT_MESSAGING_ENABLED': False}
        self.patches += [patch.object(settings, key, value) for key, value in configured.items()]
        for item in self.patches:
            item.start()
        app = FastAPI()
        for module in (web_portal, mini_app, users, referrals, yoga_channel):
            app.include_router(module.router)
        self.assertEqual(app.dependency_overrides, {})
        self.client = TestClient(app)
        self.sql = []
        event.listen(self.engine, 'before_cursor_execute', self.record_statement)

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        self.engine.dispose()

    def record_statement(self, conn, cursor, statement, parameters, context, executemany):
        self.sql.append(statement.lstrip().split()[0].upper())

    def cookies(self, actor=1):
        self.client.cookies.clear()
        self.client.cookies.set(settings.WEB_SESSION_COOKIE_NAME, 'web-count-' + str(actor))
        self.client.cookies.set(settings.MINI_APP_ACCESS_COOKIE_NAME, 'mini-count-' + str(actor))

    def snapshot(self):
        with self.engine.connect() as db:
            return {model.__tablename__: db.execute(select(model.__table__).order_by(model.id)).all()
                    for model in TABLES}

    def read_surfaces(self, actor=1):
        self.cookies(actor)
        web = self.client.get('/api/web/account')
        mini = self.client.get('/mini-app/me')
        yoga_mini = self.client.post('/mini-app/yoga-account', json={},
                                    headers={'Origin': settings.YOGA_MINI_APP_ORIGIN})
        yoga_bot = self.client.post('/api/yoga-channel/account/me',
            json={'sender_telegram_id': 7000000 + actor, 'chat_id': 7000000 + actor},
            headers={'X-Service-Token': YOGA})
        for response in (web, mini, yoga_mini, yoga_bot):
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['telegram_id'], 7000000 + actor)
        return web.json(), mini.json(), yoga_mini.json(), yoga_bot.json()

    def test_shared_query_counts_explicit_default_yoga_legacy_and_assigned_blocked(self):
        before = self.snapshot()
        with self.Factory() as db:
            self.assertEqual(direct_referral_count(db, 1), 6)
            self.assertEqual(direct_referral_count(db, 2), 1)
            self.assertEqual(direct_referral_count(db, 10), 1)
            self.assertEqual(direct_referral_count(db, 11), 0)
            self.assertEqual(direct_referral_count(db, 999), 0)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(all(command == 'SELECT' for command in self.sql))

    def test_web_main_mini_yoga_mini_and_yoga_bot_all_return_same_assigned_count(self):
        before = self.snapshot()
        web, mini, yoga_mini, yoga_bot = self.read_surfaces()
        self.assertEqual([v['referral_count'] for v in (web, mini, yoga_mini)], [6, 6, 6])
        self.assertEqual(yoga_bot['level_1_count'], 6)
        self.assertEqual(yoga_bot['total_count'], 7)  # Legacy deeper rows stay separate.
        self.assertEqual([v['balance'] for v in (web, mini, yoga_mini, yoga_bot)], [52, 52, 52, 52])
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(all(command == 'SELECT' for command in self.sql))

    def test_partner_network_is_own_contact_free_relative_branch_on_existing_surfaces(self):
        with self.Factory() as db:
            db.add_all([User(id=13, telegram_id=7000013, ref_code='PRIVATE-B', username='PRIVATE_CONTACT_B',
                first_name='PRIVATE_NAME_B', invited_by_user_id=12, status='active'),
                User(id=14, telegram_id=7000014, ref_code='PRIVATE-C', username='PRIVATE_CONTACT_C',
                first_name='PRIVATE_NAME_C', invited_by_user_id=10, status='active')])
            db.flush()
            db.add_all([Referral(parent_user_id=12, child_user_id=13, level=9, source='existing'),
                Referral(parent_user_id=10, child_user_id=14, level=1, source='yoga_partner_default')])
            db.commit()
        before = self.snapshot()
        with patch.object(settings, 'YOGA_PARTNER_TELEGRAM_ID', 7000002):
            self.cookies(2)
            web = self.client.get('/api/web/account')
            mini = self.client.get('/mini-app/me')
            headers = {'X-Service-Token': MAIN, 'X-Telegram-Actor-Id': '7000002'}
            service = self.client.get('/users/referral-network/own', headers=headers)
            for response in (web, mini, service):
                self.assertEqual(response.status_code, 200, response.text)
            projections = [web.json()['partner_network'], mini.json()['partner_network'], service.json()['projection']]
            for projection in projections:
                self.assertEqual(projection['direct_count'], 1)
                self.assertEqual([n['level'] for n in projection['nodes']], [1, 2])
                self.assertEqual(len(projection['nodes']), 2)
                self.assertTrue(all(set(n) == {'label', 'level', 'created_at'} for n in projection['nodes']))
                rendered = str(projection)
                for forbidden in ('PRIVATE', '7000012', '7000013', '7000014', 'telegram_id', 'username', 'user_id', 'ref_code', 'message', 'contact'):
                    self.assertNotIn(forbidden, rendered)
            page = self.client.get('/api/web/referral-network?offset=1&limit=1')
            self.assertEqual(page.status_code, 200, page.text)
            self.assertEqual(page.json()['actor_telegram_id'], 7000002)
            self.assertEqual([n['level'] for n in page.json()['projection']['nodes']], [2])
            self.assertEqual(self.client.get('/api/web/referral-network?root_id=10').status_code, 422)
            self.client.cookies.clear()
            self.assertEqual(self.client.get('/api/web/referral-network').status_code, 401)
            self.assertEqual(self.client.get('/users/referral-network/own', headers={'X-Telegram-Actor-Id': '7000002'}).status_code, 401)
            unknown = self.client.get('/users/referral-network/own', headers={**headers, 'X-Telegram-Actor-Id': '7999999'})
            self.assertEqual(unknown.status_code, 404)
            ordinary = self.client.get('/users/referral-network/own', headers={**headers, 'X-Telegram-Actor-Id': '7000010'})
            self.assertEqual(ordinary.json()['projection'], {'restricted_partner': False})
        self.assertEqual(self.snapshot(), before)

    def test_partner_network_boundary_emits_only_reachable_next_and_explicit_truncation(self):
        with self.Factory() as db:
            db.bulk_insert_mappings(User, [{'id': i, 'telegram_id': 8000000 + i,
                'ref_code': f'BOUND-{i}', 'status': 'active'} for i in range(1000, 6060)])
            db.bulk_insert_mappings(Referral, [{'parent_user_id': 2, 'child_user_id': i,
                'level': 1, 'created_at': datetime(2026, 1, 1)} for i in range(1000, 6060)])
            db.commit()
        self.cookies(2)
        with patch.object(settings, 'YOGA_PARTNER_TELEGRAM_ID', 7000002):
            first = self.client.get('/api/web/referral-network?offset=4950&limit=50')
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json()['projection']['next_offset'], 5000)
            self.assertFalse(first.json()['projection']['page_limited'])
            last = self.client.get('/api/web/referral-network?offset=5000&limit=50')
            self.assertEqual(last.status_code, 200, last.text)
            self.assertTrue(last.json()['projection']['has_more'])
            self.assertTrue(last.json()['projection']['page_limited'])
            self.assertIsNone(last.json()['projection']['next_offset'])
            uneven = self.client.get('/api/web/referral-network?offset=4975&limit=75').json()['projection']
            self.assertTrue(uneven['has_more']);self.assertTrue(uneven['page_limited'])
            self.assertIsNone(uneven['next_offset'])
            end = self.client.get('/api/web/referral-network?offset=5000&limit=100').json()['projection']
            self.assertFalse(end['has_more']);self.assertFalse(end['page_limited'])
            self.assertIsNone(end['next_offset'])

    def test_none_deeper_and_foreign_relationships_do_not_inflate_direct_count(self):
        for actor, expected in [(2, 1), (10, 1), (11, 0)]:
            with self.subTest(actor=actor):
                web, mini, yoga_mini, yoga_bot = self.read_surfaces(actor)
                self.assertEqual([v['referral_count'] for v in (web, mini, yoga_mini)], [expected] * 3)
                self.assertEqual(yoga_bot['level_1_count'], expected)

    def test_client_targets_cannot_replace_existing_verified_cookie_actor(self):
        self.cookies(10)
        for path in ('/api/web/account', '/mini-app/me'):
            response = self.client.get(path + '?user_id=1&telegram_id=7000001')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['telegram_id'], 7000010)
            self.assertEqual(response.json()['referral_count'], 1)
        response = self.client.post('/api/yoga-channel/account/me',
            json={'sender_telegram_id': 7000010, 'chat_id': 7000010, 'user_id': 1},
            headers={'X-Service-Token': YOGA})
        self.assertEqual(response.status_code, 422)

    def test_existing_cookie_and_service_principal_guards_remain_required(self):
        for path in ('/api/web/account', '/mini-app/me'):
            self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.get('/referrals/user/1/stats').status_code, 401)
        for credential, expected in [(None, 401), (MAIN, 403)]:
            response = self.client.post('/api/yoga-channel/account/me',
                json={'sender_telegram_id': 7000001, 'chat_id': 7000001},
                headers={'X-Service-Token': credential} if credential else {})
            self.assertEqual(response.status_code, expected)
        self.cookies()
        self.assertEqual(self.client.post('/mini-app/yoga-account', json={},
            headers={'Origin': 'https://foreign.invalid'}).status_code, 403)

    def test_service_dashboard_and_stats_preserve_fields_and_all_level_total(self):
        before = self.snapshot()
        headers = {'X-Service-Token': MAIN}
        stats = self.client.get('/referrals/user/1/stats', headers=headers)
        dashboard = self.client.get('/users/by-telegram/7000001/dashboard', headers=headers)
        self.assertEqual(stats.status_code, 200, stats.text)
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertEqual(stats.json(), {'user_id': 1, 'ref_code': 'COUNT-1', 'level_1_count': 6, 'total_count': 7})
        self.assertEqual(dashboard.json()['referral_count'], 6)
        self.assertEqual(dashboard.json()['balance'], 52)
        self.assertEqual(dashboard.json()['orders'], [])
        self.assertEqual(self.snapshot(), before)

    def test_inactive_actor_is_not_reactivated_or_given_a_client_projection(self):
        with self.Factory() as db:
            db.execute(update(User).where(User.id == 1).values(status='blocked'))
            db.commit()
        before = self.snapshot()
        self.cookies()
        for path in ('/api/web/account', '/mini-app/me'):
            self.assertEqual(self.client.get(path).status_code, 401)
        response = self.client.post('/api/yoga-channel/account/me',
            json={'sender_telegram_id': 7000001, 'chat_id': 7000001}, headers={'X-Service-Token': YOGA})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.snapshot(), before)


if __name__ == '__main__':
    unittest.main()
