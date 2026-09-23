import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Language } from '../types';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { OceMark } from '../components/Shell';
import { Link } from '../lib/router';
import { CLASS_LIST, CLASS_META, DEPARTMENTS } from '../lib/mock';
import { categoryLabel, clsLabel, riskLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { Reveal, Counter } from '../lib/ui';
import {
  IconArrowRight,
  IconCheck,
  IconFish,
  IconGlobe,
  IconGauge,
  IconRadar,
  IconScan,
  IconShield,
  IconWave,
} from '../components/Icons';

interface Sample {
  id: string;
  className: (typeof CLASS_LIST)[number];
  boundingBox: { x: number; y: number; width: number; height: number; normalized: boolean };
}

const SAMPLES: Sample[] = CLASS_LIST.map((cls, i) => ({
  id: `land-${cls}`,
  className: cls,
  boundingBox: { x: 0.3 + (i % 2) * 0.05, y: 0.28 + (i % 3) * 0.05, width: 0.34, height: 0.34, normalized: true },
}));

const WORKFLOW = [
  'lan.wfSideScanSonar',
  'lan.wfImageUpload',
  'lan.wfAiDetection',
  'lan.wfObjectClassification',
  'lan.wfConfidenceVerification',
  'lan.wfGpsTagging',
  'lan.wfSizeEstimation',
  'lan.wfWeightEstimation',
  'lan.riskAssessment',
  'lan.wfDepartmentRouting',
  'lan.operatorAssignment',
  'lan.wfEquipmentAllocation',
  'lan.wfResponse',
  'lan.resolution',
  'lan.verification',
];

const HERO_SONAR_TARGETS = [
  { label: 'GFG-114', type: 'ghost_fishing_gear', x: 64, y: 30, cls: 'risk-high' },
  { label: 'WRK-018', type: 'shipwreck', x: 40, y: 60, cls: 'risk-medium' },
  { label: 'MANTA-06', type: 'manta', x: 26, y: 40, cls: 'risk-marine' },
];

const FLOW_FIRST = ['lan.sonarDetection', 'lan.aiClassification', 'lan.riskAssessment', 'lan.routingRule', 'lan.responsibleDept'];
const FLOW_SECOND = ['lan.deptAlertInbox', 'lan.operatorAssignment', 'lan.fieldResponse', 'lan.resolution', 'lan.verification'];

const STATS = [
  { value: 1284, labelKey: 'lan.statDetections', unit: '' },
  { value: 612, labelKey: 'lan.statDebris', unit: '' },
  { value: 18, labelKey: 'lan.statResponse', unit: 'h' },
  { value: 1420, labelKey: 'lan.statCoverage', unit: ' km²' },
];

export function LandingPage() {
  const { language, theme, setTheme, setLanguage } = useStore();
  const t = makeT(language);
  const [swX, setSwX] = useState(0);
  const secRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const el = secRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const progress = Math.max(-80, Math.min(80, r.top * -0.05));
      setSwX(progress);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const frames = useMemo(() => {
    const out = new Map<string, string>();
    SAMPLES.forEach((s) => out.set(s.className, renderFrame(s, { width: 360 }, language)));
    return out;
  }, [language]);

  return (
    <div className="landing">
      <nav className="ln-nav">
        <div className="row" style={{ gap: 10 }}>
          <OceMark size={38} />
          <div>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '0.02em' }}>OCEONIX</b>
            <div className="tiny upper muted">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="ln-links">
          <ScrollA href="#how">{t('lan.how')}</ScrollA>
          <ScrollA href="#cap">{t('lan.capabilities')}</ScrollA>
          <ScrollA href="#classes">{t('lan.classes')}</ScrollA>
          <ScrollA href="#response">{t('lan.response')}</ScrollA>
          <ScrollA href="#live">{t('lan.live')}</ScrollA>
          <ScrollA href="#stats">{t('lan.data')}</ScrollA>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('set.theme')}>
            {theme === 'dark' ? <span className="mono small">☀</span> : <span className="mono small">☾</span>}
          </button>
          <button className="btn btn-ghost btn-sm mono" onClick={() => setLanguage(language === 'en' ? 'hi' : language === 'hi' ? 'mr' : 'en')}>
            {language.toUpperCase()}
          </button>
          <Link to="login" className="btn btn-primary btn-sm"><IconArrowRight size={15} /> {t('lan.openPortal')}</Link>
        </div>
      </nav>

      <section className="hero" ref={secRef}>
        <div>
          <span className="hero-badge"><IconWave size={14} /> {t('lan.heroBadge')}</span>
          <h1>
            {t('lan.heroTitle1')}<br />
            <span className="dim">{t('lan.heroTitle2')}</span>
          </h1>
          <p className="hero-lead">
            {t('lan.heroLead')}
          </p>
          <div className="hero-ctas">
            <Link to="login" className="btn btn-primary btn-lg"><IconScan size={17} /> {t('lan.launchDetection')}</Link>
            <Link to="login" className="btn btn-secondary btn-lg"><IconRadar size={17} /> {t('lan.exploreLive')}</Link>
            <Link to="login" className="btn btn-outline btn-lg"><IconGlobe size={17} /> {t('lan.viewOceanMap')}</Link>
          </div>
          <div className="hero-readout">
            <div className="ro"><b>19.1234° N</b><span>{t('lan.latitude')}</span></div>
            <div className="ro"><b>72.6543° E</b><span>{t('lan.longitude')}</span></div>
            <div className="ro"><b>-38 m</b><span>{t('lan.waterColumn')}</span></div>
            <div className="ro"><b>87.4%</b><span>{t('common.confidence')}</span></div>
          </div>
        </div>

        <div className="ln-hero-visual" style={{ transform: `translateY(${swX * 0.25}px)` }}>
          <div className="hero-sonar">
            <div className="sc" />
            <div className="sc sc2" />
            <div className="sc sc3" />
            <div className="sweep" style={{ height: '45%' }} />
            {HERO_SONAR_TARGETS.map((th) => (
              <div key={th.label} className={`blip ${th.cls}`} style={{ left: `${th.x}%`, top: `${th.y}%` }} />
            ))}
            <div className="ext" style={{ position: 'absolute', left: '-14px', top: '52%' }}><span className="hd">12 kHz</span> · {t('lan.sweep', { n: 7 })}</div>
            <div className="ext" style={{ position: 'absolute', right: '-6px', top: '20%' }}>R 38 m</div>
            <div className="ext" style={{ position: 'absolute', left: '50%', bottom: '-26px', transform: 'translateX(-50%)' }}>ARABIAN SEA · GRID MON-04</div>
          </div>

          <div className="hero-tag" style={{ left: '6%', top: '12%' }}>
            <span className="legend-dot" style={{ background: 'var(--high)', width: 6, height: 6 }} />
            <span>GFG-114</span><b>{riskLabel('high', language).toUpperCase()}</b>
          </div>
          <div className="hero-tag" style={{ right: '8%', top: '56%', animationDelay: '1.2s' }}>
            <b>87.4%</b><span>{t('lan.confShort')}</span>
          </div>
          <div className="hero-tag" style={{ left: '16%', bottom: '14%', animationDelay: '2s' }}>
            <span className="legend-dot" style={{ background: 'var(--teal)', width: 6, height: 6 }} />
            <span>{t('lan.routedTo', { dept: 'ENV-03' })}</span>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how" style={{ background: 'var(--bg1)', borderTop: '1px solid var(--line-faint)' }}>
        <div className="section-head">
          <div className="kicker">{t('lan.howKicker')}</div>
          <h2>{t('lan.howTitle')}</h2>
          <p>{t('lan.howDesc')}</p>
        </div>

        <Reveal>
          <div className="card" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
            <div className="flow-line" style={{ top: 54 }} />
            <div className="steps-flow">
              {FLOW_FIRST.map((s, i) => (
                <div className="step" key={s}>
                  <span className="n">0{i + 1}</span>
                  <b>{t(s)}</b>
                </div>
              ))}
            </div>
            <div className="steps-flow" style={{ marginTop: 26 }}>
              {FLOW_SECOND.map((s, i) => (
                <div className="step" key={s} style={{ borderTop: '1px solid var(--line-faint)' }}>
                  <span className="n">0{5 + i + 1}</span>
                  <b>{t(s)}</b>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="workflow-track" style={{ marginTop: 26 }}>
            {WORKFLOW.map((w, i) => (
              <div className="wt" key={w}>
                <span className="wn">{String(i + 1).padStart(2, '0')}</span>
                {t(w)}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* CAPABILITIES */}
      <section className="section" id="cap">
        <div className="section-head">
          <div className="kicker">{t('lan.capKicker')}</div>
          <h2>{t('lan.capTitle')}</h2>
          <p>{t('lan.capDesc')}</p>
        </div>
        <div className="cap-grid">
          {[
            { icon: <IconScan size={19} />, tKey: 'lan.cap1Title', dKey: 'lan.cap1Desc' },
            { icon: <IconFish size={19} />, tKey: 'lan.cap2Title', dKey: 'lan.cap2Desc' },
            { icon: <IconGauge size={19} />, tKey: 'lan.cap3Title', dKey: 'lan.cap3Desc' },
            { icon: <IconShield size={19} />, tKey: 'lan.cap4Title', dKey: 'lan.cap4Desc' },
            { icon: <IconArrowRight size={19} />, tKey: 'lan.cap5Title', dKey: 'lan.cap5Desc' },
            { icon: <IconCheck size={19} />, tKey: 'lan.cap6Title', dKey: 'lan.cap6Desc' },
          ].map((c, i) => (
            <Reveal key={c.tKey} delay={i * 60}>
              <div className="cap">
                <span className="c-ic">{c.icon}</span>
                <div>
                  <b>{t(c.tKey)}</b>
                  <p>{t(c.dKey)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* DETECTION CLASSES */}
      <section className="section" id="classes" style={{ background: 'var(--bg1)', borderTop: '1px solid var(--line-faint)' }}>
        <div className="section-head">
          <div className="kicker">{t('lan.classes')}</div>
          <h2>{t('lan.clsTitle')}</h2>
          <p>{t('lan.clsDesc')}</p>
        </div>
        <div className="grid">
          {CLASS_LIST.map((cls, i) => (
            <Reveal key={cls} delay={i * 50}>
              <div className="card card-hover" style={{ padding: 14 }}>
                <img className="sonimg" src={frames.get(cls)} alt={clsLabel(cls, language)} width={360} height={186} />
                <div className="row-between" style={{ marginTop: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 650 }}>{clsLabel(cls, language)}</span>
                    <div className="tiny upper" style={{ color: 'var(--ink-3)', marginTop: 2 }}>{categoryLabel(CLASS_META[cls].category, language)}</div>
                  </div>
                  <span className="badge b-accent" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    {CLASS_META[cls].aiModel}
                  </span>
                </div>
                <div className="row-between" style={{ marginTop: 8, width: '100%' }}>
                  <span className="tiny muted mono">→ {DEPARTMENTS.find((d) => d.id === CLASS_META[cls].primary)?.shortName}</span>
                  <span className="tiny muted mono">{t('lan.riskColon')} {riskLabel(CLASS_META[cls].riskBase, language).toUpperCase()}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* RESPONSE INTELLIGENCE */}
      <section className="section" id="response">
        <div className="section-head">
          <div className="kicker">{t('lan.respKicker')}</div>
          <h2>{t('lan.respTitle')}</h2>
          <p>{t('lan.respDesc')}</p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1.1fr 0.9fr' }}>
          <Reveal>
            <div className="card" style={{ padding: 22 }}>
              <div className="tiny upper acc" style={{ marginBottom: 14 }}>{t('lan.ruleTable')}</div>
              {CLASS_LIST.filter((c) => CLASS_META[c].category !== 'marine-life').map((c) => {
                const m = CLASS_META[c];
                const primary = DEPARTMENTS.find((d) => d.id === m.primary)!;
                const esc = m.escalation ? DEPARTMENTS.find((d) => d.id === m.escalation)! : null;
                return (
                  <div key={c} className="row" style={{ gap: 12, padding: '9px 4px', borderBottom: '1px solid var(--line-faint)' }}>
                    <span className="legend-dot" style={{ background: m.color }} />
                    <span style={{ width: 128, fontSize: 13 }}>{clsLabel(c, language)}</span>
                    <span className="mono tiny" style={{ width: 58, color: 'var(--ink-3)' }}>{m.hours}h</span>
                    <span className="badge" style={{ color: primary.color, borderColor: 'color-mix(in srgb, currentColor 40%, transparent)', background: 'transparent' }}>{primary.shortName}</span>
                    {esc && <span className="tiny muted">↑ {esc.shortName}</span>}
                    <span style={{ marginLeft: 'auto' }} className="tiny muted mono">{m.equipment.slice(0, 2).join(' · ')}</span>
                  </div>
                );
              })}
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="card" style={{ padding: 22, position: 'relative' }}>
              <div className="tiny upper acc" style={{ marginBottom: 14 }}>{t('lan.liveRoutingEvent')}</div>
              <RouteEvent language={language} />
              <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <span className="tag ai">{t('lan.tagAiRouted')}</span>
                <span className="tag rule">{t('lan.tagRuleBased')}</span>
                <span className="tag ver">{t('lan.tagVerification')}</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* LIVE PREVIEW */}
      <section className="section" id="live" style={{ background: 'var(--bg1)', borderTop: '1px solid var(--line-faint)' }}>
        <div className="section-head">
          <div className="kicker">{t('lan.liveKicker')}</div>
          <h2>{t('lan.liveTitle')}</h2>
          <p>{t('lan.liveDesc')}</p>
        </div>
        <Reveal>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-faint)', gap: 12 }}>
              <span className="badge b-teal"><span className="dot" /> {t('lan.liveSweep')}</span>
              <Link to="login" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}><IconRadar size={15} /> {t('lan.openLive')}</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr' }} className="live-grid">
              <div className="live-radar" style={{ aspectRatio: '1.5', borderRadius: 0, border: 0 }}>
                <div className="ring" style={{ width: '70%', aspectRatio: '1' }} />
                <div className="ring" style={{ width: '44%', aspectRatio: '1', borderStyle: 'dashed' }} />
                <div className="ring" style={{ width: '20%', aspectRatio: '1' }} />
                <div className="sweep" style={{ height: '42%' }} />
                <div className="blip risk-critical" style={{ left: '58%' }} />
                <div className="blip risk-high" style={{ left: '72%', top: '64%' }} />
                <div className="blip" style={{ left: '34%', top: '38%' }} />
                <div className="blip risk-medium" style={{ left: '48%', top: '30%' }} />
                <div className="blip risk-marine" style={{ left: '24%', top: '60%' }} />
              </div>
              <div className="stack" style={{ padding: 18, gap: 10, borderLeft: '1px solid var(--line-faint)' }}>
                {[
                  { k: 'lan.signal', v: '96.2%' },
                  { k: 'lan.depth', v: '38 m' },
                  { k: 'lan.objects', v: '07' },
                  { k: 'lan.alerts', v: '03' },
                  { k: 'lan.gps', v: '18°54′N 72°50′E' },
                ].map((r) => (
                  <div key={r.k} className="row-between" style={{ borderBottom: '1px solid var(--line-faint)', paddingBottom: 9, fontSize: 13 }}>
                    <span className="muted">{t(r.k)}</span>
                    <b className="mono" style={{ color: 'var(--accent)' }}>{r.v}</b>
                  </div>
                ))}
                <div className="tiny upper muted" style={{ marginTop: 6 }}>{t('lan.health')}</div>
                {[
                  { k: 'lan.aiCorePct', val: t('lan.aiCorePct', { pct: 12 }) },
                  { k: 'lan.healthSonar', val: t('lan.healthSonar') },
                  { k: 'lan.healthGps', val: t('lan.healthGps') },
                ].map((s) => (
                  <div key={s.k} className="row" style={{ gap: 8, fontSize: 12 }}>
                    <IconCheck size={13} style={{ color: 'var(--teal)' }} />
                    <span style={{ color: 'var(--ink-2)' }}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section className="section" id="stats">
        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 40 }} className="stats-grid">
          <div>
            <div className="kicker" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>{t('lan.statsKicker')}</div>
            <h2 style={{ fontSize: 34, margin: '10px 0 12px' }}>{t('lan.statsTitle')}</h2>
            <p className="muted" style={{ fontSize: 14.5 }}>{t('lan.statsDesc')}</p>
            <Link to="login" className="btn btn-outline" style={{ marginTop: 8 }}>{t('lan.enterPlatform')} <IconArrowRight size={15} /></Link>
          </div>
          <div className="ln-stats">
            {STATS.map((s) => (
              <div key={s.labelKey} className="ln-stat" style={{ textAlign: 'left', padding: 26 }}>
                <b style={{ color: 'var(--accent)', fontSize: 34 }}><Counter value={s.value} />{s.unit}</b>
                <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>{t(s.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="ln-footer">
        <div className="row" style={{ gap: 10 }}>
          <OceMark size={30} />
          <div>
            <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>OCEONIX</b>
            <div className="tiny upper" style={{ color: 'var(--ink-3)' }}>{t('app.tagline')}</div>
          </div>
        </div>
        <div>
          <div className="tiny upper" style={{ color: 'var(--ink-3)', marginBottom: 8 }}>{t('lan.footerPlatform')}</div>
          <div className="stack" style={{ gap: 4 }}>
            <Link to="login" className="muted" style={{ fontSize: 12.5 }}>{t('login.title')}</Link>
            <Link to="login" className="muted" style={{ fontSize: 12.5 }}>{t('nav.live')}</Link>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {t('lan.copyright', { year: 2026 })}<br />
          {t('lan.demoBuild')}<br />
          {t('lan.versionLine')}
        </div>
      </footer>
    </div>
  );
}

function ScrollA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} onClick={(e) => { e.preventDefault(); document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' }); }}>
      {children}
    </a>
  );
}

function RouteEvent({ language: lang }: { language: Language }) {
  const t = makeT(lang);
  const [live, setLive] = useState(true);
  useEffect(() => {
    const i = window.setInterval(() => setLive((v) => !v), 2600);
    return () => window.clearInterval(i);
  }, []);
  const rows = [
    [t('lan.sonarDetection'), t('lan.frameCaptured', { code: 'GFG' })],
    [t('lan.aiClassification'), t('lan.routeClassified', { cls: clsLabel('ghost_fishing_gear', lang), conf: '87.4%' })],
    [t('lan.riskAssessment'), t('lan.routeRiskDeadline', { risk: riskLabel('high', lang).toUpperCase(), hours: 48 })],
    [t('lan.routingRule'), t('lan.routeEnvDept')],
  ];
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r[0]} className="row" style={{ gap: 12 }}>
          <span className="mono tiny" style={{ width: 24, color: live && i === rows.length - 1 ? 'var(--accent)' : 'var(--ink-3)' }}>{String(i + 1).padStart(2, '0')}</span>
          <span className="row" style={{ gap: 8, width: 150, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em' }}>{r[0]}</span>
          <span className="mono tiny muted" style={{ flex: 1 }}>{r[1]}</span>
          {live && i === rows.length - 1 && <span className="badge b-teal">{t('lan.active')}</span>}
        </div>
      ))}
      <div style={{ marginTop: 4, padding: '10px 12px', border: '1px solid var(--tealLine, var(--line))', borderLeft: `3px solid var(--teal)`, borderRadius: 8, background: 'color-mix(in srgb, var(--teal) 8%, transparent)' }}>
        <b style={{ fontSize: 12.5 }}>{t('lan.routeEnRoute', { code: 'ENV-03', dept: t('dept.menv') })}</b>
        <div className="tiny muted" style={{ marginTop: 2 }}>{t('lan.routeDispatch', { detail: 'NET RECOVERY RIG · ROV CLAW', hours: 48 })}</div>
      </div>
    </div>
  );
}