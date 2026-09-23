import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { fmtCoordinate } from '../lib/mock';
import { clsLabel } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Field, Select } from '../lib/ui';
import {
  LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, W, H,
  project, WEST_COAST, EAST_COAST, ANDAMAN, pathFrom,
  haversineKm, haversineNm, bearingDeg, compass, gcPoints, fmtETA, fmtDistanceKm, fmtDistanceNm,
} from '../lib/geo';
import type { Detection } from '../types';
import { IconPin, IconTarget } from '../components/Icons';
import { GeoOceanMap } from '../components/GeoMap';

interface LiveTarget {
  lat: number;
  lng: number;
  label: string;
  src: 'manual' | 'detection' | 'live';
  detectionId?: string;
}

const DEMO_ORIGIN = { lat: 15.42, lng: 73.62 }; // Goa bank — used as fallback my-location

function storeTarget(target: LiveTarget | null) {
  try {
    if (target) localStorage.setItem('oceonix.nav.target', JSON.stringify(target));
    else localStorage.removeItem('oceonix.nav.target');
  } catch { /* no-op */ }
}

function readTarget(): LiveTarget | null {
  try {
    const raw = localStorage.getItem('oceonix.nav.target');
    if (!raw) return null;
    const p = JSON.parse(raw) as LiveTarget;
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') return p;
    return null;
  } catch {
    return null;
  }
}

