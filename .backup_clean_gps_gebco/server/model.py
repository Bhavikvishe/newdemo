"""YOLO model wrapper for OCEONIX.

The React app POSTs a raw image to /api/detect and your detection code runs
here. Expected return value: a dictionary containing predictions and optional debug telemetry:

    {
        "predictions": [
            {
                "class_id": int,
                "label": str,
                "confidence": float,
                "bbox": { "x", "y", "width", "height" },
                "raw_bbox": { "x1", "y1", "x2", "y2" }
            }, ...
        ],
        "debug": { ... }
    }

bbox is NORMALIZED to 0..1 (relative to image width/height) because the
website draws the box directly over the ORIGINAL image with CSS. Do NOT
return a segmented / masked / annotated image.
"""

import io
import os
import time
from pathlib import Path
from PIL import Image, ImageOps

SERVER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SERVER_DIR.parent

DEFAULT_WEIGHTS = os.environ.get("OCEONIX_WEIGHTS", "")
DEFAULT_CONFIDENCE = float(os.environ.get("OCEONIX_CONFIDENCE", "0.25"))
DEFAULT_IOU = float(os.environ.get("OCEONIX_IOU", "0.70"))
DEFAULT_IMAGE_SIZE = int(os.environ.get("OCEONIX_IMAGE_SIZE", "640"))
DEBUG_DETECTION = os.environ.get("OCEONIX_DEBUG_DETECTION", "false").lower() in ("true", "1", "yes")

_model = None
_weights_path: Path | None = None


def _find_weights() -> Path:
    if DEFAULT_WEIGHTS:
        p = Path(DEFAULT_WEIGHTS)
        if p.exists():
            return p
    for candidate in (PROJECT_ROOT / "best.pt", SERVER_DIR / "best.pt"):
        if candidate.exists():
            return candidate
    return PROJECT_ROOT / "best.pt"


def weights_path() -> str:
    global _weights_path
    if _weights_path is not None:
        return str(_weights_path)
    try:
        _load_model()
    except RuntimeError:
        return str(_find_weights())
    return str(_weights_path)


def _load_model():
    global _model, _weights_path
    if _model is not None:
        return _model
    weights = _find_weights()
    if not weights.exists():
        raise RuntimeError(
            f"Trained weights not found at {weights}. "
            f"Expected at {PROJECT_ROOT / 'best.pt'} or {SERVER_DIR / 'best.pt'}. "
            "Set OCEONIX_WEIGHTS to the absolute path of your .pt file."
        )
    from ultralytics import YOLO

    _weights_path = weights.resolve()
    _model = YOLO(str(_weights_path))
    return _model


def get_model_info() -> dict:
    model = _load_model()
    names = getattr(model, "names", {})
    if isinstance(names, dict):
        class_map = {int(k): str(v) for k, v in names.items()}
    elif isinstance(names, (list, tuple)):
        class_map = {i: str(n) for i, n in enumerate(names)}
    else:
        class_map = {}
    return {
        "weights_path": str(_weights_path),
        "task": getattr(model, "task", "detect"),
        "classes": class_map,
        "default_conf": DEFAULT_CONFIDENCE,
        "default_iou": DEFAULT_IOU,
        "default_imgsz": DEFAULT_IMAGE_SIZE,
        "debug": DEBUG_DETECTION,
    }


def detect(
    image_bytes: bytes,
    conf: float | None = None,
    iou: float | None = None,
    imgsz: int | None = None,
    include_debug: bool | None = None,
) -> dict:
    """Run trained YOLO model on raw image bytes.

    Args:
        image_bytes: Raw bytes of the uploaded image file.
        conf: Optional confidence threshold (overrides default).
        iou: Optional IoU threshold for NMS.
        imgsz: Optional inference size (e.g. 640).
        include_debug: If True, include debug telemetry in response.

    Returns:
        dict: {"predictions": [...], "debug": {...} (optional)}
    """
    start_t = time.perf_counter()
    model = _load_model()

    conf_thresh = conf if conf is not None else DEFAULT_CONFIDENCE
    iou_thresh = iou if iou is not None else DEFAULT_IOU
    img_size = imgsz if imgsz is not None else DEFAULT_IMAGE_SIZE
    debug_mode = include_debug if include_debug is not None else DEBUG_DETECTION

    # Preprocessing:
    # 1. Open with PIL
    # 2. Apply exif_transpose to correct any orientation metadata
    # 3. Convert to RGB (standard 3-channel format expected by Ultralytics)
    raw_pil = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(raw_pil).convert("RGB")
    orig_w, orig_h = img.size

    # Ultralytics inference with explicit parameters:
    # - conf: Confidence threshold
    # - iou: IoU threshold for NMS
    # - imgsz: Inference resolution
    # - augment: Disabled for faithful evaluation
    # - agnostic_nms: Class-agnostic NMS
    results = model.predict(
        source=img,
        conf=conf_thresh,
        iou=iou_thresh,
        imgsz=img_size,
        augment=False,
        agnostic_nms=False,
        verbose=False,
    )

    r = results[0]
    out = []
    for box in r.boxes:
        c = float(box.conf[0])
        cls_id = int(box.cls[0])
        label = r.names.get(cls_id, str(cls_id)) if hasattr(r, "names") else str(cls_id)
        x1, y1, x2, y2 = box.xyxy[0].tolist()

        out.append(
            {
                "class_id": cls_id,
                "label": label,
                "confidence": round(c, 4),
                "bbox": {
                    "x": round(x1 / orig_w, 4),
                    "y": round(y1 / orig_h, 4),
                    "width": round((x2 - x1) / orig_w, 4),
                    "height": round((y2 - y1) / orig_h, 4),
                },
                "raw_bbox": {
                    "x1": round(x1, 1),
                    "y1": round(y1, 1),
                    "x2": round(x2, 1),
                    "y2": round(y2, 1),
                },
            }
        )

    out.sort(key=lambda p: p["confidence"], reverse=True)
    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)

    response = {"predictions": out}
    if debug_mode:
        response["debug"] = {
            "model_path": str(_weights_path),
            "classes": {int(k): str(v) for k, v in getattr(model, "names", {}).items()},
            "input_shape": [orig_w, orig_h],
            "imgsz": img_size,
            "conf": conf_thresh,
            "iou": iou_thresh,
            "raw_detections": len(r.boxes),
            "post_detections": len(out),
            "inference_time_ms": elapsed_ms,
        }
    return response