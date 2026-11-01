"""Require repeated recognition in consecutive sampled frames."""
class RecognitionStability:
    def __init__(self, required_frames: int = 3):
        if required_frames < 1:
            raise ValueError("required_frames must be positive")
        self.required_frames = required_frames
        self.counts = {}

    def observe(self, student_ids):
        current = set(student_ids)
        self.counts = {sid: self.counts.get(sid, 0) + 1 for sid in current}
        return sorted(sid for sid, count in self.counts.items() if count >= self.required_frames)