export function NavigatePage() {
  const store = useStore();
  const { detections, language } = store;
  const t = makeT(language);

  const [saved] = useState<LiveTarget | null>(readTarget);
  const [target, setTarget] = useState<LiveTarget | null>(saved ?? {
    label: t('ngx.manualTarget'),
    lat: 18.6,
    lng: 72.98,
    src: 'manual',
  });
  const [picked, setPicked] = useState(saved?.detectionId ?? '');
  const [latIn, setLatIn] = useState(target ? String(target.lat) : '');
  const [lngIn, setLngIn] = useState(target ? String(target.lng) : '');

  const [myPos, setMyPos] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [locState, setLocState] = useState<'idle' | 'locating' | 'live' | 'denied' | 'demo'>('idle');
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [speedKn, setSpeedKn] = useState(12);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    storeTarget(target);
  }, [target]);

  useEffect(() => {
    if (!gpsEnabled) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        setLocState('live');
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [gpsEnabled]);

  const toggleGps = () => {
    if (!gpsEnabled) {
      if (!('geolocation' in navigator)) {
        setLocState('denied');
        return;
      }
      setLocState('locating');
    }
    setGpsEnabled((g) => !g);
  };

  const origin = useMemo(() => myPos ?? DEMO_ORIGIN, [myPos]);

  const metrics = useMemo(() => {
    if (!target) return null;
    const km = haversineKm(origin.lat, origin.lng, target.lat, target.lng);
    const nm = haversineNm(origin.lat, origin.lng, target.lat, target.lng);
    const brg = bearingDeg(origin.lat, origin.lng, target.lat, target.lng);
    return { km, nm, brg, eta: fmtETA(nm, speedKn) };
  }, [origin, target, speedKn]);

  const routePts = useMemo(() => {
    if (!target) return [];
    const raw = gcPoints(origin.lat, origin.lng, target.lat, target.lng, 40);
    return raw.map((p) => project(p.lat, p.lng));
  }, [origin, target]);

  const routePath = useMemo(() => routePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '), [routePts]);

  const applyTarget = (nt: LiveTarget) => {
    setTarget(nt);
    setPicked(nt.detectionId ?? '');
    setLatIn(String(nt.lat));
    setLngIn(String(nt.lng));
  };

  const submitManual = () => {
    const lat = Number(latIn);
    const lng = Number(lngIn);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    applyTarget({ lat, lng, label: `ROCK · ${fmtCoordinate(lat, lng)}`, src: 'manual' });
  };

  const pickDetection = (id: string) => {
    setPicked(id);
    if (!id) return;
    const d = detections.find((x) => x.id === id);
    if (!d) return;
    applyTarget({ lat: d.gps.latitude, lng: d.gps.longitude, label: clsLabel(d.className, language), src: 'detection', detectionId: d.id });
  };

  const originLabel = locState === 'live' ? t('ngx.locLive') : locState === 'locating' ? t('ngx.locLocating') : locState === 'denied' ? t('ngx.locDenied') : locState === 'demo' ? t('ngx.locFallback') : t('ngx.locSim');
  const originTone = locState === 'live' ? 'var(--low)' : locState === 'locating' ? 'var(--medium)' : locState === 'denied' ? 'var(--critical)' : 'var(--accent)';

  const west = pathFrom(WEST_COAST);
  const east = pathFrom(EAST_COAST);
  const o = project(origin.lat, origin.lng);
  const tg = target ? project(target.lat, target.lng) : null;
  const originNote = myPos ? `AUTO · ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}` : t('ngx.originNote');

  return (
    <div>
      <PageHead
        kicker={t('map.title')}
        title={t('ngx.title')}
        sub={t('ngx.sub')}
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-4 stack" style={{ gap: 16 }}>
          <Card>
            <CardHead kt={t('ngx.targetLockKt')} title={t('ngx.debrisCoords')} />
            <div className="stack" style={{ gap: 12 }}>
              <Field label={t('ngx.pickFromDet')}>
                <Select value={picked} onChange={pickDetection} options={[
                  { value: '', label: t('ngx.manualEntry') },
                  ...detections.map((d: Detection) => ({ value: d.id, label: t('ngx.detOption', { id: d.id, cls: clsLabel(d.className, language), coords: fmtCoordinate(d.gps.latitude, d.gps.longitude) }) })),
                ]} />
              </Field>
              <div className="row" style={{ gap: 10 }}>
                <Field label={t('ngx.latField')}>
                  <input className="input" value={latIn} onChange={(e) => setLatIn(e.target.value)} placeholder={t('ngx.latPh')} />
                </Field>
                <Field label={t('ngx.lngField')}>
                  <input className="input" value={lngIn} onChange={(e) => setLngIn(e.target.value)} placeholder={t('ngx.lngPh')} />
                </Field>
              </div>
              <Button variant="secondary" block onClick={submitManual}>
                <IconTarget size={15} /> {t('ngx.lockTarget')}
              </Button>
              <div className="tiny muted" style={{ lineHeight: 1.5 }}>
                {t('ngx.rangeNote', { latMin: LAT_MIN, latMax: LAT_MAX, lonMin: LON_MIN, lonMax: LON_MAX })}
              </div>
              {target && (
                <div className="kv" style={{ marginTop: 2 }}>
                  <span className="k">{t('ngx.lockedTarget')}</span>
                  <span className="v mono">{fmtCoordinate(target.lat, target.lng)}</span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHead kt={t('ngx.myPosKt')} title={t('ngx.vesselOrigin')} />
            <div className="row-between" style={{ marginBottom: 10 }}>
              <span className="badge" style={{ background: `color-mix(in srgb, ${originTone} 16%, transparent)`, color: originTone, border: `1px solid ${originTone}` }}>{originLabel}</span>
              <span className="mono tiny muted">{myPos ? t('ngx.trackingAuto') : t('ngx.offlineMode')}</span>
            </div>
            <div className="mono" style={{ fontSize: 13.5, marginBottom: 12 }}>
              {origin.lat.toFixed(4)}°, {origin.lng.toFixed(4)}°
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button variant="primary" block onClick={toggleGps}>
                <IconPin size={15} /> {gpsEnabled ? t('ngx.disableGps') : t('ngx.enableGps')}
              </Button>
            </div>
            <div className="tiny muted" style={{ marginTop: 8 }}>{originNote}</div>
          </Card>

          <Card>
            <CardHead kt={t('ngx.transitKt')} title={t('ngx.routeEta')} />
            <div className="stack" style={{ gap: 10 }}>
              <Field label={t('ngx.vesselSpeed')}>
                <Select value={String(speedKn)} onChange={(v) => setSpeedKn(Number(v))} options={[
                  { value: '6', label: t('ngx.speedTrawl', { kn: 6 }) },
                  { value: '12', label: t('ngx.speedSurvey', { kn: 12 }) },
                  { value: '18', label: t('ngx.speedResponse', { kn: 18 }) },
                  { value: '24', label: t('ngx.speedMax', { kn: 24 }) },
                ]} />
              </Field>
              {metrics ? (
                <>
                  <div className="kv"><span className="k">{t('ngx.distToSite')}</span><span className="v mono">{fmtDistanceKm(metrics.km)} · {fmtDistanceNm(metrics.nm)}</span></div>
                  <div className="kv"><span className="k">{t('ngx.bearing')}</span><span className="v mono">{metrics.brg.toFixed(0)}° {compass(metrics.brg)}</span></div>
                  <div className="kv"><span className="k">{t('ngx.eta')}</span><span className="v mono">{metrics.eta}</span></div>
                  <div className="kv"><span className="k">{t('ngx.gcRoute')}</span><span className="v mono">{t('ngx.waypoints', { count: routePts.length })}</span></div>
                </>
              ) : (
                <div className="tiny muted">{t('ngx.noTarget')}</div>
              )}
            </div>
          </Card>
        </div>

        <div className="span-8 stack" style={{ gap: 16 }}>
          <Card className="solid" style={{ padding: 0 }}>
            {target ? (
              <GeoOceanMap
                connectingLabel={t('map.gisConnecting')}
                fitPts={[
                  [Math.min(origin.lat, target.lat), Math.min(origin.lng, target.lng)],
                  [Math.max(origin.lat, target.lat), Math.max(origin.lng, target.lng)],
                ]}
                fitKey={`${target.lat.toFixed(3)}|${target.lng.toFixed(3)}`}
                markers={[
                  { id: 'origin', lat: origin.lat, lng: origin.lng, color: 'var(--teal)', pulse: true, label: t('ngx.you') },
                  ...(tg ? [{ id: 'target', lat: target.lat, lng: target.lng, color: 'var(--critical)', pulse: true, label: (target.label.toUpperCase() || t('ngx.debris')).slice(0, 14) }] : []),
                ]}
                route={{ points: gcPoints(origin.lat, origin.lng, target.lat, target.lng, 40).map((p) => [p.lat, p.lng]), color: 'var(--accent)', dashed: true }}
                fallback={
                  <svg className="map-canvas" viewBox={`0 0 ${W} ${H}`} style={{ height: 'auto' }}>
                    {/* graticule */}
                    {Array.from({ length: 9 }, (_, i) => {
                      const lat = LAT_MIN + i * 2;
                      const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 40) + 20;
                      return (
                        <g key={`gl-${lat}`}>
                          <line x1={20} x2={W - 20} y1={y} y2={y} stroke="var(--grid-line)" strokeWidth="1" />
                          <text x={14} y={y + 3} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-mono)">{lat}°</text>
                        </g>
                      );
                    })}
                    {Array.from({ length: 10 }, (_, i) => {
                      const lng = LON_MIN + i * 3;
                      const x = ((lng - LON_MIN) / (LON_MAX - LON_MIN)) * (W - 40) + 20;
                      return (
                        <g key={`gl-${lng}`}>
                          <line x1={x} x2={x} y1={20} y2={H - 20} stroke="var(--grid-line)" strokeWidth="1" />
                          <text x={x - 8} y={H - 8} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-mono)">{lng}°E</text>
                        </g>
                      );
                    })}

                    {/* isobaths */}
                    {[46, 96, 168, 260, 380].map((mv, i) => (
                      <ellipse key={i} cx={mv} cy={H - mv - 40} rx={mv * 2.4} ry={mv * 1.9} fill="none" stroke="var(--accent)" strokeOpacity={0.10 + i * 0.02} strokeWidth="1" strokeDasharray="4 5" />
                    ))}

                    {/* coastlines */}
                    <path d={west} fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d={west} fill="none" stroke="var(--teal)" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 8" />
                    <path d={east} fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d={east} fill="none" stroke="var(--teal)" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 8" />
                    {ANDAMAN.map(([lng, lat], i) => {
                      const { x, y } = project(lat, lng);
                      return <circle key={i} cx={x} cy={y} r={2.4} fill="var(--ink-2)" />;
                    })}

                    {/* route */}
                    {routePath && (
                      <>
                        <path d={routePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeOpacity="0.9" strokeDasharray="8 6" />
                        <path d={routePath} fill="none" stroke="var(--teal)" strokeWidth="6" strokeOpacity="0.12" strokeLinecap="round" />
                        {routePts.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === routePts.length - 1 ? 3 : 1.5} fill="var(--accent)" fillOpacity={i === 0 || i === routePts.length - 1 ? 1 : 0.4} />
                        ))}
                      </>
                    )}

                    {/* origin marker */}
                    <g transform={`translate(${o.x},${o.y})`}>
                      <circle r={16} fill="none" stroke="var(--teal)" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="3 3">
                        <animate attributeName="r" values="12;20;12" dur="2.2s" repeatCount="indefinite" />
                        <animate attributeName="strokeOpacity" values="0.7;0.15;0.7" dur="2.2s" repeatCount="indefinite" />
                      </circle>
                      <circle r={7} fill="var(--teal)" fillOpacity="0.25" stroke="var(--teal)" strokeWidth="1.6" />
                      <text y={-20} textAnchor="middle" fontSize="10" fill="var(--teal)" fontFamily="var(--font-mono)">{t('ngx.you')}</text>
                    </g>

                    {/* target marker */}
                    <g transform={`translate(${(tg ?? { x: 0, y: 0 }).x},${(tg ?? { x: 0, y: 0 }).y})`}>
                      <circle r={20} fill="none" stroke="var(--critical)" strokeOpacity="0.8" strokeWidth="1.2" strokeDasharray="4 4">
                        <animate attributeName="r" values="14;24;14" dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="strokeOpacity" values="0.8;0.2;0.8" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                      <circle r={8} fill="var(--critical)" fillOpacity="0.35" stroke="var(--critical)" strokeWidth="2" />
                      <text y={-26} textAnchor="middle" fontSize="10.5" fill="var(--critical)" fontFamily="var(--font-mono)">{target?.label.toUpperCase() || t('ngx.debris')}</text>
                    </g>
                  </svg>
                }
              >
                <div className="depth-scale" />
                <div className="map-legend">
                  <span className="ml"><span className="mk-swat" style={{ background: 'var(--teal)' }} /> {t('ngx.legendVessel')}</span>
                  <span className="ml"><span className="mk-swat" style={{ background: 'var(--critical)' }} /> {t('ngx.legendDebris')}</span>
                  <span className="ml"><span style={{ width: 16, height: 2, background: 'var(--accent)', display: 'inline-block' }} /> {t('ngx.legendRoute')}</span>
                  <span className="ml mono">{t('ngx.greatCircle')} · {routePath ? t('ngx.wptCount', { count: routePts.length }) : t('ngx.noTargetMono')}</span>
                </div>
              </GeoOceanMap>
            ) : (
              <div className="map-shell geo">
                <div className="gis-connecting">{t('map.gisConnecting')}</div>
                <div className="map-legend">
                  <span className="ml mono">{t('ngx.noTargetMono')}</span>
                </div>
              </div>
            )}
          </Card>

          {target && (
            <Card>
              <CardHead kt={t('ngx.liveStatusKt')} title={t('ngx.navSummary')} right={
                <span className="badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-line)' }}>
                  {metrics ? `${compass(metrics.brg)} ${metrics.brg.toFixed(0)}°` : '—'}
                </span>
              } />
              <div className="grid cols-12" style={{ gap: 12 }}>
                <div className="span-6">
                  <div className="row" style={{ gap: 14 }}>
                    <span className="legend-dot" style={{ background: 'var(--teal)', width: 10, height: 10 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny upper muted">{t('ngx.originLine', { label: originLabel })}</div>
                      <div className="mono" style={{ fontSize: 13.5 }}>{origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}</div>
                      <div className="tiny muted">{t('ngx.toSite', { km: fmtDistanceKm(metrics?.km ?? 0), nm: fmtDistanceNm(metrics?.nm ?? 0) })}</div>
                    </div>
                  </div>
                </div>
                <div className="span-6">
                  <div className="row" style={{ gap: 14 }}>
                    <span className="legend-dot" style={{ background: 'var(--critical)', width: 10, height: 10 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny upper muted">{t('ngx.debrisLine', { src: (target.detectionId ?? t('ngx.manualSrc')).toUpperCase() })}</div>
                      <div className="mono" style={{ fontSize: 13.5 }}>{fmtCoordinate(target.lat, target.lng)}</div>
                      <div className="tiny muted">{t('ngx.etaAt', { kn: speedKn, eta: metrics?.eta ?? '—' })}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}