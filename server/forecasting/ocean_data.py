from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np
import xarray as xr

from .models import (
    OceanDataConfigurationError,
    OceanDataCoverageError,
    OceanDataUnavailable,
    OceanSample,
    iso_utc,
)

logger = logging.getLogger(__name__)


EARTH_RADIUS_M = 6_371_000.0

DEFAULT_CURRENT_TIME_TOLERANCE_HOURS = float(
    os.getenv(
        "COPERNICUS_CURRENT_TIME_TOLERANCE_HOURS",
        "3",
    )
)

DEFAULT_MLD_TIME_TOLERANCE_HOURS = float(
    os.getenv(
        "COPERNICUS_MLD_TIME_TOLERANCE_HOURS",
        "18",
    )
)

DEFAULT_CACHE_DIR = Path(
    os.getenv(
        "COPERNICUS_CACHE_DIR",
        Path(tempfile.gettempdir())
        / "anvesha_copernicus_cache",
    )
)

OPEN_METEO_CACHE_DIR = Path(
    os.getenv(
        "OPEN_METEO_CACHE_DIR",
        Path(tempfile.gettempdir())
        / "anvesha_open_meteo_cache",
    )
)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


def _forecast_day_start(value: datetime) -> datetime:
    """Return the UTC midnight used as the Open-Meteo cache window start."""
    value = _utc(value)
    return value.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )


def _numpy_datetime_to_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return _utc(value)

    text = np.datetime_as_string(
        np.datetime64(value),
        unit="us",
    )

    parsed = datetime.fromisoformat(text)

    return parsed.replace(
        tzinfo=timezone.utc
    )


def _datetime_to_numpy(
    value: datetime,
) -> np.datetime64:
    value = _utc(value)

    return np.datetime64(
        value.replace(tzinfo=None),
        "ns",
    )


def _find_coord_name(
    dataset: xr.Dataset,
    candidates: Sequence[str],
) -> Optional[str]:
    lower_map = {
        str(name).lower(): str(name)
        for name in dataset.coords
    }

    for candidate in candidates:
        if candidate.lower() in lower_map:
            return lower_map[
                candidate.lower()
            ]

    return None


def _find_data_var(
    dataset: xr.Dataset,
    candidates: Sequence[str],
) -> Optional[str]:
    lower_map = {
        str(name).lower(): str(name)
        for name in dataset.data_vars
    }

    for candidate in candidates:
        if candidate.lower() in lower_map:
            return lower_map[
                candidate.lower()
            ]

    return None


@dataclass
class OceanCoverage:
    start: datetime
    end: datetime
    minimum_depth: Optional[float]
    maximum_depth: Optional[float]

    latitude_min: float
    latitude_max: float

    longitude_min: float
    longitude_max: float


# =====================================================================
# LOCAL NETCDF
# =====================================================================


