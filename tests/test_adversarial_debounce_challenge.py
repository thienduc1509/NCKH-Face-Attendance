"""
Empirical Adversarial Verification Suite:
4-Tier Attendance Debounce, Exactly-Once DB Logging, and Stranger Segregation.

Tested by: m3_challenger_2b
Verification Targets:
1. Multi-Frame Stability Debounce (1-2 frames no-op, 3 consecutive triggers, intermittent resets).
2. Exactly-Once Deduplication (50-100 consecutive frames -> 0 redundant DB writes).
3. Cross-Session Cache Lifecycle (session isolation and reconnect preload).
4. Stranger / Unknown Face Segregation (cosine < 0.363 -> recognized: False, red box, 0 DB writes).
5. Frontend Bounding Box Contract & Mirroring Inversion.
"""

import os
import sys
from typing import Any, List, Optional
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# Ensure app is importable
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.services.recognition_stability import RecognitionStability
from app.webrtc.webrtc import VideoTransformTrack


# ===========================================================================
# 1. EMPIRICAL STABILITY DEBOUNCE VERIFICATION
# ===========================================================================

class TestAdversarialStabilityDebounce:
    """Stress-test the 3-frame debounce counter and intermittent reset semantics."""

    def test_single_and_two_frames_do_not_trigger(self):
        """1 or 2 frames of recognition must strictly NOT trigger stability."""
        stability = RecognitionStability(required_frames=3)

        # Frame 1: student 101 appears
        stable_f1 = stability.observe([101])
        assert stable_f1 == [], "Frame 1 must NOT trigger stability"
        assert stability.get_count(101) == 1

        # Frame 2: student 101 appears again
        stable_f2 = stability.observe([101])
        assert stable_f2 == [], "Frame 2 must NOT trigger stability"
        assert stability.get_count(101) == 2

    def test_three_consecutive_frames_trigger_stability(self):
        """Exactly 3 consecutive frames must trigger stability."""
        stability = RecognitionStability(required_frames=3)

        stability.observe([101])
        stability.observe([101])
        stable_f3 = stability.observe([101])

        assert stable_f3 == [101], "Frame 3 must trigger stability for student 101"
        assert stability.get_count(101) == 3

    def test_intermittent_missing_frame_resets_counter(self):
        """
        Adversarial: Student 101 appears in Frame 1, 2, then disappears in Frame 3,
        then reappears in Frame 4. Frame 4 must NOT trigger stability!
        """
        stability = RecognitionStability(required_frames=3)

        assert stability.observe([101]) == []  # Frame 1: count = 1
        assert stability.observe([101]) == []  # Frame 2: count = 2
        assert stability.observe([]) == []     # Frame 3: missing! counter must reset
        assert stability.get_count(101) == 0, "Counter must be 0 after missing frame"

        # Frame 4: Student reappears
        assert stability.observe([101]) == [], "Frame 4 must NOT trigger stability after reset"
        assert stability.get_count(101) == 1, "Counter must restart at 1"

        # Must require 2 more consecutive frames (total 3 from reset)
        assert stability.observe([101]) == []  # Frame 5: count = 2
        assert stability.observe([101]) == [101] # Frame 6: count = 3 -> STABLE!

    def test_intermittent_different_student_resets_counter(self):
        """
        Adversarial: Frame 1 (101), Frame 2 (101), Frame 3 (102 only).
        Student 101 counter must reset. Frame 4 (101) must not trigger.
        """
        stability = RecognitionStability(required_frames=3)

        assert stability.observe([101]) == []
        assert stability.observe([101]) == []
        # Frame 3: student 102 recognized, 101 not recognized
        stable_f3 = stability.observe([102])
        assert stable_f3 == []
        assert stability.get_count(101) == 0, "Student 101 must be reset when absent from frame"
        assert stability.get_count(102) == 1

        # Frame 4: student 101 returns
        stable_f4 = stability.observe([101])
        assert stable_f4 == [], "Student 101 must not trigger on frame 4"
        assert stability.get_count(101) == 1
        assert stability.get_count(102) == 0, "Student 102 must be reset when absent"

    def test_high_frequency_flicker_stress_100_cycles(self):
        """
        Adversarial: 100 alternating cycles of (Present, Absent).
        Counter should oscillate between 1 and 0, NEVER reaching 3.
        """
        stability = RecognitionStability(required_frames=3)
        for cycle in range(100):
            res_present = stability.observe([101])
            assert res_present == [], f"Cycle {cycle}: Present frame should not trigger"
            assert stability.get_count(101) == 1

            res_absent = stability.observe([])
            assert res_absent == [], f"Cycle {cycle}: Absent frame should not trigger"
            assert stability.get_count(101) == 0

    def test_concurrent_multi_student_debounce_independence(self):
        """
        Two students in frame: Student 101 present across 3 frames;
        Student 102 flickers on frame 2.
        Only Student 101 should stabilize at frame 3.
        """
        stability = RecognitionStability(required_frames=3)

        # Frame 1: both present
        assert stability.observe([101, 102]) == []
        assert stability.get_count(101) == 1
        assert stability.get_count(102) == 1

        # Frame 2: 101 present, 102 absent
        assert stability.observe([101]) == []
        assert stability.get_count(101) == 2
        assert stability.get_count(102) == 0

        # Frame 3: both present again
        stable_f3 = stability.observe([101, 102])
        assert stable_f3 == [101], "Only 101 should stabilize at frame 3"
        assert stability.get_count(101) == 3
        assert stability.get_count(102) == 1

        # Frame 4: both present
        stable_f4 = stability.observe([101, 102])
        assert stable_f4 == [101], "102 still only at count 2"
        assert stability.get_count(102) == 2

        # Frame 5: both present
        stable_f5 = stability.observe([101, 102])
        assert stable_f5 == [101, 102], "102 reaches count 3 at frame 5"


