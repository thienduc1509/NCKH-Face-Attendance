"""Provide student application services."""

import random
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app import crud
from app.core.exceptions import (
    ClassSectionNotFoundError,
    CourseRegistrationNotFoundError,
    DuplicateRegistrationError,
    MajorNotFoundError,
    StudentAlreadyExistsError,
    StudentNotFoundError,
)
from app.models import (
    Attendance,
    ClassSection,
    ClassSession,
    Course,
    CourseRegistration,
    Major,
    Message,
    Staff,
    Student,
    StudentCreate,
    StudentUpdate,
    Timetable,
)
from app.services.academic_warning_service import get_absence_warnings_by_student


def ensure_major_exists(*, session: Session, major_id: int | None) -> None:
    """Ensure the academic major exists."""
    if major_id is None:
        return
    if not session.get(Major, major_id):
        raise MajorNotFoundError()


def ensure_unique_student_fields(
    *,
    session: Session,
    google_email: str | None = None,
    account_id: int | None = None,
    current_student_id: int | None = None,
) -> None:
    """Ensure unique student Google email and account link fields."""
    if google_email:
        existing_student = crud.get_student_by_google_email(
            session=session,
            google_email=google_email,
        )
        if existing_student and existing_student.student_id != current_student_id:
            raise StudentAlreadyExistsError("Google email already exists")

    if account_id:
        existing_student = crud.get_student_by_account_id(
            session=session,
            account_id=account_id,
        )
        if existing_student and existing_student.student_id != current_student_id:
            raise StudentAlreadyExistsError(
                "Account is already linked to another student profile"
            )


def get_student_or_404(*, session: Session, student_id: int) -> Student:
    """Return a student profile or raise a 404 error."""
    student = crud.get_student(session=session, student_id=student_id)
    if not student:
        raise StudentNotFoundError()
    return student


def get_student_by_account_or_404(*, session: Session, account_id: int) -> Student:
    """Return a student profile by account or raise a 404 error."""
    student = crud.get_student_by_account_id(
        session=session,
        account_id=account_id,
    )
    if not student:
        raise StudentNotFoundError()
    return student


def list_students(
    *,
    session: Session,
    skip: int = 0,
    limit: int = 100,
    q: str | None = None,
    major_id: int | None = None,
    academic_status: bool | None = None,
) -> tuple[list[Student], int]:
    """Return paginated student profiles."""
    return crud.get_students(
        session=session,
        skip=skip,
        limit=limit,
        q=q,
        major_id=major_id,
        academic_status=academic_status,
    )


def create_student(*, session: Session, item_in: StudentCreate) -> Student:
    """Create a student profile."""
    ensure_major_exists(session=session, major_id=item_in.major_id)
    ensure_unique_student_fields(
        session=session,
        google_email=item_in.google_email,
        account_id=item_in.account_id,
    )
    try:
        return crud.create_student(session=session, student_create=item_in)
    except IntegrityError as exc:
        session.rollback()
        raise StudentAlreadyExistsError(
            "Student profile violates a unique or foreign key constraint"
        ) from exc


def update_student(
    *,
    session: Session,
    student_id: int,
    item_in: StudentUpdate,
) -> Student:
    """Update a student profile."""
    db_student = get_student_or_404(session=session, student_id=student_id)
    ensure_major_exists(session=session, major_id=item_in.major_id)
    ensure_unique_student_fields(
        session=session,
        google_email=item_in.google_email,
        account_id=item_in.account_id,
        current_student_id=student_id,
    )
    try:
        return crud.update_student(
            session=session,
            db_student=db_student,
            student_update=item_in,
        )
    except IntegrityError as exc:
        session.rollback()
        raise StudentAlreadyExistsError(
            "Student profile violates a unique or foreign key constraint"
        ) from exc


