from collections.abc import Generator
from datetime import date, datetime, time

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.api.deps import (
    get_current_account,
    get_current_active_lecturer,
    get_current_active_superuser,
    get_db,
)
from app.main import app
from app.models import (
    Account,
    Appeal,
    Attendance,
    ClassSection,
    ClassSession,
    Course,
    CourseRegistration,
    Major,
    Semester,
    Staff,
    Student,
    Timetable,
)


def make_test_client() -> Generator[tuple[TestClient, Session], None, None]:
    """Tạo TestClient dùng SQLite in-memory để kiểm tra router cán bộ."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(
        engine,
        tables=[
            Account.__table__,
            Staff.__table__,
            Course.__table__,
            ClassSection.__table__,
            Timetable.__table__,
            ClassSession.__table__,
            Major.__table__,
            Student.__table__,
            Attendance.__table__,
            Appeal.__table__,
            Semester.__table__,
            CourseRegistration.__table__,
        ],
    )

    with Session(engine) as session:
        superuser = Account(
            account_id=1,
            username="admin",
            password_hash="hashed-password",
            role="ADMIN",
            status=True,
        )
        lecturer = Account(
            account_id=2,
            username="lecturer",
            password_hash="hashed-password",
            role="GIANG_VIEN",
            status=True,
        )
        session.add(lecturer)
        lecturer_2 = Account(
            account_id=3,
            username="lecturer_2",
            password_hash="hashed-password",
            role="GIANG_VIEN",
            status=True,
        )
        session.add(lecturer_2)
        session.commit()

        # Link any seeded staff profiles in test database to lecturer account
        from sqlalchemy import event

        @event.listens_for(session, "before_flush")
        def set_staff_account_id(sess, flush_context, instances):
            for obj in sess.new:
                if isinstance(obj, Staff) and obj.account_id is None:
                    obj.account_id = 2

        def override_get_db():
            """Cung cấp session test thay cho database thật."""
            yield session

        def override_superuser():
            """Bỏ qua xác thực thật và giả lập admin cho test router."""
            return superuser

        def override_lecturer():
            """Bỏ qua xác thực giảng viên cho test router."""
            return lecturer

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_active_superuser] = override_superuser
        app.dependency_overrides[get_current_active_lecturer] = override_lecturer
        app.dependency_overrides[get_current_account] = override_lecturer
        with TestClient(app) as client:
            yield client, session
        app.dependency_overrides.clear()


def test_staff_crud_flow() -> None:
    """Kiểm tra đủ luồng thêm, tìm kiếm, sửa và xóa cán bộ."""
    for client, _session in make_test_client():
        create_response = client.post(
            "/api/staff/",
            json={
                "last_name": "Nguyen",
                "first_name": "An",
                "google_email": "an@example.edu",
                "phone": "0900000000",
                "position": "Giang vien",
            },
        )
        created = create_response.json()

        list_response = client.get("/api/staff/", params={"q": "An"})
        detail_response = client.get(f"/api/staff/{created['staff_id']}")
        update_response = client.patch(
            f"/api/staff/{created['staff_id']}",
            json={"position": "Truong bo mon"},
        )
        delete_response = client.delete(f"/api/staff/{created['staff_id']}")
        after_delete_response = client.get(f"/api/staff/{created['staff_id']}")

        assert create_response.status_code == 201
        assert created["last_name"] == "Nguyen"
        assert created["first_name"] == "An"
        assert list_response.status_code == 200
        assert list_response.json()["count"] == 1
        assert detail_response.status_code == 200
        assert update_response.status_code == 200
        assert update_response.json()["position"] == "Truong bo mon"
        assert delete_response.status_code == 200
        assert after_delete_response.status_code == 404


def test_create_staff_rejects_duplicate_google_email() -> None:
    """Kiểm tra không cho tạo hai cán bộ cùng Google email."""
    for client, _session in make_test_client():
        payload = {
            "last_name": "Tran",
            "first_name": "Binh",
            "google_email": "binh@example.edu",
        }

        first_response = client.post("/api/staff/", json=payload)
        second_response = client.post(
            "/api/staff/",
            json={**payload, "first_name": "Binh 2"},
        )

        assert first_response.status_code == 201
        assert second_response.status_code == 409
        assert second_response.json()["message"] == "Google email already exists"


def test_read_staff_teaching_schedule_returns_teaching_schedule() -> None:
    """Kiểm tra API lịch dạy trả về buổi học của giảng viên theo mã cán bộ."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Le", first_name="Cuong", google_ten_dang_nhap="cuong@example.edu"
        )
        course = Course(
            course_id=101,
            course_name="Co so du lieu",
            credit_count=3,
            status=True,
        )
        session.add(staff)
        session.add(course)
        session.commit()
        session.refresh(staff)

        class_section = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        session.add(class_section)
        session.commit()
        session.refresh(class_section)

        timetable = Timetable(
            class_section_id=class_section.class_section_id,
            weekday=2,
            start_period=1,
            end_period=3,
            start_time=time(7, 0),
            end_time=time(9, 30),
            start_date=date(2025, 9, 1),
            end_date=date(2025, 12, 31),
        )
        class_session = ClassSession(
            class_section_id=class_section.class_section_id,
            class_date=date(2025, 9, 8),
            start_time=time(7, 0),
            end_time=time(9, 30),
            session_number=1,
            status="DA_KET_THUC",
            note="Buoi hoc dau tien",
        )
        session.add(timetable)
        session.add(class_session)
        session.commit()

        response = client.get(
            f"/api/staff/{staff.staff_id}/teaching-schedule",
            params={
                "from_date": "2025-09-01",
                "to_date": "2025-09-30",
                "semester": 1,
                "academic_year": "2025-2026",
            },
        )
        body = response.json()

        assert response.status_code == 200
        assert body["count"] == 1
        assert body["data"][0]["staff_id"] == staff.staff_id
        assert body["data"][0]["class_section_id"] == class_section.class_section_id
        assert body["data"][0]["course_name"] == "Co so du lieu"
        assert body["data"][0]["class_session_id"] is not None
        assert body["data"][0]["timetable_id"] is not None
        assert body["data"][0]["class_date"] == "2025-09-08"
        assert body["data"][0]["class_session_status"] == "DA_KET_THUC"


