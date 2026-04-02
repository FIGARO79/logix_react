"""add client_id to logs table

Revision ID: c4d5ae8e106c
Revises: 2a6fa80d5f09
Create Date: 2026-04-02 11:23:42.743857

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5ae8e106c'
down_revision: Union[str, Sequence[str], None] = '2a6fa80d5f09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('client_id', sa.String(length=100), nullable=True))
        batch_op.create_index(batch_op.f('ix_logs_client_id'), ['client_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_logs_client_id'))
        batch_op.drop_column('client_id')
