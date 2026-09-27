from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from .models import (
    ForecastRequest,
    OceanDataUnavailable,
    OceanSample,
    TrajectoryPoint,
    iso_utc,
)
from .ocean_data import OceanDataProvider
from .retention import (
    compute_retention_index,
    compute_retention_index_from_points,
)
from .rk2 import integrate_rk2
from .uncertainty import uncertainty_for_trajectory
from .validation import validate_request


EARTH_RADIUS_M = 6_371_000.0


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _build_current_sampler(
    provider: OceanDataProvider,
):
    def sampler(
        latitude: float,
        longitude: float,
        timestamp: datetime,
    ) -> OceanSample:

        sample = provider.sample(
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp,
        )

        if (
            sample.uo_mps is None
            or sample.vo_mps is None
        ):
            raise OceanDataUnavailable(
                "Ocean current vector is unavailable."
            )

        return sample

    return sampler


def _sample_trajectory_ocean(
    provider: OceanDataProvider,
    trajectory: List[TrajectoryPoint],
) -> List[OceanSample]:

    return [
        provider.sample(
            latitude=point.latitude,
            longitude=point.longitude,
            timestamp=point.timestamp,
        )
        for point in trajectory
    ]


def _milestone(
    trajectory: List[TrajectoryPoint],
    target_hours: int,
) -> Optional[Dict]:

    if not trajectory:
        return None

    first = trajectory[0]

    target_seconds = (
        target_hours * 3600.0
    )

    elapsed_seconds = (
        trajectory[-1].timestamp
        - first.timestamp
    ).total_seconds()

    if elapsed_seconds < target_seconds:
        return None

    best = min(
        trajectory,
        key=lambda point: abs(
            (
                point.timestamp
                - first.timestamp
            ).total_seconds()
            - target_seconds
        ),
    )

    return {
        "hours": target_hours,
        "timestamp": iso_utc(
            best.timestamp
        ),
        "latitude": best.latitude,
        "longitude": best.longitude,
    }


def _source_summary(
    samples: List[OceanSample],
) -> Dict:

    if not samples:
        return {
            "provider": "unknown",
            "requested_timestamps": [],
            "actual_source_timestamps": [],
            "temporal_interpolation": {
                "method": None,
                "interpolated_samples": 0,
                "exact_samples": 0,
                "interpolation_fraction_min": None,
                "interpolation_fraction_max": None,
                "lower_source_timestamps": [],
                "upper_source_timestamps": [],
            },
            "provenance_note": (
                "No ocean samples were available."
            ),
        }

    providers = sorted(
        {
            sample.source
            for sample in samples
            if sample.source
        }
    )

    requested = sorted(
        {
            iso_utc(sample.timestamp)
            for sample in samples
        }
    )

    actual = sorted(
        {
            iso_utc(
                sample.source_timestamp
            )
            for sample in samples
            if sample.source_timestamp
        }
    )

    temporal_methods = sorted(
        {
            str(
                sample.metadata.get(
                    "temporal_interpolation"
                )
            )
            for sample in samples
            if sample.metadata.get(
                "temporal_interpolation"
            )
        }
    )

    interpolation_fractions = [
        float(
            sample.metadata[
                "interpolation_fraction"
            ]
        )
        for sample in samples
        if sample.metadata.get(
            "interpolation_fraction"
        ) is not None
    ]

    lower_times = [
        sample.metadata[
            "lower_source_timestamp"
        ]
        for sample in samples
        if sample.metadata.get(
            "lower_source_timestamp"
        )
    ]

    upper_times = [
        sample.metadata[
            "upper_source_timestamp"
        ]
        for sample in samples
        if sample.metadata.get(
            "upper_source_timestamp"
        )
    ]

    interpolated_samples = sum(
        1
        for sample in samples
        if (
            sample.metadata.get(
                "lower_source_timestamp"
            )
            and sample.metadata.get(
                "upper_source_timestamp"
            )
            and sample.metadata.get(
                "lower_source_timestamp"
            )
            != sample.metadata.get(
                "upper_source_timestamp"
            )
        )
    )

    exact_samples = (
        len(samples)
        - interpolated_samples
    )

    return {
        "provider": (
            providers[0]
            if len(providers) == 1
            else providers
        ),
        "requested_timestamps": requested,
        "actual_source_timestamps": actual,
        "temporal_interpolation": {
            "method": (
                temporal_methods[0]
                if len(temporal_methods) == 1
                else (
                    temporal_methods
                    if temporal_methods
                    else None
                )
            ),
            "interpolated_samples": (
                interpolated_samples
            ),
            "exact_samples": exact_samples,
            "interpolation_fraction_min": (
                min(interpolation_fractions)
                if interpolation_fractions
                else None
            ),
            "interpolation_fraction_max": (
                max(interpolation_fractions)
                if interpolation_fractions
                else None
            ),
            "lower_source_timestamps": sorted(
                set(lower_times)
            ),
            "upper_source_timestamps": sorted(
                set(upper_times)
            ),
        },
        "provenance_note": (
            "Requested simulation timestamps are "
            "distinct from source timestamps. When "
            "temporal interpolation is reported, the "
            "current vector was interpolated from the "
            "listed source interval rather than treated "
            "as a direct observation at the requested "
            "time."
        ),
    }


