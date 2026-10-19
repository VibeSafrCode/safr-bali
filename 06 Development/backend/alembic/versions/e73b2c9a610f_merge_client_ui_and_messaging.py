"""Join the existing UI-preference and per-brand messaging histories.

Neither parent revision is rewritten. Both additive parent upgrades must have
completed before this no-op merge; production execution has its own release gate.
"""

revision = "e73b2c9a610f"
down_revision = ("c52e8b6d9041", "d4082b5a16c9")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
