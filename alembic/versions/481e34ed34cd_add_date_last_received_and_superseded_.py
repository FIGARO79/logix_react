"""Add date_last_received and superseded_by to MasterItem

Revision ID: 481e34ed34cd
Revises: bce46deb1c8f
Create Date: 2026-04-09 19:22:45.408269

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '481e34ed34cd'
down_revision: Union[str, Sequence[str], None] = 'bce46deb1c8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Solo añadir columnas al maestro de items
    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('date_last_received', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('superseded_by', sa.String(length=100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.drop_column('superseded_by')
        batch_op.drop_column('date_last_received')