def _ocean_conditions(
    samples: List[OceanSample],
) -> Dict:

    if not samples:
        return {
            "current_speed_ms": None,
            "uo_ms": None,
            "vo_ms": None,
            "temperature_c": None,
            "salinity_psu": None,
            "sea_surface_height_m": None,
            "mixed_layer_depth_m": None,
            "bottom_temperature_c": None,
        }

    first = samples[0]

    return {
        "current_speed_ms": (
            first.current_speed_ms
        ),
        "uo_ms": first.uo,
        "vo_ms": first.vo,
        "temperature_c": first.thetao,
        "salinity_psu": first.so,
        "sea_surface_height_m": first.zos,
        "mixed_layer_depth_m": (
            first.mlotst
        ),
        "bottom_temperature_c": (
            first.bottomT
        ),
    }


def _current_vectors(
    trajectory: List[TrajectoryPoint],
    samples: List[OceanSample],
    maximum: int = 120,
) -> List[Dict]:

    if not trajectory or not samples:
        return []

    usable = min(
        len(trajectory),
        len(samples),
    )

    step = max(
        1,
        usable // maximum,
    )

    vectors = []

    for index in range(
        0,
        usable,
        step,
    ):
        point = trajectory[index]
        sample = samples[index]

        vectors.append(
            {
                "timestamp": iso_utc(
                    point.timestamp
                ),
                "latitude": point.latitude,
                "longitude": point.longitude,
                "uo_ms": sample.uo,
                "vo_ms": sample.vo,
                "source_timestamp": (
                    iso_utc(
                        sample.source_timestamp
                    )
                    if sample.source_timestamp
                    else None
                ),
            }
        )

    return vectors


def _trajectory_uncertainty(
    trajectory: List[TrajectoryPoint],
) -> List[Dict]:

    if not trajectory:
        return []

    result = []

    start_time = trajectory[0].timestamp

    for index, point in enumerate(
        trajectory
    ):

        elapsed_seconds = (
            point.timestamp
            - start_time
        ).total_seconds()

        speeds = []

        for previous in trajectory[
            : index + 1
        ]:
            if (
                previous.uo is not None
                and previous.vo is not None
            ):
                speeds.append(
                    (
                        previous.uo ** 2
                        + previous.vo ** 2
                    ) ** 0.5
                )

        uncertainty = (
            uncertainty_for_trajectory(
                elapsed_seconds=(
                    elapsed_seconds
                ),
                speeds_mps=speeds,
            )
        )

        result.append(
            {
                "timestamp": iso_utc(
                    point.timestamp
                ),
                "radius_m": uncertainty[
                    "radius_95_m"
                ],
                "radius_95_m": uncertainty[
                    "radius_95_m"
                ],
                "radius_95_km": uncertainty[
                    "radius_95_km"
                ],
                "sigma_m": uncertainty[
                    "sigma_m"
                ],
                "diffusion_variance_m2": (
                    uncertainty[
                        "diffusion_variance_m2"
                    ]
                ),
                "current_variability_variance_m2": (
                    uncertainty[
                        "current_variability_variance_m2"
                    ]
                ),
                "characteristic_speed_mps": (
                    uncertainty[
                        "characteristic_speed_mps"
                    ]
                ),
                "parameters": uncertainty[
                    "parameters"
                ],
                "method": uncertainty[
                    "method"
                ],
            }
        )

    return result


