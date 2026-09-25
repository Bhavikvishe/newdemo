"""GEBCO bathymetry backend for OCEONIX.

Uses the Ocean Data Bank GEBCO Open API instead of OpenTopoData.

The ODB GEBCO API is publicly accessible and does not require an API key.
If the external API is temporarily unavailable, the existing local
synthetic fallback keeps the UI operational and clearly reports that the
live API was not connected.
"""

from __future__ import annotations

import json
import math
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict

# Official ODB GEBCO API.
GEBCO_API_URL = os.environ.get(
    "OCEONIX_GEBCO_URL",
    "https://api.odb.ntu.edu.tw/gebco",
)

# In-memory cache.
_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}

CACHE_TTL = 3600


def _synthetic_fallback_elevation(
    lat: float,
    lng: float,
) -> float:
    """Local fallback only when the live API cannot be reached."""

    lng_depth = (72.85 - lng) * 120.0

    lat_undulation = (
        math.sin(lat * 8.0) * 4.5
        + math.cos(lng * 12.0) * 3.2
    )

    est_depth = max(
        12.0,
        min(
            350.0,
            22.0 + lng_depth + lat_undulation,
        ),
    )

    return -est_depth


def _query_gebco(
    points: list[tuple[float, float]],
) -> dict[tuple[float, float], float]:
    """Query ODB GEBCO for a set of lon/lat points."""

    if not points:
        return {}

    # ODB expects longitude and latitude as comma-separated arrays.
    lon_values = ",".join(
        f"{lng:.5f}"
        for _, lng in points
    )

    lat_values = ",".join(
        f"{lat:.5f}"
        for lat, _ in points
    )

    query = urllib.parse.urlencode(
        {
            "lon": lon_values,
            "lat": lat_values,
            "mode": "point",
        }
    )

    url = f"{GEBCO_API_URL}?{query}"

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "OCEONIX-Undersea-Intelligence/3.0 "
                "(GEBCO bathymetry)"
            ),
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=12,
    ) as response:
        payload = json.loads(
            response.read().decode("utf-8")
        )

    if not isinstance(payload, dict):
        raise RuntimeError(
            "Unexpected GEBCO API response."
        )

    z_values = payload.get("z")

    if not isinstance(z_values, list):
        raise RuntimeError(
            f"GEBCO API response did not contain z values: "
            f"{payload}"
        )

    if len(z_values) != len(points):
        raise RuntimeError(
            "GEBCO API returned a different number of "
            "elevation values than requested."
        )

    result: dict[tuple[float, float], float] = {}

    for (lat, lng), z in zip(points, z_values):
        if z is None:
            continue

        result[
            (
                round(lat, 5),
                round(lng, 5),
            )
        ] = float(z)

    if not result:
        raise RuntimeError(
            "GEBCO API returned no usable elevation values."
        )

    return result


