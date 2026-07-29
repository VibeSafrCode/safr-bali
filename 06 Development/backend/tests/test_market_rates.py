import unittest
from datetime import datetime, timezone

from app.services.market_rates import (
    COINBASE_USDT_RATES_URL,
    INDODAX_USDT_IDR_URL,
    MarketRateError,
    fetch_market_rates,
    parse_coinbase_usdt_rub,
    parse_indodax_usdt_idr,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
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
                    }
                },
            }
        )

        rates = await fetch_market_rates(client, now=now)

        self.assertEqual(str(rates.coinbase_usdt_rub), "79.406289")
        self.assertEqual(str(rates.indodax_buy_idr_per_usdt), "17900")
        self.assertEqual(str(rates.indodax_sell_idr_per_usdt), "18016")
        self.assertEqual(str(rates.indodax_last_idr_per_usdt), "18000")
        self.assertEqual(rates.fetched_at, now)
        self.assertCountEqual(
            client.requested_urls,
            [COINBASE_USDT_RATES_URL, INDODAX_USDT_IDR_URL],
        )

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
