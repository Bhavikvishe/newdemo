"""Second-order Runge-Kutta ocean drift integration."""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from .models import OceanSample, TrajectoryPoint

EARTH_RADIUS_M = 6_371_000.0


def normalize_longitude(
    longitude: float,
) -> float:
    """Normalize longitude to [-180, 180)."""

    return (
        (longitude + 180.0) % 360.0
    ) - 180.0


def meters_per_degree_latitude() -> float:
    return (
        math.pi
        * EARTH_RADIUS_M
        / 180.0
    )


def meters_per_degree_longitude(
    latitude: float,
) -> float:
    cos_lat = max(
        1e-8,
        math.cos(
            math.radians(latitude)
        ),
    )

    return (
        meters_per_degree_latitude()
        * cos_lat
    )


def velocity_to_coordinate_rates(
    latitude: float,
    u_mps: float,
    v_mps: float,
) -> tuple[float, float]:
    """
    Convert east/north velocity in m/s into
    longitude/latitude rates in degrees/s.

    Returns:
        d_latitude_deg_per_second,
        d_longitude_deg_per_second
    """

    dlat = (
        v_mps
        / meters_per_degree_latitude()
    )

    dlon = (
        u_mps
        / meters_per_degree_longitude(
            latitude
        )
    )

    return dlat, dlon


def advance_position(
    latitude: float,
    longitude: float,
    u_mps: float,
    v_mps: float,
    dt_seconds: float,
) -> tuple[float, float]:
    dlat, dlon = velocity_to_coordinate_rates(
        latitude,
        u_mps,
        v_mps,
    )

    new_latitude = (
        latitude
        + dlat * dt_seconds
    )

    new_longitude = normalize_longitude(
        longitude
        + dlon * dt_seconds
    )

    if not (
        -90.0 <= new_latitude <= 90.0
    ):
        raise ValueError(
            "Trajectory reached an invalid latitude."
        )

    return (
        new_latitude,
        new_longitude,
    )


VelocityFunction = Callable[
    [float, float, datetime],
    OceanSample,
]


def rk2_step(
    latitude: float,
    longitude: float,
    timestamp: datetime,
    dt_seconds: float,
    velocity_fn: VelocityFunction,
) -> tuple[
    float,
    float,
    OceanSample,
]:
    """
    Perform one midpoint RK2 step.

    k1 = f(x_t, t)
    x_mid = x_t + k1 * dt / 2
    k2 = f(x_mid, t + dt / 2)
    x_next = x_t + k2 * dt
    """

    sample_1 = velocity_fn(
        latitude,
        longitude,
        timestamp,
    )

    k1_lat, k1_lon = velocity_to_coordinate_rates(
        latitude,
        sample_1.uo_mps,
        sample_1.vo_mps,
    )

    midpoint_lat = (
        latitude
        + k1_lat * dt_seconds / 2.0
    )

    midpoint_lon = normalize_longitude(
        longitude
        + k1_lon * dt_seconds / 2.0
    )

    midpoint_time = (
        timestamp
        + timedelta(
            seconds=dt_seconds / 2.0
        )
    )

    sample_2 = velocity_fn(
        midpoint_lat,
        midpoint_lon,
        midpoint_time,
    )

    k2_lat, k2_lon = velocity_to_coordinate_rates(
        midpoint_lat,
        sample_2.uo_mps,
        sample_2.vo_mps,
    )

    next_latitude = (
        latitude
        + k2_lat * dt_seconds
    )

    next_longitude = normalize_longitude(
        longitude
        + k2_lon * dt_seconds
    )

    if not (
        -90.0 <= next_latitude <= 90.0
    ):
        raise ValueError(
            "RK2 integration reached an invalid latitude."
        )

    return (
        next_latitude,
        next_longitude,
        sample_2,
    )


def integrate_rk2(
    start_latitude: float,
    start_longitude: float,
    start_time: datetime,
    horizon_hours: int,
    timestep_minutes: int,
    velocity_fn: VelocityFunction,
) -> list[TrajectoryPoint]:
    """
    Integrate a trajectory using midpoint RK2.

    The returned list contains the starting position followed by
    each integrated position.
    """

    total_steps = (
        horizon_hours * 60
        // timestep_minutes
    )

    dt_seconds = (
        timestep_minutes * 60.0
    )

    points: list[TrajectoryPoint] = []

    initial_sample = velocity_fn(
        start_latitude,
        start_longitude,
        start_time,
    )

    points.append(
        TrajectoryPoint(
            timestamp=start_time,
            latitude=start_latitude,
            longitude=start_longitude,
            uo_mps=initial_sample.uo_mps,
            vo_mps=initial_sample.vo_mps,
            speed_mps=math.hypot(
                initial_sample.uo_mps,
                initial_sample.vo_mps,
            ),
        )
    )

    latitude = start_latitude
    longitude = start_longitude
    timestamp = start_time

    for _ in range(total_steps):
        (
            latitude,
            longitude,
            sample,
        ) = rk2_step(
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp,
            dt_seconds=dt_seconds,
            velocity_fn=velocity_fn,
        )

        timestamp = (
            timestamp
            + timedelta(
                seconds=dt_seconds
            )
        )

        points.append(
            TrajectoryPoint(
                timestamp=timestamp,
                latitude=latitude,
                longitude=longitude,
                uo_mps=sample.uo_mps,
                vo_mps=sample.vo_mps,
                speed_mps=math.hypot(
                    sample.uo_mps,
                    sample.vo_mps,
                ),
            )
        )

    return points