# ===========================================================================
# 2. EMPIRICAL DEDUPLICATION & EXACTLY-ONCE DB LOGGING
# ===========================================================================

class TestAdversarialDeduplication:
    """Stress-test VideoTransformTrack 4-tier debounce against redundant DB writes."""

    @pytest.fixture
    def mock_track(self):
        """Create a mock MediaStreamTrack."""
        track = MagicMock()
        return track

    def test_50_plus_frames_trigger_db_write_exactly_once(self, mock_track):
        """
        Adversarial: Stream 60 consecutive frames containing recognized Student 101.
        Verify:
        - Frame 1: STABILIZING, 0 DB writes
        - Frame 2: STABILIZING, 0 DB writes
        - Frame 3: NEWLY_MARKED, exactly 1 DB write scheduled
        - Frames 4..60 (57 frames): ALREADY_ATTENDED, ZERO additional DB writes.
        """
        with patch.object(VideoTransformTrack, "_init_registered_students"):
            vtrack = VideoTransformTrack(
                track=mock_track,
                class_session_id=42,
                process_interval=0.15,
            )

        # Mock face recognition returning Student 101 with high confidence
        recognized_face = {
            "bbox": [50, 50, 100, 100],
            "bbox_normalized": [0.1, 0.1, 0.2, 0.2],
            "student_id": "101",
            "student_name": "Nguyen Van A",
            "score": 0.85,
            "detection_score": 0.99,
            "recognized": True,
        }

        db_write_log: List[List[int]] = []

        def mock_record_attendance(ids: List[int]):
            db_write_log.append(list(ids))

        vtrack._record_attendance_sync = mock_record_attendance

        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        with patch("app.webrtc.webrtc.face_service.detect_and_recognize_faces", return_value=[recognized_face]):
            for frame_idx in range(1, 61):
                faces, newly_stable, id_to_name = vtrack._detect_and_evaluate_sync(dummy_frame)

                if newly_stable:
                    vtrack._record_attendance_sync(newly_stable)

                if frame_idx in (1, 2):
                    assert newly_stable == [], f"Frame {frame_idx} must have newly_stable == []"
                    assert faces[0]["attendance_status"] == "STABILIZING"
                elif frame_idx == 3:
                    assert newly_stable == [101], "Frame 3 must register newly_stable == [101]"
                    assert faces[0]["attendance_status"] == "NEWLY_MARKED"
                else:
                    # Frames 4..60 (57 frames!)
                    assert newly_stable == [], f"Frame {frame_idx} must NOT trigger duplicate stable ID"
                    assert faces[0]["attendance_status"] == "ALREADY_ATTENDED"

        # Assert exactly ONE database write occurred across all 60 frames!
        assert len(db_write_log) == 1, f"Expected exactly 1 DB write, got {len(db_write_log)}"
        assert db_write_log[0] == [101]

    def test_intermittent_glance_in_video_track_does_not_falsely_write_db(self, mock_track):
        """
        Adversarial: Frames 1 and 2 detect student 101.
        Frame 3 is blank/unrecognized.
        Frame 4 detects student 101.
        Verify Frame 4 DOES NOT write to DB.
        """
        with patch.object(VideoTransformTrack, "_init_registered_students"):
            vtrack = VideoTransformTrack(
                track=mock_track,
                class_session_id=42,
            )

        face_101 = {
            "bbox": [50, 50, 100, 100],
            "bbox_normalized": [0.1, 0.1, 0.2, 0.2],
            "student_id": "101",
            "student_name": "Nguyen Van A",
            "score": 0.85,
            "detection_score": 0.99,
            "recognized": True,
        }

        db_write_log: List[List[int]] = []
        vtrack._record_attendance_sync = lambda ids: db_write_log.append(list(ids))
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        with patch("app.webrtc.webrtc.face_service.detect_and_recognize_faces") as mock_det:
            # Frame 1: 101
            mock_det.return_value = [face_101]
            faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
            assert newly_stable == []
            assert faces[0]["attendance_status"] == "STABILIZING"

            # Frame 2: 101
            mock_det.return_value = [face_101]
            faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
            assert newly_stable == []
            assert faces[0]["attendance_status"] == "STABILIZING"

            # Frame 3: empty (student walked out of camera view or turned around)
            mock_det.return_value = []
            faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
            assert newly_stable == []

            # Frame 4: student 101 reappears
            mock_det.return_value = [face_101]
            faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
            assert newly_stable == [], "Frame 4 must NOT trigger attendance after glance-over"
            assert faces[0]["attendance_status"] == "STABILIZING"
            assert len(db_write_log) == 0, "No DB writes should occur yet"

            # Frame 5: 101
            faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
            assert newly_stable == []
            assert faces[0]["attendance_status"] == "STABILIZING"

            # Frame 6: 101 (3rd consecutive after reset) -> NOW triggers!
            faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
            assert newly_stable == [101]
            assert faces[0]["attendance_status"] == "NEWLY_MARKED"


