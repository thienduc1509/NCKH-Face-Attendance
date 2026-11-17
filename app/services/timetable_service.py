"""Provide timetable application services."""

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlmodel import Session

from app.core.exceptions import (
    ClassSectionNotFoundError,
    LessonClosedError,
    LessonCompletedError,
    LessonNotFoundError,
    PermissionDeniedError,
    TimetableNotFoundError,
)
from app.crud import timetable_crud
from app.models import Message, Timetable, TimetableCreate, TimetableUpdate


def list_timetables(
    *,
    session: Session,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Timetable], int]:
    """Return paginated timetables."""
    return timetable_crud.get_timetables(
        session=session,
        skip=skip,
        limit=limit,
    )


def get_timetable_or_404(
    *,
    session: Session,
    timetable_id: int,
) -> Timetable:
    """Return a timetable or raise a 404 error."""
    item = timetable_crud.get_timetable(
        session=session,
        timetable_id=timetable_id,
    )
    if not item:
        raise TimetableNotFoundError()
    return item


def create_timetable(
    *,
    session: Session,
    item_in: TimetableCreate,
) -> Timetable:
    """Create a timetable."""
    return timetable_crud.create_timetable(
        session=session,
        item_create=item_in,
    )


def update_timetable(
    *,
    session: Session,
    timetable_id: int,
    item_in: TimetableUpdate,
) -> Timetable:
    """Update a timetable."""
    item = get_timetable_or_404(
        session=session,
        timetable_id=timetable_id,
    )
    return timetable_crud.update_timetable(
        session=session,
        db_item=item,
        item_update=item_in,
    )


def delete_timetable(*, session: Session, timetable_id: int) -> Message:
    """Delete a timetable."""
    item = get_timetable_or_404(
        session=session,
        timetable_id=timetable_id,
    )
    timetable_crud.delete_timetable(session=session, db_item=item)
    return Message(message="Timetable deleted successfully")


# Validation Helpers
def ensure_can_manage_class_section(
    *,
    session: Session,
    current_account: Any,
    class_section_id: int,
) -> Any:
    from app.crud import staff_crud
    from app.models import ClassSection

    class_section = session.get(ClassSection, class_section_id)
    if not class_section:
        raise ClassSectionNotFoundError("Lop hoc phan khong ton tai")

    staff = staff_crud.get_staff_member_by_account_id(
        session=session,
        account_id=current_account.account_id,
    )
    if current_account.role not in {"ADMIN", "admin", "SINH_VIEN", "STUDENT"} and (
        not staff or class_section.staff_id != staff.staff_id
    ):
        raise PermissionDeniedError("Khong co quyen thao tac tren lop hoc phan nay")
    return class_section


def ensure_can_manage_class_session(
    *,
    session: Session,
    current_account: Any,
    class_session: Any,
) -> Any:
    return ensure_can_manage_class_section(
        session=session,
        current_account=current_account,
        class_section_id=class_session.class_section_id,
    )


