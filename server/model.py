"""YOLO model wrapper for ANVESHA.

The React app POSTs raw image bytes to /api/detect.

Detection pipeline:

    Raw image bytes
          ↓
    PIL original image
          ↓
    EXIF GPS extraction
          ↓
    OpenCV sonar preprocessing
          ↓
    YOLO inference
          ↓
    Detection results

GPS is ALWAYS extracted from the original image.

The original image is never modified for metadata extraction.
"""

from __future__ import annotations

import io
import os
import time
from pathlib import Path
from typing import Any

import cv2
from PIL import Image, ImageOps

try:
    from .image_preprocessing import preprocess_sonar_image
except ImportError:
    from image_preprocessing import preprocess_sonar_image


SERVER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SERVER_DIR.parent


DEFAULT_WEIGHTS = os.environ.get(
    "ANVESHA_WEIGHTS",
    "",
)

DEFAULT_CONFIDENCE = float(
    os.environ.get(
        "ANVESHA_CONFIDENCE",
        "0.25",
    )
)

DEFAULT_IOU = float(
    os.environ.get(
        "ANVESHA_IOU",
        "0.70",
    )
)

DEFAULT_IMAGE_SIZE = int(
    os.environ.get(
        "ANVESHA_IMAGE_SIZE",
        "640",
    )
)

DEBUG_DETECTION = (
    os.environ.get(
        "ANVESHA_DEBUG_DETECTION",
        "false",
    )
    .lower()
    in (
        "true",
        "1",
        "yes",
    )
)


_model = None
_weights_path: Path | None = None


def _find_weights() -> Path:
    if DEFAULT_WEIGHTS:
        p = Path(
            DEFAULT_WEIGHTS,
        )

        if p.exists():
            return p

    for candidate in (
        PROJECT_ROOT / "best.pt",
        SERVER_DIR / "best.pt",
    ):
        if candidate.exists():
            return candidate

    return PROJECT_ROOT / "best.pt"


def weights_path() -> str:
    global _weights_path

    if _weights_path is not None:
        return str(
            _weights_path,
        )

    try:
        _load_model()
    except RuntimeError:
        return str(
            _find_weights(),
        )

    return str(
        _weights_path,
    )


def _load_model():
    global _model
    global _weights_path

    if _model is not None:
        return _model

    weights = _find_weights()

    if not weights.exists():
        raise RuntimeError(
            f"Trained weights not found at {weights}. "
            f"Expected at {PROJECT_ROOT / 'best.pt'} "
            f"or {SERVER_DIR / 'best.pt'}. "
            "Set ANVESHA_WEIGHTS to the absolute path "
            "of your .pt file."
        )

    from ultralytics import YOLO

    _weights_path = weights.resolve()

    _model = YOLO(
        str(_weights_path),
    )

    return _model


def get_model_info() -> dict:
    model = _load_model()

    names = getattr(
        model,
        "names",
        {},
    )

    if isinstance(
        names,
        dict,
    ):
        class_map = {
            int(k): str(v)
            for k, v in names.items()
        }

    elif isinstance(
        names,
        (list, tuple),
    ):
        class_map = {
            i: str(n)
            for i, n in enumerate(names)
        }

    else:
        class_map = {}

    return {
        "weights_path": str(
            _weights_path,
        ),
        "task": getattr(
            model,
            "task",
            "detect",
        ),
        "classes": class_map,
        "default_conf":
            DEFAULT_CONFIDENCE,
        "default_iou":
            DEFAULT_IOU,
        "default_imgsz":
            DEFAULT_IMAGE_SIZE,
        "preprocessing": {
            "enabled": True,
            "method": (
                "LAB luminance denoising + CLAHE"
            ),
            "denoising": {
                "method":
                    "fastNlMeansDenoising",
                "h":
                    5,
                "template_window":
                    7,
                "search_window":
                    21,
            },
            "clahe": {
                "clip_limit":
                    2.0,
                "tile_grid_size": [
                    8,
                    8,
                ],
            },
        },
        "debug":
            DEBUG_DETECTION,
    }