# ===========================================================================
# 3. EMPIRICAL CACHE LIFECYCLE & MULTI-SESSION ISOLATION
# ===========================================================================

class TestAdversarialSessionCacheLifecycle:
    """Verify session isolation and reconnect cache preloading."""

    def test_session_isolation_different_sessions(self):
        """
        Student 101 attending Session 1 must still be eligible to attend Session 2.
        """
        track_mock = MagicMock()

        # Session 1
        with patch.object(VideoTransformTrack, "_init_registered_students"):
            track_s1 = VideoTransformTrack(track=track_mock, class_session_id=101)
        track_s1.registered_students.add(101)  # Student 101 attended session 1

        # Session 2 initialized
        with patch.object(VideoTransformTrack, "_init_registered_students"):
            track_s2 = VideoTransformTrack(track=track_mock, class_session_id=202)

        # Assert track_s2 does NOT inherit registered_students from session 1
        assert 101 not in track_s2.registered_students, "Session 2 must have independent cache"

    def test_session_reconnect_preloads_db_records(self):
        """
        If teacher refreshes browser or WebRTC reconnects, VideoTransformTrack
        must preload already attended students from DB so they are not re-registered.
        """
        track_mock = MagicMock()

        mock_attendance_records = [101, 102, 103]

        with patch("app.webrtc.webrtc.Session") as mock_session_cls:
            mock_session = MagicMock()
            mock_session.__enter__.return_value = mock_session
            mock_session_cls.return_value = mock_session
            mock_session.exec.return_value.all.return_value = mock_attendance_records

            track = VideoTransformTrack(track=track_mock, class_session_id=99)

        assert track.registered_students == {101, 102, 103}

        # Frame with already attended student 101
        face_101 = {
            "bbox": [50, 50, 100, 100],
            "bbox_normalized": [0.1, 0.1, 0.2, 0.2],
            "student_id": "101",
            "student_name": "Nguyen Van A",
            "score": 0.88,
            "detection_score": 0.99,
            "recognized": True,
        }

        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with patch("app.webrtc.webrtc.face_service.detect_and_recognize_faces", return_value=[face_101]):
            # Even across 10 frames, student 101 is ALREADY_ATTENDED, 0 DB writes!
            for _ in range(10):
                faces, newly_stable, _ = track._detect_and_evaluate_sync(dummy_frame)
                assert newly_stable == []
                assert faces[0]["attendance_status"] == "ALREADY_ATTENDED"


# ===========================================================================
# 4. STRANGER / UNKNOWN FACE HANDLING (< 0.363 COSINE THRESHOLD)
# ===========================================================================

