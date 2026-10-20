"""Fail closed when an isolated unit reaches a real socket/DNS transport.

The exit assertion also catches application fallbacks which swallow OSError.
This Python guard is not an OS/native-subprocess network sandbox.
"""
from contextlib import ExitStack, contextmanager
from unittest.mock import patch


NETWORK_TARGETS = (
    "socket.create_connection", "socket.getaddrinfo", "socket.getnameinfo",
    "socket.socket.connect", "socket.socket.connect_ex", "socket.socket.sendto",
)


@contextmanager
def reject_real_network():
    attempts = []

    def denied(target):
        def reject(*args, **kwargs):
            attempts.append(target)
            raise OSError("BOT_UNIT_REAL_NETWORK_DENIED")
        return reject

    with ExitStack() as stack:
        for target in NETWORK_TARGETS:
            stack.enter_context(patch(target, side_effect=denied(target)))
        try:
            yield attempts
        finally:
            assert not attempts, "Bot unit attempted real network: " + ", ".join(attempts)
