"""Add order_line to picking_package_items

Revision ID: 2129456be612
Revises: 5bb7d61e7826
Create Date: 2026-03-04 19:48:41.741203

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2129456be612'
down_revision: Union[str, Sequence[str], None] = '5bb7d61e7826'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('picking_package_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('order_line', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('picking_package_items', schema=None) as batch_op:
        batch_op.drop_column('order_line')
