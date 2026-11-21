"""Provide staff application services."""

from datetime import date
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from app import crud
from app.core.exceptions import (
    AppException,
    PermissionDeniedError,
    StaffAlreadyExistsError,
    StaffNotFoundError,
)
from app.models import (
    Attendance,
    ClassSection,
    ClassSession,
    Course,
    CourseRegistration,
    Message,
    MonthlyAttendanceSummary,
    Staff,
    StaffCreate,
    StaffUpdate,
)
from app.services.appeal_service import get_pending_appeal_metric
from app.services.attendance_summary_service import get_monthly_attendance_summary


def ensure_unique_staff_fields(
    *,
    session: Session,
    google_email: str | None = None,
    account_id: int | None = None,
    current_staff_id: int | None = None,
) -> None:
    """Ensure unique staff Google email and account link fields."""
    if google_email:
        existing_staff = crud.get_staff_member_by_google_email(
            session=session,
            google_email=google_email,
        )
        if existing_staff and existing_staff.staff_id != current_staff_id:
            raise StaffAlreadyExistsError("Google email already exists")

    if account_id:
        existing_staff = crud.get_staff_member_by_account_id(
            session=session,
            account_id=account_id,
        )
        if existing_staff and existing_staff.staff_id != current_staff_id:
            raise StaffAlreadyExistsError(
                "Account is already linked to another staff profile"
            )


def get_staff_member_or_404(*, session: Session, staff_id: int) -> Staff:
    """Return a staff profile or raise a 404 error."""
    staff = crud.get_staff_member(session=session, staff_id=staff_id)
    if not staff:
        raise StaffNotFoundError("Staff profile not found")
    return staff


def get_staff_by_account_or_404(*, session: Session, account_id: int) -> Staff:
    """Return a staff profile by account or raise a 404 error."""
    staff = crud.get_staff_member_by_account_id(
        session=session,
        account_id=account_id,
    )
    if not staff:
        raise StaffNotFoundError("Staff profile not found")
    return staff


def ensure_staff_owns_profile(
    *,
    session: Session,
    staff_id: int,
    account_id: int,
) -> Staff:
    """Ensure the staff profile belongs to the current account."""
    staff = get_staff_member_or_404(session=session, staff_id=staff_id)
    if staff.account_id != account_id:
        raise PermissionDeniedError("Not authorized to access this staff profile")
    return staff


def list_staff_members(
    *,
    session: Session,
    skip: int = 0,
    limit: int = 100,
    q: str | None = None,
    status: bool | None = None,
) -> tuple[list[Staff], int]:
    """Return paginated staff profiles."""
    return crud.get_staff_members(
        session=session,
        skip=skip,
        limit=limit,
        q=q,
        status=status,
    )


def create_staff_member(*, session: Session, item_in: StaffCreate) -> Staff:
    """Create a staff profile."""
    ensure_unique_staff_fields(
        session=session,
        google_email=item_in.google_email,
        account_id=item_in.account_id,
    )
    try:
        return crud.create_staff_member(session=session, staff_create=item_in)
    except IntegrityError as exc:
        session.rollback()
        raise StaffAlreadyExistsError(
            "Staff profile violates a unique or foreign key constraint"
        ) from exc


def update_staff_member(
    *,
    session: Session,
    staff_id: int,
    item_in: StaffUpdate,
) -> Staff:
    """Update a staff profile."""
    db_staff = get_staff_member_or_404(session=session, staff_id=staff_id)
    ensure_unique_staff_fields(
        session=session,
        google_email=item_in.google_email,
        account_id=item_in.account_id,
        current_staff_id=staff_id,
    )
    try:
        return crud.update_staff_member(
            session=session,
            db_staff=db_staff,
            staff_update=item_in,
        )
    except IntegrityError as exc:
        session.rollback()
        raise StaffAlreadyExistsError(
            "Staff profile violates a unique or foreign key constraint"
        ) from exc


