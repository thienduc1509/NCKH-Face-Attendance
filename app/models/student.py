"""Define student profile database and response models."""

from datetime import UTC, date, datetime, time

from pydantic import field_serializer
from sqlmodel import Field, SQLModel

from app.core.email_compat import EmailStr
from app.models.base import AppBaseModel


def get_datetime_utc() -> datetime:
    """Return the current UTC datetime."""
    return datetime.now(UTC)


class StudentBase(SQLModel):
    """Represent shared student profile fields."""

    last_name: str = Field(max_length=50)
    first_name: str = Field(max_length=50)
    birth_date: date | None = None
    gender: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=15)
    google_email: EmailStr | None = Field(default=None, max_length=100)
    major_id: int
    account_id: int | None = None
    academic_status: bool = True


class StudentCreate(StudentBase):
    """Represent data required to create a student profile."""

    pass


class StudentUpdate(SQLModel):
    """Represent fields that can update a student profile."""

    last_name: str | None = Field(default=None, max_length=50)
    first_name: str | None = Field(default=None, max_length=50)
    birth_date: date | None = None
    gender: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=15)
    google_email: EmailStr | None = Field(default=None, max_length=100)
    major_id: int | None = None
    account_id: int | None = None
    academic_status: bool | None = None


class Student(StudentBase, table=True):
    """Represent the student profile database table."""

    __tablename__ = "students"

    student_id: int | None = Field(default=None, primary_key=True)
    google_email: EmailStr | None = Field(default=None, max_length=100, unique=True)
    major_id: int = Field(foreign_key="majors.major_id")
    account_id: int | None = Field(
        default=None, foreign_key="accounts.account_id", unique=True
    )
    study_started_at: datetime = Field(default_factory=get_datetime_utc)


class StudentPublic(AppBaseModel, StudentBase):
    """Represent student profile data returned by the API."""

    student_id: int
    study_started_at: datetime

    @field_serializer("study_started_at")
    def _serialize_datetime(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class StudentsPublic(SQLModel):
    """Represent a paginated list of student profiles."""

    data: list[StudentPublic]
    count: int


class StudentScheduleItem(SQLModel):
    """Represent schedule item for current student."""

    class_session_id: int
    class_section_id: int
    course_id: int
    course_name: str
    class_date: date
    start_time: time | None = None
    end_time: time | None = None
    status: str


class StudentSchedulePublic(SQLModel):
    """Represent schedule list for current student."""

    data: list[StudentScheduleItem]
    count: int


class StudentAttendanceItem(SQLModel):
    """Represent attendance record item for current student."""

    attendance_id: int
    class_session_id: int | None = None
    class_section_id: int
    course_name: str
    class_date: date
    status: str
    attendance_time: datetime | None = None
    note: str | None = None


class StudentAttendancePublic(SQLModel):
    """Represent attendance list for current student."""

    data: list[StudentAttendanceItem]
    count: int


class StudentAvailableClassItem(SQLModel):
    """Represent available class section item for student course registration."""

    class_section_id: int
    course_id: int
    course_name: str
    credit_count: int | None = None
    lecturer_name: str
    semester: int
    academic_year: str
    minimum_attendance_rate: float
    is_registered: bool


class StudentAvailableClassPublic(SQLModel):
    """Represent available class section list."""

    data: list[StudentAvailableClassItem]
    count: int
