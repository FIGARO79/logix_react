"""add_bin_location_relocated_bin_to_reconciliation_history

Revision ID: 475017242a53
Revises: fc5f66738c8e
Create Date: 2026-03-12 16:43:36.165611

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '475017242a53'
down_revision: Union[str, Sequence[str], None] = 'fc5f66738c8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('reconciliation_history', schema=None) as batch_op:
        batch_op.add_column(sa.Column('bin_location', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('relocated_bin', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('reconciliation_history', schema=None) as batch_op:
        batch_op.drop_column('relocated_bin')
        batch_op.drop_column('bin_location')
