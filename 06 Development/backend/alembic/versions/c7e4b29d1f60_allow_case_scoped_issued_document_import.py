"""Allow explicit issued-document import grants for an existing case."""
from alembic import op
import sqlalchemy as sa


revision = "c7e4b29d1f60"
down_revision = "89d2bf05c1a7"
branch_labels = None
depends_on = None

CREDENTIALS = "visa_agent_credentials"
SCOPES = "visa_agent_scopes"


def _change_constraints(*, allow_import):
    old = "operation_mask BETWEEN 1 AND 7"
    with op.batch_alter_table(CREDENTIALS) as batch:
        batch.drop_constraint("ck_visa_agent_operations", type_="check")
        batch.create_check_constraint(
            "ck_visa_agent_operations", f"{old} OR operation_mask = 8" if allow_import else old,
        )
    with op.batch_alter_table(SCOPES) as batch:
        batch.drop_constraint("ck_visa_agent_scope_operations", type_="check")
        batch.create_check_constraint(
            "ck_visa_agent_scope_operations",
            f"{old} OR (operation_mask = 8 AND visa_case_id IS NOT NULL)" if allow_import else old,
        )


def _bound_ddl():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
        op.execute("SET LOCAL statement_timeout = '30s'")
        op.execute("LOCK TABLE visa_agent_credentials, visa_agent_scopes IN ACCESS EXCLUSIVE MODE")


def upgrade():
    _bound_ddl()
    _change_constraints(allow_import=True)


def downgrade():
    _bound_ddl()
    if op.get_bind().execute(sa.text("""
        SELECT EXISTS (SELECT 1 FROM visa_agent_credentials WHERE operation_mask = 8)
            OR EXISTS (SELECT 1 FROM visa_agent_scopes WHERE operation_mask = 8)
    """)).scalar_one():
        raise RuntimeError("Issued-document grants exist; use a code-only rollback")
    _change_constraints(allow_import=False)
