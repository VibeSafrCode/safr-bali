import unittest
from dataclasses import replace
from datetime import datetime, timedelta
from decimal import Decimal

from app.services.currency_calculator import (
    CurrencyCalculationError,
    DEFAULT_ROUTE_SETTINGS,
    IDR_CASH_TO_RUB_BANK,
    IDR_CASH_TO_USDT,
    IdrToRubSettings,
    RUB_BANK,
    RUB_BANK_TO_IDR_BANK,
    RUB_BANK_TO_IDR_CASH,
    RUB_BANK_TO_USDT,
    RouteRates,
    USDT_TO_IDR_BANK,
    USDT_TO_IDR_CASH,
    USDT_TO_RUB_BANK,
    UsdtToIdrSettings,
    calculate_bank_rub_from_cash_idr,
    calculate_cash_idr_to_bank_rub,
    calculate_route_by_give,
    calculate_route_by_receive,
    calculate_usdt_to_idr_by_give,
    calculate_usdt_to_idr_by_receive,
    display_amount,
    round_idr,
    usdt_to_idr_bank_fee,
    whitebird_sell_allocation,
)


class CurrencyCalculatorTests(unittest.TestCase):
    def test_usdt_to_cash_idr_uses_indodax_buy(self):
        result = calculate_usdt_to_idr_by_give(
            give_usdt=Decimal("100"),
            indodax_buy_idr_per_usdt=Decimal("17883"),
            receive_cash=True,
            settings=UsdtToIdrSettings(
                base_fee_percent=Decimal("6"),
                cash_extra_fee_percent=Decimal("1"),
                max_total_fee_percent=Decimal("7.5"),
            ),
        )

        self.assertEqual(result.client_rate_idr_per_usdt, Decimal("16631"))
        self.assertEqual(result.receive_idr, Decimal("1663100"))

    def test_usdt_to_bank_idr_keeps_base_fee_only(self):
        result = calculate_usdt_to_idr_by_give(
            give_usdt=Decimal("100"),
            indodax_buy_idr_per_usdt=Decimal("17883"),
            receive_cash=False,
            settings=UsdtToIdrSettings(
                base_fee_percent=Decimal("6"),
                cash_extra_fee_percent=Decimal("1"),
                max_total_fee_percent=Decimal("7.5"),
            ),
        )

        self.assertEqual(result.client_rate_idr_per_usdt, Decimal("16810"))
        self.assertEqual(result.receive_idr, Decimal("1681000"))

    def test_usdt_to_cash_idr_total_fee_is_capped(self):
        result = calculate_usdt_to_idr_by_give(
            give_usdt=Decimal("100"),
            indodax_buy_idr_per_usdt=Decimal("18000"),
            receive_cash=True,
            settings=UsdtToIdrSettings(
                base_fee_percent=Decimal("7"),
                cash_extra_fee_percent=Decimal("2"),
                max_total_fee_percent=Decimal("7.5"),
            ),
        )

        self.assertEqual(result.client_rate_idr_per_usdt, Decimal("16650"))
        self.assertEqual(result.receive_idr, Decimal("1665000"))

    def test_cash_idr_to_bank_rub_matches_approved_fixture(self):
        result = calculate_cash_idr_to_bank_rub(
            receive_rub=Decimal("20000"),
            coinbase_usdt_rub=Decimal("79.406289"),
            indodax_sell_idr_per_usdt=Decimal("18016"),
            settings=IdrToRubSettings(
                safrway_fee_percent=Decimal("4"),
                safrway_min_fee_rub=Decimal("1500"),
                technical_fee_percent=Decimal("2.5"),
                partner_fee_percent=Decimal("1.5"),
                partner_min_fee_idr=Decimal("150000"),
                idr_rounding_step=Decimal("10000"),
            ),
        )

        self.assertEqual(result.receive_rub, Decimal("20000"))
        self.assertEqual(result.safrway_fee_rub, Decimal("1500"))
        self.assertEqual(result.technical_idr, Decimal("5000000"))
        self.assertEqual(result.partner_fee_idr, Decimal("150000"))
        self.assertEqual(result.give_idr, Decimal("5150000"))

    def test_client_can_enter_desired_idr_instead_of_selecting_usdt(self):
        result = calculate_usdt_to_idr_by_receive(
            receive_idr=Decimal("1663100"),
            indodax_buy_idr_per_usdt=Decimal("17883"),
            receive_cash=True,
            settings=UsdtToIdrSettings(
                base_fee_percent=Decimal("6"),
                cash_extra_fee_percent=Decimal("1"),
                max_total_fee_percent=Decimal("7.5"),
            ),
        )

        self.assertEqual(result.give_usdt, Decimal("100.00000000"))
        self.assertEqual(result.receive_idr, Decimal("1663100"))

    def test_client_can_enter_available_idr_and_receive_rub_result(self):
        result = calculate_bank_rub_from_cash_idr(
            give_idr=Decimal("5150000"),
            coinbase_usdt_rub=Decimal("79.406289"),
            indodax_sell_idr_per_usdt=Decimal("18016"),
            settings=IdrToRubSettings(
                safrway_fee_percent=Decimal("4"),
                safrway_min_fee_rub=Decimal("1500"),
                technical_fee_percent=Decimal("2.5"),
                partner_fee_percent=Decimal("1.5"),
                partner_min_fee_idr=Decimal("150000"),
                idr_rounding_step=Decimal("10000"),
            ),
        )

        self.assertEqual(result.give_idr, Decimal("5150000"))
        self.assertEqual(result.receive_rub, Decimal("20021"))
        self.assertEqual(result.calculation_margin_idr, Decimal("0"))

    def test_idr_rounding_uses_half_down_in_clients_favour(self):
        self.assertEqual(
            round_idr(Decimal("5005000"), Decimal("10000")),
            Decimal("5000000"),
        )
        self.assertEqual(
            round_idr(Decimal("5005000.01"), Decimal("10000")),
            Decimal("5010000"),
        )

    def test_non_positive_and_invalid_market_values_are_rejected(self):
        with self.assertRaises(CurrencyCalculationError):
            calculate_usdt_to_idr_by_give(
                give_usdt=Decimal("0"),
                indodax_buy_idr_per_usdt=Decimal("17883"),
                receive_cash=True,
                settings=UsdtToIdrSettings(
                    base_fee_percent=Decimal("6"),
                    cash_extra_fee_percent=Decimal("1"),
                    max_total_fee_percent=Decimal("7.5"),
                ),
            )

        with self.assertRaises(CurrencyCalculationError):
            calculate_cash_idr_to_bank_rub(
                receive_rub=Decimal("20000"),
                coinbase_usdt_rub=Decimal("NaN"),
                indodax_sell_idr_per_usdt=Decimal("18016"),
                settings=IdrToRubSettings(
                    safrway_fee_percent=Decimal("4"),
                    safrway_min_fee_rub=Decimal("1500"),
                    technical_fee_percent=Decimal("2.5"),
                    partner_fee_percent=Decimal("1.5"),
                    partner_min_fee_idr=Decimal("150000"),
                    idr_rounding_step=Decimal("10000"),
                ),
            )


