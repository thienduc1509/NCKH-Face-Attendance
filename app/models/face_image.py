"""Define face enrollment image database and response models."""

from datetime import UTC, datetime

from pgvector.sqlalchemy import Vector
from pydantic import field_serializer
from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from app.models.base import AppBaseModel


class FaceImageBase(SQLModel):
    """Represent shared face enrollment image fields."""

    student_id: int
    image_path: str | None = Field(default=None, max_length=255)
    image_type: str | None = Field(default=None, max_length=30)
    quality_score: float | None = None
    review_status: str = Field(default="CHO_DUYET", max_length=30)
    rejection_reason: str | None = Field(default=None, max_length=255)
    reviewed_at: datetime | None = None

    # Storage Abstraction Fields
    storage_provider: str = Field(default="LOCAL", max_length=30)
    public_id: str | None = Field(default=None, max_length=255)
    secure_url: str | None = Field(default=None, max_length=512)
    version: str | None = Field(default=None, max_length=100)
    file_size: int | None = Field(default=None)
    mime_type: str | None = Field(default=None, max_length=50)
    width: int | None = Field(default=None)
    height: int | None = Field(default=None)


class FaceImageCreate(FaceImageBase):
    """Represent data required to create a face enrollment image."""

    embedding_vector: list[float] | None = None


class FaceImageUpdate(SQLModel):
    """Represent fields that can update a face enrollment image."""

    image_path: str | None = Field(default=None, max_length=255)
    image_type: str | None = Field(default=None, max_length=30)
    embedding_vector: list[float] | None = None
    quality_score: float | None = None
    review_status: str | None = Field(default=None, max_length=30)
    rejection_reason: str | None = Field(default=None, max_length=255)
    reviewer_id: int | None = None
    reviewed_at: datetime | None = None

    storage_provider: str | None = Field(default=None, max_length=30)
    public_id: str | None = Field(default=None, max_length=255)
    secure_url: str | None = Field(default=None, max_length=512)
    version: str | None = Field(default=None, max_length=100)
    file_size: int | None = Field(default=None)
    mime_type: str | None = Field(default=None, max_length=50)
    width: int | None = Field(default=None)
    height: int | None = Field(default=None)


class FaceImage(FaceImageBase, table=True):
    """Represent the face enrollment image database table."""

    __tablename__ = "face_images"

    image_id: int | None = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="students.student_id")
    reviewer_id: int | None = Field(
        default=None,
        foreign_key="accounts.account_id",
    )
    embedding_vector: list[float] | None = Field(
        default=None,
        sa_column=Column(Vector(128), nullable=True),
    )


class FaceImagePublic(AppBaseModel, FaceImageBase):
    """Represent face enrollment image data returned by the API."""

    image_id: int
    reviewer_id: int | None = None
    reviewed_at: datetime | None = None

    @field_serializer("reviewed_at")
    def _serialize_datetime(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class FaceImagesPublic(SQLModel):
    """Represent a paginated list of face enrollment images."""

    data: list[FaceImagePublic]
    count: int