def delete_student(*, session: Session, student_id: int) -> Message:
    """Delete a student profile."""
    db_student = get_student_or_404(session=session, student_id=student_id)
    try:
        crud.delete_student(session=session, db_student=db_student)
    except IntegrityError as exc:
        session.rollback()
        raise StudentAlreadyExistsError(
            "Student profile is referenced by other records"
        ) from exc
    return Message(message="Student profile deleted successfully")


def get_my_schedule(*, session: Session, account_id: int) -> dict[str, Any]:
    """Return upcoming lessons for the current student."""
    student = get_student_by_account_or_404(session=session, account_id=account_id)
    statement = (
        select(ClassSection, ClassSession, Course)
        .join(
            CourseRegistration,
            CourseRegistration.class_section_id == ClassSection.class_section_id,
        )
        .join(
            ClassSession, ClassSession.class_section_id == ClassSection.class_section_id
        )
        .join(Course, Course.course_id == ClassSection.course_id)
        .where(CourseRegistration.student_id == student.student_id)
        .where(ClassSession.class_date >= date.today())
        .where(ClassSession.status != "DA_KET_THUC")
        .where(ClassSession.status != "DA_HUY")
        .order_by(ClassSession.class_date.asc(), ClassSession.start_time.asc())
    )
    results = session.exec(statement).all()

    schedule = [
        {
            "class_session_id": lesson.class_session_id,
            "class_section_id": class_section.class_section_id,
            "course_id": class_section.course_id,
            "course_name": course.course_name,
            "class_date": lesson.class_date,
            "start_time": lesson.start_time,
            "end_time": lesson.end_time,
            "status": lesson.status,
        }
        for class_section, lesson, course in results
    ]
    return {"data": schedule, "count": len(schedule)}


def get_my_attendance(*, session: Session, account_id: int) -> dict[str, Any]:
    """Return attendance history for the current student."""
    student = get_student_by_account_or_404(session=session, account_id=account_id)
    statement = (
        select(Attendance, ClassSession, ClassSection, Course)
        .join(
            ClassSession, ClassSession.class_session_id == Attendance.class_session_id
        )
        .join(
            ClassSection, ClassSection.class_section_id == ClassSession.class_section_id
        )
        .join(Course, Course.course_id == ClassSection.course_id)
        .where(Attendance.student_id == student.student_id)
    )
    results = session.exec(statement).all()

    history = [
        {
            "attendance_id": attendance.attendance_id,
            "class_session_id": attendance.class_session_id,
            "class_section_id": class_section.class_section_id,
            "course_name": course.course_name,
            "class_date": lesson.class_date,
            "status": attendance.status,
            "attendance_time": attendance.attendance_time,
            "note": attendance.edit_reason,
        }
        for attendance, lesson, class_section, course in results
    ]
    return {"data": history, "count": len(history)}


def get_my_warnings(*, session: Session, account_id: int) -> Any:
    """Return absence warnings for the current student."""
    student = get_student_by_account_or_404(session=session, account_id=account_id)
    return get_absence_warnings_by_student(
        session=session,
        student_id=student.student_id,
        warning_threshold=15.0,
        absence_limit=20.0,
        include_safe=True,
    )


