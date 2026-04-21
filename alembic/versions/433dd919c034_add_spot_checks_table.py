"""add spot_checks table

Revision ID: 433dd919c034
Revises: 481e34ed34cd
Create Date: 2026-04-20 21:54:00.307582

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '433dd919c034'
down_revision: Union[str, Sequence[str], None] = '481e34ed34cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('spot_checks',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('bin_location', sa.String(length=100), nullable=False),
    sa.Column('item_code', sa.String(length=100), nullable=False),
    sa.Column('item_description', sa.String(length=255), nullable=True),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.String(length=50), nullable=False),
    sa.Column('username', sa.String(length=100), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('spot_checks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_spot_checks_bin_location'), ['bin_location'], unique=False)
        batch_op.create_index(batch_op.f('ix_spot_checks_item_code'), ['item_code'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('spot_checks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_spot_checks_item_code'))
        batch_op.drop_index(batch_op.f('ix_spot_checks_bin_location'))

    op.drop_table('spot_checks')
