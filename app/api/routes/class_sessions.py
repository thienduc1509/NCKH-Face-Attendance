from datetime import datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func
from sqlmodel import select

from app.api.deps import (
    CurrentAccount,
    SessionDep,
    get_current_account,
    get_current_active_lecturer,
    get_current_active_superuser,
)
from app.models import (
    Appeal,
    Attendance,
    AttendanceImage,
    ClassSession,
    ClassSessionCreate,
    ClassSessionPublic,
    ClassSessionsPublic,
    ClassSessionUpdate,
    CourseRegistration,
    Message,
)
from app.services import timetable_service

router = APIRouter(prefix="/class-sessions", tags=["class-sessions"])


def _delete_attendance_for_sessions(
    session: SessionDep, session_ids: list[int]
) -> None:
    """Remove attendance records and dependent appeal/image rows for sessions."""
    if not session_ids:
        return
    att_ids = [
        aid
        for aid in session.exec(
            select(Attendance.attendance_id).where(
                Attendance.class_session_id.in_(session_ids)
            )
        ).all()
        if aid is not None
    ]
    if att_ids:
        session.execute(delete(Appeal).where(Appeal.attendance_id.in_(att_ids)))
        session.execute(
            delete(AttendanceImage).where(AttendanceImage.attendance_id.in_(att_ids))
        )
    session.execute(
        delete(Attendance).where(Attendance.class_session_id.in_(session_ids))
    )


