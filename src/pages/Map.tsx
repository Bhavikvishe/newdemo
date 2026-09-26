import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import {
  CLASS_LIST,
  CLASS_META,
  fmtCoordinate,
  fmtDT,
} from '../lib/mock';
import {
  clsLabel,
  riskLabel,
} from '../lib/labels';

import {
  PageHead,
  Card,
  CardHead,
  Drawer,
  ChipGroup,
  RiskBadge,
  ClassBadge,
  Button,
  Select,
  Field,
} from '../lib/ui';

import { Link } from '../lib/router';

import {
  IconScan,
  IconPin,
  IconTarget,
} from '../components/Icons';

import { GeoOceanMap } from '../components/GeoMap';

import type {
  Detection,
  DetectionClass,
  RiskLevel,
} from '../types';

import {
  LAT_MIN,
  LAT_MAX,
  LON_MIN,
  LON_MAX,
  W,
  H,
  project,
  haversineKm,
  haversineNm,
  bearingDeg,
  compass,
  gcPoints,
  fmtETA,
  fmtDistanceKm,
  fmtDistanceNm,
} from '../lib/geo';

const RISK_ALL: RiskLevel[] = [
  'critical',
  'high',
  'medium',
  'low',
];

interface Cluster {
  key: string;
  lat: number;
  lng: number;
  detections: Detection[];
}

interface NavigationTarget {
  lat: number;
  lng: number;
  label: string;
  src: 'manual' | 'detection';
  detectionId?: string;
}

interface VesselPosition {
  lat: number;
  lng: number;
  accuracy?: number;
}

const DEFAULT_SIMULATION_ORIGIN: VesselPosition = {
  lat: 15.42,
  lng: 73.62,
};

function storeNavigationTarget(
  target: NavigationTarget | null,
) {
  try {
    if (target) {
      localStorage.setItem(
        'oceonix.nav.target',
        JSON.stringify(target),
      );
    } else {
      localStorage.removeItem(
        'oceonix.nav.target',
      );
    }
  } catch {
    // Ignore localStorage errors.
  }
}

function readNavigationTarget(): NavigationTarget | null {
  try {
    const raw = localStorage.getItem(
      'oceonix.nav.target',
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(
      raw,
    ) as Partial<NavigationTarget>;

    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number'
    ) {
      return null;
    }

    if (
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lng)
    ) {
      return null;
    }

    return {
      lat: parsed.lat,
      lng: parsed.lng,
      label:
        typeof parsed.label === 'string'
          ? parsed.label
          : 'Navigation target',
      src:
        parsed.src === 'detection'
          ? 'detection'
          : 'manual',
      detectionId:
        typeof parsed.detectionId === 'string'
          ? parsed.detectionId
          : undefined,
    };
  } catch {
    return null;
  }
}

function isInsideMapBounds(
  lat: number,
  lng: number,
) {
  return (
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lng >= LON_MIN &&
    lng <= LON_MAX
  );
}

