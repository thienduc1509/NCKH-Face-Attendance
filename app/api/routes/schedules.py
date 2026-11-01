"""
Lich hoc router.

Defines APIs for student study schedules.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.deps import CurrentAccount, get_current_active_student
from app.models import TodaySchedulePublic
from app.services.student_schedule_service import (
    StudentScheduleService,
    get_student_schedule_service,
)

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get(
    "/me/today",
    dependencies=[Depends(get_current_active_student)],
    response_model=TodaySchedulePublic,
)
def read_my_today_student_schedule(
    current_account: CurrentAccount,
    target_date: date | None = None,
    service: StudentScheduleService = Depends(get_student_schedule_service),
) -> TodaySchedulePublic:
    """Lấy danh sách buổi học trong ngày của sinh viên đang đăng nhập."""
    from app.services.student_service import get_student_by_account_or_404

    student = get_student_by_account_or_404(
        session=service.session, account_id=current_account.account_id
    )
    return service.get_today_schedule(
        student_id=student.student_id,
        target_date=target_date or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date(),
        current_account=current_account,
    )


@router.get(
    "/students/{student_id}/today",
    dependencies=[Depends(get_current_active_student)],
    response_model=TodaySchedulePublic,
)
def read_today_student_schedule(
    current_account: CurrentAccount,
    student_id: Annotated[int, Path(ge=1)],
    target_date: date | None = None,
    service: StudentScheduleService = Depends(get_student_schedule_service),
) -> TodaySchedulePublic:
    """Lay danh sach buoi hoc trong ngay cua sinh vien."""
    return service.get_today_schedule(
        student_id=student_id,
        target_date=target_date or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date(),
        current_account=current_account,
    )


@router.get("/me/active", dependencies=[Depends(get_current_active_student)], response_model=TodaySchedulePublic)
def read_my_active_student_sessions(
    current_account: CurrentAccount,
    service: StudentScheduleService = Depends(get_student_schedule_service),
) -> TodaySchedulePublic:
    """List open attendance sessions only for this student's registered classes."""
    from app.services.student_service import get_student_by_account_or_404
    student = get_student_by_account_or_404(session=service.session, account_id=current_account.account_id)
    return service.get_today_schedule(
        student_id=student.student_id,
        target_date=datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date(),
        current_account=current_account,
        active_only=True,
    )