def _degrees_to_offset_m(
    latitude: float,
    offset_degrees: float,
) -> tuple[float, float]:
    """
    Convert a latitude/longitude degree offset into
    approximate physical distances in metres.

    Returns:
        (latitude_offset_m, longitude_offset_m)
    """

    latitude_offset_m = (
        EARTH_RADIUS_M
        * math.radians(
            offset_degrees
        )
    )

    longitude_offset_m = (
        EARTH_RADIUS_M
        * math.cos(
            math.radians(latitude)
        )
        * math.radians(
            offset_degrees
        )
    )

    return (
        latitude_offset_m,
        longitude_offset_m,
    )


def _retention_diagnostics(
    provider: OceanDataProvider,
    center: OceanSample,
    request: ForecastRequest,
) -> dict:
    """Build transparent retention diagnostics without network fan-out.

    A complete cardinal stencil is attempted first. If coastal/land masking
    prevents one or more cardinal samples, a local least-squares gradient is
    estimated from valid nearby ocean points already present in the prepared
    Copernicus subset. This avoids inventing land-side currents and avoids
    making new network requests.
    """

    requested_offset = float(request.grid_margin_degrees)
    candidate_offsets = [
        requested_offset,
        requested_offset * 0.75,
        requested_offset * 0.50,
        requested_offset * 0.25,
        1.0,
        0.75,
        0.5,
        0.3333333333,
        0.25,
        0.1666666667,
        0.1,
        0.0833333333,
    ]

    unique_offsets: list[float] = []
    for value in candidate_offsets:
        value = float(value)
        if value <= 0:
            continue
        if not any(abs(value - existing) < 1e-9 for existing in unique_offsets):
            unique_offsets.append(value)

    attempts: list[dict] = []

    for offset_degrees in unique_offsets:
        try:
            latitude = center.latitude
            longitude = center.longitude
            timestamp = center.timestamp

            east = provider.sample(
                latitude=latitude,
                longitude=longitude + offset_degrees,
                timestamp=timestamp,
            )
            west = provider.sample(
                latitude=latitude,
                longitude=longitude - offset_degrees,
                timestamp=timestamp,
            )
            north = provider.sample(
                latitude=latitude + offset_degrees,
                longitude=longitude,
                timestamp=timestamp,
            )
            south = provider.sample(
                latitude=latitude - offset_degrees,
                longitude=longitude,
                timestamp=timestamp,
            )

            stencil = {
                "center": center,
                "east": east,
                "west": west,
                "north": north,
                "south": south,
            }

            invalid_points = []
            for name, sample in stencil.items():
                if sample.uo_mps is None or sample.vo_mps is None:
                    invalid_points.append(f"{name}: missing uo/vo")
                    continue
                if not (
                    math.isfinite(float(sample.uo_mps))
                    and math.isfinite(float(sample.vo_mps))
                ):
                    invalid_points.append(f"{name}: non-finite uo/vo")

            if invalid_points:
                raise ValueError("; ".join(invalid_points))

            latitude_offset_m, _ = _degrees_to_offset_m(
                latitude=latitude,
                offset_degrees=offset_degrees,
            )
            retention = compute_retention_index(
                center=center,
                east=east,
                west=west,
                north=north,
                south=south,
                offset_m=latitude_offset_m,
            )

            stencil_payload = {
                name: {
                    "latitude": sample.latitude,
                    "longitude": sample.longitude,
                    "uo_ms": sample.uo_mps,
                    "vo_ms": sample.vo_mps,
                    "source_timestamp": (
                        sample.source_timestamp.isoformat()
                        if sample.source_timestamp
                        else None
                    ),
                }
                for name, sample in stencil.items()
            }

            return {
                **retention,
                "requested_spatial_offset_degrees": requested_offset,
                "spatial_offset_degrees": offset_degrees,
                "spatial_offset_m": latitude_offset_m,
                "stencil": stencil_payload,
                "stencil_source_timestamps": {
                    name: (
                        sample.source_timestamp.isoformat()
                        if sample.source_timestamp
                        else None
                    )
                    for name, sample in stencil.items()
                },
                "attempts": attempts,
            }

        except Exception as exc:
            attempts.append({
                "offset_degrees": offset_degrees,
                "status": "failed",
                "error": str(exc),
            })

    # Coastal/land-masked fallback. Sample a small 2-D cloud from the
    # prepared subset. These calls remain local NetCDF interpolation calls.
    search_offsets = [
        0.0833333333,
        0.1666666667,
        0.25,
        0.3333333333,
        0.5,
        0.75,
        1.0,
        min(1.5, requested_offset),
        requested_offset,
    ]
    directions = [
        (-1.0, -1.0), (-1.0, 0.0), (-1.0, 1.0),
        (0.0, -1.0),                    (0.0, 1.0),
        (1.0, -1.0),  (1.0, 0.0),  (1.0, 1.0),
    ]

    points = []
    seen = set()
    for offset in search_offsets:
        if offset <= 0:
            continue
        for dy, dx in directions:
            lat = center.latitude + dy * offset
            lon = center.longitude + dx * offset
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                continue
            key = (round(lat, 7), round(lon, 7))
            if key in seen:
                continue
            seen.add(key)
            try:
                sample = provider.sample(
                    latitude=lat,
                    longitude=lon,
                    timestamp=center.timestamp,
                )
                if (
                    sample.uo_mps is not None
                    and sample.vo_mps is not None
                    and math.isfinite(float(sample.uo_mps))
                    and math.isfinite(float(sample.vo_mps))
                ):
                    points.append({
                        "latitude": sample.latitude,
                        "longitude": sample.longitude,
                        "uo_mps": sample.uo_mps,
                        "vo_mps": sample.vo_mps,
                        "source_timestamp": (
                            sample.source_timestamp.isoformat()
                            if sample.source_timestamp
                            else None
                        ),
                    })
            except Exception:
                continue

    retention = compute_retention_index_from_points(
        center=center,
        neighbors=points,
    )

    if retention.get("status") == "scored":
        return {
            **retention,
            "requested_spatial_offset_degrees": requested_offset,
            "spatial_offset_degrees": None,
            "spatial_offset_m": None,
            "stencil": None,
            "stencil_source_timestamps": sorted({
                item["source_timestamp"]
                for item in points
                if item.get("source_timestamp")
            }),
            "neighbor_count": len(points),
            "attempts": attempts,
        }

    return {
        **retention,
        "requested_spatial_offset_degrees": requested_offset,
        "spatial_offset_degrees": None,
        "spatial_offset_m": None,
        "stencil": None,
        "stencil_source_timestamps": sorted({
            item["source_timestamp"]
            for item in points
            if item.get("source_timestamp")
        }),
        "neighbor_count": len(points),
        "attempts": attempts,
        "error": (
            "No complete cardinal stencil was available; the "
            "land-mask-aware local gradient fallback was also "
            "unable to produce a valid retention diagnostic."
        ),
        "reason": retention.get(
            "reason",
            "Insufficient valid nearby ocean-current samples.",
        ),
    }


