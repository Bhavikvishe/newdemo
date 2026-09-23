import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, CLASS_META, timeAgo } from '../lib/mock';
import { clsLabel, riskColor, riskLabel } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Progress, RiskBadge } from '../lib/ui';
import { Link } from '../lib/router';
import { IconPause, IconPlay, IconStop } from '../components/Icons';
import { WeatherReport } from '../components/Weather';
import type { DetectionClass, RiskLevel } from '../types';

interface LiveEvent {
  id: string;
  className: DetectionClass;
  confidence: number;
  bearing: number;
  range: number;
  depth: number;
  risk: RiskLevel;
  ts: string;
  flagged: boolean;
}

function randomEvent(now: string): LiveEvent {
  const cls = CLASS_LIST[Math.floor(Math.random() * CLASS_LIST.length)];
  const meta = CLASS_META[cls];
  const risk = meta.riskBase === 'medium' ? (['medium', 'high', 'low'] as RiskLevel[])[Math.floor(Math.random() * 3)] : meta.riskBase;
  return {
    id: `lv-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    className: cls,
    confidence: +(0.55 + Math.random() * 0.42).toFixed(3),
    bearing: Math.floor(Math.random() * 360),
    range: 8 + Math.floor(Math.random() * 112),
    depth: 6 + Math.floor(Math.random() * 60),
    risk,
    ts: now,
    flagged: false,
  };
}

const THRESH_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

const LIVE_POS = { lat: 18.9, lng: 72.8333 };

function blipPos(bearing: number, range: number) {
  const rad = ((bearing - 90) * Math.PI) / 180;
  const r = 10 + (range / 120) * 34;
  const x = 50 + Math.cos(rad) * r;
  const y = 50 + Math.sin(rad) * r;
  return { left: `${x}%`, top: `${y}%` };
}

export function LivePage() {
  const store = useStore();
  const { language, settings } = store;
  const t = makeT(language);

  const [monitoring, setMonitoring] = useState(false);
  const [paused, setPaused] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [intervalMs, setIntervalMs] = useState(7000);
  const [sensitivity, setSensitivity] = useState(68);
  const [threshold, setThreshold] = useState<RiskLevel>('high');
  const [tele, setTele] = useState({ signal: 96, depth: 38, gps: '18°54′N 72°50′E' });

  const running = monitoring && !paused;
  const sens = sensitivity / 100;

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const ev = randomEvent(new Date().toISOString());
      const pass = THRESH_ORDER.indexOf(ev.risk) >= THRESH_ORDER.indexOf(threshold);
      const flagged = pass && Math.random() < sens;
      setEvents((es) => [{ ...ev, flagged }, ...es].slice(0, 12));
      setTele((tr) => ({
        signal: Math.min(99, Math.max(88, tr.signal + (Math.random() - 0.5) * 4)),
        depth: 34 + Math.floor(Math.random() * 12),
        gps: tr.gps,
      }));
    }, intervalMs);
    return () => clearInterval(iv);
  }, [running, intervalMs, threshold, sens]);

  const counted = useMemo(() => {
    const openEvents = events.filter((e) => !e.className.includes('manta'));
    return { events: openEvents.length, pers: events.filter((e) => e.flagged).length };
  }, [events]);

  return (
    <div>
      <PageHead
        kicker={t('live.title')}
        title={t('nav.live')}
        sub={t('live.sub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            {!running ? (
              <Button variant="primary" onClick={() => { setMonitoring(true); setPaused(false); }}>
                <IconPlay size={15} /> {paused ? t('live.resume') : t('live.start')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setPaused(true)}><IconPause size={15} /> {t('live.pause')}</Button>
            )}
            {monitoring && <Button variant="ghost" onClick={() => { setMonitoring(false); setPaused(false); }}><IconStop size={15} /> {t('live.stop')}</Button>}
          </div>
        }
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-8">
          <Card solid style={{ padding: 0, overflow: 'hidden' }}>
            <div className="row-between" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line-soft)' }}>
              <span className="badge b-teal"><span className="dot" /> {running ? t('live.statusActive') : paused ? t('live.statusPaused') : t('live.statusStandby')}</span>
              <span className="mono tiny muted">{t('live.sonarLine', { tvg: settings.sonarCalibration.tvg, range: settings.sonarCalibration.range })}</span>
            </div>
            <div className="live-radar" style={{ aspectRatio: '1.7', borderRadius: 0, border: 'none', position: 'relative' }}>
              <div className="ring" style={{ width: '68%', aspectRatio: '1' }} />
              <div className="ring" style={{ width: '42%', aspectRatio: '1', borderStyle: 'dashed' }} />
              <div className="ring" style={{ width: '20%', aspectRatio: '1' }} />
              <div className="sweep" style={{ height: '44%' }} />
              {events.slice(0, 10).map((e) => {
                const pos = blipPos(e.bearing, e.range);
                const marine = CLASS_META[e.className].category === 'marine-life';
                const tint = marine ? 'var(--marine)' : riskColor(e.risk);
                return (
                  <div key={e.id} className="blip" style={{ ...pos, background: tint, boxShadow: `0 0 9px 1px ${tint}`, width: e.flagged ? 10 : 7, height: e.flagged ? 10 : 7 }} title={`${clsLabel(e.className, language)} · ${e.bearing}° ${e.range}m`} />
                );
              })}
              <div className="ext" style={{ position: 'absolute', left: 12, top: 12 }}>N ▸</div>
              <div className="ext" style={{ position: 'absolute', right: 12, bottom: 12 }}>ARABIAN SEA · GRID MON-04</div>
              <div className="ext" style={{ position: 'absolute', left: 12, bottom: 12 }}>{t('live.radarRange')}</div>
              <div className="ext" style={{ position: 'absolute', right: 12, top: 12 }}>{t('common.gps')} {tele.gps}</div>
            </div>
            <div className="row" style={{ gap: 0 }}>
              {[
                { k: t('live.signal'), v: `${tele.signal.toFixed(1)}%`, c: 'var(--teal)' },
                { k: t('live.depth'), v: `${tele.depth} m`, c: 'var(--accent)' },
                { k: t('live.objects'), v: counted.events, c: 'var(--medium)' },
                { k: t('live.flagged'), v: counted.pers, c: 'var(--critical)' },
                { k: t('common.gps'), v: tele.gps, c: 'var(--marine)' },
              ].map((r) => (
                <div key={r.k} className="live-stat" style={{ flex: 1, padding: '10px 14px', borderLeft: '1px solid var(--line-faint)', textAlign: 'center' }}>
                  <span className="tiny upper muted">{r.k}</span>
                  <b className="mono" style={{ display: 'block', color: r.c, fontSize: 15 }}>{r.v}</b>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ marginTop: 16 }}>
            <WeatherReport lat={LIVE_POS.lat} lng={LIVE_POS.lng} />
          </div>

          {monitoring && (
            <Card style={{ marginTop: 16 }}>
              <CardHead kt={t('live.incomingKt')} title={t('live.incoming')} right={<span className="badge b-plain">{events.length} {t('live.buffered')}</span>} />
              <div className="stack" style={{ gap: 6 }}>
                {events.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: 8 }}>{t('live.awaiting')}</div>}
                {events.map((e) => {
                  const meta = CLASS_META[e.className];
                  const marine = meta.category === 'marine-life';
                  return (
                    <div key={e.id} className="row" style={{ gap: 12, padding: '9px 4px', borderBottom: '1px solid var(--line-faint)' }}>
                      <span className="legend-dot" style={{ background: marine ? 'var(--marine)' : meta.color }} />
                      <span style={{ width: 128, fontSize: 13 }}>{clsLabel(e.className, language)}</span>
                      <span className="mono tiny" style={{ color: 'var(--ink-3)', width: 62 }}>{t('live.conf', { pct: Math.round(e.confidence * 100) })}</span>
                      <span className="mono tiny" style={{ color: 'var(--ink-3)', width: 76 }}>{e.bearing}° · {e.range}m</span>
                      <span className="row" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                        <span className="mono tiny muted">{t('live.depthValue', { d: e.depth })}</span>
                        {e.flagged && <span className="badge b-accent"><span className="dot" /> {t('live.thresholdMet')}</span>}
                      </span>
                      {marine ? <span className="badge b-teal">{t('live.monitoring')}</span> : <RiskBadge risk={e.risk} />}
                      <span className="mono tiny muted">{timeAgo(e.ts, language)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="span-4 stack" style={{ gap: 16 }}>
          <Card>
            <CardHead kt={t('live.streamControlsKt')} title={t('live.telemetryControls')} />
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span className="tiny upper muted">{t('live.interval')}</span>
                  <b className="mono small">{intervalMs / 1000}s</b>
                </div>
                <input className="slider-input" type="range" min={3000} max={15000} step={1000} value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} />
              </div>
              <div>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span className="tiny upper muted">{t('live.sensitivity')}</span>
                  <b className="mono small">{sensitivity}%</b>
                </div>
                <input className="slider-input" type="range" min={10} max={100} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
                <Progress value={sensitivity} slim tone="var(--accent)" />
              </div>
              <div>
                <span className="tiny upper muted" style={{ display: 'block', marginBottom: 6 }}>{t('live.threshold')}</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {THRESH_ORDER.map((r) => (
                    <button key={r} className={`chip${threshold === r ? ' on' : ''}`} onClick={() => setThreshold(r)}>
                      {riskLabel(r, language)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--line-faint)', paddingTop: 12 }}>
                <div className="tiny upper muted" style={{ marginBottom: 8 }}>{t('live.health')}</div>
                {[
                  [t('live.cpu'), 12, 'var(--teal)'],
                  [t('live.mem'), 41, 'var(--accent)'],
                  [t('live.storage'), 63, 'var(--medium)'],
                  [t('live.sonar'), 100, 'var(--teal)'],
                  [t('live.gps'), 100, 'var(--teal)'],
                ].map(([k, d, c]) => (
                  <div key={k as string} className="row-between" style={{ fontSize: 11.5, marginBottom: 7 }}>
                    <span className="muted">{k}</span>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <Progress value={d as number} slim tone={c as string} />
                      <b className="mono tiny" style={{ color: c as string }}>{d as number}%</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead kt={t('live.routingKt')} title={t('live.routingRules')} />
            <div className="stack" style={{ gap: 6 }}>
              {CLASS_LIST.filter((c) => c !== 'manta').map((c) => (
                <div key={c} className="row-between" style={{ fontSize: 12.5 }}>
                  <span className="row" style={{ gap: 8 }}><span className="legend-dot" style={{ background: CLASS_META[c].color }} />{clsLabel(c, language)}</span>
                  <span className="mono tiny muted">{CLASS_META[c].primary === 'marine-operations' ? 'MOP' : CLASS_META[c].primary === 'marine-environmental' ? 'ENV' : CLASS_META[c].primary === 'search-rescue' ? 'SAR' : CLASS_META[c].primary === 'marine-engineering' ? 'MEG' : 'SRV'}</span>
                </div>
              ))}
              <div className="row-between" style={{ fontSize: 12.5, marginTop: 6 }}>
                <span>{t('cls.manta')}</span>
                <span className="badge b-teal">{t('live.monitor')}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead kt={t('nav.live')} title={t('live.recentRecords')} />
            <div className="stack" style={{ gap: 8 }}>
              {store.detections.slice(0, 5).map((d) => (
                <Link key={d.id} to={`detail/${d.id}`} className="row" style={{ gap: 10, fontSize: 12.5, color: 'var(--ink-2)' }}>
                  <span className="legend-dot" style={{ background: CLASS_META[d.className].color }} />
                  <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.id}</span>
                  <span className="mono tiny muted">{Math.round(d.confidence * 100)}%</span>
                  <span className="mono tiny" style={{ color: riskColor(d.riskLevel) }}>{riskLabel(d.riskLevel, language).toUpperCase()}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}