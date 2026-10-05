"""Add rental details without changing legacy dates, prices, or private contacts.

Revision ID: f2c8a4d6e901
Revises: e9b3d7a5c201
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op


revision = "f2c8a4d6e901"
down_revision = "e9b3d7a5c201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("life_services", sa.Column("housing_type", sa.String(16), nullable=True))
    op.add_column("life_services", sa.Column("rental_mode", sa.String(8), nullable=False, server_default="fixed"))
    op.add_column("life_services", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    op.create_check_constraint("ck_life_services_housing_type", "life_services",
                               "housing_type IS NULL OR (kind = 'housing' AND housing_type IN ('guesthouse','hotel','apartment','villa'))")
    op.create_check_constraint("ck_life_services_quantity", "life_services", "quantity > 0 AND (kind = 'bike' OR quantity = 1)")
    op.create_check_constraint("ck_life_services_rental_mode", "life_services",
                               "rental_mode IN ('fixed','monthly') AND (kind != 'insurance' OR rental_mode = 'fixed')")
    op.drop_constraint("ck_life_services_publish_complete", "life_services", type_="check")
    op.create_check_constraint("ck_life_services_publish_complete", "life_services",
                               "publication_status != 'PUBLISHED' OR "
                               "(title IS NOT NULL AND length(trim(title)) > 0 "
                               "AND (end_date IS NOT NULL OR (kind IN ('housing','bike') AND rental_mode = 'monthly')) "
                               "AND (kind = 'insurance' OR start_date IS NOT NULL))")


def downgrade() -> None:
    # A schema rollback must not silently discard real rental metadata or invent
    # an expiry for a monthly rental. Keeping this additive schema while rolling
    # back application code is preferable; export/reconcile records explicitly.
    # Serialize the guard with writes: metadata saved after an unlocked check
    # could otherwise be silently dropped by the subsequent ALTER TABLE.
    op.execute(sa.text("LOCK TABLE life_services IN ACCESS EXCLUSIVE MODE"))
    has_rental_details = op.get_bind().execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM life_services "
        "WHERE housing_type IS NOT NULL OR rental_mode != 'fixed' OR quantity != 1)"
    )).scalar_one()
    if has_rental_details:
        raise RuntimeError("Rental metadata exists; preserve/export and reconcile it before schema downgrade")
    op.drop_constraint("ck_life_services_publish_complete", "life_services", type_="check")
    op.create_check_constraint("ck_life_services_publish_complete", "life_services",
                               "publication_status != 'PUBLISHED' OR "
                               "(title IS NOT NULL AND length(trim(title)) > 0 AND end_date IS NOT NULL "
                               "AND (kind = 'insurance' OR start_date IS NOT NULL))")
    for name in ("housing_type", "quantity", "rental_mode"):
        op.drop_constraint(f"ck_life_services_{name}", "life_services", type_="check")
        op.drop_column("life_services", name)
