from datetime import date, timedelta

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Attendance, ClassSession, CourseRegistration
from app.services.timetable_service import close_expired_attendance_sessions


@pytest.fixture(scope="session", autouse=True)
def db():
    yield None


def test_closes_past_regular_and_test_sessions() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(
        engine,
        tables=[
            ClassSession.__table__,
            CourseRegistration.__table__,
            Attendance.__table__,
        ],
    )

    today = date(2026, 11, 20)
    regular_session = ClassSession(
        class_session_id=1,
        class_section_id=101,
        class_date=today - timedelta(days=1),
        status="DANG_DIEN_RA",
    )
    test_session = ClassSession(
        class_session_id=2,
        class_section_id=102,
        class_date=today - timedelta(days=1),
        status="DANG_DIEN_RA",
        note="Phiên Test Thử Nghiệm AI với Sinh Viên",
    )
    current_session = ClassSession(
        class_session_id=3,
        class_section_id=103,
        class_date=today,
        status="DANG_DIEN_RA",
    )
    cancelled_session = ClassSession(
        class_session_id=4,
        class_section_id=104,
        class_date=today - timedelta(days=1),
        status="DA_HUY",
    )

    with Session(engine) as session:
        session.add_all(
            [regular_session, test_session, current_session, cancelled_session]
        )
        session.commit()

        assert close_expired_attendance_sessions(
            session=session, as_of_date=today
        ) == 2

        statuses = {
            item.class_session_id: item.status
            for item in session.exec(select(ClassSession)).all()
        }

    assert statuses == {
        1: "DA_KET_THUC",
        2: "DA_KET_THUC",
        3: "DANG_DIEN_RA",
        4: "DA_HUY",
    }
