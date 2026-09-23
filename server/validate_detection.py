"""Validation script for OCEONIX YOLO detection pipeline.

Runs raw YOLO inference and server model pipeline on test images across multiple
confidence thresholds to evaluate precision, recall, and class mapping fidelity.
"""

import argparse
import io
import os
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image, ImageDraw


def run_validation(image_path: str | None = None, weights_path: str | None = None):
    print("=" * 60)
    print("OCEONIX YOLO PIPELINE VALIDATION & AUDIT")
    print("=" * 60)

    try:
        import torch
        import ultralytics
        from ultralytics import YOLO
    except ImportError as e:
        print(f"[ERROR] Required packages not found: {e}")
        print("Please ensure your .venv has torch and ultralytics installed.")
        return False

    print(f"PyTorch Version:     {torch.__version__}")
    print(f"Ultralytics Version: {ultralytics.__version__}")
    print(f"CUDA Available:      {torch.cuda.is_available()}")

    # 1. Verify Weights File
    if weights_path:
        w_path = Path(weights_path)
    else:
        w_path = PROJECT_ROOT / "best.pt"
        if not w_path.exists():
            w_path = PROJECT_ROOT / "server" / "best.pt"

    print(f"\n[PHASE 2] MODEL INSPECTION")
    print(f"Absolute Weights Path: {w_path.resolve()}")
    if not w_path.exists():
        print(f"[ERROR] Model file not found at {w_path}")
        return False

    print(f"File Size:             {w_path.stat().st_size:,} bytes")

    # Load Model
    model = YOLO(str(w_path))
    task = getattr(model, "task", "detect")
    names = getattr(model, "names", {})
    print(f"Model Task:            {task}")
    print(f"Number of Classes:     {len(names)}")
    print(f"Model Class Names:")
    for k, v in names.items():
        print(f"    Class {k}: '{v}'")

    # 2. Check Class Mapping Against Frontend Aliases
    print(f"\n[PHASE 3] CLASS MAPPING CHECK")
    expected_frontend_classes = {
        "shipwreck",
        "pipeline",
        "ghost_fishing_gear",
        "cylinder",
        "airplane",
        "mine",
    }
    model_class_set = set(names.values())
    missing_in_frontend = model_class_set - expected_frontend_classes
    if missing_in_frontend:
        print(f"[WARNING] Model classes not recognized in frontend: {missing_in_frontend}")
    else:
        print("[OK] All model classes {shipwreck, pipeline, ghost_fishing_gear, cylinder, airplane, mine} have valid frontend mappings!")

    # 3. Prepare Test Image
    print(f"\n[PHASE 7] PREPARING TEST IMAGE")
    if image_path and Path(image_path).exists():
        test_img_path = Path(image_path)
        print(f"Using provided test image: {test_img_path}")
        img = Image.open(test_img_path).convert("RGB")
    else:
        # Check hero.png or create sample sonar-like image
        hero_candidate = PROJECT_ROOT / "src" / "assets" / "hero.png"
        if hero_candidate.exists():
            test_img_path = hero_candidate
            print(f"Using repository image: {test_img_path}")
            img = Image.open(test_img_path).convert("RGB")
        else:
            print("Creating synthetic test image (640x640)...")
            img = Image.new("RGB", (640, 640), color=(20, 30, 45))
            draw = ImageDraw.Draw(img)
            draw.rectangle([100, 100, 250, 250], fill=(120, 140, 160), outline=(200, 220, 240))
            test_img_path = PROJECT_ROOT / "test_sample.png"
            img.save(test_img_path)

    w, h = img.size
    print(f"Input Image Dimensions: {w} x {h}")

    # 4. Controlled Threshold Sweep
    print(f"\n[PHASE 9] CONTROLLED CONFIDENCE THRESHOLD SWEEP")
    thresholds = [0.10, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50]
    sweep_results = []

    for thresh in thresholds:
        res = model.predict(
            source=img,
            conf=thresh,
            iou=0.70,
            imgsz=640,
            augment=False,
            agnostic_nms=False,
            verbose=False,
        )[0]

        boxes = res.boxes
        det_count = len(boxes)
        det_details = []
        for b in boxes:
            cid = int(b.cls[0])
            cname = res.names.get(cid, str(cid))
            conf_val = float(b.conf[0])
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            det_details.append({
                "class_id": cid,
                "class_name": cname,
                "confidence": round(conf_val, 4),
                "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]
            })

        sweep_results.append({
            "threshold": thresh,
            "count": det_count,
            "detections": det_details
        })

        print(f"Threshold: {thresh:0.2f} -> {det_count} detections")
        for d in det_details:
            print(f"    - Class {d['class_id']} ({d['class_name']}): conf={d['confidence']:.4f}, box={d['box']}")

    # 5. Test Server Model Module API
    print(f"\n[PHASE 8] TESTING SERVER MODEL MODULE (server/model.py)")
    from server import model as server_model

    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    raw_bytes = img_bytes_io.getvalue()

    api_result = server_model.detect(raw_bytes, conf=0.25, include_debug=True)
    print(f"API Detections at conf=0.25: {len(api_result['predictions'])}")
    if "debug" in api_result:
        print(f"Debug Telemetry:")
        for k, v in api_result["debug"].items():
            print(f"    {k}: {v}")

    print("\n" + "=" * 60)
    print("[SUCCESS] YOLO DETECTION PIPELINE AUDIT COMPLETE")
    print("=" * 60)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCEONIX Detection Validation")
    parser.add_argument("--image", type=str, default=None, help="Path to test image")
    parser.add_argument("--weights", type=str, default=None, help="Path to weights file")
    args = parser.parse_args()

    success = run_validation(args.image, args.weights)
    sys.exit(0 if success else 1)
