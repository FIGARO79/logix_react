"""Add picking_package_items table

Revision ID: add_package_items
Revises: 
Create Date: 2025-12-23

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_package_items'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Crear la tabla picking_package_items
    op.create_table(
        'picking_package_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('audit_id', sa.Integer(), nullable=False),
        sa.Column('package_number', sa.Integer(), nullable=False),
        sa.Column('item_code', sa.String(100), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('qty_scan', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['audit_id'], ['picking_audits.id'], ),
    )
    
    # Crear índice para mejorar el rendimiento
    op.create_index('idx_package_items_audit_id', 'picking_package_items', ['audit_id'])


def downgrade():
    # Eliminar índice
    op.drop_index('idx_package_items_audit_id', 'picking_package_items')
    
    # Eliminar tabla
    op.drop_table('picking_package_items')
