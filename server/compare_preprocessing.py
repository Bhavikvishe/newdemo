"""
Compare YOLO detections with and without OpenCV preprocessing.

This script is experimental / validation-only.

It does NOT claim preprocessing improves accuracy.
It reports measurable differences between the two inference modes.
"""

from __future__ import annotations

import argparse
import io
import statistics
from pathlib import Path

from PIL import Image, ImageOps
from ultralytics import YOLO

from server.image_preprocessing import (
    preprocess_for_inference,
)


SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".tif",
    ".tiff",
}


def load_images(
    directory: Path,
) -> list[Path]:
    if not directory.is_dir():
        raise FileNotFoundError(
            f"Image directory not found: {directory}"
        )

    images = sorted(
        path
        for path in directory.rglob("*")
        if path.is_file()
        and path.suffix.lower()
        in SUPPORTED_EXTENSIONS
    )

    if not images:
        raise FileNotFoundError(
            f"No supported images found in: {directory}"
        )

    return images


def prepare_raw(
    path: Path,
) -> Image.Image:
    with path.open(
        "rb",
    ) as file:
        raw = file.read()

    return (
        ImageOps
        .exif_transpose(
            Image.open(
                io.BytesIO(
                    raw,
                ),
            ),
        )
        .convert("RGB")
    )


def prepare_processed(
    path: Path,
):
    with path.open(
        "rb",
    ) as file:
        raw = file.read()

    processed_bgr, _ = preprocess_for_inference(
        raw,
    )

    import cv2

    return cv2.cvtColor(
        processed_bgr,
        cv2.COLOR_BGR2RGB,
    )


def best_confidence(
    results,
) -> float | None:
    boxes = results.boxes

    if boxes is None or len(boxes) == 0:
        return None

    return max(
        float(conf)
        for conf in boxes.conf.tolist()
    )


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--images",
        required=True,
        help="Directory containing test sonar images.",
    )

    parser.add_argument(
        "--weights",
        default="best.pt",
        help="Path to YOLO weights.",
    )

    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
    )

    parser.add_argument(
        "--iou",
        type=float,
        default=0.70,
    )

    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
    )

    args = parser.parse_args()

    image_dir = Path(
        args.images,
    )

    model = YOLO(
        args.weights,
    )

    images = load_images(
        image_dir,
    )

    raw_counts: list[int] = []
    processed_counts: list[int] = []

    raw_confidences: list[float] = []
    processed_confidences: list[float] = []

    print(
        f"Testing {len(images)} images."
    )
    print()

    for index, image_path in enumerate(
        images,
        start=1,
    ):
        raw_image = prepare_raw(
            image_path,
        )

        processed_image = prepare_processed(
            image_path,
        )

        raw_result = model.predict(
            source=raw_image,
            conf=args.conf,
            iou=args.iou,
            imgsz=args.imgsz,
            augment=False,
            agnostic_nms=False,
            verbose=False,
        )[0]

        processed_result = model.predict(
            source=processed_image,
            conf=args.conf,
            iou=args.iou,
            imgsz=args.imgsz,
            augment=False,
            agnostic_nms=False,
            verbose=False,
        )[0]

        raw_count = len(
            raw_result.boxes
        )

        processed_count = len(
            processed_result.boxes
        )

        raw_counts.append(
            raw_count,
        )

        processed_counts.append(
            processed_count,
        )

        raw_best = best_confidence(
            raw_result,
        )

        processed_best = best_confidence(
            processed_result,
        )

        if raw_best is not None:
            raw_confidences.append(
                raw_best,
            )

        if processed_best is not None:
            processed_confidences.append(
                processed_best,
            )

        print(
            f"[{index}/{len(images)}] "
            f"{image_path.name}"
        )

        print(
            f"    raw:       "
            f"{raw_count} detections"
            + (
                f", best={raw_best:.4f}"
                if raw_best is not None
                else ""
            )
        )

        print(
            f"    processed: "
            f"{processed_count} detections"
            + (
                f", best={processed_best:.4f}"
                if processed_best is not None
                else ""
            )
        )

    print()
    print("=" * 60)
    print("RAW VS OPENCV PREPROCESSING")
    print("=" * 60)

    print(
        f"Images tested: {len(images)}"
    )

    print(
        f"Raw total detections: "
        f"{sum(raw_counts)}"
    )

    print(
        f"Processed total detections: "
        f"{sum(processed_counts)}"
    )

    if raw_confidences:
        print(
            "Raw mean best confidence: "
            f"{statistics.mean(raw_confidences) * 100:.2f}%"
        )

    if processed_confidences:
        print(
            "Processed mean best confidence: "
            f"{statistics.mean(processed_confidences) * 100:.2f}%"
        )

    print()
    print(
        "NOTE: Detection-count/confidence differences "
        "do not establish accuracy improvement."
    )
    print(
        "Use labeled validation data to compare precision, "
        "recall and mAP before concluding that preprocessing "
        "improves the model."
    )


if __name__ == "__main__":
    main()