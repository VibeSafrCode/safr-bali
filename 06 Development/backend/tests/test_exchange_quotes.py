import unittest
from datetime import datetime
from decimal import Decimal

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.exchange import ExchangeSettingsVersion
from app.models.user import User
from app.services.exchange_quotes import (
    IDR_BANK,
    IDR_CASH,
    RUB_BANK,
    USDT,
    UnsupportedExchangePair,
    create_exchange_quote,
    public_quote,
)
from app.services.market_rates import (
    COINBASE_USDT_RATES_URL,
    INDODAX_USDT_IDR_URL,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeAsyncClient:
    def __init__(self):
        self.calls = 0

    async def get(self, url):
        self.calls += 1
        if url == COINBASE_USDT_RATES_URL:
            return FakeResponse({"data": {"rates": {"RUB": "79.406289"}}})
        if url == INDODAX_USDT_IDR_URL:
            return FakeResponse(
                {
                    "ticker": {
                        "buy": "17900",
                        "sell": "18016",
                        "last": "18000",
                    }
                }
            )
        raise AssertionError(f"Unexpected URL: {url}")


class FailingAsyncClient:
    async def get(self, url):
        raise httpx.ConnectError(f"Could not fetch {url}")


class ExchangeQuoteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.user = User(
            telegram_id=901,
            first_name="Клиент",
            language="ru",
            role="client",
            ref_code="TG901",
            status="active",
        )
        self.settings = ExchangeSettingsVersion(
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
        self.db.add_all([self.user, self.settings])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    async def test_three_approved_routes_create_server_quotes(self):
        client = FakeAsyncClient()
        now = datetime(2026, 7, 29, 10, 0, 0)

        cash_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=USDT,
            receive_currency=IDR_CASH,
            amount=Decimal("100"),
            amount_side="give",
            client=client,
            now=now,
        )
        bank_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=USDT,
            receive_currency=IDR_BANK,
            amount=Decimal("100"),
            amount_side="give",
            client=client,
            now=now,
        )
        reverse_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=IDR_CASH,
            receive_currency=RUB_BANK,
            amount=Decimal("20000"),
            amount_side="receive",
            client=client,
            now=now,
        )
        reverse_by_give_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=IDR_CASH,
            receive_currency=RUB_BANK,
            amount=Decimal("5150000"),
            amount_side="give",
            client=client,
            now=now,
        )

        self.assertEqual(cash_quote.receive_amount, Decimal("1664700"))
        self.assertEqual(bank_quote.receive_amount, Decimal("1682600"))
        self.assertEqual(reverse_quote.give_amount, Decimal("5150000"))
        self.assertEqual(reverse_quote.receive_amount, Decimal("20000"))
        self.assertEqual(reverse_by_give_quote.give_amount, Decimal("5150000"))
        self.assertEqual(reverse_by_give_quote.receive_amount, Decimal("20021"))
        self.assertEqual(
            reverse_quote.calculation_snapshot["indodax_side"],
            "sell",
        )
        self.assertEqual(client.calls, 2)
        public_result = public_quote(reverse_quote)
        self.assertNotIn("rate_status", public_result)
        self.assertNotIn("diagnostic_flags", public_result)
        self.assertNotIn("calculation_snapshot", public_result)
        self.assertNotIn("settings_snapshot", public_result)

    async def test_unsupported_route_requires_manual_calculation(self):
        with self.assertRaises(UnsupportedExchangePair):
            await create_exchange_quote(
                self.db,
                user=self.user,
                give_currency=RUB_BANK,
                receive_currency=IDR_CASH,
                amount=Decimal("20000"),
                amount_side="give",
                client=FakeAsyncClient(),
                now=datetime(2026, 7, 29, 10, 0, 0),
            )

    async def test_recent_snapshot_is_used_as_stale_when_provider_fails(self):
        live_client = FakeAsyncClient()
        first_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=USDT,
            receive_currency=IDR_CASH,
            amount=Decimal("100"),
            amount_side="give",
            client=live_client,
            now=datetime(2026, 7, 29, 10, 0, 0),
        )
        stale_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=USDT,
            receive_currency=IDR_CASH,
            amount=Decimal("100"),
            amount_side="give",
            client=FailingAsyncClient(),
            now=datetime(2026, 7, 29, 10, 2, 0),
        )

        self.assertEqual(first_quote.rate_status, "LIVE")
        self.assertEqual(stale_quote.rate_status, "STALE")
        self.assertEqual(stale_quote.diagnostic_flags, ["RATE_STALE"])
