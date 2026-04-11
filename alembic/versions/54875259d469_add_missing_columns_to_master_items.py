"""add missing columns to master_items

Revision ID: 54875259d469
Revises: fc4921899573
Create Date: 2026-04-10 21:53:58.041066

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54875259d469'
down_revision: Union[str, Sequence[str], None] = 'fc4921899573'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass

def downgrade() -> None:
    """Downgrade schema."""
    pass


