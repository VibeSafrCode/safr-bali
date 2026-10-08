"""Synthetic workflow persistence and constraint migration proof; no external DB."""

from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from tests.test_visa_lifecycle import api, database, enable_stage1, seed
from app.core.visa_workflow_statuses import EXTERNAL_STATUS_CODES, SERVICE_STATUS_CODES
from app.models.admin_safety import StaffGrant
from app.models.payment import Payment
from app.models.user import User
from app.models.visa_lifecycle import VisaCase, VisaCaseAssignment, VisaEvent, VisaNotificationDelivery, VisaProcess


@pytest.fixture
def workflow(monkeypatch):
    db = database()
    admin, client, case = seed(db)
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    enable_stage1(monkeypatch)
    monkeypatch.setattr(api, "SessionLocal", factory)
    yield db, factory, admin, client, case
    db.close()
    db.bind.dispose()


@pytest.mark.parametrize("status", SERVICE_STATUS_CODES)
def test_all_service_codes_save_and_read_without_lifecycle_or_payment_side_effects(workflow, status):
    db, factory, admin, _, case = workflow
    original_dates = (case.entry_deadline, case.stay_end, case.entered_on)
    result = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
        service_status=status, reason="Synthetic status selection", expected_version=1,
        idempotency_key=f"service-code-{status}",
    ), admin)
    assert result["service_status"] == status
    with factory() as check:
        saved = check.get(VisaCase, case.id)
        assert saved.service_status == status
        assert saved.lifecycle_status == "NOT_ISSUED"
        assert (saved.entry_deadline, saved.stay_end, saved.entered_on) == original_dates
        assert check.query(Payment).count() == 0


@pytest.mark.parametrize("status", EXTERNAL_STATUS_CODES)
def test_all_external_codes_save_and_read_original_text_without_case_side_effects(workflow, status):
    _, factory, admin, client, case = workflow
    original_dates = (case.entry_deadline, case.stay_end, case.entered_on)
    raw = f" Original provider wording: {status}\nбез нормализации "
    result = api.admin_process(case.id, api.ProcessCreate(
        process_type="APPLICATION", external_status=status, raw_external_status=raw,
        reason="Synthetic external stage",
    ), admin)
    assert result["external_status"] == status
    assert result["raw_external_status"] == raw
    with factory() as check:
        process = check.get(VisaProcess, result["id"])
        saved = check.get(VisaCase, case.id)
        assert (process.external_status, process.raw_external_status) == (status, raw)
        assert (saved.service_status, saved.lifecycle_status) == ("PURCHASED", "NOT_ISSUED")
        assert (saved.entry_deadline, saved.stay_end, saved.entered_on) == original_dates
        assert check.query(Payment).count() == 0
        card = api._card(check, saved, client_view=True, timeline=True)
        assert card["current_process"]["external_status"] == status
        assert "raw_external_status" not in json.dumps(card, default=str)


def test_aggregate_preserves_omitted_raw_and_audits_raw_only_changes_and_explicit_clear(workflow):
    db, factory, admin, _, case = workflow
    case.publication_status = "PUBLISHED"
    db.commit()
    original = "Under Assessment\n  ORIGINAL wording "
    created = api.admin_process(case.id, api.ProcessCreate(
        process_type="APPLICATION", external_status="PROCESSING", raw_external_status=original,
        reason="Synthetic source wording",
    ), admin)
    process_id = created["id"]

    def update(version, key, **raw_fields):
        return api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
            expected_version=version, reason="Synthetic original wording update", idempotency_key=key,
            notify_client=True,
            processes=[api.ProcessAggregateItem(
                id=process_id, process_type="APPLICATION", external_status="PROCESSING", **raw_fields,
            )],
        ), admin)

    first = update(1, "raw-omitted-0001")
    assert first["processes"][0]["raw_external_status"] == original
    replacement = "Checking Additional Documents\n new original "
    second = update(2, "raw-changed-0002", raw_external_status=replacement)
    assert second["processes"][0]["raw_external_status"] == replacement
    replay = update(2, "raw-changed-0002", raw_external_status=replacement)
    assert replay["version"] == second["version"] == 3
    with factory() as check:
        event = check.query(VisaEvent).filter_by(idempotency_key="raw-changed-0002").one()
        assert event.visibility == "INTERNAL"
        assert event.before["processes"][0]["external_status"] == event.after["processes"][0]["external_status"] == "PROCESSING"
        assert event.before["processes"][0]["raw_external_status"] == original
        assert event.after["processes"][0]["raw_external_status"] == replacement
        assert check.get(VisaProcess, process_id).last_changed_at is not None
    cleared = update(3, "raw-cleared-0003", raw_external_status=None)
    assert cleared["processes"][0]["raw_external_status"] is None
    with factory() as check:
        assert check.get(VisaProcess, process_id).raw_external_status is None
        assert check.query(VisaEvent).filter_by(idempotency_key="raw-changed-0002").count() == 1
        client_payloads = json.dumps([delivery.payload for delivery in check.query(VisaNotificationDelivery).all()])
        assert "raw_external_status" not in client_payloads
        assert original not in client_payloads and replacement not in client_payloads


