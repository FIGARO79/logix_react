"""expand_master_item_cost_to_14_2

Revision ID: 20260915_expand_master_item_cost
Revises: 20260831_reconciliation_nullable
Create Date: 2026-09-15 16:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260915_expand_master_item_cost'
down_revision: Union[str, Sequence[str], None] = '20260831_reconciliation_nullable'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Expand cost_per_unit precision from DECIMAL(12,2) to DECIMAL(14,2)."""
    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.alter_column(
            'cost_per_unit',
            existing_type=sa.Numeric(12, 2),
            type_=sa.Numeric(14, 2),
            existing_nullable=True,
        )


def downgrade() -> None:
    """Revert cost_per_unit precision to DECIMAL(12,2)."""
    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.alter_column(
            'cost_per_unit',
            existing_type=sa.Numeric(14, 2),
            type_=sa.Numeric(12, 2),
            existing_nullable=True,
        )
