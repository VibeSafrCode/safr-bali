import unittest
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.mini_app import (
    ExchangeQuoteRequest,
    ExchangeRequestCreate,
    create_mini_app_exchange_quote,
    create_mini_app_exchange_request,
    get_exchange_options,
)
from app.db.base import Base
from app.main import app
from app.models.exchange import (
    ExchangeQuote,
    ExchangeRateSnapshot,
    ExchangeRouteSettingsVersion,
    ExchangeSettingsVersion,
)
from app.models.user import User
from app.services.currency_calculator import DEFAULT_ROUTE_SETTINGS
from app.services.exchange_quotes import route_settings_payload


class ExchangeMiniAppApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.user = User(
            telegram_id=1001,
            first_name="Клиент",
            language="ru",
            role="client",
            ref_code="TG1001",
            status="active",
        )
        self.other_user = User(
            telegram_id=1002,
            first_name="Другой клиент",
            language="ru",
            role="client",
            ref_code="TG1002",
            status="active",
        )
        global_settings = ExchangeSettingsVersion(
            version=1,
            is_active=True,
            technical_fee_percent=Decimal("2.5"),
            partner_fee_percent=Decimal("1.5"),
            partner_min_fee_idr=Decimal("150000"),
            safrway_fee_percent=Decimal("4"),
            safrway_min_fee_rub=Decimal("1500"),
            usdt_idr_base_fee_percent=Decimal("6"),
            usdt_idr_cash_extra_fee_percent=Decimal("1"),
            usdt_idr_max_total_fee_percent=Decimal("7.5"),
            whitebird_discount_percent=Decimal("0.75"),
            whitebird_withdrawal_fee_percent=Decimal("1.5"),
            ton_fee_buffer_usdt=Decimal("0.2"),
            cash_deposit_fee_percent=Decimal("0"),
            indonesia_interbank_fee_percent=Decimal("0"),
            idr_rounding_step=10000,
            quote_ttl_seconds=300,
            rate_cache_ttl_seconds=60,
            max_stale_rate_seconds=900,
        )
        route_versions = [
            ExchangeRouteSettingsVersion(
                route_code=route_code,
                version=1,
                is_active=True,
                settings=route_settings_payload(settings),
            )
            for route_code, settings in DEFAULT_ROUTE_SETTINGS.items()
        ]
        self.db.add_all(
            [self.user, self.other_user, global_settings, *route_versions]
        )
        self.db.flush()
        self.rate_snapshot = ExchangeRateSnapshot(
            coinbase_usdt_rub=Decimal("80"),
            indodax_buy_idr_per_usdt=Decimal("16000"),
            indodax_sell_idr_per_usdt=Decimal("16100"),
            indodax_last_idr_per_usdt=Decimal("16050"),
            estimated_whitebird_usdt_rub=Decimal("79.4"),
            cbr_usd_rub=Decimal("80"),
            cbr_rate_date=datetime(2026, 8, 1).date(),
            cbr_fetched_at=datetime(2026, 8, 1, 10, 0, 0),
            cbr_raw_json={"char_code": "USD"},
            coinbase_raw_json={"data": {"rates": {"RUB": "80"}}},
            indodax_raw_json={"ticker": {"buy": "16000", "sell": "16100"}},
            source_status="LIVE",
            fetched_at=datetime(2026, 8, 1, 10, 0, 0),
            expires_at=datetime(2099, 1, 1),
        )
        self.db.add(self.rate_snapshot)
        self.db.flush()
        self.route_version = next(
            item
            for item in route_versions
            if item.route_code == "USDT_TO_IDR_CASH"
        )
        self.global_settings = global_settings
        self.quote = self._quote(self.user, datetime(2099, 1, 1))
        self.second_quote = self._quote(self.user, datetime(2099, 1, 1))
        self.expired_quote = self._quote(self.user, datetime(2020, 1, 1))
        self.db.commit()
        self.user_ref = SimpleNamespace(id=self.user.id)
        self.other_user_ref = SimpleNamespace(id=self.other_user.id)
        self.quote_id = self.quote.id
        self.second_quote_id = self.second_quote.id
        self.expired_quote_id = self.expired_quote.id

    def tearDown(self):
        self.db.close()

    def _quote(self, user: User, expires_at: datetime) -> ExchangeQuote:
        quote = ExchangeQuote(
            id=str(uuid4()),
            user_id=user.id,
            route_code="USDT_TO_IDR_CASH",
            mode="GIVE",
            give_currency="USDT",
            receive_currency="IDR_CASH",
            amount_side="give",
            requested_amount=Decimal("1000"),
            give_amount=Decimal("1000"),
            receive_amount=Decimal("14980000"),
            source_amount_internal=Decimal("1000"),
            source_amount_display=Decimal("1000"),
            target_amount_internal=Decimal("14981393.6"),
            target_amount_display=Decimal("14980000"),
            rate_snapshot_id=self.rate_snapshot.id,
            settings_version_id=self.global_settings.id,
            route_settings_version_id=self.route_version.id,
            rate_status="LIVE",
            status="PRELIMINARY",
            manual_confirmation_required=True,
            settings_snapshot={"route": {"version": 1}},
            calculation_snapshot={},
            diagnostic_flags=[],
            calculated_at=datetime(2026, 8, 1, 10, 0, 0),
            expires_at=expires_at,
        )
        self.db.add(quote)
        self.db.flush()
        return quote

    def test_options_expose_all_eight_route_codes(self):
        with patch("app.api.mini_app.SessionLocal", self.Session):
            result = get_exchange_options(user=self.user)

        self.assertEqual(len(result["routes"]), 8)
        self.assertEqual(
            {item["route_code"] for item in result["routes"]},
            set(DEFAULT_ROUTE_SETTINGS),
        )
        self.assertTrue(all(item["enabled"] for item in result["routes"]))
        self.assertEqual(result["supported_pairs"], result["routes"])

    async def test_quote_endpoint_accepts_preferred_and_legacy_payloads(self):
        preferred = ExchangeQuoteRequest(
            route_code="USDT_TO_IDR_CASH",
            mode="GIVE",
            amount=Decimal("1000"),
        )
        legacy = ExchangeQuoteRequest(
            give_currency="USDT",
            receive_currency="IDR_CASH",
            amount_side="give",
            amount=Decimal("1000"),
        )
        mocked_create = AsyncMock(side_effect=[self.quote, self.second_quote])
        with (
            patch("app.api.mini_app.SessionLocal", self.Session),
            patch("app.api.mini_app.create_exchange_quote", mocked_create),
        ):
            preferred_result = await create_mini_app_exchange_quote(
                preferred,
                user=self.user,
            )
            legacy_result = await create_mini_app_exchange_quote(
                legacy,
                user=self.user,
            )

        self.assertEqual(preferred_result["route_code"], "USDT_TO_IDR_CASH")
        self.assertEqual(legacy_result["route_code"], "USDT_TO_IDR_CASH")
        first = mocked_create.await_args_list[0].kwargs
        second = mocked_create.await_args_list[1].kwargs
        self.assertEqual((first["route_code"], first["mode"]), ("USDT_TO_IDR_CASH", "GIVE"))
        self.assertEqual(
            (second["give_currency"], second["receive_currency"], second["amount_side"]),
            ("USDT", "IDR_CASH", "give"),
        )

    def test_request_endpoint_is_idempotent_and_status_is_awaiting_operator(self):
        payload = ExchangeRequestCreate(quote_id=self.quote_id)
        with patch("app.api.mini_app.SessionLocal", self.Session):
            first = create_mini_app_exchange_request(
                payload,
                idempotency_key="request-1",
                user=self.user_ref,
            )
            replay = create_mini_app_exchange_request(
                payload,
                idempotency_key="request-1",
                user=self.user_ref,
            )

        self.assertEqual(first["request_id"], replay["request_id"])
        self.assertEqual(first["status"], "AWAITING_OPERATOR")
        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(replay["idempotent_replay"])

    def test_request_rejects_key_and_quote_collisions(self):
        with patch("app.api.mini_app.SessionLocal", self.Session):
            create_mini_app_exchange_request(
                ExchangeRequestCreate(quote_id=self.quote_id),
                idempotency_key="collision-key",
                user=self.user_ref,
            )
            with self.assertRaises(HTTPException) as key_collision:
                create_mini_app_exchange_request(
                    ExchangeRequestCreate(quote_id=self.second_quote_id),
                    idempotency_key="collision-key",
                    user=self.user_ref,
                )
            with self.assertRaises(HTTPException) as quote_collision:
                create_mini_app_exchange_request(
                    ExchangeRequestCreate(quote_id=self.quote_id),
                    idempotency_key="another-key",
                    user=self.user_ref,
                )

        self.assertEqual(key_collision.exception.status_code, 409)
        self.assertEqual(quote_collision.exception.status_code, 409)

    def test_request_rejects_other_user_and_expired_quote(self):
        with patch("app.api.mini_app.SessionLocal", self.Session):
            with self.assertRaises(HTTPException) as wrong_user:
                create_mini_app_exchange_request(
                    ExchangeRequestCreate(quote_id=self.quote_id),
                    idempotency_key="wrong-user",
                    user=self.other_user_ref,
                )
            with self.assertRaises(HTTPException) as expired:
                create_mini_app_exchange_request(
                    ExchangeRequestCreate(quote_id=self.expired_quote_id),
                    idempotency_key="expired",
                    user=self.user_ref,
                )

        self.assertEqual(wrong_user.exception.status_code, 409)
        self.assertEqual(expired.exception.status_code, 409)

    def test_idempotency_header_is_required_by_openapi_contract(self):
        operation = app.openapi()["paths"]["/mini-app/exchange/requests"]["post"]
        header = next(
            item
            for item in operation["parameters"]
            if item["in"] == "header" and item["name"] == "Idempotency-Key"
        )

        self.assertTrue(header["required"])
