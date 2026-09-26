import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, CLASS_META, SITES, fmtCoordinate, fmtDT } from '../lib/mock';
import { clsLabel, riskLabel } from '../lib/labels';
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
import { IconScan, IconPin, IconTarget } from '../components/Icons';
import { GeoOceanMap } from '../components/GeoMap';
import type { Detection, DetectionClass, RiskLevel } from '../types';
import {
  LAT_MIN,
  LAT_MAX,
  LON_MIN,
  LON_MAX,
  W,
  H,
  project,
  WEST_COAST,
  EAST_COAST,
  ANDAMAN,
  pathFrom,
  haversineKm,
  haversineNm,
  bearingDeg,
  compass,
  gcPoints,
  fmtETA,
  fmtDistanceKm,
  fmtDistanceNm,
} from '../lib/geo';

const RISK_ALL: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

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

const DEMO_ORIGIN = {
  lat: 15.42,
  lng: 73.62,
};

function storeNavigationTarget(target: NavigationTarget | null) {
  try {
    if (target) {
      localStorage.setItem(
        'oceonix.nav.target',
        JSON.stringify(target),
      );
    } else {
      localStorage.removeItem('oceonix.nav.target');
    }
  } catch {
    // Ignore localStorage errors.
  }
}

function readNavigationTarget(): NavigationTarget | null {
  try {
    const raw = localStorage.getItem('oceonix.nav.target');

    if (!raw) return null;

    const parsed = JSON.parse(raw) as NavigationTarget;

    if (
      typeof parsed?.lat === 'number' &&
      typeof parsed?.lng === 'number'
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function MapPage() {
  const store = useStore();
  const { detections, language } = store;
  const t = makeT(language);

  /* -------------------------------------------------------
   * Existing map state
   * ----------------------------------------------------- */

  const [classes, setClasses] = useState<string[]>(
    CLASS_LIST.map((c) => c),
  );

  const [risks, setRisks] = useState<string[]>(RISK_ALL);

  const [window, setWindow] = useState('all');

  const [layer, setLayer] = useState<
    'sonar' | 'satellite' | 'chart'
  >('sonar');

  const [selected, setSelected] =
    useState<Cluster | null>(null);

  const [search, setSearch] = useState('');

  /* -------------------------------------------------------
   * Navigation state
   * ----------------------------------------------------- */

  const [savedTarget] = useState<NavigationTarget | null>(
    readNavigationTarget,
  );

  const [target, setTarget] =
    useState<NavigationTarget | null>(
      savedTarget ?? {
        label: t('ngx.manualTarget'),
        lat: 18.6,
        lng: 72.98,
        src: 'manual',
      },
    );

  const [pickedDetection, setPickedDetection] = useState(
    savedTarget?.detectionId ?? '',
  );

  const [latInput, setLatInput] = useState(
    target ? String(target.lat) : '',
  );

  const [lngInput, setLngInput] = useState(
    target ? String(target.lng) : '',
  );

  const [myPosition, setMyPosition] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);

  const [locationState, setLocationState] = useState<
    'idle' | 'locating' | 'live' | 'denied'
  >('idle');

  const [gpsEnabled, setGpsEnabled] = useState(false);

  const [vesselSpeed, setVesselSpeed] = useState(12);

  const watchRef = useRef<number | null>(null);

  /* -------------------------------------------------------
   * Persist navigation target
   * ----------------------------------------------------- */

  useEffect(() => {
    storeNavigationTarget(target);
  }, [target]);

  /* -------------------------------------------------------
   * GPS tracking
   * ----------------------------------------------------- */

  useEffect(() => {
    if (!gpsEnabled) return;

    if (!('geolocation' in navigator)) {
      setLocationState('denied');
      return;
    }

    setLocationState('locating');

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setMyPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });

        setLocationState('live');
      },
      () => {
        setLocationState('denied');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(
          watchRef.current,
        );
      }

      watchRef.current = null;
    };
  }, [gpsEnabled]);

  const toggleGps = () => {
    if (!gpsEnabled) {
      if (!('geolocation' in navigator)) {
        setLocationState('denied');
        return;
      }

      setLocationState('locating');
    }

    setGpsEnabled((enabled) => !enabled);
  };

  /* -------------------------------------------------------
   * Navigation origin
   * ----------------------------------------------------- */

  const origin = useMemo(
    () => myPosition ?? DEMO_ORIGIN,
    [myPosition],
  );

  /* -------------------------------------------------------
   * Navigation metrics
   * ----------------------------------------------------- */

  const navigationMetrics = useMemo(() => {
    if (!target) return null;

    const km = haversineKm(
      origin.lat,
      origin.lng,
      target.lat,
      target.lng,
    );

    const nm = haversineNm(
      origin.lat,
      origin.lng,
      target.lat,
      target.lng,
    );

    const bearing = bearingDeg(
      origin.lat,
      origin.lng,
      target.lat,
      target.lng,
    );

    return {
      km,
      nm,
      bearing,
      eta: fmtETA(nm, vesselSpeed),
    };
  }, [
    origin,
    target,
    vesselSpeed,
  ]);

  /* -------------------------------------------------------
   * Great-circle navigation route
   * ----------------------------------------------------- */

  const navigationRoute = useMemo(() => {
    if (!target) return [];

    return gcPoints(
      origin.lat,
      origin.lng,
      target.lat,
      target.lng,
      40,
    );
  }, [origin, target]);

  /* -------------------------------------------------------
   * Navigation helpers
   * ----------------------------------------------------- */

  const applyNavigationTarget = (
    nextTarget: NavigationTarget,
  ) => {
    setTarget(nextTarget);

    setPickedDetection(
      nextTarget.detectionId ?? '',
    );

    setLatInput(String(nextTarget.lat));
    setLngInput(String(nextTarget.lng));
  };

  const submitManualTarget = () => {
    const latitude = Number(latInput);
    const longitude = Number(lngInput);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    applyNavigationTarget({
      lat: latitude,
      lng: longitude,
      label: `ROCK · ${fmtCoordinate(
        latitude,
        longitude,
      )}`,
      src: 'manual',
    });
  };

  const selectDetectionTarget = (id: string) => {
    setPickedDetection(id);

    if (!id) return;

    const detection = detections.find(
      (item) => item.id === id,
    );

    if (!detection) return;

    applyNavigationTarget({
      lat: detection.gps.latitude,
      lng: detection.gps.longitude,
      label: clsLabel(
        detection.className,
        language,
      ),
      src: 'detection',
      detectionId: detection.id,
    });
  };

  const locationLabel =
    locationState === 'live'
      ? t('ngx.locLive')
      : locationState === 'locating'
        ? t('ngx.locLocating')
        : locationState === 'denied'
          ? t('ngx.locDenied')
          : t('ngx.locSim');

  const locationTone =
    locationState === 'live'
      ? 'var(--low)'
      : locationState === 'locating'
        ? 'var(--medium)'
        : locationState === 'denied'
          ? 'var(--critical)'
          : 'var(--accent)';

  /* -------------------------------------------------------
   * Existing map filtering
   * ----------------------------------------------------- */

  const filtered = useMemo(() => {
    const cutoff =
      window === 'all'
        ? 0
        : window === '24h'
          ? 24 * 3600e3
          : window === '7d'
            ? 7 * 24 * 3600e3
            : 30 * 24 * 3600e3;

    const now = Date.now();

    return detections.filter(
      (d) =>
        classes.includes(d.className) &&
        risks.includes(d.riskLevel) &&
        (
          cutoff === 0 ||
          now -
            new Date(d.detectionTime).getTime() <
            cutoff
        ),
    );
  }, [
    detections,
    classes,
    risks,
    window,
  ]);

  const clusters = useMemo(() => {
    const groups = new Map<string, Cluster>();

    filtered.forEach((d) => {
      const key =
        `${d.gps.latitude.toFixed(2)}|` +
        `${d.gps.longitude.toFixed(2)}`;

      const existing = groups.get(key);

      if (existing) {
        existing.detections.push(d);
      } else {
        groups.set(key, {
          key,
          lat: d.gps.latitude,
          lng: d.gps.longitude,
          detections: [d],
        });
      }
    });

    return Array.from(groups.values())
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

  const focus = useMemo(() => {
    if (!search.trim()) return null;

    const query =
      search.trim().toUpperCase();

    const found = detections.find(
      (d) =>
        d.id
          .toUpperCase()
          .includes(query),
    );

    return found
      ? clusters.find((cluster) =>
          cluster.detections.some(
            (d) => d.id === found.id,
          ),
        ) ?? null
      : null;
  }, [
    search,
    detections,
    clusters,
  ]);

  const dominant = (
    cluster: Cluster,
  ) => {
    const counts =
      new Map<
        DetectionClass,
        number
      >();

    cluster.detections.forEach(
      (d) => {
        counts.set(
          d.className,
          (counts.get(
            d.className,
          ) ?? 0) + 1,
        );
      },
    );

    return Array.from(
      counts.entries(),
    ).sort(
      (a, b) => b[1] - a[1],
    )[0][0];
  };

  const worstRisk = (
    cluster: Cluster,
  ): RiskLevel => {
    const risksForCluster =
      cluster.detections.map(
        (d) => d.riskLevel,
      );

    return risksForCluster.includes(
      'critical',
    )
      ? 'critical'
      : risksForCluster.includes(
          'high',
        )
        ? 'high'
        : risksForCluster.includes(
            'medium',
          )
          ? 'medium'
          : 'low';
  };

  const layerBg =
    layer === 'chart'
      ? 'linear-gradient(180deg, #0d2a44, #071a2e)'
      : layer === 'satellite'
        ? 'linear-gradient(180deg, #04101f, #02080f)'
        : 'radial-gradient(60% 80% at 50% 20%, #0e3352, #071a2e 60%, #050f1b)';

  const west = pathFrom(
    WEST_COAST,
  );

  const east = pathFrom(
    EAST_COAST,
  );

  /* -------------------------------------------------------
   * Map fit
   * ----------------------------------------------------- */

  const fitPoints = target
    ? [
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
      ] as [number, number][]
    : [
        [LAT_MIN, LON_MIN],
        [LAT_MAX, LON_MAX],
      ] as [number, number][];

  return (
    <div>
      <PageHead
        kicker={t('map.title')}
        title={t('nav.map')}
        sub={t('map.sub')}
        right={
          <div
            className="row wrap"
            style={{ gap: 8 }}
          >
            {(
              [
                [
                  'sonar',
                  t('map.sonar'),
                ],
                [
                  'chart',
                  t('map.topographic'),
                ],
                [
                  'satellite',
                  t('map.satellite'),
                ],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`chip${
                  layer === value
                    ? ' on'
                    : ''
                }`}
                onClick={() =>
                  setLayer(value)
                }
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div
        className="grid cols-12"
        style={{ gap: 16 }}
      >
        {/* -------------------------------------------------
            MAP
        -------------------------------------------------- */}

        <div className="span-8">
          <GeoOceanMap
            style={{
              background: layerBg,
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
                : 'eez'
            }
            connectingLabel={t(
              'map.gisConnecting',
            )}
            markers={clusters.map(
              (cluster) => ({
                id: cluster.key,
                lat: cluster.lat,
                lng: cluster.lng,
                color:
                  CLASS_META[
                    dominant(
                      cluster,
                    )
                  ].color,
                count:
                  cluster.detections
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
              target
                ? {
                    points:
                      navigationRoute.map(
                        (point) => [
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
                  height: 'auto',
                }}
              >
                <defs>
                  <radialGradient
                    id="mg-shelf"
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

                {/* graticule */}
                {Array.from(
                  {
                    length: 9,
                  },
                  (_, i) => {
                    const lat =
                      LAT_MIN +
                      i * 2;

                    const y =
                      ((LAT_MAX -
                        lat) /
                        (LAT_MAX -
                          LAT_MIN)) *
                        (H - 40) +
                      20;

                    return (
                      <g
                        key={`gl-${lat}`}
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

                {/* longitude */}
                {Array.from(
                  {
                    length: 10,
                  },
                  (_, i) => {
                    const lng =
                      LON_MIN +
                      i * 3;

                    const x =
                      ((lng -
                        LON_MIN) /
                        (LON_MAX -
                          LON_MIN)) *
                        (W - 40) +
                      20;

                    return (
                      <g
                        key={`gl-${lng}`}
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

                {/* isobaths */}
                {[46, 96, 168, 260, 380].map(
                  (value, index) => (
                    <ellipse
                      key={index}
                      cx={value}
                      cy={
                        H -
                        value -
                        40
                      }
                      rx={
                        value * 2.4
                      }
                      ry={
                        value * 1.9
                      }
                      fill="none"
                      stroke="var(--accent)"
                      strokeOpacity={
                        0.10 +
                        index *
                          0.02
                      }
                      strokeWidth="1"
                      strokeDasharray="4 5"
                    />
                  ),
                )}

                <ellipse
                  cx={430}
                  cy={420}
                  rx={330}
                  ry={220}
                  fill="url(#mg-shelf)"
                />

                <ellipse
                  cx={760}
                  cy={340}
                  rx={220}
                  ry={150}
                  fill="url(#mg-shelf)"
                />

                <ellipse
                  cx={210}
                  cy={560}
                  rx={200}
                  ry={120}
                  fill="url(#mg-shelf)"
                />

                {/* coastlines */}
                <path
                  d={west}
                  fill="none"
                  stroke="var(--ink-2)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />

                <path
                  d={west}
                  fill="none"
                  stroke="var(--teal)"
                  strokeOpacity="0.35"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="1 8"
                />

                <path
                  d={east}
                  fill="none"
                  stroke="var(--ink-2)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />

                <path
                  d={east}
                  fill="none"
                  stroke="var(--teal)"
                  strokeOpacity="0.35"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="1 8"
                />

                {ANDAMAN.map(
                  ([lng, lat], i) => {
                    const {
                      x,
                      y,
                    } = project(
                      lat,
                      lng,
                    );

                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={2.4}
                        fill="var(--ink-2)"
                      />
                    );
                  },
                )}

                {/* site labels */}
                {SITES.slice(
                  0,
                  6,
                ).map((site) => {
                  const mark =
                    project(
                      site.lat +
                        2,
                      site.lng,
                    );

                  return (
                    <text
                      key={
                        site.name
                      }
                      x={mark.x}
                      y={mark.y}
                      fontSize="9.5"
                      fill="var(--ink-3)"
                      fontFamily="var(--font-mono)"
                    >
                      {site.name.split(
                        '—',
                      )[1]
                        ?.trim() ??
                        site.name.split(
                          '–',
                        )[1]
                          ?.trim() ??
                        site.name}
                    </text>
                  );
                })}

                {/* detection markers */}
                {clusters.map(
                  (cluster) => {
                    const {
                      x,
                      y,
                    } = project(
                      cluster.lat,
                      cluster.lng,
                    );

                    const size =
                      Math.min(
                        26,
                        8 +
                          Math.sqrt(
                            cluster
                              .detections
                              .length,
                          ) *
                            4.5,
                      );

                    const color =
                      CLASS_META[
                        dominant(
                          cluster,
                        )
                      ].color;

                    const isFocus =
                      focus?.key ===
                      cluster.key;

                    const highlighted =
                      selected?.key ===
                      cluster.key;

                    return (
                      <g
                        key={
                          cluster.key
                        }
                        transform={`translate(${x},${y})`}
                        onClick={() =>
                          setSelected(
                            cluster,
                          )
                        }
                        style={{
                          cursor:
                            'pointer',
                        }}
                      >
                        <circle
                          r={
                            size +
                            (isFocus
                              ? 8
                              : 0)
                          }
                          fill="none"
                          stroke={color}
                          strokeOpacity={
                            isFocus ||
                            highlighted
                              ? 1
                              : 0.55
                          }
                          strokeWidth={
                            isFocus ||
                            highlighted
                              ? 2
                              : 1
                          }
                          strokeDasharray="3 3"
                        >
                          {highlighted && (
                            <animate
                              attributeName="r"
                              values={`${size};${
                                size +
                                9
                              };${size}`}
                              dur="1.4s"
                              repeatCount="indefinite"
                            />
                          )}
                        </circle>

                        <circle
                          r={size}
                          fill={color}
                          fillOpacity="0.16"
                          stroke="none"
                        />

                        <circle
                          r={Math.min(
                            9,
                            size *
                              0.42,
                          )}
                          fill={color}
                        />

                        <text
                          y={
                            -size -
                            6
                          }
                          textAnchor="middle"
                          fontSize="10.5"
                          fill="var(--ink-2)"
                          fontFamily="var(--font-mono)"
                        >
                          {
                            cluster
                              .detections
                              .length
                          }×
                        </text>
                      </g>
                    );
                  },
                )}

                {/* navigation origin */}
                {target && (
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
                      r={16}
                      fill="none"
                      stroke="var(--teal)"
                      strokeOpacity="0.7"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />

                    <circle
                      r={7}
                      fill="var(--teal)"
                      fillOpacity="0.25"
                      stroke="var(--teal)"
                      strokeWidth="1.6"
                    />

                    <text
                      y={-20}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--teal)"
                      fontFamily="var(--font-mono)"
                    >
                      {t('ngx.you')}
                    </text>
                  </g>
                )}

                {/* navigation target */}
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

                {/* navigation route */}
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
                {t('risk.critical')}
              </span>

              <span className="ml">
                <span
                  className="mk-swat"
                  style={{
                    background:
                      'var(--high)',
                  }}
                />
                {t('risk.high')}
              </span>

              <span className="ml">
                <span
                  className="mk-swat"
                  style={{
                    background:
                      'var(--medium)',
                  }}
                />
                {t('risk.medium')}
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
              {t('map.basemap')} ·{' '}
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

        {/* -------------------------------------------------
            RIGHT SIDE
        -------------------------------------------------- */}

        <div
          className="span-4 stack"
          style={{ gap: 16 }}
        >
          {/* Navigation */}
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
              style={{ gap: 12 }}
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
                      (d) => ({
                        value: d.id,
                        label: t(
                          'ngx.detOption',
                          {
                            id: d.id,
                            cls: clsLabel(
                              d.className,
                              language,
                            ),
                            coords:
                              fmtCoordinate(
                                d
                                  .gps
                                  .latitude,
                                d
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
                style={{ gap: 10 }}
              >
                <Field
                  label={t(
                    'ngx.latField',
                  )}
                >
                  <input
                    className="input"
                    value={latInput}
                    onChange={(event) =>
                      setLatInput(
                        event.target
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
                    value={lngInput}
                    onChange={(event) =>
                      setLngInput(
                        event.target
                          .value,
                      )
                    }
                    placeholder={t(
                      'ngx.lngPh',
                    )}
                  />
                </Field>
              </div>

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

              <div
                className="tiny muted"
                style={{
                  lineHeight: 1.5,
                }}
              >
                {t(
                  'ngx.rangeNote',
                  {
                    latMin: LAT_MIN,
                    latMax: LAT_MAX,
                    lonMin: LON_MIN,
                    lonMax: LON_MAX,
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
                  background: `color-mix(in srgb, ${locationTone} 16%, transparent)`,
                  color:
                    locationTone,
                  border: `1px solid ${locationTone}`,
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
                ? `AUTO · ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`
                : t(
                    'ngx.originNote',
                  )}
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
              style={{ gap: 10 }}
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
                  onChange={(value) =>
                    setVesselSpeed(
                      Number(value),
                    )
                  }
                  options={[
                    {
                      value: '6',
                      label: t(
                        'ngx.speedTrawl',
                        { kn: 6 },
                      ),
                    },
                    {
                      value: '12',
                      label: t(
                        'ngx.speedSurvey',
                        { kn: 12 },
                      ),
                    },
                    {
                      value: '18',
                      label: t(
                        'ngx.speedResponse',
                        { kn: 18 },
                      ),
                    },
                    {
                      value: '24',
                      label: t(
                        'ngx.speedMax',
                        { kn: 24 },
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

          {/* Existing map filters */}
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
              style={{ gap: 12 }}
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
                    (className) =>
                      clsLabel(
                        className,
                        language,
                      ),
                  )}
                  value={classes.map(
                    (className) =>
                      clsLabel(
                        className as DetectionClass,
                        language,
                      ),
                  )}
                  onChange={(values) =>
                    setClasses(
                      values.map(
                        (label) =>
                          CLASS_LIST.find(
                            (className) =>
                              clsLabel(
                                className,
                                language,
                              ) ===
                              label,
                          ) ??
                          'shipwreck',
                      ),
                    )
                  }
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
                  value={window}
                  onChange={
                    setWindow
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
                        { n: 24 },
                      ),
                    },
                    {
                      value: '7d',
                      label: t(
                        'map.windowDays',
                        { n: 7 },
                      ),
                    },
                    {
                      value: '30d',
                      label: t(
                        'map.windowDays',
                        { n: 30 },
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
                overflow: 'auto',
              }}
            >
              {clusters
                .slice(0, 10)
                .map((cluster) => {
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
                          }×
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
                })}

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

      {/* ---------------------------------------------------
          Selected detection drawer
      ---------------------------------------------------- */}

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
                          lat: detection
                            .gps
                            .latitude,
                          lng: detection
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
                  setSelected(null)
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
                    borderRadius:
                      10,
                    fontSize:
                      12.5,
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