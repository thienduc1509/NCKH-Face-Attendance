"""Create fictional local demo records without replacing existing data."""

import sys

# Configure UTF-8 encoding for standard streams to prevent Windows console encoding crashes
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.core.db import engine
from app.core.security import get_password_hash
from app.models import (
    Account,
    Attendance,
    ClassSection,
    ClassSession,
    Course,
    CourseRegistration,
    Major,
    Staff,
    Student,
    Timetable,
)

PASSWORD = "DemoLocal2026!"


def ensure(session: Session, model: type, filters: dict, values: dict):
    """Ensure a record exists matching filters; create or update it with values."""
    query = select(model)
    for key, value in filters.items():
        query = query.where(getattr(model, key) == value)
    row = session.exec(query).first()
    if row is None:
        row = model(**filters, **values)
        session.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
        session.add(row)
    session.flush()
    return row


def seed_demo_data(session: Session | None = None) -> None:
    """Seed sample academic data for demonstration and testing."""
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()

    own_session = False
    if session is None:
        session = Session(engine)
        own_session = True

    try:
        major = ensure(
            session,
            Major,
            {"major_name": "CNTT - DEMO NCKH"},
            {"description": "Dữ liệu giả lập để trình diễn"},
        )
        lecturer = ensure(
            session,
            Account,
            {"username": "gv.demo@example.com"},
            {"role": "GIANG_VIEN", "password_hash": get_password_hash(PASSWORD)},
        )
        staff = ensure(
            session,
            Staff,
            {"account_id": lecturer.account_id},
            {
                "last_name": "Giảng viên",
                "first_name": "Demo",
                "position": "Giảng viên",
                "google_email": "gv.demo@example.com",
            },
        )

        students = []
        names = [
            ("Nguyễn Văn", "An"),
            ("Trần Thị", "Bình"),
            ("Lê Minh", "Châu"),
            ("Phạm Hoàng", "Dũng"),
            ("Võ Ngọc", "Hà"),
        ]
        for i, (last, first) in enumerate(names, 1):
            account = ensure(
                session,
                Account,
                {"username": f"sv.demo{i:02d}@example.com"},
                {"role": "SINH_VIEN", "password_hash": get_password_hash(PASSWORD)},
            )
            student = ensure(
                session,
                Student,
                {"account_id": account.account_id},
                {
                    "last_name": last,
                    "first_name": first,
                    "major_id": major.major_id,
                    "google_email": account.username,
                },
            )
            students.append(student)

        course_names = ["[DEMO] Trí tuệ nhân tạo", "[DEMO] Cơ sở dữ liệu"]
        existing_demo_courses = session.exec(
            select(Course).where(Course.course_name.like("[DEMO]%")).order_by(Course.course_id)
        ).all()
        for idx, fixed_name in enumerate(course_names):
            if idx < len(existing_demo_courses) and "?" in (existing_demo_courses[idx].course_name or ""):
                existing_demo_courses[idx].course_name = fixed_name
                session.add(existing_demo_courses[idx])
        session.flush()

        for index, name in enumerate(course_names):
            course = ensure(
                session,
                Course,
                {"course_name": name},
                {"credit_count": 3, "description": "Dữ liệu giả lập phục vụ báo cáo tiến độ"},
            )
            section = ensure(
                session,
                ClassSection,
                {"course_id": course.course_id, "staff_id": staff.staff_id},
                {
                    "semester": 1,
                    "academic_year": "2026-2027",
                    "minimum_attendance_rate": 0.8,
                },
            )
            for student in students:
                ensure(
                    session,
                    CourseRegistration,
                    {
                        "student_id": student.student_id,
                        "class_section_id": section.class_section_id,
                    },
                    {},
                )
            ensure(
                session,
                Timetable,
                {"class_section_id": section.class_section_id},
                {
                    "weekday": today.isoweekday() + 1,
                    "start_time": time(7),
                    "end_time": time(23, 59),
                    "start_date": today - timedelta(days=30),
                    "end_date": today + timedelta(days=90),
                },
            )
            for n in range(1, 4):
                day = today - timedelta(days=7 * (4 - n))
                lesson = ensure(
                    session,
                    ClassSession,
                    {"class_section_id": section.class_section_id, "session_number": n},
                    {
                        "class_date": day,
                        "start_time": time(7),
                        "end_time": time(9),
                        "status": "DA_KET_THUC",
                        "note": "DEMO - số liệu giả lập",
                    },
                )
                for j, student in enumerate(students):
                    status = ["CO_MAT", "CO_MAT", "DI_MUON", "VANG", "CO_MAT"][(j + n + index) % 5]
                    ensure(
                        session,
                        Attendance,
                        {
                            "student_id": student.student_id,
                            "class_session_id": lesson.class_session_id,
                        },
                        {
                            "status": status,
                            "method": "THU_CONG",
                            "attendance_time": (
                                datetime.combine(day, time(7, 5), tzinfo=UTC)
                                if status != "VANG"
                                else None
                            ),
                            "edit_reason": "DEMO: bản ghi giả lập để kiểm tra báo cáo",
                        },
                    )
            lesson = ensure(
                session,
                ClassSession,
                {"class_section_id": section.class_section_id, "session_number": 4},
                {
                    "class_date": today,
                    "start_time": time(0),
                    "end_time": time(23, 59),
                    "status": "CHUA_BAT_DAU",
                    "note": "DEMO - buổi thử camera, chưa có điểm danh",
                },
            )
            print(f"Class {section.class_section_id}: {name}; camera session {lesson.class_session_id}")

        session.commit()
        print(
            "Demo seed complete: 1 lecturer, 5 students, 2 classes, 8 sessions, "
            "30 simulated attendance records. No face images enrolled."
        )
    finally:
        if own_session:
            session.close()


if __name__ == "__main__":
    seed_demo_data()
