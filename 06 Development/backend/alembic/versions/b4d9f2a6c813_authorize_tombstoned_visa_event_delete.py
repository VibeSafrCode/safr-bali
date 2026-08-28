"""authorize tombstoned visa event deletion

Revision ID: b4d9f2a6c813
Revises: a3c8e1f4b726
Create Date: 2026-08-28

Visa events remain append-only for every ordinary UPDATE or DELETE.  The only
exception is a transaction that has already inserted an actor-bound permanent
delete tombstone for the exact VisaCase and passes that tombstone id through a
transaction-local setting.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b4d9f2a6c813"
down_revision: Union[str, Sequence[str], None] = "a3c8e1f4b726"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION reject_visa_event_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE deletion_tombstone_id integer;
        BEGIN
          IF TG_OP = 'DELETE' THEN
            deletion_tombstone_id := NULLIF(
              current_setting('safr.visa_delete_tombstone_id', true), ''
            )::integer;
            IF deletion_tombstone_id IS NOT NULL AND EXISTS (
              SELECT 1
              FROM visa_case_deletion_tombstones tombstone
              WHERE tombstone.id = deletion_tombstone_id
                AND tombstone.visa_case_id = OLD.visa_case_id
            ) THEN
              RETURN OLD;
            END IF;
          END IF;
          RAISE EXCEPTION 'visa_events is append-only';
        END $$
    """))


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(sa.text("""
        CREATE OR REPLACE FUNCTION reject_visa_event_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'visa_events is append-only';
        END $$
    """))
