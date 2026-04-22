"""add_source_to_cycle_count_recordings

Revision ID: fbb9ff6fda24
Revises: 433dd919c034
Create Date: 2026-04-22 01:38:53.765180

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fbb9ff6fda24'
down_revision: Union[str, Sequence[str], None] = '433dd919c034'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('cycle_count_recordings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source', sa.String(length=50), nullable=True))

    # Marcar registros existentes como 'planner' (valor por defecto)
    op.execute("UPDATE cycle_count_recordings SET source = 'planner' WHERE source IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('cycle_count_recordings', schema=None) as batch_op:
        batch_op.drop_column('source')
