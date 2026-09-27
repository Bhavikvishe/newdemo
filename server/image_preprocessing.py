"""OpenCV preprocessing utilities for ANVESHA sonar images.

The preprocessing pipeline is based on the sonar preprocessing approach
used by the reference CtrlAltElite_SonarDebrisDetection project.

Pipeline:

    Original image
        ↓
    BGR
        ↓
    LAB color space
        ↓
    Luminance channel
        ↓
    Fast Non-Local Means Denoising
        ↓
    CLAHE local contrast enhancement
        ↓
    LAB reconstruction
        ↓
    BGR image
        ↓
    YOLO inference

The original image is never modified.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DENOISE_H = 5
DENOISE_TEMPLATE_WINDOW = 7
DENOISE_SEARCH_WINDOW = 21

CLAHE_CLIP_LIMIT = 2.0
CLAHE_TILE_GRID_SIZE = (8, 8)


def _ensure_uint8(
    image: np.ndarray,
) -> np.ndarray:
    """Convert an image to uint8 while preserving its intensity range."""

    if image.dtype == np.uint8:
        return image

    normalized = cv2.normalize(
        image,
        None,
        0,
        255,
        cv2.NORM_MINMAX,
    )

    return normalized.astype(
        np.uint8,
    )


def _denoise_luminance(
    luminance: np.ndarray,
) -> np.ndarray:
    """Reduce sonar speckle/noise while preserving structures."""

    return cv2.fastNlMeansDenoising(
        luminance,
        None,
        h=DENOISE_H,
        templateWindowSize=DENOISE_TEMPLATE_WINDOW,
        searchWindowSize=DENOISE_SEARCH_WINDOW,
    )


def _enhance_luminance(
    luminance: np.ndarray,
) -> np.ndarray:
    """Improve local sonar contrast using CLAHE."""

    clahe = cv2.createCLAHE(
        clipLimit=CLAHE_CLIP_LIMIT,
        tileGridSize=CLAHE_TILE_GRID_SIZE,
    )

    return clahe.apply(
        luminance,
    )


def preprocess_sonar_image(
    image: np.ndarray,
) -> np.ndarray:
    """
    Preprocess an already-loaded BGR image.

    Parameters
    ----------
    image:
        OpenCV BGR image.

    Returns
    -------
    np.ndarray
        Processed BGR image.

    Notes
    -----
    The image dimensions are preserved exactly so YOLO bounding boxes
    remain aligned with the original image coordinate system.
    """

    if image is None:
        raise ValueError(
            "Cannot preprocess an empty image."
        )

    if not isinstance(
        image,
        np.ndarray,
    ):
        raise TypeError(
            "Image must be a numpy.ndarray."
        )

    if image.ndim not in (
        2,
        3,
    ):
        raise ValueError(
            f"Unsupported image dimensions: {image.shape}"
        )

    image = _ensure_uint8(
        image,
    )

    # ---------------------------------------------------------------
    # Convert BGR → LAB.
    #
    # We only modify luminance. The chromatic channels are preserved.
    # This follows the reference sonar preprocessing implementation.
    # ---------------------------------------------------------------

    if image.ndim == 2:
        bgr_image = cv2.cvtColor(
            image,
            cv2.COLOR_GRAY2BGR,
        )
    elif image.shape[2] == 4:
        bgr_image = cv2.cvtColor(
            image,
            cv2.COLOR_BGRA2BGR,
        )
    else:
        bgr_image = image

    lab_image = cv2.cvtColor(
        bgr_image,
        cv2.COLOR_BGR2LAB,
    )

    luminance, channel_a, channel_b = cv2.split(
        lab_image,
    )

    # ---------------------------------------------------------------
    # Noise reduction
    # ---------------------------------------------------------------

    denoised = _denoise_luminance(
        luminance,
    )

    # ---------------------------------------------------------------
    # Local contrast enhancement
    # ---------------------------------------------------------------

    enhanced = _enhance_luminance(
        denoised,
    )

    # ---------------------------------------------------------------
    # Reconstruct LAB image using the original chroma channels.
    # ---------------------------------------------------------------

    processed_lab = cv2.merge(
        (
            enhanced,
            channel_a,
            channel_b,
        )
    )

    # LAB → BGR
    processed_image = cv2.cvtColor(
        processed_lab,
        cv2.COLOR_LAB2BGR,
    )

    return processed_image


def preprocess_sonar_file(
    input_path: str | Path,
    output_path: str | Path,
) -> Path:
    """
    Preprocess a sonar image file and save the processed image.

    The original file is never modified.

    This helper is useful for debugging and offline preprocessing.
    """

    input_path = Path(
        input_path,
    )

    output_path = Path(
        output_path,
    )

    if not input_path.is_file():
        raise FileNotFoundError(
            f"Input sonar image not found: {input_path}"
        )

    image = cv2.imread(
        str(input_path),
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise ValueError(
            f"OpenCV could not read the image: {input_path}"
        )

    processed_image = preprocess_sonar_image(
        image,
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    success = cv2.imwrite(
        str(output_path),
        processed_image,
    )

    if not success:
        raise ValueError(
            f"OpenCV could not save the processed image: {output_path}"
        )

    return output_path