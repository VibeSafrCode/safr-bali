"""Per-case process-state isolation, without bypassing production dependencies."""

import sys

import pytest


@pytest.fixture(autouse=True)
def isolated_rate_limiter(monkeypatch):
    # All ASGI TestClients otherwise share the synthetic host "testclient" and
    # spend the same process-global minute budget across unrelated test cases.
    # Keep the REAL limiter and configured limit inside every individual case;
    # do not mock check(), raise limits globally, or override rate_limit/auth.
    # Source-only/stdlib tests need not import application settings merely to
    # obtain this fixture. If a case first imports security itself, its initial
    # limiter is already fresh; later cases see the module and get a new one.
    security = sys.modules.get("app.core.security")
    if security is None:
        yield None
        return

    limiter = security.InMemoryRateLimiter()
    monkeypatch.setattr(security, "rate_limiter", limiter)
    yield limiter
