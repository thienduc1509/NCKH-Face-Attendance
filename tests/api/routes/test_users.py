from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app import crud
from app.core.config import settings
from app.core.security import verify_password
from app.models import (
    Account,
    AccountCreate,
    AuditLog,
    FaceImage,
    Major,
    OAuthIdentity,
    RefreshToken,
    Staff,
    Student,
)
from tests.utils.user import create_random_user
from tests.utils.utils import random_email, random_lower_string


def test_get_users_superuser_me(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/me", headers=superuser_token_headers)
    current_user = r.json()
    assert current_user
    assert current_user["status"] is True
    assert current_user["role"] == "ADMIN"
    assert current_user["username"] == settings.FIRST_SUPERUSER


def test_get_users_normal_user_me(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/me", headers=normal_user_token_headers)
    current_user = r.json()
    assert current_user
    assert current_user["status"] is True
    assert current_user["role"] != "ADMIN"
    assert current_user["username"] == settings.EMAIL_TEST_USER


def test_create_user_new_email(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    with (
        patch("app.utils.send_email", return_value=None),
        patch("app.core.config.settings.SMTP_HOST", "smtp.example.com"),
        patch("app.core.config.settings.SMTP_USER", "admin@example.com"),
    ):
        username = random_email()
        password = random_lower_string()
        data = {"username": username, "password": password}
        r = client.post(
            f"{settings.API_V1_STR}/users/",
            headers=superuser_token_headers,
            json=data,
        )
        assert 200 <= r.status_code < 300
        created_user = r.json()
        user = crud.get_user_by_email(session=db, username=username)
        assert user
        assert user.username == created_user["username"]


def test_get_existing_user_as_superuser(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.account_id
    r = client.get(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=superuser_token_headers,
    )
    assert 200 <= r.status_code < 300
    api_user = r.json()
    existing_user = crud.get_user_by_email(session=db, username=username)
    assert existing_user
    assert existing_user.username == api_user["username"]


def test_get_existing_user_current_user(client: TestClient, db: Session) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.account_id

    login_data = {
        "username": username,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/auth/access-tokens", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}

    r = client.get(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=headers,
    )
    assert 200 <= r.status_code < 300
    api_user = r.json()
    existing_user = crud.get_user_by_email(session=db, username=username)
    assert existing_user
    assert existing_user.username == api_user["username"]


def test_get_existing_user_permissions_error(
    db: Session,
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    user = create_random_user(db)

    r = client.get(
        f"{settings.API_V1_STR}/users/{user.account_id}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "The account doesn't have enough privileges"


def test_create_user_existing_username(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    # username = email
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    crud.create_user(session=db, user_create=user_in)
    data = {"username": username, "password": password}
    r = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=superuser_token_headers,
        json=data,
    )
    created_user = r.json()
    assert r.status_code == 400
    assert "_id" not in created_user


def test_create_user_by_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    username = random_email()
    password = random_lower_string()
    data = {"username": username, "password": password}
    r = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 403


def test_retrieve_users(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    crud.create_user(session=db, user_create=user_in)

    username2 = random_email()
    password2 = random_lower_string()
    user_in2 = AccountCreate(username=username2, password=password2)
    crud.create_user(session=db, user_create=user_in2)

    r = client.get(f"{settings.API_V1_STR}/users/", headers=superuser_token_headers)
    all_users = r.json()

    assert len(all_users["data"]) > 1
    assert "count" in all_users
    for item in all_users["data"]:
        assert "username" in item


def test_update_user_me(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    email = random_email()
    data = {"username": email}
    r = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 200
    updated_user = r.json()
    assert updated_user["username"] == email

    user_query = select(Account).where(Account.username == email)
    user_db = db.exec(user_query).first()
    assert user_db
    assert user_db.username == email


def test_update_password_me(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    new_password = random_lower_string()
    data = {
        "current_password": settings.FIRST_SUPERUSER_PASSWORD,
        "new_password": new_password,
    }
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    updated_user = r.json()
    assert updated_user["message"] == "Password updated successfully"

    user_query = select(Account).where(Account.username == settings.FIRST_SUPERUSER)
    user_db = db.exec(user_query).first()
    assert user_db
    assert user_db.username == settings.FIRST_SUPERUSER
    verified, _ = verify_password(new_password, user_db.password_hash)
    assert verified

    # Revert to the old password to keep consistency in test
    old_data = {
        "current_password": new_password,
        "new_password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=old_data,
    )
    db.refresh(user_db)

    assert r.status_code == 200
    verified, _ = verify_password(
        settings.FIRST_SUPERUSER_PASSWORD, user_db.password_hash
    )
    assert verified


def test_update_password_me_incorrect_password(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    new_password = random_lower_string()
    data = {"current_password": new_password, "new_password": new_password}
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 400
    updated_user = r.json()
    assert updated_user["message"] == "Incorrect password"


def test_update_user_me_email_exists(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    data = {"username": user.username}
    r = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "Username already exists"


def test_update_password_me_same_password_error(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {
        "current_password": settings.FIRST_SUPERUSER_PASSWORD,
        "new_password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 400


def test_register_user(client: TestClient, db: Session) -> None:
    email = random_email()
    password = random_lower_string()

    # Seed a Student record and an OTPRecord
    from datetime import datetime, timedelta

    from app.models import Major, Student
    from app.models.otp import OTPRecord

    major = Major(major_name="Test Major")
    db.add(major)
    db.commit()
    db.refresh(major)

    student = Student(
        student_id=20210001,
        last_name="Tran",
        first_name="Binh",
        google_email=email,
        major_id=major.major_id,
    )
    db.add(student)

    otp = OTPRecord(
        email=email, code="123456", expires_at=datetime.now(UTC) + timedelta(minutes=10)
    )
    db.add(otp)
    db.commit()

    data = {
        "mssv": 20210001,
        "email": email,
        "password": password,
        "otp_code": "123456",
    }
    r = client.post(
        f"{settings.API_V1_STR}/users/registrations",
        json=data,
    )
    assert r.status_code == 201
    created_user = r.json()
    assert created_user["username"] == "20210001"

    user_query = select(Account).where(Account.username == "20210001")
    user_db = db.exec(user_query).first()
    assert user_db
    assert user_db.username == "20210001"
    verified, _ = verify_password(password, user_db.password_hash)
    assert verified


def test_register_user_with_alphanumeric_mssv(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()

    from app.models import Major, Student

    major = Major(major_name="Test Major")
    db.add(major)
    db.commit()
    db.refresh(major)

    last_student_id = db.exec(select(func.max(Student.student_id))).one() or 0
    student = Student(
        student_id=max(last_student_id, 20210002) + 1,
        last_name="Tran",
        first_name="Binh",
        google_email=email,
        major_id=major.major_id,
    )
    db.add(student)
    db.commit()

    with patch("app.services.otp_service.settings.emails_enabled", False):
        otp_response = client.post(
            f"{settings.API_V1_STR}/users/send-otp",
            json={"mssv": "N23DCCN011", "email": email},
        )
    assert otp_response.status_code == 200
    otp_code = otp_response.json()["dev_otp"]

    registration_response = client.post(
        f"{settings.API_V1_STR}/users/registrations",
        json={
            "mssv": "N23DCCN011",
            "email": email,
            "password": password,
            "otp_code": otp_code,
        },
    )
    assert registration_response.status_code == 201
    assert registration_response.json()["username"] == "N23DCCN011"

    db.refresh(student)
    assert student.account_id is not None


def test_register_user_already_exists_error(client: TestClient, db: Session) -> None:
    email = random_email()
    password = random_lower_string()

    # Create a student with an account already linked
    from datetime import datetime, timedelta

    from app.models import Major, Student
    from app.models.otp import OTPRecord

    major = Major(major_name="Test Major")
    db.add(major)
    db.commit()
    db.refresh(major)

    # Create a student without account (to test duplicate registration detection differently)
    student = Student(
        student_id=20210002,
        last_name="Tran",
        first_name="Binh",
        google_email=email,
        major_id=major.major_id,
    )
    db.add(student)
    db.commit()
    # Manually create an account for this student to simulate already-registered
    from app.models import AccountCreate as AC

    existing_account = crud.create_account(
        session=db,
        account_create=AC(username="20210002", password="Test12345", role="SINH_VIEN"),
    )
    db.refresh(student)
    student.account_id = existing_account.account_id
    db.add(student)
    db.commit()
    otp = OTPRecord(
        email=email, code="123456", expires_at=datetime.now(UTC) + timedelta(minutes=10)
    )
    db.add(otp)
    db.commit()

    data = {
        "mssv": 20210002,
        "email": email,
        "password": password,
        "otp_code": "123456",
    }
    r = client.post(
        f"{settings.API_V1_STR}/users/registrations",
        json=data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Sinh viên này đã đăng ký tài khoản trước đó"


def test_update_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    new_username = random_email()
    data = {"username": new_username}
    r = client.patch(
        f"{settings.API_V1_STR}/users/{user.account_id}",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    updated_user = r.json()

    assert updated_user["username"] == new_username

    user_query = select(Account).where(Account.username == new_username)
    user_db = db.exec(user_query).first()
    db.refresh(user_db)
    assert user_db
    assert user_db.username == new_username


def test_update_user_not_exists(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"username": random_email()}
    r = client.patch(
        f"{settings.API_V1_STR}/users/999999",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Không tìm thấy đường dẫn hoặc tài nguyên yêu cầu."


def test_update_user_email_exists(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    username2 = random_email()
    password2 = random_lower_string()
    user_in2 = AccountCreate(username=username2, password=password2)
    user2 = crud.create_user(session=db, user_create=user_in2)

    data = {"username": user2.username}
    r = client.patch(
        f"{settings.API_V1_STR}/users/{user.account_id}",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 409
    assert r.json()["message"] == "Username already exists"


def test_delete_user_me(client: TestClient, db: Session) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.account_id

    login_data = {
        "username": username,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/auth/access-tokens", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}

    r = client.delete(
        f"{settings.API_V1_STR}/users/me",
        headers=headers,
    )
    assert r.status_code == 200
    deleted_user = r.json()
    assert deleted_user["message"] == "Account deleted successfully"
    result = db.exec(select(Account).where(Account.account_id == user_id)).first()
    assert result is None

    user_query = select(Account).where(Account.account_id == user_id)
    user_db = db.execute(user_query).first()
    assert user_db is None


def test_delete_user_super_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.account_id
    r = client.delete(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    deleted_user = r.json()
    assert deleted_user["message"] == "Account deleted successfully"
    result = db.exec(select(Account).where(Account.account_id == user_id)).first()
    assert result is None


def test_delete_user_preserves_profiles_and_cleans_account_references(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    student_account = crud.create_user(
        session=db,
        user_create=AccountCreate(
            username=random_email(),
            password=random_lower_string(),
            role="SINH_VIEN",
        ),
    )
    lecturer_account = crud.create_user(
        session=db,
        user_create=AccountCreate(
            username=random_email(),
            password=random_lower_string(),
            role="GIANG_VIEN",
        ),
    )

    major = Major(major_name="Test major")
    db.add(major)
    db.commit()
    db.refresh(major)

    student = Student(
        last_name="Test",
        first_name="Student",
        major_id=major.major_id,
        account_id=student_account.account_id,
    )
    staff = Staff(
        last_name="Test",
        first_name="Lecturer",
        account_id=lecturer_account.account_id,
    )
    db.add_all([student, staff])
    db.commit()
    db.refresh(student)
    db.refresh(staff)

    face_image = FaceImage(
        student_id=student.student_id,
        reviewer_id=lecturer_account.account_id,
        image_path="test-face.jpg",
    )
    student_audit_log = AuditLog(
        ma_tai_khoan=student_account.account_id,
        hanh_dong="test student account action",
    )
    lecturer_audit_log = AuditLog(
        ma_tai_khoan=lecturer_account.account_id,
        hanh_dong="test lecturer account action",
    )
    linked_records = [
        face_image,
        RefreshToken(
            account_id=student_account.account_id,
            token_hash=random_lower_string(),
            expires_at=datetime.now(UTC),
        ),
        RefreshToken(
            account_id=lecturer_account.account_id,
            token_hash=random_lower_string(),
            expires_at=datetime.now(UTC),
        ),
        OAuthIdentity(
            provider="google",
            provider_subject=random_lower_string(),
            email=random_email(),
            account_id=student_account.account_id,
        ),
        OAuthIdentity(
            provider="google",
            provider_subject=random_lower_string(),
            email=random_email(),
            account_id=lecturer_account.account_id,
        ),
        student_audit_log,
        lecturer_audit_log,
    ]
    db.add_all(linked_records)
    db.commit()
    db.refresh(face_image)
    db.refresh(student_audit_log)
    db.refresh(lecturer_audit_log)
    student_account_id = student_account.account_id
    lecturer_account_id = lecturer_account.account_id
    student_id = student.student_id
    staff_id = staff.staff_id
    image_id = face_image.image_id
    audit_log_ids = (
        student_audit_log.ma_audit_log,
        lecturer_audit_log.ma_audit_log,
    )

    for account_id in (student_account_id, lecturer_account_id):
        response = client.delete(
            f"{settings.API_V1_STR}/users/{account_id}",
            headers=superuser_token_headers,
        )
        assert response.status_code == 200

    db.expire_all()
    assert db.get(Account, student_account_id) is None
    assert db.get(Account, lecturer_account_id) is None
    assert db.get(Student, student_id).account_id is None
    assert db.get(Staff, staff_id).account_id is None

    retained_image = db.get(FaceImage, image_id)
    assert retained_image is not None
    assert retained_image.student_id == student_id
    assert retained_image.reviewer_id is None
    account_ids = (student_account_id, lecturer_account_id)
    assert (
        db.exec(
            select(RefreshToken).where(RefreshToken.account_id.in_(account_ids))
        ).all()
        == []
    )
    assert (
        db.exec(select(OAuthIdentity).where(OAuthIdentity.account_id.in_(account_ids)))
        .all()
        == []
    )
    retained_audit_logs = db.exec(
        select(AuditLog).where(AuditLog.ma_audit_log.in_(audit_log_ids))
    ).all()
    assert len(retained_audit_logs) == 2
    assert all(log.ma_tai_khoan is None for log in retained_audit_logs)


def test_delete_user_current_super_user_error(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    super_user = crud.get_user_by_email(session=db, username=settings.FIRST_SUPERUSER)
    assert super_user
    user_id = super_user.account_id

    r = client.delete(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Admin accounts cannot delete themselves"


def test_delete_user_without_privileges(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = AccountCreate(username=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    r = client.delete(
        f"{settings.API_V1_STR}/users/{user.account_id}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403
    # Route uses get_current_active_superuser which returns Vietnamese role error
    assert "ADMIN" in r.json()["detail"]