export function MapPage() {
  const store = useStore();
  const {
    detections,
    language,
  } = store;

  const t = makeT(language);

  /*
   * -------------------------------------------------------
   * Detection map state
   * -------------------------------------------------------
   */

  const [classes, setClasses] =
    useState<DetectionClass[]>(
      [...CLASS_LIST],
    );

  const [risks, setRisks] =
    useState<RiskLevel[]>(
      [...RISK_ALL],
    );

  const [timeWindow, setTimeWindow] =
    useState('all');

  const [layer, setLayer] =
    useState<
      'sonar' | 'satellite' | 'chart'
    >('sonar');

  const [selected, setSelected] =
    useState<Cluster | null>(null);

  const [search, setSearch] =
    useState('');

  /*
   * -------------------------------------------------------
   * Navigation state
   * -------------------------------------------------------
   */

  const [savedTarget] =
    useState<NavigationTarget | null>(
      readNavigationTarget,
    );

  const [target, setTarget] =
    useState<NavigationTarget | null>(
      savedTarget,
    );

  const [pickedDetection, setPickedDetection] =
    useState(
      savedTarget?.detectionId ?? '',
    );

  const [latInput, setLatInput] =
    useState(
      savedTarget
        ? String(savedTarget.lat)
        : '',
    );

  const [lngInput, setLngInput] =
    useState(
      savedTarget
        ? String(savedTarget.lng)
        : '',
    );

  /*
   * -------------------------------------------------------
   * Vessel GPS
   * -------------------------------------------------------
   */

  const [myPosition, setMyPosition] =
    useState<VesselPosition | null>(
      null,
    );

  const [locationState, setLocationState] =
    useState<
      'idle' |
      'locating' |
      'live' |
      'denied'
    >('idle');

  const [gpsEnabled, setGpsEnabled] =
    useState(false);

  const [vesselSpeed, setVesselSpeed] =
    useState(12);

  const watchRef =
    useRef<number | null>(null);

  /*
   * -------------------------------------------------------
   * Persist navigation target
   * -------------------------------------------------------
   */

  useEffect(() => {
    storeNavigationTarget(target);
  }, [target]);

  /*
   * -------------------------------------------------------
   * GPS tracking
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!gpsEnabled) {
      return;
    }

    if (
      !(
        'geolocation' in
        navigator
      )
    ) {
      setLocationState(
        'denied',
      );
      return;
    }

    setLocationState(
      'locating',
    );

    watchRef.current =
      navigator.geolocation.watchPosition(
        (position) => {
          setMyPosition({
            lat:
              position.coords
                .latitude,
            lng:
              position.coords
                .longitude,
            accuracy:
              position.coords
                .accuracy,
          });

          setLocationState(
            'live',
          );
        },
        () => {
          setLocationState(
            'denied',
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000,
        },
      );

    return () => {
      if (
        watchRef.current !==
        null
      ) {
        navigator.geolocation.clearWatch(
          watchRef.current,
        );
      }

      watchRef.current = null;
    };
  }, [gpsEnabled]);

  const toggleGps = () => {
    if (
      !gpsEnabled &&
      !(
        'geolocation' in
        navigator
      )
    ) {
      setLocationState(
        'denied',
      );
      return;
    }

    setGpsEnabled(
      (enabled) => !enabled,
    );
  };

  /*
   * -------------------------------------------------------
   * Navigation origin
   *
   * Real browser/device GPS is preferred.
   * If unavailable, the UI explicitly treats this as
   * simulation/offline origin.
   * -------------------------------------------------------
   */

  const origin =
    myPosition ??
    DEFAULT_SIMULATION_ORIGIN;

  const usingSimulationOrigin =
    !myPosition;

  /*
   * -------------------------------------------------------
   * Navigation metrics
   * -------------------------------------------------------
   */

  const navigationMetrics =
    useMemo(() => {
      if (!target) {
        return null;
      }

      const km =
        haversineKm(
          origin.lat,
          origin.lng,
          target.lat,
          target.lng,
        );

      const nm =
        haversineNm(
          origin.lat,
          origin.lng,
          target.lat,
          target.lng,
        );

      const bearing =
        bearingDeg(
          origin.lat,
          origin.lng,
          target.lat,
          target.lng,
        );

      return {
        km,
        nm,
        bearing,
        eta: fmtETA(
          nm,
          vesselSpeed,
        ),
      };
    }, [
      origin.lat,
      origin.lng,
      target,
      vesselSpeed,
    ]);

  /*
   * -------------------------------------------------------
   * Great-circle navigation route
   * -------------------------------------------------------
   */

  const navigationRoute =
    useMemo(() => {
      if (!target) {
        return [];
      }

      return gcPoints(
        origin.lat,
        origin.lng,
        target.lat,
        target.lng,
        40,
      );
    }, [
      origin.lat,
      origin.lng,
      target,
    ]);

  /*
   * -------------------------------------------------------
   * Navigation helpers
   * -------------------------------------------------------
   */

  const clearNavigationTarget =
    () => {
      setTarget(null);
      setPickedDetection('');
      setLatInput('');
      setLngInput('');
    };

  const applyNavigationTarget =
    (
      nextTarget: NavigationTarget,
    ) => {
      setTarget(nextTarget);

      setPickedDetection(
        nextTarget.detectionId ??
          '',
      );

      setLatInput(
        String(nextTarget.lat),
      );

      setLngInput(
        String(nextTarget.lng),
      );
    };

  const submitManualTarget =
    () => {
      const latitude =
        Number(latInput);

      const longitude =
        Number(lngInput);

      if (
        !Number.isFinite(
          latitude,
        ) ||
        !Number.isFinite(
          longitude,
        )
      ) {
        return;
      }

      if (
        !isInsideMapBounds(
          latitude,
          longitude,
        )
      ) {
        return;
      }

      applyNavigationTarget({
        lat: latitude,
        lng: longitude,
        label: `TARGET · ${fmtCoordinate(
          latitude,
          longitude,
        )}`,
        src: 'manual',
      });
    };

  const selectDetectionTarget =
    (id: string) => {
      setPickedDetection(id);

      if (!id) {
        return;
      }

      const detection =
        detections.find(
          (item) =>
            item.id === id,
        );

      if (!detection) {
        return;
      }

      applyNavigationTarget({
        lat:
          detection.gps
            .latitude,
        lng:
          detection.gps
            .longitude,
        label: clsLabel(
          detection.className,
          language,
        ),
        src: 'detection',
        detectionId:
          detection.id,
      });
    };

  /*
   * -------------------------------------------------------
   * GPS labels
   * -------------------------------------------------------
   */

  const locationLabel =
    locationState === 'live'
      ? t('ngx.locLive')
      : locationState ===
          'locating'
        ? t(
            'ngx.locLocating',
          )
        : locationState ===
            'denied'
          ? t(
              'ngx.locDenied',
            )
          : t('ngx.locSim');

  const locationTone =
    locationState === 'live'
      ? 'var(--low)'
      : locationState ===
          'locating'
        ? 'var(--medium)'
        : locationState ===
            'denied'
          ? 'var(--critical)'
          : 'var(--accent)';

  /*
   * -------------------------------------------------------
   * Detection filtering
   * -------------------------------------------------------
   */

  const filtered =
    useMemo(() => {
      const cutoff =
        timeWindow === 'all'
          ? 0
          : timeWindow === '24h'
            ? 24 *
              3600e3
            : timeWindow === '7d'
              ? 7 *
                24 *
                3600e3
              : 30 *
                24 *
                3600e3;

      const now =
        Date.now();

      return detections.filter(
        (detection) => {
          const matchesClass =
            classes.includes(
              detection.className,
            );

          const matchesRisk =
            risks.includes(
              detection.riskLevel,
            );

          const timestamp =
            new Date(
              detection.detectionTime,
            ).getTime();

          const matchesTime =
            cutoff === 0 ||
            now - timestamp <
              cutoff;

          return (
            matchesClass &&
            matchesRisk &&
            matchesTime
          );
        },
      );
    }, [
      detections,
      classes,
      risks,
      timeWindow,
    ]);

  /*
   * -------------------------------------------------------
   * Detection clustering
   * -------------------------------------------------------
   *
   * Two decimal places are retained for clustering so
   * nearby detections are grouped without modifying their
   * actual stored GPS coordinates.
   * -------------------------------------------------------
   */

  const clusters =
    useMemo(() => {
      const groups =
        new Map<
          string,
          Cluster
        >();

      filtered.forEach(
        (detection) => {
          const key =
            `${detection.gps.latitude.toFixed(2)}|` +
            `${detection.gps.longitude.toFixed(2)}`;

          const existing =
            groups.get(key);

          if (existing) {
            existing.detections.push(
              detection,
            );
            return;
          }

          groups.set(key, {
            key,
            lat:
              detection.gps
                .latitude,
            lng:
              detection.gps
                .longitude,
            detections: [
              detection,
            ],
          });
        },
      );

      return Array.from(
        groups.values(),
      )
        .map((cluster) => ({
          ...cluster,
          detections: [
            ...cluster.detections,
          ].sort((a, b) =>
            a.detectionTime <
            b.detectionTime
              ? 1
              : -1,
          ),
        }))
        .sort(
          (a, b) =>
            b.detections.length -
            a.detections.length,
        );
    }, [filtered]);

  /*
   * -------------------------------------------------------
   * Search focus
   * -------------------------------------------------------
   */

  const focus =
    useMemo(() => {
      const query =
        search.trim().toUpperCase();

      if (!query) {
        return null;
      }

      const found =
        detections.find(
          (detection) =>
            detection.id
              .toUpperCase()
              .includes(query),
        );

      if (!found) {
        return null;
      }

      return (
        clusters.find(
          (cluster) =>
            cluster.detections.some(
              (detection) =>
                detection.id ===
                found.id,
            ),
        ) ?? null
      );
    }, [
      search,
      detections,
      clusters,
    ]);

  /*
   * -------------------------------------------------------
   * Cluster helpers
   * -------------------------------------------------------
   */

  const dominant = (
    cluster: Cluster,
  ): DetectionClass => {
    const counts =
      new Map<
        DetectionClass,
        number
      >();

    cluster.detections.forEach(
      (detection) => {
        counts.set(
          detection.className,
          (counts.get(
            detection.className,
          ) ?? 0) + 1,
        );
      },
    );

    const first =
      Array.from(
        counts.entries(),
      ).sort(
        (a, b) =>
          b[1] - a[1],
      )[0];

    return (
      first?.[0] ??
      'shipwreck'
    );
  };

  const worstRisk = (
    cluster: Cluster,
  ): RiskLevel => {
    const values =
      cluster.detections.map(
        (detection) =>
          detection.riskLevel,
      );

    if (
      values.includes(
        'critical',
      )
    ) {
      return 'critical';
    }

    if (
      values.includes('high')
    ) {
      return 'high';
    }

    if (
      values.includes('medium')
    ) {
      return 'medium';
    }

    return 'low';
  };

  /*
   * -------------------------------------------------------
   * Map presentation
   * -------------------------------------------------------
   */

  const layerBg =
    layer === 'chart'
      ? 'linear-gradient(180deg, #0d2a44, #071a2e)'
      : layer === 'satellite'
        ? 'linear-gradient(180deg, #04101f, #02080f)'
        : 'radial-gradient(60% 80% at 50% 20%, #0e3352, #071a2e 60%, #050f1b)';

  const fitPoints =
    target
      ? ([
          [
            Math.min(
              origin.lat,
              target.lat,
            ),
            Math.min(
              origin.lng,
              target.lng,
            ),
          ],
          [
            Math.max(
              origin.lat,
              target.lat,
            ),
            Math.max(
              origin.lng,
              target.lng,
            ),
          ],
        ] as [
          number,
          number,
        ][])
      : ([
          [
            LAT_MIN,
            LON_MIN,
          ],
          [
            LAT_MAX,
            LON_MAX,
          ],
        ] as [
          number,
          number,
        ][]);

  return (
    <div>
      <PageHead
        kicker={t(
          'map.title',
        )}
        title={t(
          'nav.map',
        )}
        sub={t(
          'map.sub',
        )}
        right={
          <div
            className="row wrap"
            style={{
              gap: 8,
            }}
          >
            {(
              [
                [
                  'sonar',
                  t(
                    'map.sonar',
                  ),
                ],
                [
                  'chart',
                  t(
                    'map.topographic',
                  ),
                ],
                [
                  'satellite',
                  t(
                    'map.satellite',
                  ),
                ],
              ] as const
            ).map(
              ([
                value,
                label,
              ]) => (
                <button
                  key={value}
                  className={`chip${
                    layer ===
                    value
                      ? ' on'
                      : ''
                  }`}
                  onClick={() =>
                    setLayer(
                      value,
                    )
                  }
                >
                  {label}
                </button>
              ),
            )}
          </div>
        }
      />

      <div
        className="grid cols-12"
        style={{
          gap: 16,
        }}
      >
        {/* =================================================
            MAP
        ================================================== */}

        <div className="span-8">
          <GeoOceanMap
            style={{
              background:
                layerBg,
            }}
            fitPts={fitPoints}
            fitKey={
              target
                ? `nav-${origin.lat.toFixed(
                    3,
                  )}-${origin.lng.toFixed(
                    3,
                  )}-${target.lat.toFixed(
                    3,
                  )}-${target.lng.toFixed(
                    3,
                  )}`
                : 'detection-map'
            }
            connectingLabel={t(
              'map.gisConnecting',
            )}
            markers={clusters.map(
              (cluster) => ({
                id: cluster.key,
                lat:
                  cluster.lat,
                lng:
                  cluster.lng,
                color:
                  CLASS_META[
                    dominant(
                      cluster,
                    )
                  ].color,
                count:
                  cluster
                    .detections
                    .length,
                selected:
                  selected?.key ===
                  cluster.key,
                focus:
                  focus?.key ===
                  cluster.key,
                onClick: () =>
                  setSelected(
                    cluster,
                  ),
              }),
            )}
            route={
              target &&
              navigationRoute.length >
                1
                ? {
                    points:
                      navigationRoute.map(
                        (
                          point,
                        ) => [
                          point.lat,
                          point.lng,
                        ],
                      ),
                    color:
                      'var(--accent)',
                    dashed: true,
                  }
                : undefined
            }
            fallback={
              <svg
                className="map-canvas"
                viewBox={`0 0 ${W} ${H}`}
                style={{
                  height:
                    'auto',
                }}
              >
                <defs>
                  <radialGradient
                    id="map-shelf"
                    cx="0.5"
                    cy="0.5"
                    r="0.5"
                  >
                    <stop
                      offset="0%"
                      stopColor="#2a6f9e"
                      stopOpacity="0.5"
                    />
                    <stop
                      offset="100%"
                      stopColor="transparent"
                    />
                  </radialGradient>
                </defs>

                {/* Graticule */}

                {Array.from(
                  {
                    length: 9,
                  },
                  (
                    _,
                    index,
                  ) => {
                    const lat =
                      LAT_MIN +
                      index * 2;

                    const y =
                      ((LAT_MAX -
                        lat) /
                        (LAT_MAX -
                          LAT_MIN)) *
                        (H - 40) +
                      20;

                    return (
                      <g
                        key={`lat-${lat}`}
                      >
                        <line
                          x1={20}
                          x2={W - 20}
                          y1={y}
                          y2={y}
                          stroke="var(--grid-line)"
                          strokeWidth="1"
                        />

                        <text
                          x={14}
                          y={y + 3}
                          fontSize="11"
                          fill="var(--ink-3)"
                          fontFamily="var(--font-mono)"
                        >
                          {lat}°
                        </text>
                      </g>
                    );
                  },
                )}

                {Array.from(
                  {
                    length: 10,
                  },
                  (
                    _,
                    index,
                  ) => {
                    const lng =
                      LON_MIN +
                      index * 3;

                    const x =
                      ((lng -
                        LON_MIN) /
                        (LON_MAX -
                          LON_MIN)) *
                        (W - 40) +
                      20;

                    return (
                      <g
                        key={`lng-${lng}`}
                      >
                        <line
                          x1={x}
                          x2={x}
                          y1={20}
                          y2={H - 20}
                          stroke="var(--grid-line)"
                          strokeWidth="1"
                        />

                        <text
                          x={x - 8}
                          y={H - 8}
                          fontSize="11"
                          fill="var(--ink-3)"
                          fontFamily="var(--font-mono)"
                        >
                          {lng}°E
                        </text>
                      </g>
                    );
                  },
                )}

                {/* Detection markers */}

                {clusters.map(
                  (cluster) => {
                    const p =
                      project(
                        cluster.lat,
                        cluster.lng,
                      );

                    const color =
                      CLASS_META[
                        dominant(
                          cluster,
                        )
                      ].color;

                    return (
                      <g
                        key={
                          cluster.key
                        }
                        transform={`translate(${p.x},${p.y})`}
                      >
                        <circle
                          r={
                            cluster
                              .detections
                              .length >
                            1
                              ? 10
                              : 7
                          }
                          fill={
                            color
                          }
                          fillOpacity={
                            0.35
                          }
                          stroke={
                            color
                          }
                          strokeWidth={
                            2
                          }
                        />

                        <circle
                          r={3}
                          fill={
                            color
                          }
                        />

                        {cluster
                          .detections
                          .length >
                          1 && (
                          <text
                            x={13}
                            y={4}
                            fontSize="10"
                            fill="var(--ink)"
                            fontFamily="var(--font-mono)"
                          >
                            {
                              cluster
                                .detections
                                .length
                            }
                          </text>
                        )}
                      </g>
                    );
                  },
                )}

                {/* Search focus */}

                {focus && (
                  <g
                    transform={`translate(${
                      project(
                        focus.lat,
                        focus.lng,
                      ).x
                    },${
                      project(
                        focus.lat,
                        focus.lng,
                      ).y
                    })`}
                  >
                    <circle
                      r={18}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  </g>
                )}

                {/* Vessel origin */}

                <g
                  transform={`translate(${
                    project(
                      origin.lat,
                      origin.lng,
                    ).x
                  },${
                    project(
                      origin.lat,
                      origin.lng,
                    ).y
                  })`}
                >
                  <circle
                    r={7}
                    fill="var(--accent)"
                    fillOpacity="0.35"
                    stroke="var(--accent)"
                    strokeWidth="2"
                  />

                  <circle
                    r={2.5}
                    fill="var(--accent)"
                  />
                </g>

                {/* Target */}

                {target && (
                  <g
                    transform={`translate(${
                      project(
                        target.lat,
                        target.lng,
                      ).x
                    },${
                      project(
                        target.lat,
                        target.lng,
                      ).y
                    })`}
                  >
                    <circle
                      r={20}
                      fill="none"
                      stroke="var(--critical)"
                      strokeOpacity="0.8"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                    />

                    <circle
                      r={8}
                      fill="var(--critical)"
                      fillOpacity="0.35"
                      stroke="var(--critical)"
                      strokeWidth="2"
                    />

                    <text
                      y={-26}
                      textAnchor="middle"
                      fontSize="10.5"
                      fill="var(--critical)"
                      fontFamily="var(--font-mono)"
                    >
                      {target.label
                        .toUpperCase()
                        .slice(
                          0,
                          18,
                        )}
                    </text>
                  </g>
                )}

                {/* Navigation route */}

                {navigationRoute.length >
                  1 && (
                  <path
                    d={navigationRoute
                      .map(
                        (
                          point,
                          index,
                        ) => {
                          const p =
                            project(
                              point.lat,
                              point.lng,
                            );

                          return `${
                            index ===
                            0
                              ? 'M'
                              : 'L'
                          }${p.x.toFixed(
                            1,
                          )},${p.y.toFixed(
                            1,
                          )}`;
                        },
                      )
                      .join(' ')}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeOpacity="0.9"
                    strokeDasharray="8 6"
                  />
                )}
              </svg>
            }
          >
            <div className="depth-scale" />

            <div className="map-legend">
              <span className="ml">
                <span
                  className="mk-swat"
                  style={{
                    background:
                      'var(--critical)',
                  }}
                />
                {t(
                  'risk.critical',
                )}
              </span>

              <span className="ml">
                <span
                  className="mk-swat"
                  style={{
                    background:
                      'var(--high)',
                  }}
                />
                {t(
                  'risk.high',
                )}
              </span>

              <span className="ml">
                <span
                  className="mk-swat"
                  style={{
                    background:
                      'var(--medium)',
                  }}
                />
                {t(
                  'risk.medium',
                )}
              </span>

              <span className="ml">
                <span
                  className="mk-swat"
                  style={{
                    background:
                      'var(--marine)',
                  }}
                />
                {t(
                  'map.legend.marine',
                )}
              </span>

              {target && (
                <span className="ml">
                  <span
                    style={{
                      width: 16,
                      height: 2,
                      background:
                        'var(--accent)',
                      display:
                        'inline-block',
                    }}
                  />

                  {t(
                    'ngx.legendRoute',
                  )}
                </span>
              )}

              <span className="ml mono">
                {t(
                  'map.legend.grid',
                )}
              </span>
            </div>

            <div
              className="ext"
              style={{
                position:
                  'absolute',
                right: 22,
                top: 14,
                fontFamily:
                  'var(--font-mono)',
                fontSize: 10,
                color:
                  'var(--ink-3)',
              }}
            >
              {t(
                'map.basemap',
              )}{' '}
              ·{' '}
              {t(
                layer ===
                  'sonar'
                  ? 'map.sonar'
                  : layer ===
                      'chart'
                    ? 'map.topographic'
                    : 'map.satellite',
              ).toUpperCase()}
            </div>
          </GeoOceanMap>
        </div>

        {/* =================================================
            RIGHT SIDE
        ================================================== */}

        <div
          className="span-4 stack"
          style={{
            gap: 16,
          }}
        >
          {/* Navigation target */}

          <Card>
            <CardHead
              kt={t(
                'ngx.targetLockKt',
              )}
              title={t(
                'ngx.debrisCoords',
              )}
            />

            <div
              className="stack"
              style={{
                gap: 12,
              }}
            >
              <Field
                label={t(
                  'ngx.pickFromDet',
                )}
              >
                <Select
                  value={
                    pickedDetection
                  }
                  onChange={
                    selectDetectionTarget
                  }
                  options={[
                    {
                      value: '',
                      label: t(
                        'ngx.manualEntry',
                      ),
                    },
                    ...detections.map(
                      (
                        detection,
                      ) => ({
                        value:
                          detection.id,
                        label: t(
                          'ngx.detOption',
                          {
                            id:
                              detection.id,
                            cls: clsLabel(
                              detection.className,
                              language,
                            ),
                            coords:
                              fmtCoordinate(
                                detection
                                  .gps
                                  .latitude,
                                detection
                                  .gps
                                  .longitude,
                              ),
                          },
                        ),
                      }),
                    ),
                  ]}
                />
              </Field>

              <div
                className="row"
                style={{
                  gap: 10,
                }}
              >
                <Field
                  label={t(
                    'ngx.latField',
                  )}
                >
                  <input
                    className="input"
                    value={
                      latInput
                    }
                    onChange={(
                      event,
                    ) =>
                      setLatInput(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder={t(
                      'ngx.latPh',
                    )}
                  />
                </Field>

                <Field
                  label={t(
                    'ngx.lngField',
                  )}
                >
                  <input
                    className="input"
                    value={
                      lngInput
                    }
                    onChange={(
                      event,
                    ) =>
                      setLngInput(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder={t(
                      'ngx.lngPh',
                    )}
                  />
                </Field>
              </div>

              <div
                className="row"
                style={{
                  gap: 8,
                }}
              >
                <Button
                  variant="secondary"
                  block
                  onClick={
                    submitManualTarget
                  }
                >
                  <IconTarget
                    size={15}
                  />
                  {t(
                    'ngx.lockTarget',
                  )}
                </Button>

                {target && (
                  <Button
                    variant="ghost"
                    onClick={
                      clearNavigationTarget
                    }
                  >
                    {t(
                      'common.clear',
                    )}
                  </Button>
                )}
              </div>

              <div
                className="tiny muted"
                style={{
                  lineHeight: 1.5,
                }}
              >
                {t(
                  'ngx.rangeNote',
                  {
                    latMin:
                      LAT_MIN,
                    latMax:
                      LAT_MAX,
                    lonMin:
                      LON_MIN,
                    lonMax:
                      LON_MAX,
                  },
                )}
              </div>

              {target && (
                <div
                  className="kv"
                  style={{
                    marginTop: 2,
                  }}
                >
                  <span className="k">
                    {t(
                      'ngx.lockedTarget',
                    )}
                  </span>

                  <span className="v mono">
                    {fmtCoordinate(
                      target.lat,
                      target.lng,
                    )}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* GPS */}

          <Card>
            <CardHead
              kt={t(
                'ngx.myPosKt',
              )}
              title={t(
                'ngx.vesselOrigin',
              )}
            />

            <div
              className="row-between"
              style={{
                marginBottom: 10,
              }}
            >
              <span
                className="badge"
                style={{
                  background:
                    `color-mix(in srgb, ${locationTone} 16%, transparent)`,
                  color:
                    locationTone,
                  border:
                    `1px solid ${locationTone}`,
                }}
              >
                {locationLabel}
              </span>

              <span className="mono tiny muted">
                {myPosition
                  ? t(
                      'ngx.trackingAuto',
                    )
                  : t(
                      'ngx.offlineMode',
                    )}
              </span>
            </div>

            <div
              className="mono"
              style={{
                fontSize: 13.5,
                marginBottom: 12,
              }}
            >
              {origin.lat.toFixed(
                4,
              )}
              °,{' '}
              {origin.lng.toFixed(
                4,
              )}
              °
            </div>

            <Button
              variant="primary"
              block
              onClick={
                toggleGps
              }
            >
              <IconPin size={15} />

              {gpsEnabled
                ? t(
                    'ngx.disableGps',
                  )
                : t(
                    'ngx.enableGps',
                  )}
            </Button>

            <div
              className="tiny muted"
              style={{
                marginTop: 8,
              }}
            >
              {myPosition
                ? `AUTO · ${origin.lat.toFixed(
                    4,
                  )}, ${origin.lng.toFixed(
                    4,
                  )}`
                : usingSimulationOrigin
                  ? t(
                      'ngx.originNote',
                    )
                  : ''}
            </div>
          </Card>

          {/* Route metrics */}

          <Card>
            <CardHead
              kt={t(
                'ngx.transitKt',
              )}
              title={t(
                'ngx.routeEta',
              )}
            />

            <div
              className="stack"
              style={{
                gap: 10,
              }}
            >
              <Field
                label={t(
                  'ngx.vesselSpeed',
                )}
              >
                <Select
                  value={String(
                    vesselSpeed,
                  )}
                  onChange={(
                    value,
                  ) =>
                    setVesselSpeed(
                      Number(
                        value,
                      ),
                    )
                  }
                  options={[
                    {
                      value: '6',
                      label: t(
                        'ngx.speedTrawl',
                        {
                          kn: 6,
                        },
                      ),
                    },
                    {
                      value: '12',
                      label: t(
                        'ngx.speedSurvey',
                        {
                          kn: 12,
                        },
                      ),
                    },
                    {
                      value: '18',
                      label: t(
                        'ngx.speedResponse',
                        {
                          kn: 18,
                        },
                      ),
                    },
                    {
                      value: '24',
                      label: t(
                        'ngx.speedMax',
                        {
                          kn: 24,
                        },
                      ),
                    },
                  ]}
                />
              </Field>

              {navigationMetrics ? (
                <>
                  <div className="kv">
                    <span className="k">
                      {t(
                        'ngx.distToSite',
                      )}
                    </span>

                    <span className="v mono">
                      {fmtDistanceKm(
                        navigationMetrics.km,
                      )}{' '}
                      ·{' '}
                      {fmtDistanceNm(
                        navigationMetrics.nm,
                      )}
                    </span>
                  </div>

                  <div className="kv">
                    <span className="k">
                      {t(
                        'ngx.bearing',
                      )}
                    </span>

                    <span className="v mono">
                      {navigationMetrics.bearing.toFixed(
                        0,
                      )}
                      °{' '}
                      {compass(
                        navigationMetrics.bearing,
                      )}
                    </span>
                  </div>

                  <div className="kv">
                    <span className="k">
                      {t(
                        'ngx.eta',
                      )}
                    </span>

                    <span className="v mono">
                      {
                        navigationMetrics.eta
                      }
                    </span>
                  </div>

                  <div className="kv">
                    <span className="k">
                      {t(
                        'ngx.gcRoute',
                      )}
                    </span>

                    <span className="v mono">
                      {t(
                        'ngx.waypoints',
                        {
                          count:
                            navigationRoute.length,
                        },
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="tiny muted">
                  {t(
                    'ngx.noTarget',
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Detection filters */}

          <Card>
            <CardHead
              kt={t(
                'map.ktLocal',
              )}
              title={t(
                'map.filters',
              )}
            />

            <input
              className="input"
              placeholder={t(
                'map.search',
              )}
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              style={{
                marginBottom: 14,
              }}
            />

            <div
              className="stack"
              style={{
                gap: 12,
              }}
            >
              <div>
                <span
                  className="tiny upper muted"
                  style={{
                    display:
                      'block',
                    marginBottom: 6,
                  }}
                >
                  {t(
                    'map.clsLabel',
                  )}
                </span>

                <ChipGroup
                  options={CLASS_LIST.map(
                    (
                      className,
                    ) =>
                      clsLabel(
                        className,
                        language,
                      ),
                  )}
                  value={classes.map(
                    (
                      className,
                    ) =>
                      clsLabel(
                        className,
                        language,
                      ),
                  )}
                  onChange={(
                    values,
                  ) => {
                    const next =
                      values
                        .map(
                          (
                            label,
                          ) =>
                            CLASS_LIST.find(
                              (
                                className,
                              ) =>
                                clsLabel(
                                  className,
                                  language,
                                ) ===
                                label,
                            ),
                        )
                        .filter(
                          (
                            value,
                          ): value is DetectionClass =>
                            Boolean(
                              value,
                            ),
                        );

                    setClasses(
                      next,
                    );
                  }}
                />
              </div>

              <div>
                <span
                  className="tiny upper muted"
                  style={{
                    display:
                      'block',
                    marginBottom: 6,
                  }}
                >
                  {t(
                    'map.riskLevel',
                  )}
                </span>

                <div
                  className="row wrap"
                  style={{
                    gap: 6,
                  }}
                >
                  {RISK_ALL.map(
                    (risk) => (
                      <button
                        key={risk}
                        className={`chip${
                          risks.includes(
                            risk,
                          )
                            ? ' on'
                            : ''
                        }`}
                        onClick={() =>
                          setRisks(
                            risks.includes(
                              risk,
                            )
                              ? risks.filter(
                                  (
                                    value,
                                  ) =>
                                    value !==
                                    risk,
                                )
                              : [
                                  ...risks,
                                  risk,
                                ],
                          )
                        }
                      >
                        {riskLabel(
                          risk,
                          language,
                        )}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div>
                <span
                  className="tiny upper muted"
                  style={{
                    display:
                      'block',
                    marginBottom: 6,
                  }}
                >
                  {t(
                    'map.timeWindow',
                  )}
                </span>

                <Select
                  value={
                    timeWindow
                  }
                  onChange={
                    setTimeWindow
                  }
                  options={[
                    {
                      value: 'all',
                      label: t(
                        'map.windowAll',
                      ),
                    },
                    {
                      value: '24h',
                      label: t(
                        'map.windowHours',
                        {
                          n: 24,
                        },
                      ),
                    },
                    {
                      value: '7d',
                      label: t(
                        'map.windowDays',
                        {
                          n: 7,
                        },
                      ),
                    },
                    {
                      value: '30d',
                      label: t(
                        'map.windowDays',
                        {
                          n: 30,
                        },
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </Card>

          {/* Detection results */}

          <Card>
            <CardHead
              kt={t(
                'map.markers',
              )}
              title={t(
                'map.resultsTitle',
                {
                  clusters:
                    clusters.length,
                  detections:
                    filtered.length,
                },
              )}
            />

            <div
              className="stack"
              style={{
                gap: 2,
                maxHeight: 330,
                overflow:
                  'auto',
              }}
            >
              {clusters
                .slice(0, 10)
                .map(
                  (
                    cluster,
                  ) => {
                    const detection =
                      cluster
                        .detections[0];

                    return (
                      <button
                        key={
                          cluster.key
                        }
                        className="monitor-row"
                        style={{
                          textAlign:
                            'left',
                          borderBottom:
                            '1px solid var(--line-faint)',
                          padding:
                            '9px 4px',
                          background:
                            'transparent',
                          width:
                            '100%',
                          border:
                            'none',
                          cursor:
                            'pointer',
                        }}
                        onClick={() =>
                          setSelected(
                            cluster,
                          )
                        }
                      >
                        <div
                          className="row-between"
                          style={{
                            gap: 8,
                          }}
                        >
                          <b
                            className="mono"
                            style={{
                              fontSize:
                                11.5,
                            }}
                          >
                            {fmtCoordinate(
                              cluster.lat,
                              cluster.lng,
                            )}
                          </b>

                          <span className="badge b-plain">
                            {
                              cluster
                                .detections
                                .length
                            }
                            ×
                          </span>
                        </div>

                        <div
                          className="row"
                          style={{
                            gap: 6,
                            marginTop: 4,
                          }}
                        >
                          <ClassBadge
                            cls={dominant(
                              cluster,
                            )}
                          />

                          <RiskBadge
                            risk={worstRisk(
                              cluster,
                            )}
                          />
                        </div>

                        <div
                          className="mono tiny muted"
                          style={{
                            marginTop: 3,
                          }}
                        >
                          {fmtDT(
                            detection.detectionTime,
                          )}{' '}
                          ·{' '}
                          {detection.department.replace(
                            /-/g,
                            ' ',
                          )}
                        </div>
                      </button>
                    );
                  },
                )}

              {clusters.length ===
                0 && (
                <div
                  style={{
                    color:
                      'var(--ink-3)',
                    fontSize:
                      12.5,
                    padding: 12,
                  }}
                >
                  {t(
                    'map.empty',
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* =================================================
          SELECTED DETECTION DRAWER
      ================================================== */}

      {selected && (
        <Drawer
          onClose={() =>
            setSelected(null)
          }
          foot={
            <div
              className="row"
              style={{
                gap: 8,
              }}
            >
              {selected
                .detections[0] && (
                <>
                  <Link
                    to={`detail/${selected.detections[0].id}`}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                    }}
                  >
                    <IconScan
                      size={15}
                    />

                    {t(
                      'map.viewCase',
                    )}
                  </Link>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      const detection =
                        selected
                          .detections[0];

                      applyNavigationTarget(
                        {
                          lat:
                            detection
                              .gps
                              .latitude,
                          lng:
                            detection
                              .gps
                              .longitude,
                          label:
                            clsLabel(
                              detection.className,
                              language,
                            ),
                          src:
                            'detection',
                          detectionId:
                            detection.id,
                        },
                      );

                      setSelected(
                        null,
                      );
                    }}
                  >
                    <IconTarget
                      size={15}
                    />

                    {t(
                      'ngx.lockTarget',
                    )}
                  </Button>
                </>
              )}

              <Button
                variant="secondary"
                onClick={() =>
                  setSelected(
                    null,
                  )
                }
              >
                {t(
                  'common.close',
                )}
              </Button>
            </div>
          }
        >
          <div
            className="tiny upper acc"
            style={{
              marginBottom: 8,
            }}
          >
            {t(
              'map.locationCluster',
            )}
          </div>

          <h3
            style={{
              margin:
                '0 0 6px',
              fontSize: 16,
            }}
          >
            {fmtCoordinate(
              selected.lat,
              selected.lng,
            )}
          </h3>

          <div
            className="tiny muted"
            style={{
              marginBottom: 16,
            }}
          >
            {t(
              'map.bundled',
              {
                n: selected
                  .detections
                  .length,
                s:
                  selected
                    .detections
                    .length >
                  1
                    ? 's'
                    : '',
              },
            )}
          </div>

          <div
            className="stack"
            style={{
              gap: 10,
            }}
          >
            {selected.detections.map(
              (detection) => (
                <div
                  key={
                    detection.id
                  }
                  className="row"
                  style={{
                    gap: 12,
                    padding: 10,
                    border:
                      '1px solid var(--line-faint)',
                    borderRadius: 10,
                    fontSize: 12.5,
                  }}
                >
                  <span
                    className="legend-dot"
                    style={{
                      background:
                        CLASS_META[
                          detection
                            .className
                        ].color,
                    }}
                  />

                  <div
                    style={{
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <ClassBadge
                      cls={
                        detection.className
                      }
                    />

                    <div
                      className="mono tiny muted"
                      style={{
                        marginTop: 3,
                      }}
                    >
                      {
                        detection.id
                      }{' '}
                      ·{' '}
                      {fmtDT(
                        detection.detectionTime,
                      )}{' '}
                      ·{' '}
                      {t(
                        'map.conf',
                        {
                          pct: (
                            detection.confidence *
                            100
                          ).toFixed(
                            1,
                          ),
                        },
                      )}
                    </div>
                  </div>

                  <RiskBadge
                    risk={
                      detection.riskLevel
                    }
                  />
                </div>
              ),
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}