def _rational_to_float(
    value: Any,
) -> float:
    """Convert EXIF rationals / tuples / numbers to float."""

    if isinstance(
        value,
        (int, float),
    ):
        return float(value)

    if hasattr(
        value,
        "numerator",
    ) and hasattr(
        value,
        "denominator",
    ):
        denominator = float(
            value.denominator,
        )

        if denominator == 0:
            raise ValueError(
                "Invalid EXIF rational denominator",
            )

        return float(
            value.numerator,
        ) / denominator

    if (
        isinstance(
            value,
            tuple,
        )
        and len(value) == 2
    ):
        numerator = _rational_to_float(
            value[0],
        )

        denominator = _rational_to_float(
            value[1],
        )

        if denominator == 0:
            raise ValueError(
                "Invalid EXIF rational denominator",
            )

        return numerator / denominator

    return float(value)


def _dms_to_decimal(
    dms: Any,
    ref: str | None,
) -> float | None:
    if not dms:
        return None

    try:
        if len(dms) != 3:
            return None

        degrees = _rational_to_float(
            dms[0],
        )

        minutes = _rational_to_float(
            dms[1],
        )

        seconds = _rational_to_float(
            dms[2],
        )

        decimal = (
            degrees
            + minutes / 60.0
            + seconds / 3600.0
        )

        if ref in (
            "S",
            "W",
        ):
            decimal = -decimal

        return decimal

    except Exception:
        return None


def _extract_gps(
    image: Image.Image,
) -> dict | None:
    """Extract GPS coordinates from original image EXIF."""

    try:
        exif = image.getexif()

        if not exif:
            return None

        gps_info = exif.get_ifd(
            34853,
        )

        if not gps_info:
            return None

        gps = {}

        for key, value in gps_info.items():
            gps[key] = value

        latitude = _dms_to_decimal(
            gps.get(2),
            gps.get(1),
        )

        longitude = _dms_to_decimal(
            gps.get(4),
            gps.get(3),
        )

        if (
            latitude is None
            or longitude is None
        ):
            return None

        if not (
            -90.0
            <= latitude
            <= 90.0
        ):
            return None

        if not (
            -180.0
            <= longitude
            <= 180.0
        ):
            return None

        return {
            "latitude":
                round(
                    latitude,
                    6,
                ),
            "longitude":
                round(
                    longitude,
                    6,
                ),
            "accuracy":
                None,
            "timestamp":
                time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ",
                    time.gmtime(),
                ),
            "source":
                "exif",
        }

    except Exception:
        return None


def _pil_to_bgr(
    image: Image.Image,
) -> Any:
    """Convert a PIL image to an OpenCV BGR ndarray."""

    rgb = image.convert(
        "RGB",
    )

    rgb_array = __import__(
        "numpy"
    ).array(
        rgb,
    )

    return cv2.cvtColor(
        rgb_array,
        cv2.COLOR_RGB2BGR,
    )


def _bgr_to_pil(
    image_bgr: Any,
) -> Image.Image:
    """Convert an OpenCV BGR ndarray back to PIL RGB."""

    rgb = cv2.cvtColor(
        image_bgr,
        cv2.COLOR_BGR2RGB,
    )

    return Image.fromarray(
        rgb,
    )