@pytest.mark.parametrize("column,invalid", [
    ("service_status", "IN_PROGRESS"), ("service_status", "UNRECOGNIZED"),
    ("external_status", "IN_PROGRESS"), ("external_status", "UNRECOGNIZED"),
])
def test_unknown_codes_rejected_by_api_and_database(workflow, column, invalid):
    _, factory, admin, _, case = workflow
    process = api.admin_process(case.id, api.ProcessCreate(process_type="APPLICATION", reason="Synthetic baseline"), admin)
    if column == "service_status":
        payload = api.VisaAggregateUpdate(service_status=invalid, reason="Synthetic invalid code", expected_version=1)
    else:
        payload = api.VisaAggregateUpdate(reason="Synthetic invalid code", expected_version=1, processes=[
            api.ProcessAggregateItem(id=process["id"], process_type="APPLICATION", external_status=invalid),
        ])
    with pytest.raises(api.HTTPException) as error:
        api.admin_update_aggregate(case.id, payload, admin)
    assert error.value.status_code == 422
    model = VisaCase if column == "service_status" else VisaProcess
    row_id = case.id if column == "service_status" else process["id"]
    with factory() as check:
        with pytest.raises(sa.exc.IntegrityError):
            check.execute(sa.update(model).where(model.id == row_id).values({column: invalid}))
            check.commit()
        check.rollback()
        assert check.get(VisaCase, case.id).version == 1
        assert check.get(VisaProcess, process["id"]).external_status == "UNKNOWN"


def test_assigned_manager_can_follow_new_stages_but_not_reopen_completed_case(workflow):
    db, factory, root, _, case = workflow
    manager = User(telegram_id=300, ref_code="workflow-manager", role="visa_manager", status="active")
    db.add(manager)
    db.flush()
    grant = StaffGrant(user_id=manager.id, role_code="visa_manager", granted_by_admin_id=root.id,
                       grant_reason="Synthetic grant", grant_idempotency_key="workflow-manager-grant")
    db.add(grant)
    db.flush()
    db.add(VisaCaseAssignment(visa_case_id=case.id, staff_user_id=manager.id, staff_grant_id=grant.id,
                             assigned_by_admin_id=root.id, assignment_reason="Synthetic assignment",
                             assignment_idempotency_key="workflow-manager-assignment"))
    case.service_status = "CLIENT_REQUESTED"
    db.commit()
    stages = (
        "PURCHASED", "DOCUMENTS_REQUIRED", "DOCUMENTS_RECEIVED", "UNDER_REVIEW", "REVISION_REQUIRED",
        "UNDER_REVIEW", "READY_TO_SUBMIT", "SUBMITTED", "PROCESSING", "DELIVERED", "COMPLETED",
    )
    for version, status in enumerate(stages, start=1):
        result = api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
            service_status=status, expected_version=version, reason="Synthetic manager workflow",
            idempotency_key=f"manager-workflow-{version}",
        ), manager)
        assert result["service_status"] == status
        assert result["lifecycle_status"] == "NOT_ISSUED"
    with pytest.raises(api.HTTPException) as error:
        api.admin_update_aggregate(case.id, api.VisaAggregateUpdate(
            service_status="UNDER_REVIEW", expected_version=len(stages) + 1,
            reason="Synthetic forbidden reopen",
        ), manager)
    assert error.value.status_code == 422
    with factory() as check:
        assert check.get(VisaCase, case.id).service_status == "COMPLETED"
        assert check.query(Payment).count() == 0


