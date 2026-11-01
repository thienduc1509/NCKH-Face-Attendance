from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, func, select

from app import crud
from app.api.deps import (
    CurrentAccount,
    SessionDep,
    get_current_active_superuser,
)
from app.core.security import get_password_hash, verify_password
from app.models import (
    Account,
    AccountCreate,
    AccountProfile,
    AccountPublic,
    AccountRegister,
    AccountsPublic,
    AccountUpdate,
    FaceImage,
    Major,
    Message,
    Staff,
    Student,
    StudentRegisterRequest,
    UpdatePassword,
)
from app.models.base import AppBaseModel
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AccountsPublic,
)
def read_accounts(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count_statement = select(func.count()).select_from(Account)
    count = session.exec(count_statement).one()

    statement = (
        select(Account)
        .order_by(col(Account.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    accounts = session.exec(statement).all()
    accounts_public = [AccountPublic.model_validate(account) for account in accounts]
    return AccountsPublic(data=accounts_public, count=count)


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AccountPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_account(*, session: SessionDep, account_in: AccountCreate) -> Any:
    account = crud.get_account_by_username(
        session=session, username=account_in.username
    )
    if account:
        raise HTTPException(
            status_code=400,
            detail="The account with this username already exists",
        )
    return crud.create_account(session=session, account_create=account_in)


@router.post(
    "/signup",
    response_model=AccountPublic,
    status_code=status.HTTP_201_CREATED,
)
def register_account(session: SessionDep, account_in: AccountRegister) -> Any:
    account = crud.get_account_by_username(
        session=session, username=account_in.username
    )
    if account:
        raise HTTPException(
            status_code=400,
            detail="The account with this username already exists",
        )
    account_create = AccountCreate.model_validate(account_in)
    db_account = crud.create_account(session=session, account_create=account_create)

    # Auto create a linked student profile if details are provided
    if (
        account_in.role == "SINH_VIEN"
        and account_in.last_name
        and account_in.first_name
    ):
        from app.models import Major, Student

        nganh = session.exec(select(Major)).first()
        if not nganh:
            nganh = Major(major_name="Công nghệ thông tin", description="Mặc định")
            session.add(nganh)
            session.commit()
            session.refresh(nganh)

        db_sinhvien = Student(
            last_name=account_in.last_name,
            first_name=account_in.first_name,
            google_email=account_in.email,
            phone=account_in.phone,
            gender=account_in.gender,
            major_id=nganh.major_id,
            account_id=db_account.account_id,
        )
        session.add(db_sinhvien)
        session.commit()
        session.refresh(db_sinhvien)

    return db_account


@router.get("/me", response_model=AccountPublic)
def read_account_me(current_account: CurrentAccount) -> Any:
    return current_account


@router.get("/me/profile", response_model=AccountProfile)
def read_account_profile(session: SessionDep, current_account: CurrentAccount) -> Any:
    return AccountProfile(
        account=AccountPublic.model_validate(current_account),
        profile=crud.get_account_profile(session=session, account=current_account),
    )


@router.patch("/me", response_model=AccountPublic)
def update_account_me(
    *, session: SessionDep, account_in: AccountUpdate, current_account: CurrentAccount
) -> Any:
    if account_in.username:
        existing_account = crud.get_account_by_username(
            session=session, username=account_in.username
        )
        if (
            existing_account
            and existing_account.account_id != current_account.account_id
        ):
            raise HTTPException(status_code=409, detail="Username already exists")

    account_in = AccountUpdate(
        username=account_in.username,
        password=account_in.password,
    )
    return crud.update_account(
        session=session, db_account=current_account, account_in=account_in
    )


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_account: CurrentAccount
) -> Any:
    verified, _ = verify_password(body.current_password, current_account.password_hash)
    if not verified:
        raise HTTPException(status_code=400, detail="Incorrect password")
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    current_account.password_hash = get_password_hash(body.new_password)
    session.add(current_account)
    session.commit()
    return Message(message="Password updated successfully")


@router.get(
    "/profiles",
    dependencies=[Depends(get_current_active_superuser)],
)
def read_user_profiles(
    session: SessionDep,
    role: str | None = None,
    status: str | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Lấy danh sách tài khoản hệ thống kèm thông tin hồ sơ cho Admin."""
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

    accounts = session.exec(statement.order_by(col(Account.created_at).desc())).all()

    data = []
    for acc in accounts:
        profile_data = {}
        if acc.role == "SINH_VIEN":
            sv = session.exec(
                select(Student).where(Student.account_id == acc.account_id)
            ).first()
            if sv:
                profile_data = {
                    "name": f"{sv.last_name} {sv.first_name}".strip(),
                    "studentId": sv.student_id,
                    "google_email": sv.google_email,
                    "phone": sv.phone,
                    "gender": sv.gender,
                }
        elif acc.role in ["GIANG_VIEN", "CAN_BO"]:
            cb = session.exec(
                select(Staff).where(Staff.account_id == acc.account_id)
            ).first()
            if cb:
                profile_data = {
                    "name": f"{cb.last_name} {cb.first_name}".strip(),
                    "google_email": cb.google_email,
                    "phone": cb.phone,
                    "gender": cb.gender,
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

        # Kiểm tra đã đăng ký khuôn mặt chưa
        face_count = 0
        if acc.role == "SINH_VIEN" and profile_data.get("studentId"):
            face_count = (
                session.exec(
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


@router.delete("/me", response_model=Message)
def delete_account_me(session: SessionDep, current_account: CurrentAccount) -> Message:
    """Delete the currently authenticated account."""
    account = session.get(Account, current_account.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    session.delete(account)
    session.commit()
    return Message(message="Account deleted successfully")


@router.get("/{account_id}", response_model=AccountPublic)
def read_account_by_id(
    account_id: int, session: SessionDep, current_account: CurrentAccount
) -> Any:
    account = session.get(Account, account_id)
    if account == current_account:
        return account
    if current_account.role != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="The account doesn't have enough privileges",
        )
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.patch(
    "/{account_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AccountPublic,
)
def update_account(
    *,
    session: SessionDep,
    account_id: int,
    account_in: AccountUpdate,
) -> Any:
    db_account = session.get(Account, account_id)
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account_in.username:
        existing_account = crud.get_account_by_username(
            session=session, username=account_in.username
        )
        if existing_account and existing_account.account_id != account_id:
            raise HTTPException(status_code=409, detail="Username already exists")

    return crud.update_account(
        session=session, db_account=db_account, account_in=account_in
    )


@router.delete("/{account_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_account(
    session: SessionDep, current_account: CurrentAccount, account_id: int
) -> Message:
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account == current_account:
        raise HTTPException(
            status_code=403, detail="Admin accounts cannot delete themselves"
        )
    session.delete(account)
    session.commit()
    return Message(message="Account deleted successfully")


from pydantic import AliasChoices, EmailStr, Field, field_validator


class UserWithProfileCreate(AppBaseModel):
    ten_dang_nhap: str = Field(min_length=1, max_length=50, validation_alias=AliasChoices("username", "ten_dang_nhap"))
    password: str = Field(min_length=5, max_length=128)
    vai_tro: str = Field(min_length=1, max_length=20, validation_alias=AliasChoices("role", "vai_tro"))  # student, lecturer, admin
    ho: str = Field(default="", max_length=50, validation_alias=AliasChoices("last_name", "ho"))
    ten: str = Field(min_length=1, max_length=50, validation_alias=AliasChoices("first_name", "ten"))
    dien_thoai: str | None = Field(default=None, max_length=15, validation_alias=AliasChoices("phone", "dien_thoai"))
    gioi_tinh: str | None = Field(default=None, max_length=10, validation_alias=AliasChoices("gender", "gioi_tinh"))
    email: EmailStr | None = None

    @field_validator("vai_tro")
    @classmethod
    def _normalize_role(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed_roles = {"student", "lecturer", "admin"}
        if normalized not in allowed_roles:
            raise ValueError("vai_tro must be student, lecturer, or admin")
        return normalized


@router.post(
    "/registrations",
    response_model=AccountPublic,
    status_code=status.HTTP_201_CREATED,
)
def register_student_with_otp(
    session: SessionDep, payload: StudentRegisterRequest
) -> Any:
    """Register a student account after OTP verification."""
    service = UserService(session=session)
    return service.register_student_with_otp(payload)


@router.post(
    "/with-profile",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AccountPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_account_with_profile(
    *,
    session: SessionDep,
    payload: UserWithProfileCreate,
) -> Any:
    """Tạo đồng thời cả tài khoản đăng nhập lẫn hồ sơ sinh viên/giảng viên."""
    username = payload.ten_dang_nhap.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Tên đăng nhập không được để trống")
    if crud.get_account_by_username(session=session, username=username):
        raise HTTPException(status_code=409, detail="Tên đăng nhập đã tồn tại")
    email = str(payload.email).lower() if payload.email else None
    role = {"student": "SINH_VIEN", "lecturer": "GIANG_VIEN", "admin": "ADMIN"}[payload.vai_tro]
    profile_model = Student if role == "SINH_VIEN" else Staff
    if email and role != "ADMIN" and session.exec(select(profile_model).where(profile_model.google_email == email)).first():
        raise HTTPException(status_code=409, detail="Email đã được sử dụng cho hồ sơ khác")
    from sqlalchemy.exc import IntegrityError
    try:
        account = Account(username=username, password_hash=get_password_hash(payload.password), role=role)
        session.add(account)
        session.flush()
        profile = dict(last_name=payload.ho, first_name=payload.ten, google_email=email,
                       phone=payload.dien_thoai, gender=payload.gioi_tinh, account_id=account.account_id)
        if role == "SINH_VIEN":
            major = session.exec(select(Major)).first()
            if major is None:
                major = Major(major_name="Công nghệ thông tin", description="Mặc định")
                session.add(major)
                session.flush()
            session.add(Student(**profile, major_id=major.major_id))
        elif role == "GIANG_VIEN":
            session.add(Staff(**profile, position="Giảng viên"))
        session.commit()
        session.refresh(account)
        return account
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Tên đăng nhập hoặc email đã tồn tại") from exc


# The web UI uses /profiles; retain /with-profile for existing clients.
router.add_api_route("/profiles", create_account_with_profile, methods=["POST"],
                     response_model=AccountPublic, status_code=201,
                     dependencies=[Depends(get_current_active_superuser)])


@router.patch(
    "/{account_id}/toggle-status",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=AccountPublic,
)
def toggle_account_status(
    *,
    session: SessionDep,
    account_id: int,
) -> Any:
    """Khóa hoặc mở khóa tài khoản."""
    db_account = session.get(Account, account_id)
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    db_account.status = not db_account.status
    session.add(db_account)
    session.commit()
    session.refresh(db_account)
    return db_account


router.add_api_route("/{account_id}/status", toggle_account_status, methods=["PATCH"],
                     response_model=AccountPublic,
                     dependencies=[Depends(get_current_active_superuser)])
