"""CLI tool to download and verify OpenCV Zoo ONNX model weights."""

import sys
from pathlib import Path

# Add backend root to sys.path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.services.model_loader import ensure_models_available  # noqa: E402


def main() -> None:
    print("==================================================")
    print("NCKH-Face-Attendance: ONNX Models Downloader")
    print("==================================================")
    try:
        yunet_path, sface_path = ensure_models_available()
        print(f"[OK] YuNet model: {yunet_path} ({yunet_path.stat().st_size} bytes)")
        print(f"[OK] SFace model: {sface_path} ({sface_path.stat().st_size} bytes)")
        print("[SUCCESS] All model weights verified and ready.")
        sys.exit(0)
    except Exception as exc:
        print(f"[ERROR] Failed to download or verify models: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
