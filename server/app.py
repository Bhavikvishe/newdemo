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
except ImportError:
    import model

app = Flask(__name__)
CORS(app)


@app.post("/api/detect")
def detect():
    data = request.get_data()
    if not data:
        return jsonify({"error": "empty request body - send the raw image bytes"}), 400
    try:
        predictions = model.detect(data)
    except Exception as err:
        return jsonify({"error": str(err)}), 500
    return jsonify(predictions)


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "weights": model.weights_path()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)