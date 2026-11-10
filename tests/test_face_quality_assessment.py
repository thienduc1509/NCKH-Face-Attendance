"""Unit test suite for Face Quality Assessment and Threshold Resolution."""

import glob
import os
import sys

import cv2
import numpy as np
import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.core.config import settings
from app.services.face_service import (
    DEFAULT_COSINE_THRESHOLD,
    FaceQualityAssessment,
    FaceRecognitionService,
    face_service,
    resolve_cosine_threshold,
)


def load_real_faces() -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Load real facial images from giang and phuc datasets."""
    base_dirs = [
        os.path.abspath(os.path.join(PROJECT_ROOT, "..")),
        r"c:\Users\Dell\Downloads\nckh\NCKH(ke thua tu TTCS)",
        r"c:\Users\Dell\Downloads\nckh",
    ]
    giang_imgs, phuc_imgs = [], []
    for b in base_dirs:
        g_dir = os.path.join(b, "giang")
        p_dir = os.path.join(b, "phuc")
        if not giang_imgs and os.path.isdir(g_dir):
            for f in sorted(glob.glob(os.path.join(g_dir, "*.jpg")) + glob.glob(os.path.join(g_dir, "*.png"))):
                img = cv2.imread(f)
                if img is not None:
                    giang_imgs.append(img)
        if not phuc_imgs and os.path.isdir(p_dir):
            for f in sorted(glob.glob(os.path.join(p_dir, "*.jpg")) + glob.glob(os.path.join(p_dir, "*.png"))):
                img = cv2.imread(f)
                if img is not None:
                    phuc_imgs.append(img)
    return giang_imgs, phuc_imgs


def encode_image(img: np.ndarray, ext: str = ".jpg") -> bytes:
    """Encode OpenCV BGR image array to bytes."""
    success, buf = cv2.imencode(ext, img)
    if not success:
        raise ValueError("Failed to encode image to buffer")
    return buf.tobytes()


@pytest.fixture(scope="module")
def initialized_service() -> FaceRecognitionService:
    face_service._ensure_initialized()
    return face_service


@pytest.fixture(scope="module")
def sample_face_image() -> np.ndarray:
    giang_imgs, phuc_imgs = load_real_faces()
    if giang_imgs:
        return giang_imgs[0]
    if phuc_imgs:
        return phuc_imgs[0]
    raise RuntimeError("No sample faces found")


class TestFaceQualityAssessment:
    """Verify assess_face_image quality filters (dimensions, blur, brightness)."""

    def test_quality_valid_photo_passes(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        img_bytes = encode_image(sample_face_image)
        res = initialized_service.assess_face_image(img_bytes)

        assert isinstance(res, FaceQualityAssessment)
        assert res.is_valid is True
        assert bool(res) is True
        assert res.score >= 0.60
        assert len(res.issues) == 0
        assert len(res.embedding) == 128
        assert res.details.get("face_count") == 1
        assert res.details.get("width") >= 60
        assert res.details.get("height") >= 60
        assert res.details.get("blur_var") >= 50.0
        assert 40.0 <= res.details.get("brightness") <= 220.0

    def test_quality_blur_rejection(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        blurred = cv2.GaussianBlur(sample_face_image, (31, 31), 0)
        img_bytes = encode_image(blurred)
        res = initialized_service.assess_face_image(img_bytes)

        assert res.is_valid is False
        assert bool(res) is False
        assert any("mờ" in issue.lower() or "laplacian" in issue.lower() for issue in res.issues)
        assert len(res.embedding) == 0

    def test_quality_dark_rejection(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        dark = np.clip(sample_face_image.astype(np.float32) * 0.15, 0, 255).astype(np.uint8)
        img_bytes = encode_image(dark)
        res = initialized_service.assess_face_image(img_bytes)

        assert res.is_valid is False
        assert any("tối" in issue.lower() or "độ sáng" in issue.lower() for issue in res.issues)
        assert len(res.embedding) == 0

    def test_quality_overexposure_rejection(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        glare = np.clip(sample_face_image.astype(np.int32) + 160, 0, 255).astype(np.uint8)
        img_bytes = encode_image(glare)
        res = initialized_service.assess_face_image(img_bytes)

        assert res.is_valid is False
        assert any("lóa" in issue.lower() or "cháy sáng" in issue.lower() for issue in res.issues)
        assert len(res.embedding) == 0

    def test_quality_small_face_rejection(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        # Setting min_face_size higher than the face dimensions triggers dimension rejection
        img_bytes = encode_image(sample_face_image)
        res = initialized_service.assess_face_image(img_bytes, min_face_size=3000)

        assert res.is_valid is False
        assert any("quá nhỏ" in issue.lower() for issue in res.issues)

    def test_quality_backward_compat_unpacking(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        img_bytes = encode_image(sample_face_image)
        success, message, quality_score, embedding = initialized_service.assess_face_image(img_bytes)

        assert success is True
        assert isinstance(message, str)
        assert quality_score >= 0.60
        assert len(embedding) == 128

    def test_quality_backward_compat_indexing(
        self, initialized_service: FaceRecognitionService, sample_face_image: np.ndarray
    ):
        img_bytes = encode_image(sample_face_image)
        res = initialized_service.assess_face_image(img_bytes)

        assert len(res) == 4
        assert res[0] == res.is_valid
        assert res[1] == res.message
        assert res[2] == res.score
        assert res[3] == res.embedding

    def test_quality_empty_and_garbage_bytes(
        self, initialized_service: FaceRecognitionService
    ):
        res_empty = initialized_service.assess_face_image(b"")
        assert res_empty.is_valid is False
        assert res_empty.score == 0.0
        assert res_empty.embedding == []

        res_garbage = initialized_service.assess_face_image(b"GARBAGE_BYTES_12345")
        assert res_garbage.is_valid is False
        assert res_garbage.score == 0.0
        assert res_garbage.embedding == []


class TestThresholdResolutionAndSettings:
    """Verify resolve_cosine_threshold helper and settings_app.py configuration."""

    def test_resolve_cosine_threshold_standard_range(self):
        assert resolve_cosine_threshold(0.363) == 0.363
        assert resolve_cosine_threshold(0.420) == 0.420
        assert resolve_cosine_threshold(0.50) == 0.50
        assert resolve_cosine_threshold(0.75) == 0.75
        # Strict thresholds that were previously clobbered
        assert resolve_cosine_threshold(0.82) == 0.82
        assert resolve_cosine_threshold(0.85) == 0.85
        assert resolve_cosine_threshold(0.90) == 0.90
        assert resolve_cosine_threshold(0.20) == 0.20

    def test_resolve_cosine_threshold_fallbacks(self):
        assert resolve_cosine_threshold(1.25) == DEFAULT_COSINE_THRESHOLD
        assert resolve_cosine_threshold(-0.1) == DEFAULT_COSINE_THRESHOLD
        assert resolve_cosine_threshold(None) == DEFAULT_COSINE_THRESHOLD
        assert resolve_cosine_threshold("bad") == DEFAULT_COSINE_THRESHOLD

    def test_settings_tolerance_default(self):
        assert settings.FACE_RECOGNITION_TOLERANCE == 0.363
