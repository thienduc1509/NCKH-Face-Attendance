import asyncio
import json
import time
from typing import Any

from aiortc import MediaStreamTrack
from sqlmodel import Session, select

from app.core.db import engine
from app.crud.attendance_crud import mark_attendance_by_lora
from app.models.attendance import Attendance
from app.services.face_service import face_service
from app.services.recognition_stability import RecognitionStability
from app.utils.logger import logger


class VideoTransformTrack(MediaStreamTrack):
    """
    A video stream track that transforms incoming video frames, runs YuNet + SFace
    multi-face detection in worker threads, streams bounding box payloads over
    WebRTC DataChannel, and debounces attendance records exactly once per session.
    """

    kind = "video"

    def __init__(
        self,
        track: MediaStreamTrack,
        class_session_id: int | None = None,
        data_channel: Any = None,
        process_interval: float = 0.15,  # ~6.7 FPS for smooth, low-latency bounding boxes
    ):
        super().__init__()
        self.track = track
        self.class_session_id = class_session_id
        self.data_channel = data_channel
        self.last_process_time = 0.0
        self.process_interval = process_interval
        self.processing = False
        self.stability = RecognitionStability(required_frames=3)
        self.registered_students: set[int] = set()
        self._init_registered_students()

    def set_data_channel(self, channel: Any) -> None:
        """Attach or update active WebRTC DataChannel."""
        self.data_channel = channel
        logger.info(
            "VideoTransformTrack: DataChannel attached (label=%s)",
            getattr(channel, "label", None),
        )

    def _init_registered_students(self) -> None:
        """Preload student IDs already marked present/late in this class session."""
        if not self.class_session_id:
            return
        try:
            with Session(engine) as session:
                records = session.exec(
                    select(Attendance.student_id).where(
                        Attendance.class_session_id == self.class_session_id,
                        Attendance.status.in_(["CO_MAT", "MUON"]),
                    )
                ).all()
                self.registered_students = set(records)
                logger.info(
                    "VideoTransformTrack: Session %s preloaded with %d marked students",
                    self.class_session_id,
                    len(self.registered_students),
                )
        except Exception as e:
            logger.warning(
                "Could not preload attendance for session %s: %s",
                self.class_session_id,
                e,
            )

    def _detect_and_evaluate_sync(
        self, img_bgr
    ) -> tuple[list[dict[str, Any]], list[int], dict[int, str]]:
        """Run YuNet + SFace inference and debounce logic in worker thread."""
        faces = face_service.detect_and_recognize_faces(img_bgr, threshold=0.363)
        recognized_int_ids: list[int] = []
        id_to_name: dict[int, str] = {}

        for f in faces:
            sid = f.get("student_id")
            if f.get("recognized") and sid is not None:
                try:
                    int_sid = int(sid)
                    recognized_int_ids.append(int_sid)
                    if f.get("student_name"):
                        id_to_name[int_sid] = f["student_name"]
                except (ValueError, TypeError):
                    pass

        newly_stable_ids: list[int] = []
        if self.class_session_id:
            stable_ids = self.stability.observe(recognized_int_ids)
            for sid in stable_ids:
                if sid not in self.registered_students:
                    newly_stable_ids.append(sid)
                    self.registered_students.add(sid)  # In-memory debounce guard
        else:
            self.stability.observe(recognized_int_ids)

        # Enrich face dicts with attendance_status
        for f in faces:
            if not f.get("recognized") or f.get("student_id") is None:
                f["attendance_status"] = "UNRECOGNIZED"
            else:
                try:
                    int_sid = int(f["student_id"])
                    if int_sid in newly_stable_ids:
                        f["attendance_status"] = "NEWLY_MARKED"
                    elif int_sid in self.registered_students:
                        f["attendance_status"] = "ALREADY_ATTENDED"
                    else:
                        f["attendance_status"] = "STABILIZING"
                except (ValueError, TypeError):
                    f["attendance_status"] = "UNRECOGNIZED"

        return faces, newly_stable_ids, id_to_name

    def _record_attendance_sync(self, student_ids: list[int]) -> None:
        """Execute database attendance write synchronously in worker thread."""
        try:
            with Session(engine) as session:
                result = mark_attendance_by_lora(
                    session=session,
                    class_session_id=self.class_session_id,
                    student_ids=student_ids,
                    average_confidence=None,
                )
                logger.info(
                    "WebRTC attendance recorded for session %s: students=%s result=%s",
                    self.class_session_id,
                    student_ids,
                    result,
                )
        except Exception as e:
            logger.error(
                "Error recording attendance for session %s: %s",
                self.class_session_id,
                e,
            )

    async def _process_frame_async(self, frame) -> None:
        """Asynchronous pipeline: convert frame, run AI in worker thread, broadcast DataChannel."""
        try:
            # Direct BGR conversion via PyAV C library (< 2ms)
            img_bgr = frame.to_ndarray(format="bgr24")

            # Execute AI detection and debounce in thread pool
            faces, newly_stable_ids, id_to_name = await asyncio.to_thread(
                self._detect_and_evaluate_sync, img_bgr
            )

            # Broadcast bounding boxes on WebRTC DataChannel (on main asyncio loop)
            if (
                self.data_channel is not None
                and getattr(self.data_channel, "readyState", None) == "open"
            ):
                payload_dict: dict[str, Any] = {
                    "type": "faces_detected",
                    "faces": faces,
                    "timestamp": time.time(),
                }
                if newly_stable_ids:
                    first_sid = newly_stable_ids[0]
                    payload_dict["attendance_confirmed"] = {
                        "student_id": str(first_sid),
                        "student_name": id_to_name.get(first_sid, "Sinh viên"),
                    }
                payload = json.dumps(payload_dict, ensure_ascii=False)
                self.data_channel.send(payload)

            # Record attendance for newly stable students in worker thread
            if newly_stable_ids and self.class_session_id:
                asyncio.create_task(
                    asyncio.to_thread(self._record_attendance_sync, newly_stable_ids)
                )

        except Exception as e:
            logger.error("Error processing video frame in WebRTC track: %s", e)
        finally:
            self.processing = False

    async def recv(self):
        """WebRTC frame receiver: returns immediately to guarantee smooth 30 FPS playback."""
        frame = await self.track.recv()

        current_time = time.time()
        if not self.processing and (
            current_time - self.last_process_time >= self.process_interval
        ):
            self.last_process_time = current_time
            self.processing = True
            asyncio.create_task(self._process_frame_async(frame))

        return frame
