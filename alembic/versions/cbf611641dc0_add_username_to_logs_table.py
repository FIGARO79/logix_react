"""add username to logs table

Revision ID: cbf611641dc0
Revises: 8f1125eae21a
Create Date: 2026-03-20 16:54:41.484873

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cbf611641dc0'
down_revision: Union[str, Sequence[str], None] = '8f1125eae21a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('username', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('logs', schema=None) as batch_op:
        batch_op.drop_column('username')
