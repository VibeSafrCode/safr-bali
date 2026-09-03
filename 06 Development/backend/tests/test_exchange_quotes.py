import unittest
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.exchange import (
    ExchangeRouteSettingsVersion,
    ExchangeSettingsVersion,
)
from app.models.user import User
from app.services.currency_calculator import (
    DEFAULT_ROUTE_SETTINGS,
    IDR_CASH_TO_RUB_BANK,
    IDR_CASH_TO_USDT,
    ROUTE_ASSETS,
    RUB_BANK,
    RUB_BANK_TO_IDR_BANK,
    RUB_BANK_TO_IDR_CASH,
    RUB_BANK_TO_USDT,
    USDT,
    USDT_TO_IDR_BANK,
    USDT_TO_IDR_CASH,
    USDT_TO_RUB_BANK,
)
from app.services.exchange_quotes import (
    UnsupportedExchangePair,
    create_exchange_quote,
    get_rate_snapshot,
    public_quote,
    route_settings_payload,
)
from app.services.market_rates import (
    CBR_DAILY_RATES_URL,
    COINBASE_USDT_RATES_URL,
    INDODAX_USDT_IDR_URL,
)


class FakeResponse:
    def __init__(self, value):
        self.payload = value if isinstance(value, dict) else None
        self.text = value if isinstance(value, str) else ""

    def raise_for_status(self):
        return None

    def json(self):
        if self.payload is None:
            raise AssertionError("Response is not JSON")
        return self.payload


