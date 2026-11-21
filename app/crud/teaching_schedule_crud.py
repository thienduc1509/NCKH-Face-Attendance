from datetime import date

from sqlmodel import Session, select

from app.models import (
    Attendance,
    ClassSection,
    ClassSession,
    Course,
    RecentClassSessionItem,
    TeachingScheduleItem,
    Timetable,
)

PRESENT_STATUSES = {"PRESENT", "CO_MAT"}
LATE_STATUSES = {"LATE", "DI_MUON"}
ABSENT_STATUSES = {"ABSENT", "VANG", "VANG_MAT"}


def get_vietnamese_weekday(value: date) -> int:
    """Chuyển ngày sang thứ kiểu Việt Nam: thứ 2 là 2, chủ nhật là 8."""
    return value.isoweekday() + 1


def get_current_semester_from_db(session: Session):
    """Lấy học kỳ hiện tại từ bảng semesters trong CSDL (is_current = True)."""
    from app.models.semester import Semester

    return session.exec(select(Semester).where(Semester.is_current.is_(True))).first()


def infer_current_semester(value: date) -> tuple[int, str]:
    """Suy luận học kỳ dự phòng nếu CSDL chưa thiết lập học kỳ hiện tại."""
    if value.month >= 8:
        return 1, f"{value.year}-{value.year + 1}"
    if value.month <= 5:
        return 2, f"{value.year - 1}-{value.year}"
    return 3, f"{value.year - 1}-{value.year}"


def timetable_matches_lesson(
    *, timetable: Timetable, class_session: ClassSession
) -> bool:
    """Kiểm tra thời khóa biểu mẫu có khớp với ngày của buổi học thực tế không."""
    if not (timetable.start_date <= class_session.class_date <= timetable.end_date):
        return False

    class_session_weekday = get_vietnamese_weekday(class_session.class_date)
    return timetable.weekday in {
        class_session_weekday,
        class_session.class_date.isoweekday(),
    }


def timetable_overlaps_date_range(
    *,
    timetable: Timetable,
    from_date: date | None = None,
    to_date: date | None = None,
) -> bool:
    """Kiểm tra thời khóa biểu mẫu có giao với khoảng ngày lọc không."""
    if from_date and timetable.end_date < from_date:
        return False
    return not (to_date and timetable.start_date > to_date)


def build_teaching_schedule_item(
    *,
    class_section: ClassSection,
    course: Course | None,
    timetable: Timetable | None = None,
    class_session: ClassSession | None = None,
    db_session: Session | None = None,
) -> TeachingScheduleItem:
    """Ghép dữ liệu lớp học phần, học phần, thời khóa biểu và buổi học thành response."""
    st_count = 0
    if db_session:
        from sqlalchemy import func

        from app.models import CourseRegistration

        st_count = (
            db_session.exec(
                select(func.count(CourseRegistration.student_id)).where(
                    CourseRegistration.class_section_id
                    == class_section.class_section_id,
                    CourseRegistration.status.is_(True),
                )
            ).first()
            or 0
        )

    return TeachingScheduleItem(
        staff_id=class_section.staff_id,
        class_section_id=class_section.class_section_id,
        course_id=class_section.course_id,
        course_name=course.course_name if course else None,
        timetable_id=(timetable.timetable_id if timetable else None),
        class_session_id=class_session.class_session_id if class_session else None,
        class_date=class_session.class_date if class_session else None,
        weekday=timetable.weekday if timetable else None,
        start_period=timetable.start_period if timetable else None,
        end_period=timetable.end_period if timetable else None,
        start_time=(
            class_session.start_time
            if class_session and class_session.start_time
            else timetable.start_time
            if timetable
            else None
        ),
        end_time=(
            class_session.end_time
            if class_session and class_session.end_time
            else timetable.end_time
            if timetable
            else None
        ),
        semester=class_section.semester,
        academic_year=class_section.academic_year,
        class_status=class_section.status,
        class_session_status=class_session.status if class_session else None,
        note=class_session.note if class_session else None,
        session_number=class_session.session_number if class_session else None,
        student_count=st_count,
    )


def count_attendance_by_status(
    *,
    session: Session,
    class_session_id: int,
) -> tuple[int, int, int]:
    """Dem so sinh vien co mat, di muon va vang mat theo mot buoi hoc."""
    statuses = session.exec(
        select(Attendance.status).where(Attendance.class_session_id == class_session_id)
    ).all()

    present_count = sum(1 for status in statuses if status in PRESENT_STATUSES)
    late_count = sum(1 for status in statuses if status in LATE_STATUSES)
    absent_count = sum(1 for status in statuses if status in ABSENT_STATUSES)
    return present_count, late_count, absent_count


