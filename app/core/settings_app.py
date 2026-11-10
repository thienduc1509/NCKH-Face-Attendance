"""Application-level settings."""

from __future__ import annotations

from typing import Annotated

from pydantic import AnyUrl, BeforeValidator, computed_field

from app.core.settings_common import parse_cors, parse_debug
from app.core.settings_compat import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    APP_NAME: str = "diemdanh"
    PROJECT_NAME: str = "diemdanh"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    HOST: str = "0.0.0.0"
    PORT: int = 5050
    ENVIRONMENT: str = "local"
    DEBUG: Annotated[bool, BeforeValidator(parse_debug)] = False

    FRONTEND_HOST: str = "http://localhost:5173"
    GOOGLE_ALLOWED_EMAIL_DOMAIN: str = ""
    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    IMAGE_STORAGE_PROVIDER: str = "LOCAL"
    # SFace Cosine Similarity matching threshold.
    # Baseline default is 0.363 (official OpenCV Zoo 1:1 verification benchmark).
    # Operational recommendation for live multi-gallery attendance (R2 registration) is 0.420,
    # which provides 0.0% False Acceptance Rate and 100.0% True Acceptance Rate on real datasets.
    FACE_RECOGNITION_TOLERANCE: float = 0.363

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]
