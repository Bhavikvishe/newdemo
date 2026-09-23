"""Test Flask API endpoints for OCEONIX detection server."""

import io
import sys
from pathlib import Path
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.app import app


def test_api():
    print("=" * 60)
    print("TESTING OCEONIX FLASK API ENDPOINTS")
    print("=" * 60)

    client = app.test_client()

    # 1. Test GET /api/health
    print("\n[TEST 1] GET /api/health")
    resp = client.get("/api/health")
    print(f"Status: {resp.status_code}")
    print(f"Data:   {resp.get_json()}")
    assert resp.status_code == 200
    health_data = resp.get_json()
    assert health_data["ok"] is True
    assert "classes" in health_data
    assert len(health_data["classes"]) == 6
    assert health_data["classes"]["5"] == "mine"
    print("[PASS] /api/health returned valid weights and 6 classes (including 'mine')")

    # 2. Test POST /api/detect with empty body (should return 400)
    print("\n[TEST 2] POST /api/detect (empty body)")
    resp = client.post("/api/detect", data=b"")
    print(f"Status: {resp.status_code}")
    assert resp.status_code == 400
    print("[PASS] Empty request handled with HTTP 400")

    # 3. Test POST /api/detect with sample image
    print("\n[TEST 3] POST /api/detect with sample image & query parameters")
    img = Image.new("RGB", (640, 640), color=(10, 25, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw_bytes = buf.getvalue()

    resp = client.post("/api/detect?conf=0.25&debug=1", data=raw_bytes, content_type="application/octet-stream")
    print(f"Status: {resp.status_code}")
    data = resp.get_json()
    assert resp.status_code == 200
    assert "predictions" in data
    assert "debug" in data
    print(f"Predictions Count: {len(data['predictions'])}")
    print(f"Debug Info:        {data['debug']}")
    print("[PASS] POST /api/detect successfully ran inference and returned structured payload")

    print("\n" + "=" * 60)
    print("ALL API ENDPOINT TESTS PASSED")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = test_api()
    sys.exit(0 if success else 1)