def test_read_staff_teaching_schedule_rejects_invalid_date_range() -> None:
    """Kiểm tra API lịch dạy từ chối khoảng ngày không hợp lệ."""
    for client, _session in make_test_client():
        response = client.get(
            "/api/staff/1/teaching-schedule",
            params={"from_date": "2025-10-01", "to_date": "2025-09-01"},
        )

        assert response.status_code == 400
        assert (
            response.json()["message"] == "from_date must be before or equal to to_date"
        )


def test_reset_test_session_rejects_class_without_active_students() -> None:
    """Không xóa buổi cũ khi lớp không có sinh viên đăng ký hợp lệ."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Nguyen",
            first_name="Giang",
            google_ten_dang_nhap="giang@example.edu",
            account_id=2,
        )
        course = Course(
            course_id=701,
            course_name="Tri tue nhan tao",
            credit_count=3,
            status=True,
        )
        session.add_all([staff, course])
        session.commit()
        session.refresh(staff)

        class_section = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        session.add(class_section)
        session.commit()
        session.refresh(class_section)

        old_session = ClassSession(
            class_section_id=class_section.class_section_id,
            class_date=date(2025, 10, 20),
            status="CHUA_DIEM_DANH",
        )
        session.add(old_session)
        session.commit()
        session.refresh(old_session)

        response = client.post(
            f"/api/class-sessions/class-sections/{class_section.class_section_id}/reset-test-session",
            json={},
        )

        assert response.status_code == 400
        assert (
            response.json()["detail"]
            == "Không thể mở phiên test khi lớp chưa có sinh viên"
        )
        assert session.get(ClassSession, old_session.class_session_id) is not None


def test_reset_test_session_opens_when_active_student_exists() -> None:
    """Lớp có sinh viên đăng ký hợp lệ vẫn mở được phiên test mới."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Nguyen",
            first_name="Giang",
            google_ten_dang_nhap="giang@example.edu",
            account_id=2,
        )
        major = Major(major_name="Cong nghe thong tin")
        course = Course(
            course_id=703,
            course_name="Tri tue nhan tao",
            credit_count=3,
            status=True,
        )
        session.add_all([staff, major, course])
        session.commit()
        session.refresh(staff)
        session.refresh(major)

        student = Student(
            last_name="Le",
            first_name="An",
            major_id=major.major_id,
        )
        session.add(student)
        session.commit()
        session.refresh(student)

        class_section = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        session.add(class_section)
        session.commit()
        session.refresh(class_section)
        session.add(
            CourseRegistration(
                student_id=student.student_id,
                class_section_id=class_section.class_section_id,
                status=True,
            )
        )
        old_session = ClassSession(
            class_section_id=class_section.class_section_id,
            class_date=date(2025, 10, 20),
            status="CHUA_DIEM_DANH",
        )
        session.add(old_session)
        session.commit()
        session.refresh(old_session)

        response = client.post(
            f"/api/class-sessions/class-sections/{class_section.class_section_id}/reset-test-session",
            json={},
        )
        body = response.json()

        assert response.status_code == 200
        assert body["class_session_id"] is not None
        assert body["status"] == "DANG_DIEN_RA"
        assert body["class_date"] != old_session.class_date.isoformat()
        remaining_sessions = session.exec(
            select(ClassSession).where(
                ClassSession.class_section_id == class_section.class_section_id
            )
        ).all()
        assert len(remaining_sessions) == 1


