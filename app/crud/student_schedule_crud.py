"""
Lich hoc CRUD operations.

Contains database queries for student study schedules.
"""

from datetime import date

from sqlmodel import Session, select

from app.models import (
    ClassSection,
    ClassSession,
    Course,
    CourseRegistration,
    TodayScheduleItem,
)


def get_today_schedule_by_student(
    *,
    session: Session,
    student_id: int,
    target_date: date,
    active_only: bool = False,
) -> tuple[list[TodayScheduleItem], int]:
    """Lay danh sach buoi hoc trong ngay cua sinh vien."""
    statement = (
        select(ClassSession, ClassSection, Course)
        .join(
            ClassSection, ClassSession.class_section_id == ClassSection.class_section_id
        )
        .join(Course, ClassSection.course_id == Course.course_id)
        .join(
            CourseRegistration,
            CourseRegistration.class_section_id == ClassSection.class_section_id,
        )
        .where(
            CourseRegistration.student_id == student_id,
            CourseRegistration.status.is_(True),
            ClassSection.status.is_(True),
            (ClassSession.status == "DANG_DIEN_RA") if active_only else (ClassSession.class_date == target_date),
        )
        .order_by(ClassSession.start_time, ClassSection.class_section_id)
    )

    rows = session.exec(statement).all()
    items = [
        TodayScheduleItem(
            class_session_id=class_session.class_session_id,
            class_section_id=class_section.class_section_id,
            course_name=course.course_name,
            phong_hoc="Phòng A2-301",
            start_time=class_session.start_time,
            end_time=class_session.end_time,
            status=class_session.status,
            class_date=class_session.class_date,
            session_number=class_session.session_number,
        )
        for class_session, class_section, course in rows
    ]
    return items, len(items)
