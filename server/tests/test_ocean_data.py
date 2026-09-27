from datetime import datetime, timezone

import numpy as np
import xarray as xr
import pytest

from server.forecasting.models import (
    OceanDataCoverageError,
)
from server.forecasting.ocean_data import (
    LocalNetCDFSource,
)


def create_dataset(tmp_path):
    path = tmp_path / "ocean.nc"

    times = np.array(
        [
            np.datetime64("2026-09-27T00:00:00"),
            np.datetime64("2026-09-28T00:00:00"),
            np.datetime64("2026-09-29T00:00:00"),
        ]
    )

    depths = np.array(
        [0.494025, 10.0]
    )

    lats = np.array(
        [18.0, 19.0]
    )

    lons = np.array(
        [73.0, 74.0]
    )

    shape = (
        len(times),
        len(depths),
        len(lats),
        len(lons),
    )

    uo = np.full(
        shape,
        0.20,
        dtype=float,
    )

    vo = np.full(
        shape,
        0.10,
        dtype=float,
    )

    ds = xr.Dataset(
        {
            "uo": (
                ["time", "depth", "latitude", "longitude"],
                uo,
            ),
            "vo": (
                ["time", "depth", "latitude", "longitude"],
                vo,
            ),
        },
        coords={
            "time": times,
            "depth": depths,
            "latitude": lats,
            "longitude": lons,
        },
    )

    ds.to_netcdf(path)

    return path


def test_coverage_reports_real_shallowest_depth(tmp_path):
    path = create_dataset(tmp_path)

    source = LocalNetCDFSource(str(path))

    coverage = source.coverage()

    assert coverage.minimum_depth == pytest.approx(
        0.494025
    )


def test_sample_uses_shallowest_real_depth(tmp_path):
    path = create_dataset(tmp_path)

    source = LocalNetCDFSource(str(path))

    sample = source.sample(
        latitude=18.5,
        longitude=73.5,
        timestamp=datetime(
            2026,
            9,
            27,
            0,
            0,
            tzinfo=timezone.utc,
        ),
    )

    assert sample.uo == pytest.approx(0.20)
    assert sample.vo == pytest.approx(0.10)
    assert sample.source == "local_netcdf"


def test_sample_rejects_time_before_coverage(tmp_path):
    path = create_dataset(tmp_path)

    source = LocalNetCDFSource(str(path))

    with pytest.raises(
        OceanDataCoverageError
    ):
        source.sample(
            latitude=18.5,
            longitude=73.5,
            timestamp=datetime(
                2026,
                9,
                26,
                22,
                49,
                tzinfo=timezone.utc,
            ),
        )


def test_sample_rejects_time_after_coverage(tmp_path):
    path = create_dataset(tmp_path)

    source = LocalNetCDFSource(str(path))

    with pytest.raises(
        OceanDataCoverageError
    ):
        source.sample(
            latitude=18.5,
            longitude=73.5,
            timestamp=datetime(
                2026,
                10,
                1,
                tzinfo=timezone.utc,
            ),
        )


def test_sample_rejects_spatially_invalid_latitude(tmp_path):
    path = create_dataset(tmp_path)

    source = LocalNetCDFSource(str(path))

    with pytest.raises(
        OceanDataCoverageError
    ):
        source.sample(
            latitude=30.0,
            longitude=73.5,
            timestamp=datetime(
                2026,
                9,
                27,
                tzinfo=timezone.utc,
            ),
        )