def test_read_my_class_sections_counts_only_active_registrations() -> None:
    """Sĩ số hiển thị chỉ tính các lượt đăng ký còn hiệu lực."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Nguyen",
            first_name="Giang",
            google_ten_dang_nhap="giang@example.edu",
            account_id=2,
        )
        major = Major(major_name="Cong nghe thong tin")
        course = Course(
            course_id=702,
            course_name="Tri tue nhan tao",
            credit_count=3,
            status=True,
        )
        session.add_all([staff, major, course])
        session.commit()
        session.refresh(staff)
        session.refresh(major)

        student = Student(
            last_name="Le",
            first_name="An",
            major_id=major.major_id,
        )
        session.add(student)
        session.commit()
        session.refresh(student)

        class_section = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        session.add(class_section)
        session.commit()
        session.refresh(class_section)
        session.add(
            CourseRegistration(
                student_id=student.student_id,
                class_section_id=class_section.class_section_id,
                status=False,
            )
        )
        session.commit()

        response = client.get("/api/staff/me/class-sections")

        assert response.status_code == 200
        assert response.json()["data"][0]["current_students"] == 0


def test_read_staff_recent_class_sessions_returns_recent_lessons() -> None:
    """Kiem tra API buoi hoc gan day tra ve thong ke diem danh cua can bo."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Mai",
            first_name="Lan",
            google_ten_dang_nhap="lan@example.edu",
            account_id=2,
        )
        other_staff = Staff(
            last_name="Mai",
            first_name="Khac",
            google_ten_dang_nhap="khac@example.edu",
            account_id=3,
        )
        major = Major(major_name="Khoa hoc may tinh")
        course = Course(
            course_id=151,
            course_name="Tri tue nhan tao",
            credit_count=3,
            status=True,
        )
        session.add_all([staff, other_staff, major, course])
        session.commit()
        session.refresh(staff)
        session.refresh(other_staff)
        session.refresh(major)

        student_1 = Student(last_name="Nguyen", first_name="A", major_id=major.major_id)
        student_2 = Student(last_name="Tran", first_name="B", major_id=major.major_id)
        student_3 = Student(last_name="Le", first_name="C", major_id=major.major_id)
        session.add_all([student_1, student_2, student_3])
        session.commit()
        session.refresh(student_1)
        session.refresh(student_2)
        session.refresh(student_3)

        target_lop = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
        )
        other_lop = ClassSection(
            course_id=course.course_id,
            staff_id=other_staff.staff_id,
            semester=1,
            academic_year="2025-2026",
        )
        session.add_all([target_lop, other_lop])
        session.commit()
        session.refresh(target_lop)
        session.refresh(other_lop)

        old_lesson = ClassSession(
            class_section_id=target_lop.class_section_id,
            class_date=date(2025, 10, 1),
        )
        recent_lesson = ClassSession(
            class_section_id=target_lop.class_section_id,
            class_date=date(2025, 10, 8),
        )
        other_lesson = ClassSession(
            class_section_id=other_lop.class_section_id,
            class_date=date(2025, 10, 9),
        )
        session.add_all([old_lesson, recent_lesson, other_lesson])
        session.commit()
        session.refresh(recent_lesson)
        session.refresh(other_lesson)

        session.add_all(
            [
                Attendance(
                    student_id=student_1.student_id,
                    class_session_id=recent_lesson.class_session_id,
                    status="CO_MAT",
                ),
                Attendance(
                    student_id=student_2.student_id,
                    class_session_id=recent_lesson.class_session_id,
                    status="DI_MUON",
                ),
                Attendance(
                    student_id=student_3.student_id,
                    class_session_id=recent_lesson.class_session_id,
                    status="VANG",
                ),
                Attendance(
                    student_id=student_1.student_id,
                    class_session_id=other_lesson.class_session_id,
                    status="CO_MAT",
                ),
            ]
        )
        session.commit()

        response = client.get(
            f"/api/staff/{staff.staff_id}/class-sessions/recent",
            params={"limit": 1},
        )
        body = response.json()

        assert response.status_code == 200
        assert body["count"] == 1
        assert body["data"][0]["class_section_id"] == target_lop.class_section_id
        assert body["data"][0]["course_name"] == "Tri tue nhan tao"
        assert body["data"][0]["class_date"] == "2025-10-08"
        assert body["data"][0]["present_student_count"] == 1
        assert body["data"][0]["late_student_count"] == 1
        assert body["data"][0]["absent_student_count"] == 1