class FakeAsyncClient:
    def __init__(self):
        self.calls = 0

    async def get(self, url):
        self.calls += 1
        if url == COINBASE_USDT_RATES_URL:
            return FakeResponse({"data": {"rates": {"RUB": "80"}}})
        if url == INDODAX_USDT_IDR_URL:
            return FakeResponse(
                {
                    "ticker": {
                        "buy": "16000",
                        "sell": "16100",
                        "last": "16050",
                        "server_time": "1785578400",
                    }
                }
            )
        if url == CBR_DAILY_RATES_URL:
            return FakeResponse(
                '<ValCurs Date="01.08.2026"><Valute><CharCode>USD</CharCode>'
                "<Nominal>1</Nominal><Value>80,0000</Value>"
                "</Valute></ValCurs>"
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
        self.global_settings = ExchangeSettingsVersion(
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
        self.route_versions = {
            route_code: ExchangeRouteSettingsVersion(
                route_code=route_code,
                version=1,
                is_active=True,
                settings=route_settings_payload(settings),
            )
            for route_code, settings in DEFAULT_ROUTE_SETTINGS.items()
        }
        self.db.add_all(
            [self.user, self.global_settings, *self.route_versions.values()]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    async def test_all_eight_routes_persist_full_immutable_snapshots(self):
        amounts = {
            RUB_BANK_TO_IDR_CASH: Decimal("100000"),
            RUB_BANK_TO_IDR_BANK: Decimal("100000"),
            RUB_BANK_TO_USDT: Decimal("100000"),
            USDT_TO_RUB_BANK: Decimal("1000"),
            USDT_TO_IDR_CASH: Decimal("1000"),
            USDT_TO_IDR_BANK: Decimal("1000"),
            IDR_CASH_TO_USDT: Decimal("20000000"),
            IDR_CASH_TO_RUB_BANK: Decimal("20000000"),
        }
        client = FakeAsyncClient()
        now = datetime(2026, 8, 1, 10, 0, 0)

        quotes = {
            route_code: await create_exchange_quote(
                self.db,
                user=self.user,
                route_code=route_code,
                mode="GIVE",
                amount=amount,
                client=client,
                now=now,
            )
            for route_code, amount in amounts.items()
        }

        self.assertEqual(set(quotes), set(ROUTE_ASSETS))
        self.assertEqual(client.calls, 3)
        for route_code, quote in quotes.items():
            with self.subTest(route_code=route_code):
                self.assertEqual(quote.route_code, route_code)
                self.assertEqual(quote.mode, "GIVE")
                self.assertEqual(
                    quote.route_settings_version_id,
                    self.route_versions[route_code].id,
                )
                self.assertGreater(quote.source_amount_internal, 0)
                self.assertGreater(quote.target_amount_internal, 0)
                self.assertGreater(quote.target_amount_display, 0)
                self.assertEqual(
                    quote.settings_snapshot["route"]["route_code"],
                    route_code,
                )
                calculation = quote.calculation_snapshot
                self.assertIn("fees", calculation)
                self.assertIn("rate_snapshot", calculation)
                self.assertIn("raw_rates", calculation["rate_snapshot"])
                self.assertIn("rounding", calculation)
                self.assertEqual(
                    calculation["rounding"]["result_before_rounding"],
                    calculation["target_amount_internal"],
                )

        cbr_quote = quotes[RUB_BANK_TO_USDT]
        rate_data = cbr_quote.calculation_snapshot["rate_snapshot"]
        self.assertEqual(
            Decimal(rate_data["normalized_rates"]["cbr_usd_rub"]),
            Decimal("80.0000"),
        )
        self.assertEqual(
            rate_data["raw_rates"]["cbr"]["char_code"],
            "USD",
        )

    async def test_preferred_and_legacy_requests_share_route_contract(self):
        client = FakeAsyncClient()
        preferred = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=USDT_TO_IDR_CASH,
            mode="GIVE",
            amount=Decimal("1000"),
            client=client,
            now=datetime(2026, 8, 1, 10, 0, 0),
        )
        legacy = await create_exchange_quote(
            self.db,
            user=self.user,
            give_currency=USDT,
            receive_currency="IDR_CASH",
            amount_side="give",
            amount=Decimal("1000"),
            client=client,
            now=datetime(2026, 8, 1, 10, 0, 1),
        )

        self.assertEqual(preferred.route_code, legacy.route_code)
        self.assertEqual(preferred.mode, legacy.mode)
        self.assertEqual(preferred.target_amount_display, legacy.target_amount_display)

    async def test_receive_mode_persists_requested_and_available_results(self):
        quote = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=USDT_TO_IDR_CASH,
            mode="RECEIVE",
            amount=Decimal("10000000"),
            client=FakeAsyncClient(),
            now=datetime(2026, 8, 1, 10, 0, 0),
        )

        self.assertEqual(quote.mode, "RECEIVE")
        self.assertEqual(quote.target_amount_display, Decimal("10000000"))
        self.assertGreaterEqual(
            Decimal(quote.calculation_snapshot["available_target_amount"]),
            quote.target_amount_display,
        )

    async def test_public_quote_is_master_contract_with_legacy_aliases(self):
        quote = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=IDR_CASH_TO_RUB_BANK,
            mode="GIVE",
            amount=Decimal("20000000"),
            client=FakeAsyncClient(),
            now=datetime(2026, 8, 1, 10, 0, 0),
        )

        result = public_quote(quote)

        self.assertEqual(result["quote_id"], quote.id)
        self.assertEqual(result["id"], quote.id)
        self.assertEqual(result["route_code"], IDR_CASH_TO_RUB_BANK)
        self.assertEqual(result["mode"], "GIVE")
        self.assertIn("source_amount_internal", result)
        self.assertIn("source_amount_display", result)
        self.assertIn("target_amount_internal", result)
        self.assertIn("target_amount_display", result)
        self.assertIn("warning", result)
        self.assertNotIn("rate_status", result)
        self.assertNotIn("diagnostic_flags", result)
        self.assertNotIn("calculation_snapshot", result)
        self.assertNotIn("settings_snapshot", result)

    async def test_new_route_version_changes_new_quote_not_old_snapshot(self):
        client = FakeAsyncClient()
        now = datetime(2026, 8, 1, 10, 0, 0)
        old_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=USDT_TO_IDR_CASH,
            mode="GIVE",
            amount=Decimal("1000"),
            client=client,
            now=now,
        )
        old_values = dict(old_quote.settings_snapshot["route"]["values"])

        old_version = self.route_versions[USDT_TO_IDR_CASH]
        old_version.is_active = False
        self.db.flush()
        changed_values = dict(old_values)
        changed_values["rounding_step"] = "50000"
        changed_values["safrway_fee_percent"] = "4"
        new_version = ExchangeRouteSettingsVersion(
            route_code=USDT_TO_IDR_CASH,
            version=2,
            is_active=True,
            settings=changed_values,
        )
        self.db.add(new_version)
        self.db.commit()

        new_quote = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=USDT_TO_IDR_CASH,
            mode="GIVE",
            amount=Decimal("1000"),
            client=client,
            now=now,
        )

        self.assertEqual(old_quote.settings_snapshot["route"]["version"], 1)
        self.assertEqual(old_quote.settings_snapshot["route"]["values"], old_values)
        self.assertEqual(new_quote.settings_snapshot["route"]["version"], 2)
        self.assertEqual(
            new_quote.settings_snapshot["route"]["values"]["rounding_step"],
            "50000",
        )
        self.assertNotEqual(
            old_quote.target_amount_display,
            new_quote.target_amount_display,
        )

    async def test_recent_complete_snapshot_is_used_as_stale_on_failure(self):
        first = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=RUB_BANK_TO_USDT,
            mode="GIVE",
            amount=Decimal("100000"),
            client=FakeAsyncClient(),
            now=datetime(2026, 8, 1, 10, 0, 0),
        )
        stale = await create_exchange_quote(
            self.db,
            user=self.user,
            route_code=RUB_BANK_TO_USDT,
            mode="GIVE",
            amount=Decimal("100000"),
            client=FailingAsyncClient(),
            now=datetime(2026, 8, 1, 10, 2, 0),
        )

        self.assertEqual(first.rate_status, "LIVE")
        self.assertEqual(stale.rate_status, "STALE")
        self.assertIn("RATE_STALE", stale.diagnostic_flags)

    async def test_canonical_quote_uses_published_fx_without_refreshing_it(self):
        now = datetime(2026, 8, 1, 10, 0, 0)
        canonical_fx = SimpleNamespace(
            id=77,
            version=12,
            source_code="INDODAX_PUBLIC_ORDER_BOOK",
            bid_idr_per_usdt=Decimal("16000"),
            ask_idr_per_usdt=Decimal("16100"),
            last_idr_per_usdt=Decimal("16050"),
            acceptance_method="SELL_DEPTH_VWAP_2000_USDT_V1",
            provider_server_time=now,
            fresh_until=now + timedelta(seconds=60),
            stale_until=now + timedelta(minutes=15),
        )
        client = FakeAsyncClient()

        with (
            patch(
                "app.services.exchange_quotes.app_settings.CANONICAL_PRICING_ENFORCED",
                True,
            ),
            patch(
                "app.services.exchange_quotes.effective_fx_snapshot",
                return_value=canonical_fx,
            ),
        ):
            snapshot, status = await get_rate_snapshot(
                self.db,
                self.global_settings,
                route_code=USDT_TO_IDR_CASH,
                client=client,
                now=now,
            )

        self.assertEqual(status, "LIVE")
        self.assertEqual(snapshot.market_fx_snapshot_id, canonical_fx.id)
        self.assertEqual(client.calls, 2)

    async def test_unknown_pair_requires_manual_calculation(self):
        with self.assertRaises(UnsupportedExchangePair):
            await create_exchange_quote(
                self.db,
                user=self.user,
                give_currency="IDR_BANK",
                receive_currency=USDT,
                amount_side="give",
                amount=Decimal("1000000"),
                client=FakeAsyncClient(),
                now=datetime(2026, 8, 1, 10, 0, 0),
            )
