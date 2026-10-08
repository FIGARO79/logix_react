"""add saved_grn_reconciliations and saved_grn_reconciliation_items

Revision ID: d9a1b2c3d4e5
Revises: c7e3f89a1b2d
Create Date: 2026-10-07 19:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9a1b2c3d4e5'
down_revision: Union[str, Sequence[str], None] = 'c7e3f89a1b2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. saved_grn_reconciliations
    op.create_table(
        'saved_grn_reconciliations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('grn_number', sa.String(length=100), nullable=False),
        sa.Column('import_reference', sa.String(length=100), nullable=False),
        sa.Column('waybill', sa.String(length=100), nullable=True),
        sa.Column('total_lines', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_expected', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_received', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_difference', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='CONCILIADO_OK'),
        sa.Column('reconciled_by', sa.String(length=100), nullable=False, server_default='admin'),
        sa.Column('reconciled_at', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('saved_grn_reconciliations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_saved_grn_reconciliations_grn_number'), ['grn_number'], unique=False)
        batch_op.create_index(batch_op.f('ix_saved_grn_reconciliations_import_reference'), ['import_reference'], unique=False)

    # 2. saved_grn_reconciliation_items
    op.create_table(
        'saved_grn_reconciliation_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reconciliation_id', sa.Integer(), nullable=True),
        sa.Column('grn_number', sa.String(length=100), nullable=False),
        sa.Column('import_reference', sa.String(length=100), nullable=False),
        sa.Column('waybill', sa.String(length=100), nullable=True),
        sa.Column('order_line', sa.String(length=50), nullable=True),
        sa.Column('item_code', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('location', sa.String(length=100), nullable=True),
        sa.Column('relocated_bin', sa.String(length=100), nullable=True),
        sa.Column('qty_expected', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('qty_received', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('difference', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('difference_reason', sa.String(length=200), nullable=True),
        sa.Column('operator_comment', sa.Text(), nullable=True),
        sa.Column('reconciled_at', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['reconciliation_id'], ['saved_grn_reconciliations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('saved_grn_reconciliation_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_saved_grn_reconciliation_items_reconciliation_id'), ['reconciliation_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_saved_grn_reconciliation_items_item_code'), ['item_code'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('saved_grn_reconciliation_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_saved_grn_reconciliation_items_item_code'))
        batch_op.drop_index(batch_op.f('ix_saved_grn_reconciliation_items_reconciliation_id'))
    op.drop_table('saved_grn_reconciliation_items')

    with op.batch_alter_table('saved_grn_reconciliations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_saved_grn_reconciliations_import_reference'))
        batch_op.drop_index(batch_op.f('ix_saved_grn_reconciliations_grn_number'))
    op.drop_table('saved_grn_reconciliations')
