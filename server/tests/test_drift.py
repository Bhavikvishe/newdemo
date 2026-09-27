"""Unit tests for ANVESHA drift forecasting."""

from __future__ import annotations

import math
import sys
from datetime import datetime, timezone

import pytest

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(
        0,
        str(PROJECT_ROOT),
    )

from server.forecasting.models import (
    ForecastRequest,
    OceanSample,
)
from server.forecasting.rk2 import (
    EARTH_RADIUS_M,
    integrate_rk2,
    meters_per_degree_latitude,
    velocity_to_coordinate_rates,
)
from server.forecasting.uncertainty import (
    uncertainty_radius,
)
from server.forecasting.validation import (
    ml_status,
    validate_request,
)


def constant_velocity(
    latitude: float,
    longitude: float,
    timestamp: datetime,
) -> OceanSample:
    return OceanSample(
        latitude=latitude,
        longitude=longitude,
        timestamp=timestamp,
        uo_mps=1.0,
        vo_mps=0.0,
        source_timestamp=timestamp.isoformat(),
    )


def test_meters_per_degree_latitude():
    expected = (
        math.pi
        * EARTH_RADIUS_M
        / 180.0
    )

    assert (
        meters_per_degree_latitude()
        == pytest.approx(
            expected
        )
    )


def test_velocity_coordinate_conversion():
    dlat, dlon = velocity_to_coordinate_rates(
        latitude=0.0,
        u_mps=1.0,
        v_mps=0.0,
    )

    assert dlat == pytest.approx(
        0.0
    )

    assert dlon > 0.0


def test_rk2_constant_eastward_current():
    start = datetime(
        2026,
        9,
        27,
        tzinfo=timezone.utc,
    )

    trajectory = integrate_rk2(
        start_latitude=0.0,
        start_longitude=0.0,
        start_time=start,
        horizon_hours=1,
        timestep_minutes=60,
        velocity_fn=constant_velocity,
    )

    assert len(
        trajectory
    ) == 2

    end = trajectory[-1]

    assert end.latitude == pytest.approx(
        0.0,
        abs=1e-8,
    )

    expected_dlon = (
        3600.0
        / meters_per_degree_latitude()
    )

    assert end.longitude == pytest.approx(
        expected_dlon,
        rel=1e-5,
    )


def test_uncertainty_is_dimensionally_positive():
    result = uncertainty_radius(
        elapsed_seconds=24 * 3600,
        characteristic_speed_mps=1.0,
    )

    assert result["sigma_m"] > 0
    assert result["radius_95_m"] > result["sigma_m"]
    assert result["diffusion_variance_m2"] > 0
    assert (
        result["current_variability_variance_m2"]
        > 0
    )


def test_invalid_latitude():
    request = ForecastRequest(
        latitude=100.0,
        longitude=70.0,
    )

    with pytest.raises(Exception):
        validate_request(
            request
        )


def test_invalid_longitude():
    request = ForecastRequest(
        latitude=20.0,
        longitude=200.0,
    )

    with pytest.raises(Exception):
        validate_request(
            request
        )


def test_ml_is_disabled_without_validated_data():
    result = ml_status()

    assert result["enabled"] is False
    assert result["status"] == "DISABLED"
    assert (
        result["reason_code"]
        == "INSUFFICIENT_VALIDATED_DATA"
    )
    assert result["metrics"] is None


def test_forecast_request_defaults():
    request = ForecastRequest(
        latitude=18.5,
        longitude=73.8,
    )

    validate_request(
        request
    )

    assert request.horizon_hours == 72
    assert request.timestep_minutes == 60
    assert request.source == "auto"