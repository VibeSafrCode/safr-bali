"""Add housing electricity and separately provisioned rental agent grants."""
from alembic import op
import sqlalchemy as sa


revision = "89d2bf05c1a7"
down_revision = "c926e71a430b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("life_services", sa.Column("electricity_account_number", sa.String(32), nullable=True))
    op.create_table(
        "rental_agent_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("issue_request_id", sa.String(36), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("client_user_id", "issue_request_id", name="uq_rental_agent_issue_request"),
    )
    op.create_index("ix_rental_agent_grants_client_user_id", "rental_agent_grants", ["client_user_id"])


def downgrade():
    op.drop_table("rental_agent_grants")
    op.drop_column("life_services", "electricity_account_number")
