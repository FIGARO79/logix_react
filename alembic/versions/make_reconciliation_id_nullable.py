"""make_reconciliation_id_nullable

Revision ID: 20260831_reconciliation_nullable
Revises: 9fbfc21677f9
Create Date: 2026-08-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260831_reconciliation_nullable'
down_revision: Union[str, Sequence[str], None] = '9fbfc21677f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - make reconciliation_id nullable for draft comments."""
    with op.batch_alter_table('saved_grn_reconciliation_items') as batch_op:
        batch_op.alter_column('reconciliation_id',
                   existing_type=sa.Integer(),
                   nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('saved_grn_reconciliation_items') as batch_op:
        batch_op.alter_column('reconciliation_id',
                   existing_type=sa.Integer(),
                   nullable=False)
