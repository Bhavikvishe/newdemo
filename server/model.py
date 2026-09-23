"""YOLO model wrapper for OCEONIX.

The React app POSTs a raw image to /api/detect and your detection code runs
here. Expected return value: a list of predictions

    [ { "label": str, "confidence": float,
        "bbox": { "x", "y", "width", "height" } }, ... ]

bbox is NORMALIZED to 0..1 (relative to image width/height) because the
website draws the box directly over the ORIGINAL image with CSS. Do NOT
return a segmented / masked / annotated image.
"""

import os
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SERVER_DIR.parent

WEIGHTS = os.environ.get("OCEONIX_WEIGHTS", "")


def weights_path() -> str:
    if _weights_path is not None:
        return str(_weights_path)
    try:
        _load_model()
    except RuntimeError:
        return str(_find_weights())
    return str(_weights_path)


def _find_weights() -> Path:
    for candidate in (PROJECT_ROOT / "best.pt", SERVER_DIR / "best.pt"):
        if candidate.exists():
            return candidate
    return PROJECT_ROOT / "best.pt"


_model = None
_weights_path: Path | None = None


def _load_model():
    global _model, _weights_path
    if _model is not None:
        return _model
    weights = Path(WEIGHTS or _find_weights())
    if not weights.exists():
        raise RuntimeError(
            f"Trained weights not found at {weights}. "
            f"Expected at {PROJECT_ROOT / 'best.pt'} or {SERVER_DIR / 'best.pt'}. "
            "Set OCEONIX_WEIGHTS to the absolute path of your .pt file."
        )
    from ultralytics import YOLO  # lazily imported so the server can start without it

    _weights_path = weights.resolve()
    _model = YOLO(_weights_path)
    return _model


def detect(image_bytes: bytes) -> list[dict]:
    """Run your trained model on an image. THIS IS WHERE THE DETECTION HAPPENS."""
    import io

    from PIL import Image
    from ultralytics import YOLO

    model = _load_model()

    # ------------------------------------------------------------------
    # Runs Ultralytics YOLO on the uploaded frame and normalizes the boxes.
    # bbox values are 0..1 relative to the image, matching what the website
    # expects to draw its overlay on the ORIGINAL image.
    # ------------------------------------------------------------------
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    results = model(img)
    r = results[0]
    img_w, img_h = r.orig_shape[1], r.orig_shape[0]

    out = []
    for box in r.boxes:
        conf = float(box.conf[0])
        if conf < 0.35:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        out.append(
            {
                "label": r.names[int(box.cls[0])],
                "confidence": round(conf, 4),
                "bbox": {
                    "x": round(x1 / img_w, 4),
                    "y": round(y1 / img_h, 4),
                    "width": round((x2 - x1) / img_w, 4),
                    "height": round((y2 - y1) / img_h, 4),
                },
            }
        )
    out.sort(key=lambda p: p["confidence"], reverse=True)
    return out