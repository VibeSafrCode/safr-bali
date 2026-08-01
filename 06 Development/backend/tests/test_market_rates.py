import unittest
from datetime import datetime, timezone
from decimal import Decimal

from app.services.market_rates import (
    CBR_DAILY_RATES_URL,
    COINBASE_USDT_RATES_URL,
    INDODAX_USDT_IDR_URL,
    MarketRateError,
    fetch_market_rates,
    parse_cbr_usd_rub_xml,
    parse_coinbase_usdt_rub,
    parse_indodax_server_time,
    parse_indodax_usdt_idr,
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
    def __init__(self, payloads):
        self.payloads = payloads
        self.requested_urls = []

    async def get(self, url):
        self.requested_urls.append(url)
        return FakeResponse(self.payloads[url])


class MarketRateTests(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_preserves_indodax_buy_and_sell(self):
        now = datetime(2026, 7, 29, 10, 0, tzinfo=timezone.utc)
        client = FakeAsyncClient(
            {
                COINBASE_USDT_RATES_URL: {
                    "data": {"rates": {"RUB": "79.406289"}}
                },
                INDODAX_USDT_IDR_URL: {
                    "ticker": {
                        "buy": "17900",
                        "sell": "18016",
                        "last": "18000",
                        "server_time": "1785578400",
                    }
                },
                CBR_DAILY_RATES_URL: (
                    '<ValCurs Date="01.08.2026" name="Foreign Currency Market">'
                    "<Valute><CharCode>USD</CharCode><Nominal>1</Nominal>"
                    "<Value>80,5000</Value></Valute></ValCurs>"
                ),
            }
        )

        rates = await fetch_market_rates(client, now=now)

        self.assertEqual(str(rates.coinbase_usdt_rub), "79.406289")
        self.assertEqual(str(rates.indodax_buy_idr_per_usdt), "17900")
        self.assertEqual(str(rates.indodax_sell_idr_per_usdt), "18016")
        self.assertEqual(str(rates.indodax_last_idr_per_usdt), "18000")
        self.assertEqual(str(rates.cbr_usd_rub), "80.5000")
        self.assertEqual(str(rates.cbr_rate_date), "2026-08-01")
        self.assertEqual(rates.cbr_fetched_at, now)
        self.assertEqual(
            rates.indodax_server_time,
            datetime.fromtimestamp(1785578400, tz=timezone.utc),
        )
        self.assertEqual(rates.fetched_at, now)
        self.assertCountEqual(
            client.requested_urls,
            [
                COINBASE_USDT_RATES_URL,
                INDODAX_USDT_IDR_URL,
                CBR_DAILY_RATES_URL,
            ],
        )

    def test_cbr_parser_uses_nominal_and_decimal_comma(self):
        rate, rate_date, payload = parse_cbr_usd_rub_xml(
            '<ValCurs Date="01.08.2026"><Valute><CharCode>USD</CharCode>'
            "<Nominal>10</Nominal><Value>805,2500</Value>"
            "</Valute></ValCurs>"
        )

        self.assertEqual(rate, Decimal("80.5250"))
        self.assertEqual(str(rate_date), "2026-08-01")
        self.assertEqual(payload["nominal"], "10")

    def test_invalid_cbr_and_indodax_server_time_are_rejected(self):
        with self.assertRaises(MarketRateError):
            parse_cbr_usd_rub_xml("<not-closed>")
        with self.assertRaises(MarketRateError):
            parse_cbr_usd_rub_xml(
                '<ValCurs Date="01.08.2026"><Valute><CharCode>EUR</CharCode>'
                "<Nominal>1</Nominal><Value>90,0</Value></Valute></ValCurs>"
            )
        with self.assertRaises(MarketRateError):
            parse_indodax_server_time({"ticker": {"server_time": "NaN"}})

    async def test_invalid_cbr_does_not_block_non_rub_routes(self):
        client = FakeAsyncClient(
            {
                COINBASE_USDT_RATES_URL: {
                    "data": {"rates": {"RUB": "79.406289"}}
                },
                INDODAX_USDT_IDR_URL: {
                    "ticker": {"buy": "17900", "sell": "18016"}
                },
                CBR_DAILY_RATES_URL: "<invalid>",
            }
        )

        rates = await fetch_market_rates(client)

        self.assertIsNone(rates.cbr_usd_rub)
        self.assertEqual(rates.cbr_error_code, "MarketRateError")
        self.assertEqual(rates.indodax_buy_idr_per_usdt, Decimal("17900"))

    async def test_missing_or_non_positive_rates_are_rejected(self):
        with self.assertRaises(MarketRateError):
            parse_coinbase_usdt_rub({"data": {"rates": {}}})
        with self.assertRaises(MarketRateError):
            parse_indodax_usdt_idr(
                {"ticker": {"buy": "0", "sell": "18016"}}
            )
        with self.assertRaises(MarketRateError):
            parse_indodax_usdt_idr(
                {"ticker": {"buy": "17900", "sell": "NaN"}}
            )