def delete_staff_member(*, session: Session, staff_id: int) -> Message:
    """Delete a staff profile."""
    db_staff = get_staff_member_or_404(session=session, staff_id=staff_id)
    try:
        crud.delete_staff_member(session=session, db_staff=db_staff)
    except IntegrityError as exc:
        session.rollback()
        raise StaffAlreadyExistsError(
            "Staff profile is referenced by other records"
        ) from exc
    return Message(message="Staff profile deleted successfully")


def read_my_teaching_schedule(
    *,
    session: Session,
    account_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    semester: int | None = None,
    academic_year: str | None = None,
    status: bool | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict[str, Any]:
    """Return the current staff member's teaching schedule."""
    staff = get_staff_by_account_or_404(session=session, account_id=account_id)
    items, count = crud.get_teaching_schedule_by_staff_member(
        session=session,
        staff_id=staff.staff_id,
        from_date=from_date,
        to_date=to_date,
        semester=semester,
        academic_year=academic_year,
        status=status,
        skip=skip,
        limit=limit,
    )
    return {"data": items, "count": count}


def read_my_class_sections(*, session: Session, account_id: int) -> dict[str, Any]:
    """Return class sections taught by the current staff member."""
    staff = get_staff_by_account_or_404(session=session, account_id=account_id)
    statement = (
        select(ClassSection, Course)
        .join(Course, Course.course_id == ClassSection.course_id)
        .where(ClassSection.staff_id == staff.staff_id)
    )
    results = session.exec(statement).all()

    class_sections = []
    for class_section, course in results:
        registration_count = (
            session.exec(
                select(func.count(CourseRegistration.student_id)).where(
                    CourseRegistration.class_section_id
                    == class_section.class_section_id,
                    CourseRegistration.status.is_(True),
                )
            ).first()
            or 0
        )
        class_sections.append(
            {
                "class_section_id": class_section.class_section_id,
                "course_id": class_section.course_id,
                "course_name": course.course_name,
                "semester": class_section.semester,
                "academic_year": class_section.academic_year,
                "status": class_section.status,
                "current_students": registration_count,
            }
        )
    return {"data": class_sections, "count": len(class_sections)}


def read_staff_teaching_schedule(
    *,
    session: Session,
    current_account_id: int,
    staff_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    semester: int | None = None,
    academic_year: str | None = None,
    status: bool | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Any], int]:
    """Return teaching schedule for an authorized staff profile."""
    if from_date and to_date and from_date > to_date:
        raise AppException(
            "from_date must be before or equal to to_date", status_code=400
        )
    ensure_staff_owns_profile(
        session=session,
        staff_id=staff_id,
        account_id=current_account_id,
    )
    return crud.get_teaching_schedule_by_staff_member(
        session=session,
        staff_id=staff_id,
        from_date=from_date,
        to_date=to_date,
        semester=semester,
        academic_year=academic_year,
        status=status,
        skip=skip,
        limit=limit,
    )


def read_staff_recent_lessons(
    *,
    session: Session,
    current_account_id: int,
    staff_id: int,
    limit: int = 5,
) -> tuple[list[Any], int]:
    """Return recent lessons for an authorized staff profile."""
    ensure_staff_owns_profile(
        session=session,
        staff_id=staff_id,
        account_id=current_account_id,
    )
    return crud.get_recent_lessons_by_staff_member(
        session=session,
        staff_id=staff_id,
        limit=limit,
    )


def count_current_teaching_class_sections(
    *,
    session: Session,
    current_account_id: int,
    staff_id: int,
    as_of_date: date | None = None,
) -> tuple[int, int, str, date]:
    """Return active teaching class section count for a staff profile."""
    ensure_staff_owns_profile(
        session=session,
        staff_id=staff_id,
        account_id=current_account_id,
    )
    target_date = as_of_date or date.today()
    count, semester, academic_year = (
        crud.count_current_teaching_class_sections_by_staff_member(
            session=session,
            staff_id=staff_id,
            as_of_date=target_date,
        )
    )
    return count, semester, academic_year, target_date


