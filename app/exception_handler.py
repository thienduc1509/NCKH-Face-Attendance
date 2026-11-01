import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


def init_app(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(404, not_found_handler)
    app.add_exception_handler(AppException, app_exception_handler)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    logger.warning("request_validation_error path=%s error=%s", request.url.path, exc)
    errors = exc.errors()
    translated_msgs = []
    field_name_map = {
        "password": "Mật khẩu",
        "email": "Email",
        "mssv": "Mã số sinh viên (MSSV)",
        "otp_code": "Mã OTP",
        "username": "Tên đăng nhập",
    }
    for err in errors:
        loc_field = err.get("loc", [])[-1] if err.get("loc") else "thông tin"
        err_type = err.get("type", "")
        msg = err.get("msg", "")
        display_field = field_name_map.get(str(loc_field), str(loc_field))

        if "string_too_short" in err_type or "at least" in msg:
            ctx = err.get("ctx", {})
            min_l = ctx.get("min_length", 5)
            translated_msgs.append(f"{display_field} phải chứa ít nhất {min_l} ký tự.")
        elif "missing" in err_type:
            translated_msgs.append(f"Vui lòng nhập đầy đủ {display_field}.")
        elif "type_error" in err_type or "value_error" in err_type:
            translated_msgs.append(f"Định dạng {display_field} không hợp lệ.")
        else:
            translated_msgs.append(f"Lỗi {display_field}: {msg}")

    final_msg = (
        " ".join(translated_msgs)
        if translated_msgs
        else "Dữ liệu nhập vào không hợp lệ. Vui lòng kiểm tra lại."
    )
    return JSONResponse(
        status_code=400, content={"detail": final_msg, "message": final_msg}
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.warning(
        "http_exception path=%s detail=%s status_code=%s",
        request.url.path,
        exc.detail,
        exc.status_code,
    )
    detail_str = str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail_str, "message": detail_str},
        headers=exc.headers,
    )


async def not_found_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.info("not_found path=%s", request.url.path)
    return JSONResponse(
        status_code=404,
        content={
            "detail": "Không tìm thấy đường dẫn hoặc tài nguyên yêu cầu.",
            "message": "Không tìm thấy tài nguyên yêu cầu.",
        },
    )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    logger.error(
        "app_exception path=%s detail=%s status_code=%s",
        request.url.path,
        exc.detail,
        exc.status_code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "message": exc.detail},
    )