def test_count_active_class_sections_returns_current_semester_count() -> None:
    """Kiểm tra API đếm số lớp học phần đang giảng dạy trong học kỳ hiện tại."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Pham", first_name="Dung", google_ten_dang_nhap="dung@example.edu"
        )
        course = Course(
            course_id=201,
            course_name="Lap trinh Python",
            credit_count=3,
            status=True,
        )
        session.add(staff)
        session.add(course)
        session.commit()
        session.refresh(staff)

        active_lop = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        inactive_lop = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        session.add(active_lop)
        session.add(inactive_lop)
        session.commit()
        session.refresh(active_lop)
        session.refresh(inactive_lop)

        session.add(
            Timetable(
                class_section_id=active_lop.class_section_id,
                weekday=2,
                start_date=date(2025, 9, 1),
                end_date=date(2025, 12, 31),
            )
        )
        session.add(
            Timetable(
                class_section_id=inactive_lop.class_section_id,
                weekday=2,
                start_date=date(2025, 9, 1),
                end_date=date(2025, 9, 30),
            )
        )
        session.commit()

        response = client.get(
            f"/api/staff/{staff.staff_id}/class-sections/active/count",
            params={"as_of_date": "2025-10-06"},
        )
        body = response.json()

        assert response.status_code == 200
        assert body["staff_id"] == staff.staff_id
        assert body["semester"] == 1
        assert body["academic_year"] == "2025-2026"
        assert body["as_of_date"] == "2025-10-06"
        assert body["count"] == 1


def test_read_monthly_attendance_summary_returns_change_from_previous_month() -> None:
    """Kiểm tra API thống kê tỷ lệ có mặt tháng hiện tại so với tháng trước."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Do", first_name="Hoa", google_ten_dang_nhap="hoa@example.edu"
        )
        major = Major(major_name="Cong nghe thong tin")
        course = Course(
            course_id=301,
            course_name="Kien truc phan mem",
            credit_count=3,
            status=True,
        )
        session.add(staff)
        session.add(major)
        session.add(course)
        session.commit()
        session.refresh(staff)
        session.refresh(major)

        student_1 = Student(last_name="Nguyen", first_name="A", major_id=major.major_id)
        student_2 = Student(last_name="Tran", first_name="B", major_id=major.major_id)
        session.add(student_1)
        session.add(student_2)
        session.commit()
        session.refresh(student_1)
        session.refresh(student_2)

        class_section = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
            status=True,
        )
        session.add(class_section)
        session.commit()
        session.refresh(class_section)

        previous_month_lesson = ClassSession(
            class_section_id=class_section.class_section_id,
            class_date=date(2025, 9, 15),
        )
        current_month_lesson_1 = ClassSession(
            class_section_id=class_section.class_section_id,
            class_date=date(2025, 10, 6),
        )
        current_month_lesson_2 = ClassSession(
            class_section_id=class_section.class_section_id,
            class_date=date(2025, 10, 13),
        )
        session.add(previous_month_lesson)
        session.add(current_month_lesson_1)
        session.add(current_month_lesson_2)
        session.commit()
        session.refresh(previous_month_lesson)
        session.refresh(current_month_lesson_1)
        session.refresh(current_month_lesson_2)

        session.add_all(
            [
                Attendance(
                    student_id=student_1.student_id,
                    class_session_id=previous_month_lesson.class_session_id,
                    status="CO_MAT",
                ),
                Attendance(
                    student_id=student_2.student_id,
                    class_session_id=previous_month_lesson.class_session_id,
                    status="VANG",
                ),
                Attendance(
                    student_id=student_1.student_id,
                    class_session_id=current_month_lesson_1.class_session_id,
                    status="CO_MAT",
                ),
                Attendance(
                    student_id=student_2.student_id,
                    class_session_id=current_month_lesson_1.class_session_id,
                    status="CO_MAT",
                ),
                Attendance(
                    student_id=student_1.student_id,
                    class_session_id=current_month_lesson_2.class_session_id,
                    status="DI_MUON",
                ),
                Attendance(
                    student_id=student_2.student_id,
                    class_session_id=current_month_lesson_2.class_session_id,
                    status="VANG",
                ),
            ]
        )
        session.commit()

        response = client.get(
            f"/api/staff/{staff.staff_id}/attendance/monthly-summary",
            params={"reference_date": "2025-10-20"},
        )
        body = response.json()

        assert response.status_code == 200
        assert body["current_month"] == "2025-10"
        assert body["previous_month"] == "2025-09"
        assert body["current_month_present_count"] == 3
        assert body["current_month_total_count"] == 4
        assert body["previous_month_present_count"] == 1
        assert body["previous_month_total_count"] == 2
        assert body["current_month_attendance_rate"] == 75.0
        assert body["previous_month_attendance_rate"] == 50.0
        assert body["change_percentage"] == 25.0
        assert body["description"] == "+25.0% so với tháng trước"


