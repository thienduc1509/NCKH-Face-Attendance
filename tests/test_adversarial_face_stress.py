"""
Empirical Adversarial and Multi-Face Stress Testing Suite for YuNet & SFace.

Targeting:
- Multi-face concurrent detection in single frame (real and composite datasets).
- Extreme resolutions (50x50 down to 1x1, up to 4000x3000+).
- Extreme aspect ratios (e.g. 1x2000, 2000x1, 10x4000).
- Photometric and geometric perturbations (rotations, extreme contrast, noise, blur).
- Corrupt byte payloads and zero-face scenarios.
- Thread safety and concurrency stress on detector, recognizer, and FAISS index.
"""

import concurrent.futures
import glob
import os
import sys
import threading

import cv2
import numpy as np
import pytest

# Ensure app is importable
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.services.face_service import (
    FaceRecognitionService,
    face_service,
)

# ---------------------------------------------------------------------------
# Helpers & Fixtures
# ---------------------------------------------------------------------------

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
def real_datasets():
    giang_imgs, phuc_imgs = load_real_faces()
    assert len(giang_imgs) > 0, "Giang dataset must contain at least 1 image"
    assert len(phuc_imgs) > 0, "Phuc dataset must contain at least 1 image"
    return giang_imgs, phuc_imgs


# ---------------------------------------------------------------------------
# Test Suite 1: Zero-Face, Corrupt, and Degenerate Inputs
# ---------------------------------------------------------------------------

class TestZeroFaceAndCorruptInputs:
    """Stress test the pipeline against invalid, zero-face, and corrupted inputs."""

    def test_empty_bytes_handling(self, initialized_service: FaceRecognitionService):
        """Image bytes are completely empty."""
        res = initialized_service.detect_and_recognize_faces(b"")
        assert res == [], f"Expected empty list for empty bytes, got: {res}"

        emb_res = initialized_service.extract_embeddings(b"")
        assert emb_res == [], f"Expected empty list for empty bytes, got: {emb_res}"

        success, msg, score, emb = initialized_service.assess_face_image(b"")
        assert not success
        assert score == 0.0
        assert emb == []

    def test_random_garbage_bytes(self, initialized_service: FaceRecognitionService):
        """Image bytes are completely random corrupted binary data."""
        garbage = os.urandom(4096)
        res = initialized_service.detect_and_recognize_faces(garbage)
        assert res == []

        success, msg, score, emb = initialized_service.assess_face_image(garbage)
        assert not success

    def test_truncated_jpeg_bytes(self, initialized_service: FaceRecognitionService, real_datasets):
        """Simulate incomplete network upload with truncated JPEG bytes."""
        giang_imgs, _ = real_datasets
        valid_bytes = encode_image(giang_imgs[0])
        truncated = valid_bytes[: len(valid_bytes) // 4]

        # Should handle gracefully without raising unhandled exceptions
        res = initialized_service.detect_and_recognize_faces(truncated)
        assert isinstance(res, list)

    def test_solid_color_and_random_noise_images(self, initialized_service: FaceRecognitionService):
        """Zero-face images: pure black, pure white, pure random uniform noise."""
        h, w = 480, 640
        black = np.zeros((h, w, 3), dtype=np.uint8)
        white = np.ones((h, w, 3), dtype=np.uint8) * 255
        noise = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)

        for name, img in [("black", black), ("white", white), ("noise", noise)]:
            res = initialized_service.detect_and_recognize_faces(encode_image(img))
            assert res == [], f"Expected no faces detected in {name} image, got: {res}"

            det = initialized_service.detect_faces(img)
            assert len(det) == 0, f"Expected 0 detections for {name}, got: {len(det)}"


# ---------------------------------------------------------------------------
# Test Suite 2: Extreme Resolutions & Aspect Ratios
# ---------------------------------------------------------------------------

