import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { Card, CardHead, Kv, Tag } from '../lib/ui';
import { bestWindow, compass, dayLabel, fetchRegionWeather, planTask, seaState, weatherLabel, windCondition } from '../lib/weather';
import type { RegionWeather, RiskLevel, WeatherDay } from '../types';

function fmtWave(m: number | null): string {
  return m == null ? '—' : `${m.toFixed(1)} m`;
}

const BADGE: Record<'GOOD' | 'CAUTION' | 'POOR', string> = {
  GOOD: 'b-teal',
  CAUTION: 'b-accent',
  POOR: 'b-risk-critical',
};

const VERDICT_STYLE: Record<string, { badge: string; color: string }> = {
  ON_TRACK: { badge: 'b-teal', color: 'var(--teal)' },
  TIGHT: { badge: 'b-accent', color: 'var(--accent-2)' },
  OUTLOOK: { badge: 'b-marine', color: 'var(--marine)' },
  AT_RISK: { badge: 'b-risk-critical', color: 'var(--critical)' },
  MISSED: { badge: 'b-risk-critical', color: 'var(--critical)' },
};

export function WeatherReport({ lat, lng, task }: { lat: number; lng: number; task?: { riskLevel: RiskLevel; responseDeadline: string } }) {
  const { language } = useStore();
  const t = makeT(language);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [wx, setWx] = useState<RegionWeather | null>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchRegionWeather(lat, lng)
      .then((data) => {
        if (!alive) return;
        setWx(data);
        setState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setState('error');
      });
    return () => {
      alive = false;
    };
  }, [lat, lng]);

  if (state === 'loading') {
    return (
      <Card>
        <CardHead kt={t('w.kt')} title={t('w.loading')} right={<span className="spinner" style={{ width: 15, height: 15 }} />} />
        <div style={{ padding: '18px 10px', color: 'var(--ink-3)', fontSize: 12.5 }}>{t('w.fetching')}</div>
      </Card>
    );
  }

  if (state === 'error' || !wx) {
    return (
      <Card>
        <CardHead kt={t('w.kt')} title={t('w.unavailable')} right={<Tag kind="rule">{t('w.offline')}</Tag>} />
        <div style={{ padding: '18px 10px', color: 'var(--ink-3)', fontSize: 12.5 }}>{t('w.errorBody')}</div>
      </Card>
    );
  }

  const c = wx.current;
  const plan = task ? planTask(wx.days, task.responseDeadline, task.riskLevel) : null;
  const vs = plan ? VERDICT_STYLE[plan.verdict] : null;
  const window = plan ? null : bestWindow(wx.days);
  const sea = c.waveHeight != null ? seaState(c.waveHeight) : null;
  const worstDay = [...wx.days].sort((a, b) => b.precipProb - a.precipProb || b.waveMax - a.waveMax)[0];

  const SEA_LABEL: Record<string, string> = {
    CALM: t('w.seaCalm'),
    MODERATE: t('w.seaModerate'),
    ROUGH: t('w.seaRough'),
    'VERY ROUGH': t('w.seaVeryRough'),
  };
  const WIND_LABEL: Record<string, string> = {
    Light: t('w.windLight'),
    Gentle: t('w.windGentle'),
    Moderate: t('w.windModerate'),
    Strong: t('w.windStrong'),
    Gale: t('w.windGale'),
  };
  const SKY_LABEL: Record<string, string> = {
    Clear: t('w.skyClear'),
    'Mostly clear': t('w.skyMostlyClear'),
    'Partly cloudy': t('w.skyPartlyCloudy'),
    Overcast: t('w.skyOvercast'),
    Fog: t('w.skyFog'),
    Drizzle: t('w.skyDrizzle'),
    Rain: t('w.skyRain'),
    'Freezing rain': t('w.skyFreezingRain'),
    Snow: t('w.skySnow'),
    'Rain showers': t('w.skyRainShowers'),
    'Snow showers': t('w.skySnowShowers'),
    Thunderstorms: t('w.skyThunder'),
  };
  const RATING: Record<string, string> = {
    GOOD: t('w.good'),
    CAUTION: t('w.caution'),
    POOR: t('w.poor'),
  };
  const VERDICT_LABEL: Record<string, string> = {
    ON_TRACK: t('w.verdict.onTrack'),
    TIGHT: t('w.verdict.tight'),
    AT_RISK: t('w.verdict.atRisk'),
    MISSED: t('w.verdict.missed'),
    OUTLOOK: t('w.verdict.outlook'),
  };

  let headline = '';
  let detail = '';
  if (plan && task) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = dateKey(new Date());
    const deadline = dateKey(new Date(task.responseDeadline));
    const relevant = wx.days.filter((d) => d.date >= today && d.date <= deadline);
    const win = bestWindow(relevant);
    const RNK: Record<string, number> = { GOOD: 0, CAUTION: 1, POOR: 2 };
    const leastBad: WeatherDay | null = relevant.length ? [...relevant].sort((a, b) => RNK[a.rating] - RNK[b.rating] || a.waveMax - b.waveMax)[0] : null;
    const lastForecast = wx.days.length ? wx.days[wx.days.length - 1].date : '';

    if (plan.verdict === 'MISSED') {
      headline = t('w.h.missed', { deadline: plan.deadlineLabel });
      detail = t('w.d.missed', { risk: task.riskLevel === 'critical' ? t('w.riskCriticalEsc') : t('w.riskEscOverdue') });
    } else if (plan.verdict === 'OUTLOOK') {
      headline = t('w.h.outlook', { deadline: plan.deadlineLabel });
      detail = t('w.d.outlook', { date: lastForecast || t('w.tomorrow') });
    } else if (plan.verdict === 'AT_RISK' || !win || !leastBad) {
      headline = t('w.h.atRisk', { deadline: plan.deadlineLabel });
      detail = t('w.d.atRisk', { level: t('w.poor') });
    } else if (plan.verdict === 'ON_TRACK') {
      const winLabel = `${dayLabel(win.start)}${win.count > 1 ? ` → ${dayLabel(win.end)}` : ''}`;
      headline = t('w.h.onTrack', { window: winLabel });
      detail = t('w.d.onTrack', { count: win.count, deadline: plan.deadlineLabel, start: dayLabel(win.start), hours: Math.round(plan.hoursLeft) });
    } else {
      headline = t('w.h.tight', { day: dayLabel(leastBad.date) });
      detail = t('w.d.tight', { deadline: plan.deadlineLabel, day: dayLabel(leastBad.date), wave: leastBad.waveMax.toFixed(1), wind: Math.round(leastBad.windMaxKmh), rain: Math.round(leastBad.precipProb) });
    }
  }

  return (
    <Card>
      <CardHead kt={t('w.kt')} title={wx.region} right={<Tag kind="rule">{t('w.dayOutlook')}</Tag>} />

      <div className="grid cols-12" style={{ gap: 8, marginBottom: 12 }}>
        <div className="span-3">
          <Kv k={t('w.seaState')} v={<span className="stack" style={{ gap: 3 }}><b>{fmtWave(c.waveHeight)}</b>{sea && <span className={`badge b-${sea.tone}`}>{SEA_LABEL[sea.label] ?? sea.label}</span>}</span>} />
        </div>
        <div className="span-3">
          <Kv k={t('w.wind')} v={<span className="stack" style={{ gap: 3 }}><b>{c.windSpeedKmh != null ? `${Math.round(c.windSpeedKmh)} km/h` : '—'}</b>{c.windSpeedKmh != null && <span className="tiny muted">{WIND_LABEL[windCondition(c.windSpeedKmh)] ?? windCondition(c.windSpeedKmh)}{c.windDirectionDeg != null ? ` · ${compass(c.windDirectionDeg)}` : ''}</span>}</span>} />
        </div>
        <div className="span-3">
          <Kv k={t('w.sky')} v={<span className="stack" style={{ gap: 3 }}><b>{c.weatherCode != null ? SKY_LABEL[weatherLabel(c.weatherCode)] ?? weatherLabel(c.weatherCode) : '—'}</b>{c.wavePeriod != null && <span className="tiny muted">{t('w.period', { v: c.wavePeriod })}</span>}</span>} />
        </div>
        <div className="span-3">
          <Kv k={t('w.air')} v={<span className="stack" style={{ gap: 3 }}><b>{c.tempC != null ? `${Math.round(c.tempC)}°C` : '—'}</b>{c.waveDirection != null && <span className="tiny muted">{t('w.wavesFrom', { dir: compass(c.waveDirection) })}</span>}</span>} />
        </div>
      </div>

      <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
        {wx.days.map((d) => (
          <div key={d.date} className="row-between" style={{ padding: '7px 10px', border: '1px solid var(--line-faint)', borderRadius: 9, fontSize: 12.5 }}>
            <span className="row" style={{ gap: 12, minWidth: 96 }}>
              <b style={{ fontSize: 12 }}>{dayLabel(d.date)}</b>
              <span className="tiny muted">{Math.round(d.tempMin)}–{Math.round(d.tempMax)}°</span>
            </span>
            <span className="mono tiny" style={{ color: 'var(--ink-3)', minWidth: 118 }}>{t('w.dayWaves', { v: fmtWave(d.waveMax) })}</span>
            <span className="mono tiny" style={{ color: 'var(--ink-3)', minWidth: 92 }}>{Math.round(d.windMaxKmh)} km/h</span>
            <span className="mono tiny" style={{ color: 'var(--ink-3)', minWidth: 66 }}>{t('w.dayRain', { v: Math.round(d.precipProb) })}</span>
            <span className={`badge ${BADGE[d.rating]}`}>{RATING[d.rating] ?? d.rating}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 12, borderColor: 'var(--accent-line)', background: 'var(--accent-dim)' }}>
        {plan && vs ? (
          <>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <b className="tiny upper" style={{ color: vs.color }}>{t('w.taskHeading')}</b>
                <span className={`badge ${vs.badge}`}>{VERDICT_LABEL[plan.verdict] ?? plan.verdict.replace('_', ' ')}</span>
              </span>
              <span className="mono tiny muted">{t('w.hoursToDeadline', { h: Math.round(plan.hoursLeft) })}</span>
            </div>
            <b style={{ fontSize: 13.5, color: vs.color }}>{headline}</b>
            <p style={{ margin: '6px 0 0', color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.55 }}>{detail}</p>
          </>
        ) : (
          <>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <b className="tiny upper" style={{ color: 'var(--accent-2)' }}>{window ? t('w.recWindow') : t('w.visitGuidance')}</b>
              {window && <Tag kind="ai">{t('w.whenToVisit')}</Tag>}
            </div>
            {window ? (
              <>
                <b style={{ fontSize: 14 }}>{dayLabel(window.start)}{' '}
                  {window.count > 1 ? ` → ${dayLabel(window.end)}` : ''}
                  <span style={{ color: 'var(--accent-2)' }}> · {t('w.safeSeaDays', { n: window.count, unit: window.count > 1 ? t('w.days') : t('w.day') })}</span>
                </b>
                <p style={{ margin: '6px 0 0', color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.55 }}>
                  {t('w.bestCond')}
                  {worstDay && ` ${t('w.avoidDay', { day: dayLabel(worstDay.date), wave: fmtWave(worstDay.waveMax), rain: Math.round(worstDay.precipProb) })}`}{' '}
                  {t('w.planDaylight')}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.55 }}>
                {t('w.noSafeWindow')}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}