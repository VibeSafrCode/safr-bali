"""Expand normalized workflow checks without rewriting any stored statuses.

Revision ID: f3a9d2c6b810
Revises: a7e4c9d2f105
"""

from alembic import op
import sqlalchemy as sa


revision = "f3a9d2c6b810"
down_revision = "a7e4c9d2f105"
branch_labels = None
depends_on = None

# Pin historical values here: migrations must not depend on runtime JSON.
OLD_SERVICE_CODES = (
    "PURCHASED", "DOCUMENTS_REQUIRED", "DOCUMENTS_RECEIVED", "SUBMITTED",
    "WAITING_PAYMENT", "PAID", "PROCESSING", "ACTION_REQUIRED", "COMPLETED", "CANCELLED",
)
OLD_EXTERNAL_CODES = (
    "UNKNOWN", "WAITING_PAYMENT", "PAID", "SUBMITTED", "PROCESSING",
    "ACTION_REQUIRED", "BIOMETRICS_REQUIRED", "APPROVED", "REJECTED", "CANCELLED",
)
SERVICE_CODES = OLD_SERVICE_CODES + (
    "CLIENT_REQUESTED", "UNDER_REVIEW", "REVISION_REQUIRED", "READY_TO_SUBMIT", "DELIVERED",
)
EXTERNAL_CODES = OLD_EXTERNAL_CODES + (
    "WAITING_VERIFICATION", "INTERVIEW_REQUIRED", "WAITING_OFFICER_CONFIRMATION",
    "RECOMMENDED_APPROVAL", "WAITING_DECISION", "AWAITING_ISSUANCE", "ISSUED", "FINALISED",
)


def _check(column: str, codes: tuple[str, ...]) -> str:
    return column + " IN (" + ",".join(f"'{code}'" for code in codes) + ")"


def _dialect() -> str:
    dialect = op.get_bind().dialect.name
    if dialect not in {"postgresql", "sqlite"}:
        raise RuntimeError("Visa workflow migration supports PostgreSQL and isolated SQLite tests")
    return dialect


def _replace_checks(service_codes: tuple[str, ...], external_codes: tuple[str, ...]) -> None:
    checks = (
        ("visa_cases", "ck_visa_case_service_status", "service_status", service_codes),
        ("visa_processes", "ck_visa_process_external_status", "external_status", external_codes),
    )
    for table, name, column, codes in checks:
        if _dialect() == "sqlite":
            # SQLite has no ALTER CHECK; this branch is for isolated local tests.
            with op.batch_alter_table(table) as batch:
                batch.drop_constraint(name, type_="check")
                batch.create_check_constraint(name, _check(column, codes))
        else:
            # PostgreSQL changes only the two checks, never copies/drops tables.
            op.drop_constraint(name, table, type_="check")
            op.create_check_constraint(name, table, _check(column, codes))


def upgrade() -> None:
    if _dialect() == "postgresql":
        op.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
        op.execute(sa.text("SET LOCAL statement_timeout = '30s'"))
    _replace_checks(SERVICE_CODES, EXTERNAL_CODES)


def downgrade() -> None:
    if _dialect() == "postgresql":
        op.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
        op.execute(sa.text("SET LOCAL statement_timeout = '30s'"))
        # Serialize both the preflight and constraint changes with all writers.
        op.execute(sa.text("LOCK TABLE visa_cases, visa_processes IN ACCESS EXCLUSIVE MODE"))
    incompatible = op.get_bind().execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM visa_cases WHERE NOT ("
        + _check("service_status", OLD_SERVICE_CODES)
        + ")) OR EXISTS (SELECT 1 FROM visa_processes WHERE NOT ("
        + _check("external_status", OLD_EXTERNAL_CODES)
        + "))"
    )).scalar_one()
    if incompatible:
        raise RuntimeError(
            "Expanded visa workflow statuses exist; retain the schema until records are explicitly reconciled"
        )
    _replace_checks(OLD_SERVICE_CODES, OLD_EXTERNAL_CODES)