@router.get("/", response_model=ClassSessionsPublic)
def read_class_sessions(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    items, count = timetable_service.list_lessons(
        session=session, skip=skip, limit=limit
    )
    return {"data": items, "count": count}


@router.get(
    "/class-sections/{class_section_id}",
    dependencies=[Depends(get_current_account)],
)
def read_class_sessions_by_class_section(
    session: SessionDep,
    current_account: CurrentAccount,
    class_section_id: int,
) -> Any:
    items = timetable_service.list_lessons_by_class_section(
        session=session,
        current_account=current_account,
        class_section_id=class_section_id,
    )
    # We still build details for frontend schema
    details = [
        timetable_service.get_lesson_detail(
            session=session,
            current_account=current_account,
            class_session_id=item.class_session_id,
        )
        for item in items
    ]
    return {"data": details, "count": len(items)}


@router.get("/{class_session_id}", response_model=Any)
def read_class_session(
    session: SessionDep,
    current_account: CurrentAccount,
    class_session_id: int,
) -> Any:
    return timetable_service.get_lesson_detail(
        session=session,
        current_account=current_account,
        class_session_id=class_session_id,
    )


@router.post(
    "/",
    response_model=ClassSessionPublic,
    dependencies=[Depends(get_current_active_lecturer)],
    status_code=status.HTTP_201_CREATED,
)
def create_class_session(
    session: SessionDep,
    current_account: CurrentAccount,
    item_in: ClassSessionCreate,
) -> Any:
    return timetable_service.create_lesson(
        session=session,
        current_account=current_account,
        item_in=item_in,
    )


@router.patch(
    "/{class_session_id}",
    response_model=ClassSessionPublic,
    dependencies=[Depends(get_current_active_lecturer)],
)
def update_class_session(
    session: SessionDep,
    current_account: CurrentAccount,
    class_session_id: int,
    item_in: ClassSessionUpdate,
) -> Any:
    changed_fields = item_in.model_dump(exclude_unset=True)
    if set(changed_fields) == {"status"}:
        if item_in.status == "DANG_DIEN_RA":
            return timetable_service.open_attendance(
                session=session,
                current_account=current_account,
                class_session_id=class_session_id,
            )
        if item_in.status == "DA_KET_THUC":
            return timetable_service.close_attendance(
                session=session,
                current_account=current_account,
                class_session_id=class_session_id,
            )

    return timetable_service.update_lesson(
        session=session,
        current_account=current_account,
        class_session_id=class_session_id,
        item_in=item_in,
    )


@router.delete(
    "/{class_session_id}",
    response_model=Message,
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_class_session(
    session: SessionDep,
    class_session_id: int,
) -> Any:
    return timetable_service.delete_lesson(
        session=session, class_session_id=class_session_id
    )


@router.delete(
    "/{class_session_id}/lecturer",
    response_model=ClassSessionPublic,
    dependencies=[Depends(get_current_active_lecturer)],
)
def cancel_class_session_by_lecturer(
    session: SessionDep,
    current_account: CurrentAccount,
    class_session_id: int,
) -> Any:
    return timetable_service.cancel_lesson_by_lecturer(
        session=session,
        current_account=current_account,
        class_session_id=class_session_id,
    )


@router.post(
    "/class-sections/{class_section_id}/reset-test-session",
    dependencies=[Depends(get_current_active_lecturer)],
)
def reset_and_create_test_session(
    session: SessionDep,
    current_account: CurrentAccount,
    class_section_id: int,
) -> Any:
    """Delete old sessions of a class section and open one fresh live test session."""
    timetable_service.ensure_can_manage_class_section(
        session=session,
        current_account=current_account,
        class_section_id=class_section_id,
    )
    registered_student_count = session.exec(
        select(func.count(CourseRegistration.student_id)).where(
            CourseRegistration.class_section_id == class_section_id,
            CourseRegistration.status.is_(True),
        )
    ).one()
    if registered_student_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể mở phiên test khi lớp chưa có sinh viên",
        )

    session_ids = [
        sid
        for sid in session.exec(
            select(ClassSession.class_session_id).where(
                ClassSession.class_section_id == class_section_id
            )
        ).all()
        if sid is not None
    ]
    if session_ids:
        _delete_attendance_for_sessions(session, session_ids)
        session.execute(
            delete(ClassSession).where(ClassSession.class_section_id == class_section_id)
        )

    now_vn = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    new_session = ClassSession(
        class_section_id=class_section_id,
        session_number=1,
        class_date=now_vn.date(),
        start_time=now_vn.time().replace(microsecond=0),
        end_time=time(23, 59),
        late_grace_minutes=60,
        recognition_threshold=0.6,
        status="DANG_DIEN_RA",
        note="Phiên Test Thử Nghiệm AI với Sinh Viên",
    )
    session.add(new_session)
    session.commit()
    session.refresh(new_session)
    return timetable_service.get_lesson_detail(
        session=session,
        current_account=current_account,
        class_session_id=new_session.class_session_id,
    )


@router.post(
    "/{class_session_id}/reset-attendance",
    dependencies=[Depends(get_current_active_lecturer)],
)
def reset_session_attendance(
    session: SessionDep,
    current_account: CurrentAccount,
    class_session_id: int,
) -> Any:
    """Clear attendance records for a live session so students can test again."""
    item = session.get(ClassSession, class_session_id)
    if not item:
        raise HTTPException(status_code=404, detail="Buổi học không tồn tại")

    timetable_service.ensure_can_manage_class_session(
        session=session,
        current_account=current_account,
        class_session=item,
    )
    _delete_attendance_for_sessions(session, [class_session_id])

    other_active = session.exec(
        select(ClassSession).where(
            ClassSession.class_section_id == item.class_section_id,
            ClassSession.class_session_id != class_session_id,
            ClassSession.status == "DANG_DIEN_RA",
        )
    ).all()
    for other in other_active:
        other.status = "DA_KET_THUC"
        session.add(other)

    now_vn = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    item.status = "DANG_DIEN_RA"
    item.class_date = now_vn.date()
    item.start_time = now_vn.time().replace(microsecond=0)
    item.end_time = time(23, 59)
    session.add(item)
    session.commit()
    session.refresh(item)
    return timetable_service.get_lesson_detail(
        session=session,
        current_account=current_account,
        class_session_id=item.class_session_id,
    )


@router.post(
    "/{class_session_id}/postpone",
    response_model=ClassSessionPublic,
    dependencies=[Depends(get_current_active_lecturer)],
)
def postpone_class_session(
    session: SessionDep,
    current_account: CurrentAccount,
    class_session_id: int,
    reason: str = "Giảng viên có lịch bận đột xuất",
) -> Any:
    item = session.get(ClassSession, class_session_id)
    if not item:
        raise HTTPException(status_code=404, detail="Buổi học không tồn tại")
    item.status = "HOAN_HOC"
    item.note = f"Hoãn học: {reason}"
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.get(
    "/{class_session_id}/attendance",
    dependencies=[Depends(get_current_active_lecturer)],
)
def read_class_session_attendance_list(
    session: SessionDep,
    current_account: CurrentAccount,
    class_session_id: int,
) -> Any:
    rows = timetable_service.get_lesson_attendance_list(
        session=session,
        current_account=current_account,
        class_session_id=class_session_id,
    )
    return {"data": rows, "count": len(rows)}
