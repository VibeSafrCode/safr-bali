"""Real auth/rate dependencies, same host, fresh budget at each pytest boundary."""

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import pytest

from app.core import security
from app.core.config import settings


@pytest.mark.parametrize("independent_case", ("first", "second"))
def test_each_case_is_fresh_but_real_auth_and_same_case_429_remain(
        independent_case, isolated_rate_limiter, monkeypatch):
    assert security.rate_limiter is isolated_rate_limiter
    assert isolated_rate_limiter.requests == {}
    assert isolated_rate_limiter.expires == {}
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 2)
    monkeypatch.setattr(settings, "SERVICE_API_TOKEN", "synthetic-case-isolation-token")
    app = FastAPI()

    @app.get("/case-budget", dependencies=[Depends(security.rate_limit), Depends(security.require_service_token)])
    def endpoint():
        return {"case": independent_case}

    with TestClient(app) as client:
        assert client.get("/case-budget").status_code == 401
        headers = {"X-Service-Token": "synthetic-case-isolation-token"}
        accepted = client.get("/case-budget", headers=headers)
        assert accepted.status_code == 200 and accepted.json() == {"case": independent_case}
        denied = client.get("/case-budget", headers=headers)
        assert denied.status_code == 429
        assert denied.json() == {"detail": "Rate limit exceeded"}
    assert len(isolated_rate_limiter.requests["testclient"]) == 2
