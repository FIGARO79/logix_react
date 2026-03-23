"""restore missing cycle_count_recordings table

Revision ID: a1e675b2b9dd
Revises: c03712f69631
Create Date: 2026-01-11 16:49:20.599263

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1e675b2b9dd'
down_revision: Union[str, Sequence[str], None] = 'c03712f69631'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_tables = set(inspector.get_table_names())

    # Crear tabla solo si no existe (idempotente para despliegues limpios)
    if 'cycle_count_recordings' not in existing_tables:
        op.create_table('cycle_count_recordings',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('planned_date', sa.String(length=50), nullable=False),
            sa.Column('executed_date', sa.String(length=50), nullable=False),
            sa.Column('item_code', sa.String(length=100), nullable=False),
            sa.Column('item_description', sa.String(length=255), nullable=True),
            sa.Column('bin_location', sa.String(length=100), nullable=True),
            sa.Column('system_qty', sa.Integer(), nullable=False),
            sa.Column('physical_qty', sa.Integer(), nullable=False),
            sa.Column('difference', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(length=100), nullable=False),
            sa.Column('abc_code', sa.String(length=10), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('cycle_count_recordings', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_cycle_count_recordings_item_code'), ['item_code'], unique=False)

    # Remover columna solo si existe
    if 'logs' in existing_tables:
        log_columns = {c['name'] for c in inspector.get_columns('logs')}
        if 'observaciones' in log_columns:
            with op.batch_alter_table('logs', schema=None) as batch_op:
                batch_op.drop_column('observaciones')

    # Ajustar índices solo si aplica
    if 'picking_package_items' in existing_tables:
        idx_names = {idx['name'] for idx in inspector.get_indexes('picking_package_items')}
        with op.batch_alter_table('picking_package_items', schema=None) as batch_op:
            if 'idx_package_items_audit_id' in idx_names:
                batch_op.drop_index('idx_package_items_audit_id')
            if 'ix_picking_package_items_audit_id' not in idx_names:
                batch_op.create_index(batch_op.f('ix_picking_package_items_audit_id'), ['audit_id'], unique=False)

    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'picking_package_items' in existing_tables:
        idx_names = {idx['name'] for idx in inspector.get_indexes('picking_package_items')}
        with op.batch_alter_table('picking_package_items', schema=None) as batch_op:
            if 'ix_picking_package_items_audit_id' in idx_names:
                batch_op.drop_index(batch_op.f('ix_picking_package_items_audit_id'))
            if 'idx_package_items_audit_id' not in idx_names:
                batch_op.create_index(batch_op.f('idx_package_items_audit_id'), ['audit_id'], unique=False)

    if 'logs' in existing_tables:
        log_columns = {c['name'] for c in inspector.get_columns('logs')}
        if 'observaciones' not in log_columns:
            with op.batch_alter_table('logs', schema=None) as batch_op:
                batch_op.add_column(sa.Column('observaciones', sa.VARCHAR(length=500), nullable=True))

    if 'cycle_count_recordings' in existing_tables:
        idx_names = {idx['name'] for idx in inspector.get_indexes('cycle_count_recordings')}
        with op.batch_alter_table('cycle_count_recordings', schema=None) as batch_op:
            if 'ix_cycle_count_recordings_item_code' in idx_names:
                batch_op.drop_index(batch_op.f('ix_cycle_count_recordings_item_code'))
        op.drop_table('cycle_count_recordings')
    # ### end Alembic commands ###
