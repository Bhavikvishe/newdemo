import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useStore } from '../lib/store';
import {
  fetchDriftForecast,
  type DriftForecastResponse,
} from '../lib/drift';

import { DriftForecastMap } from '../components/DriftForecastMap';

import {
  Badge,
  Button,
  Card,
  CardHead,
  Field,
  Kv,
  LoadingBlock,
  PageHead,
} from '../lib/ui';

function formatCoord(
  value: number,
): string {
  return value.toFixed(5);
}

function formatDate(
  value?: string | null,
): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function formatSpeed(
  value?: number | null,
): string {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return '—';
  }

  return `${value.toFixed(3)} m/s`;
}

export function DriftForecastPage() {
  const { detections, addToast } =
    useStore();

  const ghostNetDetections =
    useMemo(
      () =>
        detections.filter(
          (d) =>
            d.className ===
              'ghost_fishing_gear' &&
            Number.isFinite(
              d.gps?.latitude,
            ) &&
            Number.isFinite(
              d.gps?.longitude,
            ),
        ),
      [detections],
    );

  const [latitude, setLatitude] =
    useState('');

  const [longitude, setLongitude] =
    useState('');

  const [selectedDetectionId, setSelectedDetectionId] =
    useState('');

  const [horizon, setHorizon] =
    useState<24 | 48 | 72>(72);

  const [source, setSource] =
    useState<
      'auto' | 'open_meteo' | 'copernicus'
    >('auto');

  const [loading, setLoading] =
    useState(false);

  const requestSequenceRef =
    useRef(0);

  const [forecast, setForecast] =
    useState<DriftForecastResponse | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [animationIndex, setAnimationIndex] =
    useState<number | null>(null);

  const [playing, setPlaying] =
    useState(false);

  const timerRef =
    useRef<number | null>(null);

  const selectedDetection =
    useMemo(
      () =>
        ghostNetDetections.find(
          (d) =>
            d.id ===
            selectedDetectionId,
        ) ?? null,
      [
        ghostNetDetections,
        selectedDetectionId,
      ],
    );

  useEffect(() => {
    if (
      selectedDetection &&
      Number.isFinite(
        selectedDetection.gps.latitude,
      ) &&
      Number.isFinite(
        selectedDetection.gps.longitude,
      )
    ) {
      setLatitude(
        String(
          selectedDetection.gps.latitude,
        ),
      );

      setLongitude(
        String(
          selectedDetection.gps.longitude,
        ),
      );
    }
  }, [selectedDetection]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(
          timerRef.current,
        );
      }
    };
  }, []);

  const setLocation = (
    lat: number,
    lon: number,
  ) => {
    requestSequenceRef.current += 1;

    setLatitude(lat.toFixed(6));
    setLongitude(lon.toFixed(6));

    setSelectedDetectionId('');

    setForecast(null);
    setError(null);
    setAnimationIndex(null);
    setPlaying(false);
  };

  const runForecast = async () => {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90
    ) {
      setError(
        'Latitude must be between -90 and 90.',
      );
      return;
    }

    if (
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      setError(
        'Longitude must be between -180 and 180.',
      );
      return;
    }

    const requestId =
      requestSequenceRef.current + 1;

    requestSequenceRef.current =
      requestId;

    setLoading(true);
    setError(null);
    setPlaying(false);
    setAnimationIndex(null);
    setForecast(null);

    try {
      const result =
        await fetchDriftForecast({
          latitude: lat,
          longitude: lon,
          horizon_hours: horizon,
          timestep_minutes: 60,
          source,
          grid_margin_degrees: 2,
          vector_grid_size: 5,
        });

      if (
        requestId !==
        requestSequenceRef.current
      ) {
        return;
      }

      setForecast(result);

      if (result.trajectory.length) {
        setAnimationIndex(0);
      }

      addToast({
        kind: 'success',
        title: 'Drift forecast ready',
        text: `${horizon}-hour RK2 physics forecast generated.`,
      });
    } catch (err) {
      if (
        requestId !==
        requestSequenceRef.current
      ) {
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : 'Forecast request failed.';

      setError(message);

      addToast({
        kind: 'alert',
        title: 'Forecast unavailable',
        text: message,
      });
    } finally {
      if (
        requestId ===
        requestSequenceRef.current
      ) {
        setLoading(false);
      }
    }
  };

  const replay = () => {
    if (!forecast?.trajectory.length) {
      return;
    }

    setPlaying(false);
    setAnimationIndex(0);
  };

  const togglePlayback = () => {
    if (!forecast?.trajectory.length) {
      return;
    }

    if (playing) {
      setPlaying(false);
      return;
    }

    if (
      animationIndex == null ||
      animationIndex >=
        forecast.trajectory.length - 1
    ) {
      setAnimationIndex(0);
    }

    setPlaying(true);
  };

  useEffect(() => {
    if (!playing || !forecast) {
      return;
    }

    if (
      timerRef.current != null
    ) {
      window.clearInterval(
        timerRef.current,
      );
    }

    timerRef.current =
      window.setInterval(() => {
        setAnimationIndex(
          (current) => {
            if (
              current == null
            ) {
              return 0;
            }

            const next =
              current + 1;

            if (
              next >=
              forecast.trajectory.length
            ) {
              setPlaying(false);
              return (
                forecast.trajectory.length -
                1
              );
            }

            return next;
          },
        );
      }, 220);

    return () => {
      if (timerRef.current != null) {
        window.clearInterval(
          timerRef.current,
        );

        timerRef.current = null;
      }
    };
  }, [playing, forecast]);

  const currentTrajectoryPoint =
    forecast &&
    animationIndex != null
      ? forecast.trajectory[
          animationIndex
        ]
      : null;

  const currentUncertainty =
    forecast &&
    animationIndex != null
      ? forecast.uncertainty[
          animationIndex
        ]
      : null;

  const ocean =
    forecast?.ocean_conditions;

  return (
    <div>
      <PageHead
        kicker="OCEAN INTELLIGENCE / DRIFT"
        title="Ghost Net Drift Forecast"
        sub="Physics-based RK2 trajectory forecasting using observed ocean-current conditions. No synthetic ML metrics are used."
        right={
          <Badge
            tone="b-green"
            dot
          >
            RK2 PHYSICS ACTIVE
          </Badge>
        }
      />

      <div
        className="drift-page-grid"
        style={{
          display: 'grid',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* LEFT CONTROL PANEL */}
        <div
          style={{
            display: 'grid',
            gap: 14,
          }}
        >
          <Card solid>
            <CardHead
              kt="FORECAST ORIGIN"
              title="Starting location"
            />

            <div
              style={{
                display: 'grid',
                gap: 12,
              }}
            >
              {ghostNetDetections.length >
                0 && (
                <Field
                  label="Existing ghost-net detection"
                  hint="Only detections with valid GPS coordinates are listed."
                >
                  <select
                    value={
                      selectedDetectionId
                    }
                    onChange={(event) =>
                      setSelectedDetectionId(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Select a detection…
                    </option>

                    {ghostNetDetections.map(
                      (detection) => (
                        <option
                          key={
                            detection.id
                          }
                          value={
                            detection.id
                          }
                        >
                          {detection.id} ·{' '}
                          {detection.gps.latitude.toFixed(
                            4,
                          )}
                          ,{' '}
                          {detection.gps.longitude.toFixed(
                            4,
                          )}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 8,
                }}
              >
                <Field label="Latitude">
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="0.000001"
                    value={latitude}
                    onChange={(e) =>
                      setLatitude(
                        e.target.value,
                      )
                    }
                    placeholder="18.800000"
                  />
                </Field>

                <Field label="Longitude">
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="0.000001"
                    value={longitude}
                    onChange={(e) =>
                      setLongitude(
                        e.target.value,
                      )
                    }
                    placeholder="72.700000"
                  />
                </Field>
              </div>

              <Field
                label="Forecast horizon"
                hint="RK2 integration uses 60-minute timesteps."
              >
                <div
                  className="chip-group"
                >
                  {[24, 48, 72].map(
                    (hours) => (
                      <button
                        key={hours}
                        type="button"
                        className={
                          `chip ${
                            horizon ===
                            hours
                              ? 'on'
                              : ''
                          }`
                        }
                        onClick={() =>
                          setHorizon(
                            hours as
                              | 24
                              | 48
                              | 72,
                          )
                        }
                      >
                        {hours}h
                      </button>
                    ),
                  )}
                </div>
              </Field>

              <Field
                label="Ocean-current source"
                hint="Auto prefers the operational source and falls back when configured."
              >
                <select
                  value={source}
                  onChange={(event) =>
                    setSource(
                      event.target.value as
                        | 'auto'
                        | 'open_meteo'
                        | 'copernicus',
                    )
                  }
                >
                  <option value="auto">
                    Auto — recommended
                  </option>
                  <option value="open_meteo">
                    Open-Meteo Marine
                  </option>
                  <option value="copernicus">
                    Copernicus Marine
                  </option>
                </select>
              </Field>

              <Button
                variant="primary"
                block
                onClick={runForecast}
                disabled={
                  loading ||
                  latitude.trim() === '' ||
                  longitude.trim() === ''
                }
              >
                {loading
                  ? 'Running RK2…'
                  : forecast
                    ? 'Regenerate Drift Forecast'
                    : 'Generate Drift Forecast'}
              </Button>

              {error && (
                <div
                  className="card"
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--critical) 45%, var(--line))',
                    background:
                      'color-mix(in srgb, var(--critical) 8%, transparent)',
                    padding: 12,
                  }}
                >
                  <div
                    className="tiny upper"
                    style={{
                      color:
                        'var(--critical)',
                      marginBottom: 5,
                    }}
                  >
                    Forecast error
                  </div>

                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {error}
                  </div>
                </div>
              )}

              <div
                className="tiny muted"
                style={{
                  lineHeight: 1.5,
                }}
              >
                Click anywhere on the map to
                manually set a new forecast
                origin.
              </div>
            </div>
          </Card>

          <Card solid>
            <CardHead
              kt="MODEL STATUS"
              title="Forecast engine"
            />

            <div
              style={{
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                  }}
                >
                  ✓ RK2 Physics
                </span>

                <Badge
                  tone="b-green"
                  dot
                >
                  ACTIVE
                </Badge>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color:
                      'var(--ink-2)',
                  }}
                >
                  ○ ML Residual
                </span>

                <Badge tone="b-plain">
                  DISABLED
                </Badge>
              </div>

              <div
                className="tiny muted"
                style={{
                  borderTop:
                    '1px solid var(--line-faint)',
                  paddingTop: 10,
                  lineHeight: 1.5,
                }}
              >
                Insufficient validated
                trajectory data. Physics-only
                RK2 forecasting is active.
              </div>

              {forecast && (
                <Kv
                  k="Model version"
                  v={
                    forecast.model
                      .version
                  }
                  mono
                />
              )}
            </div>
          </Card>

          {forecast && (
            <Card solid>
              <CardHead
                kt="PLAYBACK"
                title="Trajectory animation"
              />

              <div
                className="row wrap"
                style={{
                  gap: 7,
                }}
              >
                <Button
                  size="sm"
                  variant="primary"
                  onClick={
                    togglePlayback
                  }
                >
                  {playing
                    ? 'Pause'
                    : 'Play'}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={replay}
                >
                  Replay
                </Button>

                <span
                  className="tiny muted"
                  style={{
                    marginLeft: 4,
                  }}
                >
                  {animationIndex !=
                    null
                    ? `${animationIndex + 1} / ${forecast.trajectory.length}`
                    : 'Ready'}
                </span>
              </div>
            </Card>
          )}
        </div>

        {/* MAP + DATA */}
        <div
          style={{
            display: 'grid',
            gap: 14,
          }}
        >
          <DriftForecastMap
            start={
              latitude &&
              longitude
                ? {
                    latitude:
                      Number(latitude),
                    longitude:
                      Number(longitude),
                  }
                : null
            }
            trajectory={
              forecast?.trajectory ??
              []
            }
            milestones={
              forecast?.milestones ??
              []
            }
            uncertainty={
              forecast?.uncertainty ??
              []
            }
            currentVectors={
              forecast?.current_vectors ??
              []
            }
            animationIndex={
              animationIndex
            }
            onSelectLocation={
              setLocation
            }
          />

          {!forecast && !loading && (
            <Card solid>
              <div
                style={{
                  padding: 18,
                }}
              >
                <div
                  className="tiny upper acc"
                  style={{
                    marginBottom: 6,
                  }}
                >
                  Awaiting forecast
                </div>

                <h3
                  style={{
                    margin:
                      '0 0 6px',
                  }}
                >
                  Select a ghost-net
                  origin
                </h3>

                <p
                  className="muted"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Choose an existing
                  geolocated ghost-net
                  detection, enter
                  coordinates, or click
                  directly on the map.
                </p>
              </div>
            </Card>
          )}

          {loading && (
            <Card solid>
              <LoadingBlock text="Retrieving ocean currents and integrating RK2 trajectory…" />
            </Card>
          )}

          {forecast && (
            <>
              {/* MILESTONES */}
              <Card solid>
                <CardHead
                  kt="FORECAST MILESTONES"
                  title="Predicted positions"
                />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(3, minmax(0, 1fr))',
                    gap: 10,
                  }}
                >
                  {forecast.milestones.map(
                    (milestone) => (
                      <div
                        key={
                          milestone.hours
                        }
                        className="card"
                        style={{
                          padding: 14,
                          background:
                            'var(--panel2)',
                        }}
                      >
                        <div
                          className="tiny upper acc"
                        >
                          +
                          {
                            milestone.hours
                          }
                          h
                        </div>

                        <div
                          className="mono"
                          style={{
                            fontSize: 15,
                            margin:
                              '8px 0',
                          }}
                        >
                          {formatCoord(
                            milestone.latitude,
                          )}
                        </div>

                        <div
                          className="mono"
                          style={{
                            fontSize: 15,
                          }}
                        >
                          {formatCoord(
                            milestone.longitude,
                          )}
                        </div>

                        <div
                          className="tiny muted"
                          style={{
                            marginTop: 8,
                          }}
                        >
                          {formatDate(
                            milestone.timestamp,
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </Card>

              {/* FORECAST SUMMARY */}
              <Card solid>
                <CardHead
                  kt="FORECAST SUMMARY"
                  title="Trajectory overview"
                />

                <div
                  className="drift-summary-grid"
                  style={{
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div className="card" style={{ padding: 13 }}>
                    <div className="tiny upper muted">
                      ORIGIN
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 14,
                        marginTop: 7,
                      }}
                    >
                      {formatCoord(
                        Number(latitude),
                      )}{' '}
                      /{' '}
                      {formatCoord(
                        Number(longitude),
                      )}
                    </div>
                  </div>

                  <div className="card" style={{ padding: 13 }}>
                    <div className="tiny upper muted">
                      HORIZON
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        marginTop: 7,
                      }}
                    >
                      {forecast.request.horizon_hours} hours
                    </div>
                  </div>

                  <div className="card" style={{ padding: 13 }}>
                    <div className="tiny upper muted">
                      INTEGRATION
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        marginTop: 7,
                      }}
                    >
                      RK2 ·{' '}
                      {forecast.request.timestep_minutes}
                      min
                    </div>
                  </div>

                  <div className="card" style={{ padding: 13 }}>
                    <div className="tiny upper muted">
                      OCEAN SOURCE
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        marginTop: 7,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {forecast.data_sources.provider ??
                        '—'}
                    </div>
                  </div>
                </div>
              </Card>

              {/* CURRENT OCEAN CONDITIONS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(2, minmax(0, 1fr))',
                  gap: 14,
                }}
              >
                <Card solid>
                  <CardHead
                    kt="OCEAN CONDITIONS"
                    title="Current state"
                  />

                  <div
                    style={{
                      display: 'grid',
                      gap: 11,
                    }}
                  >
                    <Kv
                      k="Current speed"
                      v={formatSpeed(
                        ocean?.current_speed_ms,
                      )}
                    />

                    <Kv
                      k="Eastward velocity"
                      v={formatSpeed(
                        ocean?.uo_ms,
                      )}
                    />

                    <Kv
                      k="Northward velocity"
                      v={formatSpeed(
                        ocean?.vo_ms,
                      )}
                    />

                    <Kv
                      k="Sea-surface temperature"
                      v={
                        ocean?.temperature_c !=
                        null
                          ? `${ocean.temperature_c.toFixed(1)} °C`
                          : '—'
                      }
                    />

                    <Kv
                      k="Mixed-layer depth"
                      v={
                        ocean?.mixed_layer_depth_m !=
                        null
                          ? `${ocean.mixed_layer_depth_m.toFixed(1)} m`
                          : '—'
                      }
                    />
                  </div>
                </Card>

                <Card solid>
                  <CardHead
                    kt="ANIMATION STATE"
                    title="Forecast position"
                  />

                  {currentTrajectoryPoint ? (
                    <div
                      style={{
                        display: 'grid',
                        gap: 11,
                      }}
                    >
                      <Kv
                        k="Timestamp"
                        v={formatDate(
                          currentTrajectoryPoint.timestamp,
                        )}
                        mono
                      />

                      <Kv
                        k="Latitude"
                        v={formatCoord(
                          currentTrajectoryPoint.latitude,
                        )}
                        mono
                      />

                      <Kv
                        k="Longitude"
                        v={formatCoord(
                          currentTrajectoryPoint.longitude,
                        )}
                        mono
                      />

                      <Kv
                        k="Current speed"
                        v={formatSpeed(
                          currentTrajectoryPoint.speed_ms,
                        )}
                      />

                      <Kv
                        k="95% uncertainty"
                        v={
                          currentUncertainty
                            ?.radius_95_km !=
                          null
                            ? `${currentUncertainty.radius_95_km.toFixed(2)} km`
                            : currentUncertainty
                                ?.radius_95_m !=
                              null
                            ? `${(
                                currentUncertainty.radius_95_m /
                                1000
                              ).toFixed(
                                2,
                              )} km`
                            : '—'
                        }
                      />
                    </div>
                  ) : (
                    <div className="muted">
                      Press Play to animate
                      the forecast.
                    </div>
                  )}
                </Card>
              </div>

              {/* RETENTION */}
<Card solid>
  <CardHead
    kt="RETENTION / HOTSPOT INTELLIGENCE"
    title="Local retention diagnostics"
    right={
      <Badge
        tone={
          forecast.retention.status === 'scored'
            ? 'b-green'
            : 'b-plain'
        }
      >
        {forecast.retention.status === 'scored'
          ? 'SCORED'
          : 'UNSCORED'}
      </Badge>
    }
  />

  {forecast.retention.status === 'scored' ? (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '150px 1fr',
        gap: 18,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 42,
          color: 'var(--accent)',
        }}
      >
        {forecast.retention.index}
        <span
          style={{
            fontSize: 14,
            color: 'var(--ink-3)',
          }}
        >
          /100
        </span>
      </div>

      <div>
        <p
          className="muted"
          style={{
            margin: '0 0 10px',
            fontSize: 13,
          }}
        >
          Computed from the configured spatial
          current diagnostics and retention
          weights.
        </p>

        {forecast.retention.components && (
          <div
            className="row wrap"
            style={{
              gap: 8,
            }}
          >
            {Object.entries(
              forecast.retention.components,
            ).map(([key, value]) => (
              <Badge key={key}>
                {key}: {value.toFixed(3)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : (
    <div
      style={{
        display: 'grid',
        gap: 7,
      }}
    >
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
        }}
      >
        Retention index is currently unscored.
      </div>

      <div
        className="muted"
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {forecast.retention.reason ??
          'Required spatial current diagnostics or explicitly configured weights are unavailable.'}
      </div>

      {forecast.retention.error && (
        <div className="tiny muted">
          Source detail: {forecast.retention.error}
        </div>
      )}
    </div>
  )}
</Card>

              {/* DATA PROVENANCE */}
              <Card solid>
                <CardHead
                  kt="DATA PROVENANCE"
                  title="Forecast source & quality"
                />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(2, minmax(0, 1fr))',
                    gap: 12,
                  }}
                >
                  <Kv
                    k="Ocean provider"
                    v={
                      forecast
                        .data_sources
                        .provider ??
                      '—'
                    }
                  />

                  <Kv
                    k="Requested start"
                    v={formatDate(
                      forecast
                        .data_sources
                        .requested_start_time,
                    )}
                    mono
                  />

                  <Kv
                    k="Source timestamps"
                    v={
                      forecast
                        .data_sources
                        .actual_source_timestamps
                        ?.length ??
                      0
                    }
                  />

                  <Kv
                    k="Trajectory points"
                    v={
                      forecast
                        .trajectory
                        .length
                    }
                  />
                </div>

                {forecast.warnings.length >
                  0 && (
                  <div
                    style={{
                      marginTop: 14,
                      borderTop:
                        '1px solid var(--line-faint)',
                      paddingTop: 12,
                    }}
                  >
                    <div
                      className="tiny upper muted"
                      style={{
                        marginBottom: 7,
                      }}
                    >
                      Scientific / data warnings
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      {forecast.warnings.map(
                        (warning, index) => (
                          <div
                            key={`${warning}-${index}`}
                            className="tiny muted"
                            style={{
                              lineHeight: 1.45,
                            }}
                          >
                            • {warning}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* LIMITATION */}
              <Card>
                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div
                    className="tiny upper acc"
                  >
                    SCIENTIFIC LIMITATION
                  </div>

                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color:
                        'var(--ink-2)',
                    }}
                  >
                    This trajectory is a
                    model-based estimate driven
                    by available ocean-current
                    data and RK2 numerical
                    integration. It does not
                    represent a validated
                    ghost-net-specific error
                    benchmark. Windage, wave
                    forcing, net geometry,
                    biofouling, vertical movement,
                    unresolved currents and ocean
                    model error can affect actual
                    drift.
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <style>{`
        .drift-page-grid {
          grid-template-columns:
            minmax(290px, 350px)
            minmax(0, 1fr);
        }

        .drift-summary-grid {
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
        }

        @media (max-width: 1100px) {
          .drift-page-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .drift-summary-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 480px) {
          .drift-summary-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}