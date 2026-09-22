"""Disposable local PostgreSQL upgrade/downgrade/upgrade and backup/restore proof.

Run with two EMPTY local databases whose names begin with bali_life_. This
script deliberately refuses remote or populated databases and uses fake data.
It leaves both databases intact for inspection; it never deletes databases.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


BASE_REVISION = "d7a2f9c4e816"
LIFE_REVISION = "e9b3d7a5c201"


def local_database(raw):
    url = make_url(raw)
    socket = url.query.get("host", "")
    if (url.get_backend_name() != "postgresql" or not (url.database or "").startswith("bali_life_")
            or url.host not in {None, "localhost", "127.0.0.1", "::1"}
            or (socket and not str(socket).startswith("/private/tmp/bali-life-postgres."))):
        raise ValueError("Only disposable local bali_life_ databases are permitted")
    return url


def snapshot(engine, tables=None):
    with engine.connect() as connection:
        result = {}
        names = tables if tables is not None else inspect(connection).get_table_names()
        for name in sorted(names):
            quoted = connection.dialect.identifier_preparer.quote_identifier(name)
            rows = connection.execute(text(f"SELECT row_to_json(t)::text FROM {quoted} t")).scalars().all()
            result[name] = sorted(rows)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--restore-url", required=True)
    args = parser.parse_args()
    target, restored = local_database(args.database_url), local_database(args.restore_url)
    if target == restored:
        raise ValueError("Restore database must be separate")
    engine, restore_engine = create_engine(target), create_engine(restored)
    for candidate in (engine, restore_engine):
        if inspect(candidate).get_table_names():
            raise ValueError("Both databases must be empty")
    # Retain the caller's local socket slashes: Alembic's legacy ConfigParser
    # interprets percent-encoded URL characters as interpolation placeholders.
    os.environ["DATABASE_URL"] = args.database_url
    os.environ.setdefault("SERVICE_API_TOKEN", "local-migration-test")
    os.environ.setdefault("ADMIN_API_TOKEN", "local-migration-admin")

    from alembic import command
    from alembic.config import Config
    from sqlalchemy.orm import sessionmaker
    from app.models.user import User
    from app.models.service import Service
    from app.models.order import Order
    from app.models.visa_lifecycle import VisaCase, VisaType
    from app.schemas.life_services import LifeServiceCreate
    from app.services.life_services import create_life_service

    backend = Path(__file__).resolve().parents[2]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    command.upgrade(config, BASE_REVISION)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        admin = User(telegram_id=800000101, role="admin", ref_code="migration-root", status="active")
        client = User(telegram_id=800000102, role="client", ref_code="migration-client", status="active")
        service = Service(name="Existing fixture service", slug="life-proof-existing", category="fixture")
        visa_type = VisaType(country_code="ID", code="LIFE_PROOF", name="Existing visa fixture", version=1)
        db.add_all([admin, client, service, visa_type])
        db.flush()
        order = Order(user_id=client.id, service_id=service.id, amount_usd="135.25", payment_status="paid")
        visa = VisaCase(user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=admin.id, date_source="Synthetic preservation fixture")
        db.add_all([order, visa])
        db.commit()
        actor_id, user_id = admin.id, client.id
    original = snapshot(engine)
    original.pop("alembic_version")
    original_hash = hashlib.sha256(json.dumps(original, sort_keys=True).encode()).hexdigest()
    command.upgrade(config, LIFE_REVISION)
    assert snapshot(engine, original) == original
    assert "life_services" in inspect(engine).get_table_names()
    command.downgrade(config, BASE_REVISION)
    assert snapshot(engine, original) == original
    assert "life_services" not in inspect(engine).get_table_names()
    command.upgrade(config, LIFE_REVISION)
    assert snapshot(engine, original) == original
    with engine.connect() as connection:
        owners = connection.execute(text(
            "SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','life_services')"
        )).all()
        assert len({row.tableowner for row in owners}) == 1
        sequence_owner = connection.execute(text(
            "SELECT sequenceowner FROM pg_sequences WHERE schemaname='public' AND sequencename='life_services_id_seq'"
        )).scalar_one()
        assert sequence_owner == owners[0].tableowner
    payload = LifeServiceCreate(kind="bike", title="Synthetic NMAX", start_date="2026-10-01", end_date="2026-10-30",
                                publication_status="PUBLISHED", price_amount="2500000.50", owner_details="Synthetic private contact",
                                idempotency_key="migration-backup-service")
    with factory() as db:
        row, replay = create_life_service(db, user_id=user_id, actor_id=actor_id, payload=payload)
        db.commit()
        record_id = row.id
    before_restore = snapshot(engine)
    with tempfile.TemporaryDirectory(prefix="bali-life-backup-") as directory:
        backup = str(Path(directory) / "fixture.dump")
        subprocess.run(["pg_dump", "--format=custom", "--file", backup, "--dbname",
                        target.set(drivername="postgresql").render_as_string(hide_password=False)], check=True, timeout=60)
        subprocess.run(["pg_restore", "--exit-on-error", "--dbname",
                        restored.set(drivername="postgresql").render_as_string(hide_password=False), backup], check=True, timeout=60)
    assert snapshot(restore_engine) == before_restore
    with sessionmaker(bind=restore_engine, expire_on_commit=False)() as db:
        row, replay = create_life_service(db, user_id=user_id, actor_id=actor_id, payload=payload)
        assert replay and row.id == record_id and str(row.price_amount) == "2500000.50"
        following, _ = create_life_service(db, user_id=user_id, actor_id=actor_id,
                                          payload=payload.model_copy(update={"idempotency_key": "restored-sequence-check"}))
        db.commit()
        assert following.id > record_id
    print(json.dumps({"result": "PASS", "base_revision": BASE_REVISION, "life_revision": LIFE_REVISION,
                      "upgrade_downgrade_upgrade": True, "original_tables_preserved": len(original),
                      "original_data_sha256": original_hash, "backup_restore_equal": True,
                      "restored_idempotency_and_sequence": True, "runtime_owner_and_sequence": True}))
    engine.dispose()
    restore_engine.dispose()


if __name__ == "__main__":
    main()
