"""Require repeated recognition in consecutive sampled frames."""
from typing import Any, Iterable


class RecognitionStability:
    def __init__(self, required_frames: int = 3):
        if required_frames < 1:
            raise ValueError("required_frames must be positive")
        self.required_frames = required_frames
        self.counts: dict[Any, int] = {}

    def observe(self, student_ids: Iterable[Any]) -> list[Any]:
        """Update counts with current frame's recognized student IDs and return all stable IDs."""
        current = set(student_ids)
        self.counts = {sid: self.counts.get(sid, 0) + 1 for sid in current}
        return sorted(sid for sid, count in self.counts.items() if count >= self.required_frames)

    def update(self, student_id: Any | None) -> bool:
        """
        Single student update method conforming to debounce requirements.
        Resets if student_id is None/falsy; otherwise increments and returns if stable.
        """
        if not student_id:
            self.counts.clear()
            return False
        self.counts[student_id] = self.counts.get(student_id, 0) + 1
        return self.counts[student_id] >= self.required_frames

    def get_count(self, student_id: Any) -> int:
        """Return current consecutive frame count for a student."""
        return self.counts.get(student_id, 0)

    def reset(self) -> None:
        """Reset all stability tracking counts."""
        self.counts.clear()
