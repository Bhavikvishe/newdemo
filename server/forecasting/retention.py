"""Transparent retention / hotspot diagnostics.

Retention diagnostics are deliberately conservative. A numerical score is
reported only when the required ocean-current diagnostics and explicit
retention weights are available. Coastal/land-masked locations may not have
a complete cardinal five-point stencil, so this module also supports a
least-squares gradient estimate from a set of valid nearby ocean samples.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

import numpy as np

from .models import OceanSample
from .validation import load_retention_weights


def _safe_gradient(plus, minus, distance_m):
    if plus is None or minus is None or distance_m <= 0:
        return None
    return (plus - minus) / (2.0 * distance_m)


def _normalise_positive(value, scale):
    if value is None or scale <= 0:
        return None
    return max(0.0, min(1.0, value / scale))


def _build_result(
    *,
    convergence: float | None,
    vorticity: float | None,
    mixed_layer_depth_m: float | None,
    raw_diagnostics: dict[str, Any],
    method: str,
) -> dict[str, Any]:
    convergence_component = _normalise_positive(
        convergence,
        1e-5,
    )
    vorticity_component = _normalise_positive(
        abs(vorticity) if vorticity is not None else None,
        1e-5,
    )

    mld_component = None
    if mixed_layer_depth_m is not None:
        mld_component = max(
            0.0,
            min(1.0, mixed_layer_depth_m / 100.0),
        )

    components = {
        "convergence": convergence_component,
        "vorticity": vorticity_component,
        "mixed_layer_depth": mld_component,
    }

    weights = load_retention_weights()
    missing_components = [
        name
        for name, value in components.items()
        if value is None
    ]

    if weights is None or missing_components:
        return {
            "status": "unscored",
            "index": None,
            "components": components,
            "weights": weights,
            "missing_components": missing_components,
            "raw_diagnostics": raw_diagnostics,
            "method": method,
            "reason": (
                "Required ocean variables or explicitly configured "
                "retention weights are unavailable."
            ),
        }

    index = 100.0 * (
        weights["convergence"] * components["convergence"]
        + weights["vorticity"] * components["vorticity"]
        + weights["mixed_layer_depth"] * components["mixed_layer_depth"]
    )

    return {
        "status": "scored",
        "index": round(float(max(0.0, min(100.0, index))), 3),
        "components": components,
        "weights": weights,
        "missing_components": [],
        "raw_diagnostics": raw_diagnostics,
        "method": method,
    }


def compute_retention_index(
    center: OceanSample,
    east: OceanSample,
    west: OceanSample,
    north: OceanSample,
    south: OceanSample,
    offset_m: float,
) -> dict[str, Any]:
    """Compute the original cardinal finite-difference diagnostic."""

    du_dx = _safe_gradient(
        east.uo_mps,
        west.uo_mps,
        offset_m * 2.0,
    )
    dv_dx = _safe_gradient(
        east.vo_mps,
        west.vo_mps,
        offset_m * 2.0,
    )
    du_dy = _safe_gradient(
        north.uo_mps,
        south.uo_mps,
        offset_m * 2.0,
    )
    dv_dy = _safe_gradient(
        north.vo_mps,
        south.vo_mps,
        offset_m * 2.0,
    )

    if any(
        value is None
        for value in (du_dx, dv_dx, du_dy, dv_dy)
    ):
        return {
            "status": "unscored",
            "index": None,
            "components": None,
            "weights": load_retention_weights(),
            "missing_components": [
                "current_gradient"
            ],
            "raw_diagnostics": {},
            "method": "cardinal_finite_difference",
            "reason": (
                "Insufficient ocean-current samples for "
                "a complete cardinal finite-difference stencil."
            ),
        }

    divergence = du_dx + dv_dy
    convergence = -divergence
    vorticity = dv_dx - du_dy

    return _build_result(
        convergence=convergence,
        vorticity=vorticity,
        mixed_layer_depth_m=center.mixed_layer_depth_m,
        raw_diagnostics={
            "du_dx_s^-1": du_dx,
            "dv_dx_s^-1": dv_dx,
            "du_dy_s^-1": du_dy,
            "dv_dy_s^-1": dv_dy,
            "divergence_s^-1": divergence,
            "convergence_s^-1": convergence,
            "vorticity_s^-1": vorticity,
        },
        method="cardinal_finite_difference",
    )


def compute_retention_index_from_points(
    *,
    center: OceanSample,
    neighbors: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Estimate local velocity gradients from valid nearby ocean points.

    Each neighbor must contain ``latitude``, ``longitude``, ``uo_mps`` and
    ``vo_mps``. The gradients are estimated by least squares in metres. This
    fallback is intended for coastal/land-masked locations where a cardinal
    east/west/north/south stencil cannot be completed.
    """

    rows: list[list[float]] = []
    du_values: list[float] = []
    dv_values: list[float] = []

    lat0 = float(center.latitude)
    lon0 = float(center.longitude)
    lat_scale = 111_320.0
    lon_scale = 111_320.0 * max(
        np.cos(np.deg2rad(lat0)),
        1e-6,
    )

    for point in neighbors:
        try:
            lat = float(point["latitude"])
            lon = float(point["longitude"])
            u = float(point["uo_mps"])
            v = float(point["vo_mps"])
        except (KeyError, TypeError, ValueError):
            continue

        if not all(np.isfinite(value) for value in (lat, lon, u, v)):
            continue

        dx = (lon - lon0) * lon_scale
        dy = (lat - lat0) * lat_scale

        if np.hypot(dx, dy) < 1.0:
            continue

        rows.append([dx, dy])
        du_values.append(u - float(center.uo_mps))
        dv_values.append(v - float(center.vo_mps))

    if len(rows) < 3:
        return {
            "status": "unscored",
            "index": None,
            "components": None,
            "weights": load_retention_weights(),
            "missing_components": ["current_gradient"],
            "raw_diagnostics": {
                "valid_neighbor_count": len(rows),
            },
            "method": "least_squares_local_gradient",
            "reason": (
                "Insufficient valid nearby ocean-current samples "
                "for a two-dimensional gradient estimate."
            ),
        }

    A = np.asarray(rows, dtype=float)
    if np.linalg.matrix_rank(A) < 2:
        return {
            "status": "unscored",
            "index": None,
            "components": None,
            "weights": load_retention_weights(),
            "missing_components": ["spatial_gradient_rank"],
            "raw_diagnostics": {
                "valid_neighbor_count": len(rows),
            },
            "method": "least_squares_local_gradient",
            "reason": (
                "Nearby valid ocean samples do not span two spatial "
                "dimensions sufficiently for a gradient estimate."
            ),
        }

    du_dx, du_dy = np.linalg.lstsq(
        A,
        np.asarray(du_values, dtype=float),
        rcond=None,
    )[0]
    dv_dx, dv_dy = np.linalg.lstsq(
        A,
        np.asarray(dv_values, dtype=float),
        rcond=None,
    )[0]

    divergence = float(du_dx + dv_dy)
    convergence = -divergence
    vorticity = float(dv_dx - du_dy)

    return _build_result(
        convergence=convergence,
        vorticity=vorticity,
        mixed_layer_depth_m=center.mixed_layer_depth_m,
        raw_diagnostics={
            "du_dx_s^-1": float(du_dx),
            "dv_dx_s^-1": float(dv_dx),
            "du_dy_s^-1": float(du_dy),
            "dv_dy_s^-1": float(dv_dy),
            "divergence_s^-1": divergence,
            "convergence_s^-1": convergence,
            "vorticity_s^-1": vorticity,
            "valid_neighbor_count": len(rows),
        },
        method="least_squares_local_gradient",
    )
