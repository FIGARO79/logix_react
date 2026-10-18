"""add_composite_indexes

Revision ID: 20261018_add_composite_indexes
Revises: 20260915_expand_master_item_cost
Create Date: 2026-10-18 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20261018_add_composite_indexes'
down_revision: Union[str, Sequence[str], None] = '20260915_expand_master_item_cost'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def index_exists(table_name: str, index_name: str) -> bool:
    """Verifica si un índice ya existe en la tabla para prevenir errores de clave duplicada."""
    try:
        bind = op.get_bind()
        insp = sa.inspect(bind)
        indexes = [i['name'] for i in insp.get_indexes(table_name)]
        return index_name in indexes
    except Exception:
        return False


def upgrade() -> None:
    """Crea índices compuestos clave para optimizar búsquedas frecuentes."""
    # 1. Tabla logs: búsqueda por (importReference, itemCode) y (importReference, archived_at)
    with op.batch_alter_table('logs', schema=None) as batch_op:
        if not index_exists('logs', 'idx_logs_import_item'):
            batch_op.create_index('idx_logs_import_item', ['importReference', 'itemCode'], unique=False)
        if not index_exists('logs', 'idx_logs_import_archived'):
            batch_op.create_index('idx_logs_import_archived', ['importReference', 'archived_at'], unique=False)

    # 2. Tabla session_locations: búsqueda por (session_id, location_code)
    with op.batch_alter_table('session_locations', schema=None) as batch_op:
        if not index_exists('session_locations', 'idx_session_locations_session_code'):
            batch_op.create_index('idx_session_locations_session_code', ['session_id', 'location_code'], unique=False)

    # 3. Tabla recount_list: búsqueda por (item_code, stage_to_count)
    with op.batch_alter_table('recount_list', schema=None) as batch_op:
        if not index_exists('recount_list', 'idx_recount_item_stage'):
            batch_op.create_index('idx_recount_item_stage', ['item_code', 'stage_to_count'], unique=False)

    # 4. Tabla stock_counts: búsqueda por (session_id, item_code)
    with op.batch_alter_table('stock_counts', schema=None) as batch_op:
        if not index_exists('stock_counts', 'idx_stock_counts_session_item'):
            batch_op.create_index('idx_stock_counts_session_item', ['session_id', 'item_code'], unique=False)


def downgrade() -> None:
    """Elimina los índices compuestos creados."""
    with op.batch_alter_table('stock_counts', schema=None) as batch_op:
        if index_exists('stock_counts', 'idx_stock_counts_session_item'):
            batch_op.drop_index('idx_stock_counts_session_item')

    with op.batch_alter_table('recount_list', schema=None) as batch_op:
        if index_exists('recount_list', 'idx_recount_item_stage'):
            batch_op.drop_index('idx_recount_item_stage')

    with op.batch_alter_table('session_locations', schema=None) as batch_op:
        if index_exists('session_locations', 'idx_session_locations_session_code'):
            batch_op.drop_index('idx_session_locations_session_code')

    with op.batch_alter_table('logs', schema=None) as batch_op:
        if index_exists('logs', 'idx_logs_import_archived'):
            batch_op.drop_index('idx_logs_import_archived')
        if index_exists('logs', 'idx_logs_import_item'):
            batch_op.drop_index('idx_logs_import_item')
