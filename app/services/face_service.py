"""Face detection, recognition, and enrollment service using OpenCV YuNet & SFace."""

import os
import pickle
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import cv2
import faiss
import numpy as np
from fastapi import Request
from sqlmodel import Session, select

from app.core.exceptions import (
    FaceImageNotFoundError,
    FaceQualityUnacceptableError,
    InvalidFaceEmbeddingError,
    StudentNotFoundError,
)
from app.models import FaceImage, FaceImagesPublic, Student
from app.services.model_loader import ensure_models_available
from app.utils.logger import logger

UPLOAD_DIR = "uploads/faces"
DB_DIR = "vector_db/embeddings_db"
INDEX_PATH = os.path.join(DB_DIR, "faiss_index.bin")
META_PATH = os.path.join(DB_DIR, "names.pkl")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DB_DIR, exist_ok=True)

# Standard SFace Cosine Similarity threshold (per OpenCV Zoo 1:1 reference benchmark)
DEFAULT_COSINE_THRESHOLD = 0.363
# Recommended operational threshold for live classroom multi-gallery attendance (R2)
RECOMMENDED_GALLERY_THRESHOLD = 0.420
# Maximum dimension for pre-scaling to stay within YuNet anchor receptive field
MAX_DETECTION_DIMENSION = 640


@dataclass
class FaceQualityAssessment:
    """
    Structured outcome of face quality evaluation for enrollment and verification.

    Attributes:
        is_valid: True if face passes all quality thresholds; False otherwise.
        score: Quality score (detector confidence or composite quality score in [0.0, 1.0]).
        issues: List of human-readable explanations if quality checks fail.
        details: Dictionary containing granular metrics (dimensions, blur, brightness, bbox).
        embedding: 128D SFace feature vector if valid; empty list if rejected.
    """

    is_valid: bool
    score: float
    issues: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    embedding: list[float] = field(default_factory=list)

    @property
    def message(self) -> str:
        """Human-readable summary message."""
        if self.is_valid:
            return "Ảnh khuôn mặt hợp lệ"
        if self.issues:
            return "; ".join(self.issues)
        return "Ảnh khuôn mặt không đạt tiêu chuẩn chất lượng"

    def __bool__(self) -> bool:
        return self.is_valid

    def __iter__(self):
        """Allow backwards-compatible 4-tuple unpacking: (success, msg, score, emb)."""
        yield self.is_valid
        yield self.message
        yield self.score
        yield self.embedding

    def __getitem__(self, index: int) -> Any:
        """Allow tuple index access: [0] -> is_valid, [1] -> message, etc."""
        items = (self.is_valid, self.message, self.score, self.embedding)
        return items[index]

    def __len__(self) -> int:
        return 4


def resolve_cosine_threshold(
    tolerance: float | None = None,
    default_threshold: float = DEFAULT_COSINE_THRESHOLD,
) -> float:
    """
    Validate and resolve a Cosine similarity matching threshold.

    Guarantees that any valid cosine similarity threshold within [0.0, 1.0] — specifically
    including the full operational face recognition range [0.2, 0.9] (e.g. 0.363, 0.420, 0.850) —
    is strictly respected and never clobbered by legacy heuristic checks.

    Legacy Euclidean distances (> 1.0), negative values, non-numeric values, or None
    safely fall back to `default_threshold` (0.363).

    Args:
        tolerance: Provided threshold value.
        default_threshold: Fallback threshold (defaults to DEFAULT_COSINE_THRESHOLD = 0.363).

    Returns:
        float: Bounded, validated Cosine similarity threshold.
    """
    if tolerance is None:
        return default_threshold

    try:
        val = float(tolerance)
    except (ValueError, TypeError):
        logger.warning(
            "Non-numeric tolerance %r provided; falling back to default %.4f",
            tolerance,
            default_threshold,
        )
        return default_threshold

    # Respect all mathematically valid cosine thresholds in [0.0, 1.0].
    # This explicitly protects [0.2, 0.9], ensuring thresholds such as 0.82 or 0.85 are preserved.
    if 0.0 <= val <= 1.0:
        return val

    # Values > 1.0 (such as legacy Euclidean distances) or negative values are invalid for Cosine matching.
    logger.warning(
        "Tolerance %.4f is outside valid cosine similarity range [0.0, 1.0]; "
        "falling back to default %.4f",
        val,
        default_threshold,
    )
    return default_threshold


