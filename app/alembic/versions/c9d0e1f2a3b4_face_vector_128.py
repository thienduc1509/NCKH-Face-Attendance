"""Update face embedding vector dimension to 128 for SFace model.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-11-10 08:30:00.000000

"""
from pgvector.sqlalchemy import Vector

from alembic import op

# revision identifiers, used by Alembic.
revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Reset any legacy 512-dimensional embeddings since FaceNet (512D)
    #    and SFace (128D) representations cannot be cast or combined.
    op.execute("UPDATE face_images SET embedding_vector = NULL WHERE embedding_vector IS NOT NULL;")

    # 2. Alter column type from vector(512) to vector(128)
    op.alter_column(
        "face_images",
        "embedding_vector",
        type_=Vector(128),
        existing_type=Vector(512),
        existing_nullable=True,
    )


def downgrade():
    # 1. Reset 128-dimensional embeddings before reverting dimension
    op.execute("UPDATE face_images SET embedding_vector = NULL WHERE embedding_vector IS NOT NULL;")

    # 2. Revert column type from vector(128) back to vector(512)
    op.alter_column(
        "face_images",
        "embedding_vector",
        type_=Vector(512),
        existing_type=Vector(128),
        existing_nullable=True,
    )