def test_count_pending_appeals_returns_staff_owned_pending_count() -> None:
    """Kiểm tra API chỉ đếm khiếu nại chờ xử lý thuộc lớp cán bộ phụ trách."""
    for client, session in make_test_client():
        staff = Staff(
            last_name="Vu",
            first_name="Minh",
            google_ten_dang_nhap="minh@example.edu",
            account_id=2,
        )
        other_staff = Staff(
            last_name="Hoang",
            first_name="Nam",
            google_ten_dang_nhap="nam@example.edu",
            account_id=3,
        )
        major = Major(major_name="He thong thong tin")
        course = Course(
            course_id=401,
            course_name="Phan tich thiet ke",
            credit_count=3,
            status=True,
        )
        session.add_all([staff, other_staff, major, course])
        session.commit()
        session.refresh(staff)
        session.refresh(other_staff)
        session.refresh(major)

        student = Student(last_name="Le", first_name="An", major_id=major.major_id)
        session.add(student)
        session.commit()
        session.refresh(student)

        target_lop = ClassSection(
            course_id=course.course_id,
            staff_id=staff.staff_id,
            semester=1,
            academic_year="2025-2026",
        )
        other_lop = ClassSection(
            course_id=course.course_id,
            staff_id=other_staff.staff_id,
            semester=1,
            academic_year="2025-2026",
        )
        session.add_all([target_lop, other_lop])
        session.commit()
        session.refresh(target_lop)
        session.refresh(other_lop)

        target_class_session = ClassSession(
            class_section_id=target_lop.class_section_id,
            class_date=date(2025, 10, 7),
        )
        other_class_session = ClassSession(
            class_section_id=other_lop.class_section_id,
            class_date=date(2025, 10, 7),
        )
        session.add_all([target_class_session, other_class_session])
        session.commit()
        session.refresh(target_class_session)
        session.refresh(other_class_session)

        target_diem_danh_1 = Attendance(
            student_id=student.student_id,
            class_session_id=target_class_session.class_session_id,
            status="VANG",
        )
        target_diem_danh_2 = Attendance(
            student_id=student.student_id + 100,
            class_session_id=target_class_session.class_session_id,
            status="VANG",
        )
        other_attendance = Attendance(
            student_id=student.student_id + 200,
            class_session_id=other_class_session.class_session_id,
            status="VANG",
        )
        session.add_all([target_diem_danh_1, target_diem_danh_2, other_attendance])
        session.commit()
        session.refresh(target_diem_danh_1)
        session.refresh(target_diem_danh_2)
        session.refresh(other_attendance)

        session.add_all(
            [
                Appeal(
                    attendance_id=target_diem_danh_1.attendance_id,
                    student_id=target_diem_danh_1.student_id,
                    reason="Can xem lai",
                    status="CHO_XU_LY",
                    resolved_at=None,
                ),
                Appeal(
                    attendance_id=target_diem_danh_2.attendance_id,
                    student_id=target_diem_danh_2.student_id,
                    reason="Da xu ly",
                    status="CHO_XU_LY",
                    resolved_at=datetime(2025, 10, 8),
                ),
                Appeal(
                    attendance_id=other_attendance.attendance_id,
                    student_id=other_attendance.student_id,
                    reason="Lop khac",
                    status="CHO_XU_LY",
                    resolved_at=None,
                ),
            ]
        )
        session.commit()

        response = client.get(f"/api/staff/{staff.staff_id}/appeals/pending/count")
        body = response.json()

        assert response.status_code == 200
        assert body["pending_count"] == 1
        assert body["calculated_at"]
