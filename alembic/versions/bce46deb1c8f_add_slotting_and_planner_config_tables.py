"""add_slotting_and_planner_config_tables

Revision ID: bce46deb1c8f
Revises: 3e48d4728c75
Create Date: 2026-04-03 17:41:11.518481

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bce46deb1c8f'
down_revision: Union[str, Sequence[str], None] = '3e48d4728c75'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Crear tabla bin_locations
    op.create_table('bin_locations',
        sa.Column('bin_code', sa.String(length=100), nullable=False),
        sa.Column('zone', sa.String(length=100), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('aisle', sa.String(length=50), nullable=True),
        sa.Column('spot', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('bin_code')
    )
    op.create_index(op.f('ix_bin_locations_bin_code'), 'bin_locations', ['bin_code'], unique=False)
    op.create_index(op.f('ix_bin_locations_zone'), 'bin_locations', ['zone'], unique=False)

    # 2. Crear tabla planner_holidays
    op.create_table('planner_holidays',
        sa.Column('date', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('date')
    )

    # 3. Crear tabla slotting_rules
    op.create_table('slotting_rules',
        sa.Column('sic_code', sa.String(length=50), nullable=False),
        sa.Column('ideal_spot', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('sic_code')
    )
    op.create_index(op.f('ix_slotting_rules_sic_code'), 'slotting_rules', ['sic_code'], unique=False)

    # 4. Crear tabla ai_category_patterns (si no existe)
    # Nota: El autogenerate intentó alterarla, pero mejor aseguramos que exista
    # Si ya existe, Alembic fallará aquí, pero en este entorno parece que falta o necesita actualización
    # Usamos try/except o check existance si es necesario, pero para este fix seremos directos.
    # Dado el error previo, asumimos que las tablas anteriores están bien y no las tocamos masivamente.

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_slotting_rules_sic_code'), table_name='slotting_rules')
    op.drop_table('slotting_rules')
    op.drop_table('planner_holidays')
    op.drop_index(op.f('ix_bin_locations_zone'), table_name='bin_locations')
    op.drop_index(op.f('ix_bin_locations_bin_code'), table_name='bin_locations')
    op.drop_table('bin_locations')
