"""Validation and model-status rules for drift forecasting."""

from __future__ import annotations

import json
import os

from .models import ForecastRequest, ForecastServiceError


def validate_coordinates(
    latitude: float,
    longitude: float,
) -> None:
    if not (-90.0 <= latitude <= 90.0):
        raise ForecastServiceError(
            "Latitude must be between -90 and 90 degrees.",
            code="INVALID_LATITUDE",
            status_code=400,
        )

    if not (-180.0 <= longitude <= 180.0):
        raise ForecastServiceError(
            "Longitude must be between -180 and 180 degrees.",
            code="INVALID_LONGITUDE",
            status_code=400,
        )


def validate_request(
    request: ForecastRequest,
) -> None:
    validate_coordinates(
        request.latitude,
        request.longitude,
    )

    if not (
        1 <= request.horizon_hours <= 168
    ):
        raise ForecastServiceError(
            "horizon_hours must be between 1 and 168.",
            code="INVALID_HORIZON",
            status_code=400,
        )

    if not (
        5 <= request.timestep_minutes <= 360
    ):
        raise ForecastServiceError(
            "timestep_minutes must be between 5 and 360.",
            code="INVALID_TIMESTEP",
            status_code=400,
        )

    if request.horizon_hours * 60 % request.timestep_minutes != 0:
        raise ForecastServiceError(
            "horizon_hours must be exactly divisible by timestep_minutes.",
            code="INVALID_TIMESTEP",
            status_code=400,
        )

    if not (
        0.5 <= request.grid_margin_degrees <= 15.0
    ):
        raise ForecastServiceError(
            "grid_margin_degrees must be between 0.5 and 15.",
            code="INVALID_GRID_MARGIN",
            status_code=400,
        )

    if not (
        3 <= request.vector_grid_size <= 11
    ):
        raise ForecastServiceError(
            "vector_grid_size must be between 3 and 11.",
            code="INVALID_VECTOR_GRID",
            status_code=400,
        )

    if request.source not in {
        "auto",
        "local",
        "copernicus",
        "open_meteo",
    }:
        raise ForecastServiceError(
            "source must be one of: auto, local, copernicus, open_meteo.",
            code="INVALID_SOURCE",
            status_code=400,
        )


def ml_status() -> dict:
    """
    ML is deliberately disabled until validated real trajectory data
    and an evaluated residual model are available.

    No synthetic validation metrics are generated here.
    """

    return {
        "enabled": False,
        "status": "DISABLED",
        "reason_code": "INSUFFICIENT_VALIDATED_DATA",
        "reason": (
            "Insufficient validated trajectory data. "
            "Physics-only RK2 forecasting is active."
        ),
        "metrics": None,
        "training_samples": None,
        "validation_samples": None,
    }


def load_retention_weights() -> dict[str, float] | None:
    """
    Retention weights must be explicitly configured.

    We do not silently invent scientifically validated weights.
    """

    raw = os.environ.get(
        "RETENTION_WEIGHTS_JSON",
        "",
    ).strip()

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ForecastServiceError(
            "RETENTION_WEIGHTS_JSON is not valid JSON.",
            code="INVALID_RETENTION_WEIGHTS",
            status_code=500,
        ) from exc

    if not isinstance(parsed, dict):
        raise ForecastServiceError(
            "RETENTION_WEIGHTS_JSON must contain a JSON object.",
            code="INVALID_RETENTION_WEIGHTS",
            status_code=500,
        )

    required = {
        "convergence",
        "vorticity",
        "mixed_layer_depth",
    }

    if set(parsed.keys()) != required:
        raise ForecastServiceError(
            "RETENTION_WEIGHTS_JSON must contain exactly: "
            "convergence, vorticity, mixed_layer_depth.",
            code="INVALID_RETENTION_WEIGHTS",
            status_code=500,
        )

    weights = {}

    for key in required:
        value = parsed[key]

        if not isinstance(value, (int, float)):
            raise ForecastServiceError(
                f"Retention weight '{key}' must be numeric.",
                code="INVALID_RETENTION_WEIGHTS",
                status_code=500,
            )

        if value < 0:
            raise ForecastServiceError(
                f"Retention weight '{key}' cannot be negative.",
                code="INVALID_RETENTION_WEIGHTS",
                status_code=500,
            )

        weights[key] = float(value)

    total = sum(weights.values())

    if total <= 0:
        raise ForecastServiceError(
            "Retention weights must have a positive total.",
            code="INVALID_RETENTION_WEIGHTS",
            status_code=500,
        )

    return {
        key: value / total
        for key, value in weights.items()
    }