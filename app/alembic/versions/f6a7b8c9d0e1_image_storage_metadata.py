"""Add storage metadata missing from the image table migrations."""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("face_images", "attendance_images"):
        op.add_column(table, sa.Column("storage_provider", sa.String(30), nullable=False, server_default="LOCAL"))
        for name, size in (("public_id", 255), ("secure_url", 512), ("version", 100), ("mime_type", 50)):
            op.add_column(table, sa.Column(name, sa.String(size), nullable=True))
        for name in ("file_size", "width", "height"):
            op.add_column(table, sa.Column(name, sa.Integer(), nullable=True))


def downgrade():
    for table in ("face_images", "attendance_images"):
        for name in ("height", "width", "file_size", "mime_type", "version", "secure_url", "public_id", "storage_provider"):
            op.drop_column(table, name)
