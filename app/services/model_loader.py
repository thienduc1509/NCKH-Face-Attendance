"""Model loader and auto-downloader for OpenCV Zoo YuNet and SFace ONNX models."""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import shutil
import ssl
import time
import urllib.request
from pathlib import Path
from typing import NamedTuple

logger = logging.getLogger(__name__)


class ModelMeta(NamedTuple):
    name: str
    filename: str
    url: str
    expected_size: int
    expected_sha256: str
    expected_md5: str


YUNET_META = ModelMeta(
    name="YuNet (Face Detection)",
    filename="face_detection_yunet_2023mar.onnx",
    url=(
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_detection_yunet/face_detection_yunet_2023mar.onnx"
    ),
    expected_size=232589,
    expected_sha256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    expected_md5="4ae92eeb150c82ce15ac80738b3b8167",
)

SFACE_META = ModelMeta(
    name="SFace (Face Recognition)",
    filename="face_recognition_sface_2021dec.onnx",
    url=(
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_recognition_sface/face_recognition_sface_2021dec.onnx"
    ),
    expected_size=38696353,
    expected_sha256="0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    expected_md5="943693ea9c7ddfd9a66dc7b7e8d52a4f",
)


def get_default_weights_dir() -> Path:
    """Resolve the default weights storage directory."""
    env_dir = os.getenv("MODEL_WEIGHTS_DIR") or os.getenv("WEIGHTS_DIR")
    if env_dir:
        return Path(env_dir).resolve()

    # Backend project root: 3 levels up from app/services/model_loader.py
    current_file = Path(__file__).resolve()
    backend_root = current_file.parent.parent.parent
    return backend_root / "weights"


def get_fallback_search_dirs() -> list[Path]:
    """List fallback directories where pre-existing weights might be found."""
    current_file = Path(__file__).resolve()
    backend_root = current_file.parent.parent.parent
    return [
        backend_root / "weights",
        backend_root.parent / "weights",
        backend_root.parent.parent / "weights",
        Path("weights").resolve(),
    ]


def verify_file_integrity(file_path: Path, meta: ModelMeta) -> bool:
    """Perform Tier 1 (size) and Tier 2 (sha256) validation."""
    if not file_path.is_file():
        return False

    actual_size = file_path.stat().st_size
    if actual_size != meta.expected_size:
        logger.warning(
            "Size mismatch for %s: expected %d, got %d",
            file_path.name,
            meta.expected_size,
            actual_size,
        )
        return False

    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256_hash.update(chunk)

    actual_sha256 = sha256_hash.hexdigest().lower()
    if actual_sha256 != meta.expected_sha256.lower():
        logger.warning(
            "SHA256 mismatch for %s: expected %s, got %s",
            file_path.name,
            meta.expected_sha256,
            actual_sha256,
        )
        return False

    return True


def verify_opencv_loadability(file_path: Path, is_yunet: bool) -> bool:
    """Perform Tier 3 OpenCV runtime validation."""
    try:
        import cv2

        if is_yunet:
            detector = cv2.FaceDetectorYN.create(str(file_path), "", (320, 320))
            return detector is not None
        else:
            recognizer = cv2.FaceRecognizerSF.create(str(file_path), "")
            return recognizer is not None
    except Exception as exc:
        logger.error("OpenCV failed to load model %s: %s", file_path.name, exc)
        return False


def download_model(meta: ModelMeta, dest_path: Path, max_retries: int = 3) -> None:
    """Download model with streaming chunks, SSL handling, retries, and atomic replace."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_name(f"{meta.filename}.tmp.{os.getpid()}")

    try:
        import certifi

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ssl_ctx = ssl.create_default_context()

    headers = {
        "User-Agent": "NCKH-Face-Attendance/1.0 (OpenCV-Zoo-Downloader)",
        "Accept": "*/*",
    }

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(
                "Downloading %s (attempt %d/%d) from %s...",
                meta.name,
                attempt,
                max_retries,
                meta.url,
            )
            req = urllib.request.Request(meta.url, headers=headers)
            sha256_hash = hashlib.sha256()
            downloaded_bytes = 0

            with urllib.request.urlopen(req, context=ssl_ctx, timeout=30.0) as resp, open(
                temp_path, "wb"
            ) as out_f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    out_f.write(chunk)
                    sha256_hash.update(chunk)
                    downloaded_bytes += len(chunk)

            if downloaded_bytes != meta.expected_size:
                raise ValueError(
                    f"Incomplete download: got {downloaded_bytes} bytes, expected {meta.expected_size}"
                )

            calc_sha = sha256_hash.hexdigest().lower()
            if calc_sha != meta.expected_sha256.lower():
                raise ValueError(
                    f"Checksum mismatch: got {calc_sha}, expected {meta.expected_sha256}"
                )

            # Atomic replace
            os.replace(temp_path, dest_path)
            logger.info("Successfully downloaded and verified %s -> %s", meta.name, dest_path)
            return

        except Exception as exc:
            logger.warning("Download failed for %s on attempt %d: %s", meta.name, attempt, exc)
            if temp_path.exists():
                with contextlib.suppress(OSError):
                    temp_path.unlink()
            if attempt == max_retries:
                raise RuntimeError(
                    f"Failed to download {meta.name} after {max_retries} attempts: {exc}"
                ) from exc
            time.sleep(2**attempt)


def ensure_model(meta: ModelMeta, target_dir: Path, is_yunet: bool) -> Path:
    """Ensure a specific model is available, verified, and loadable."""
    target_path = target_dir / meta.filename

    # 1. Check target path
    if target_path.exists() and verify_file_integrity(target_path, meta):
        if verify_opencv_loadability(target_path, is_yunet):
            return target_path
        logger.warning("Target model %s corrupted in OpenCV, re-acquiring...", target_path)
        target_path.unlink(missing_ok=True)

    # 2. Check fallback directories
    for fallback_dir in get_fallback_search_dirs():
        candidate = fallback_dir / meta.filename
        try:
            if (
                candidate.resolve() != target_path.resolve()
                and candidate.is_file()
                and verify_file_integrity(candidate, meta)
                and verify_opencv_loadability(candidate, is_yunet)
            ):
                    logger.info("Found valid cached model at %s, copying to %s...", candidate, target_path)
                    target_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(candidate, target_path)
                    return target_path
        except Exception:
            continue

    # 3. Download from OpenCV Zoo
    download_model(meta, target_path)

    # 4. Final OpenCV verification
    if not verify_opencv_loadability(target_path, is_yunet):
        target_path.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded model {meta.name} failed OpenCV runtime validation.")

    return target_path


def ensure_models_available(target_dir: Path | str | None = None) -> tuple[Path, Path]:
    """
    Ensure both YuNet and SFace models are available and verified.

    Returns:
        tuple[Path, Path]: (yunet_path, sface_path)
    """
    if target_dir is None:
        destination = get_default_weights_dir()
    else:
        destination = Path(target_dir).resolve()

    destination.mkdir(parents=True, exist_ok=True)
    yunet_path = ensure_model(YUNET_META, destination, is_yunet=True)
    sface_path = ensure_model(SFACE_META, destination, is_yunet=False)

    return yunet_path, sface_path


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    y_path, s_path = ensure_models_available()
    print(f"YuNet model ready at: {y_path} ({y_path.stat().st_size} bytes)")
    print(f"SFace model ready at: {s_path} ({s_path.stat().st_size} bytes)")
