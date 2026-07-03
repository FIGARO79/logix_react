"""drop_planner_holidays_table

Revision ID: 0a684a51c32b
Revises: eff7237529dc
Create Date: 2026-07-03 03:38:24.131011

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0a684a51c32b'
down_revision: Union[str, Sequence[str], None] = 'eff7237529dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_table('planner_holidays')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        'planner_holidays',
        sa.Column('date', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('date')
    )