def detect(
    image_bytes: bytes,
    conf: float | None = None,
    iou: float | None = None,
    imgsz: int | None = None,
    include_debug: bool | None = None,
) -> dict:
    """
    Run the ANVESHA sonar detection pipeline.

    GPS is extracted from the original image before any preprocessing.

    YOLO receives the OpenCV-denoised and contrast-enhanced image.
    """

    start_t = time.perf_counter()

    model = _load_model()

    conf_thresh = (
        conf
        if conf is not None
        else DEFAULT_CONFIDENCE
    )

    iou_thresh = (
        iou
        if iou is not None
        else DEFAULT_IOU
    )

    img_size = (
        imgsz
        if imgsz is not None
        else DEFAULT_IMAGE_SIZE
    )

    debug_mode = (
        include_debug
        if include_debug is not None
        else DEBUG_DETECTION
    )

    # ---------------------------------------------------------------
    # 1. Read ORIGINAL image.
    #
    # GPS must be extracted BEFORE any transformation.
    # ---------------------------------------------------------------

    raw_pil = Image.open(
        io.BytesIO(
            image_bytes,
        ),
    )

    gps = _extract_gps(
        raw_pil,
    )

    # ---------------------------------------------------------------
    # 2. Correct image orientation.
    #
    # EXIF GPS has already been extracted from raw_pil.
    # ---------------------------------------------------------------

    oriented_pil = (
        ImageOps
        .exif_transpose(
            raw_pil,
        )
        .convert(
            "RGB",
        )
    )

    orig_w, orig_h = oriented_pil.size

    # ---------------------------------------------------------------
    # 3. Convert PIL → OpenCV BGR.
    # ---------------------------------------------------------------

    original_bgr = _pil_to_bgr(
        oriented_pil,
    )

    # ---------------------------------------------------------------
    # 4. OpenCV sonar preprocessing.
    #
    # Based on the reference sonar pipeline:
    #
    # BGR
    #  ↓
    # LAB
    #  ↓
    # L channel
    #  ↓
    # fastNlMeansDenoising
    #  ↓
    # CLAHE
    #  ↓
    # LAB
    #  ↓
    # BGR
    #
    # Image dimensions are preserved.
    # ---------------------------------------------------------------

    preprocessing_start = time.perf_counter()

    processed_bgr = preprocess_sonar_image(
        original_bgr,
    )

    preprocessing_time_ms = round(
        (
            time.perf_counter()
            - preprocessing_start
        )
        * 1000,
        2,
    )

    # ---------------------------------------------------------------
    # 5. Convert processed BGR → PIL RGB.
    #
    # Ultralytics can then receive the processed PIL image directly.
    # ---------------------------------------------------------------

    processed_pil = _bgr_to_pil(
        processed_bgr,
    )

    # ---------------------------------------------------------------
    # 6. YOLO inference.
    # ---------------------------------------------------------------

    inference_start = time.perf_counter()

    results = model.predict(
        source=processed_pil,
        conf=conf_thresh,
        iou=iou_thresh,
        imgsz=img_size,
        augment=False,
        agnostic_nms=False,
        verbose=False,
    )

    inference_time_ms = round(
        (
            time.perf_counter()
            - inference_start
        )
        * 1000,
        2,
    )

    r = results[0]

    out = []

    for box in r.boxes:
        c = float(
            box.conf[0],
        )

        cls_id = int(
            box.cls[0],
        )

        label = (
            r.names.get(
                cls_id,
                str(cls_id),
            )
            if hasattr(
                r,
                "names",
            )
            else str(cls_id)
        )

        x1, y1, x2, y2 = (
            box.xyxy[0]
            .tolist()
        )

        out.append(
            {
                "class_id":
                    cls_id,

                "label":
                    label,

                "confidence":
                    round(
                        c,
                        4,
                    ),

                "bbox": {
                    "x":
                        round(
                            x1 / orig_w,
                            4,
                        ),
                    "y":
                        round(
                            y1 / orig_h,
                            4,
                        ),
                    "width":
                        round(
                            (x2 - x1)
                            / orig_w,
                            4,
                        ),
                    "height":
                        round(
                            (y2 - y1)
                            / orig_h,
                            4,
                        ),
                },

                "raw_bbox": {
                    "x1":
                        round(
                            x1,
                            1,
                        ),
                    "y1":
                        round(
                            y1,
                            1,
                        ),
                    "x2":
                        round(
                            x2,
                            1,
                        ),
                    "y2":
                        round(
                            y2,
                            1,
                        ),
                },
            }
        )

    out.sort(
        key=lambda p:
        p["confidence"],
        reverse=True,
    )

    elapsed_ms = round(
        (
            time.perf_counter()
            - start_t
        )
        * 1000,
        2,
    )

    response = {
        "predictions":
            out,

        "gps":
            gps,
    }

    if debug_mode:
        response[
            "debug"
        ] = {
            "model_path":
                str(
                    _weights_path,
                ),

            "classes": {
                int(k): str(v)
                for k, v in
                getattr(
                    model,
                    "names",
                    {},
                ).items()
            },

            "input_shape": [
                orig_w,
                orig_h,
            ],

            "imgsz":
                img_size,

            "conf":
                conf_thresh,

            "iou":
                iou_thresh,

            "raw_detections":
                len(r.boxes),

            "post_detections":
                len(out),

            "preprocessing": {
                "enabled":
                    True,

                "method":
                    "LAB luminance denoising + CLAHE",

                "denoising":
                    "fastNlMeansDenoising",

                "denoising_h":
                    5,

                "template_window":
                    7,

                "search_window":
                    21,

                "clahe_clip_limit":
                    2.0,

                "clahe_tile_grid":
                    [
                        8,
                        8,
                    ],

                "time_ms":
                    preprocessing_time_ms,
            },

            "inference_time_ms":
                inference_time_ms,

            "total_time_ms":
                elapsed_ms,
        }

    return response