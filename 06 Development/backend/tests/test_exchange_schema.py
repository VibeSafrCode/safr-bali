import unittest
from dataclasses import asdict
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from unittest.mock import Mock, patch

from sqlalchemy import inspect

from app.models.exchange import (
    ExchangeQuote,
    ExchangeRateSnapshot,
    ExchangeRouteSettingsVersion,
)
from app.services.currency_calculator import DEFAULT_ROUTE_SETTINGS


class ExchangeSchemaV2Tests(unittest.TestCase):
    @staticmethod
    def _migration_module():
        migration_path = (
            Path(__file__).resolve().parents[1]
            / "alembic"
            / "versions"
            / "e8a1c4d7f920_expand_exchange_route_engine.py"
        )
        spec = spec_from_file_location("exchange_route_engine_migration", migration_path)
        assert spec is not None and spec.loader is not None
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        return module, migration_path

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

    def test_migration_aligns_new_objects_with_runtime_table_owner(self):
        _, migration_path = self._migration_module()
        migration = migration_path.read_text(encoding="utf-8")

        self.assertIn("SELECT tableowner", migration)
        self.assertIn("tablename = 'users'", migration)
        self.assertIn(
            'ALTER TABLE "exchange_route_settings_versions"', migration
        )
        self.assertIn(
            'ALTER SEQUENCE "exchange_route_settings_versions_id_seq"',
            migration,
        )
        self.assertIn("_align_runtime_owner()", migration)

    def test_postgres_owner_alignment_quotes_and_applies_runtime_role(self):
        migration, _ = self._migration_module()
        bind = Mock()
        bind.dialect.name = "postgresql"
        bind.dialect.identifier_preparer.quote_identifier.return_value = (
            '"safr_bali"'
        )
        bind.execute.return_value.scalar_one_or_none.return_value = "safr_bali"

        with (
            patch.object(migration.op, "get_bind", return_value=bind),
            patch.object(migration.op, "execute") as execute,
        ):
            migration._align_runtime_owner()

        statements = [str(call.args[0]) for call in execute.call_args_list]
        self.assertEqual(len(statements), 2)
        self.assertIn(
            'ALTER TABLE "exchange_route_settings_versions" OWNER TO "safr_bali"',
            statements,
        )
        self.assertIn(
            'ALTER SEQUENCE "exchange_route_settings_versions_id_seq" '
            'OWNER TO "safr_bali"',
            statements,
        )

    def test_owner_alignment_is_noop_outside_postgres(self):
        migration, _ = self._migration_module()
        bind = Mock()
        bind.dialect.name = "sqlite"

        with (
            patch.object(migration.op, "get_bind", return_value=bind),
            patch.object(migration.op, "execute") as execute,
        ):
            migration._align_runtime_owner()

        bind.execute.assert_not_called()
        execute.assert_not_called()
