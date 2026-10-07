"""add assigned_zones, w2w_inventory_snapshots and missing master_items columns

Revision ID: c7e3f89a1b2d
Revises: 9f8e7d6c5b4a
Create Date: 2026-10-07 16:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e3f89a1b2d'
down_revision: Union[str, Sequence[str], None] = '9f8e7d6c5b4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add assigned_zones to users
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assigned_zones', sa.String(length=500), nullable=True))

    # 2. Add missing columns to master_items
    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('frozen_qty', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('date_last_received', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('superseded_by', sa.String(length=100), nullable=True))

    # 3. Create w2w_inventory_snapshots table
    op.create_table(
        'w2w_inventory_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('item_code', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('bin_location', sa.String(length=100), nullable=True),
        sa.Column('system_qty', sa.Float(), nullable=False, server_default='0'),
        sa.Column('unit_cost', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['count_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('w2w_inventory_snapshots', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_w2w_inventory_snapshots_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_w2w_inventory_snapshots_item_code'), ['item_code'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('w2w_inventory_snapshots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_w2w_inventory_snapshots_item_code'))
        batch_op.drop_index(batch_op.f('ix_w2w_inventory_snapshots_session_id'))
    op.drop_table('w2w_inventory_snapshots')

    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.drop_column('superseded_by')
        batch_op.drop_column('date_last_received')
        batch_op.drop_column('frozen_qty')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('assigned_zones')
