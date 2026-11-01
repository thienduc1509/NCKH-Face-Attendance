"""
Lich hoc service.

Contains business logic for student study schedules.
"""

from datetime import date

from fastapi import Depends
from sqlmodel import Session

from app.api.deps import get_db
from app.core.exceptions import PermissionDeniedError, StudentNotFoundError
from app.crud.student_crud import get_student
from app.crud.student_schedule_crud import get_today_schedule_by_student
from app.models import Account, TodaySchedulePublic


class StudentScheduleService:
    """Service class for student schedule operations."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_today_schedule(
        self,
        *,
        student_id: int,
        target_date: date,
        current_account: Account,
        active_only: bool = False,
    ) -> TodaySchedulePublic:
        """Lay lich hoc trong ngay cua sinh vien."""
        student = get_student(session=self.session, student_id=student_id)
        if not student:
            raise StudentNotFoundError("Student profile not found")

        if (
            current_account.role != "ADMIN"
            and student.account_id != current_account.account_id
        ):
            raise PermissionDeniedError(
                "Not authorized to access this Sinh Vien's data"
            )

        items, count = get_today_schedule_by_student(
            session=self.session,
            student_id=student_id,
            target_date=target_date,
            active_only=active_only,
        )
        return TodaySchedulePublic(
            student_id=student_id,
            class_date=target_date,
            data=items,
            count=count,
        )


def get_student_schedule_service(
    session: Session = Depends(get_db),
) -> StudentScheduleService:
    """Dependency provider for StudentScheduleService."""
    return StudentScheduleService(session)