class LocalNetCDFSource:
    name = "local_netcdf"

    def __init__(self, path: str):
        if not path:
            raise OceanDataConfigurationError(
                "Local ocean-data path is empty."
            )

        self.path = Path(path)

        if not self.path.exists():
            raise OceanDataConfigurationError(
                f"Ocean-data file does not exist: {self.path}"
            )

        self.dataset: Optional[xr.Dataset] = None

    def _open(self) -> xr.Dataset:
        if self.dataset is None:
            try:
                self.dataset = xr.open_dataset(
                    self.path,
                    decode_times=True,
                )
            except Exception as exc:
                raise OceanDataUnavailable(
                    "Unable to open local ocean dataset: "
                    f"{exc}"
                ) from exc

        return self.dataset

    def _coords(self, ds: xr.Dataset):
        lat_name = _find_coord_name(
            ds,
            [
                "latitude",
                "lat",
                "nav_lat",
                "y",
            ],
        )

        lon_name = _find_coord_name(
            ds,
            [
                "longitude",
                "lon",
                "nav_lon",
                "x",
            ],
        )

        time_name = _find_coord_name(
            ds,
            [
                "time",
                "valid_time",
                "datetime",
            ],
        )

        depth_name = _find_coord_name(
            ds,
            [
                "depth",
                "deptht",
                "lev",
                "level",
                "z",
            ],
        )

        if (
            not lat_name
            or not lon_name
            or not time_name
        ):
            raise OceanDataUnavailable(
                "Local ocean dataset must contain "
                "latitude, longitude, and time coordinates."
            )

        return (
            lat_name,
            lon_name,
            time_name,
            depth_name,
        )

    def coverage(self) -> OceanCoverage:
        ds = self._open()

        (
            lat_name,
            lon_name,
            time_name,
            depth_name,
        ) = self._coords(ds)

        lat_values = np.asarray(
            ds[lat_name].values,
            dtype=float,
        )

        lon_values = np.asarray(
            ds[lon_name].values,
            dtype=float,
        )

        time_values = ds[
            time_name
        ].values

        if len(time_values) == 0:
            raise OceanDataUnavailable(
                "Local ocean dataset contains no "
                "time coordinates."
            )

        start = (
            _numpy_datetime_to_datetime(
                time_values[0]
            )
        )

        end = (
            _numpy_datetime_to_datetime(
                time_values[-1]
            )
        )

        minimum_depth = None
        maximum_depth = None

        if depth_name:
            depth_values = np.asarray(
                ds[depth_name].values,
                dtype=float,
            )

            if depth_values.size:
                minimum_depth = float(
                    np.nanmin(
                        depth_values
                    )
                )

                maximum_depth = float(
                    np.nanmax(
                        depth_values
                    )
                )

        return OceanCoverage(
            start=start,
            end=end,
            minimum_depth=minimum_depth,
            maximum_depth=maximum_depth,
            latitude_min=float(
                np.nanmin(lat_values)
            ),
            latitude_max=float(
                np.nanmax(lat_values)
            ),
            longitude_min=float(
                np.nanmin(lon_values)
            ),
            longitude_max=float(
                np.nanmax(lon_values)
            ),
        )

    def _check_spatial_coverage(
        self,
        latitude: float,
        longitude: float,
        coverage: OceanCoverage,
    ):
        if not (
            coverage.latitude_min
            <= latitude
            <= coverage.latitude_max
        ):
            raise OceanDataCoverageError(
                "Requested latitude is outside "
                "the available ocean-data spatial range."
            )

        if not (
            coverage.longitude_min
            <= longitude
            <= coverage.longitude_max
        ):
            raise OceanDataCoverageError(
                "Requested longitude is outside "
                "the available ocean-data spatial range."
            )

    def _prepare_dataset_for_sampling(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
    ) -> xr.Dataset:
        ds = self._open()

        (
            lat_name,
            lon_name,
            time_name,
            depth_name,
        ) = self._coords(ds)

        coverage = self.coverage()

        self._check_spatial_coverage(
            latitude,
            longitude,
            coverage,
        )

        requested_time = _utc(
            timestamp
        )

        if requested_time < coverage.start:
            raise OceanDataCoverageError(
                "Requested ocean-data time is before "
                "the available range. Available range: "
                f"{iso_utc(coverage.start)} to "
                f"{iso_utc(coverage.end)}; "
                f"requested: {iso_utc(requested_time)}."
            )

        if requested_time > coverage.end:
            raise OceanDataCoverageError(
                "Requested ocean-data time is after "
                "the available range. Available range: "
                f"{iso_utc(coverage.start)} to "
                f"{iso_utc(coverage.end)}; "
                f"requested: {iso_utc(requested_time)}."
            )

        kwargs = {
            lat_name: xr.DataArray(
                [latitude],
                dims="forecast_point",
            ),
            lon_name: xr.DataArray(
                [longitude],
                dims="forecast_point",
            ),
            time_name: xr.DataArray(
                [
                    _datetime_to_numpy(
                        requested_time
                    )
                ],
                dims="forecast_point",
            ),
        }

        if depth_name:
            depth_values = np.asarray(
                ds[depth_name].values,
                dtype=float,
            )

            if depth_values.size == 0:
                raise OceanDataUnavailable(
                    "Ocean dataset contains an empty "
                    "depth coordinate."
                )

            shallowest_depth = float(
                depth_values[
                    np.argmin(
                        np.abs(
                            depth_values
                        )
                    )
                ]
            )

            kwargs[
                depth_name
            ] = xr.DataArray(
                [shallowest_depth],
                dims="forecast_point",
            )

        try:
            sampled = ds.interp(
                kwargs,
                method="linear",
                kwargs={
                    "fill_value": np.nan
                },
            )
        except Exception as exc:
            raise OceanDataUnavailable(
                "Ocean-data interpolation failed: "
                f"{exc}"
            ) from exc

        return sampled

    def sample(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
    ) -> OceanSample:

        ds = (
            self._prepare_dataset_for_sampling(
                latitude,
                longitude,
                timestamp,
            )
        )

        uo_name = _find_data_var(
            ds,
            [
                "uo",
                "water_u",
                "eastward_sea_water_velocity",
            ],
        )

        vo_name = _find_data_var(
            ds,
            [
                "vo",
                "water_v",
                "northward_sea_water_velocity",
            ],
        )

        if not uo_name or not vo_name:
            raise OceanDataUnavailable(
                "Ocean dataset does not contain both "
                "eastward and northward current components."
            )

        def scalar(
            name: Optional[str],
        ) -> Optional[float]:

            if not name:
                return None

            values = np.asarray(
                ds[name].values
            )

            if values.size == 0:
                return None

            value = float(
                values.reshape(-1)[0]
            )

            if not np.isfinite(value):
                return None

            return value

        uo = scalar(uo_name)
        vo = scalar(vo_name)

        if (
            uo is None
            or vo is None
        ):
            raise OceanDataUnavailable(
                "Ocean-current components are missing "
                "at the requested location/time."
            )

        thetao_name = _find_data_var(
            ds,
            [
                "thetao",
                "theta",
                "temperature",
            ],
        )

        so_name = _find_data_var(
            ds,
            [
                "so",
                "salinity",
            ],
        )

        zos_name = _find_data_var(
            ds,
            [
                "zos",
                "eta",
                "ssh",
                "sea_surface_height",
            ],
        )

        mlotst_name = _find_data_var(
            ds,
            [
                "mlotst",
                "mld",
                "mixed_layer_depth",
            ],
        )

        bottomt_name = _find_data_var(
            ds,
            [
                "bottomT",
                "bottomt",
            ],
        )

        source_timestamp = _utc(
            timestamp
        )

        return OceanSample(
            latitude=latitude,
            longitude=longitude,
            timestamp=_utc(
                timestamp
            ),
            uo=uo,
            vo=vo,
            thetao=scalar(
                thetao_name
            ),
            so=scalar(
                so_name
            ),
            zos=scalar(
                zos_name
            ),
            mlotst=scalar(
                mlotst_name
            ),
            bottomT=scalar(
                bottomt_name
            ),
            source=self.name,
            source_timestamp=(
                source_timestamp
            ),
            metadata={
                "path": str(
                    self.path
                ),
                "variables": {
                    "uo": uo_name,
                    "vo": vo_name,
                    "thetao": thetao_name,
                    "so": so_name,
                    "zos": zos_name,
                    "mlotst": mlotst_name,
                    "bottomT": bottomt_name,
                },
            },
        )


# =====================================================================
# OPEN-METEO MARINE
# =====================================================================


