import { useState } from 'react';
import { useStore } from '../lib/store';
import { makeT, LANGS } from '../lib/i18n';
import { CLASS_LIST, RISK_ORDER } from '../lib/mock';
import { clsLabel } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Select } from '../lib/ui';
import { IconGlobe, IconMoon, IconRefresh, IconSonar } from '../components/Icons';
import type { Language } from '../types';

const SONAR_FIELDS: { key: 'gain' | 'range' | 'frequency' | 'tvg' | 'beamWidth'; labelKey: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'gain', labelKey: 'set.gain', min: 20, max: 100, step: 1, unit: 'dB' },
  { key: 'range', labelKey: 'set.range', min: 30, max: 300, step: 5, unit: 'm' },
  { key: 'frequency', labelKey: 'set.freq', min: 300, max: 1200, step: 10, unit: 'kHz' },
  { key: 'tvg', labelKey: 'set.tvg', min: 0, max: 60, step: 1, unit: 'dB' },
  { key: 'beamWidth', labelKey: 'set.beamWidth', min: 0.3, max: 1.2, step: 0.1, unit: '°' },
];

export function SettingsPage() {
  const store = useStore();
  const { settings, language, theme } = store;
  const t = makeT(language);
  const [lang, setLang] = useState<Language>(language);
  const [inited, setInited] = useState(false);

  const apply = () => {
    if (!inited) { setInited(true); return; }
    if (lang !== store.language) store.setLanguage(lang);
  };

  return (
    <div>
      <PageHead
        kicker={t('set.theme')}
        title={t('nav.settings')}
        sub={t('set.headSub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="primary" onClick={() => { apply(); if (inited) store.saveSettings(); store.addToast({ kind: 'success', title: t('common.saved'), text: t('set.savedNote') }); }}>{t('set.saveChanges')}</Button>
            <Button variant="secondary" onClick={() => { store.resetSettings(); setLang(store.language); store.addToast({ kind: 'success', title: t('set.resetTitle'), text: t('set.resetNote') }); }}>{t('set.resetDefaults')}</Button>
            <Button variant="outline" onClick={() => store.openTour()}><IconSonar size={15} /> {t('set.tourbtn')}</Button>
          </div>
        }
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('set.appearanceKt')} title={t('set.themeLang')} />
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <div className="tiny upper muted" style={{ marginBottom: 8 }}>{t('set.theme')}</div>
                <div className="row wrap" style={{ gap: 8 }}>
                  {(['dark', 'light'] as const).map((th) => (
                    <button key={th} onClick={() => store.setTheme(th)} className={`setting-tile${theme === th ? ' on' : ''}`} style={{ minWidth: 140 }}>
                      {th === 'dark' ? <IconMoon size={18} /> : <IconGlobe size={18} />}
                      <span style={{ textTransform: 'capitalize' }}>{th === 'dark' ? t('set.dark') : t('set.light')}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="tiny upper muted" style={{ marginBottom: 8 }}>{t('common.language')}</div>
                <Select value={lang} onChange={(v) => { setLang(v as Language); apply(); }} options={LANGS.map((l) => ({ value: l.code, label: l.native }))} />
              </div>
              <div className="tiny muted">{t('set.prefNote')}</div>
            </div>
          </Card>
        </div>

        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('set.detectionKt')} title={t('set.classAlerts')} />
            <div className="stack" style={{ gap: 14 }}>
              <div>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <span className="tiny upper muted">{t('set.confThreshold')}</span>
                  <b className="mono tiny">{Math.round(settings.detectionConfidenceThreshold * 100)}%</b>
                </div>
                <input type="range" min={50} max={99} value={Math.round(settings.detectionConfidenceThreshold * 100)} onChange={(e) => store.updateSettings({ detectionConfidenceThreshold: +e.target.value / 100 })} />
              </div>
              <div>
                <div className="tiny upper muted" style={{ marginBottom: 8 }}>{t('set.alertClasses')}</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {CLASS_LIST.map((c) => {
                    const on = settings.debrisClasses.includes(c);
                    return (
                      <button key={c} className={`chip${on ? ' on' : ''}`} onClick={() => store.updateSettings({ debrisClasses: on ? settings.debrisClasses.filter((x) => x !== c) : [...settings.debrisClasses, c] })}>
                        {clsLabel(c, language).split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>{t('set.classesHint')}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('set.sensorKt')} title={t('set.sonarCal')} />
            <div className="stack" style={{ gap: 12 }}>
              {SONAR_FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <span className="tiny upper muted">{t(f.labelKey)}</span>
                    <b className="mono tiny">{settings.sonarCalibration[f.key]}{f.unit}</b>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={settings.sonarCalibration[f.key]} onChange={(e) => store.updateSettings({ sonarCalibration: { ...settings.sonarCalibration, [f.key]: +e.target.value } })} />
                </div>
              ))}
              <div className="tiny muted">{t('set.sonarHint')}</div>
            </div>
          </Card>
        </div>

        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('set.routingKt')} title={t('set.riskWindows')} />
            <div className="stack" style={{ gap: 12 }}>
              {RISK_ORDER.map((r) => (
                <div key={r}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <span className="tiny upper muted" style={{ textTransform: 'capitalize' }}>{t('set.riskRow', { risk: t(`risk.${r}`), score: settings.riskThresholds[r] })}</span>
                    <b className="mono tiny">{t('set.responseWindow', { hours: settings.alertResponseTimes[r] })}</b>
                  </div>
                  <div className="row" style={{ gap: 10 }}>
                    <input type="range" min={10} max={95} value={settings.riskThresholds[r]} onChange={(e) => store.updateSettings({ riskThresholds: { ...settings.riskThresholds, [r]: +e.target.value } })} style={{ flex: 1 }} />
                    <input type="number" className="input" style={{ width: 66 }} min={1} max={720} value={settings.alertResponseTimes[r]} onChange={(e) => store.updateSettings({ alertResponseTimes: { ...settings.alertResponseTimes, [r]: +e.target.value } })} />
                  </div>
                </div>
              ))}
              <div className="tiny muted">{t('set.riskHint')}</div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('set.notificationsKt')} title={t('set.notifyPrefs')} />
            <div className="stack" style={{ gap: 8 }}>
              {([
                ['criticalOnly', 'set.critOnly'],
                ['departmentAlerts', 'set.deptalerts'],
                ['systemAlerts', 'set.sysStatus'],
                ['email', 'set.emailDigest'],
                ['push', 'set.browserPush'],
                ['sound', 'set.audioAlert'],
                ['dailyDigest', 'set.dailySummary'],
              ] as const).map(([k, label]) => (
                <div key={k} className="row-between" style={{ padding: '8px 10px', border: '1px solid var(--line-faint)', borderRadius: 10 }}>
                  <span className="tiny" style={{ color: 'var(--ink-2)' }}>{t(label)}</span>
                  <button className={`toggle${settings.notificationPreferences[k] ? ' on' : ''}`} onClick={() => store.updateSettings({ notificationPreferences: { ...settings.notificationPreferences, [k]: !settings.notificationPreferences[k] } })}>
                    <span />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('set.accountKt')} title={t('set.demoUtility')} />
            <div className="stack" style={{ gap: 10 }}>
              <div style={{ padding: 10, border: '1px solid var(--line-faint)', borderRadius: 10 }}>
                <b style={{ fontSize: 13 }}>{t('set.replayTour')}</b>
                <p className="tiny muted" style={{ margin: '4px 0 8px' }}>{t('set.tourDesc')}</p>
                <Button variant="primary" onClick={() => store.openTour()}><IconSonar size={15} /> {t('set.tourbtn')}</Button>
              </div>
              <div style={{ padding: 10, border: '1px solid var(--line-faint)', borderRadius: 10 }}>
                <b style={{ fontSize: 13 }}>{t('set.clearData')}</b>
                <p className="tiny muted" style={{ margin: '4px 0 8px' }}>{t('set.clearDesc')}</p>
                <Button variant="danger" onClick={() => { store.clearAll(); store.addToast({ kind: 'success', title: t('set.dataCleared'), text: t('set.ledgerEmptied') }); }}><IconRefresh size={15} /> {t('set.clearBtn')}</Button>
              </div>
              <div className="row-between" style={{ paddingTop: 6 }}>
                <span className="tiny muted">{t('set.datasetNote')}</span>
                <span className="badge b-teal"><IconSonar size={12} /> {t('set.versionBadge')}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}