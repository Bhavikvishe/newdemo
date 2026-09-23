import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DepartmentId } from '../types';
import { useStore, deptTone } from '../lib/store';
import { buildNav } from './NavData';
import type { NavSection } from './NavData';
import { Link, navigate } from '../lib/router';
import { makeT, LANGS } from '../lib/i18n';
import {
  IconBell,
  IconChevDown,
  IconGlobe,
  IconLogout,
  IconMenu,
  IconMoon,
  IconQr,
  IconSun,
  IconX,
} from './Icons';
import { ToastStack } from '../lib/ui';
import { Onboarding } from './Onboarding';

function OutsideCloser({ onClose }: { onClose: () => void }) {
  return <div style={{ position: 'fixed', inset: 0, zIndex: 84 }} onClick={onClose} aria-hidden="true" />;
}

function tAgo(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('shl.time.justNow');
  if (m < 60) return t('shl.time.m', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('shl.time.h', { h });
  const d = Math.floor(h / 24);
  if (d < 30) return t('shl.time.d', { d });
  const dt = new Date(iso);
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function DeptChip({ name, id, tone, t }: { name: string; id: string; tone: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <div className="dept-chip" title={`${name} · ${id}`}>
      <span className="dc-dot" style={{ background: tone, boxShadow: `0 0 8px 1px ${tone}` }} />
      <div>
        <b>{name.toUpperCase()}</b>
        <span>{t('shl.deptChipId', { id })}</span>
      </div>
      <IconChevDown size={12} style={{ color: 'var(--ink-3)' }} />
    </div>
  );
}

export function OceMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="var(--accent)" strokeOpacity="0.35" strokeWidth="1.4" strokeDasharray="3 5" />
      <circle cx="24" cy="24" r="13.5" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.1" strokeDasharray="2 3.4" />
      <circle cx="24" cy="24" r="7" stroke="var(--accent-line)" strokeWidth="1.2" />
      <path d="M24 24 30 18" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="30" cy="18" r="2.4" fill="var(--accent)" />
      <path d="M13 34 q4 2.6 7.5 0 t7 0" stroke="var(--teal)" strokeOpacity="0.7" strokeWidth="1.2" />
      <path d="M24 9v3.4M24 35.6V39M9 24h3.4M35.6 24H39" stroke="var(--accent-2)" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}

function pageLabelKey(page: string): string {
  switch (page) {
    case 'overview': return 'nav.overview';
    case 'detection': return 'nav.detection';
    case 'batch': return 'nav.batch';
    case 'live': return 'nav.live';
    case 'map': return 'nav.map';
    case 'navigate': return 'nav.navigate';
    case 'alerts': return 'nav.alerts';
    case 'history': return 'nav.history';
    case 'analytics': return 'nav.analytics';
    case 'reports': return 'nav.reports';
    case 'settings': return 'nav.settings';
    case 'department': return 'nav.mydept';
    case 'departments': return 'nav.departments';
    case 'admin': return 'nav.admin';
    case 'detail': return 'nav.history';
    default: return '';
  }
}

const DOM_DEPT_NAMES: Record<DepartmentId, string> = {
  'marine-operations': 'dept.mop',
  'marine-engineering': 'dept.meng',
  'marine-environmental': 'shl.deptEnv',
  'search-rescue': 'dept.sar',
  'ocean-survey': 'dept.survey',
  'recovery-response': 'shl.deptRec',
  'system-admin': 'dept.admin',
};

export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const store = useStore();
  const { setTheme, setLanguage, markNotificationsRead, logout } = store;
  const user = store.user!;
  const language = store.language;
  const theme = store.theme;
  const notifications = store.notifications;
  const alerts = store.alerts;
  const onboardingSeen = store.onboardingSeen;
  const tourOpen = store.tourOpen;
  const t = makeT(language);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const page = route.split('/').filter(Boolean)[0] ?? '';

  const nav = useMemo(() => buildNav(user), [user]);
  const sections = useMemo(() => {
    const first: NavSection[] = [];
    const out: NavSection[] = [];
    nav.forEach((s) => (s.id === 'intel' ? first.push(s) : out.push(s)));
    return { first, rest: out };
  }, [nav]);

  const unread = useMemo(
    () =>
      notifications.filter((n) => n.unread && (user.department === 'system-admin' || !n.dept || n.dept === user.department)).length,
    [notifications, user],
  );

  const deptAlerts = useMemo(() => {
    const mine = alerts.filter((a) => a.detection.department === user.department);
    return {
      open: mine.filter((a) => ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'overdue', 'escalated'].includes(a.status)).length,
      critical: mine.filter((a) => a.detection.riskLevel === 'critical' && ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'overdue', 'escalated'].includes(a.status)).length,
    };
  }, [alerts, user.department]);

  const myNotifs = useMemo(() => {
    return notifications.filter((n) => (user.department === 'system-admin' ? true : !n.dept || n.dept === user.department));
  }, [notifications, user.department]);

  const tone = deptTone(user.department);

  return (
    <div className="app-shell">
      {mobileOpen && <div className="sb-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${mobileOpen ? ' open' : ''}`} aria-label={t('shl.navAria')}>
        <div className="sb-head">
          <Link to="overview" className="sb-logo" onNavigate={() => setMobileOpen(false)}>
            <span className="lg">
              <OceMark size={34} />
            </span>
            <span>
              <b>OCEONIX</b>
              <span className="sub">{t('app.tagline')}</span>
            </span>
          </Link>
        </div>

        <nav className="sb-nav">
          {sections.first.map((sec) => renderSection(sec, page, t, () => setMobileOpen(false), deptAlerts))}
          {sections.rest.map((sec) => renderSection(sec, page, t, () => setMobileOpen(false), deptAlerts))}
        </nav>

        <div className="sb-foot">
          <div className="sys-row" style={{ marginBottom: 8 }}>
            <span className="legend-dot" style={{ background: 'var(--low)' }} />
            <span>{t('shl.system')}</span>
            <span style={{ opacity: 0.6 }}>{t('sys.version')}</span>
          </div>
          <div className="sys-row" style={{ opacity: 0.75 }}>
            <IconQr size={12} />
            <span>{t('shl.sonarLink')}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMobileOpen(true)} aria-label={t('shl.menuAria')}>
            <IconMenu />
          </button>

          <div className="row grow" style={{ gap: 14, minWidth: 0 }}>
            <DeptChip name={t(DOM_DEPT_NAMES[user.department])} id={user.departmentIdLabel} tone={tone} t={t} />
            <div className="tb-bread" style={{ overflow: 'hidden' }}>
              <span>{t('shl.breadOps')}</span>
              <span className="sep">▸</span>
              <span className="here">{t(pageLabelKey(page)) || page.toUpperCase()}</span>
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-icon" title={t('set.theme')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost btn-icon" onClick={() => { setLangOpen(!langOpen); setBellOpen(false); }} aria-label={t('common.language')}>
                <IconGlobe size={17} />
              </button>
              {langOpen && (
                <>
                  <OutsideCloser onClose={() => setLangOpen(false)} />
                  <div className="pop lang-pop" role="menu">
                    <div className="pop-head"><b style={{ fontSize: 12.5 }}>{t('common.language')}</b></div>
                    {LANGS.map((l) => (
                      <div key={l.code} className={`lang-item${language === l.code ? ' on' : ''}`} role="menuitem" onClick={() => { setLanguage(l.code); setLangOpen(false); }}>
                        <span className="mono" style={{ width: 26, fontSize: 11, color: 'var(--ink-3)' }}>{l.code.toUpperCase()}</span>
                        <span>{l.native}</span>
                        {language === l.code && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>●</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost btn-icon" onClick={() => { setBellOpen(!bellOpen); setLangOpen(false); }} aria-label={t('common.notifications')} style={unread ? { color: 'var(--accent)' } : undefined}>
                <IconBell size={17} />
                {unread > 0 && (
                  <span style={{ position: 'absolute', top: 0, right: 0, minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999, background: 'var(--critical)', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }}>
                    {unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <OutsideCloser onClose={() => setBellOpen(false)} />
                  <div className="pop">
                    <div className="pop-head">
                      <b style={{ fontSize: 13 }}>{t('common.notifications')}</b>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={markNotificationsRead}>{t('shl.purge')}</button>
                        <button className="m-close" onClick={() => setBellOpen(false)} aria-label={t('common.close')}><IconX size={14} /></button>
                      </div>
                    </div>
                    <div className="pop-list">
                      {myNotifs.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{t('shl.notif0')}</div>}
                      {myNotifs.map((n) => (
                        <div
                          key={n.id}
                          className={`pop-item${n.unread ? ' unread' : ''}`}
                          onClick={() => {
                            store.dismissNotification(n.id);
                            setBellOpen(false);
                            navigate(n.detectionId ? `detail/${n.detectionId}` : 'alerts');
                          }}
                        >
                          <span
                            className="pi-ic"
                            style={
                              n.kind === 'alert'
                                ? { background: 'var(--critical-dim)', color: 'var(--critical)' }
                                : n.kind === 'notice'
                                  ? { background: 'var(--marine-dim)', color: 'var(--marine)' }
                                  : { background: 'var(--accent-dim)', color: 'var(--accent)' }
                            }
                          >
                            <IconBell size={14} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <b>{n.title}</b>
                            <p>{n.body}</p>
                            <span className="tm">{tAgo(n.ts, t)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="tip-wrap">
              <button className="btn btn-ghost btn-sm row" style={{ gap: 8 }} onClick={logout} title={t('common.logout')}>
                <span className="legend-dot" style={{ background: tone }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{user.username}</span>
                <IconLogout size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="page" id="main-content">
          {children}
        </main>

        <footer style={{ padding: '14px 22px', borderTop: '1px solid var(--line-faint)', color: 'var(--ink-3)', fontSize: 11, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>{t('shl.footBrand')}</span>
          <span style={{ marginLeft: 'auto' }}>{t('shl.footLocal')}</span>
        </footer>
      </div>

      {!onboardingSeen && <Onboarding welcome key="welcome" />}
      {onboardingSeen && tourOpen && <Onboarding key="tour" />}

      <ToastStack />
    </div>
  );
}

function renderSection(
  sec: NavSection,
  page: string,
  t: (k: string) => string,
  closeMobile: () => void,
  deptAlerts: { open: number; critical: number },
) {
  return (
    <div key={sec.id}>
      <div className="nav-sec">{t(sec.labelKey)}</div>
      {sec.items.map((it) => {
        const active = page === it.href;
        const badge = it.badge?.n === 'alerts' ? deptAlerts.open : undefined;
        const Icon = it.icon;
        return (
          <Link key={it.id} to={it.href} className={`nav-item${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined} onNavigate={closeMobile}>
            <Icon size={16} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(it.labelKey)}</span>
            {badge !== undefined && badge > 0 && <span className="nav-badge">{badge}</span>}
          </Link>
        );
      })}
    </div>
  );
}