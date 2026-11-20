"""Define OTP database table and request models."""

from datetime import UTC, datetime

from pydantic import Field as PydanticField
from pydantic import field_validator
from sqlmodel import Field, SQLModel

from app.core.email_compat import EmailStr
from app.models.base import AppBaseModel


def get_datetime_utc() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(UTC)


class OTPRecord(SQLModel, table=True):
    """Represent OTP verification codes database table."""

    __tablename__ = "otp_codes"

    otp_id: int | None = Field(default=None, primary_key=True)
    email: str = Field(max_length=100, index=True)
    code: str = Field(max_length=6)
    expires_at: datetime
    is_used: bool = Field(default=False)
    created_at: datetime = Field(default_factory=get_datetime_utc)


class StudentIdentifierRequest(AppBaseModel):
    """Represent an MSSV, preserving compatibility with numeric clients."""

    mssv: str = PydanticField(
        min_length=1, max_length=50, description="Mã số sinh viên"
    )

    @field_validator("mssv", mode="before")
    @classmethod
    def coerce_legacy_numeric_mssv(cls, value: object) -> object:
        if isinstance(value, int) and not isinstance(value, bool):
            return str(value)
        return value


class SendOtpRequest(StudentIdentifierRequest):
    """Represent request payload to send OTP code."""

    email: EmailStr = PydanticField(max_length=100)


class StudentRegisterRequest(StudentIdentifierRequest):
    """Represent request payload to register student account with OTP."""

    email: EmailStr = PydanticField(max_length=100)
    password: str = PydanticField(min_length=5, max_length=128)
    otp_code: str = PydanticField(min_length=6, max_length=6)