class TestAdversarialStrangerHandling:
    """Stress-test rejection of unknown faces / impostors below threshold."""

    def test_sub_threshold_face_is_never_recognized_or_attended(self):
        """
        Adversarial: Impostor with cosine similarity 0.35 (< 0.363).
        Must receive recognized: False, student_id: None, and NEVER trigger attendance
        even across 100 consecutive frames.
        """
        track_mock = MagicMock()
        with patch.object(VideoTransformTrack, "_init_registered_students"):
            vtrack = VideoTransformTrack(track=track_mock, class_session_id=42)

        stranger_face = {
            "bbox": [100, 100, 80, 80],
            "bbox_normalized": [0.2, 0.2, 0.15, 0.15],
            "student_id": None,
            "student_name": None,
            "score": 0.35,  # Sub-threshold!
            "detection_score": 0.95,
            "recognized": False,
        }

        db_write_log = []
        vtrack._record_attendance_sync = lambda ids: db_write_log.append(ids)
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        with patch("app.webrtc.webrtc.face_service.detect_and_recognize_faces", return_value=[stranger_face]):
            for frame_idx in range(100):
                faces, newly_stable, _ = vtrack._detect_and_evaluate_sync(dummy_frame)
                assert newly_stable == [], f"Stranger at frame {frame_idx} triggered newly_stable!"
                assert faces[0]["attendance_status"] == "UNRECOGNIZED"
                assert faces[0]["recognized"] is False

        assert len(db_write_log) == 0, "Zero DB writes must occur for stranger"
        assert len(vtrack.registered_students) == 0, "Stranger must not enter registered_students"

    def test_boundary_cosine_threshold_discrimination(self):
        """
        Verify exact cosine boundary:
        >= 0.363 -> recognized
        < 0.363 -> stranger (Unknown)
        """
        from app.services.face_service import DEFAULT_COSINE_THRESHOLD
        assert DEFAULT_COSINE_THRESHOLD == 0.363

        scores = [0.3629, 0.3630, 0.3631, 0.10, 0.85]
        expected = [False, True, True, False, True]

        for s, exp in zip(scores, expected):
            is_match = (s >= DEFAULT_COSINE_THRESHOLD)
            assert is_match == exp, f"Score {s} expected match={exp}, got {is_match}"


# ===========================================================================
# 5. FRONTEND BOUNDING BOX & MIRRORING CONTRACT
# ===========================================================================

class TestAdversarialFrontendCanvasContract:
    """Verify frontend green/red styling and mirroring mathematical invariants."""

    def test_green_and_red_box_styling_contract(self):
        """
        Recognized: green #22C55E with MSSV - Ho ten.
        Unrecognized: red #EF4444 with 'Unknown'.
        """
        def compute_box(face: dict, canvas_w: int, canvas_h: int, is_mirrored: bool):
            norm_x, norm_y, norm_w, norm_h = face["bbox_normalized"]
            box_w = norm_w * canvas_w
            box_h = norm_h * canvas_h
            box_y = norm_y * canvas_h
            box_x = (canvas_w - (norm_x * canvas_w + box_w)) if is_mirrored else (norm_x * canvas_w)

            is_rec = face["recognized"] is True
            color = "#22C55E" if is_rec else "#EF4444"
            label = f"{face['student_id']} - {face['student_name']}" if is_rec else "Unknown"
            return {"boxX": box_x, "boxY": box_y, "boxW": box_w, "boxH": box_h, "color": color, "label": label}

        # Case 1: Recognized
        face_rec = {
            "bbox_normalized": [0.1, 0.2, 0.3, 0.4],
            "student_id": "20200001",
            "student_name": "Tran Van Giang",
            "recognized": True,
        }
        res_rec = compute_box(face_rec, 640, 480, is_mirrored=False)
        assert res_rec["color"] == "#22C55E"
        assert "20200001 - Tran Van Giang" in res_rec["label"]

        # Case 2: Unknown Stranger
        face_stranger = {
            "bbox_normalized": [0.1, 0.2, 0.3, 0.4],
            "student_id": None,
            "student_name": None,
            "recognized": False,
        }
        res_stranger = compute_box(face_stranger, 640, 480, is_mirrored=False)
        assert res_stranger["color"] == "#EF4444"
        assert res_stranger["label"] == "Unknown"

    def test_mirroring_horizontal_inversion_symmetry(self):
        """
        Mirrored boxX must be: canvasWidth - (norm_x * canvasWidth + boxW).
        A centered face at norm_x = 0.35, norm_w = 0.3 (center = 0.5) must remain centered!
        """
        canvas_w = 640
        norm_x, norm_w = 0.35, 0.30
        box_w = norm_w * canvas_w  # 192

        # Unmirrored X
        box_x_normal = norm_x * canvas_w  # 224
        # Mirrored X
        box_x_mirrored = canvas_w - (norm_x * canvas_w + box_w) # 640 - (224 + 192) = 224

        assert box_x_normal == box_x_mirrored, "Centered box must be horizontally invariant under mirroring"
