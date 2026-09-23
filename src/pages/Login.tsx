import { useState } from 'react';
import type { DepartmentId } from '../types';
import { useStore } from '../lib/store';
import { OceMark } from '../components/Shell';
import { makeT } from '../lib/i18n';
import { DEPARTMENTS } from '../lib/mock';
import { Button } from '../lib/ui';
import { IconLock, IconMoon, IconSun, IconGlobe, IconUser } from '../components/Icons';
import { Link } from '../lib/router';

type Mode = 'signin' | 'register';

const DEPT_KEY: Record<DepartmentId, string> = {
  'marine-operations': 'dept.mop',
  'marine-engineering': 'dept.meng',
  'marine-environmental': 'dept.menv',
  'search-rescue': 'dept.sar',
  'ocean-survey': 'dept.survey',
  'recovery-response': 'dept.rec',
  'system-admin': 'dept.admin',
};

export function LoginPage() {
  const store = useStore();
  const { login, register, theme, setTheme, language, setLanguage } = store;
  const t = makeT(language);

  const [mode, setMode] = useState<Mode>('signin');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [dept, setDept] = useState<DepartmentId>('marine-operations');
  const [remember, setRemember] = useState(true);

  const [rName, setRName] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rUsername, setRUsername] = useState('');
  const [rPassword, setRPassword] = useState('');
  const [rDept, setRDept] = useState<DepartmentId>('marine-operations');

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [regError, setRegError] = useState('');

  const doLogin = () => {
    setBusy(true);
    setFailed(false);
    window.setTimeout(() => {
      setBusy(false);
      if (!username.trim()) {
        setFailed(true);
        return;
      }
      const ok = login(username, dept, password);
      if (!ok) setFailed(true);
    }, 700);
  };

  const doRegister = () => {
    setBusy(true);
    setFailed(false);
    setRegError('');
    const res = register({ name: rName, email: rEmail, username: rUsername, password: rPassword, department: rDept });
    if (!res.ok) {
      setRegError(res.error ?? t('lgn.regFailed'));
      setBusy(false);
      return;
    }
    window.setTimeout(() => {
      setBusy(false);
      login(rUsername, rDept, rPassword);
    }, 500);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setFailed(false);
    setRegError('');
  };

  return (
    <div className="landing" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="ln-nav" style={{ position: 'relative' }}>
        <div className="row" style={{ gap: 10 }}>
          <OceMark size={40} />
          <div>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.12em', background: 'linear-gradient(90deg, var(--accent-2), var(--neon))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px color-mix(in srgb, var(--accent) 45%, transparent))' }}>OCEONIX</b>
            <div className="tiny upper muted">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="ln-links" style={{ marginLeft: 'auto' }}>
          <Link to="landing" className="nav-item" style={{ width: 'auto' }}>{t('lgn.platform')}</Link>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setLanguage(language === 'en' ? 'hi' : language === 'hi' ? 'mr' : 'en')} aria-label={t('common.language')}>
            <IconGlobe size={17} />
            <span className="mono small">{language.toUpperCase()}</span>
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('set.theme')}>
            {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
          </button>
        </div>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 0, flex: 1, minHeight: 'calc(100vh - 76px)' }} className="login-grid">
        <div className="ln-hero-visual" style={{ minHeight: 'inherit', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 48px', position: 'relative', borderRight: '1px solid var(--line-soft)' }}>
          <div className="hero-sonar" style={{ width: 'min(420px, 90%)' }}>
            <div className="sonar-shell" style={{ width: '100%', aspectRatio: '1', borderRadius: 24 }}>
              <div className="ring" style={{ width: '86%', aspectRatio: '1' }} />
              <div className="ring" style={{ width: '62%', aspectRatio: '1', borderStyle: 'dashed' }} />
              <div className="ring" style={{ width: '38%', aspectRatio: '1' }} />
              <div className="sweep" />
              <div className="blip" style={{ left: '68%', top: '30%' }} />
              <div className="blip risk-high" style={{ left: '42%', top: '64%' }} />
              <div className="blip risk-marine" style={{ left: '24%', top: '38%', width: 5, height: 5 }} />
            </div>
            <div className="ext" style={{ position: 'absolute', left: 0, top: '51%' }}><span className="hd">15.5kHz ▸</span> SWEEP 03</div>
            <div className="ext" style={{ position: 'absolute', right: 0, top: '18%' }}>38m</div>
            <div className="ext" style={{ position: 'absolute', left: '50%', bottom: '6%', transform: 'translateX(-50%)' }}>ARABIAN SEA · MON-04</div>
          </div>
          <div style={{ position: 'absolute', bottom: 30, left: 48, right: 48 }}>
            <div className="tiny upper acc" style={{ marginBottom: 8 }}>{t('lgn.heroTag')}</div>
            <h1 style={{ fontSize: 34, margin: 0 }}>{t('lgn.heroTitle')}</h1>
            <p className="muted" style={{ fontSize: 14, maxWidth: 460 }}>{t('lgn.heroDesc')}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
          <div className="card solid" style={{ width: 'min(460px, 100%)', padding: 28 }}>
            <div className="row-between" style={{ marginBottom: 18 }}>
              <div>
                <div className="tiny upper acc" style={{ marginBottom: 4 }}>{t('login.title')}</div>
                <h2 style={{ fontSize: 22, margin: 0 }}>{mode === 'signin' ? t('login.sub') : t('login.signupSub')}</h2>
              </div>
            </div>

            <div className="row" style={{ gap: 6, marginBottom: 20, background: 'var(--line-faint)', borderRadius: 12, padding: 4 }}>
              <button
                type="button"
                className={mode === 'signin' ? 'chip on' : 'chip'}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => switchMode('signin')}
              >
                <IconLock size={13} /> {t('login.signin')}
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'chip on' : 'chip'}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => switchMode('register')}
              >
                <IconUser size={13} /> {t('login.create')}
              </button>
            </div>

            {mode === 'signin' ? (
              <>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.dep')}</label>
                  <select className="select" value={dept} onChange={(e) => setDept(e.target.value as DepartmentId)}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>{t(DEPT_KEY[d.id])}</option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.username')}</label>
                  <input className="input" value={username} onChange={(e) => { setUsername(e.target.value); setFailed(false); }} placeholder="operator@oceonix.ai" autoComplete="username" />
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.password')}</label>
                  <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>

                <div className="row-between" style={{ marginBottom: 18 }}>
                  <label className="row" style={{ gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <span className="switch" style={{ width: 32, height: 18 }}>
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                      <span className="tk" />
                    </span>
                    {t('login.remember')}
                  </label>
                  <span className="tiny muted">AES-256 · TLS 1.3</span>
                </div>

                {failed && <div className="card" style={{ marginBottom: 14, padding: 10, borderColor: 'var(--critical)', background: 'var(--critical-dim)', color: 'var(--critical)', fontSize: 13 }}>{t('login.failed')}</div>}

                <Button variant="primary" block size="lg" disabled={busy} onClick={doLogin}>
                  {busy ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {t('lgn.authenticating')}</> : <><IconLock size={16} /> {t('common.login')}</>}
                </Button>
              </>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.name')}</label>
                  <input className="input" value={rName} onChange={(e) => { setRName(e.target.value); setRegError(''); }} placeholder="Anita Deshpande" autoComplete="name" />
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.email')}</label>
                  <input className="input" value={rEmail} onChange={(e) => { setREmail(e.target.value); setRegError(''); }} placeholder="anita@oceonix.ai" autoComplete="email" />
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.username')}</label>
                  <input className="input" value={rUsername} onChange={(e) => { setRUsername(e.target.value); setRegError(''); }} placeholder="anita.deshpande" autoComplete="username" />
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label>{t('login.password')}</label>
                  <input className="input" type="password" value={rPassword} onChange={(e) => { setRPassword(e.target.value); setRegError(''); }} placeholder={t('lgn.minPass')} autoComplete="new-password" />
                </div>

                <div className="field" style={{ marginBottom: 18 }}>
                  <label>{t('login.dep')}</label>
                  <select className="select" value={rDept} onChange={(e) => setRDept(e.target.value as DepartmentId)}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>{t(DEPT_KEY[d.id])}</option>
                    ))}
                  </select>
                </div>

                {regError && <div className="card" style={{ marginBottom: 14, padding: 10, borderColor: 'var(--critical)', background: 'var(--critical-dim)', color: 'var(--critical)', fontSize: 13 }}>{regError}</div>}

                <Button variant="primary" block size="lg" disabled={busy} onClick={doRegister}>
                  {busy ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {t('lgn.creating')}</> : <><IconUser size={16} /> {t('login.create')}</>}
                </Button>
                <p className="tiny muted" style={{ marginTop: 12, textAlign: 'center' }}>{t('login.registerHint')}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <footer style={{ padding: '18px 34px', borderTop: '1px solid var(--line-faint)', color: 'var(--ink-3)', fontSize: 11.5, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>OCEONIX v2.4.1</span>
        <span style={{ marginLeft: 'auto' }}>{t('lgn.unauthorized')}</span>
      </footer>
    </div>
  );
}