# Lesson Service Methods
def list_lessons(
    *,
    session: Session,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Return paginated lessons list."""
    from app.crud import class_session_crud

    return class_session_crud.get_class_sessions(
        session=session, skip=skip, limit=limit
    )


def list_lessons_by_class_section(
    *,
    session: Session,
    current_account: Any,
    class_section_id: int,
) -> list[Any]:
    """Return lessons for a specific class section."""
    from sqlmodel import select

    from app.models import ClassSession

    # Validate access
    ensure_can_manage_class_section(
        session=session,
        current_account=current_account,
        class_section_id=class_section_id,
    )
    statement = select(ClassSession).where(
        ClassSession.class_section_id == class_section_id
    )
    return session.exec(statement).all()


def get_lesson_detail(
    *,
    session: Session,
    current_account: Any,
    class_session_id: int,
) -> dict[str, Any]:
    """Return detailed lesson info."""
    from app.crud import class_session_crud
    from app.models import ClassSection, Course, Staff

    item = class_session_crud.get_class_session(
        session=session, class_session_id=class_session_id
    )
    if not item:
        raise LessonNotFoundError("Buoi hoc khong ton tai")

    ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=item,
    )
    class_section = session.get(ClassSection, item.class_section_id)
    course = session.get(Course, class_section.course_id) if class_section else None
    staff = session.get(Staff, class_section.staff_id) if class_section else None

    result = item.model_dump()
    result["class_session_id"] = item.class_session_id
    result["course_name"] = course.course_name if course else "N/A"
    result["lecturer_name"] = (
        f"{staff.last_name} {staff.first_name}".strip() if staff else "N/A"
    )
    return result


def create_lesson(
    *,
    session: Session,
    current_account: Any,
    item_in: Any,
) -> Any:
    """Create a lesson."""
    from app.crud import class_session_crud

    ensure_can_manage_class_section(
        session=session,
        current_account=current_account,
        class_section_id=item_in.class_section_id,
    )
    if not item_in.status:
        item_in.status = "CHUA_DIEM_DANH"
    return class_session_crud.create_class_session(session=session, item_create=item_in)


def update_lesson(
    *,
    session: Session,
    current_account: Any,
    class_session_id: int,
    item_in: Any,
) -> Any:
    """Update a lesson."""
    from app.crud import class_session_crud

    item = class_session_crud.get_class_session(
        session=session, class_session_id=class_session_id
    )
    if not item:
        raise LessonNotFoundError("Buoi hoc khong ton tai")

    ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=item,
    )
    if item_in.class_section_id and item_in.class_section_id != item.class_section_id:
        ensure_can_manage_class_section(
            session=session,
            current_account=current_account,
            class_section_id=item_in.class_section_id,
        )
    return class_session_crud.update_class_session(
        session=session, db_item=item, item_update=item_in
    )


def delete_lesson(
    *,
    session: Session,
    class_session_id: int,
) -> Message:
    """Delete a lesson."""
    from app.crud import class_session_crud

    item = class_session_crud.get_class_session(
        session=session, class_session_id=class_session_id
    )
    if not item:
        raise LessonNotFoundError("Buoi hoc khong ton tai")
    class_session_crud.delete_class_session(session=session, db_item=item)
    return Message(message="Xoa buoi hoc thanh cong")


def open_attendance(
    *,
    session: Session,
    current_account: Any,
    class_session_id: int,
) -> Any:
    """Open attendance for a lesson."""
    from sqlmodel import select

    from app.crud import class_session_crud
    from app.models import ClassSession

    item = class_session_crud.get_class_session(
        session=session, class_session_id=class_session_id
    )
    if not item:
        raise LessonNotFoundError("Buoi hoc khong ton tai")

    ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=item,
    )
    if item.status == "DA_HUY":
        raise LessonClosedError()

    other_active_sessions = session.exec(
        select(ClassSession).where(
            ClassSession.class_section_id == item.class_section_id,
            ClassSession.class_session_id != item.class_session_id,
            ClassSession.status == "DANG_DIEN_RA",
        )
    ).all()
    for other_session in other_active_sessions:
        other_session.status = "DA_KET_THUC"
        session.add(other_session)

    now_vn = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    item.status = "DANG_DIEN_RA"
    item.class_date = now_vn.date()
    item.start_time = now_vn.time().replace(microsecond=0)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def close_attendance(
    *,
    session: Session,
    current_account: Any,
    class_session_id: int,
) -> Any:
    """Close attendance for a lesson."""
    from app.crud import attendance_crud, class_session_crud

    item = class_session_crud.get_class_session(
        session=session, class_session_id=class_session_id
    )
    if not item:
        raise LessonNotFoundError("Buoi hoc khong ton tai")

    ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=item,
    )

    item.status = "DA_KET_THUC"
    session.add(item)
    session.commit()
    session.refresh(item)
    try:
        attendance_crud.finalize_absent_attendance(session=session, class_session=item)
    except Exception as e:
        print("Warning finalizing absent attendance:", e)
    return item


def cancel_lesson_by_lecturer(
    *,
    session: Session,
    current_account: Any,
    class_session_id: int,
) -> Any:
    """Cancel a lesson by a teacher/lecturer."""
    from app.crud import class_session_crud

    item = class_session_crud.get_class_session(
        session=session, class_session_id=class_session_id
    )
    if not item:
        raise LessonNotFoundError("Buoi hoc khong ton tai")

    ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=item,
    )
    if item.status == "DA_KET_THUC":
        raise LessonCompletedError()

    item.status = "DA_HUY"
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def get_lesson_attendance_list(
    *,
    session: Session,
    current_account: Any,
    class_session_id: int,
) -> list[dict[str, Any]]:
    """Return attendance list for a lesson."""
    from sqlmodel import select

    from app.models import (
        Attendance,
        AttendanceImage,
        ClassSession,
        CourseRegistration,
        Student,
    )

    class_session = session.get(ClassSession, class_session_id)
    if not class_session:
        raise LessonNotFoundError("Buoi hoc khong ton tai")

    ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=class_session,
    )

    student_statement = (
        select(Student)
        .join(CourseRegistration, CourseRegistration.student_id == Student.student_id)
        .where(CourseRegistration.class_section_id == class_session.class_section_id)
    )
    students = session.exec(student_statement).all()

    attendance_statement = select(Attendance).where(
        Attendance.class_session_id == class_session_id
    )
    attendances = session.exec(attendance_statement).all()
    attendance_map = {attendance.student_id: attendance for attendance in attendances}

    result = []
    for student in students:
        attendance = attendance_map.get(student.student_id)
        status = attendance.status if attendance else "CHUA_DIEM_DANH"
        note = attendance.edit_reason if attendance else None

        # Check if attendance proof image exists
        evidence_path = None
        if attendance:
            evidence_statement = (
                select(AttendanceImage)
                .where(AttendanceImage.attendance_id == attendance.attendance_id)
                .order_by(AttendanceImage.created_at.desc())
            )
            evidence = session.exec(evidence_statement).first()
            evidence_path = evidence.image_path if evidence else None

        result.append(
            {
                "student_id": student.student_id,
                "last_name": student.last_name,
                "first_name": student.first_name,
                "class_section_id": class_session.class_section_id,
                "status": status,
                "note": note,
                "evidence_image": evidence_path,
            }
        )
    return result
