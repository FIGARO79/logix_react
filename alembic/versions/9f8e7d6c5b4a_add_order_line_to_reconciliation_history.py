"""add order_line to reconciliation_history

Revision ID: 9f8e7d6c5b4a
Revises: 0a684a51c32b
Create Date: 2026-08-03 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9f8e7d6c5b4a'
down_revision: Union[str, Sequence[str], None] = '0a684a51c32b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('reconciliation_history', schema=None) as batch_op:
        batch_op.add_column(sa.Column('order_line', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('reconciliation_history', schema=None) as batch_op:
        batch_op.drop_column('order_line')
