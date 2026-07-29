import unittest
from decimal import Decimal

from app.services.currency_calculator import (
    CurrencyCalculationError,
    IdrToRubSettings,
    UsdtToIdrSettings,
    calculate_bank_rub_from_cash_idr,
    calculate_cash_idr_to_bank_rub,
    calculate_usdt_to_idr_by_give,
    calculate_usdt_to_idr_by_receive,
    round_idr,
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
