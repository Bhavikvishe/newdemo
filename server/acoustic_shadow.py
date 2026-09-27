"""
Acoustic-shadow analysis for ANVESHA side-scan sonar detections.

This module provides a post-YOLO validation signal.

It does NOT replace YOLO and does NOT modify the original YOLO
confidence. It examines the local sonar image around each detection
and looks for evidence of an acoustic shadow.

The initial implementation evaluates both left and right sides of
the detection because shadow direction depends on sonar acquisition
geometry.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


def _to_gray(image: np.ndarray) -> np.ndarray:
    """Convert image to uint8 grayscale."""

    if image is None:
        raise ValueError(
            "Image is required for acoustic-shadow analysis."
        )

    if image.ndim == 2:
        gray = image

    elif image.ndim == 3:
        if image.shape[2] == 4:
            gray = cv2.cvtColor(
                image,
                cv2.COLOR_BGRA2GRAY,
            )
        else:
            gray = cv2.cvtColor(
                image,
                cv2.COLOR_BGR2GRAY,
            )

    else:
        raise ValueError(
            f"Unsupported image shape: {image.shape}"
        )

    if gray.dtype != np.uint8:
        gray = cv2.normalize(
            gray,
            None,
            0,
            255,
            cv2.NORM_MINMAX,
        ).astype(np.uint8)

    return gray


def _clip_box(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    width: int,
    height: int,
) -> tuple[int, int, int, int]:

    x1 = max(
        0,
        min(
            int(round(x1)),
            width - 1,
        ),
    )

    y1 = max(
        0,
        min(
            int(round(y1)),
            height - 1,
        ),
    )

    x2 = max(
        x1 + 1,
        min(
            int(round(x2)),
            width,
        ),
    )

    y2 = max(
        y1 + 1,
        min(
            int(round(y2)),
            height,
        ),
    )

    return x1, y1, x2, y2


def _mean(image: np.ndarray) -> float:
    if image.size == 0:
        return 0.0

    return float(
        np.mean(image)
    )


def _std(image: np.ndarray) -> float:
    if image.size == 0:
        return 0.0

    return float(
        np.std(image)
    )


def _target_contrast(
    target: np.ndarray,
    local_region: np.ndarray,
) -> float:

    if (
        target.size == 0
        or local_region.size == 0
    ):
        return 0.0

    target_mean = _mean(target)
    background_mean = _mean(
        local_region
    )

    denominator = max(
        background_mean,
        1.0,
    )

    return float(
        min(
            1.0,
            abs(
                target_mean
                - background_mean
            )
            / denominator,
        )
    )


def _analyze_side(
    gray: np.ndarray,
    box: tuple[int, int, int, int],
    direction: str,
) -> dict[str, Any]:

    x1, y1, x2, y2 = box

    height, width = gray.shape[:2]

    target_width = max(
        1,
        x2 - x1,
    )

    target_height = max(
        1,
        y2 - y1,
    )

    # Shadow region extends approximately 1.5 target widths.
    shadow_width = max(
        8,
        int(
            target_width * 1.5
        ),
    )

    # Keep the shadow vertically aligned with the target.
    sy1 = max(
        0,
        y1 - int(
            target_height * 0.20
        ),
    )

    sy2 = min(
        height,
        y2 + int(
            target_height * 0.20
        ),
    )

    if direction == "right":

        sx1 = x2

        sx2 = min(
            width,
            x2 + shadow_width,
        )

    else:

        sx1 = max(
            0,
            x1 - shadow_width,
        )

        sx2 = x1

    if sx2 <= sx1 or sy2 <= sy1:
        return {
            "detected": False,
            "score": 0.0,
            "darkness": 0.0,
            "dark_fraction": 0.0,
            "alignment": 0.0,
        }

    shadow = gray[
        sy1:sy2,
        sx1:sx2,
    ]

    if shadow.size < 25:
        return {
            "detected": False,
            "score": 0.0,
            "darkness": 0.0,
            "dark_fraction": 0.0,
            "alignment": 0.0,
        }

    # Build a nearby background reference.
    bg_x1 = max(
        0,
        sx1 - shadow_width,
    )

    bg_x2 = min(
        width,
        sx2 + shadow_width,
    )

    background = gray[
        sy1:sy2,
        bg_x1:bg_x2,
    ]

    if background.size == 0:
        return {
            "detected": False,
            "score": 0.0,
            "darkness": 0.0,
            "dark_fraction": 0.0,
            "alignment": 0.0,
        }

    shadow_mean = _mean(
        shadow
    )

    background_mean = _mean(
        background
    )

    # Acoustic shadows are expected to be darker than nearby seabed.
    darkness = max(
        0.0,
        min(
            1.0,
            (
                background_mean
                - shadow_mean
            )
            / max(
                background_mean,
                1.0,
            ),
        ),
    )

    # Detect pixels substantially darker than the local background.
    threshold = (
        background_mean
        * 0.82
    )

    dark_mask = (
        shadow.astype(
            np.float32
        )
        < threshold
    ).astype(
        np.uint8
    ) * 255

    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (3, 3),
    )

    dark_mask = cv2.morphologyEx(
        dark_mask,
        cv2.MORPH_OPEN,
        kernel,
    )

    dark_mask = cv2.morphologyEx(
        dark_mask,
        cv2.MORPH_CLOSE,
        kernel,
    )

    dark_fraction = float(
        np.count_nonzero(
            dark_mask
        )
        / max(
            dark_mask.size,
            1,
        )
    )

    # Shadow should roughly align with the target vertically.
    target_center_y = (
        y1 + y2
    ) / 2.0

    shadow_center_y = (
        sy1 + sy2
    ) / 2.0

    alignment = max(
        0.0,
        min(
            1.0,
            1.0
            - abs(
                target_center_y
                - shadow_center_y
            )
            / max(
                target_height,
                1,
            ),
        ),
    )

    # Convert dark-area fraction into a bounded score.
    area_score = min(
        1.0,
        dark_fraction
        * (
            shadow_width
            / max(
                target_width,
                1,
            )
        ),
    )

    # Combined acoustic-shadow score.
    score = (
        0.55 * darkness
        + 0.30 * area_score
        + 0.15 * alignment
    )

    detected = (
        score >= 0.35
        and darkness >= 0.10
        and dark_fraction >= 0.08
    )

    return {
        "detected": bool(
            detected
        ),
        "score": round(
            float(score),
            4,
        ),
        "darkness": round(
            float(darkness),
            4,
        ),
        "dark_fraction": round(
            float(dark_fraction),
            4,
        ),
        "alignment": round(
            float(alignment),
            4,
        ),
    }


def analyze_acoustic_shadow(
    image: np.ndarray,
    bbox: dict[str, float],
) -> dict[str, Any]:
    """
    Analyze acoustic-shadow evidence around a normalized YOLO bbox.

    Expected bbox:

        {
            "x": 0.25,
            "y": 0.30,
            "width": 0.15,
            "height": 0.12
        }

    Coordinates are normalized to 0..1.
    """

    gray = _to_gray(
        image
    )

    height, width = gray.shape[:2]

    x = float(
        bbox.get(
            "x",
            0.0,
        )
    )

    y = float(
        bbox.get(
            "y",
            0.0,
        )
    )

    w = float(
        bbox.get(
            "width",
            0.0,
        )
    )

    h = float(
        bbox.get(
            "height",
            0.0,
        )
    )

    # Convert normalized coordinates to pixels.
    x1 = x * width
    y1 = y * height
    x2 = (
        x + w
    ) * width
    y2 = (
        y + h
    ) * height

    box = _clip_box(
        x1,
        y1,
        x2,
        y2,
        width,
        height,
    )

    bx1, by1, bx2, by2 = box

    target = gray[
        by1:by2,
        bx1:bx2,
    ]

    # Evaluate both possible shadow directions.
    left = _analyze_side(
        gray,
        box,
        "left",
    )

    right = _analyze_side(
        gray,
        box,
        "right",
    )

    if (
        float(left["score"])
        >= float(
            right["score"]
        )
    ):
        selected = left
        direction = "left"

    else:
        selected = right
        direction = "right"

    # Local region around the target.
    margin_x = max(
        8,
        int(
            (bx2 - bx1)
            * 0.75
        ),
    )

    margin_y = max(
        8,
        int(
            (by2 - by1)
            * 0.75
        ),
    )

    rx1 = max(
        0,
        bx1 - margin_x,
    )

    ry1 = max(
        0,
        by1 - margin_y,
    )

    rx2 = min(
        width,
        bx2 + margin_x,
    )

    ry2 = min(
        height,
        by2 + margin_y,
    )

    local_region = gray[
        ry1:ry2,
        rx1:rx2,
    ]

    contrast = _target_contrast(
        target,
        local_region,
    )

    shadow_score = float(
        selected["score"]
    )

    # Acoustic score combines:
    # 70% shadow evidence
    # 30% target/background contrast
    acoustic_score = (
        0.70 * shadow_score
        + 0.30 * contrast
    )

    return {
        "shadow_detected":
            bool(
                selected[
                    "detected"
                ]
            ),

        "shadow_direction":
            direction,

        "shadow_score":
            round(
                shadow_score,
                4,
            ),

        "shadow_darkness":
            float(
                selected[
                    "darkness"
                ]
            ),

        "shadow_dark_fraction":
            float(
                selected[
                    "dark_fraction"
                ]
            ),

        "shadow_alignment":
            float(
                selected[
                    "alignment"
                ]
            ),

        "target_contrast":
            round(
                contrast,
                4,
            ),

        "acoustic_score":
            round(
                acoustic_score,
                4,
            ),
    }