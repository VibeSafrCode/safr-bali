"""Opt-in other-service migration checks on the isolated reminder test server."""

import pytest
from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.life_services import LifeService
from tests.test_service_reminders import life
from tests.test_service_reminders_postgres import pg


PRIOR = "b7d2e6a9c410"
REVISION = "c8e3f7a1d502"


@pytest.fixture
def prior_schema(pg):
    engine, sessions, config = pg
    command.upgrade(config, PRIOR)
    # The shared fixture builds current metadata. Restore the actual prior
    # constraints so this test exercises the migration, not create_all support.
    checks = {
        "ck_life_services_kind": "kind IN ('housing','bike','insurance')",
        "ck_life_services_quantity": "quantity > 0 AND (kind = 'bike' OR quantity = 1)",
        "ck_life_services_publish_complete": (
            "publication_status != 'PUBLISHED' OR "
            "(title IS NOT NULL AND length(trim(title)) > 0 "
            "AND (end_date IS NOT NULL OR (kind IN ('housing','bike') AND rental_mode = 'monthly')) "
            "AND (kind = 'insurance' OR start_date IS NOT NULL))"
        ),
    }
    with engine.begin() as connection:
        for name, condition in checks.items():
            connection.execute(text(f'ALTER TABLE life_services DROP CONSTRAINT "{name}"'))
            connection.execute(text(f'ALTER TABLE life_services ADD CONSTRAINT "{name}" CHECK ({condition})'))
    return engine, sessions, config


def test_other_migration_preserves_legacy_rows_and_pristine_schema_rollback(prior_schema):
    engine, sessions, config = prior_schema
    with sessions() as db:
        existing = life(db, kind="bike", quantity=3, price_amount="125000.00")
        db.commit()
        record_id, original_end = existing.id, existing.end_date
        with pytest.raises(IntegrityError):
            life(db, kind="other", remaining=None, start_date=None)
        db.rollback()

    command.upgrade(config, REVISION)
    command.downgrade(config, PRIOR)
    command.upgrade(config, REVISION)
    with sessions() as db:
        existing = db.get(LifeService, record_id)
        assert existing.kind == "bike" and existing.quantity == 3
        assert existing.end_date == original_end and existing.price_amount == 125000
        other = life(db, kind="other", remaining=None, start_date=None, quantity=4)
        db.commit()
        assert other.end_date is None and other.start_date is None
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == REVISION


@pytest.mark.parametrize("publication", ["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"])
def test_other_migration_downgrade_refuses_without_losing_any_service(prior_schema, publication):
    engine, sessions, config = prior_schema
    command.upgrade(config, REVISION)
    with sessions() as db:
        other = life(db, kind="other", publication_status=publication,
                     remaining=None, start_date=None, quantity=4, price_amount="125000.00")
        db.commit()
        record_id = other.id
    with pytest.raises(RuntimeError, match="Other service records exist"):
        command.downgrade(config, PRIOR)
    with sessions() as db:
        row = db.get(LifeService, record_id)
        assert row.kind == "other" and row.publication_status == publication
        assert row.quantity == 4 and row.price_amount == 125000
        assert row.start_date is None and row.end_date is None
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == REVISION