class OpenMeteoMarineSource:
    """
    Operational ocean-current forecast source.

    Open-Meteo Marine provides hourly ocean-current velocity and
    direction forecasts. The API response is downloaded once for
    the requested forecast window and retained in memory.

    Source:
        https://open-meteo.com/en/docs/marine-weather-api

    Velocity returned by the API is converted from km/h to m/s.
    Direction is interpreted as the direction toward which the
    current flows.
    """

    name = "open_meteo_marine"

    BASE_URL = os.getenv(
        "OPEN_METEO_MARINE_URL",
        "https://marine-api.open-meteo.com/v1/marine",
    )

    def __init__(
        self,
        forecast_hours: int = 168,
    ):
        self.forecast_hours = max(
            1,
            min(
                forecast_hours,
                192,
            ),
        )

        OPEN_METEO_CACHE_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )

        self._cache: Dict[
            str,
            dict,
        ] = {}

    def _cache_key(
        self,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
    ) -> str:

        # Cache by forecast day rather than by every RK2 timestamp.
        # This lets all hourly RK2 samples reuse one downloaded window.
        cache_start = _forecast_day_start(start_time)

        raw = "|".join(
            [
                f"{latitude:.4f}",
                f"{longitude:.4f}",
                iso_utc(cache_start),
                iso_utc(end_time),
            ]
        )

        return hashlib.sha256(
            raw.encode(
                "utf-8"
            )
        ).hexdigest()[:24]

    def _fetch(
        self,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
    ) -> dict:

        start_time = _utc(
            start_time
        )

        end_time = _utc(
            end_time
        )

        key = self._cache_key(
            latitude,
            longitude,
            start_time,
            end_time,
        )

        if key in self._cache:
            return self._cache[key]

        # Open-Meteo accepts start_hour/end_hour.
        # We request one forecast window containing the entire
        # RK2 integration period.
        params = {
            "latitude": f"{latitude:.6f}",
            "longitude": f"{longitude:.6f}",
            "hourly": (
                "ocean_current_velocity,"
                "ocean_current_direction,"
                "sea_surface_temperature"
            ),
            "start_hour": (
                start_time.strftime(
                    "%Y-%m-%dT%H:00"
                )
            ),
            "end_hour": (
                end_time.strftime(
                    "%Y-%m-%dT%H:00"
                )
            ),
            "timezone": "GMT",
            "cell_selection": "sea",
        }

        url = (
            self.BASE_URL
            + "?"
            + urllib.parse.urlencode(
                params
            )
        )

        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "ANVESHA-Ocean-Intelligence/1.0"
                )
            },
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=30,
            ) as response:

                payload = json.loads(
                    response.read().decode(
                        "utf-8"
                    )
                )

        except Exception as exc:
            raise OceanDataUnavailable(
                "Open-Meteo Marine request failed: "
                f"{exc}"
            ) from exc

        if "hourly" not in payload:
            raise OceanDataUnavailable(
                "Open-Meteo Marine returned no hourly "
                "ocean-current data."
            )

        hourly = payload["hourly"]

        times = hourly.get(
            "time",
            [],
        )

        velocities = hourly.get(
            "ocean_current_velocity",
            [],
        )

        directions = hourly.get(
            "ocean_current_direction",
            [],
        )

        temperatures = hourly.get(
            "sea_surface_temperature",
            [],
        )

        if not times:
            raise OceanDataUnavailable(
                "Open-Meteo Marine returned an empty "
                "forecast time series."
            )

        if not (
            len(times)
            == len(velocities)
            == len(directions)
        ):
            raise OceanDataUnavailable(
                "Open-Meteo Marine returned inconsistent "
                "current-vector arrays."
            )

        parsed_times = []

        for value in times:
            parsed = datetime.fromisoformat(
                value
            )

            parsed_times.append(
                parsed.replace(
                    tzinfo=timezone.utc
                )
            )

        dataset = {
            "latitude": payload.get(
                "latitude",
                latitude,
            ),
            "longitude": payload.get(
                "longitude",
                longitude,
            ),
            "times": parsed_times,
            "velocity_kmh": velocities,
            "direction_deg": directions,
            "temperature_c": temperatures,
            "generationtime_ms": payload.get(
                "generationtime_ms"
            ),
        }

        self._cache[key] = dataset

        return dataset

    @staticmethod
    def _nearest_index(
        times: List[datetime],
        requested: datetime,
    ) -> int:

        if not times:
            raise OceanDataUnavailable(
                "Ocean-current forecast contains no timestamps."
            )

        distances = [
            abs(
                (
                    value
                    - requested
                ).total_seconds()
            )
            for value in times
        ]

        return int(
            np.argmin(
                distances
            )
        )

    def sample(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
    ) -> OceanSample:

        requested = _utc(timestamp)

        # Fetch one full forecast window beginning at UTC midnight.
        # Every RK2 sample for the same location can reuse this response.
        start = _forecast_day_start(requested)

        end = start + timedelta(
            hours=self.forecast_hours
        )

        dataset = self._fetch(
            latitude,
            longitude,
            start,
            end,
        )

        times = dataset["times"]

        if not times:
            raise OceanDataUnavailable(
                "Ocean-current forecast contains no timestamps."
            )

        if requested < times[0]:
            raise OceanDataCoverageError(
                "Requested time is before the "
                "Open-Meteo Marine forecast range. "
                f"Available range: "
                f"{iso_utc(times[0])} to {iso_utc(times[-1])}; "
                f"requested: {iso_utc(requested)}."
            )

        if requested > times[-1]:
            raise OceanDataCoverageError(
                "Requested time is after the "
                "Open-Meteo Marine forecast range. "
                f"Available range: "
                f"{iso_utc(times[0])} to {iso_utc(times[-1])}; "
                f"requested: {iso_utc(requested)}."
            )

        # Locate the two surrounding hourly source values.
        right = int(
            np.searchsorted(
                np.asarray(times, dtype=object),
                requested,
                side="left",
            )
        )

        if right <= 0:
            lower_index = 0
            upper_index = 0
        elif right >= len(times):
            lower_index = len(times) - 1
            upper_index = len(times) - 1
        else:
            lower_index = right - 1
            upper_index = right

        lower_time = times[lower_index]
        upper_time = times[upper_index]

        lower_velocity = dataset["velocity_kmh"][lower_index]
        upper_velocity = dataset["velocity_kmh"][upper_index]
        lower_direction = dataset["direction_deg"][lower_index]
        upper_direction = dataset["direction_deg"][upper_index]

        values = (
            lower_velocity,
            upper_velocity,
            lower_direction,
            upper_direction,
        )

        if any(value is None for value in values):
            raise OceanDataUnavailable(
                "No ocean-current vector was available "
                "around the requested location/time."
            )

        try:
            lower_velocity = float(lower_velocity)
            upper_velocity = float(upper_velocity)
            lower_direction = float(lower_direction)
            upper_direction = float(upper_direction)
        except (TypeError, ValueError) as exc:
            raise OceanDataUnavailable(
                "Open-Meteo returned a non-numeric "
                "ocean-current vector."
            ) from exc

        if not all(
            math.isfinite(value)
            for value in (
                lower_velocity,
                upper_velocity,
                lower_direction,
                upper_direction,
            )
        ):
            raise OceanDataUnavailable(
                "Open-Meteo returned an invalid "
                "ocean-current vector."
            )

        if upper_time == lower_time:
            fraction = 0.0
        else:
            fraction = (
                requested - lower_time
            ).total_seconds() / (
                upper_time - lower_time
            ).total_seconds()

        fraction = max(
            0.0,
            min(
                1.0,
                fraction,
            ),
        )

        # Interpolate the vector components, not the direction angle.
        # Interpolating u/v avoids circular-angle discontinuities.
        lower_speed_mps = lower_velocity / 3.6
        upper_speed_mps = upper_velocity / 3.6

        lower_direction_rad = math.radians(
            lower_direction
        )
        upper_direction_rad = math.radians(
            upper_direction
        )

        lower_u = (
            lower_speed_mps
            * math.sin(lower_direction_rad)
        )
        lower_v = (
            lower_speed_mps
            * math.cos(lower_direction_rad)
        )

        upper_u = (
            upper_speed_mps
            * math.sin(upper_direction_rad)
        )
        upper_v = (
            upper_speed_mps
            * math.cos(upper_direction_rad)
        )

        uo_mps = (
            lower_u
            + fraction * (upper_u - lower_u)
        )
        vo_mps = (
            lower_v
            + fraction * (upper_v - lower_v)
        )

        temperature = None

        temperatures = dataset.get(
            "temperature_c",
            [],
        )

        if temperatures:
            lower_temperature = (
                temperatures[lower_index]
                if lower_index < len(temperatures)
                else None
            )
            upper_temperature = (
                temperatures[upper_index]
                if upper_index < len(temperatures)
                else None
            )

            try:
                lower_temperature = (
                    float(lower_temperature)
                    if lower_temperature is not None
                    else None
                )
                upper_temperature = (
                    float(upper_temperature)
                    if upper_temperature is not None
                    else None
                )
            except (TypeError, ValueError):
                lower_temperature = None
                upper_temperature = None

            if (
                lower_temperature is not None
                and upper_temperature is not None
                and math.isfinite(lower_temperature)
                and math.isfinite(upper_temperature)
            ):
                temperature = (
                    lower_temperature
                    + fraction
                    * (
                        upper_temperature
                        - lower_temperature
                    )
                )
            elif (
                lower_temperature is not None
                and math.isfinite(lower_temperature)
            ):
                temperature = lower_temperature
            elif (
                upper_temperature is not None
                and math.isfinite(upper_temperature)
            ):
                temperature = upper_temperature

        return OceanSample(
            latitude=float(
                dataset["latitude"]
            ),
            longitude=float(
                dataset["longitude"]
            ),
            timestamp=requested,
            uo=uo_mps,
            vo=vo_mps,
            thetao=temperature,
            source=self.name,
            # Keep the nearest source timestamp as the compact
            # provenance field while exposing both interpolation
            # endpoints in metadata.
            source_timestamp=(
                lower_time
                if fraction < 0.5
                else upper_time
            ),
            metadata={
                "provider": "Open-Meteo",
                "variable_velocity": (
                    "ocean_current_velocity"
                ),
                "variable_direction": (
                    "ocean_current_direction"
                ),
                "velocity_unit": (
                    "km/h converted to m/s"
                ),
                "direction_definition": (
                    "direction toward which the "
                    "current flows"
                ),
                "requested_timestamp": (
                    iso_utc(requested)
                ),
                "actual_source_timestamp": (
                    iso_utc(
                        lower_time
                        if fraction < 0.5
                        else upper_time
                    )
                ),
                "lower_source_timestamp": (
                    iso_utc(lower_time)
                ),
                "upper_source_timestamp": (
                    iso_utc(upper_time)
                ),
                "temporal_interpolation": "linear_uv",
                "interpolation_fraction": fraction,
                "forecast_grid_latitude": (
                    dataset["latitude"]
                ),
                "forecast_grid_longitude": (
                    dataset["longitude"]
                ),
                "generationtime_ms": (
                    dataset[
                        "generationtime_ms"
                    ]
                ),
            },
        )