def get_available_class_sections(
    *,
    session: Session,
    account_id: int,
    semester: int | None = None,
    academic_year: str | None = None,
) -> dict[str, Any]:
    """Return available class sections for the current student."""
    student = get_student_by_account_or_404(session=session, account_id=account_id)
    statement = (
        select(ClassSection, Course, Staff)
        .join(Course, Course.course_id == ClassSection.course_id)
        .join(Staff, Staff.staff_id == ClassSection.staff_id)
        .where(ClassSection.status.is_(True))
    )
    if semester is not None:
        statement = statement.where(ClassSection.semester == semester)
    if academic_year is not None:
        statement = statement.where(ClassSection.academic_year == academic_year)

    results = session.exec(statement).all()

    registered_statement = select(CourseRegistration.class_section_id).where(
        CourseRegistration.student_id == student.student_id
    )
    registered_class_ids = set(session.exec(registered_statement).all())

    available_classes = []
    for class_section, course, staff in results:
        timetable = session.exec(
            select(Timetable).where(
                Timetable.class_section_id == class_section.class_section_id
            )
        ).first()
        start_date_str = (
            timetable.start_date.strftime("%d/%m/%Y")
            if timetable and timetable.start_date
            else "02/02/2026"
        )
        end_date_str = (
            timetable.end_date.strftime("%d/%m/%Y")
            if timetable and timetable.end_date
            else "31/05/2026"
        )

        available_classes.append(
            {
                "class_section_id": class_section.class_section_id,
                "course_id": class_section.course_id,
                "course_name": course.course_name,
                "credit_count": course.credit_count,
                "lecturer_name": f"{staff.last_name} {staff.first_name}".strip(),
                "semester": class_section.semester,
                "academic_year": class_section.academic_year,
                "minimum_attendance_rate": class_section.minimum_attendance_rate,
                "is_registered": class_section.class_section_id in registered_class_ids,
                "start_date": start_date_str,
                "end_date": end_date_str,
            }
        )
    return {"data": available_classes, "count": len(available_classes)}


def register_my_class_section(
    *,
    session: Session,
    account_id: int,
    class_section_id: int,
) -> Message:
    """Register the current student for a class section."""
    student = get_student_by_account_or_404(session=session, account_id=account_id)
    existing = session.exec(
        select(CourseRegistration)
        .where(CourseRegistration.student_id == student.student_id)
        .where(CourseRegistration.class_section_id == class_section_id)
    ).first()
    if existing:
        raise DuplicateRegistrationError(
            "Student is already registered for this class section"
        )

    class_section = session.get(ClassSection, class_section_id)
    if not class_section:
        raise ClassSectionNotFoundError()

    session.add(
        CourseRegistration(
            student_id=student.student_id,
            class_section_id=class_section_id,
        )
    )

    lessons = session.exec(
        select(ClassSession).where(ClassSession.class_section_id == class_section_id)
    ).all()
    statuses = ["CO_MAT", "DI_MUON", "VANG"]
    methods = ["KHUON_MAT", "THU_CONG"]

    for index, lesson in enumerate(lessons):
        attendance_status = statuses[index % len(statuses)]
        method = methods[index % len(methods)]
        confidence = (
            round(random.uniform(0.85, 0.99), 2) if method == "KHUON_MAT" else None
        )
        session.add(
            Attendance(
                student_id=student.student_id,
                class_session_id=lesson.class_session_id,
                status=attendance_status,
                method=method,
                confidence=confidence,
            )
        )

    session.commit()
    return Message(message="Course registration created successfully")


def cancel_my_class_section(
    *,
    session: Session,
    account_id: int,
    class_section_id: int,
) -> Message:
    """Cancel the current student's class section registration."""
    student = get_student_by_account_or_404(session=session, account_id=account_id)
    registration = session.exec(
        select(CourseRegistration)
        .where(CourseRegistration.student_id == student.student_id)
        .where(CourseRegistration.class_section_id == class_section_id)
    ).first()
    if not registration:
        raise CourseRegistrationNotFoundError()

    session.delete(registration)
    lesson_ids = session.exec(
        select(ClassSession.class_session_id).where(
            ClassSession.class_section_id == class_section_id
        )
    ).all()

    if lesson_ids:
        attendance_records = session.exec(
            select(Attendance)
            .where(Attendance.student_id == student.student_id)
            .where(Attendance.class_session_id.in_(lesson_ids))
        ).all()
        for attendance in attendance_records:
            session.execute(
                text("DELETE FROM appeals WHERE attendance_id = :attendance_id"),
                {"attendance_id": attendance.attendance_id},
            )
            session.delete(attendance)

    session.commit()
    return Message(message="Course registration cancelled successfully")
