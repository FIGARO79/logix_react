"""add_score_to_bin_locations

Revision ID: 06f65bcce3ec
Revises: 2c4ce1fdc699
Create Date: 2026-04-26 15:27:11.957274

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '06f65bcce3ec'
down_revision: Union[str, Sequence[str], None] = '2c4ce1fdc699'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('bin_locations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('score', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('bin_locations', schema=None) as batch_op:
        batch_op.drop_column('score')
