"""Create fictional local demo records without replacing existing data."""
from datetime import datetime, timedelta, time, timezone
from zoneinfo import ZoneInfo
from sqlmodel import Session, select
from app.core.db import engine
from app.core.security import get_password_hash
from app.models import Account, Staff, Student, Major, Course, ClassSection, ClassSession, CourseRegistration, Attendance, Timetable

PASSWORD = "DemoLocal2026!"
today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()

def ensure(session, model, filters, values):
    query = select(model)
    for key, value in filters.items():
        query = query.where(getattr(model, key) == value)
    row = session.exec(query).first()
    if row is None:
        row = model(**filters, **values)
        session.add(row)
        session.flush()
    return row

with Session(engine) as s:
    major = ensure(s, Major, {"major_name": "CNTT - DEMO NCKH"}, {"description": "Du lieu gia lap de trinh dien"})
    lecturer = ensure(s, Account, {"username": "gv.demo@example.com"}, {"role": "GIANG_VIEN", "password_hash": get_password_hash(PASSWORD)})
    staff = ensure(s, Staff, {"account_id": lecturer.account_id}, {"last_name": "Giang vien", "first_name": "Demo", "position": "Giảng viên", "google_email": "gv.demo@example.com"})
    students = []
    names = [("Nguyễn Văn", "An"), ("Trần Thị", "Bình"), ("Lê Minh", "Châu"), ("Phạm Hoàng", "Dũng"), ("Võ Ngọc", "Hà")]
    for i, (last, first) in enumerate(names, 1):
        account = ensure(s, Account, {"username": f"sv.demo{i:02d}@example.com"}, {"role": "SINH_VIEN", "password_hash": get_password_hash(PASSWORD)})
        student = ensure(s, Student, {"account_id": account.account_id}, {"last_name": last, "first_name": first, "major_id": major.major_id, "google_email": account.username})
        students.append(student)
    for index, name in enumerate(["[DEMO] Trí tuệ nhân tạo", "[DEMO] Cơ sở dữ liệu"]):
        course = ensure(s, Course, {"course_name": name}, {"credit_count": 3, "description": "Dữ liệu giả lập phục vụ báo cáo tiến độ"})
        section = ensure(s, ClassSection, {"course_id": course.course_id, "staff_id": staff.staff_id}, {"semester": 1, "academic_year": "2026-2027", "minimum_attendance_rate": 0.8})
        for student in students:
            ensure(s, CourseRegistration, {"student_id": student.student_id, "class_section_id": section.class_section_id}, {})
        ensure(s, Timetable, {"class_section_id": section.class_section_id}, {"weekday": today.isoweekday() + 1, "start_time": time(7), "end_time": time(23,59), "start_date": today-timedelta(days=30), "end_date": today+timedelta(days=90)})
        for n in range(1, 4):
            day = today-timedelta(days=7*(4-n))
            lesson = ensure(s, ClassSession, {"class_section_id": section.class_section_id, "session_number": n}, {"class_date": day, "start_time": time(7), "end_time": time(9), "status": "DA_KET_THUC", "note": "DEMO - số liệu giả lập"})
            for j, student in enumerate(students):
                status = ["CO_MAT", "CO_MAT", "DI_MUON", "VANG", "CO_MAT"][(j+n+index)%5]
                ensure(s, Attendance, {"student_id": student.student_id, "class_session_id": lesson.class_session_id}, {"status": status, "method": "THU_CONG", "attendance_time": datetime.combine(day,time(7,5), tzinfo=timezone.utc) if status != "VANG" else None, "edit_reason": "DEMO: bản ghi giả lập để kiểm tra báo cáo"})
        lesson = ensure(s, ClassSession, {"class_section_id": section.class_section_id, "session_number": 4}, {"class_date": today, "start_time": time(0), "end_time": time(23,59), "status": "CHUA_BAT_DAU", "note": "DEMO - buổi thử camera, chưa có điểm danh"})
        print(f"Class {section.class_section_id}: {name}; camera session {lesson.class_session_id}")
    s.commit()
    print("Demo seed complete: 1 lecturer, 5 students, 2 classes, 8 sessions, 30 simulated attendance records. No face images enrolled.")
