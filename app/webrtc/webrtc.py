import asyncio
import io
import time

from aiortc import MediaStreamTrack
from PIL import Image
from sqlmodel import Session

# To call db we need session
from app.core.db import engine
from app.crud.attendance_crud import mark_attendance_by_lora
from app.services.face_service import face_service
from app.utils.logger import logger
from app.services.recognition_stability import RecognitionStability


class VideoTransformTrack(MediaStreamTrack):
    """
    A video stream track that transforms frames from another track and runs AI periodically.
    """

    kind = "video"

    def __init__(self, track, class_session_id: int = None):
        super().__init__()
        self.track = track
        self.class_session_id = class_session_id
        self.last_process_time = time.time()
        self.stability = RecognitionStability(required_frames=3)
        self.processing = False
        self.process_interval = 3.0  # Xử lý 3 giây 1 lần

    def _process_frame_sync(self, frame) -> None:
        """Process video frame and register attendance synchronously in a worker thread."""
        try:
            # Chuyển frame thành ảnh
            img = frame.to_ndarray(format="rgb24")
            pil_img = Image.fromarray(img)
            img_byte_arr = io.BytesIO()
            pil_img.save(img_byte_arr, format="JPEG")
            image_bytes = img_byte_arr.getvalue()

            # Chạy nhận diện
            recognized_ids = face_service.recognize_faces(image_bytes)

            stable_ids = self.stability.observe(recognized_ids)
            if stable_ids:
                with Session(engine) as session:
                    result = mark_attendance_by_lora(
                        session=session, class_session_id=self.class_session_id,
                        student_ids=stable_ids, average_confidence=None,
                    )
                    logger.info("WebRTC stable recognition attendance: %s", result)
        except Exception as e:
            logger.error(f"Error processing frame in background thread: {e}")

    async def _process_frame(self, frame):
        try:
            await asyncio.to_thread(self._process_frame_sync, frame)
        finally:
            self.processing = False

    async def recv(self):
        frame = await self.track.recv()

        current_time = time.time()
        if self.class_session_id and not self.processing and (
            current_time - self.last_process_time > self.process_interval
        ):
            self.last_process_time = current_time
            # Run CPU-bound AI processing in a separate thread pool to prevent async loop blocking
            self.processing = True
            asyncio.create_task(self._process_frame(frame))

        return frame
