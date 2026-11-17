"""
User service.

Contains database operations and business logic for user profiles and accounts.
"""

from typing import Any

from fastapi import Depends, HTTPException
from sqlmodel import Session, col, func, select

from app import crud
from app.api.deps import get_db
from app.core.security import get_password_hash, verify_password
from app.models import (
    Account,
    AccountCreate,
    AccountRegister,
    AccountUpdate,
    FaceImage,
    Major,
    Staff,
    Student,
    StudentRegisterRequest,
    UpdatePassword,
)
from app.services.otp_service import verify_otp


class UserService:
    """Service to encapsulate database logic for account and profile management."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def read_accounts(self, skip: int = 0, limit: int = 100) -> dict[str, Any]:
        """Lấy danh sách tài khoản."""
        count_statement = select(func.count()).select_from(Account)
        count = self.session.exec(count_statement).one()

        statement = (
            select(Account)
            .order_by(col(Account.created_at).desc())
            .offset(skip)
            .limit(limit)
        )
        accounts = self.session.exec(statement).all()
        return {"data": accounts, "count": count}

    def create_account(self, account_in: AccountCreate) -> Account:
        """Tạo tài khoản mới bởi Admin."""
        account = crud.get_account_by_username(
            session=self.session, username=account_in.username
        )
        if account:
            raise HTTPException(
                status_code=400,
                detail="The account with this username already exists",
            )
        return crud.create_account(session=self.session, account_create=account_in)

    def register_account(self, account_in: AccountRegister) -> Account:
        """Đăng ký tài khoản mới và tự động tạo hồ sơ sinh viên nếu cần."""
        account = crud.get_account_by_username(
            session=self.session, username=account_in.username
        )
        if account:
            raise HTTPException(
                status_code=400,
                detail="The account with this username already exists",
            )
        account_create = AccountCreate.model_validate(account_in)
        db_account = crud.create_account(
            session=self.session, account_create=account_create
        )

        # Tự động tạo hồ sơ sinh viên liên kết
        if (
            account_in.role == "SINH_VIEN"
            and account_in.last_name
            and account_in.first_name
        ):
            major = self.session.exec(select(Major)).first()
            if not major:
                major = Major(major_name="Công nghệ thông tin", description="Mặc định")
                self.session.add(major)
                self.session.commit()
                self.session.refresh(major)

            from app.crud.student_crud import get_next_student_id, sync_student_id_sequence

            db_student = Student(
                student_id=get_next_student_id(self.session),
                last_name=account_in.last_name,
                first_name=account_in.first_name,
                google_email=account_in.email,
                phone=account_in.phone,
                gender=account_in.gender,
                major_id=major.major_id,
                account_id=db_account.account_id,
            )
            self.session.add(db_student)
            self.session.commit()
            self.session.refresh(db_student)
            sync_student_id_sequence(self.session)

        return db_account

    def register_student_with_otp(self, payload: StudentRegisterRequest) -> Account:
        """Đăng ký tài khoản sinh viên với kiểm tra MSSV, Email và xác thực mã OTP."""
        # 1. Verify OTP code
        if not verify_otp(
            session=self.session, email=payload.email, code=payload.otp_code
        ):
            raise HTTPException(
                status_code=400,
                detail="Mã xác thực OTP không chính xác hoặc đã hết hạn",
            )

        # 2. Check student record existence
        student = self.session.get(Student, payload.mssv)
        if not student:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy sinh viên có mã {payload.mssv}",
            )

        if student.google_email:
            if student.google_email.strip().lower() != payload.email.strip().lower():
                raise HTTPException(
                    status_code=400,
                    detail=f"Email nhập vào ({payload.email}) không trùng khớp với Email sinh viên trong hệ thống ({student.google_email})",
                )
        else:
            student.google_email = payload.email.strip().lower()

        if student.account_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Sinh viên này đã đăng ký tài khoản trước đó",
            )

        username = str(payload.mssv)
        existing_account = crud.get_account_by_username(
            session=self.session, username=username
        )
        if existing_account:
            raise HTTPException(
                status_code=400,
                detail="Tài khoản với mã sinh viên này đã tồn tại",
            )

        # 3. Create account & link student
        account_create = AccountCreate(
            username=username,
            password=payload.password,
            role="SINH_VIEN",
            status=True,
        )
        db_account = crud.create_account(
            session=self.session, account_create=account_create
        )

        student.account_id = db_account.account_id
        self.session.add(student)
        self.session.commit()
        self.session.refresh(student)

        return db_account

    def update_account_me(
        self, current_account: Account, account_in: AccountUpdate
    ) -> Account:
        """Cập nhật thông tin tài khoản hiện tại."""
        if account_in.username:
            existing_account = crud.get_account_by_username(
                session=self.session, username=account_in.username
            )
            if (
                existing_account
                and existing_account.account_id != current_account.account_id
            ):
                raise HTTPException(status_code=409, detail="Username already exists")

        account_update = AccountUpdate(
            username=account_in.username,
            password=account_in.password,
        )
        return crud.update_account(
            session=self.session, db_account=current_account, account_in=account_update
        )

    def update_password_me(
        self, current_account: Account, body: UpdatePassword
    ) -> None:
        """Cập nhật mật khẩu cá nhân."""
        verified, new_hash = verify_password(
            body.current_password, current_account.password_hash
        )
        if not verified:
            raise HTTPException(status_code=400, detail="Incorrect password")
        if body.current_password == body.new_password:
            raise HTTPException(
                status_code=400,
                detail="New password cannot be the same as the current one",
            )
        current_account.password_hash = get_password_hash(body.new_password)
        self.session.add(current_account)
        self.session.commit()

    def read_user_profiles(
        self,
        role: str | None = None,
        status: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Lấy danh sách tài khoản hệ thống kèm hồ sơ chi tiết."""
        statement = select(Account)

        if role and role != "all":
            db_roles = []
            if role == "student":
                db_roles = ["SINH_VIEN"]
            elif role == "lecturer":
                db_roles = ["GIANG_VIEN", "CAN_BO"]
            elif role == "admin":
                db_roles = ["ADMIN"]
            else:
                db_roles = [role]
            statement = statement.where(Account.role.in_(db_roles))

        if status and status != "all":
            db_status = status == "active"
            statement = statement.where(Account.status == db_status)

        accounts = self.session.exec(
            statement.order_by(col(Account.created_at).desc())
        ).all()

        data = []
        for acc in accounts:
            profile_data = {}
            if acc.role == "SINH_VIEN":
                student = self.session.exec(
                    select(Student).where(Student.account_id == acc.account_id)
                ).first()
                if student:
                    profile_data = {
                        "name": f"{student.last_name} {student.first_name}".strip(),
                        "studentId": student.student_id,
                        "google_email": student.google_email,
                        "phone": student.phone,
                        "gender": student.gender,
                    }
            elif acc.role in ["GIANG_VIEN", "CAN_BO"]:
                staff_member = self.session.exec(
                    select(Staff).where(Staff.account_id == acc.account_id)
                ).first()
                if staff_member:
                    profile_data = {
                        "name": f"{staff_member.last_name} {staff_member.first_name}".strip(),
                        "google_email": staff_member.google_email,
                        "phone": staff_member.phone,
                        "gender": staff_member.gender,
                    }

            name = profile_data.get("name", "") or ""
            email = profile_data.get("google_email", "") or acc.username or ""
            student_id_str = str(profile_data.get("studentId", ""))

            if q:
                q_lower = q.lower()
                if (
                    q_lower not in name.lower()
                    and q_lower not in email.lower()
                    and q_lower not in student_id_str.lower()
                ):
                    continue

            face_count = 0
            if acc.role == "SINH_VIEN" and profile_data.get("studentId"):
                face_count = (
                    self.session.exec(
                        select(func.count(FaceImage.image_id)).where(
                            FaceImage.student_id == profile_data.get("studentId")
                        )
                    ).first()
                    or 0
                )

            data.append(
                {
                    "id": acc.account_id,
                    "name": name or acc.username,
                    "email": email,
                    "role": "student"
                    if acc.role == "SINH_VIEN"
                    else "lecturer"
                    if acc.role in ["GIANG_VIEN", "CAN_BO"]
                    else "admin",
                    "status": "active" if acc.status else "locked",
                    "createdAt": acc.created_at.strftime("%d/%m/%Y")
                    if acc.created_at
                    else "N/A",
                    "lastLogin": acc.last_login_at.strftime("%d/%m/%Y")
                    if acc.last_login_at
                    else "N/A",
                    "studentId": student_id_str if acc.role == "SINH_VIEN" else None,
                    "faceDataStatus": "approved" if face_count > 0 else "none",
                }
            )

        paginated_data = data[skip : skip + limit]
        return {"data": paginated_data, "count": len(data)}

    def update_account(self, account_id: int, account_in: AccountUpdate) -> Account:
        """Cập nhật tài khoản bởi Admin."""
        db_account = self.session.get(Account, account_id)
        if not db_account:
            raise HTTPException(status_code=404, detail="Account not found")

        if account_in.username:
            existing_account = crud.get_account_by_username(
                session=self.session, username=account_in.username
            )
            if existing_account and existing_account.account_id != account_id:
                raise HTTPException(status_code=409, detail="Username already exists")

        return crud.update_account(
            session=self.session, db_account=db_account, account_in=account_in
        )

    def delete_account(self, current_account: Account, account_id: int) -> None:
        """Xóa tài khoản."""
        account = self.session.get(Account, account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        if account == current_account:
            raise HTTPException(
                status_code=403, detail="Admin accounts cannot delete themselves"
            )
        self.session.delete(account)
        self.session.commit()

    def delete_user_me(self, current_account: Account) -> None:
        """Xóa tài khoản cá nhân."""
        if current_account.role == "ADMIN":
            raise HTTPException(
                status_code=403,
                detail="Super users are not allowed to delete themselves",
            )
        self.session.delete(current_account)
        self.session.commit()

    def create_account_with_profile(self, payload: Any) -> Account:
        """Tạo đồng thời cả tài khoản đăng nhập lẫn hồ sơ sinh viên/giảng viên."""
        # Kiểm tra trùng tên đăng nhập
        account = crud.get_account_by_username(
            session=self.session, username=payload.username
        )
        if account:
            raise HTTPException(
                status_code=400,
                detail="The account with this username already exists",
            )

        db_role = "SINH_VIEN"
        if payload.role == "lecturer":
            db_role = "GIANG_VIEN"
        elif payload.role == "admin":
            db_role = "ADMIN"

        db_account = Account(
            username=payload.username,
            password_hash=get_password_hash(payload.password),
            role=db_role,
            status=True,
        )
        self.session.add(db_account)
        self.session.commit()
        self.session.refresh(db_account)

        if db_role == "SINH_VIEN":
            major = self.session.exec(select(Major)).first()
            if not major:
                major = Major(major_name="Công nghệ thông tin", description="Default")
                self.session.add(major)
                self.session.commit()
                self.session.refresh(major)

            from app.crud.student_crud import get_next_student_id, sync_student_id_sequence

            db_student = Student(
                student_id=get_next_student_id(self.session),
                last_name=payload.last_name,
                first_name=payload.first_name,
                google_email=getattr(payload, "email", None) or payload.username,
                phone=payload.phone,
                gender=payload.gender,
                major_id=major.major_id,
                account_id=db_account.account_id,
            )
            self.session.add(db_student)
            self.session.commit()
            sync_student_id_sequence(self.session)
        elif db_role == "GIANG_VIEN":
            db_staff = Staff(
                last_name=payload.last_name,
                first_name=payload.first_name,
                google_email=getattr(payload, "email", None) or payload.username,
                phone=payload.phone,
                gender=payload.gender,
                account_id=db_account.account_id,
                position="Giảng viên",
            )
            self.session.add(db_staff)
            self.session.commit()

        return db_account

    def toggle_account_status(self, account_id: int) -> Account:
        """Khóa hoặc mở khóa tài khoản."""
        db_account = self.session.get(Account, account_id)
        if not db_account:
            raise HTTPException(status_code=404, detail="Account not found")
        db_account.status = not db_account.status
        self.session.add(db_account)
        self.session.commit()
        self.session.refresh(db_account)
        return db_account


def get_user_service(session: Session = Depends(get_db)) -> UserService:
    """Dependency provider for UserService."""
    return UserService(session)