def get_recent_lessons_by_staff_member(
    *,
    session: Session,
    staff_id: int,
    limit: int = 5,
) -> tuple[list[RecentClassSessionItem], int]:
    """Lay danh sach buoi hoc gan day cua can bo kem thong ke diem danh."""
    statement = (
        select(ClassSession)
        .join(
            ClassSection, ClassSession.class_section_id == ClassSection.class_section_id
        )
        .where(ClassSection.staff_id == staff_id)
        .order_by(ClassSession.class_date.desc(), ClassSession.class_session_id.desc())
        .limit(limit)
    )
    class_sessions = session.exec(statement).all()
    items: list[RecentClassSessionItem] = []

    for class_session in class_sessions:
        class_section = session.get(ClassSection, class_session.class_section_id)
        course = session.get(Course, class_section.course_id) if class_section else None
        present_count, late_count, absent_count = count_attendance_by_status(
            session=session,
            class_session_id=class_session.class_session_id,
        )
        items.append(
            RecentClassSessionItem(
                class_section_id=class_session.class_section_id,
                course_name=course.course_name if course else None,
                class_date=class_session.class_date,
                present_student_count=present_count,
                late_student_count=late_count,
                absent_student_count=absent_count,
            )
        )

    return items, len(items)


def get_teaching_schedule_by_staff_member(
    *,
    session: Session,
    staff_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    semester: int | None = None,
    academic_year: str | None = None,
    status: bool | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[TeachingScheduleItem], int]:
    """
    Lấy lịch dạy của cán bộ từ lớp học phần, thời khóa biểu và buổi học.

    Nếu lớp có buổi học thực tế, mỗi buổi học là một dòng lịch. Nếu lớp chưa có buổi
    học, hàm trả về các dòng thời khóa biểu mẫu còn giao với khoảng ngày lọc.
    """
    lop_statement = select(ClassSection).where(ClassSection.staff_id == staff_id)
    if semester is not None:
        lop_statement = lop_statement.where(ClassSection.semester == semester)
    if academic_year:
        lop_statement = lop_statement.where(ClassSection.academic_year == academic_year)
    if status is not None:
        lop_statement = lop_statement.where(ClassSection.status == status)

    class_sections = session.exec(lop_statement).all()
    items: list[TeachingScheduleItem] = []

    for class_section in class_sections:
        course = session.get(Course, class_section.course_id)

        timetable_statement = select(Timetable).where(
            Timetable.class_section_id == class_section.class_section_id
        )
        timetables = [
            timetable
            for timetable in session.exec(timetable_statement).all()
            if timetable_overlaps_date_range(
                timetable=timetable,
                from_date=from_date,
                to_date=to_date,
            )
        ]

        class_session_statement = select(ClassSession).where(
            ClassSession.class_section_id == class_section.class_section_id
        )
        if from_date:
            class_session_statement = class_session_statement.where(
                ClassSession.class_date >= from_date
            )
        if to_date:
            class_session_statement = class_session_statement.where(
                ClassSession.class_date <= to_date
            )
        class_sessions = session.exec(
            class_session_statement.order_by(ClassSession.class_date)
        ).all()

        if class_sessions:
            for class_session in class_sessions:
                matched_timetable = next(
                    (
                        timetable
                        for timetable in timetables
                        if timetable_matches_lesson(
                            timetable=timetable,
                            class_session=class_session,
                        )
                    ),
                    None,
                )
                items.append(
                    build_teaching_schedule_item(
                        class_section=class_section,
                        course=course,
                        timetable=matched_timetable,
                        class_session=class_session,
                        db_session=session,
                    )
                )
        else:
            for timetable in timetables:
                items.append(
                    build_teaching_schedule_item(
                        class_section=class_section,
                        course=course,
                        timetable=timetable,
                        db_session=session,
                    )
                )

    items.sort(
        key=lambda item: (
            item.class_date or date.max,
            item.start_time or item.end_time,
            item.class_section_id,
        )
    )
    count = len(items)
    return items[skip : skip + limit], count


def count_current_teaching_class_sections_by_staff_member(
    *,
    session: Session,
    staff_id: int,
    as_of_date: date,
) -> tuple[int, int, str]:
    """
    Đếm số lớp học phần cán bộ đang giảng dạy trong học kỳ hiện tại.

    Lớp được tính là đang giảng dạy khi thuộc học kỳ/năm học hiện tại, còn hoạt
    động và có thời khóa biểu bao phủ ngày tham chiếu hoặc có buổi học đúng ngày đó.
    """
    current_sem = get_current_semester_from_db(session)
    if current_sem:
        semester_id = current_sem.semester_id
        semester_num = 1
        academic_year = current_sem.academic_year
    else:
        semester_id = None
        semester_num, academic_year = infer_current_semester(as_of_date)

    lop_statement = select(ClassSection).where(
        ClassSection.staff_id == staff_id,
        ClassSection.status.is_(True),
    )
    if semester_id is not None:
        lop_statement = lop_statement.where(ClassSection.semester_id == semester_id)
    else:
        lop_statement = lop_statement.where(ClassSection.semester == semester_num)

    class_sections = session.exec(lop_statement).all()
    active_class_ids: set[int] = set()

    for class_section in class_sections:
        tkb_statement = select(Timetable).where(
            Timetable.class_section_id == class_section.class_section_id,
            Timetable.start_date <= as_of_date,
            Timetable.end_date >= as_of_date,
        )
        has_current_timetable = session.exec(tkb_statement).first() is not None

        class_session_statement = select(ClassSession).where(
            ClassSession.class_section_id == class_section.class_section_id,
            ClassSession.class_date == as_of_date,
        )
        has_current_class_session = (
            session.exec(class_session_statement).first() is not None
        )

        if has_current_timetable or has_current_class_session:
            active_class_ids.add(class_section.class_section_id)

    return len(active_class_ids), semester_num, academic_year
