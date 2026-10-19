"""Add explicit client UI preference; no contact-language/profile backfill.

Migration-first deployment; code rollback retains additive columns and values.
The current parent includes Yoga changes: verify actual DB revision and separate
authority before executing this chain anywhere outside a synthetic local test.
"""

from alembic import op
import sqlalchemy as sa


revision = "c52e8b6d9041"
down_revision = "a1f9c3d7e620"
branch_labels = None
depends_on = None


def _guard():
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("UI preference migration requires PostgreSQL")
    op.execute("SET LOCAL lock_timeout = '1s'")
    op.execute("SET LOCAL statement_timeout = '3s'")


def upgrade():
    _guard()
    op.add_column("users", sa.Column("client_ui_locale", sa.String(10), nullable=True))
    op.add_column("users", sa.Column("client_ui_locale_revision", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_users_client_ui_locale_supported", "users",
        "client_ui_locale IS NULL OR client_ui_locale IN ('ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar')")
    op.create_check_constraint("ck_users_client_ui_locale_revision", "users",
        "client_ui_locale_revision >= 0 AND client_ui_locale_revision <= 2147483647")


def downgrade():
    _guard()
    op.execute("LOCK TABLE users IN ACCESS EXCLUSIVE MODE")
    if op.get_bind().execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM users WHERE client_ui_locale IS NOT NULL OR client_ui_locale_revision <> 0)"
    )).scalar():
        raise RuntimeError("Retain saved UI preferences; roll back code without dropping columns")
    op.drop_constraint("ck_users_client_ui_locale_revision", "users", type_="check")
    op.drop_constraint("ck_users_client_ui_locale_supported", "users", type_="check")
    op.drop_column("users", "client_ui_locale_revision")
    op.drop_column("users", "client_ui_locale")