def read_monthly_attendance_summary(
    *,
    session: Session,
    current_account_id: int,
    staff_id: int,
    reference_date: date | None = None,
) -> MonthlyAttendanceSummary:
    """Return monthly attendance summary for an authorized staff profile."""
    ensure_staff_owns_profile(
        session=session,
        staff_id=staff_id,
        account_id=current_account_id,
    )
    return get_monthly_attendance_summary(
        session=session,
        staff_id=staff_id,
        reference_date=reference_date or date.today(),
    )


def read_pending_appeal_count(
    *,
    session: Session,
    current_account_id: int,
    staff_id: int,
) -> Any:
    """Return pending appeal count for an authorized staff profile."""
    ensure_staff_owns_profile(
        session=session,
        staff_id=staff_id,
        account_id=current_account_id,
    )
    return get_pending_appeal_metric(session=session, staff_id=staff_id)


def read_my_reports(*, session: Session, account_id: int) -> list[dict[str, Any]]:
    """Return attendance reports for classes taught by the current staff member."""
    staff = get_staff_by_account_or_404(session=session, account_id=account_id)
    results = session.exec(
        select(ClassSection, Course)
        .join(Course, Course.course_id == ClassSection.course_id)
        .where(ClassSection.staff_id == staff.staff_id)
    ).all()

    reports = []
    for class_section, course in results:
        student_count = (
            session.exec(
                select(func.count(CourseRegistration.student_id)).where(
                    CourseRegistration.class_section_id
                    == class_section.class_section_id
                )
            ).first()
            or 0
        )
        total_sessions = (
            session.exec(
                select(func.count(ClassSession.class_session_id)).where(
                    ClassSession.class_section_id == class_section.class_section_id
                )
            ).first()
            or 0
        )
        completed_sessions = session.exec(
            select(ClassSession)
            .where(
                ClassSession.class_section_id == class_section.class_section_id,
                ClassSession.status.in_(["DA_KET_THUC", "COMPLETED"]),
            )
            .order_by(ClassSession.session_number)
        ).all()

        # Nếu chưa có buổi kết thúc, lấy tất cả các buổi học của lớp để vẽ biểu đồ minh họa
        chart_sessions = (
            completed_sessions
            if completed_sessions
            else session.exec(
                select(ClassSession)
                .where(ClassSession.class_section_id == class_section.class_section_id)
                .order_by(ClassSession.session_number)
            ).all()[:10]
        )

        attendances = session.exec(
            select(Attendance)
            .join(ClassSession)
            .where(ClassSession.class_section_id == class_section.class_section_id)
        ).all()

        present_statuses = {"CO_MAT", "PRESENT"}
        late_statuses = {"DI_MUON", "MUON", "LATE"}
        absent_statuses = {"VANG", "VANG_MAT", "ABSENT"}

        present_count = len([a for a in attendances if a.status in present_statuses])
        late_count = len([a for a in attendances if a.status in late_statuses])
        total_attendance_count = len(attendances)
        average_rate = (
            round(((present_count + late_count) / total_attendance_count * 100), 1)
            if total_attendance_count > 0
            else 0.0
        )

        data_points = []
        for lesson in chart_sessions:
            lesson_attendances = [
                a for a in attendances if a.class_session_id == lesson.class_session_id
            ]
            data_points.append(
                {
                    "date": lesson.class_date.strftime("%d/%m")
                    + f" (Buổi {lesson.session_number or 1})",
                    "present": len(
                        [a for a in lesson_attendances if a.status in present_statuses]
                    ),
                    "late": len(
                        [a for a in lesson_attendances if a.status in late_statuses]
                    ),
                    "absent": len(
                        [a for a in lesson_attendances if a.status in absent_statuses]
                    ),
                }
            )

        reports.append(
            {
                "id": str(class_section.class_section_id),
                "subjectCode": f"HP{class_section.course_id}",
                "subjectName": course.course_name,
                "totalStudents": student_count,
                "completedSessions": len(completed_sessions),
                "totalSessions": total_sessions,
                "averageAttendanceRate": average_rate,
                "dataPoints": data_points,
            }
        )
    return reports
