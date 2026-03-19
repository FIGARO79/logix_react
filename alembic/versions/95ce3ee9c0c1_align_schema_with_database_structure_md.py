"""Align schema with database_structure.md

Revision ID: 95ce3ee9c0c1
Revises: 8f1125eae21a
Create Date: 2026-03-19 15:18:51.859451

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '95ce3ee9c0c1'
down_revision: Union[str, Sequence[str], None] = '8f1125eae21a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - Robust version with case-insensitive check."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    def get_cols_ci(table):
        return [c['name'].lower() for c in inspector.get_columns(table)]

    # 1. Handle cycle_count_recordings
    if 'cycle_count_recordings' in tables:
        with op.batch_alter_table('cycle_count_recordings', schema=None) as batch_op:
            idxs = [ix['name'] for ix in inspector.get_indexes('cycle_count_recordings')]
            if 'ix_cycle_count_recordings_item_code' in idxs:
                batch_op.drop_index('ix_cycle_count_recordings_item_code')
        op.drop_table('cycle_count_recordings')

    # 2. Handle cycle_counts
    if 'cycle_counts' in tables:
        cols_ci = get_cols_ci('cycle_counts')
        with op.batch_alter_table('cycle_counts', schema=None) as batch_op:
            if 'planned_date' not in cols_ci: batch_op.add_column(sa.Column('planned_date', sa.String(length=50), nullable=False))
            if 'executed_date' not in cols_ci: batch_op.add_column(sa.Column('executed_date', sa.String(length=50), nullable=False))
            if 'system_qty' not in cols_ci: batch_op.add_column(sa.Column('system_qty', sa.Integer(), nullable=False))
            if 'physical_qty' not in cols_ci: batch_op.add_column(sa.Column('physical_qty', sa.Integer(), nullable=False))
            if 'difference' not in cols_ci: batch_op.add_column(sa.Column('difference', sa.Integer(), nullable=False))
            
            fks = [fk['name'] for fk in inspector.get_foreign_keys('cycle_counts')]
            for fk_name in ['cycle_counts_ibfk_1', 'cycle_counts_ibfk_2']:
                if fk_name in fks: batch_op.drop_constraint(fk_name, type_='foreignkey')
            
            if 'timestamp' in cols_ci: batch_op.drop_column('timestamp')
            if 'abc_code' in cols_ci: batch_op.drop_column('abc_code')
            if 'count_id' in cols_ci: batch_op.drop_column('count_id')

    # 3. Handle grn_master
    if 'grn_master' in tables:
        cols_ci = get_cols_ci('grn_master')
        with op.batch_alter_table('grn_master', schema=None) as batch_op:
            batch_op.alter_column('import_reference', existing_type=mysql.VARCHAR(length=100), type_=sa.String(length=255))
            batch_op.alter_column('waybill', existing_type=mysql.VARCHAR(length=100), type_=sa.String(length=255))
            batch_op.alter_column('grn_number', existing_type=mysql.VARCHAR(length=255), type_=sa.Text())
            if 'lines' in cols_ci: batch_op.drop_column('lines')
            if 'ct' in cols_ci: batch_op.drop_column('ct')
            if 'aaf_grn1' in cols_ci: batch_op.drop_column('aaf_grn1')
            if 'grn3_date' in cols_ci: batch_op.drop_column('grn3_date')

    # 4. Handle master_items
    if 'master_items' in tables:
        cols_ci = get_cols_ci('master_items')
        idxs = [ix['name'] for ix in inspector.get_indexes('master_items')]
        with op.batch_alter_table('master_items', schema=None) as batch_op:
            if 'item_type' not in cols_ci: batch_op.add_column(sa.Column('item_type', sa.String(length=50), nullable=True))
            if 'item_class' not in cols_ci: batch_op.add_column(sa.Column('item_class', sa.String(length=50), nullable=True))
            if 'item_group_major' not in cols_ci: batch_op.add_column(sa.Column('item_group_major', sa.String(length=50), nullable=True))
            if 'stockroom' not in cols_ci: batch_op.add_column(sa.Column('stockroom', sa.String(length=50), nullable=True))
            if 'cost_per_unit' not in cols_ci: batch_op.add_column(sa.Column('cost_per_unit', sa.Numeric(precision=10, scale=2), nullable=True))
            
            batch_op.alter_column('description', existing_type=mysql.TEXT(), type_=sa.String(length=255))
            batch_op.alter_column('physical_qty', existing_type=mysql.INTEGER(), nullable=False)
            
            if 'ix_master_items_abc_code' not in idxs: batch_op.create_index('ix_master_items_abc_code', ['abc_code'], unique=False)
            if 'ix_master_items_bin_1' not in idxs: batch_op.create_index('ix_master_items_bin_1', ['bin_1'], unique=False)
            if 'ix_master_items_item_code' not in idxs: batch_op.create_index('ix_master_items_item_code', ['item_code'], unique=False)
            
            legacy_cols = ['Date_Last_Received', 'Item_Class', 'Item_Group_Major', 'Stockroom', 'Item_Type', 
                           'Cost_per_Unit', 'Frozen_Qty', 'SupersededBy', 'SIC_Code_Company', 'SIC_Code_stockroom']
            for lc in legacy_cols:
                if lc.lower() in cols_ci:
                    batch_op.drop_column(lc)

    # 5. Handle reconciliation_history
    if 'reconciliation_history' in tables:
        cols_ci = get_cols_ci('reconciliation_history')
        with op.batch_alter_table('reconciliation_history', schema=None) as batch_op:
            for c in ['import_reference', 'timestamp', 'grn', 'waybill', 'description']:
                if c.lower() in cols_ci:
                    batch_op.drop_column(c)

    # 6. Handle users
    if 'users' in tables:
        cols_ci = get_cols_ci('users')
        if 'is_admin' in cols_ci:
            with op.batch_alter_table('users', schema=None) as batch_op:
                batch_op.drop_column('is_admin')

    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_admin', mysql.INTEGER(display_width=11), server_default=sa.text('0'), autoincrement=False, nullable=True))

    with op.batch_alter_table('reconciliation_history', schema=None) as batch_op:
        batch_op.add_column(sa.Column('description', mysql.TEXT(), nullable=False))
        batch_op.add_column(sa.Column('waybill', mysql.VARCHAR(length=100), nullable=False))
        batch_op.add_column(sa.Column('grn', mysql.VARCHAR(length=100), nullable=False))
        batch_op.add_column(sa.Column('timestamp', mysql.VARCHAR(length=50), nullable=False))
        batch_op.add_column(sa.Column('import_reference', mysql.VARCHAR(length=100), nullable=False))

    with op.batch_alter_table('master_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('SIC_Code_stockroom', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('SIC_Code_Company', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('SupersededBy', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('Frozen_Qty', mysql.INTEGER(display_width=11), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('Cost_per_Unit', mysql.DECIMAL(precision=10, scale=2), nullable=True))
        batch_op.add_column(sa.Column('Item_Type', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('Stockroom', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('Item_Group_Major', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('Item_Class', mysql.VARCHAR(length=100), nullable=True))
        batch_op.add_column(sa.Column('Date_Last_Received', mysql.VARCHAR(length=100), nullable=True))
        batch_op.drop_index(batch_op.f('ix_master_items_item_code'))
        batch_op.drop_index(batch_op.f('ix_master_items_bin_1'))
        batch_op.drop_index(batch_op.f('ix_master_items_abc_code'))
        batch_op.alter_column('physical_qty',
               existing_type=mysql.INTEGER(display_width=11),
               nullable=True,
               existing_server_default=sa.text('0'))
        batch_op.alter_column('description',
               existing_type=sa.String(length=255),
               type_=mysql.TEXT(),
               existing_nullable=True)
        batch_op.drop_column('cost_per_unit')
        batch_op.drop_column('stockroom')
        batch_op.drop_column('item_group_major')
        batch_op.drop_column('item_class')
        batch_op.drop_column('item_type')

    with op.batch_alter_table('grn_master', schema=None) as batch_op:
        batch_op.add_column(sa.Column('grn3_date', mysql.VARCHAR(length=50), nullable=True))
        batch_op.add_column(sa.Column('aaf_grn1', mysql.DECIMAL(precision=10, scale=5), nullable=True))
        batch_op.add_column(sa.Column('ct', mysql.VARCHAR(length=50), nullable=True))
        batch_op.add_column(sa.Column('lines', mysql.VARCHAR(length=50), nullable=True))
        batch_op.alter_column('grn_number',
               existing_type=sa.Text(),
               type_=mysql.VARCHAR(length=255),
               existing_nullable=True)
        batch_op.alter_column('waybill',
               existing_type=sa.String(length=255),
               type_=mysql.VARCHAR(length=100),
               existing_nullable=False)
        batch_op.alter_column('import_reference',
               existing_type=sa.String(length=255),
               type_=mysql.VARCHAR(length=100),
               existing_nullable=False)

    with op.batch_alter_table('cycle_counts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('count_id', mysql.INTEGER(display_width=11), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('abc_code', mysql.VARCHAR(length=10), nullable=True))
        batch_op.add_column(sa.Column('timestamp', mysql.VARCHAR(length=50), nullable=False))
        batch_op.create_foreign_key(batch_op.f('cycle_counts_ibfk_1'), 'stock_counts', ['count_id'], ['id'])
        batch_op.drop_column('difference')
        batch_op.drop_column('physical_qty')
        batch_op.drop_column('system_qty')
        batch_op.drop_column('executed_date')
        batch_op.drop_column('planned_date')

    op.create_table('cycle_count_recordings',
    sa.Column('id', mysql.INTEGER(display_width=11), autoincrement=True, nullable=False),
    sa.Column('planned_date', mysql.VARCHAR(length=50), nullable=False),
    sa.Column('executed_date', mysql.VARCHAR(length=50), nullable=False),
    sa.Column('item_code', mysql.VARCHAR(length=100), nullable=False),
    sa.Column('item_description', mysql.VARCHAR(length=255), nullable=True),
    sa.Column('bin_location', mysql.VARCHAR(length=100), nullable=True),
    sa.Column('system_qty', mysql.INTEGER(display_width=11), server_default=sa.text('0'), autoincrement=False, nullable=False),
    sa.Column('physical_qty', mysql.INTEGER(display_width=11), autoincrement=False, nullable=False),
    sa.Column('difference', mysql.INTEGER(display_width=11), server_default=sa.text('0'), autoincrement=False, nullable=False),
    sa.Column('username', mysql.VARCHAR(length=100), nullable=False),
    sa.Column('abc_code', mysql.VARCHAR(length=10), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    mysql_collate='utf8mb4_uca1400_ai_ci',
    mysql_default_charset='utf8mb4',
    mysql_engine='InnoDB'
    )
    with op.batch_alter_table('cycle_count_recordings', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_cycle_count_recordings_item_code'), ['item_code'], unique=False)

    # ### end Alembic commands ###
