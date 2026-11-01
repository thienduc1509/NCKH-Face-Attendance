from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.models import Attendance, ClassSession, CourseRegistration


def calculate_attendance_status(
    class_session: ClassSession, current_time: datetime
) -> str:
    """Xác định trạng thái CO_MAT hoặc MUON dựa trên giờ bắt đầu và số phút muộn tối đa."""
    if not class_session.start_time:
        return "CO_MAT"  # Nếu không cấu hình giờ, mặc định là có mặt

    # Kết hợp ngày học và giờ học
    start_datetime = datetime.combine(
        class_session.class_date, class_session.start_time
    )
    if current_time.tzinfo is not None:
        current_time = current_time.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).replace(tzinfo=None)
    latest_on_time_datetime = start_datetime + timedelta(
        minutes=class_session.late_grace_minutes
    )

    if current_time > latest_on_time_datetime:
        return "MUON"
    return "CO_MAT"


def mark_attendance_by_lora(
    *,
    session: Session,
    class_session_id: int,
    student_ids: list[int],
    average_confidence: float | None = None,
) -> dict:
    """Xử lý điểm danh hàng loạt từ AI."""
    class_session = session.get(ClassSession, class_session_id)
    if not class_session:
        return {"success": False, "message": "Buổi học không tồn tại"}

    if class_session.status != "DANG_DIEN_RA":
        return {
            "success": False,
            "message": "Buổi học không trong trạng thái ĐANG_DIEN_RA",
        }

    eligible_ids = set(session.exec(select(CourseRegistration.student_id).where(
        CourseRegistration.class_section_id == class_session.class_section_id,
        CourseRegistration.status.is_(True),
    )).all())
    student_ids = sorted(set(student_ids) & eligible_ids)
    current_time = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    current_status = calculate_attendance_status(class_session, current_time)

    # Lấy các record điểm danh đã có của các sinh viên này trong buổi học
    statement = select(Attendance).where(
        Attendance.class_session_id == class_session_id,
        Attendance.student_id.in_(student_ids),
    )
    existing_records = session.exec(statement).all()
    existing_map = {record.student_id: record for record in existing_records}

    new_records = []
    attendance_ids = []

    for student_id in student_ids:
        if student_id in existing_map:
            att_rec = existing_map[student_id]
            if att_rec.attendance_id is not None:
                attendance_ids.append(att_rec.attendance_id)
            if att_rec.status in {"CHUA_DIEM_DANH", "VANG", "ABSENT", None}:
                att_rec.status = current_status
                att_rec.method = "KHUON_MAT"
                att_rec.confidence = average_confidence
                att_rec.attendance_time = current_time
                session.add(att_rec)
                session.commit()
                session.refresh(att_rec)
        else:
            new_dd = Attendance(
                student_id=student_id,
                class_session_id=class_session_id,
                status=current_status,
                method="KHUON_MAT",
                confidence=average_confidence,
                attendance_time=current_time,
            )
            new_records.append(new_dd)

    if new_records:
        session.add_all(new_records)
        session.commit()
        for record in new_records:
            session.refresh(record)
            if (
                record.attendance_id is not None
                and record.attendance_id not in attendance_ids
            ):
                attendance_ids.append(record.attendance_id)

    return {
        "success": True,
        "message": f"Da diem danh cho {len(new_records)} sinh vien",
        "status": current_status,
        "attendance_id": attendance_ids[0] if attendance_ids else None,
        "attendance_ids": attendance_ids,
    }

    return {
        "success": True,
        "message": f"Đã điểm danh cho {len(new_records)} sinh viên",
        "status": current_status,
    }


def mark_attendance_manually(
    *,
    session: Session,
    class_session_id: int,
    student_id: int,
    status: str,
    note: str | None = None,
) -> Attendance:
    """Giảng viên điểm danh thủ công 1 sinh viên."""
    statement = select(Attendance).where(
        Attendance.class_session_id == class_session_id,
        Attendance.student_id == student_id,
    )
    attendance = session.exec(statement).first()

    if attendance:
        attendance.status = status
        attendance.edit_reason = note
        attendance.method = "THU_CONG"
        attendance.attendance_time = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
        session.add(attendance)
    else:
        attendance = Attendance(
            student_id=student_id,
            class_session_id=class_session_id,
            status=status,
            method="THU_CONG",
            attendance_time=datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")),
            edit_reason=note,
        )
        session.add(attendance)

    session.commit()
    session.refresh(attendance)
    return attendance


def finalize_absent_attendance(*, session: Session, class_session: ClassSession) -> int:
    """Tạo bản ghi VANG cho toàn bộ sinh viên chưa có record khi buổi học kết thúc."""
    # Lấy toàn bộ sinh viên đăng ký lớp học phần
    statement = select(CourseRegistration.student_id).where(
        CourseRegistration.class_section_id == class_session.class_section_id
    )
    registered_student_ids = session.exec(statement).all()

    # Lấy các sinh viên đã điểm danh
    attendance_statement = select(Attendance.student_id).where(
        Attendance.class_session_id == class_session.class_session_id
    )
    attended_student_ids = set(session.exec(attendance_statement).all())

    missing_student_ids = [
        student_id
        for student_id in registered_student_ids
        if student_id not in attended_student_ids
    ]

    absent_records = []
    for student_id in missing_student_ids:
        attendance = Attendance(
            student_id=student_id,
            class_session_id=class_session.class_session_id,
            status="VANG",
            method="TU_DONG",
            attendance_time=datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")),
            edit_reason="Tự động đánh vắng khi chốt phiên",
        )
        absent_records.append(attendance)

    if absent_records:
        session.add_all(absent_records)
        session.commit()

    return len(absent_records)
