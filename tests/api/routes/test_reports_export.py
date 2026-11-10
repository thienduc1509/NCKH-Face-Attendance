import io
from collections.abc import Generator
from datetime import date, time

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api.deps import (
    get_current_account,
    get_current_active_lecturer,
    get_db,
)
from app.main import app
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
)


@pytest.fixture
def test_setup() -> Generator[tuple[TestClient, int], None, None]:
    """Create a test client backed by an in-memory SQLite database and seed test data."""
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
            Major.__table__,
            Student.__table__,
            Course.__table__,
            ClassSection.__table__,
            CourseRegistration.__table__,
            ClassSession.__table__,
            Attendance.__table__,
        ],
    )

    with Session(engine) as session:
        lecturer_account = Account(
            account_id=1,
            username="gv_nguyen",
            password_hash="secret",
            role="GIANG_VIEN",
            status=True,
        )
        staff = Staff(
            staff_id=1,
            account_id=1,
            last_name="Nguyễn",
            first_name="Giảng",
            google_ten_dang_nhap="giang@example.edu.vn",
        )
        major = Major(major_name="Công nghệ thông tin")
        course = Course(course_id=101, course_name="Nhận diện khuôn mặt")
        student1 = Student(
            student_id=20210001,
            last_name="Trần Hoàng",
            first_name="Phúc",
            major_id=1,
        )
        student2 = Student(
            student_id=20210002,
            last_name="Lê Minh",
            first_name="Giang",
            major_id=1,
        )

        session.add_all([lecturer_account, staff, major, course, student1, student2])
        session.commit()

        class_section = ClassSection(
            class_section_id=10,
            course_id=101,
            staff_id=1,
            semester=1,
            academic_year="2025-2026",
        )
        session.add(class_section)
        session.commit()

        session.add_all([
            CourseRegistration(student_id=20210001, class_section_id=10),
            CourseRegistration(student_id=20210002, class_section_id=10),
        ])
        session.commit()

        lesson1 = ClassSession(
            class_session_id=101,
            class_section_id=10,
            session_number=1,
            class_date=date(2026, 11, 10),
            start_time=time(8, 0),
            end_time=time(10, 0),
            status="KET_THUC",
        )
        session.add(lesson1)
        session.commit()

        session.add_all([
            Attendance(
                class_session_id=101,
                student_id=20210001,
                status="CO_MAT",
            ),
            Attendance(
                class_session_id=101,
                student_id=20210002,
                status="DI_MUON",
            ),
        ])
        session.commit()

        def override_get_db():
            yield session

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_account] = lambda: lecturer_account
        app.dependency_overrides[get_current_active_lecturer] = lambda: lecturer_account

        with TestClient(app) as client:
            yield client, class_section.class_section_id

        app.dependency_overrides.clear()


def test_export_attendance_excel_openpyxl(test_setup):
    """Verify that export endpoint returns valid .xlsx generated with openpyxl."""
    client, class_section_id = test_setup

    response = client.get(f"/api/reports/class-sections/{class_section_id}/attendance?format=xlsx")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert response.headers["content-disposition"] == f'attachment; filename="DiemDanh_{class_section_id}.xlsx"'

    # Verify openpyxl can read the Excel file and data matches
    excel_stream = io.BytesIO(response.content)
    workbook = openpyxl.load_workbook(excel_stream)
    assert "Attendance" in workbook.sheetnames

    sheet = workbook["Attendance"]
    headers = [cell.value for cell in sheet[1]]
    assert "Mã sinh viên" in headers
    assert "Họ tên" in headers
    assert "10/11/2026" in headers

    # Verify student rows
    rows = list(sheet.iter_rows(min_row=2, values_only=True))
    student_ids = [row[0] for row in rows]
    assert 20210001 in student_ids
    assert 20210002 in student_ids

    # Verify Vietnamese names
    names = [row[1] for row in rows]
    assert any("Trần Hoàng Phúc" in name for name in names)
    assert any("Lê Minh Giang" in name for name in names)


def test_export_attendance_csv_utf8_bom(test_setup):
    """Verify that CSV export includes UTF-8 BOM (\xef\xbb\xbf) for Windows Excel compatibility."""
    client, class_section_id = test_setup

    response = client.get(f"/api/reports/class-sections/{class_section_id}/attendance?format=csv")

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == f'attachment; filename="DiemDanh_{class_section_id}.csv"'

    # Verify content starts with UTF-8 BOM
    raw_content = response.content
    assert raw_content.startswith(b"\xef\xbb\xbf"), "CSV output must start with UTF-8 BOM"

    # Verify decoding without error and correct contents
    decoded_text = raw_content.decode("utf-8-sig")
    assert "Student ID" in decoded_text or "Mã sinh viên" in decoded_text
    assert "Trần Hoàng Phúc" in decoded_text
    assert "Lê Minh Giang" in decoded_text
    assert "CO_MAT" in decoded_text
    assert "DI_MUON" in decoded_text


def test_export_attendance_invalid_format_fails(test_setup):
    """Verify that unsupported format returns validation error 400 Bad Request."""
    client, class_section_id = test_setup

    response = client.get(f"/api/reports/class-sections/{class_section_id}/attendance?format=pdf")

    assert response.status_code == 400
    assert "String should match pattern" in response.text or "format" in response.text
