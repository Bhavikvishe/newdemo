from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def iso_utc(value: datetime | str) -> str:
    if isinstance(value, str):
        return value

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).isoformat().replace(
        "+00:00",
        "Z",
    )


@dataclass
class ForecastRequest:
    latitude: float
    longitude: float

    horizon_hours: int = 72
    timestep_minutes: int = 60

    source: str = "auto"

    start_time: Optional[datetime] = None

    grid_margin_degrees: float = 2.0
    vector_grid_size: int = 5


@dataclass(init=False)
class OceanSample:
    """
    Ocean-model sample at a single geographic/time coordinate.

    Supports both:
        uo / vo
    and:
        uo_mps / vo_mps

    This keeps the data-source and RK2 interfaces compatible.
    """

    latitude: float
    longitude: float
    timestamp: datetime

    uo_mps: Optional[float]
    vo_mps: Optional[float]

    thetao: Optional[float]
    so: Optional[float]
    zos: Optional[float]
    mlotst: Optional[float]
    bottomT: Optional[float]

    source: str

    source_timestamp: Optional[
        datetime | str
    ]

    metadata: Dict[str, Any]

    def __init__(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
        uo_mps: Optional[float] = None,
        vo_mps: Optional[float] = None,
        thetao: Optional[float] = None,
        so: Optional[float] = None,
        zos: Optional[float] = None,
        mlotst: Optional[float] = None,
        bottomT: Optional[float] = None,
        source: str = "unknown",
        source_timestamp: Optional[
            datetime | str
        ] = None,
        metadata: Optional[
            Dict[str, Any]
        ] = None,
        *,
        uo: Optional[float] = None,
        vo: Optional[float] = None,
    ):
        self.latitude = latitude
        self.longitude = longitude
        self.timestamp = timestamp

        # Accept either naming convention.
        if uo_mps is None:
            uo_mps = uo

        if vo_mps is None:
            vo_mps = vo

        self.uo_mps = uo_mps
        self.vo_mps = vo_mps

        self.thetao = thetao
        self.so = so
        self.zos = zos
        self.mlotst = mlotst
        self.bottomT = bottomT

        self.source = source
        self.source_timestamp = source_timestamp

        self.metadata = (
            metadata
            if metadata is not None
            else {}
        )

    @property
    def uo(self) -> Optional[float]:
        return self.uo_mps

    @property
    def vo(self) -> Optional[float]:
        return self.vo_mps

    @property
    def mixed_layer_depth_m(
        self,
    ) -> Optional[float]:
        return self.mlotst

    @property
    def current_speed_ms(
        self,
    ) -> Optional[float]:
        if (
            self.uo_mps is None
            or self.vo_mps is None
        ):
            return None

        return (
            self.uo_mps ** 2
            + self.vo_mps ** 2
        ) ** 0.5


@dataclass
class TrajectoryPoint:
    timestamp: datetime
    latitude: float
    longitude: float

    uo_mps: Optional[float] = None
    vo_mps: Optional[float] = None
    speed_mps: Optional[float] = None

    ocean_source_timestamp: Optional[
        datetime | str
    ] = None

    @property
    def uo(self) -> Optional[float]:
        return self.uo_mps

    @property
    def vo(self) -> Optional[float]:
        return self.vo_mps

    def as_dict(self) -> Dict[str, Any]:
        source_timestamp = (
            iso_utc(
                self.ocean_source_timestamp
            )
            if self.ocean_source_timestamp
            else None
        )

        return {
            "timestamp": iso_utc(
                self.timestamp
            ),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "uo_ms": self.uo_mps,
            "vo_ms": self.vo_mps,
            "speed_ms": self.speed_mps,
            "ocean_source_timestamp": source_timestamp,
        }


class ForecastServiceError(Exception):
    """
    Forecasting error carrying an API error code
    and HTTP status.
    """

    def __init__(
        self,
        message: str,
        code: str = "FORECAST_ERROR",
        status_code: int = 500,
    ):
        super().__init__(message)

        self.message = message
        self.code = code
        self.status_code = status_code


class OceanDataUnavailable(
    ForecastServiceError
):
    """Required ocean data could not be obtained."""


class OceanDataCoverageError(
    OceanDataUnavailable
):
    """Requested ocean-data coverage is unavailable."""


class OceanDataConfigurationError(
    OceanDataUnavailable
):
    """Ocean-data source is incorrectly configured."""