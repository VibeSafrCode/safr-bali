"""Add finite visa-agent identity and unique submission binding, no grants."""
from alembic import op
import sqlalchemy as sa

revision = 'f13a7c5d920b'
down_revision = 'e73b2c9a610f'
branch_labels = None
depends_on = None


def user(name, nullable=False):
    return sa.Column(name, sa.Integer(), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=nullable)


def revocation_columns():
    return (sa.Column('revoked_at', sa.DateTime(timezone=True)), user('revoked_by_user_id', True),
            sa.Column('revoke_reason', sa.String(300)))


def upgrade():
    op.create_table('visa_agent_credentials', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False), sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('provisioning_key', sa.String(64), nullable=False, unique=True),
        sa.Column('operation_mask', sa.Integer(), nullable=False), sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        user('created_by_user_id'), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        *revocation_columns(), sa.CheckConstraint('operation_mask BETWEEN 1 AND 7', name='ck_visa_agent_operations'))
    op.create_table('visa_agent_scopes', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('credential_id', sa.Integer(), sa.ForeignKey('visa_agent_credentials.id', ondelete='RESTRICT'), nullable=False),
        user('client_user_id'), sa.Column('visa_case_id', sa.Integer(), sa.ForeignKey('visa_cases.id', ondelete='RESTRICT')),
        user('responsible_user_id'), sa.Column('operation_mask', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False), user('granted_by_user_id'),
        sa.Column('grant_reason', sa.String(300), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        *revocation_columns(), sa.CheckConstraint('operation_mask BETWEEN 1 AND 7', name='ck_visa_agent_scope_operations'))
    for name, columns, condition in (
        ('uq_visa_agent_client_scope', ['credential_id', 'client_user_id'], 'visa_case_id IS NULL AND revoked_at IS NULL'),
        ('uq_visa_agent_case_scope', ['credential_id', 'visa_case_id'], 'visa_case_id IS NOT NULL AND revoked_at IS NULL')):
        op.create_index(name, 'visa_agent_scopes', columns, unique=True, postgresql_where=sa.text(condition), sqlite_where=sa.text(condition))
    op.create_table('visa_agent_submissions', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('provider', sa.String(32), nullable=False), sa.Column('country_code', sa.String(2), nullable=False),
        sa.Column('application_fingerprint', sa.String(80), nullable=False), sa.Column('lookup_key_id', sa.String(64), nullable=False),
        user('client_user_id'), sa.Column('visa_type_id', sa.Integer(), sa.ForeignKey('visa_types.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('visa_case_id', sa.Integer(), sa.ForeignKey('visa_cases.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('visa_process_id', sa.Integer(), sa.ForeignKey('visa_processes.id', ondelete='RESTRICT'), nullable=False, unique=True),
        sa.Column('credential_id', sa.Integer(), sa.ForeignKey('visa_agent_credentials.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('scope_id', sa.Integer(), sa.ForeignKey('visa_agent_scopes.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('provider', 'country_code', 'application_fingerprint', name='uq_visa_agent_application'))
    op.create_index('ix_visa_agent_submissions_visa_case_id', 'visa_agent_submissions', ['visa_case_id'])
    with op.batch_alter_table('visa_events') as batch:
        batch.add_column(sa.Column('actor_agent_credential_id', sa.Integer()))
        batch.create_foreign_key('fk_visa_event_agent', 'visa_agent_credentials', ['actor_agent_credential_id'], ['id'], ondelete='RESTRICT')
        batch.create_check_constraint('ck_visa_event_machine_actor', "actor_agent_credential_id IS NULL OR (actor_user_id IS NULL AND source = 'visa_agent')")


def downgrade():
    # Never discard durable machine attribution or grants as a code rollback.
    raise RuntimeError('Visa-agent identity is additive; restore code without deleting its audit history')