class EightRouteEngineTests(unittest.TestCase):
    def setUp(self):
        observed_at = datetime(2026, 8, 1, 10, 0, 0)
        self.rates = RouteRates(
            coinbase_usdt_rub=Decimal("80"),
            cbr_usd_rub=Decimal("80"),
            indodax_buy_idr_per_usdt=Decimal("16000"),
            indodax_sell_idr_per_usdt=Decimal("16100"),
            coinbase_fetched_at=observed_at,
            calculated_at=observed_at,
        )

    def test_all_eight_routes_have_isolated_give_formulas(self):
        cases = {
            RUB_BANK_TO_IDR_CASH: Decimal("100000"),
            RUB_BANK_TO_IDR_BANK: Decimal("100000"),
            RUB_BANK_TO_USDT: Decimal("100000"),
            USDT_TO_RUB_BANK: Decimal("1000"),
            USDT_TO_IDR_CASH: Decimal("1000"),
            USDT_TO_IDR_BANK: Decimal("1000"),
            IDR_CASH_TO_USDT: Decimal("20000000"),
            IDR_CASH_TO_RUB_BANK: Decimal("20000000"),
        }

        results = {
            route_code: calculate_route_by_give(
                route_code=route_code,
                amount=amount,
                rates=self.rates,
            )
            for route_code, amount in cases.items()
        }

        self.assertEqual(set(results), set(DEFAULT_ROUTE_SETTINGS))
        for route_code, result in results.items():
            self.assertEqual(result.route_code, route_code)
            self.assertEqual(result.mode, "GIVE")
            self.assertGreater(result.target_amount_display, 0)
            self.assertEqual(
                result.target_amount_internal,
                result.target_amount_before_rounding,
            )
            self.assertLessEqual(
                result.target_amount_display,
                result.target_amount_internal,
            )

        self.assertIn(
            "partner_fee_idr",
            results[RUB_BANK_TO_IDR_CASH].fees,
        )
        self.assertNotIn(
            "partner_fee_idr",
            results[RUB_BANK_TO_IDR_BANK].fees,
        )
        self.assertEqual(
            set(results[USDT_TO_IDR_BANK].fees),
            {"safrway_fee_usdt"},
        )
        self.assertEqual(
            set(results[IDR_CASH_TO_RUB_BANK].fees),
            {
                "technical_aggregate_fee_idr",
                "partner_fee_idr",
                "safrway_fee_rub",
            },
        )
        self.assertNotIn(
            "network_fee_usdt",
            results[IDR_CASH_TO_RUB_BANK].fees,
        )
        self.assertNotIn(
            "whitebird_conversion_fee_rub",
            results[IDR_CASH_TO_RUB_BANK].fees,
        )
        self.assertNotEqual(
            results[USDT_TO_IDR_CASH].target_amount_internal,
            results[USDT_TO_IDR_CASH].target_amount_display,
        )

    def test_all_eight_routes_support_receive_inversion(self):
        give_amounts = {
            RUB_BANK_TO_IDR_CASH: Decimal("100000"),
            RUB_BANK_TO_IDR_BANK: Decimal("100000"),
            RUB_BANK_TO_USDT: Decimal("100000"),
            USDT_TO_RUB_BANK: Decimal("1000"),
            USDT_TO_IDR_CASH: Decimal("1000"),
            USDT_TO_IDR_BANK: Decimal("1000"),
            IDR_CASH_TO_USDT: Decimal("20000000"),
            IDR_CASH_TO_RUB_BANK: Decimal("20000000"),
        }

        for route_code, give_amount in give_amounts.items():
            with self.subTest(route_code=route_code):
                forward = calculate_route_by_give(
                    route_code=route_code,
                    amount=give_amount,
                    rates=self.rates,
                )
                desired = forward.target_amount_display
                inverse = calculate_route_by_receive(
                    route_code=route_code,
                    amount=desired,
                    rates=self.rates,
                )

                self.assertEqual(inverse.mode, "RECEIVE")
                self.assertEqual(inverse.target_amount_display, desired)
                self.assertEqual(
                    inverse.target_amount_internal,
                    inverse.target_amount_before_rounding,
                )
                self.assertGreaterEqual(inverse.available_target_amount, desired)
                self.assertGreater(inverse.source_amount_display, 0)
                self.assertIn(
                    "RECEIVE_MONOTONIC_INVERSION",
                    inverse.policy_flags,
                )

    def test_rub_display_rounding_follows_decision_004(self):
        self.assertEqual(
            display_amount(Decimal("6742.01"), RUB_BANK, "source"),
            Decimal("6743"),
        )
        self.assertEqual(
            display_amount(Decimal("6742.99"), RUB_BANK, "target"),
            Decimal("6742"),
        )
        self.assertEqual(
            display_amount(Decimal("6742"), RUB_BANK, "source"),
            Decimal("6742"),
        )
        self.assertEqual(
            display_amount(Decimal("6742"), RUB_BANK, "target"),
            Decimal("6742"),
        )

    def test_usdt_to_idr_bank_boundary_follows_decision_005(self):
        minimum_settings = DEFAULT_ROUTE_SETTINGS[USDT_TO_IDR_BANK]

        self.assertEqual(
            usdt_to_idr_bank_fee(Decimal("249.99"), minimum_settings),
            (Decimal("10"), "MIN_FEE"),
        )
        self.assertEqual(
            usdt_to_idr_bank_fee(Decimal("250"), minimum_settings),
            (Decimal("10"), "MIN_FEE"),
        )
        self.assertEqual(
            usdt_to_idr_bank_fee(Decimal("250.01"), minimum_settings),
            (Decimal("10.0004"), "PERCENT_FEE"),
        )

    def test_route_rounding_step_override_changes_new_quote_only(self):
        base_settings = DEFAULT_ROUTE_SETTINGS[USDT_TO_IDR_CASH]
        base = calculate_route_by_give(
            route_code=USDT_TO_IDR_CASH,
            amount=Decimal("1000"),
            rates=self.rates,
            settings=base_settings,
        )
        overridden = calculate_route_by_give(
            route_code=USDT_TO_IDR_CASH,
            amount=Decimal("1000"),
            rates=self.rates,
            settings=replace(base_settings, rounding_step=Decimal("50000")),
        )

        self.assertEqual(base.target_amount_display % Decimal("10000"), 0)
        self.assertEqual(overridden.target_amount_display % Decimal("50000"), 0)
        self.assertNotEqual(base.target_amount_display, overridden.target_amount_display)

    def test_whitebird_better_rate_is_shared_50_50_per_decision_006(self):
        observed_at = datetime(2026, 8, 1, 10, 0, 0)
        allocation = whitebird_sell_allocation(
            RouteRates(
                coinbase_usdt_rub=Decimal("80"),
                cbr_usd_rub=Decimal("80"),
                indodax_buy_idr_per_usdt=Decimal("16000"),
                indodax_sell_idr_per_usdt=Decimal("16100"),
                whitebird_actual_sell_usdt_rub=Decimal("80"),
                coinbase_fetched_at=observed_at,
                whitebird_actual_fetched_at=observed_at,
                whitebird_actual_expires_at=observed_at + timedelta(seconds=300),
                calculated_at=observed_at,
            )
        )

        # Protective rate is 80 * 0.9925 = 79.4; the 0.6 improvement is split.
        self.assertEqual(allocation.protective_rate, Decimal("79.4000"))
        self.assertEqual(allocation.client_rate, Decimal("79.70000"))
        self.assertEqual(allocation.client_surplus_per_usdt, Decimal("0.30000"))
        self.assertEqual(allocation.operator_surplus_per_usdt, Decimal("0.30000"))
        self.assertEqual(allocation.policy_status, "CONFIRMED_BETTER_50_50")

    def test_whitebird_actual_rate_outside_ttl_is_not_allocated(self):
        observed_at = datetime(2026, 8, 1, 10, 0, 0)
        allocation = whitebird_sell_allocation(
            RouteRates(
                coinbase_usdt_rub=Decimal("80"),
                cbr_usd_rub=Decimal("80"),
                indodax_buy_idr_per_usdt=Decimal("16000"),
                indodax_sell_idr_per_usdt=Decimal("16100"),
                whitebird_actual_sell_usdt_rub=Decimal("80"),
                coinbase_fetched_at=observed_at,
                whitebird_actual_fetched_at=observed_at - timedelta(seconds=301),
                whitebird_actual_expires_at=observed_at + timedelta(seconds=300),
                calculated_at=observed_at,
            )
        )

        self.assertEqual(allocation.client_rate, Decimal("79.4000"))
        self.assertEqual(allocation.policy_status, "ACTUAL_OUTSIDE_QUOTE_TTL")

    def test_missing_cbr_blocks_only_whitebird_buy_routes(self):
        rates_without_cbr = replace(self.rates, cbr_usd_rub=None)
        with self.assertRaises(CurrencyCalculationError):
            calculate_route_by_give(
                route_code=RUB_BANK_TO_USDT,
                amount=Decimal("100000"),
                rates=rates_without_cbr,
            )

        result = calculate_route_by_give(
            route_code=USDT_TO_IDR_BANK,
            amount=Decimal("1000"),
            rates=rates_without_cbr,
        )
        self.assertGreater(result.target_amount_display, 0)
