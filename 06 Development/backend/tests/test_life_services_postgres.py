"""Real PostgreSQL races; target must already have the life-services migration."""

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models.admin_action import AdminAction
from app.models.life_services import LifeService
from app.models.user import User
from app.schemas.life_services import LifeServiceCreate, LifeServiceUpdate
from app.services.life_services import LifeServiceConflict, create_life_service, update_life_service


pytestmark = pytest.mark.skipif(not os.environ.get("SAFR_TEST_POSTGRES_URL"), reason="Requires isolated SAFR_TEST_POSTGRES_URL")


@pytest.fixture
def database():
    engine = create_engine(os.environ["SAFR_TEST_POSTGRES_URL"], connect_args={"options": "-c statement_timeout=10000 -c lock_timeout=5000"})
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex
    with factory() as db:
        number = 1000000000 + uuid.uuid4().int % 1000000000
        admin = User(telegram_id=number, role="admin", ref_code=f"life-root-{suffix}", status="active")
        user = User(telegram_id=number + 1, role="client", ref_code=f"life-client-{suffix}", status="active")
        db.add_all([admin, user])
        db.commit()
        actor_id, user_id = admin.id, user.id
    yield factory, actor_id, user_id, suffix
    engine.dispose()


def test_concurrent_creation_has_one_record_and_one_audit(database):
    factory, actor_id, user_id, suffix = database
    payload = LifeServiceCreate(kind="insurance", title="Synthetic insurer", end_date="2026-12-31",
                                publication_status="PUBLISHED", idempotency_key=f"race-create-{suffix}")
    barrier = threading.Barrier(2)

    def before_insert(mapper, connection, target):
        if target.create_idempotency_key == payload.idempotency_key:
            barrier.wait(timeout=5)

    def create():
        with factory() as db:
            row, replay = create_life_service(db, user_id=user_id, actor_id=actor_id, payload=payload)
            db.commit()
            return row.id, replay

    event.listen(LifeService, "before_insert", before_insert)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(create), pool.submit(create)]
            results = [future.result(timeout=15) for future in futures]
    finally:
        event.remove(LifeService, "before_insert", before_insert)
    assert len({record_id for record_id, _ in results}) == 1
    assert sorted(replay for _, replay in results) == [False, True]
    with factory() as db:
        assert db.query(LifeService).filter_by(user_id=user_id).count() == 1
        assert db.query(AdminAction).filter_by(entity_type="life_service", entity_id=results[0][0]).count() == 1


def test_two_simultaneous_editors_cannot_silently_overwrite(database):
    factory, actor_id, user_id, suffix = database
    payload = LifeServiceCreate(kind="bike", idempotency_key=f"race-update-{suffix}")
    with factory() as db:
        row, _ = create_life_service(db, user_id=user_id, actor_id=actor_id, payload=payload)
        db.commit()
        record_id = row.id
    barrier = threading.Barrier(2)

    def change(title):
        with factory() as db:
            # Both editors start with the same version, matching two open forms.
            row = db.get(LifeService, record_id)
            version = row.version
            barrier.wait(timeout=5)
            try:
                row = update_life_service(db, user_id=user_id, record_id=record_id, actor_id=actor_id,
                                          payload=LifeServiceUpdate(kind="bike", title=title, expected_version=version))
                db.commit()
                return "saved", row.title
            except LifeServiceConflict:
                db.rollback()
                return "conflict", title

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(change, "Editor one"), pool.submit(change, "Editor two")]
        results = [future.result(timeout=15) for future in futures]
    assert sorted(result for result, _ in results) == ["conflict", "saved"]
    with factory() as db:
        row = db.get(LifeService, record_id)
        assert row.version == 2 and row.title == next(title for result, title in results if result == "saved")
        assert db.query(AdminAction).filter_by(entity_type="life_service", entity_id=record_id).count() == 2
