from argparse import Namespace
from copy import deepcopy
from datetime import timedelta

import pytest
from sqlalchemy import delete, update

from app.models.catalog_pricing import FxMarketSnapshot, PriceCatalogVersion
from app.models.user import User
from app.scripts.publish_extension_prices import SafetyError, execute, sql_write_boundary
from app.services.catalog_pricing import projection_payload, publish_catalog
from app.services.catalog_compositions import with_catalog_compositions
from app.services.extension_pricing import prepare_extension_catalog
from tests.test_catalog_pricing import NOW
from tests.test_extension_pricing import published


def options(**changes):
    args = Namespace(projection_url="http://127.0.0.1:8000/api/catalog/pricing", apply=False,
                     expected_catalog_hash=None, expected_publication_version=None, actor_user_id=None)
    for key, value in changes.items():
        setattr(args, key, value)
    return args


def run(db, args, now=NOW, loader=None):
    return execute(db, args, root_telegram_id=100, now=now,
                   projection_loader=loader or (lambda url: with_catalog_compositions(projection_payload(db, now=now),now=now)))


def test_dry_apply_replay_and_later_admin_conflict(published):
    db, actor, fx = published
    dry = run(db, options())
    assert dry["mode"] == "DRY_RUN"
    assert db.query(PriceCatalogVersion).count() == 1
    args = options(apply=True, expected_catalog_hash=dry["catalog_hash"],
                   expected_publication_version=dry["expected_publication_version"], actor_user_id=actor.id)
    assert run(db, args)["mode"] == "APPLIED"
    assert run(db, args)["mode"] == "ALREADY_APPLIED"
    assert db.query(PriceCatalogVersion).count() == 2
    draft = prepare_extension_catalog(db, expected_publication_version=2)
    draft["items"][0]["label_ru"] = "Later approved admin edit"
    publish_catalog(db, **draft, effective_from=NOW, reason="Later admin publication",
                    idempotency_key="later-admin-edit", actor_id=actor.id, now=NOW)
    db.commit()
    with pytest.raises(SafetyError, match="subsequent_edit"):
        run(db, args)


@pytest.mark.parametrize("changes,code", [
    ({"apply": True}, "apply_requires"),
    ({"expected_catalog_hash": "0" * 64}, "catalog_hash_changed"),
    ({"expected_publication_version": 2}, "publication_version_changed"),
    ({"actor_user_id": 999999}, "configured_active_root"),
    ({"projection_url": "https://safrway.online.evil.test/api/catalog/pricing"}, "url_not_allowed"),
])
def test_preflight_rejects_without_writes(published, changes, code):
    db, actor, fx = published
    with pytest.raises(SafetyError, match=code):
        run(db, options(**changes))
    assert db.query(PriceCatalogVersion).count() == 1


def test_stale_or_mismatched_full_projection_aborts(published):
    db, actor, fx = published
    with pytest.raises(SafetyError, match="fresh_fx_required"):
        run(db, options(), now=NOW + timedelta(seconds=61))
    def mismatched(url):
        response = deepcopy(with_catalog_compositions(projection_payload(db, now=NOW),now=NOW))
        response["items"][0]["label"]["en"] = "Cache drift"
        return response
    with pytest.raises(SafetyError, match="differs_from_database"):
        run(db, options(), loader=mismatched)


@pytest.mark.parametrize("apply", [True, False])
@pytest.mark.parametrize("statement", [
    update(User).values(status="blocked"),
    update(FxMarketSnapshot).values(ask_idr_per_usdt=1),
    update(PriceCatalogVersion).values(reason="rewrite history"),
    delete(PriceCatalogVersion),
])
def test_sql_boundary_denies_unapproved_writes(published, apply, statement):
    db, actor, fx = published
    with pytest.raises(SafetyError, match="sql_write_boundary"):
        with sql_write_boundary(db, apply=apply):
            db.execute(statement)
    db.rollback()
    assert db.get(User, actor.id).status == "active"


def test_cli_argument_error_is_sanitized_json(capsys):
    import json
    from app.scripts.publish_extension_prices import main
    assert main(["--projection-url", "https://SECRET:SECRET@evil.test/"]) == 1
    output = capsys.readouterr()
    assert json.loads(output.out)["error"] == "invalid_arguments"
    assert "SECRET" not in output.out + output.err
    assert "Traceback" not in output.out + output.err


def test_unknown_failure_never_prints_exception_payload(monkeypatch, capsys):
    import json
    import app.scripts.publish_extension_prices as cli
    def fail(*args, **kwargs):
        raise ValueError("synthetic-secret-DSN-do-not-log")
    monkeypatch.setattr(cli, "execute", fail)
    assert cli.main(["--projection-url", "http://localhost:8000/api/catalog/pricing"]) == 1
    output = capsys.readouterr()
    assert json.loads(output.out)["error"] == "preflight_or_publication_failed"
    assert "do-not-log" not in output.out + output.err
    assert "Traceback" not in output.out + output.err


def test_projection_loader_does_not_follow_redirects(monkeypatch):
    import httpx
    from app.scripts.publish_extension_prices import fetch_projection
    class Response:
        status_code = 302
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
    class Client:
        def __init__(self, **kwargs):
            assert kwargs["follow_redirects"] is False
            assert kwargs["trust_env"] is False
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def stream(self, *args, **kwargs):
            return Response()
    monkeypatch.setattr(httpx, "Client", Client)
    with pytest.raises(SafetyError, match="http_failure"):
        fetch_projection("https://safrway.online/api/catalog/pricing")
