"""Trajectory uncertainty calculations."""

from __future__ import annotations

import math
from typing import Any

EARTH_RADIUS_M = 6_371_000.0

DEFAULT_SIGMA0_M = 500.0
DEFAULT_HORIZONTAL_DIFFUSIVITY_M2_S = 25.0
DEFAULT_CURRENT_VARIABILITY_GAMMA = 0.035


def uncertainty_radius(
    elapsed_seconds: float,
    characteristic_speed_mps: float,
    sigma0_m: float = DEFAULT_SIGMA0_M,
    horizontal_diffusivity_m2_s: float = (
        DEFAULT_HORIZONTAL_DIFFUSIVITY_M2_S
    ),
    current_variability_gamma: float = (
        DEFAULT_CURRENT_VARIABILITY_GAMMA
    ),
) -> dict[str, float]:
    """
    Estimate radial dispersion.

    Components:

        diffusion_variance = 2 * Dh * t

        current_variability_variance =
            gamma * (U * t)^2

        sigma^2 =
            sigma0^2
            + diffusion_variance
            + current_variability_variance

    All terms are in m^2.
    """

    if elapsed_seconds < 0:
        raise ValueError(
            "elapsed_seconds cannot be negative."
        )

    if characteristic_speed_mps < 0:
        raise ValueError(
            "characteristic_speed_mps cannot be negative."
        )

    if sigma0_m < 0:
        raise ValueError(
            "sigma0_m cannot be negative."
        )

    if horizontal_diffusivity_m2_s < 0:
        raise ValueError(
            "horizontal_diffusivity_m2_s cannot be negative."
        )

    if current_variability_gamma < 0:
        raise ValueError(
            "current_variability_gamma cannot be negative."
        )

    diffusion_variance = (
        2.0
        * horizontal_diffusivity_m2_s
        * elapsed_seconds
    )

    current_variability_variance = (
        current_variability_gamma
        * (
            characteristic_speed_mps
            * elapsed_seconds
        ) ** 2
    )

    sigma_m = math.sqrt(
        sigma0_m ** 2
        + diffusion_variance
        + current_variability_variance
    )

    # 95% containment radius for a 2D isotropic Gaussian.
    radius_95_m = (
        math.sqrt(
            -2.0
            * math.log(0.05)
        )
        * sigma_m
    )

    return {
        "sigma_m": sigma_m,
        "radius_95_m": radius_95_m,
        "radius_95_km": radius_95_m / 1000.0,
        "diffusion_variance_m2": diffusion_variance,
        "current_variability_variance_m2": (
            current_variability_variance
        ),
    }


def uncertainty_for_trajectory(
    elapsed_seconds: float,
    speeds_mps: list[float],
) -> dict[str, Any]:
    if not speeds_mps:
        speed = 0.0
    else:
        speed = sum(speeds_mps) / len(speeds_mps)

    result = uncertainty_radius(
        elapsed_seconds=elapsed_seconds,
        characteristic_speed_mps=speed,
    )

    return {
        "elapsed_hours": round(
            elapsed_seconds / 3600.0,
            3,
        ),
        "characteristic_speed_mps": round(
            speed,
            6,
        ),
        **{
            key: round(value, 3)
            for key, value in result.items()
        },
        "parameters": {
            "sigma0_m": DEFAULT_SIGMA0_M,
            "horizontal_diffusivity_m2_s": (
                DEFAULT_HORIZONTAL_DIFFUSIVITY_M2_S
            ),
            "current_variability_gamma": (
                DEFAULT_CURRENT_VARIABILITY_GAMMA
            ),
        },
        "method": (
            "Parametric dispersion model; "
            "not a validated ghost-net error benchmark."
        ),
    }