"""ANVESHA backend API.

Run from the project root:

    pip install -r server/requirements.txt
    python -m server.app

Existing endpoints:

    POST /api/detect
    GET  /api/health
    GET  /api/gebco/depth

Drift forecasting:

    POST /api/drift/forecast
"""

from __future__ import annotations

import os

from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from . import model
    from . import gebco
    from .forecasting.models import (
        ForecastRequest,
        ForecastServiceError,
    )
    from .forecasting.forecast_service import forecast_drift
    from .auth import close_request_db
    from .auth_routes import auth_bp
    from .detection_routes import detection_bp
    from .users_routes import users_bp
except ImportError:
    import model
    import gebco

    from forecasting.models import (
        ForecastRequest,
        ForecastServiceError,
    )
    from forecasting.forecast_service import forecast_drift
    from auth import close_request_db
    from auth_routes import auth_bp
    from detection_routes import detection_bp
    from users_routes import users_bp


app = Flask(__name__)

app.register_blueprint(users_bp)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
CORS(app, origins=[frontend_origin], supports_credentials=True)

app.register_blueprint(auth_bp)
app.register_blueprint(detection_bp)


@app.teardown_appcontext
def close_db(_exc=None):
    close_request_db()


@app.post("/api/detect")
def detect():
    data = request.get_data()

    if not data:
        return jsonify(
            {
                "error": (
                    "empty request body - "
                    "send the raw image bytes"
                )
            }
        ), 400

    conf = request.args.get(
        "conf",
        type=float,
    )

    iou = request.args.get(
        "iou",
        type=float,
    )

    imgsz = request.args.get(
        "imgsz",
        type=int,
    )

    debug = request.args.get(
        "debug",
    )

    include_debug = None

    if debug is not None:
        include_debug = (
            debug.lower()
            in (
                "1",
                "true",
                "yes",
            )
        )

    try:
        result = model.detect(
            data,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            include_debug=include_debug,
        )

    except Exception as err:
        return jsonify(
            {
                "error": str(err)
            }
        ), 500

    return jsonify(
        result
    )


@app.get("/api/health")
def health():
    try:
        info = model.get_model_info()

        return jsonify(
            {
                "ok": True,
                **info,
            }
        )

    except Exception as err:
        return jsonify(
            {
                "ok": False,
                "error": str(err),
                "weights": model.weights_path(),
            }
        )


@app.get("/api/gebco/depth")
def gebco_depth():
    lat = request.args.get(
        "lat",
        default=18.90,
        type=float,
    )

    lng = request.args.get(
        "lng",
        default=72.70,
        type=float,
    )

    samples = request.args.get(
        "samples",
        default=21,
        type=int,
    )

    grid_size = request.args.get(
        "grid",
        default=5,
        type=int,
    )

    span_km = request.args.get(
        "span_km",
        default=1.2,
        type=float,
    )

    try:
        data = gebco.get_bathymetry(
            lat=lat,
            lng=lng,
            transect_samples=max(
                5,
                min(51, samples),
            ),
            grid_size=max(
                3,
                min(9, grid_size),
            ),
            span_km=max(
                0.2,
                min(20.0, span_km),
            ),
        )

        return jsonify(data)

    except Exception as err:
        return jsonify(
            {
                "error": str(err),
                "status": "error",
            }
        ), 500


@app.post("/api/drift/forecast")
def drift_forecast():
    """Generate a physics-based ghost-net drift forecast."""

    payload = request.get_json(
        silent=True
    )

    if not isinstance(
        payload,
        dict,
    ):
        return jsonify(
            {
                "status": "error",
                "code": "INVALID_JSON",
                "error": (
                    "Request body must be a JSON object."
                ),
            }
        ), 400

    try:
        latitude = float(
            payload["latitude"]
        )

        longitude = float(
            payload["longitude"]
        )

    except (
        KeyError,
        TypeError,
        ValueError,
    ):
        return jsonify(
            {
                "status": "error",
                "code": "INVALID_COORDINATES",
                "error": (
                    "latitude and longitude are required "
                    "numeric fields."
                ),
            }
        ), 400

    horizon_hours = payload.get(
        "horizon_hours",
        72,
    )

    timestep_minutes = payload.get(
        "timestep_minutes",
        60,
    )

    source = payload.get(
        "source",
        "auto",
    )

    grid_margin_degrees = payload.get(
        "grid_margin_degrees",
        5.0,
    )

    vector_grid_size = payload.get(
        "vector_grid_size",
        5,
    )

    start_time_raw = payload.get(
        "start_time"
    )

    start_time = None

    if start_time_raw:
        if not isinstance(
            start_time_raw,
            str,
        ):
            return jsonify(
                {
                    "status": "error",
                    "code": "INVALID_START_TIME",
                    "error": (
                        "start_time must be an ISO-8601 string."
                    ),
                }
            ), 400

        try:
            normalized = (
                start_time_raw
                .replace(
                    "Z",
                    "+00:00",
                )
            )

            start_time = datetime.fromisoformat(
                normalized
            )

            if start_time.tzinfo is None:
                start_time = start_time.replace(
                    tzinfo=timezone.utc
                )

            start_time = start_time.astimezone(
                timezone.utc
            )

        except ValueError:
            return jsonify(
                {
                    "status": "error",
                    "code": "INVALID_START_TIME",
                    "error": (
                        "start_time must be a valid ISO-8601 timestamp."
                    ),
                }
            ), 400

    try:
        forecast_request = ForecastRequest(
            latitude=latitude,
            longitude=longitude,
            horizon_hours=int(
                horizon_hours
            ),
            timestep_minutes=int(
                timestep_minutes
            ),
            start_time=start_time,
            source=str(
                source
            ),
            grid_margin_degrees=float(
                grid_margin_degrees
            ),
            vector_grid_size=int(
                vector_grid_size
            ),
        )

        result = forecast_drift(
            forecast_request
        )

        return jsonify(
            result
        ), 200

    except ForecastServiceError as err:
        return jsonify(
            {
                "status": "error",
                "code": err.code,
                "error": err.message,
            }
        ), err.status_code

    except Exception as err:
        return jsonify(
            {
                "status": "error",
                "code": "UNEXPECTED_FORECAST_ERROR",
                "error": str(err),
            }
        ), 500


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "true").lower() in {"1", "true", "yes"},
    )