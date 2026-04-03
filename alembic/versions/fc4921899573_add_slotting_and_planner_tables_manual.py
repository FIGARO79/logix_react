"""add_slotting_and_planner_tables_manual

Revision ID: fc4921899573
Revises: c4d5ae8e106c
Create Date: 2026-04-03 09:01:00.864139

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fc4921899573'
down_revision: Union[str, Sequence[str], None] = 'c4d5ae8e106c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear tabla bin_locations
    op.create_table(
        'bin_locations',
        sa.Column('bin_code', sa.String(length=100), nullable=False),
        sa.Column('zone', sa.String(length=100), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('aisle', sa.String(length=50), nullable=True),
        sa.Column('spot', sa.String(length=50), nullable=False, server_default='Cold'),
        sa.PrimaryKeyConstraint('bin_code')
    )
    op.create_index(op.f('ix_bin_locations_bin_code'), 'bin_locations', ['bin_code'], unique=False)
    op.create_index(op.f('ix_bin_locations_zone'), 'bin_locations', ['zone'], unique=False)

    # 2. Crear tabla slotting_rules
    op.create_table(
        'slotting_rules',
        sa.Column('sic_code', sa.String(length=50), nullable=False),
        sa.Column('ideal_spot', sa.String(length=50), nullable=False, server_default='cold'),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('sic_code')
    )
    op.create_index(op.f('ix_slotting_rules_sic_code'), 'slotting_rules', ['sic_code'], unique=False)

    # 3. Crear tabla planner_holidays
    op.create_table(
        'planner_holidays',
        sa.Column('date', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('date')
    )


def downgrade() -> None:
    op.drop_table('planner_holidays')
    op.drop_index(op.f('ix_slotting_rules_sic_code'), table_name='slotting_rules')
    op.drop_table('slotting_rules')
    op.drop_index(op.f('ix_bin_locations_zone'), table_name='bin_locations')
    op.drop_index(op.f('ix_bin_locations_bin_code'), table_name='bin_locations')
    op.drop_table('bin_locations')
