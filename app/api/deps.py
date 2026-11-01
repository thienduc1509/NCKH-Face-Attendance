from collections.abc import AsyncGenerator, Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session, create_engine, select

from app.core import security
from app.core.config import settings
from app.core.db import AsyncSessionFactory
from app.models import Account, TokenPayload

reusable_oauth2 = OAuth2PasswordBearer(tokenUrl="/login/access-token")

# ⚠️ TEMPORARY: Use sync session for backward compatibility
# Migration to AsyncSession happens per-route basis
sync_engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


def get_db() -> Generator[Session, None, None]:
    """Sync database session dependency for existing routes.

    TODO: Migrate to async_get_db() for new/updated routes.
    """
    with Session(sync_engine) as session:
        yield session


async def async_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Async database session dependency for FastAPI async routes.

    Use this for new routes or when migrating from sync to async.
    """
    if AsyncSessionFactory is None:
        raise RuntimeError(
            "Async database sessions are unavailable for the current DATABASE_URL"
        )
    async with AsyncSessionFactory() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
AsyncSessionDep = Annotated[AsyncSession, Depends(async_get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_account(session: SessionDep, token: TokenDep) -> Account:
    """Retrieve and validate current account from JWT token (sync version).

    TODO: Create async_get_current_account() for async routes.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    if not token_data.sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        account_id = int(token_data.sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    # Sync database query
    account = session.get(Account, account_id)

    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not account.status:
        raise HTTPException(status_code=400, detail="Inactive account")
    return account


async def async_get_current_account(
    session: AsyncSessionDep, token: TokenDep
) -> Account:
    """Retrieve and validate current account from JWT token (async version).

    Use this for async routes that need async database access.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    if not token_data.sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        account_id = int(token_data.sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    # ✅ Async database query
    stmt = select(Account).where(Account.account_id == account_id)
    result = await session.execute(stmt)
    account = result.scalar_one_or_none()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not account.status:
        raise HTTPException(status_code=400, detail="Inactive account")
    return account


CurrentAccount = Annotated[Account, Depends(get_current_account)]
AsyncCurrentAccount = Annotated[Account, Depends(async_get_current_account)]
CurrentUser = CurrentAccount


def normalize_role(role: str | None) -> str:
    normalized = (role or "").strip().upper().replace("-", "_").replace(" ", "_")
    role_aliases = {
        "ADMIN": "ADMIN",
        "QUAN_TRI_VIEN": "ADMIN",
        "QTV": "ADMIN",
        "SINH_VIEN": "SINH_VIEN",
        "SINHVIEN": "SINH_VIEN",
        "STUDENT": "SINH_VIEN",
        "SV": "SINH_VIEN",
        "GIANG_VIEN": "GIANG_VIEN",
        "GIANGVIEN": "GIANG_VIEN",
        "CAN_BO": "GIANG_VIEN",
        "CANBO": "GIANG_VIEN",
        "LECTURER": "GIANG_VIEN",
        "TEACHER": "GIANG_VIEN",
        "GV": "GIANG_VIEN",
    }
    return role_aliases.get(normalized, normalized)


def get_current_active_superuser(current_account: CurrentAccount) -> Account:
    if normalize_role(current_account.role) != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail=f"Yeu cau vai tro ADMIN, tai khoan hien tai la {current_account.role}",
        )
    return current_account


def get_current_active_student(current_account: CurrentAccount) -> Account:
    if normalize_role(current_account.role) != "SINH_VIEN":
        raise HTTPException(
            status_code=403,
            detail=f"Yeu cau vai tro SINH_VIEN, tai khoan hien tai la {current_account.role}",
        )
    return current_account


def get_current_active_lecturer(current_account: CurrentAccount) -> Account:
    if normalize_role(current_account.role) != "GIANG_VIEN":
        raise HTTPException(
            status_code=403,
            detail=f"Yeu cau vai tro GIANG_VIEN, tai khoan hien tai la {current_account.role}",
        )
    return current_account


# Async role checkers for use with async routes
async def get_current_active_superuser_async(
    current_account: AsyncCurrentAccount,
) -> Account:
    """Async version - check superuser role."""
    if normalize_role(current_account.role) != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail=f"Yeu cau vai tro ADMIN, tai khoan hien tai la {current_account.role}",
        )
    return current_account


async def get_current_active_student_async(
    current_account: AsyncCurrentAccount,
) -> Account:
    """Async version - check student role."""
    if normalize_role(current_account.role) != "SINH_VIEN":
        raise HTTPException(
            status_code=403,
            detail=f"Yeu cau vai tro SINH_VIEN, tai khoan hien tai la {current_account.role}",
        )
    return current_account


async def get_current_active_lecturer_async(
    current_account: AsyncCurrentAccount,
) -> Account:
    """Async version - check lecturer role."""
    if normalize_role(current_account.role) != "GIANG_VIEN":
        raise HTTPException(
            status_code=403,
            detail=f"Yeu cau vai tro GIANG_VIEN, tai khoan hien tai la {current_account.role}",
        )
    return current_account


import time
from collections import defaultdict


class RateLimiter:
    """A lightweight IP-based rate limiter dependency."""

    def __init__(self, times: int, seconds: int):
        self.times = times
        self.seconds = seconds
        self.history = defaultdict(list)

    def __call__(self, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        # Clean up old timestamps
        self.history[client_ip] = [
            t for t in self.history[client_ip] if now - t < self.seconds
        ]

        if len(self.history[client_ip]) >= self.times:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
            )

        self.history[client_ip].append(now)


login_rate_limiter = RateLimiter(times=5, seconds=60)
