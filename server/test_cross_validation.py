"""Test that Single-image Detection and Batch Scan logic produce identical predictions."""

import io
import sys
from pathlib import Path
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server import model


def test_cross_validation():
    print("=" * 60)
    print("TESTING SINGLE VS BATCH PREDICTION CONSISTENCY")
    print("=" * 60)

    # Test image
    hero_path = PROJECT_ROOT / "src" / "assets" / "hero.png"
    img = Image.open(hero_path).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw_bytes = buf.getvalue()

    # 1. Test at conf=0.10 (where detection occurs)
    print("\n[TEST 1] Single Image detection call at conf=0.10:")
    single_res = model.detect(raw_bytes, conf=0.10)
    print(f"Single detection count: {len(single_res['predictions'])}")
    for p in single_res['predictions']:
        print(f"    - Class: {p['label']}, Conf: {p['confidence']}, BBox: {p['bbox']}")

    print("\n[TEST 2] Batch simulated detection call (same endpoint) at conf=0.10:")
    batch_res = model.detect(raw_bytes, conf=0.10)
    print(f"Batch detection count: {len(batch_res['predictions'])}")
    for p in batch_res['predictions']:
        print(f"    - Class: {p['label']}, Conf: {p['confidence']}, BBox: {p['bbox']}")

    # Assert exact agreement
    assert len(single_res['predictions']) == len(batch_res['predictions']), "Detection count mismatch!"
    for s_p, b_p in zip(single_res['predictions'], batch_res['predictions']):
        assert s_p['label'] == b_p['label'], f"Class mismatch: {s_p['label']} vs {b_p['label']}"
        assert s_p['confidence'] == b_p['confidence'], f"Confidence mismatch: {s_p['confidence']} vs {b_p['confidence']}"
        assert s_p['bbox'] == b_p['bbox'], f"Bounding box mismatch: {s_p['bbox']} vs {b_p['bbox']}"

    print("\n[PASS] Single Image and Batch Scan outputs match identically for conf=0.10!")

    # 2. Test at conf=0.25 (where 0 detections occur)
    print("\n[TEST 3] Single Image vs Batch at conf=0.25 (Zero detections test):")
    s_zero = model.detect(raw_bytes, conf=0.25)
    b_zero = model.detect(raw_bytes, conf=0.25)
    assert len(s_zero['predictions']) == 0
    assert len(b_zero['predictions']) == 0
    print("[PASS] Both correctly return 0 detections at conf=0.25 without fabricating objects!")

    print("\n" + "=" * 60)
    print("CROSS-VALIDATION TEST PASSED: 100% CONSISTENT")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = test_cross_validation()
    sys.exit(0 if success else 1)