def normalize_embedding(embedding: Any) -> list[float]:
    """
    Convert supported embedding values to a plain float list.

    Args:
        embedding: Raw embedding value from NumPy, SQLModel, or plain Python.

    Returns:
        Embedding converted to a list of floats, or an empty list.
    """
    if embedding is None:
        return []
    if isinstance(embedding, np.ndarray):
        return embedding.astype("float32").tolist()
    return list(embedding)


def preprocess_image(
    img_bgr: np.ndarray,
    max_dimension: int = MAX_DETECTION_DIMENSION,
) -> tuple[np.ndarray, float]:
    """
    Scale image down if its largest dimension exceeds max_dimension.

    Guards against zero-dimension resize crash on extreme aspect ratios
    (e.g., 1x2000, 2000x1) by enforcing max(1, ...) on target dimensions.

    Args:
        img_bgr: Source image in BGR format.
        max_dimension: Maximum allowed size for width or height.

    Returns:
        Tuple of (scaled_image, scale_factor) where scale_factor = new_size / orig_size.
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr, 1.0

    h, w = img_bgr.shape[:2]
    if h == 0 or w == 0:
        return img_bgr, 1.0

    max_side = max(h, w)
    if max_side > max_dimension:
        scale = max_dimension / float(max_side)
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        scaled_img = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return scaled_img, scale
    return img_bgr, 1.0


class FaceRecognitionService:
    """Manage face embeddings, FAISS cache, and face recognition via YuNet & SFace."""

    _instance: "FaceRecognitionService | None" = None

    def __new__(cls) -> "FaceRecognitionService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def _ensure_initialized(self) -> None:
        if not getattr(self, "initialized", False):
            self._initialize()
            self.initialized = True

    def _initialize(self) -> None:
        logger.info("Initializing FaceRecognitionService with OpenCV YuNet & SFace...")
        self._lock = threading.Lock()

        # 1. Ensure ONNX weights are present and verified
        yunet_path, sface_path = ensure_models_available()

        # 2. Initialize YuNet FaceDetectorYN
        self.detector = cv2.FaceDetectorYN.create(
            model=str(yunet_path),
            config="",
            input_size=(320, 320),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000,
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU,
        )

        # 3. Initialize SFace FaceRecognizerSF (128D embeddings, Cosine metric)
        self.recognizer = cv2.FaceRecognizerSF.create(
            model=str(sface_path),
            config="",
            backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
            target_id=cv2.dnn.DNN_TARGET_CPU,
        )

        # 4. Initialize FAISS 128D index and metadata
        self.index: faiss.IndexFlatIP | None = None
        self.names: list[int] = []
        self.student_info: dict[int, dict[str, str]] = {}
        self._load_faiss_index()
        logger.info("FaceRecognitionService (YuNet & SFace 128D) initialized successfully.")

    def _load_faiss_index(self) -> None:
        """Load the FAISS 128D index from disk or rebuild it from the database."""
        if os.path.exists(INDEX_PATH) and os.path.exists(META_PATH):
            try:
                loaded_index = faiss.read_index(INDEX_PATH)
                if loaded_index.d == 128:
                    self.index = loaded_index
                    with open(META_PATH, "rb") as metadata_file:
                        self.names = pickle.load(metadata_file)
                    logger.info(
                        "Loaded FAISS index from local cache: %s faces (128D)",
                        self.index.ntotal,
                    )
                    return
                else:
                    logger.warning(
                        "Existing FAISS index dimension %s != 128; rebuilding from DB.",
                        loaded_index.d,
                    )
            except Exception as e:
                logger.warning("Failed to load existing FAISS index: %s", e)

        self.index = faiss.IndexFlatIP(128)
        self.names = []
        self._sync_faiss_index_from_database()

    def _sync_faiss_index_from_database(self) -> None:
        """Rebuild the FAISS index from approved database embeddings (128D)."""
        try:
            from app.core.db import engine

            with Session(engine) as session:
                statement = select(FaceImage).where(
                    FaceImage.embedding_vector.is_not(None),
                    FaceImage.review_status == "DA_DUYET",
                )
                records = session.exec(statement).all()

                students = session.exec(select(Student)).all()
                self.student_info = {
                    s.student_id: {
                        "name": f"{s.last_name or ''} {s.first_name or ''}".strip(),
                        "email": s.google_email or "",
                    }
                    for s in students
                    if s.student_id is not None
                }

            vectors: list[list[float]] = []
            names: list[int] = []
            for record in records:
                embedding = normalize_embedding(record.embedding_vector)
                if len(embedding) == 128:
                    emb_np = np.array(embedding, dtype="float32")
                    norm = np.linalg.norm(emb_np)
                    if norm > 1e-6:
                        emb_np = emb_np / norm
                    vectors.append(emb_np.tolist())
                    names.append(record.student_id)

            if vectors and self.index is not None:
                vector_array = np.array(vectors, dtype="float32")
                self.index.add(vector_array)
                self.names = names
                logger.info(
                    "Synchronized FAISS index from database: %s faces",
                    self.index.ntotal,
                )
        except Exception:
            logger.exception("Error synchronizing face embeddings from database")
        finally:
            self._save_faiss_index()

    def _save_faiss_index(self) -> None:
        """Persist the FAISS index and metadata to local storage."""
        if self.index is not None:
            faiss.write_index(self.index, INDEX_PATH)
        with open(META_PATH, "wb") as metadata_file:
            pickle.dump(self.names, metadata_file)

    def detect_faces(
        self,
        img_bgr: np.ndarray,
        score_threshold: float = 0.6,
    ) -> list[tuple[int, int, int, int, float, np.ndarray]]:
        """
        Detect all faces in a BGR image using YuNet.

        Returns:
            List of (x, y, w, h, score, orig_face_array) for detected faces.
        """
        self._ensure_initialized()
        if img_bgr is None or img_bgr.size == 0 or img_bgr.shape[0] < 10 or img_bgr.shape[1] < 10:
            return []

        scaled_img, scale = preprocess_image(img_bgr)
        with self._lock:
            self.detector.setInputSize((scaled_img.shape[1], scaled_img.shape[0]))
            _, faces = self.detector.detect(scaled_img)

        if faces is None or len(faces) == 0:
            return []

        results: list[tuple[int, int, int, int, float, np.ndarray]] = []
        for face in faces:
            # Check array finiteness and positive dimensions
            if not np.all(np.isfinite(face[:15])):
                continue
            if face[2] <= 0 or face[3] <= 0:
                continue

            score = float(face[14])
            if score < score_threshold:
                continue
            orig_face = face.copy()
            orig_face[0:14] = face[0:14] / scale
            x, y, w, h = (
                int(round(orig_face[0])),
                int(round(orig_face[1])),
                int(round(orig_face[2])),
                int(round(orig_face[3])),
            )
            results.append((x, y, w, h, score, orig_face))
        return results

    def extract_embedding(self, img_bgr: np.ndarray, face_info: np.ndarray) -> np.ndarray:
        """
        Extract 128D L2-normalized feature vector from face_info (15-element array).

        Returns:
            128-dimensional float32 numpy array.
        """
        self._ensure_initialized()
        with self._lock:
            aligned = self.recognizer.alignCrop(img_bgr, face_info)
            feature = self.recognizer.feature(aligned)

        norm = np.linalg.norm(feature)
        if norm > 1e-6:
            feature = feature / norm
        return feature.flatten().astype("float32")

    def compute_similarity(
        self,
        feat1: Any,
        feat2: Any,
        raise_on_error: bool = False,
    ) -> float:
        """
        Compute Cosine similarity between two 128D SFace feature vectors.

        Performs input coercion, dimension validation (128D), finiteness check,
        and zero-norm protection to prevent OpenCV C++ crashes (-209).

        Args:
            feat1: First 128D feature vector (numpy array or float list).
            feat2: Second 128D feature vector (numpy array or float list).
            raise_on_error: If True, raise ValueError on invalid dimensions or values.
                            If False (default), log a warning and return 0.0.

        Returns:
            Cosine similarity score in range [-1.0, 1.0]. Returns 0.0 on invalid input.
        """
        self._ensure_initialized()

        # Coerce to numpy array
        if feat1 is None or feat2 is None:
            if raise_on_error:
                raise ValueError("Feature vectors cannot be None")
            logger.warning("compute_similarity received None input. Returning 0.0")
            return 0.0

        if not isinstance(feat1, np.ndarray):
            feat1 = np.asarray(feat1, dtype=np.float32)
        if not isinstance(feat2, np.ndarray):
            feat2 = np.asarray(feat2, dtype=np.float32)

        # Dimension validation: must have exactly 128 elements
        if feat1.size != 128 or feat2.size != 128:
            msg = (
                f"Feature vector dimension mismatch: feat1={feat1.size}, "
                f"feat2={feat2.size} (expected 128D)"
            )
            if raise_on_error:
                raise ValueError(msg)
            logger.warning("%s. Returning 0.0", msg)
            return 0.0

        # Finiteness validation (NaN / Inf protection)
        if not np.all(np.isfinite(feat1)) or not np.all(np.isfinite(feat2)):
            msg = "Feature vectors contain non-finite values (NaN or Inf)"
            if raise_on_error:
                raise ValueError(msg)
            logger.warning("%s. Returning 0.0", msg)
            return 0.0

        # Zero-norm protection
        norm1 = float(np.linalg.norm(feat1))
        norm2 = float(np.linalg.norm(feat2))
        if norm1 < 1e-6 or norm2 < 1e-6:
            logger.debug("Feature vector with near-zero norm encountered. Returning 0.0")
            return 0.0

        # Reshape strictly to (1, 128) float32 for OpenCV SFace recognizer
        f1_mat = feat1.reshape(1, 128).astype("float32")
        f2_mat = feat2.reshape(1, 128).astype("float32")

        with self._lock:
            return float(
                self.recognizer.match(
                    f1_mat,
                    f2_mat,
                    cv2.FaceRecognizerSF_FR_COSINE,
                )
            )

    def extract_embeddings(self, image_bytes: bytes) -> list[np.ndarray]:
        """
        Return 128D face embeddings found in one image.

        Args:
            image_bytes: Raw image bytes to inspect.

        Returns:
            List of 128D float32 numpy arrays.
        """
        self._ensure_initialized()
        if not image_bytes:
            return []
        try:
            np_arr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if img is None:
                return []

            detected = self.detect_faces(img)
            return [self.extract_embedding(img, face[5]) for face in detected]
        except Exception:
            logger.exception("Error extracting embeddings with YuNet + SFace")
            return []

    def assess_face_image(
        self,
        image_bytes: bytes,
        min_quality: float = 0.60,
        min_face_size: int = 60,
        min_blur_var: float = 50.0,
        min_brightness: float = 40.0,
        max_brightness: float = 220.0,
    ) -> FaceQualityAssessment:
        """
        Validate one enrollment image and return structured assessment with 128D embedding.

        Performs:
        1. Decode validation
        2. Single face presence check
        3. YuNet detector confidence check (score >= min_quality)
        4. Face dimension resolution check (width and height >= min_face_size)
        5. Safe bounding box cropping
        6. Scale-normalized Laplacian variance blur check (var >= min_blur_var)
        7. Brightness check (min_brightness <= mean_intensity <= max_brightness)
        8. SFace 128D feature extraction if valid

        Returns:
            FaceQualityAssessment (supports backward-compatible 4-tuple unpacking)
        """
        self._ensure_initialized()
        if not image_bytes:
            return FaceQualityAssessment(
                is_valid=False,
                score=0.0,
                issues=["Dữ liệu ảnh rỗng"],
                details={"error": "empty_bytes"},
                embedding=[],
            )

        try:
            np_arr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if img is None:
                return FaceQualityAssessment(
                    is_valid=False,
                    score=0.0,
                    issues=["Không thể đọc dữ liệu ảnh"],
                    details={"error": "decode_failed"},
                    embedding=[],
                )

            detected = self.detect_faces(img, score_threshold=0.3)
            if len(detected) == 0:
                return FaceQualityAssessment(
                    is_valid=False,
                    score=0.0,
                    issues=["Không tìm thấy khuôn mặt trong ảnh"],
                    details={"face_count": 0},
                    embedding=[],
                )
            if len(detected) > 1:
                return FaceQualityAssessment(
                    is_valid=False,
                    score=0.0,
                    issues=[f"Ảnh có nhiều hơn 1 khuôn mặt ({len(detected)} khuôn mặt)"],
                    details={"face_count": len(detected)},
                    embedding=[],
                )

            x, y, w, h, quality_score, orig_face = detected[0]
            quality_score = float(round(max(0.0, min(1.0, quality_score)), 4))

            issues: list[str] = []
            if quality_score < min_quality:
                issues.append(
                    f"Chất lượng nhận diện khuôn mặt chưa đạt ({quality_score:.4f} < {min_quality:.2f})"
                )

            if w < min_face_size or h < min_face_size:
                issues.append(
                    f"Kích thước khuôn mặt quá nhỏ ({w}x{h} < {min_face_size}x{min_face_size})"
                )

            img_h, img_w = img.shape[:2]
            x1 = max(0, int(x))
            y1 = max(0, int(y))
            x2 = min(img_w, int(x + w))
            y2 = min(img_h, int(y + h))

            face_crop = img[y1:y2, x1:x2]
            if face_crop.size == 0 or face_crop.shape[0] < 10 or face_crop.shape[1] < 10:
                return FaceQualityAssessment(
                    is_valid=False,
                    score=quality_score,
                    issues=["Không thể cắt vùng khuôn mặt hợp lệ"],
                    details={"face_count": 1, "bbox": [int(x), int(y), int(w), int(h)]},
                    embedding=[],
                )

            face_gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)

            # Scale-invariant blur normalization: if crop max dimension > 300px, normalize to 300px
            eval_gray = face_gray
            crop_max_dim = max(face_gray.shape[:2])
            if crop_max_dim > 300:
                eval_scale = 300.0 / crop_max_dim
                eval_gray = cv2.resize(
                    face_gray,
                    (int(face_gray.shape[1] * eval_scale), int(face_gray.shape[0] * eval_scale)),
                )

            blur_var = float(cv2.Laplacian(eval_gray, cv2.CV_64F).var())
            if blur_var < min_blur_var:
                issues.append(
                    f"Ảnh bị mờ, không đủ độ nét (Laplacian var: {blur_var:.1f} < {min_blur_var:.1f})"
                )

            mean_brightness = float(np.mean(face_gray))
            if mean_brightness < min_brightness:
                issues.append(
                    f"Ảnh quá tối (độ sáng: {mean_brightness:.1f} < {min_brightness:.1f})"
                )
            if mean_brightness > max_brightness:
                issues.append(
                    f"Ảnh bị lóa/cháy sáng (độ sáng: {mean_brightness:.1f} > {max_brightness:.1f})"
                )

            details = {
                "face_count": 1,
                "bbox": [int(x), int(y), int(w), int(h)],
                "width": int(w),
                "height": int(h),
                "blur_var": round(blur_var, 2),
                "brightness": round(mean_brightness, 2),
                "detector_confidence": round(quality_score, 4),
            }

            if len(issues) == 0:
                embedding = self.extract_embedding(img, orig_face).tolist()
                return FaceQualityAssessment(
                    is_valid=True,
                    score=quality_score,
                    issues=[],
                    details=details,
                    embedding=embedding,
                )
            else:
                return FaceQualityAssessment(
                    is_valid=False,
                    score=quality_score,
                    issues=issues,
                    details=details,
                    embedding=[],
                )
        except Exception:
            logger.exception("Error assessing face image")
            return FaceQualityAssessment(
                is_valid=False,
                score=0.0,
                issues=["Không thể kiểm tra chất lượng ảnh"],
                details={"error": "exception"},
                embedding=[],
            )

    def add_face_embedding(self, student_id: int, embedding: list[float]) -> None:
        """
        Add one student face embedding to the FAISS 128D index.

        Args:
            student_id: Student identifier linked to the embedding.
            embedding: 128-dimensional face embedding values.
        """
        self._ensure_initialized()
        embedding = normalize_embedding(embedding)
        if len(embedding) != 128:
            logger.warning(
                "Rejected embedding for student %s: expected 128D, got %d",
                student_id,
                len(embedding),
            )
            return

        emb = np.array(embedding, dtype="float32")
        norm = np.linalg.norm(emb)
        if norm > 1e-6:
            emb = emb / norm
        if self.index is not None:
            self.index.add(emb.reshape(1, -1))
        self.names.append(student_id)
        self._save_faiss_index()

    def register_face(
        self,
        student_id: int,
        image_bytes: bytes,
    ) -> tuple[bool, str, list[float]]:
        """
        Register a student's face from one image.

        Args:
            student_id: Student identifier linked to the face.
            image_bytes: Raw enrollment image bytes.

        Returns:
            Tuple containing success status, message, and 128D embedding values.
        """
        self._ensure_initialized()
        if not image_bytes:
            return False, "Dữ liệu ảnh rỗng", []
        embeddings = self.extract_embeddings(image_bytes)
        if not embeddings:
            return False, "Khong tim thay khuon mat trong anh", []
        if len(embeddings) > 1:
            return False, "Anh co nhieu hon 1 khuon mat", []

        embedding = embeddings[0]
        if self.index is not None:
            self.index.add(embedding.reshape(1, -1))
        self.names.append(student_id)
        self._save_faiss_index()
        return True, "Dang ky khuon mat thanh cong", embedding.tolist()

    def recognize_faces(
        self,
        image_bytes: bytes,
        tolerance: float = DEFAULT_COSINE_THRESHOLD,
    ) -> list[int]:
        """
        Recognize student IDs from faces in one image via Cosine Similarity.

        Args:
            image_bytes: Raw image bytes to inspect.
            tolerance: Minimum Cosine similarity score accepted as a match.
                       Valid cosine thresholds in [0.0, 1.0] (specifically including [0.2, 0.9])
                       are strictly respected. Non-cosine values (> 1.0 or < 0.0) safely fall back to 0.363.

        Returns:
            List of recognized student identifiers.
        """
        self._ensure_initialized()
        if not image_bytes:
            return []
        if self.index is None or self.index.ntotal == 0:
            return []

        # Validate threshold: respect any valid cosine threshold in [0.0, 1.0] (including [0.2, 0.9])
        threshold = resolve_cosine_threshold(tolerance, DEFAULT_COSINE_THRESHOLD)

        embeddings = self.extract_embeddings(image_bytes)
        if not embeddings:
            return []

        recognized_ids: set[int] = set()
        for embedding in embeddings:
            distances, indices = self.index.search(embedding.reshape(1, -1), k=1)
            if len(indices[0]) == 0:
                continue

            idx = indices[0][0]
            similarity = distances[0][0]  # In IndexFlatIP, distance is Inner Product / Cosine
            if similarity >= threshold and 0 <= idx < len(self.names):
                recognized_ids.add(self.names[idx])

        return list(recognized_ids)

    def detect_and_recognize_faces(
        self,
        image: bytes | np.ndarray,
        threshold: float = DEFAULT_COSINE_THRESHOLD,
    ) -> list[dict[str, Any]]:
        """
        Detect all faces and recognize student identities with bounding boxes.

        Primary API for Milestone M3 WebRTC multi-face visualization.
        Accepts either raw image bytes or an OpenCV BGR numpy array directly.

        Returns:
            List of dicts: [
                {
                    "bbox": [x, y, w, h],
                    "bbox_normalized": [norm_x, norm_y, norm_w, norm_h],
                    "student_id": str | None,
                    "student_name": str | None,
                    "score": float,
                    "detection_score": float,
                    "recognized": bool,
                }
            ]
        """
        self._ensure_initialized()
        if image is None:
            return []
        try:
            target_threshold = resolve_cosine_threshold(threshold, DEFAULT_COSINE_THRESHOLD)
            if isinstance(image, np.ndarray):
                img = image
            elif isinstance(image, (bytes, bytearray)):
                if not image:
                    return []
                np_arr = np.frombuffer(image, np.uint8)
                img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            else:
                return []

            if img is None or img.size == 0 or img.shape[0] < 10 or img.shape[1] < 10:
                return []

            frame_h, frame_w = img.shape[:2]

            detected = self.detect_faces(img, score_threshold=0.5)
            if not detected:
                return []

            results: list[dict[str, Any]] = []
            for x, y, w, h, det_score, orig_face in detected:
                feat = self.extract_embedding(img, orig_face)

                student_id = None
                student_name = None
                similarity = 0.0
                matched = False

                if self.index is not None and self.index.ntotal > 0:
                    sims, indices = self.index.search(feat.reshape(1, -1), k=1)
                    if len(indices[0]) > 0 and indices[0][0] >= 0:
                        idx = indices[0][0]
                        sim = float(sims[0][0])
                        similarity = sim
                        if sim >= target_threshold and 0 <= idx < len(self.names):
                            student_id = self.names[idx]
                            matched = True
                            if student_id in self.student_info:
                                student_name = self.student_info[student_id].get("name")
                            else:
                                # Lazy DB lookup if student was enrolled post-startup
                                try:
                                    from app.core.db import engine
                                    with Session(engine) as session:
                                        s = session.get(Student, student_id)
                                        if s:
                                            self.student_info[student_id] = {
                                                "name": f"{s.last_name or ''} {s.first_name or ''}".strip(),
                                                "email": s.google_email or "",
                                            }
                                            student_name = self.student_info[student_id]["name"]
                                except Exception:
                                    pass

                norm_x = round(float(x) / frame_w, 4) if frame_w > 0 else 0.0
                norm_y = round(float(y) / frame_h, 4) if frame_h > 0 else 0.0
                norm_w = round(float(w) / frame_w, 4) if frame_w > 0 else 0.0
                norm_h = round(float(h) / frame_h, 4) if frame_h > 0 else 0.0

                results.append({
                    "bbox": [int(x), int(y), int(w), int(h)],
                    "bbox_normalized": [norm_x, norm_y, norm_w, norm_h],
                    "student_id": str(student_id) if student_id is not None else None,
                    "student_name": student_name,
                    "score": round(similarity, 4),
                    "detection_score": round(det_score, 4),
                    "recognized": matched,
                })
            return results
        except Exception:
            logger.exception("Error in detect_and_recognize_faces")
            return []

    def list_face_images(
        self,
        *,
        session: Session,
        review_status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Any:
        """List face image registration requests for administrators."""
        from sqlmodel import func, select

        statement = select(FaceImage)
        if review_status:
            statement = statement.where(FaceImage.review_status == review_status)

        count_statement = select(func.count()).select_from(statement.subquery())
        total = session.exec(count_statement).one()

        statement = statement.offset(skip).limit(limit)
        results = session.exec(statement).all()

        return FaceImagesPublic(data=results, count=total)

    async def register_student_face_db(
        self,
        *,
        session: Session,
        student_id: int,
        content: bytes,
        image_type: str = "chinh_dien",
    ) -> Any:
        """Register a student's face from one image, save it to storage, and write to database."""
        student = session.get(Student, student_id)
        if not student:
            raise StudentNotFoundError("Khong tim thay sinh vien")

        success, message, quality_score, embedding = self.assess_face_image(
            image_bytes=content,
            min_quality=0.5,
        )
        if not success:
            raise FaceQualityUnacceptableError(message)

        import re
        import unicodedata

        combined = f"{student.last_name or ''}_{student.first_name or ''}"
        nfkd_form = unicodedata.normalize("NFKD", combined)
        only_ascii = nfkd_form.encode("ASCII", "ignore").decode("utf-8")
        full_name_ascii = re.sub(r"[^a-zA-Z0-9_]", "", only_ascii.replace(" ", "_"))

        filename = f"sv{student.student_id}_{image_type}_{full_name_ascii}.jpg"

        from app.storage.storage_factory import get_storage_service

        storage_service = get_storage_service()
        metadata = storage_service.save_image(
            file_bytes=content, filename=filename, folder="online_attendance/dataset"
        )

        existing = session.exec(
            select(FaceImage)
            .where(FaceImage.student_id == student.student_id)
            .where(FaceImage.image_type == image_type)
        ).first()

        if existing:
            try:
                storage_service.delete_image(
                    public_id=existing.public_id, local_path=existing.image_path
                )
            except Exception as e:
                logger.error(f"Failed to delete existing portrait image: {e}")

            existing.image_path = metadata.get("image_path")
            existing.storage_provider = metadata.get("storage_provider")
            existing.public_id = metadata.get("public_id")
            existing.secure_url = metadata.get("secure_url")
            existing.version = metadata.get("version")
            existing.file_size = metadata.get("file_size")
            existing.mime_type = metadata.get("mime_type")
            existing.width = metadata.get("width")
            existing.height = metadata.get("height")
            existing.embedding_vector = embedding
            existing.quality_score = quality_score
            existing.review_status = "DA_DUYET"
            existing.reviewed_at = datetime.now(UTC)
            session.add(existing)
            image_record = existing
        else:
            image_record = FaceImage(
                student_id=student.student_id,
                image_path=metadata.get("image_path"),
                image_type=image_type,
                embedding_vector=embedding,
                quality_score=quality_score,
                review_status="DA_DUYET",
                reviewed_at=datetime.now(UTC),
                storage_provider=metadata.get("storage_provider"),
                public_id=metadata.get("public_id"),
                secure_url=metadata.get("secure_url"),
                version=metadata.get("version"),
                file_size=metadata.get("file_size"),
                mime_type=metadata.get("mime_type"),
                width=metadata.get("width"),
                height=metadata.get("height"),
            )
            session.add(image_record)

        session.commit()
        session.refresh(image_record)

        # Update FAISS 128D
        self.index = faiss.IndexFlatIP(128)
        self.names = []
        self._sync_faiss_index_from_database()

        return image_record

    def approve_face_image(
        self,
        *,
        session: Session,
        image_id: int,
        reviewer_id: int,
    ) -> Any:
        """Approve a pending face image and update FAISS cache."""
        image_record = session.get(FaceImage, image_id)
        if not image_record:
            raise FaceImageNotFoundError("Khong tim thay anh khuon mat")

        embedding = normalize_embedding(image_record.embedding_vector)
        if len(embedding) != 128:
            raise InvalidFaceEmbeddingError("Anh chua co embedding 128D hop le")

        image_record.review_status = "DA_DUYET"
        image_record.rejection_reason = None
        image_record.reviewer_id = reviewer_id
        image_record.reviewed_at = datetime.now(UTC)

        session.add(image_record)
        session.commit()
        session.refresh(image_record)

        self.add_face_embedding(image_record.student_id, embedding)
        return image_record

    def reject_face_image(
        self,
        *,
        session: Session,
        image_id: int,
        reviewer_id: int,
        reason: str | None,
    ) -> Any:
        """Reject a pending face image."""
        image_record = session.get(FaceImage, image_id)
        if not image_record:
            raise FaceImageNotFoundError("Khong tim thay anh khuon mat")

        image_record.review_status = "TU_CHOI"
        image_record.rejection_reason = reason
        image_record.reviewer_id = reviewer_id
        image_record.reviewed_at = datetime.now(UTC)

        session.add(image_record)
        session.commit()
        session.refresh(image_record)
        return image_record

    def save_attendance_evidence(
        self,
        *,
        session: Session,
        attendance_id: int,
        image_bytes: bytes,
        confidence: float,
    ) -> str:
        """Save attendance evidence image and create its database record."""
        import uuid

        from app.models import AttendanceImage
        from app.storage.storage_factory import get_storage_service

        storage_service = get_storage_service()
        evidence_name = f"dd_{attendance_id}_{uuid.uuid4().hex[:8]}.jpg"

        metadata = storage_service.save_image(
            file_bytes=image_bytes,
            filename=evidence_name,
            folder="online_attendance/evidence",
        )

        session.add(
            AttendanceImage(
                attendance_id=attendance_id,
                confidence=confidence,
                image_path=metadata.get("image_path"),
                storage_provider=metadata.get("storage_provider"),
                public_id=metadata.get("public_id"),
                secure_url=metadata.get("secure_url"),
                version=metadata.get("version"),
                file_size=metadata.get("file_size"),
                mime_type=metadata.get("mime_type"),
                width=metadata.get("width"),
                height=metadata.get("height"),
            )
        )
        session.commit()
        return metadata.get("secure_url") or metadata.get("image_path") or ""

    def auto_register_and_verify(
        self,
        *,
        session: Session,
        student_id: int,
        class_session_id: int | None,
        image_bytes: bytes,
        auto_register_confidence: float = 0.95,
    ) -> dict[str, Any]:
        """Auto-register a student's face and optionally record attendance."""
        from app.crud.attendance_crud import mark_attendance_by_lora

        try:
            success, message, quality_score, embedding = self.assess_face_image(
                image_bytes,
                min_quality=0.5,
            )
            if not success or len(embedding) != 128:
                return {
                    "verified": False,
                    "confidence": 0,
                    "message": f"Nhan dang that bai: {message}",
                }

            os.makedirs("dataset", exist_ok=True)
            filepath = os.path.join("dataset", f"sv{student_id}_auto.jpg")
            with open(filepath, "wb") as image_file:
                image_file.write(image_bytes)

            existing = session.exec(
                select(FaceImage)
                .where(FaceImage.student_id == student_id)
                .where(FaceImage.image_type == "DANG_KY")
            ).first()
            if existing:
                existing.image_path = filepath
                existing.embedding_vector = embedding
                existing.quality_score = quality_score
                existing.review_status = "DA_DUYET"
                session.add(existing)
            else:
                session.add(
                    FaceImage(
                        student_id=student_id,
                        image_path=filepath,
                        image_type="DANG_KY",
                        embedding_vector=embedding,
                        quality_score=quality_score,
                        review_status="DA_DUYET",
                    )
                )
            session.commit()

            self.add_face_embedding(student_id, embedding)
            logger.info("Auto-registered face for student %s (128D)", student_id)

            if class_session_id:
                result = mark_attendance_by_lora(
                    session=session,
                    class_session_id=class_session_id,
                    student_ids=[student_id],
                    average_confidence=auto_register_confidence,
                )
                status_map = {
                    "CO_MAT": "Co mat",
                    "DI_MUON": "Di muon",
                    "VANG": "Vang",
                }
                status_text = status_map.get(result.get("status"), "Co mat")
                return {
                    "verified": True,
                    "confidence": auto_register_confidence * 100,
                    "message": (
                        f"Da tu dong dang ky khuon mat va diem danh thanh cong ({status_text})"
                    ),
                }

            return {
                "verified": True,
                "confidence": auto_register_confidence * 100,
                "message": "Da tu dong dang ky khuon mat moi thanh cong",
            }
        except Exception:
            logger.exception("Auto-registration during verification failed")
            return {
                "verified": False,
                "confidence": 0,
                "message": "Loi trong qua trinh tu dong nhan dien",
            }


# Shared singleton instance
face_service: FaceRecognitionService = FaceRecognitionService()


def get_or_create_face_service() -> FaceRecognitionService:
    """Return the process-local FaceRecognitionService singleton."""
    global face_service
    if face_service is None or not getattr(face_service, "initialized", False):
        face_service = FaceRecognitionService()
        face_service._ensure_initialized()
    return face_service


def get_face_service(request: Request) -> FaceRecognitionService:
    """Dependency provider that prefers the FastAPI app state cache."""
    service = getattr(request.app.state, "face_service", None)
    if service is None:
        service = get_or_create_face_service()
        request.app.state.face_service = service
    return service
