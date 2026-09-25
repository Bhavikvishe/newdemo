"""OCEONIX detection API.

Run from the project root:

    pip install -r server/requirements.txt
    python server/app.py

Serves POST /api/detect at http://localhost:5000. The Vite dev server proxies
/api -> http://localhost:5000 (see vite.config.ts), so no CORS is needed when
using `npm run dev`. CORS is enabled anyway for direct calls.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from . import model
    from . import gebco
except ImportError:
    import model
    import gebco

app = Flask(__name__)
CORS(app)


@app.post("/api/detect")
def detect():
    data = request.get_data()
    if not data:
        return jsonify({"error": "empty request body - send the raw image bytes"}), 400

    conf = request.args.get("conf", type=float)
    iou = request.args.get("iou", type=float)
    imgsz = request.args.get("imgsz", type=int)
    debug = request.args.get("debug")
    include_debug = None
    if debug is not None:
        include_debug = debug.lower() in ("1", "true", "yes")

    try:
        result = model.detect(
            data,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            include_debug=include_debug,
        )
    except Exception as err:
        return jsonify({"error": str(err)}), 500

    return jsonify(result)


@app.get("/api/health")
def health():
    try:
        info = model.get_model_info()
        return jsonify({"ok": True, **info})
    except Exception as err:
        return jsonify({"ok": False, "error": str(err), "weights": model.weights_path()})


@app.get("/api/gebco/depth")
def gebco_depth():
    lat = request.args.get("lat", default=18.90, type=float)
    lng = request.args.get("lng", default=72.70, type=float)
    samples = request.args.get("samples", default=21, type=int)
    grid_size = request.args.get("grid", default=5, type=int)
    span_km = request.args.get("span_km", default=1.2, type=float)

    try:
        data = gebco.get_bathymetry(
            lat=lat,
            lng=lng,
            transect_samples=max(5, min(51, samples)),
            grid_size=max(3, min(9, grid_size)),
            span_km=max(0.2, min(20.0, span_km)),
        )
        return jsonify(data)
    except Exception as err:
        return jsonify({"error": str(err), "status": "error"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)