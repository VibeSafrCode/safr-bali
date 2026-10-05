"""Support named other client services without changing existing records.

Revision ID: c8e3f7a1d502
Revises: b7d2e6a9c410
"""

import sqlalchemy as sa
from alembic import op


revision = "c8e3f7a1d502"
down_revision = "b7d2e6a9c410"
branch_labels = None
depends_on = None


PREVIOUS_CHECKS = {
    "ck_life_services_kind": "kind IN ('housing','bike','insurance')",
    "ck_life_services_quantity": "quantity > 0 AND (kind = 'bike' OR quantity = 1)",
    "ck_life_services_publish_complete": (
        "publication_status != 'PUBLISHED' OR "
        "(title IS NOT NULL AND length(trim(title)) > 0 "
        "AND (end_date IS NOT NULL OR (kind IN ('housing','bike') AND rental_mode = 'monthly')) "
        "AND (kind = 'insurance' OR start_date IS NOT NULL))"
    ),
}
OTHER_CHECKS = {
    "ck_life_services_kind": "kind IN ('housing','bike','insurance','other')",
    "ck_life_services_quantity": "quantity > 0 AND (kind IN ('bike','other') OR quantity = 1)",
    "ck_life_services_publish_complete": (
        "publication_status != 'PUBLISHED' OR "
        "(title IS NOT NULL AND length(trim(title)) > 0 "
        "AND (kind = 'other' OR "
        "((end_date IS NOT NULL OR (kind IN ('housing','bike') AND rental_mode = 'monthly')) "
        "AND (kind = 'insurance' OR start_date IS NOT NULL))))"
    ),
}


def upgrade() -> None:
    for name, condition in OTHER_CHECKS.items():
        op.drop_constraint(name, "life_services", type_="check")
        op.create_check_constraint(name, "life_services", condition)


def downgrade() -> None:
    # Serialize the guard with writers. A schema rollback must never discard or
    # disguise an other service, including drafts, hidden and archived records.
    op.execute(sa.text("LOCK TABLE life_services IN ACCESS EXCLUSIVE MODE"))
    used = op.get_bind().execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM life_services WHERE kind = 'other')"
    )).scalar_one()
    if used:
        raise RuntimeError("Other service records exist; preserve/export and reconcile them before schema downgrade")
    for name, condition in PREVIOUS_CHECKS.items():
        op.drop_constraint(name, "life_services", type_="check")
        op.create_check_constraint(name, "life_services", condition)
