"""Align audit column names with the current application model."""
from alembic import op
revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None
PAIRS = [("account_id","ma_tai_khoan"),("role","vai_tro"),("action","hanh_dong"),("target_type","doi_tuong"),("target_id","doi_tuong_id"),("before_data","du_lieu_truoc"),("after_data","du_lieu_sau"),("status","trang_thai"),("detail","chi_tiet"),("audit_log_id","ma_audit_log"),("timestamp","thoi_gian")]
def upgrade():
    for old, new in PAIRS:
        op.alter_column("auditlog", old, new_column_name=new)
def downgrade():
    for old, new in reversed(PAIRS):
        op.alter_column("auditlog", new, new_column_name=old)