def revision():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/f3a9d2c6b810_expand_visa_workflow_statuses.py"
    spec = spec_from_file_location(path.stem, path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def migration_db():
    migration = revision()
    metadata = sa.MetaData()
    cases = sa.Table("visa_cases", metadata,
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("service_status", sa.String(32), nullable=False),
        sa.Column("lifecycle_status", sa.String(32), nullable=False), sa.Column("marker", sa.Text),
        sa.CheckConstraint(migration._check("service_status", migration.OLD_SERVICE_CODES), name="ck_visa_case_service_status"),
        sa.CheckConstraint("lifecycle_status IN ('NOT_ISSUED','ACTIVE')", name="ck_fixture_lifecycle"))
    processes = sa.Table("visa_processes", metadata,
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("visa_case_id", sa.Integer, sa.ForeignKey("visa_cases.id")),
        sa.Column("external_status", sa.String(32), nullable=False), sa.Column("raw_external_status", sa.Text),
        sa.CheckConstraint(migration._check("external_status", migration.OLD_EXTERNAL_CODES), name="ck_visa_process_external_status"))
    sa.Index("ix_fixture_process_case", processes.c.visa_case_id)
    unrelated = sa.Table("unrelated_fixture", metadata, sa.Column("id", sa.Integer, primary_key=True), sa.Column("marker", sa.Text))
    engine = sa.create_engine("sqlite:///:memory:")
    metadata.create_all(engine)
    with engine.begin() as connection:
        for index, status in enumerate(migration.OLD_SERVICE_CODES, start=1):
            connection.execute(cases.insert().values(id=index, service_status=status, lifecycle_status="NOT_ISSUED", marker=f"legacy-{index}"))
        for index, status in enumerate(migration.OLD_EXTERNAL_CODES, start=1):
            connection.execute(processes.insert().values(id=index, visa_case_id=index, external_status=status, raw_external_status=f" Original {status}\n "))
        connection.execute(unrelated.insert().values(id=1, marker="preserve-unrelated"))
        with Operations.context(MigrationContext.configure(connection)):
            yield connection, migration
    engine.dispose()


def snapshot(connection):
    return {
        table: connection.execute(sa.text(f'SELECT * FROM "{table}" ORDER BY id')).all()
        for table in ("visa_cases", "visa_processes", "unrelated_fixture")
    }


def test_upgrade_downgrade_upgrade_preserves_every_legacy_row_and_new_schema_codes(migration_db):
    connection, migration = migration_db
    original = snapshot(connection)
    assert set(migration.SERVICE_CODES) == set(SERVICE_STATUS_CODES)
    assert set(migration.EXTERNAL_CODES) == set(EXTERNAL_STATUS_CODES)
    for step in (migration.upgrade, migration.downgrade, migration.upgrade):
        step()
        assert snapshot(connection) == original
        assert connection.execute(sa.text("PRAGMA foreign_key_check")).all() == []
        assert sa.inspect(connection).get_indexes("visa_processes")[0]["name"] == "ix_fixture_process_case"
    for status in SERVICE_STATUS_CODES:
        connection.execute(sa.text("UPDATE visa_cases SET service_status=:status WHERE id=1"), {"status": status})
    for status in EXTERNAL_STATUS_CODES:
        connection.execute(sa.text("UPDATE visa_processes SET external_status=:status WHERE id=1"), {"status": status})
    for table, column in (("visa_cases", "service_status"), ("visa_processes", "external_status")):
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(sa.text(f"UPDATE {table} SET {column}='IN_PROGRESS' WHERE id=1"))


@pytest.mark.parametrize("table,column,new_code", [
    *[("visa_cases", "service_status", code) for code in set(SERVICE_STATUS_CODES) - set(revision().OLD_SERVICE_CODES)],
    *[("visa_processes", "external_status", code) for code in set(EXTERNAL_STATUS_CODES) - set(revision().OLD_EXTERNAL_CODES)],
])
def test_downgrade_refuses_each_new_code_before_schema_or_row_changes(migration_db, table, column, new_code):
    connection, migration = migration_db
    migration.upgrade()
    connection.execute(sa.text(f"UPDATE {table} SET {column}=:code WHERE id=1"), {"code": new_code})
    before = snapshot(connection)
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    sa.event.listen(connection, "before_cursor_execute", record)
    try:
        with pytest.raises(RuntimeError, match="Expanded visa workflow statuses exist"):
            migration.downgrade()
    finally:
        sa.event.remove(connection, "before_cursor_execute", record)
    assert len(statements) == 1 and statements[0].startswith("SELECT EXISTS")
    assert snapshot(connection) == before
    # The expanded check still accepts an additional new value after rejection.
    connection.execute(sa.text(f"UPDATE {table} SET {column}=:code WHERE id=1"), {"code": new_code})


def test_postgres_upgrade_emits_constraint_only_ddl_and_downgrade_locks_before_guard(monkeypatch):
    migration = revision()
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration.upgrade()
    sql = output.getvalue()
    assert sql.count("ALTER TABLE") == 4
    assert "CREATE TABLE" not in sql and "DROP TABLE" not in sql and "UPDATE " not in sql
    assert "ADD CONSTRAINT ck_visa_case_service_status CHECK" in sql
    assert "ADD CONSTRAINT ck_visa_process_external_status CHECK" in sql
    calls = []
    bind = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    def execute(statement):
        calls.append(str(statement))
        return SimpleNamespace(scalar_one=lambda: True)

    bind.execute = execute
    op = SimpleNamespace(get_bind=lambda: bind, execute=execute,
                         drop_constraint=Mock(), create_check_constraint=Mock())
    monkeypatch.setattr(migration, "op", op)
    with pytest.raises(RuntimeError, match="Expanded visa workflow statuses exist"):
        migration.downgrade()
    assert calls[:2] == ["SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '30s'"]
    assert calls[2] == "LOCK TABLE visa_cases, visa_processes IN ACCESS EXCLUSIVE MODE"
    assert calls[3].startswith("SELECT EXISTS")
    op.drop_constraint.assert_not_called()
    op.create_check_constraint.assert_not_called()
