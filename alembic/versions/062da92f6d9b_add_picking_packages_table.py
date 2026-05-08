"""add_picking_packages_table

Revision ID: 062da92f6d9b
Revises: 06f65bcce3ec
Create Date: 2026-05-07 19:50:01.206764

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '062da92f6d9b'
down_revision: Union[str, Sequence[str], None] = '06f65bcce3ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('picking_packages',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('audit_id', sa.Integer(), nullable=False),
    sa.Column('package_number', sa.Integer(), nullable=False),
    sa.Column('length', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('width', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('height', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('weight', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.ForeignKeyConstraint(['audit_id'], ['picking_audits.id'], name='fk_picking_packages_audit_id'),
    sa.PrimaryKeyConstraint('id', name='pk_picking_packages')
    )
    with op.batch_alter_table('picking_packages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_picking_packages_audit_id'), ['audit_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('picking_packages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_picking_packages_audit_id'))
    op.drop_table('picking_packages')
