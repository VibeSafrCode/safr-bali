"""Add stable public referral aliases only; no customer or graph backfill."""
from alembic import op
import sqlalchemy as sa

revision = "b6a1d3f0e214"
down_revision = "a1f9c3d7e620"
branch_labels = ("public_referral_aliases",)
depends_on = None


def upgrade():
    op.create_table(
        "referral_public_aliases",
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("code", name="referral_public_aliases_pkey"),
        sa.UniqueConstraint("user_id", name="uq_referral_public_aliases_user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("length(code) = 10 AND substr(code, 1, 2) = 'r_' AND substr(code, 3, 8) = upper(substr(code, 3, 8))", name="ck_referral_public_aliases_format"),
    )


def downgrade():
    # Once issued, aliases are durable public links. Never destroy their owners
    # during an ordinary application rollback; rollback disables issuance only.
    # Forward-only even when a read reports zero: a concurrent issuer could
    # otherwise commit between an empty check and DROP. No online drop path.
    raise RuntimeError("Public referral aliases must be retained; disable issuance instead")
