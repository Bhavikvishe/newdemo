import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, CLASS_META, SITES, fmtCoordinate, fmtDT } from '../lib/mock';
import { clsLabel, riskLabel } from '../lib/labels';
import { PageHead, Card, CardHead, Drawer, ChipGroup, RiskBadge, ClassBadge, Button, Select } from '../lib/ui';
import { Link } from '../lib/router';
import { IconScan } from '../components/Icons';
import { GeoOceanMap } from '../components/GeoMap';
import type { Detection, DetectionClass, RiskLevel } from '../types';
import { LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, W, H, project, WEST_COAST, EAST_COAST, ANDAMAN, pathFrom } from '../lib/geo';

const RISK_ALL: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

interface Cluster {
  key: string;
  lat: number;
  lng: number;
  detections: Detection[];
}

export function MapPage() {
  const store = useStore();
  const { detections, language } = store;
  const t = makeT(language);

  const [classes, setClasses] = useState<string[]>(CLASS_LIST.map((c) => c));
  const [risks, setRisks] = useState<string[]>(RISK_ALL);
  const [window, setWindow] = useState('all');
  const [layer, setLayer] = useState<'sonar' | 'satellite' | 'chart'>('sonar');
  const [selected, setSelected] = useState<Cluster | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const cutoff = window === 'all'
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
        (cutoff === 0 || now - new Date(d.detectionTime).getTime() < cutoff),
    );
  }, [detections, classes, risks, window]);

  const clusters = useMemo(() => {
    const groups = new Map<string, Cluster>();
    filtered.forEach((d) => {
      const key = `${d.gps.latitude.toFixed(2)}|${d.gps.longitude.toFixed(2)}`;
      const hit = groups.get(key);
      if (hit) hit.detections.push(d);
      else groups.set(key, { key, lat: d.gps.latitude, lng: d.gps.longitude, detections: [d] });
    });
    return Array.from(groups.values())
      .map((c) => ({ ...c, detections: [...c.detections].sort((a, b) => (a.detectionTime < b.detectionTime ? 1 : -1)) }))
      .sort((a, b) => b.detections.length - a.detections.length);
  }, [filtered]);

  const focus = useMemo(() => {
    if (!search.trim()) return null;
    const found = detections.find((d) => d.id.toUpperCase().includes(search.trim().toUpperCase()));
    return found ? clusters.find((c) => c.detections.some((d) => d.id === found.id)) ?? null : null;
  }, [search, detections, clusters]);

  const dominant = (c: Cluster) => {
    const counts = new Map<DetectionClass, number>();
    c.detections.forEach((d) => counts.set(d.className, (counts.get(d.className) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  };

  const worstRisk = (c: Cluster): RiskLevel => {
    const rs = c.detections.map((x) => x.riskLevel);
    return rs.includes('critical') ? 'critical' : rs.includes('high') ? 'high' : rs.includes('medium') ? 'medium' : 'low';
  };

  const layerBg =
    layer === 'chart'
      ? 'linear-gradient(180deg, #0d2a44, #071a2e)'
      : layer === 'satellite'
        ? 'linear-gradient(180deg, #04101f, #02080f)'
        : 'radial-gradient(60% 80% at 50% 20%, #0e3352, #071a2e 60%, #050f1b)';

  const west = pathFrom(WEST_COAST);
  const east = pathFrom(EAST_COAST);

  return (
    <div>
      <PageHead
        kicker={t('map.title')}
        title={t('nav.map')}
        sub={t('map.sub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            {([['sonar', t('map.sonar')], ['chart', t('map.topographic')], ['satellite', t('map.satellite')]] as const).map(([v, l]) => (
              <button key={v} className={`chip${layer === v ? ' on' : ''}`} onClick={() => setLayer(v)}>{l}</button>
            ))}
          </div>
        }
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-8">
          <GeoOceanMap
            style={{ background: layerBg }}
            fitPts={[[LAT_MIN, LON_MIN], [LAT_MAX, LON_MAX]]}
            fitKey="eez"
            connectingLabel={t('map.gisConnecting')}
            markers={clusters.map((c) => ({
              id: c.key,
              lat: c.lat,
              lng: c.lng,
              color: CLASS_META[dominant(c)].color,
              count: c.detections.length,
              selected: selected?.key === c.key,
              focus: focus?.key === c.key,
              onClick: () => setSelected(c),
            }))}
            fallback={
              <svg className="map-canvas" viewBox={`0 0 ${W} ${H}`} style={{ height: 'auto' }}>
                <defs>
                  <radialGradient id="mg-shelf" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="#2a6f9e" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="transparent" />
                  </radialGradient>
                </defs>

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
                <ellipse cx={430} cy={420} rx={330} ry={220} fill="url(#mg-shelf)" />
                <ellipse cx={760} cy={340} rx={220} ry={150} fill="url(#mg-shelf)" />
                <ellipse cx={210} cy={560} rx={200} ry={120} fill="url(#mg-shelf)" />

                {/* coastlines */}
                <path d={west} fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinejoin="round" />
                <path d={west} fill="none" stroke="var(--teal)" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 8" />
                <path d={east} fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinejoin="round" />
                <path d={east} fill="none" stroke="var(--teal)" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 8" />
                {ANDAMAN.map(([lng, lat], i) => {
                  const { x, y } = project(lat, lng);
                  return <circle key={i} cx={x} cy={y} r={2.4} fill="var(--ink-2)" />;
                })}

                {/* site labels */}
                {SITES.slice(0, 6).map((s) => {
                  const mark = project(s.lat + 2, s.lng);
                  return <text key={s.name} x={mark.x} y={mark.y} fontSize="9.5" fill="var(--ink-3)" fontFamily="var(--font-mono)">{s.name.split('—')[1]?.trim() ?? s.name.split('–')[1]?.trim() ?? s.name}</text>;
                })}

                {/* markers */}
                {clusters.map((c) => {
                  const { x, y } = project(c.lat, c.lng);
                  const size = Math.min(26, 8 + Math.sqrt(c.detections.length) * 4.5);
                  const col = CLASS_META[dominant(c)].color;
                  const isFocus = focus?.key === c.key;
                  const hl = selected?.key === c.key;
                  return (
                    <g key={c.key} transform={`translate(${x},${y})`} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                      <circle r={size + (isFocus ? 8 : 0)} fill="none" stroke={col} strokeOpacity={isFocus || hl ? 1 : 0.55} strokeWidth={isFocus || hl ? 2 : 1} strokeDasharray="3 3">
                        {hl && <animate attributeName="r" values={`${size};${size + 9};${size}`} dur="1.4s" repeatCount="indefinite" />}
                      </circle>
                      <circle r={size} fill={col} fillOpacity="0.16" stroke="none" />
                      <circle r={Math.min(9, size * 0.42)} fill={col} />
                      <text y={-size - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink-2)" fontFamily="var(--font-mono)">
                        {c.detections.length}×
                      </text>
                    </g>
                  );
                })}
              </svg>
            }
          >
            <div className="depth-scale" />
            <div className="map-legend">
              <span className="ml"><span className="mk-swat" style={{ background: 'var(--critical)' }} /> {t('risk.critical')}</span>
              <span className="ml"><span className="mk-swat" style={{ background: 'var(--high)' }} /> {t('risk.high')}</span>
              <span className="ml"><span className="mk-swat" style={{ background: 'var(--medium)' }} /> {t('risk.medium')}</span>
              <span className="ml"><span className="mk-swat" style={{ background: 'var(--marine)' }} /> {t('map.legend.marine')}</span>
              <span className="ml mono">{t('map.legend.grid')}</span>
            </div>
            <div className="ext" style={{ position: 'absolute', right: 22, top: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
              {t('map.basemap')} · {t(layer === 'sonar' ? 'map.sonar' : layer === 'chart' ? 'map.topographic' : 'map.satellite').toUpperCase()}
            </div>
          </GeoOceanMap>
        </div>

        <div className="span-4 stack" style={{ gap: 16 }}>
          <Card>
            <CardHead kt={t('map.ktLocal')} title={t('map.filters')} />
            <input className="input" placeholder={t('map.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 14 }} />
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <span className="tiny upper muted" style={{ display: 'block', marginBottom: 6 }}>{t('map.clsLabel')}</span>
                <ChipGroup options={CLASS_LIST.slice().map((c) => clsLabel(c, language))} value={classes.map((c) => clsLabel(c as DetectionClass, language))} onChange={(v) => setClasses(v.map((l) => CLASS_LIST.find((c) => clsLabel(c, language) === l) ?? 'shipwreck'))} />
              </div>
              <div>
                <span className="tiny upper muted" style={{ display: 'block', marginBottom: 6 }}>{t('map.riskLevel')}</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {RISK_ALL.map((r) => (
                    <button key={r} className={`chip${risks.includes(r) ? ' on' : ''}`} onClick={() => setRisks(risks.includes(r) ? risks.filter((x) => x !== r) : [...risks, r])}>{riskLabel(r, language)}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="tiny upper muted" style={{ display: 'block', marginBottom: 6 }}>{t('map.timeWindow')}</span>
                <Select value={window} onChange={setWindow} options={[
                  { value: 'all', label: t('map.windowAll') },
                  { value: '24h', label: t('map.windowHours', { n: 24 }) },
                  { value: '7d', label: t('map.windowDays', { n: 7 }) },
                  { value: '30d', label: t('map.windowDays', { n: 30 }) },
                ]} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHead kt={t('map.markers')} title={t('map.resultsTitle', { clusters: clusters.length, detections: filtered.length })} />
            <div className="stack" style={{ gap: 2, maxHeight: 330, overflow: 'auto' }}>
              {clusters.slice(0, 10).map((c) => {
                const d = c.detections[0];
                return (
                  <button key={c.key} className="monitor-row" style={{ textAlign: 'left', borderBottom: '1px solid var(--line-faint)', padding: '9px 4px', background: 'transparent', width: '100%', border: 'none', cursor: 'pointer' }} onClick={() => setSelected(c)}>
                    <div className="row-between" style={{ gap: 8 }}>
                      <b className="mono" style={{ fontSize: 11.5 }}>{fmtCoordinate(c.lat, c.lng)}</b>
                      <span className="badge b-plain">{c.detections.length}×</span>
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <ClassBadge cls={dominant(c)} />
                      <RiskBadge risk={worstRisk(c)} />
                    </div>
                    <div className="mono tiny muted" style={{ marginTop: 3 }}>{fmtDT(d.detectionTime)} · {d.department.replace(/-/g, ' ')}</div>
                  </button>
                );
              })}
              {clusters.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: 12 }}>{t('map.empty')}</div>}
            </div>
          </Card>
        </div>
      </div>

      {selected && (
        <Drawer onClose={() => setSelected(null)} foot={
          <div className="row" style={{ gap: 8 }}>
            {selected.detections[0] && <Link to={`detail/${selected.detections[0].id}`} className="btn btn-primary" style={{ flex: 1 }}><IconScan size={15} /> {t('map.viewCase')}</Link>}
            <Button variant="secondary" onClick={() => setSelected(null)}>{t('common.close')}</Button>
          </div>
        }>
          <div className="tiny upper acc" style={{ marginBottom: 8 }}>{t('map.locationCluster')}</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{fmtCoordinate(selected.lat, selected.lng)}</h3>
          <div className="tiny muted" style={{ marginBottom: 16 }}>{t('map.bundled', { n: selected.detections.length, s: selected.detections.length > 1 ? 's' : '' })}</div>
          <div className="stack" style={{ gap: 10 }}>
            {selected.detections.map((d) => (
              <div key={d.id} className="row" style={{ gap: 12, padding: 10, border: '1px solid var(--line-faint)', borderRadius: 10, fontSize: 12.5 }}>
                <span className="legend-dot" style={{ background: CLASS_META[d.className].color }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <ClassBadge cls={d.className} />
                  <div className="mono tiny muted" style={{ marginTop: 3 }}>{d.id} · {fmtDT(d.detectionTime)} · {t('map.conf', { pct: (d.confidence * 100).toFixed(1) })}</div>
                </div>
                <RiskBadge risk={d.riskLevel} />
              </div>
            ))}
          </div>
        </Drawer>
      )}
    </div>
  );
}