class TestExtremeResolutionsAndDimensions:
    """Stress test boundary and extreme resolutions and aspect ratios."""

    def test_tiny_resolutions(self, initialized_service: FaceRecognitionService):
        """Test sub-face resolutions: 50x50 down to 10x10 and 1x1."""
        for dim in [50, 32, 20, 10, 5, 1]:
            tiny_img = np.zeros((dim, dim, 3), dtype=np.uint8)
            res = initialized_service.detect_and_recognize_faces(encode_image(tiny_img, ".png"))
            assert res == [], f"Tiny {dim}x{dim} should return empty list without crashing"

            # Direct detect_faces call
            det = initialized_service.detect_faces(tiny_img)
            assert isinstance(det, list)

    def test_huge_resolution_4000x3000_with_embedded_face(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Test gigantic 4000x3000 image with real face embedded at center."""
        giang_imgs, _ = real_datasets
        face_sample = cv2.resize(giang_imgs[0], (400, 400))

        huge_canvas = np.zeros((3000, 4000, 3), dtype=np.uint8)
        # Place face in the center
        huge_canvas[1300:1700, 1800:2200] = face_sample

        huge_bytes = encode_image(huge_canvas, ".jpg")
        results = initialized_service.detect_and_recognize_faces(huge_bytes)

        # YuNet pre-scaled to 640 max should detect the face
        assert len(results) >= 1, f"Expected face detected in 4000x3000 image, got {len(results)}"
        bbox = results[0]["bbox"]
        # Bbox should be in original 4000x3000 coordinates (near center x~1800, y~1300)
        assert bbox[0] > 1000, f"Bbox x coordinate {bbox[0]} should be scaled back to 4000x3000 coords"
        assert bbox[1] > 800, f"Bbox y coordinate {bbox[1]} should be scaled back to 4000x3000 coords"

    def test_extreme_aspect_ratio_behavior(self, initialized_service: FaceRecognitionService):
        """
        Adversarial aspect ratios where one dimension scales down to zero:
        e.g. 1x2000, 2000x1, 2x3000, 4000x2.
        Verifies that preprocess_image applies max(1, ...) floor guard so direct
        detect_faces handles extreme aspect ratios gracefully without cv2.error.
        """
        cases = [
            ("ultra_wide_1x2000", np.zeros((1, 2000, 3), dtype=np.uint8)),
            ("ultra_tall_2000x1", np.zeros((2000, 1, 3), dtype=np.uint8)),
            ("ultra_wide_2x3000", np.zeros((2, 3000, 3), dtype=np.uint8)),
            ("ultra_tall_4000x2", np.zeros((4000, 2, 3), dtype=np.uint8)),
        ]

        for name, img in cases:
            # 1. detect_and_recognize_faces catches gracefully
            img_bytes = encode_image(img, ".png")
            res = initialized_service.detect_and_recognize_faces(img_bytes)
            assert res == [], f"{name}: expected [] from detect_and_recognize_faces, got {res}"

            # 2. direct detect_faces must NOT crash and return empty list
            det = initialized_service.detect_faces(img)
            assert isinstance(det, list), f"{name}: direct detect_faces must return list"
            assert len(det) == 0, f"{name}: extreme aspect ratio image should detect 0 valid faces"



# ---------------------------------------------------------------------------
# Test Suite 3: Multi-Face Synthetic and Real Composite Images
# ---------------------------------------------------------------------------

class TestMultiFaceStress:
    """Stress test multi-face detection and concurrent identity recognition."""

    def test_composite_two_student_frame(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Place Giang (left) and Phuc (right) in a single 1280x720 classroom frame."""
        giang_imgs, phuc_imgs = real_datasets

        g_face = cv2.resize(giang_imgs[0], (300, 300))
        p_face = cv2.resize(phuc_imgs[0], (300, 300))

        frame = np.full((720, 1280, 3), 180, dtype=np.uint8)
        frame[200:500, 150:450] = g_face
        frame[200:500, 830:1130] = p_face

        results = initialized_service.detect_and_recognize_faces(encode_image(frame))
        assert len(results) == 2, f"Expected 2 faces detected, got {len(results)}"

        # Verify bounding box separation (left face x < 600, right face x > 600)
        x_coords = sorted([r["bbox"][0] for r in results])
        assert x_coords[0] < 500, f"Left face x {x_coords[0]} should be on left side"
        assert x_coords[1] > 600, f"Right face x {x_coords[1]} should be on right side"

    def test_composite_multi_face_grid_4_faces(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Place 4 faces in a 2x2 grid."""
        giang_imgs, phuc_imgs = real_datasets

        g1 = cv2.resize(giang_imgs[0], (250, 250))
        g2 = cv2.resize(giang_imgs[1], (250, 250))
        p1 = cv2.resize(phuc_imgs[0], (250, 250))
        p2 = cv2.resize(phuc_imgs[1], (250, 250))

        canvas = np.full((800, 800, 3), 200, dtype=np.uint8)
        canvas[50:300, 50:300] = g1
        canvas[50:300, 500:750] = p1
        canvas[500:750, 50:300] = g2
        canvas[500:750, 500:750] = p2

        results = initialized_service.detect_and_recognize_faces(encode_image(canvas))
        assert len(results) == 4, f"Expected 4 faces detected in 2x2 grid, got {len(results)}"

    def test_composite_crowd_frame_6_faces(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Place 6 faces across a 1600x900 classroom simulated frame."""
        giang_imgs, phuc_imgs = real_datasets

        faces = [
            cv2.resize(giang_imgs[i % len(giang_imgs)], (200, 200))
            for i in range(3)
        ] + [
            cv2.resize(phuc_imgs[i % len(phuc_imgs)], (200, 200))
            for i in range(3)
        ]

        canvas = np.full((900, 1600, 3), 160, dtype=np.uint8)
        positions = [
            (100, 100), (600, 100), (1100, 100),
            (100, 500), (600, 500), (1100, 500),
        ]

        for face, (x, y) in zip(faces, positions, strict=False):
            canvas[y : y + 200, x : x + 200] = face

        results = initialized_service.detect_and_recognize_faces(encode_image(canvas))
        assert len(results) == 6, f"Expected 6 faces detected in crowd frame, got {len(results)}"

        for r in results:
            assert "bbox" in r
            assert len(r["bbox"]) == 4
            assert "score" in r
            assert "detection_score" in r
            assert "recognized" in r
            assert isinstance(r["recognized"], bool)


# ---------------------------------------------------------------------------
# Test Suite 4: Photometric and Geometric Adversarial Perturbations
# ---------------------------------------------------------------------------

class TestAdversarialPerturbations:
    """Stress test the pipeline against geometric rotations, lighting extremes, and noise."""

    def test_face_rotations_90_180_270(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Test faces rotated 90 deg, 180 deg (upside down), and 270 deg."""
        giang_imgs, _ = real_datasets
        base_face = giang_imgs[0]

        rotations = [
            ("rot_90_clockwise", cv2.ROTATE_90_CLOCKWISE),
            ("rot_180_upside_down", cv2.ROTATE_180),
            ("rot_90_counterclockwise", cv2.ROTATE_90_COUNTERCLOCKWISE),
        ]

        for name, rot_code in rotations:
            rotated = cv2.rotate(base_face, rot_code)
            # Should not crash regardless of detection result
            results = initialized_service.detect_and_recognize_faces(encode_image(rotated))
            assert isinstance(results, list), f"Expected list for {name}, got {type(results)}"

    def test_extreme_underexposure_and_overexposure(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Test extreme low light (x0.05) and severe wash-out / saturation (x2.5)."""
        giang_imgs, _ = real_datasets
        base_face = giang_imgs[0]

        # Underexposed: factor 0.05
        dark = np.clip(base_face.astype(np.float32) * 0.05, 0, 255).astype(np.uint8)
        res_dark = initialized_service.detect_and_recognize_faces(encode_image(dark))
        assert isinstance(res_dark, list)

        # Overexposed: factor 2.5
        bright = np.clip(base_face.astype(np.float32) * 2.5, 0, 255).astype(np.uint8)
        res_bright = initialized_service.detect_and_recognize_faces(encode_image(bright))
        assert isinstance(res_bright, list)

    def test_severe_gaussian_noise_and_blur(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Test severe Gaussian noise (sigma=80) and heavy Gaussian blur (kernel 51x51)."""
        giang_imgs, _ = real_datasets
        base_face = giang_imgs[0]

        # Noise
        noise = np.random.normal(0, 80, base_face.shape).astype(np.float32)
        noisy = np.clip(base_face.astype(np.float32) + noise, 0, 255).astype(np.uint8)
        res_noisy = initialized_service.detect_and_recognize_faces(encode_image(noisy))
        assert isinstance(res_noisy, list)

        # Blur
        blurred = cv2.GaussianBlur(base_face, (51, 51), 0)
        res_blur = initialized_service.detect_and_recognize_faces(encode_image(blurred))
        assert isinstance(res_blur, list)

    def test_compute_similarity_mismatched_dimension_guard(
        self, initialized_service: FaceRecognitionService
    ):
        """
        Verifies that compute_similarity validates vector dimensions before OpenCV match.
        Mismatched dimensions return 0.0 with warning, and raise ValueError if raise_on_error=True,
        never triggering OpenCV C++ cv2.error (-209).
        """
        v_128 = np.ones(128, dtype=np.float32)
        v_512 = np.ones(512, dtype=np.float32)
        v_64 = np.ones(64, dtype=np.float32)
        v_nan = np.full(128, np.nan, dtype=np.float32)
        v_zero = np.zeros(128, dtype=np.float32)

        # Default safe behavior: returns 0.0
        assert initialized_service.compute_similarity(v_128, v_512) == 0.0
        assert initialized_service.compute_similarity(v_64, v_128) == 0.0
        assert initialized_service.compute_similarity(v_nan, v_128) == 0.0
        assert initialized_service.compute_similarity(v_zero, v_128) == 0.0

        # Strict validation mode: raises ValueError
        with pytest.raises(ValueError, match="dimension mismatch"):
            initialized_service.compute_similarity(v_128, v_512, raise_on_error=True)
        with pytest.raises(ValueError, match="dimension mismatch"):
            initialized_service.compute_similarity(v_64, v_128, raise_on_error=True)
        with pytest.raises(ValueError, match="non-finite values"):
            initialized_service.compute_similarity(v_nan, v_128, raise_on_error=True)



# ---------------------------------------------------------------------------
# Test Suite 5: Multi-threaded Concurrency & Thread Safety Stress
# ---------------------------------------------------------------------------

class TestThreadSafetyAndConcurrency:
    """Stress test thread safety under concurrent multi-client requests."""

    def test_concurrent_detect_and_recognize_diverse_resolutions(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """
        Invoke detect_and_recognize_faces concurrently across 8 threads
        with diverse resolutions to stress detector.setInputSize lock safety.
        """
        giang_imgs, phuc_imgs = real_datasets

        test_payloads = [
            encode_image(giang_imgs[0]),                       # regular ~640x480
            encode_image(cv2.resize(phuc_imgs[0], (1920, 1080))),# 1080p
            encode_image(cv2.resize(giang_imgs[1], (320, 240))), # low-res
            encode_image(np.zeros((100, 100, 3), dtype=np.uint8)),# zero-face
            encode_image(cv2.resize(phuc_imgs[1], (1280, 720))),# 720p
            b"corrupted_payload_for_thread_test",               # garbage
            b"",                                                # empty
            encode_image(giang_imgs[2 % len(giang_imgs)]),      # regular
        ]

        errors = []
        results = []

        def worker(payload: bytes, worker_id: int):
            try:
                res = initialized_service.detect_and_recognize_faces(payload)
                return worker_id, res
            except Exception as exc:
                errors.append((worker_id, exc))
                return worker_id, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [
                executor.submit(worker, payload, idx)
                for idx, payload in enumerate(test_payloads * 3) # 24 tasks total
            ]
            for f in concurrent.futures.as_completed(futures):
                results.append(f.result())

        assert len(errors) == 0, f"Thread errors encountered: {errors}"
        assert len(results) == len(test_payloads) * 3

    def test_concurrent_embedding_and_similarity(
        self, initialized_service: FaceRecognitionService, real_datasets
    ):
        """Concurrent calls to extract_embedding and compute_similarity."""
        giang_imgs, _ = real_datasets
        det = initialized_service.detect_faces(giang_imgs[0])
        assert len(det) > 0
        face_info = det[0][5]

        errors = []

        def worker_embedding():
            try:
                emb = initialized_service.extract_embedding(giang_imgs[0], face_info)
                assert emb.shape == (128,)
                sim = initialized_service.compute_similarity(emb, emb)
                assert sim >= 0.99
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker_embedding) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent embedding errors: {errors}"

    def test_concurrent_add_face_embedding_and_faiss_sync(
        self, initialized_service: FaceRecognitionService
    ):
        """
        Stress test concurrent writes to FAISS index and disk cache.
        Tests if add_face_embedding is thread-safe or if it suffers from
        file locking / race conditions when multiple threads persist indices simultaneously.
        """
        emb = np.random.randn(128).astype(np.float32)
        emb = (emb / np.linalg.norm(emb)).tolist()

        errors = []

        def worker_add(student_id: int):
            try:
                initialized_service.add_face_embedding(student_id, emb)
            except Exception as e:
                errors.append((student_id, type(e).__name__, str(e)))

        # Launch 8 concurrent threads adding embeddings simultaneously
        threads = [
            threading.Thread(target=worker_add, args=(9990 + i,))
            for i in range(8)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        if errors:
            print(f"[CONCURRENCY VULNERABILITY FOUND] Concurrent add_face_embedding errors: {errors}")
        assert len(errors) == 0, f"Concurrent add_face_embedding failed: {errors}"



# ---------------------------------------------------------------------------
# Direct Runner for Standalone Verification
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    pytest.main(["-v", __file__])