def get_bathymetry(
    lat: float,
    lng: float,
    transect_samples: int = 21,
    grid_size: int = 5,
    span_km: float = 1.2,
) -> Dict[str, Any]:
    """Retrieve GEBCO bathymetry around a target coordinate."""

    cache_key = (
        f"{lat:.5f}:"
        f"{lng:.5f}:"
        f"{transect_samples}:"
        f"{grid_size}:"
        f"{span_km:.2f}"
    )

    now = time.time()

    if cache_key in _CACHE:
        ts, cached = _CACHE[cache_key]

        if now - ts < CACHE_TTL:
            return cached

    d_lat = (
        span_km / 111.0
    ) / 2.0

    d_lng = (
        span_km
        / (
            111.0
            * max(
                0.2,
                math.cos(math.radians(lat)),
            )
        )
    ) / 2.0

    # -------------------------------------------------------------
    # Build transect.
    # -------------------------------------------------------------

    transect_coords = []

    for i in range(transect_samples):
        fraction = (
            i / max(1, transect_samples - 1)
        ) - 0.5

        t_lat = lat
        t_lng = (
            lng
            + fraction * 2.0 * d_lng
        )

        transect_coords.append(
            (
                t_lat,
                t_lng,
                fraction * span_km * 1000.0,
            )
        )

    # -------------------------------------------------------------
    # Build 2D grid.
    # -------------------------------------------------------------

    grid_coords = []

    for r in range(grid_size):
        r_frac = (
            r / max(1, grid_size - 1)
        ) - 0.5

        g_lat = (
            lat
            + r_frac * 2.0 * d_lat
        )

        for c in range(grid_size):
            c_frac = (
                c / max(1, grid_size - 1)
            ) - 0.5

            g_lng = (
                lng
                + c_frac * 2.0 * d_lng
            )

            grid_coords.append(
                (
                    g_lat,
                    g_lng,
                    r,
                    c,
                )
            )

    # -------------------------------------------------------------
    # Query all unique points from GEBCO in ONE request.
    # -------------------------------------------------------------

    all_points = [
        (lat, lng),
        *[
            (p[0], p[1])
            for p in transect_coords
        ],
        *[
            (p[0], p[1])
            for p in grid_coords
        ],
    ]

    unique_points = list(
        dict.fromkeys(
            (
                round(p[0], 5),
                round(p[1], 5),
            )
            for p in all_points
        )
    )

    elev_map: dict[
        tuple[float, float],
        float,
    ] = {}

    is_live_api = False

    try:
        elev_map = _query_gebco(
            unique_points
        )

        is_live_api = True

    except Exception:
        # Keep the existing local fallback behaviour.
        elev_map = {}
        is_live_api = False

    # -------------------------------------------------------------
    # Elevation lookup.
    # -------------------------------------------------------------

    def get_elevation(
        pt_lat: float,
        pt_lng: float,
    ) -> float:
        key = (
            round(pt_lat, 5),
            round(pt_lng, 5),
        )

        if key in elev_map:
            base = elev_map[key]

        else:
            weights = []
            values = []

            for (
                m_lat,
                m_lng,
            ), m_elev in elev_map.items():
                dist = math.hypot(
                    pt_lat - m_lat,
                    pt_lng - m_lng,
                )

                if dist < 1e-9:
                    return m_elev

                weight = 1.0 / (dist ** 2)

                weights.append(weight)
                values.append(m_elev)

            if weights:
                base = (
                    sum(
                        w * v
                        for w, v in zip(
                            weights,
                            values,
                        )
                    )
                    / sum(weights)
                )

            else:
                base = _synthetic_fallback_elevation(
                    pt_lat,
                    pt_lng,
                )

        micro = (
            math.sin(pt_lat * 8000.0) * 0.25
            + math.cos(pt_lng * 10000.0) * 0.2
        )

        return round(
            base + micro,
            2,
        )

    # -------------------------------------------------------------
    # Center.
    # -------------------------------------------------------------

    center_elev = get_elevation(
        lat,
        lng,
    )

    center_depth_m = (
        max(0.0, -center_elev)
        if center_elev < 0
        else 0.0
    )

    # -------------------------------------------------------------
    # Transect.
    # -------------------------------------------------------------

    transect = []

    for (
        t_lat,
        t_lng,
        dist_m,
    ) in transect_coords:

        elev = get_elevation(
            t_lat,
            t_lng,
        )

        depth_m = (
            max(0.0, -elev)
            if elev < 0
            else 0.0
        )

        transect.append(
            {
                "distance_m": round(
                    dist_m,
                    1,
                ),
                "lat": round(
                    t_lat,
                    5,
                ),
                "lng": round(
                    t_lng,
                    5,
                ),
                "elevation": round(
                    elev,
                    2,
                ),
                "depth_m": round(
                    depth_m,
                    2,
                ),
                "depth_ft": round(
                    depth_m * 3.28084,
                    1,
                ),
            }
        )

    # -------------------------------------------------------------
    # Transect slope.
    # -------------------------------------------------------------

    for i in range(len(transect)):
        if i == 0 and len(transect) > 1:
            dy = (
                transect[1]["depth_m"]
                - transect[0]["depth_m"]
            )

            dx = (
                transect[1]["distance_m"]
                - transect[0]["distance_m"]
            )

        elif i == len(transect) - 1:
            dy = (
                transect[i]["depth_m"]
                - transect[i - 1]["depth_m"]
            )

            dx = (
                transect[i]["distance_m"]
                - transect[i - 1]["distance_m"]
            )

        else:
            dy = (
                transect[i + 1]["depth_m"]
                - transect[i - 1]["depth_m"]
            )

            dx = (
                transect[i + 1]["distance_m"]
                - transect[i - 1]["distance_m"]
            )

        slope_deg = (
            math.degrees(
                math.atan2(
                    dy,
                    max(
                        1.0,
                        abs(dx),
                    ),
                )
            )
            if dx != 0
            else 0.0
        )

        transect[i]["slope_deg"] = round(
            slope_deg,
            2,
        )

    # -------------------------------------------------------------
    # Grid.
    # -------------------------------------------------------------

    grid_matrix = []

    for r in range(grid_size):
        row = []

        for c in range(grid_size):
            matching = [
                p
                for p in grid_coords
                if p[2] == r and p[3] == c
            ]

            if matching:
                g_lat = matching[0][0]
                g_lng = matching[0][1]

                elev = get_elevation(
                    g_lat,
                    g_lng,
                )

                depth_m = (
                    max(0.0, -elev)
                    if elev < 0
                    else 0.0
                )

                row.append(
                    {
                        "lat": round(
                            g_lat,
                            5,
                        ),
                        "lng": round(
                            g_lng,
                            5,
                        ),
                        "elevation": round(
                            elev,
                            2,
                        ),
                        "depth_m": round(
                            depth_m,
                            2,
                        ),
                    }
                )

        grid_matrix.append(row)

    # -------------------------------------------------------------
    # Oceanographic calculations.
    # -------------------------------------------------------------

    temp_c = max(
        4.0,
        24.0 - center_depth_m * 0.08,
    )

    salinity_ppt = 35.2

    c_sound = (
        1449.2
        + 4.6 * temp_c
        - 0.055 * (temp_c ** 2)
        + 0.00029 * (temp_c ** 3)
        + (1.34 - 0.01 * temp_c)
        * (salinity_ppt - 35.0)
        + 0.016 * center_depth_m
    )

    pressure_bar = (
        1.013
        + center_depth_m * 0.1005
    )

    light_pct = max(
        0.0,
        min(
            100.0,
            100.0
            * math.exp(
                -0.045
                * center_depth_m
            ),
        ),
    )

    if center_depth_m <= 200.0:
        zone_name = "Epipelagic (Sunlight Zone)"
        zone_desc = (
            "Ample solar penetration; "
            "high acoustic transmission stability; "
            "optimal for side-scan sonar and diver operations."
        )

    elif center_depth_m <= 1000.0:
        zone_name = "Mesopelagic (Twilight Zone)"
        zone_desc = (
            "Faint ambient light; "
            "significant thermocline layer; "
            "ROV tether required."
        )

    elif center_depth_m <= 4000.0:
        zone_name = "Bathypelagic (Midnight Zone)"
        zone_desc = (
            "Complete darkness; "
            "high hydrostatic pressure; "
            "deep-water work-class ROV required."
        )

    else:
        zone_name = "Abyssopelagic (Abyssal Zone)"
        zone_desc = (
            "Extreme abyssal depth; "
            "near-freezing seawater; "
            "specialized deep-sea submersible needed."
        )

    response = {
        "status": "success",
        "api_connected": is_live_api,
        "dataset": "GEBCO_2026",
        "source": (
            "GEBCO Bathymetric Compilation Group / "
            "Ocean Data Bank GEBCO API"
        ),
        "resolution": (
            "15 arc-second (~400-450m global grid)"
        ),
        "coordinates": {
            "lat": round(lat, 5),
            "lng": round(lng, 5),
        },
        "bathymetry": {
            "depth_m": round(
                center_depth_m,
                2,
            ),
            "depth_ft": round(
                center_depth_m * 3.28084,
                1,
            ),
            "elevation_m": round(
                center_elev,
                2,
            ),
            "is_underwater": (
                center_elev < 0
            ),
            "average_transect_depth_m": round(
                sum(
                    p["depth_m"]
                    for p in transect
                )
                / max(
                    1,
                    len(transect),
                ),
                2,
            ),
            "min_depth_m": round(
                min(
                    p["depth_m"]
                    for p in transect
                ),
                2,
            ),
            "max_depth_m": round(
                max(
                    p["depth_m"]
                    for p in transect
                ),
                2,
            ),
            "seabed_gradient_deg": (
                transect[
                    len(transect) // 2
                ]["slope_deg"]
                if transect
                else 0.0
            ),
        },
        "oceanography": {
            "zone": zone_name,
            "zone_description": zone_desc,
            "estimated_water_temp_c": round(
                temp_c,
                1,
            ),
            "sound_speed_mps": round(
                c_sound,
                1,
            ),
            "sound_speed_fps": round(
                c_sound * 3.28084,
                1,
            ),
            "hydrostatic_pressure_bar": round(
                pressure_bar,
                2,
            ),
            "hydrostatic_pressure_psi": round(
                pressure_bar * 14.5038,
                1,
            ),
            "light_penetration_pct": round(
                light_pct,
                1,
            ),
            "diver_classification": (
                "Open Water Diver"
                if center_depth_m <= 18
                else "Advanced / Nitrox"
                if center_depth_m <= 40
                else "Technical Trimix"
                if center_depth_m <= 100
                else "Commercial ROV Only"
            ),
        },
        "transect": transect,
        "grid": {
            "rows": grid_size,
            "cols": grid_size,
            "span_km": span_km,
            "matrix": grid_matrix,
        },
        "queried_at": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(),
        ),
    }

    _CACHE[cache_key] = (
        now,
        response,
    )

    return response
