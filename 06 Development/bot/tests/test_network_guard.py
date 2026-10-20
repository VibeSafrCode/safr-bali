"""Pure canaries: every attempted transport is intercepted before any OS call."""
import socket
import unittest

from tests.network_guard import NETWORK_TARGETS, reject_real_network


class UnitNetworkGuardTests(unittest.TestCase):
    def test_no_network_unit_exits_cleanly(self):
        with reject_real_network() as attempts:
            self.assertEqual(attempts, [])

    def test_caught_transport_errors_still_fail_the_unit_scope(self):
        for target in NETWORK_TARGETS:
            with self.subTest(target=target):
                with self.assertRaisesRegex(AssertionError, "Bot unit attempted real network"):
                    with reject_real_network() as attempts:
                        owner = socket.socket if target.startswith("socket.socket.") else socket
                        with self.assertRaisesRegex(OSError, "BOT_UNIT_REAL_NETWORK_DENIED"):
                            getattr(owner, target.rsplit(".", 1)[1])()
                        self.assertEqual(attempts, [target])

    def test_uncaught_transport_errors_also_fail_closed(self):
        with self.assertRaisesRegex(AssertionError, "Bot unit attempted real network"):
            with reject_real_network():
                socket.create_connection(("fixture.invalid", 9))
