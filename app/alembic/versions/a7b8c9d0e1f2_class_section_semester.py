"""Link class sections to semesters."""
from alembic import op
import sqlalchemy as sa
revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None

def upgrade():
    # initial_data creates the semester table on older installations.
    if not sa.inspect(op.get_bind()).has_table("semesters"):
        op.create_table("semesters",
            sa.Column("semester_id", sa.Integer(), primary_key=True),
            sa.Column("semester_code", sa.String(30), nullable=False),
            sa.Column("semester_name", sa.String(50), nullable=False),
            sa.Column("academic_year", sa.String(20), nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("is_current", sa.Boolean(), nullable=False))
        op.create_index("ix_semesters_semester_code", "semesters", ["semester_code"], unique=True)
        op.create_index("ix_semesters_is_current", "semesters", ["is_current"])
    op.add_column("class_sections", sa.Column("semester_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_class_sections_semester_id", "class_sections", "semesters", ["semester_id"], ["semester_id"])
    op.create_index("ix_class_sections_semester_id", "class_sections", ["semester_id"])

def downgrade():
    op.drop_index("ix_class_sections_semester_id", table_name="class_sections")
    op.drop_constraint("fk_class_sections_semester_id", "class_sections", type_="foreignkey")
    op.drop_column("class_sections", "semester_id")
