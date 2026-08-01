import unittest
from dataclasses import asdict

from sqlalchemy import inspect

from app.models.exchange import (
    ExchangeQuote,
    ExchangeRateSnapshot,
    ExchangeRouteSettingsVersion,
)
from app.services.currency_calculator import DEFAULT_ROUTE_SETTINGS


class ExchangeSchemaV2Tests(unittest.TestCase):
    def test_all_eight_routes_can_be_stored_as_versioned_json(self):
        versions = [
            ExchangeRouteSettingsVersion(
                route_code=route_code,
                version=1,
                is_active=True,
                settings={
                    key: str(value) if hasattr(value, "as_tuple") else value
                    for key, value in asdict(settings).items()
                    if key != "route_code"
                },
            )
            for route_code, settings in DEFAULT_ROUTE_SETTINGS.items()
        ]

        self.assertEqual(len(versions), 8)
        self.assertEqual({item.route_code for item in versions}, set(DEFAULT_ROUTE_SETTINGS))
        self.assertTrue(all(item.settings["route_enabled"] for item in versions))
        self.assertTrue(
            all(item.settings["manual_confirmation_required"] for item in versions)
        )

    def test_quote_model_has_route_mode_and_internal_display_amounts(self):
        columns = {column.key for column in inspect(ExchangeQuote).columns}

        self.assertTrue(
            {
                "route_code",
                "mode",
                "source_amount_internal",
                "source_amount_display",
                "target_amount_internal",
                "target_amount_display",
                "route_settings_version_id",
            }.issubset(columns)
        )

    def test_rate_snapshot_has_cbr_and_whitebird_audit_fields(self):
        columns = {column.key for column in inspect(ExchangeRateSnapshot).columns}

        self.assertTrue(
            {
                "cbr_usd_rub",
                "cbr_rate_date",
                "cbr_fetched_at",
                "cbr_raw_json",
                "indodax_server_time",
                "whitebird_actual_sell_usdt_rub",
                "whitebird_actual_fetched_at",
                "whitebird_actual_expires_at",
            }.issubset(columns)
        )
