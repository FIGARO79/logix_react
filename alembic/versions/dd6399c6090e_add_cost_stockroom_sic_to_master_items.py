"""add_cost_stockroom_sic_to_master_items

Revision ID: dd6399c6090e
Revises: 857f4abe9bac
Create Date: 2026-02-07 19:24:30.529023

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dd6399c6090e'
down_revision: Union[str, Sequence[str], None] = '48de25da08cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add new columns to master_items table
    op.add_column('master_items', sa.Column('stockroom', sa.String(50), nullable=True))
    op.add_column('master_items', sa.Column('cost_per_unit', sa.Numeric(10, 2), nullable=True))
    op.add_column('master_items', sa.Column('sic_code_company', sa.String(50), nullable=True))
    op.add_column('master_items', sa.Column('sic_code_stockroom', sa.String(50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove columns if rolling back
    op.drop_column('master_items', 'sic_code_stockroom')
    op.drop_column('master_items', 'sic_code_company')
    op.drop_column('master_items', 'cost_per_unit')
    op.drop_column('master_items', 'stockroom')
