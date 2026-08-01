import unittest
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.api.admin import (
    RouteSettingsVersionCreate,
    create_exchange_route_settings_version,
    get_exchange_route_settings,
)
from app.db.base import Base
from app.main import app
from app.models.exchange import (
    ExchangeRouteSettingsVersion,
    ExchangeSettingsVersion,
)
from app.models.user import User
from app.services.currency_calculator import (
    DEFAULT_ROUTE_SETTINGS,
    USDT_TO_IDR_CASH,
)
from app.services.exchange_quotes import (
    UnsupportedExchangePair,
    create_exchange_quote,
    route_settings_payload,
)
from tests.test_exchange_quotes import FakeAsyncClient


class ExchangeAdminApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        db = self.Session()
        try:
            user = User(
                telegram_id=2001,
                first_name="Клиент",
                language="ru",
                role="client",
                ref_code="TG2001",
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
            versions = [
                ExchangeRouteSettingsVersion(
                    route_code=route_code,
                    version=1,
                    is_active=True,
                    settings=route_settings_payload(settings),
                )
                for route_code, settings in DEFAULT_ROUTE_SETTINGS.items()
            ]
            db.add_all([user, global_settings, *versions])
            db.commit()
            self.user_id = user.id
        finally:
            db.close()

    def test_admin_routes_are_guarded_by_existing_dependency(self):
        response = TestClient(app).get("/admin/exchange/routes")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid admin token")

    def test_list_and_partial_update_create_complete_version_two(self):
        with patch("app.api.admin.SessionLocal", self.Session):
            listed = get_exchange_route_settings()
            created = create_exchange_route_settings_version(
                USDT_TO_IDR_CASH,
                RouteSettingsVersionCreate(
                    settings={
                        "rounding_step": "50000",
                        "safrway_fee_percent": "4",
                    }
                ),
            )

        self.assertEqual(len(listed["routes"]), 8)
        self.assertEqual(created["version"], 2)
        self.assertEqual(created["settings"]["rounding_step"], "50000")
        self.assertEqual(
            created["settings"]["safrway_min_fee_currency"],
            "IDR_CASH",
        )
        self.assertEqual(
            set(created["settings"]),
            set(route_settings_payload(DEFAULT_ROUTE_SETTINGS[USDT_TO_IDR_CASH])),
        )

        db = self.Session()
        try:
            versions = (
                db.query(ExchangeRouteSettingsVersion)
                .filter(
                    ExchangeRouteSettingsVersion.route_code
                    == USDT_TO_IDR_CASH
                )
                .order_by(ExchangeRouteSettingsVersion.version)
                .all()
            )
            self.assertEqual([item.version for item in versions], [1, 2])
            self.assertEqual([item.is_active for item in versions], [False, True])
        finally:
            db.close()

    async def test_old_quote_snapshot_stays_immutable_and_new_quote_changes(self):
        db = self.Session()
        try:
            user = db.get(User, self.user_id)
            now = datetime(2026, 8, 1, 10, 0, 0)
            client = FakeAsyncClient()
            old_quote = await create_exchange_quote(
                db,
                user=user,
                route_code=USDT_TO_IDR_CASH,
                mode="GIVE",
                amount=Decimal("1000"),
                client=client,
                now=now,
            )
            old_snapshot = dict(old_quote.settings_snapshot["route"])

            with patch("app.api.admin.SessionLocal", self.Session):
                create_exchange_route_settings_version(
                    USDT_TO_IDR_CASH,
                    RouteSettingsVersionCreate(
                        settings={
                            "rounding_step": "50000",
                            "safrway_fee_percent": "4",
                        }
                    ),
                )

            new_quote = await create_exchange_quote(
                db,
                user=user,
                route_code=USDT_TO_IDR_CASH,
                mode="GIVE",
                amount=Decimal("1000"),
                client=client,
                now=now,
            )

            self.assertEqual(old_quote.settings_snapshot["route"], old_snapshot)
            self.assertEqual(old_snapshot["version"], 1)
            self.assertEqual(new_quote.settings_snapshot["route"]["version"], 2)
            self.assertNotEqual(
                old_quote.target_amount_display,
                new_quote.target_amount_display,
            )
        finally:
            db.close()

    def test_unknown_and_invalid_updates_roll_back_without_deactivation(self):
        cases = [
            (
                "UNKNOWN_ROUTE",
                {"rounding_step": "50000"},
            ),
            (
                USDT_TO_IDR_CASH,
                {"unknown_setting": "1"},
            ),
            (
                USDT_TO_IDR_CASH,
                {"safrway_min_fee_currency": "USDT"},
            ),
        ]
        with patch("app.api.admin.SessionLocal", self.Session):
            for route_code, values in cases:
                with self.subTest(route_code=route_code, values=values):
                    with self.assertRaises(HTTPException) as raised:
                        create_exchange_route_settings_version(
                            route_code,
                            RouteSettingsVersionCreate(settings=values),
                        )
                    self.assertEqual(raised.exception.status_code, 422)

        db = self.Session()
        try:
            active = (
                db.query(ExchangeRouteSettingsVersion)
                .filter(
                    ExchangeRouteSettingsVersion.route_code
                    == USDT_TO_IDR_CASH,
                    ExchangeRouteSettingsVersion.is_active.is_(True),
                )
                .one()
            )
            self.assertEqual(active.version, 1)
            self.assertEqual(
                db.query(ExchangeRouteSettingsVersion)
                .filter(
                    ExchangeRouteSettingsVersion.route_code
                    == USDT_TO_IDR_CASH
                )
                .count(),
                1,
            )
        finally:
            db.close()

    async def test_disabled_route_is_versioned_but_rejected_for_new_quotes(self):
        with patch("app.api.admin.SessionLocal", self.Session):
            created = create_exchange_route_settings_version(
                USDT_TO_IDR_CASH,
                RouteSettingsVersionCreate(settings={"route_enabled": False}),
            )
        self.assertFalse(created["settings"]["route_enabled"])

        db = self.Session()
        try:
            user = db.get(User, self.user_id)
            with self.assertRaises(UnsupportedExchangePair):
                await create_exchange_quote(
                    db,
                    user=user,
                    route_code=USDT_TO_IDR_CASH,
                    mode="GIVE",
                    amount=Decimal("1000"),
                    client=FakeAsyncClient(),
                    now=datetime(2026, 8, 1, 10, 0, 0),
                )
        finally:
            db.close()

    def test_commit_conflict_rolls_back_previous_active_version(self):
        db = self.Session()
        try:
            error = IntegrityError("insert", {}, RuntimeError("duplicate"))
            with patch.object(db, "commit", side_effect=error):
                with self.assertRaisesRegex(
                    ValueError,
                    "Concurrent route settings update",
                ):
                    from app.services.exchange_quotes import (
                        create_route_settings_version,
                    )

                    create_route_settings_version(
                        db,
                        route_code=USDT_TO_IDR_CASH,
                        settings_payload={"rounding_step": "50000"},
                    )
        finally:
            db.close()

        verification = self.Session()
        try:
            active = (
                verification.query(ExchangeRouteSettingsVersion)
                .filter(
                    ExchangeRouteSettingsVersion.route_code
                    == USDT_TO_IDR_CASH,
                    ExchangeRouteSettingsVersion.is_active.is_(True),
                )
                .one()
            )
            self.assertEqual(active.version, 1)
            self.assertEqual(
                verification.query(ExchangeRouteSettingsVersion)
                .filter(
                    ExchangeRouteSettingsVersion.route_code
                    == USDT_TO_IDR_CASH
                )
                .count(),
                1,
            )
        finally:
            verification.close()
