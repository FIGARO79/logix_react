"""add_saved_grn_reconciliations_tables

Revision ID: 9fbfc21677f9
Revises: d81f26fc1cc4
Create Date: 2026-08-17 14:22:19.582878

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9fbfc21677f9'
down_revision: Union[str, Sequence[str], None] = 'd81f26fc1cc4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
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
    op.create_index(op.f('ix_saved_grn_reconciliations_grn_number'), 'saved_grn_reconciliations', ['grn_number'], unique=False)
    op.create_index(op.f('ix_saved_grn_reconciliations_import_reference'), 'saved_grn_reconciliations', ['import_reference'], unique=False)

    op.create_table(
        'saved_grn_reconciliation_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reconciliation_id', sa.Integer(), nullable=False),
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
    op.create_index(op.f('ix_saved_grn_reconciliation_items_reconciliation_id'), 'saved_grn_reconciliation_items', ['reconciliation_id'], unique=False)
    op.create_index(op.f('ix_saved_grn_reconciliation_items_item_code'), 'saved_grn_reconciliation_items', ['item_code'], unique=False)

    # 3. Limpieza automática de los registros históricos antiguos de snapshots
    try:
        op.execute("DELETE FROM reconciliation_history")
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_saved_grn_reconciliation_items_item_code'), table_name='saved_grn_reconciliation_items')
    op.drop_index(op.f('ix_saved_grn_reconciliation_items_reconciliation_id'), table_name='saved_grn_reconciliation_items')
    op.drop_table('saved_grn_reconciliation_items')
    op.drop_index(op.f('ix_saved_grn_reconciliations_import_reference'), table_name='saved_grn_reconciliations')
    op.drop_index(op.f('ix_saved_grn_reconciliations_grn_number'), table_name='saved_grn_reconciliations')
    op.drop_table('saved_grn_reconciliations')