# =====================================================================
# COPERNICUS MARINE
# =====================================================================


class CopernicusSubsetSource:
    """
    Copernicus Marine global ocean source.

    Two global Copernicus datasets are used:

    * Current vectors:
      ``cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i``
      variables ``uo`` and ``vo``.
    * Mixed-layer depth:
      ``cmems_mod_glo_phy_anfc_0.083deg_P1D-m``
      variable ``mlotst``.

    The current and MLD fields are requested independently because
    Copernicus exposes them through different datasets.  MLD is a daily
    mean 2-D field, so it is sampled from the nearest available daily
    source time rather than being treated as an hourly observation.

    This source never fabricates MLD.  If the MLD subset cannot be
    obtained or does not contain a valid value, the returned
    ``OceanSample`` keeps ``mlotst=None`` and records the reason in
    metadata.  This allows the retention layer to remain explicitly
    unscored when required ocean variables are unavailable.
    """

    name = "copernicus_marine"

    DEFAULT_CURRENT_DATASET_ID = os.getenv(
        "COPERNICUS_DATASET_ID",
        "cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i",
    )

    DEFAULT_MLD_DATASET_ID = os.getenv(
        "COPERNICUS_MLD_DATASET_ID",
        "cmems_mod_glo_phy_anfc_0.083deg_P1D-m",
    )

    def __init__(self):
        self.enabled = (
            os.getenv(
                "COPERNICUS_ENABLED",
                "",
            )
            .strip()
            .lower()
            in {
                "1",
                "true",
                "yes",
                "on",
            }
        )

        if not self.enabled:
            raise OceanDataConfigurationError(
                "COPERNICUS_ENABLED is not true."
            )

        username = os.getenv(
            "COPERNICUSMARINE_SERVICE_USERNAME"
        )

        password = os.getenv(
            "COPERNICUSMARINE_SERVICE_PASSWORD"
        )

        if not username or not password:
            raise OceanDataConfigurationError(
                "Copernicus credentials are missing."
            )

        self.current_dataset_id = (
            self.DEFAULT_CURRENT_DATASET_ID
        )
        self.mld_dataset_id = (
            self.DEFAULT_MLD_DATASET_ID
        )

        self.cache_dir = Path(
            os.getenv(
                "COPERNICUS_CACHE_DIR",
                str(DEFAULT_CACHE_DIR),
            )
        )

        self.cache_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        # Prepared forecast cache: a complete spatial-temporal Copernicus
        # window is downloaded once per forecast and reused by every RK2
        # evaluation and retention-stencil sample.
        self._prepared_current: Optional[xr.Dataset] = None
        self._prepared_mld: Optional[xr.Dataset] = None
        self._prepared_current_path: Optional[Path] = None
        self._prepared_mld_path: Optional[Path] = None
        self._prepared_start: Optional[datetime] = None
        self._prepared_end: Optional[datetime] = None
        self._prepared_lat_min: Optional[float] = None
        self._prepared_lat_max: Optional[float] = None
        self._prepared_lon_min: Optional[float] = None
        self._prepared_lon_max: Optional[float] = None

    def _import_toolbox(self):
        try:
            import copernicusmarine
        except ImportError as exc:
            raise OceanDataConfigurationError(
                "copernicusmarine is not installed."
            ) from exc

        return copernicusmarine

    @staticmethod
    def _safe_dataset_token(dataset_id: str) -> str:
        return hashlib.sha256(
            dataset_id.encode("utf-8")
        ).hexdigest()[:16]

    def _cache_key(
        self,
        dataset_id: str,
        variables: Sequence[str],
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
    ) -> str:
        raw = "|".join(
            [
                dataset_id,
                ",".join(sorted(variables)),
                f"{latitude:.4f}",
                f"{longitude:.4f}",
                iso_utc(start_time),
                iso_utc(end_time),
            ]
        )

        return hashlib.sha256(
            raw.encode("utf-8")
        ).hexdigest()[:24]

    def _download_subset(
        self,
        *,
        dataset_id: str,
        variables: Sequence[str],
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
        output_prefix: str,
        spatial_margin_degrees: Optional[float] = None,
    ) -> Path:
        copernicusmarine = self._import_toolbox()

        start_time = _utc(start_time)
        end_time = _utc(end_time)

        key = self._cache_key(
            dataset_id,
            variables,
            latitude,
            longitude,
            start_time,
            end_time,
        )

        dataset_token = self._safe_dataset_token(
            dataset_id
        )

        output_path = (
            self.cache_dir
            / (
                f"copernicus_{output_prefix}_"
                f"{dataset_token}_{key}.nc"
            )
        )

        if output_path.exists():
            return output_path

        margin = float(
            spatial_margin_degrees
            if spatial_margin_degrees is not None
            else os.getenv(
                "COPERNICUS_SPATIAL_MARGIN_DEGREES",
                "2",
            )
        )

        subset_kwargs = {
            "dataset_id": dataset_id,
            "variables": list(variables),
            "minimum_longitude": max(
                -180.0,
                longitude - margin,
            ),
            "maximum_longitude": min(
                180.0,
                longitude + margin,
            ),
            "minimum_latitude": max(
                -90.0,
                latitude - margin,
            ),
            "maximum_latitude": min(
                90.0,
                latitude + margin,
            ),
            "start_datetime": iso_utc(start_time),
            "end_datetime": iso_utc(end_time),
            "output_directory": str(
                self.cache_dir
            ),
            "output_filename": output_path.name,
        }

        # mlotst is a 2-D surface diagnostic. Do not pass depth
        # constraints for the MLD dataset.
        try:
            result = copernicusmarine.subset(
                **subset_kwargs
            )
        except Exception as exc:
            raise OceanDataUnavailable(
                "Copernicus Marine subset request failed "
                f"for {dataset_id} ({', '.join(variables)}): "
                f"{exc}"
            ) from exc

        if result:
            result_path = Path(str(result))
            if result_path.exists():
                return result_path

        if output_path.exists():
            return output_path

        raise OceanDataUnavailable(
            "Copernicus Marine subset completed "
            "but the NetCDF file was not found."
        )

    @staticmethod
    def _open_dataset(
        path: Path,
        label: str,
    ) -> xr.Dataset:
        try:
            return xr.open_dataset(
                path,
                decode_times=True,
            )
        except Exception as exc:
            raise OceanDataUnavailable(
                f"Unable to open Copernicus {label} subset: "
                f"{exc}"
            ) from exc

    @staticmethod
    def _coordinates(
        ds: xr.Dataset,
        label: str,
    ):
        lat_name = _find_coord_name(
            ds,
            [
                "latitude",
                "lat",
                "nav_lat",
            ],
        )

        lon_name = _find_coord_name(
            ds,
            [
                "longitude",
                "lon",
                "nav_lon",
            ],
        )

        time_name = _find_coord_name(
            ds,
            [
                "time",
                "valid_time",
            ],
        )

        if (
            not lat_name
            or not lon_name
            or not time_name
        ):
            raise OceanDataUnavailable(
                f"Copernicus {label} subset lacks "
                "required latitude, longitude, and time "
                "coordinates."
            )

        return (
            lat_name,
            lon_name,
            time_name,
        )

    @staticmethod
    def _scalar(
        dataset: xr.Dataset,
        name: Optional[str],
    ) -> Optional[float]:
        if not name:
            return None

        values = np.asarray(
            dataset[name].values
        )

        if values.size == 0:
            return None

        value = float(
            values.reshape(-1)[0]
        )

        if not np.isfinite(value):
            return None

        return value

    @staticmethod
    def _nearest_time(
        times: Sequence[datetime],
        requested: datetime,
    ) -> datetime:
        if not times:
            raise OceanDataUnavailable(
                "Copernicus subset contains no timestamps."
            )

        return min(
            times,
            key=lambda value: abs(
                (value - requested).total_seconds()
            ),
        )

    @staticmethod
    def _check_spatial_coverage(
        ds: xr.Dataset,
        latitude: float,
        longitude: float,
        lat_name: str,
        lon_name: str,
        label: str,
    ):
        lat_values = np.asarray(
            ds[lat_name].values,
            dtype=float,
        )
        lon_values = np.asarray(
            ds[lon_name].values,
            dtype=float,
        )

        if lat_values.size == 0 or lon_values.size == 0:
            raise OceanDataUnavailable(
                f"Copernicus {label} subset contains "
                "empty spatial coordinates."
            )

        if not (
            np.nanmin(lat_values)
            <= latitude
            <= np.nanmax(lat_values)
        ):
            raise OceanDataCoverageError(
                f"Requested latitude is outside the "
                f"Copernicus {label} subset."
            )

        if not (
            np.nanmin(lon_values)
            <= longitude
            <= np.nanmax(lon_values)
        ):
            raise OceanDataCoverageError(
                f"Requested longitude is outside the "
                f"Copernicus {label} subset."
            )

    @staticmethod
    def _sample_spatial_time(
        ds: xr.Dataset,
        *,
        latitude: float,
        longitude: float,
        sample_time: datetime,
        lat_name: str,
        lon_name: str,
        time_name: str,
        method: str = "linear",
    ) -> xr.Dataset:
        """
        Sample a Copernicus field at one location/time.

        ``linear`` is preferred for ocean-current fields.  Callers may use
        ``nearest`` as a mask-safe fallback when linear interpolation touches
        a land/invalid neighbour and therefore produces NaN.
        """
        kwargs = {
            lat_name: xr.DataArray(
                [latitude],
                dims="forecast_point",
            ),
            lon_name: xr.DataArray(
                [longitude],
                dims="forecast_point",
            ),
            time_name: xr.DataArray(
                [
                    _datetime_to_numpy(
                        sample_time
                    )
                ],
                dims="forecast_point",
            ),
        }

        try:
            return ds.interp(
                kwargs,
                method=method,
                kwargs={
                    "fill_value": np.nan
                },
            )
        except Exception as exc:
            raise OceanDataUnavailable(
                "Copernicus interpolation failed: "
                f"{exc}"
            ) from exc


    @staticmethod
    def _floor_to_six_hour(value: datetime) -> datetime:
        value = _utc(value)
        hour = (value.hour // 6) * 6
        return value.replace(
            hour=hour,
            minute=0,
            second=0,
            microsecond=0,
        )

    @staticmethod
    def _ceil_to_six_hour(value: datetime) -> datetime:
        value = _utc(value)
        floored = CopernicusSubsetSource._floor_to_six_hour(value)
        if floored == value:
            return floored
        return floored + timedelta(hours=6)

    @staticmethod
    def _floor_to_day(value: datetime) -> datetime:
        value = _utc(value)
        return value.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

    @staticmethod
    def _ceil_to_day(value: datetime) -> datetime:
        value = _utc(value)
        floored = CopernicusSubsetSource._floor_to_day(value)
        if floored == value:
            return floored
        return floored + timedelta(days=1)

    def _close_prepared_datasets(self) -> None:
        for dataset in (
            self._prepared_current,
            self._prepared_mld,
        ):
            if dataset is not None:
                try:
                    dataset.close()
                except Exception:
                    pass
        self._prepared_current = None
        self._prepared_mld = None
        self._prepared_current_path = None
        self._prepared_mld_path = None

    def prepare_forecast(
        self,
        *,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
        spatial_margin_degrees: float = 2.0,
    ) -> None:
        """Download the Copernicus fields once for one forecast run."""
        start_time = _utc(start_time)
        end_time = _utc(end_time)

        if end_time < start_time:
            raise OceanDataCoverageError(
                "Copernicus forecast end time is before its start time."
            )

        margin = float(spatial_margin_degrees)
        if not math.isfinite(margin) or margin <= 0:
            raise OceanDataConfigurationError(
                "Copernicus spatial margin must be a positive finite value."
            )

        current_start = self._floor_to_six_hour(start_time)
        current_end = self._ceil_to_six_hour(end_time)
        mld_start = self._floor_to_day(start_time)
        mld_end = self._ceil_to_day(end_time)

        lat_min = max(-90.0, latitude - margin)
        lat_max = min(90.0, latitude + margin)
        lon_min = max(-180.0, longitude - margin)
        lon_max = min(180.0, longitude + margin)

        self._close_prepared_datasets()

        current_path = self._download_subset(
            dataset_id=self.current_dataset_id,
            variables=("uo", "vo"),
            latitude=latitude,
            longitude=longitude,
            start_time=current_start,
            end_time=current_end,
            output_prefix="current",
            spatial_margin_degrees=margin,
        )
        mld_path = self._download_subset(
            dataset_id=self.mld_dataset_id,
            variables=("mlotst",),
            latitude=latitude,
            longitude=longitude,
            start_time=mld_start,
            end_time=mld_end,
            output_prefix="mld",
            spatial_margin_degrees=margin,
        )

        self._prepared_current = self._open_dataset(
            current_path, "current"
        )
        self._prepared_mld = self._open_dataset(
            mld_path, "mixed-layer-depth"
        )
        self._prepared_current_path = current_path
        self._prepared_mld_path = mld_path
        self._prepared_start = start_time
        self._prepared_end = end_time
        self._prepared_lat_min = lat_min
        self._prepared_lat_max = lat_max
        self._prepared_lon_min = lon_min
        self._prepared_lon_max = lon_max

    def _prepared_spatially_covers(
        self,
        latitude: float,
        longitude: float,
    ) -> bool:
        return (
            self._prepared_current is not None
            and self._prepared_mld is not None
            and self._prepared_lat_min is not None
            and self._prepared_lat_max is not None
            and self._prepared_lon_min is not None
            and self._prepared_lon_max is not None
            and self._prepared_lat_min <= latitude <= self._prepared_lat_max
            and self._prepared_lon_min <= longitude <= self._prepared_lon_max
        )

    def _sample_prepared(
        self,
        *,
        latitude: float,
        longitude: float,
        requested: datetime,
    ) -> OceanSample:
        current_tolerance = timedelta(
            hours=DEFAULT_CURRENT_TIME_TOLERANCE_HOURS
        )
        mld_tolerance = timedelta(
            hours=DEFAULT_MLD_TIME_TOLERANCE_HOURS
        )

        current_path = self._prepared_current_path
        mld_path = self._prepared_mld_path

        uo, vo, current_source_time, current_metadata = (
            self._sample_current(
                current_path,
                latitude,
                longitude,
                requested,
                current_tolerance,
                dataset=self._prepared_current,
            )
        )

        mlotst = None
        mld_source_time = None
        mld_metadata = {
            "status": "unavailable",
            "dataset_id": self.mld_dataset_id,
            "variable": "mlotst",
            "reason": None,
        }

        try:
            mlotst, mld_source_time, mld_metadata = self._sample_mld(
                mld_path,
                latitude,
                longitude,
                requested,
                mld_tolerance,
                dataset=self._prepared_mld,
            )
            mld_metadata = {
                **mld_metadata,
                "status": "available",
            }
        except (OceanDataCoverageError, OceanDataUnavailable) as exc:
            mld_metadata = {
                **mld_metadata,
                "status": "unavailable",
                "reason": str(exc),
            }

        return OceanSample(
            latitude=latitude,
            longitude=longitude,
            timestamp=requested,
            uo=uo,
            vo=vo,
            mlotst=mlotst,
            source=self.name,
            source_timestamp=current_source_time,
            metadata={
                "provider": "Copernicus Marine",
                "current": current_metadata,
                "mixed_layer_depth": mld_metadata,
                "source_timestamps": {
                    "current": iso_utc(current_source_time),
                    "mixed_layer_depth": (
                        iso_utc(mld_source_time)
                        if mld_source_time is not None
                        else None
                    ),
                },
                "temporal_provenance": {
                    "current": current_metadata.get(
                        "temporal_sampling",
                        "native_source_times",
                    ),
                    "mixed_layer_depth": (
                        "daily_mean" if mlotst is not None else None
                    ),
                },
            },
        )

    def _download_current_subset(
        self,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
    ) -> Path:
        return self._download_subset(
            dataset_id=self.current_dataset_id,
            variables=("uo", "vo"),
            latitude=latitude,
            longitude=longitude,
            start_time=start_time,
            end_time=end_time,
            output_prefix="current",
        )

    def _download_mld_subset(
        self,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
    ) -> Path:
        return self._download_subset(
            dataset_id=self.mld_dataset_id,
            variables=("mlotst",),
            latitude=latitude,
            longitude=longitude,
            start_time=start_time,
            end_time=end_time,
            output_prefix="mld",
        )

    def _sample_current(
        self,
        path: Path,
        latitude: float,
        longitude: float,
        requested: datetime,
        tolerance: timedelta,
        dataset: Optional[xr.Dataset] = None,
    ):
        """
        Sample the current field with spatial interpolation and temporal
        interpolation between the surrounding native Copernicus timestamps.

        The downloaded Copernicus file may expose 6-hourly, daily, or another
        native temporal resolution depending on the dataset version returned
        by the service.  The forecast must not assume that every requested
        RK2 timestamp is itself a source timestamp.

        Spatial linear interpolation is attempted first.  If the ocean mask
        makes the linear stencil invalid, nearest-neighbour spatial sampling
        is used for that source time.  The two valid source-time vectors are
        then linearly interpolated in u/v space.
        """
        ds = (
            dataset
            if dataset is not None
            else self._open_dataset(
                path,
                "current",
            )
        )
        owns_dataset = dataset is None

        try:
            (
                lat_name,
                lon_name,
                time_name,
            ) = self._coordinates(
                ds,
                "current",
            )

            self._check_spatial_coverage(
                ds,
                latitude,
                longitude,
                lat_name,
                lon_name,
                "current",
            )

            times = ds[time_name].values

            if len(times) == 0:
                raise OceanDataUnavailable(
                    "Copernicus current subset contains "
                    "no timestamps."
                )

            actual_times = sorted(
                _numpy_datetime_to_datetime(value)
                for value in times
            )

            requested = _utc(requested)

            if requested < actual_times[0] or requested > actual_times[-1]:
                raise OceanDataCoverageError(
                    "Requested forecast time is outside "
                    "the available Copernicus current "
                    "time range. Available range: "
                    f"{iso_utc(actual_times[0])} to "
                    f"{iso_utc(actual_times[-1])}; "
                    f"requested: {iso_utc(requested)}."
                )

            # Find the source timestamps surrounding the requested RK2 time.
            right_index = int(
                np.searchsorted(
                    np.asarray(actual_times, dtype=object),
                    requested,
                    side="left",
                )
            )

            if right_index <= 0:
                lower_index = upper_index = 0
            elif right_index >= len(actual_times):
                lower_index = upper_index = len(actual_times) - 1
            else:
                lower_index = right_index - 1
                upper_index = right_index

            lower_time = actual_times[lower_index]
            upper_time = actual_times[upper_index]

            def sample_source_time(source_time: datetime):
                # Prefer spatial bilinear interpolation.
                sampled = self._sample_spatial_time(
                    ds,
                    latitude=latitude,
                    longitude=longitude,
                    sample_time=source_time,
                    lat_name=lat_name,
                    lon_name=lon_name,
                    time_name=time_name,
                    method="linear",
                )

                uo_name = _find_data_var(
                    sampled,
                    ["uo"],
                )
                vo_name = _find_data_var(
                    sampled,
                    ["vo"],
                )

                if not uo_name or not vo_name:
                    raise OceanDataUnavailable(
                        "Copernicus current subset does not "
                        "contain both uo and vo."
                    )

                uo = self._scalar(
                    sampled,
                    uo_name,
                )
                vo = self._scalar(
                    sampled,
                    vo_name,
                )

                # A linear spatial stencil can cross a masked land cell.
                # Fall back to nearest ocean/grid cell rather than rejecting
                # an otherwise valid source field.
                if uo is None or vo is None:
                    sampled = self._sample_spatial_time(
                        ds,
                        latitude=latitude,
                        longitude=longitude,
                        sample_time=source_time,
                        lat_name=lat_name,
                        lon_name=lon_name,
                        time_name=time_name,
                        method="nearest",
                    )

                    uo = self._scalar(
                        sampled,
                        uo_name,
                    )
                    vo = self._scalar(
                        sampled,
                        vo_name,
                    )

                if uo is None or vo is None:
                    raise OceanDataUnavailable(
                        "No valid current vector was available "
                        "from Copernicus at source time "
                        f"{iso_utc(source_time)}."
                    )

                return float(uo), float(vo)

            lower_uo, lower_vo = sample_source_time(lower_time)

            if upper_time == lower_time:
                upper_uo = lower_uo
                upper_vo = lower_vo
                fraction = 0.0
            else:
                upper_uo, upper_vo = sample_source_time(upper_time)
                fraction = (
                    requested - lower_time
                ).total_seconds() / (
                    upper_time - lower_time
                ).total_seconds()
                fraction = max(
                    0.0,
                    min(
                        1.0,
                        fraction,
                    ),
                )

            # Interpolate vector components, never direction angles.
            uo = (
                lower_uo
                + fraction * (upper_uo - lower_uo)
            )
            vo = (
                lower_vo
                + fraction * (upper_vo - lower_vo)
            )

            if not (
                math.isfinite(uo)
                and math.isfinite(vo)
            ):
                raise OceanDataUnavailable(
                    "Copernicus temporal current interpolation "
                    "produced a non-finite vector."
                )

            nearest_time = (
                lower_time
                if fraction <= 0.5
                else upper_time
            )

            source_step_hours = (
                upper_time - lower_time
            ).total_seconds() / 3600.0

            return (
                float(uo),
                float(vo),
                nearest_time,
                {
                    "dataset_id": self.current_dataset_id,
                    "variables": {
                        "uo": "uo",
                        "vo": "vo",
                    },
                    "requested_timestamp": iso_utc(
                        requested
                    ),
                    "actual_source_timestamp": iso_utc(
                        nearest_time
                    ),
                    "lower_source_timestamp": iso_utc(
                        lower_time
                    ),
                    "upper_source_timestamp": iso_utc(
                        upper_time
                    ),
                    "temporal_sampling": (
                        "linear_uv_between_source_times"
                    ),
                    "native_source_step_hours": (
                        source_step_hours
                    ),
                    "interpolation_fraction": fraction,
                    "spatial_sampling": (
                        "linear_with_nearest_fallback"
                    ),
                    "cache_file": str(path),
                },
            )
        finally:
            if owns_dataset:
                ds.close()

    def _sample_mld(
        self,
        path: Path,
        latitude: float,
        longitude: float,
        requested: datetime,
        tolerance: timedelta,
        dataset: Optional[xr.Dataset] = None,
    ):
        ds = (
            dataset
            if dataset is not None
            else self._open_dataset(
                path,
                "mixed-layer-depth",
            )
        )
        owns_dataset = dataset is None

        try:
            (
                lat_name,
                lon_name,
                time_name,
            ) = self._coordinates(
                ds,
                "mixed-layer-depth",
            )

            self._check_spatial_coverage(
                ds,
                latitude,
                longitude,
                lat_name,
                lon_name,
                "mixed-layer-depth",
            )

            times = ds[time_name].values

            if len(times) == 0:
                raise OceanDataUnavailable(
                    "Copernicus MLD subset contains "
                    "no timestamps."
                )

            actual_times = [
                _numpy_datetime_to_datetime(value)
                for value in times
            ]

            nearest_time = self._nearest_time(
                actual_times,
                requested,
            )

            time_difference = abs(
                (
                    nearest_time - requested
                ).total_seconds()
            )

            if (
                time_difference
                > tolerance.total_seconds()
            ):
                raise OceanDataCoverageError(
                    "Requested time is outside the "
                    "available Copernicus MLD time "
                    "tolerance. Available range: "
                    f"{iso_utc(actual_times[0])} to "
                    f"{iso_utc(actual_times[-1])}; "
                    f"requested: {iso_utc(requested)}."
                )

            sampled = self._sample_spatial_time(
                ds,
                latitude=latitude,
                longitude=longitude,
                sample_time=nearest_time,
                lat_name=lat_name,
                lon_name=lon_name,
                time_name=time_name,
            )

            mlotst_name = _find_data_var(
                sampled,
                ["mlotst"],
            )

            if not mlotst_name:
                raise OceanDataUnavailable(
                    "Copernicus MLD dataset does not "
                    "contain mlotst."
                )

            mlotst = self._scalar(
                sampled,
                mlotst_name,
            )

            if mlotst is None:
                raise OceanDataUnavailable(
                    "Copernicus returned no valid MLD "
                    "value at the requested location/time."
                )

            return (
                mlotst,
                nearest_time,
                {
                    "dataset_id": self.mld_dataset_id,
                    "variable": mlotst_name,
                    "units": "m",
                    "requested_timestamp": iso_utc(
                        requested
                    ),
                    "actual_source_timestamp": iso_utc(
                        nearest_time
                    ),
                    "temporal_sampling": "nearest_daily_mean",
                    "temporal_resolution": "daily_mean",
                    "cache_file": str(path),
                },
            )
        finally:
            if owns_dataset:
                ds.close()

    def sample(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
    ) -> OceanSample:
        requested = _utc(timestamp)

        if (
            self._prepared_current is not None
            and self._prepared_mld is not None
            and self._prepared_start is not None
            and self._prepared_end is not None
            and self._prepared_start <= requested <= self._prepared_end
            and self._prepared_spatially_covers(
                latitude,
                longitude,
            )
        ):
            return self._sample_prepared(
                latitude=latitude,
                longitude=longitude,
                requested=requested,
            )

        # Standalone sampling remains supported for diagnostics. A
        # forecast run calls prepare_forecast() first.
        current_tolerance = timedelta(
            hours=DEFAULT_CURRENT_TIME_TOLERANCE_HOURS
        )
        mld_tolerance = timedelta(
            hours=DEFAULT_MLD_TIME_TOLERANCE_HOURS
        )

        current_path = self._download_current_subset(
            latitude=latitude,
            longitude=longitude,
            start_time=requested - current_tolerance,
            end_time=requested + current_tolerance,
        )

        uo, vo, current_source_time, current_metadata = self._sample_current(
            current_path,
            latitude,
            longitude,
            requested,
            current_tolerance,
        )

        mlotst = None
        mld_source_time = None
        mld_metadata = {
            "status": "unavailable",
            "dataset_id": self.mld_dataset_id,
            "variable": "mlotst",
            "reason": None,
        }

        try:
            mld_path = self._download_mld_subset(
                latitude=latitude,
                longitude=longitude,
                start_time=requested - mld_tolerance,
                end_time=requested + mld_tolerance,
            )
            mlotst, mld_source_time, mld_metadata = self._sample_mld(
                mld_path,
                latitude,
                longitude,
                requested,
                mld_tolerance,
            )
            mld_metadata = {
                **mld_metadata,
                "status": "available",
            }
        except (OceanDataCoverageError, OceanDataUnavailable) as exc:
            mld_metadata = {
                **mld_metadata,
                "status": "unavailable",
                "reason": str(exc),
            }

        return OceanSample(
            latitude=latitude,
            longitude=longitude,
            timestamp=requested,
            uo=uo,
            vo=vo,
            mlotst=mlotst,
            source=self.name,
            source_timestamp=current_source_time,
            metadata={
                "provider": "Copernicus Marine",
                "current": current_metadata,
                "mixed_layer_depth": mld_metadata,
                "source_timestamps": {
                    "current": iso_utc(current_source_time),
                    "mixed_layer_depth": (
                        iso_utc(mld_source_time)
                        if mld_source_time is not None
                        else None
                    ),
                },
                "temporal_provenance": {
                    "current": "6_hourly",
                    "mixed_layer_depth": (
                        "daily_mean" if mlotst is not None else None
                    ),
                },
            },
        )


# =====================================================================
# PROVIDER
# =====================================================================


class OceanDataProvider:
    """
    Selects the configured ocean-data source.

    source values:

        auto
        open_meteo
        copernicus
        local

    `auto` prefers the operational Open-Meteo Marine forecast,
    because the drift feature is a forward forecast.
    """

    def __init__(
        self,
        source: str = "auto",
    ):
        self.requested_source = (
            source or "auto"
        ).strip().lower()

        self._source = None

    def _local_path(
        self,
    ) -> Optional[str]:

        return (
            os.getenv(
                "GLORYS_DATA_PATH"
            )
            or os.getenv(
                "OCEAN_DATA_PATH"
            )
        )

    def get_source(self):
        if self._source is not None:
            return self._source

        if (
            self.requested_source
            == "local"
        ):
            local_path = (
                self._local_path()
            )

            if not local_path:
                raise OceanDataConfigurationError(
                    "Local source requested but "
                    "GLORYS_DATA_PATH or "
                    "OCEAN_DATA_PATH is not configured."
                )

            self._source = (
                LocalNetCDFSource(
                    local_path
                )
            )

            return self._source

        if (
            self.requested_source
            == "copernicus"
        ):
            self._source = (
                CopernicusSubsetSource()
            )

            return self._source

        if (
            self.requested_source
            in {
                "open_meteo",
                "open-meteo",
                "openmeteo",
            }
        ):
            self._source = (
                OpenMeteoMarineSource()
            )

            return self._source

        if (
            self.requested_source
            != "auto"
        ):
            raise OceanDataConfigurationError(
                "Unsupported ocean-data source: "
                f"{self.requested_source}"
            )

        # Operational forecast is preferred.
        self._source = (
            OpenMeteoMarineSource()
        )

        return self._source

    def prepare_forecast(
        self,
        *,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: datetime,
        spatial_margin_degrees: float = 2.0,
    ) -> None:

        source = self.get_source()

        prepare = getattr(
            source,
            "prepare_forecast",
            None,
        )

        if prepare is None:
            return

        prepare(
            latitude=latitude,
            longitude=longitude,
            start_time=start_time,
            end_time=end_time,
            spatial_margin_degrees=spatial_margin_degrees,
        )

    def sample(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
    ) -> OceanSample:

        source = self.get_source()

        return source.sample(
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp,
        )