import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { navigate } from '../lib/router';
import { makeT } from '../lib/i18n';
import { useStore } from '../lib/store';
import { OceMark } from './Shell';
import { Button } from '../lib/ui';

interface TourStep {
  id: string;
  route: string;
  titleKey: string;
  descKey: string;
  target: string;
}

const STEPS: TourStep[] = [
  { id: 'overview', route: 'overview', titleKey: 'ob.step.overview', descKey: 'ob.step.overview.desc', target: '.page-head' },
  { id: 'detection', route: 'detection', titleKey: 'ob.step.detection', descKey: 'ob.step.detection.desc', target: '.page-head' },
  { id: 'batch', route: 'batch', titleKey: 'ob.step.batch', descKey: 'ob.step.batch.desc', target: '.page-head' },
  { id: 'depth', route: 'depth', titleKey: 'ob.step.live', descKey: 'ob.step.live.desc', target: '.page-head' },
  { id: 'map', route: 'map', titleKey: 'ob.step.map', descKey: 'ob.step.map.desc', target: '.page-head' },
  { id: 'alerts', route: 'alerts', titleKey: 'ob.step.alerts', descKey: 'ob.step.alerts.desc', target: '.page-head' },
  { id: 'routing', route: 'department', titleKey: 'ob.step.routing', descKey: 'ob.step.routing.desc', target: '.page-head' },
  { id: 'mydept', route: 'department', titleKey: 'ob.step.mydept', descKey: 'ob.step.mydept.desc', target: '.card' },
  { id: 'history', route: 'history', titleKey: 'ob.step.history', descKey: 'ob.step.history.desc', target: '.page-head' },
  { id: 'analytics', route: 'analytics', titleKey: 'ob.step.analytics', descKey: 'ob.step.analytics.desc', target: '.page-head' },
  { id: 'reports', route: 'reports', titleKey: 'ob.step.reports', descKey: 'ob.step.reports.desc', target: '.page-head' },
  { id: 'settings', route: 'settings', titleKey: 'ob.step.settings', descKey: 'ob.step.settings.desc', target: '.page-head' },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Onboarding({ welcome = false }: { welcome?: boolean }) {
  const store = useStore();
  const { language, completeOnboarding, closeTour } = store;
  const t = makeT(language);
  const [mode, setMode] = useState<'welcome' | 'tour' | 'complete'>(welcome ? 'welcome' : 'tour');
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = STEPS[idx];

  useEffect(() => {
    if (mode !== 'tour') return;
    const s = STEPS[idx];
    navigate(s.route);
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(s.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [mode, idx]);

  const start = () => {
    setMode('tour');
    setIdx(0);
  };

  const skipTour = () => {
    completeOnboarding();
    closeTour();
  };

  const next = () => {
    if (idx < STEPS.length - 1) setIdx(idx + 1);
    else setMode('complete');
  };

  const prev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  if (mode === 'welcome') {
    return (
      <div className="welcome-screen" role="dialog" aria-modal="true">
        <div className="welcome-card">
          <div className="row" style={{ justifyContent: 'center' }}>
            <OceMark size={64} />
          </div>
          <div className="tagline">{t('onb.welcome.tagline')}</div>
          <h2>{t('ob.welcome.title')}</h2>
          <p className="desc">{t('ob.welcome.desc')}</p>
          <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={start}>{t('ob.start')}</Button>
            <Button variant="secondary" onClick={skipTour}>{t('ob.explore')}</Button>
            <Button variant="ghost" onClick={skipTour}>{t('common.skip')}</Button>
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 18, marginTop: 26 }}>
            <span className="tiny upper muted">{t('onb.welcome.stats', { steps: STEPS.length, seconds: 90 })}</span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'complete') {
    return (
      <div className="welcome-screen" role="dialog" aria-modal="true">
        <div className="welcome-card">
          <div className="row" style={{ justifyContent: 'center' }}>
            <OceMark size={54} />
          </div>
          <div className="tagline">{t('onb.complete.tagline')}</div>
          <h2>{t('ob.complete.title')}</h2>
          <p className="desc">{t('ob.complete.desc')}</p>
          <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => { completeOnboarding(); closeTour(); navigate('overview'); }}>{t('ob.dashboard')}</Button>
            <Button variant="secondary" onClick={() => { completeOnboarding(); closeTour(); navigate('detection'); }}>{t('ob.detect')}</Button>
            <Button variant="secondary" onClick={() => { completeOnboarding(); closeTour(); navigate('department'); }}>{t('ob.mydept')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const cardAbove = rect ? rect.y > window.innerHeight * 0.55 : false;
  const cardStyle: CSSProperties = cardAbove || !rect
    ? { left: rect ? Math.min(Math.max(20, rect.x + rect.w / 2 - 200), window.innerWidth - 420) : 20, top: (rect?.y ?? 240) + (rect?.h ?? 0) + 24 }
    : { left: rect ? Math.min(Math.max(20, rect.x + rect.w / 2 - 200), window.innerWidth - 420) : 20, top: Math.max(20, rect?.y - (rect?.h ?? 0) - 240) };

  return (
    <>
      <div className="tour-overlay" />
      {rect && (
        <div className="tour-hole" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      )}
      <div className="tour-card" style={cardStyle}>
        <div className="t-prog">{t('onb.tour.progress', { current: String(idx + 1).padStart(2, '0'), total: String(STEPS.length).padStart(2, '0') })}</div>
        <h3>{t(step.titleKey)}</h3>
        <p>{t(step.descKey)}</p>
        <div className="t-btns">
          <Button variant="ghost" size="sm" onClick={skipTour}>{t('common.skip')}</Button>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={prev} disabled={idx === 0}>{t('common.back')}</Button>
            <Button variant="primary" size="sm" onClick={next}>{idx === STEPS.length - 1 ? t('common.finish') : t('common.next')}</Button>
          </div>
        </div>
      </div>
    </>
  );
}