def forecast_drift(
    request: ForecastRequest,
) -> Dict:

    validate_request(request)

    provider = OceanDataProvider(
        source=request.source
    )

    start_time = (
        request.start_time
        if request.start_time
        else _utc_now()
    )

    if start_time.tzinfo is None:
        start_time = start_time.replace(
            tzinfo=timezone.utc
        )

    start_time = start_time.astimezone(
        timezone.utc
    )

    forecast_end_time = (
        start_time
        + timedelta(
            hours=request.horizon_hours
        )
    )

    # Prefetch one Copernicus spatial-temporal window before RK2.
    # Subsequent RK2 evaluations and retention-stencil samples are
    # interpolated from local NetCDF data rather than making network calls.
    provider.prepare_forecast(
        latitude=request.latitude,
        longitude=request.longitude,
        start_time=start_time,
        end_time=forecast_end_time,
        spatial_margin_degrees=request.grid_margin_degrees,
    )

    sampler = _build_current_sampler(
        provider
    )

    trajectory = integrate_rk2(
        start_latitude=request.latitude,
        start_longitude=request.longitude,
        start_time=start_time,
        horizon_hours=request.horizon_hours,
        timestep_minutes=request.timestep_minutes,
        velocity_fn=sampler,
    )

    samples = _sample_trajectory_ocean(
        provider,
        trajectory,
    )

    for point, sample in zip(
        trajectory,
        samples,
    ):
        point.uo_mps = sample.uo_mps
        point.vo_mps = sample.vo_mps
        point.speed_mps = sample.current_speed_ms
        point.ocean_source_timestamp = (
            sample.source_timestamp
        )

    milestones = [
        item
        for item in (
            _milestone(
                trajectory,
                24,
            ),
            _milestone(
                trajectory,
                48,
            ),
            _milestone(
                trajectory,
                72,
            ),
        )
        if item is not None
    ]

    retention = _retention_diagnostics(
        provider=provider,
        center=samples[0],
        request=request,
    )

    source_summary = _source_summary(
        samples
    )

    requested_times = sorted(
        {
            iso_utc(
                sample.timestamp
            )
            for sample in samples
        }
    )

    actual_times = sorted(
        {
            iso_utc(
                sample.source_timestamp
            )
            for sample in samples
            if sample.source_timestamp
        }
    )

    warnings = []

    temporal_info = source_summary.get(
        "temporal_interpolation",
        {},
    )

    if temporal_info.get(
        "interpolated_samples",
        0,
    ) > 0:

        warnings.append(
            "Ocean-current vectors were temporally "
            "interpolated in u/v space for forecast "
            "timestamps between available source times. "
            "Source timestamps and interpolation metadata "
            "are retained for provenance."
        )

    elif actual_times != requested_times:

        warnings.append(
            "Some forecast steps use a source timestamp "
            "different from the requested simulation "
            "timestamp. Actual source timestamps are "
            "retained for provenance."
        )

    if retention.get(
        "status"
    ) != "scored":

        warnings.append(
            "Retention index is currently unscored because "
            "required ocean variables or explicitly "
            "configured retention weights are unavailable."
        )

    elif (
        retention.get(
            "spatial_offset_degrees"
        ) is not None
        and retention.get(
            "requested_spatial_offset_degrees"
        ) is not None
        and retention[
            "spatial_offset_degrees"
        ]
        < retention[
            "requested_spatial_offset_degrees"
        ]
    ):

        warnings.append(
            "Retention diagnostics used a smaller valid "
            "ocean-current spatial stencil than requested "
            "because the larger stencil was unavailable."
        )

    warnings.append(
        "ML residual correction is disabled because "
        "there is insufficient validated trajectory data."
    )

    return {
        "status": "success",

        "model": {
            "primary": "RK2 Physics",
            "version": "rk2-v1",
            "ml_residual": {
                "status": "DISABLED",
                "reason": (
                    "Insufficient validated "
                    "trajectory data."
                ),
            },
        },

        "request": {
            "latitude": request.latitude,
            "longitude": request.longitude,
            "horizon_hours": (
                request.horizon_hours
            ),
            "timestep_minutes": (
                request.timestep_minutes
            ),
            "requested_start_time": iso_utc(
                start_time
            ),
        },

        "trajectory": [
            point.as_dict()
            for point in trajectory
        ],

        "milestones": milestones,

        "uncertainty": (
            _trajectory_uncertainty(
                trajectory
            )
        ),

        "current_vectors": (
            _current_vectors(
                trajectory,
                samples,
            )
        ),

        "retention": retention,

        "ocean_conditions": (
            _ocean_conditions(
                samples
            )
        ),

        "data_sources": {
            **source_summary,
            "requested_start_time": iso_utc(
                start_time
            ),
        },

        "ml_status": {
            "status": "DISABLED",
            "reason": (
                "Insufficient validated "
                "trajectory data."
            ),
        },

        "warnings": warnings,
    }