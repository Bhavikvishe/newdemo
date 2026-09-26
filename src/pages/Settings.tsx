import { useState } from 'react';
import { useStore } from '../lib/store';
import { makeT, LANGS } from '../lib/i18n';
import { CLASS_LIST } from '../lib/mock';
import { clsLabel } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Select } from '../lib/ui';
import { IconGlobe, IconMoon, IconRefresh, IconSonar } from '../components/Icons';
import type { Language } from '../types';

export function SettingsPage() {
  const store = useStore();
  const { settings, language, theme } = store;
  const t = makeT(language);

  const [lang, setLang] = useState<Language>(language);

  const savePreferences = () => {
    if (lang !== store.language) {
      store.setLanguage(lang);
    }

    store.saveSettings();

    store.addToast({
      kind: 'success',
      title: t('common.saved'),
      text: t('set.savedNote'),
    });
  };

  const resetPreferences = () => {
    store.resetSettings();
    setLang(store.language);

    store.addToast({
      kind: 'success',
      title: t('set.resetTitle'),
      text: t('set.resetNote'),
    });
  };

  const toggleNotification = (
    key:
      | 'criticalOnly'
      | 'departmentAlerts'
      | 'systemAlerts'
      | 'sound',
  ) => {
    store.updateSettings({
      notificationPreferences: {
        ...settings.notificationPreferences,
        [key]: !settings.notificationPreferences[key],
      },
    });
  };

  return (
    <div>
      <PageHead
        kicker={t('set.theme')}
        title={t('nav.settings')}
        sub={t('set.headSub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="primary" onClick={savePreferences}>
              {t('set.saveChanges')}
            </Button>

            <Button variant="secondary" onClick={resetPreferences}>
              {t('set.resetDefaults')}
            </Button>
          </div>
        }
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        {/* Appearance */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t('set.appearanceKt')}
              title={t('set.themeLang')}
            />

            <div className="stack" style={{ gap: 18 }}>
              <div>
                <div
                  className="tiny upper muted"
                  style={{ marginBottom: 8 }}
                >
                  {t('set.theme')}
                </div>

                <div className="row wrap" style={{ gap: 8 }}>
                  {(['dark', 'light'] as const).map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => store.setTheme(th)}
                      className={`setting-tile${theme === th ? ' on' : ''}`}
                      style={{ minWidth: 145 }}
                    >
                      {th === 'dark' ? (
                        <IconMoon size={18} />
                      ) : (
                        <IconGlobe size={18} />
                      )}

                      <span>
                        {th === 'dark'
                          ? t('set.dark')
                          : t('set.light')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div
                  className="tiny upper muted"
                  style={{ marginBottom: 8 }}
                >
                  {t('common.language')}
                </div>

                <Select
                  value={lang}
                  onChange={(value) => setLang(value as Language)}
                  options={LANGS.map((item) => ({
                    value: item.code,
                    label: item.native,
                  }))}
                />
              </div>

              <div className="tiny muted">
                {t('set.prefNote')}
              </div>
            </div>
          </Card>
        </div>

        {/* Detection */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t('set.detectionKt')}
              title={t('set.classAlerts')}
            />

            <div className="stack" style={{ gap: 18 }}>
              <div>
                <div
                  className="row-between"
                  style={{ marginBottom: 7 }}
                >
                  <span className="tiny upper muted">
                    {t('set.confThreshold')}
                  </span>

                  <b className="mono tiny">
                    {Math.round(
                      settings.detectionConfidenceThreshold * 100,
                    )}
                    %
                  </b>
                </div>

                <input
                  type="range"
                  min={20}
                  max={95}
                  step={1}
                  value={Math.round(
                    settings.detectionConfidenceThreshold * 100,
                  )}
                  onChange={(event) =>
                    store.updateSettings({
                      detectionConfidenceThreshold:
                        Number(event.target.value) / 100,
                    })
                  }
                />

                <div
                  className="row-between tiny muted"
                  style={{ marginTop: 5 }}
                >
                  <span>20%</span>
                  <span>95%</span>
                </div>
              </div>

              <div>
                <div
                  className="tiny upper muted"
                  style={{ marginBottom: 8 }}
                >
                  {t('set.alertClasses')}
                </div>

                <div
                  className="row wrap"
                  style={{ gap: 6 }}
                >
                  {CLASS_LIST.map((cls) => {
                    const enabled =
                      settings.debrisClasses.includes(cls);

                    return (
                      <button
                        key={cls}
                        type="button"
                        className={`chip${enabled ? ' on' : ''}`}
                        onClick={() =>
                          store.updateSettings({
                            debrisClasses: enabled
                              ? settings.debrisClasses.filter(
                                  (item) => item !== cls,
                                )
                              : [
                                  ...settings.debrisClasses,
                                  cls,
                                ],
                          })
                        }
                      >
                        {clsLabel(cls, language)}
                      </button>
                    );
                  })}
                </div>

                <div
                  className="tiny muted"
                  style={{ marginTop: 7 }}
                >
                  {t('set.classesHint')}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div
        className="grid cols-12"
        style={{ marginTop: 16, gap: 16 }}
      >
        {/* Notifications */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t('set.notificationsKt')}
              title={t('set.notifyPrefs')}
            />

            <div className="stack" style={{ gap: 8 }}>
              {(
                [
                  ['criticalOnly', 'set.critOnly'],
                  ['departmentAlerts', 'set.deptalerts'],
                  ['systemAlerts', 'set.sysStatus'],
                  ['sound', 'set.audioAlert'],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="row-between"
                  style={{
                    padding: '10px 12px',
                    border:
                      '1px solid var(--line-faint)',
                    borderRadius: 10,
                  }}
                >
                  <div>
                    <div
                      className="tiny"
                      style={{
                        color: 'var(--ink-2)',
                      }}
                    >
                      {t(label)}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={t(label)}
                    className={`toggle${
                      settings.notificationPreferences[key]
                        ? ' on'
                        : ''
                    }`}
                    onClick={() =>
                      toggleNotification(key)
                    }
                  >
                    <span />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Application */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t('set.accountKt')}
              title={t('set.demoUtility')}
            />

            <div className="stack" style={{ gap: 10 }}>
              <div
                style={{
                  padding: 12,
                  border:
                    '1px solid var(--line-faint)',
                  borderRadius: 10,
                }}
              >
                <b style={{ fontSize: 13 }}>
                  {t('set.replayTour')}
                </b>

                <p
                  className="tiny muted"
                  style={{
                    margin: '5px 0 9px',
                    lineHeight: 1.5,
                  }}
                >
                  {t('set.tourDesc')}
                </p>

                <Button
                  variant="secondary"
                  onClick={() => store.openTour()}
                >
                  <IconSonar size={15} />
                  {t('set.tourbtn')}
                </Button>
              </div>

              <div
                style={{
                  padding: 12,
                  border:
                    '1px solid var(--line-faint)',
                  borderRadius: 10,
                }}
              >
                <b style={{ fontSize: 13 }}>
                  {t('set.clearData')}
                </b>

                <p
                  className="tiny muted"
                  style={{
                    margin: '5px 0 9px',
                    lineHeight: 1.5,
                  }}
                >
                  {t('set.clearDesc')}
                </p>

                <Button
                  variant="danger"
                  onClick={() => {
                    store.clearAll();

                    store.addToast({
                      kind: 'success',
                      title: t('set.dataCleared'),
                      text: t('set.ledgerEmptied'),
                    });
                  }}
                >
                  <IconRefresh size={15} />
                  {t('set.clearBtn')}
                </Button>
              </div>

              <div
                className="row-between"
                style={{ paddingTop: 5 }}
              >
                <span className="tiny muted">
                  {t('set.datasetNote')}
                </span>

                <span className="badge b-teal">
                  <IconSonar size={12} />
                  {t('set.versionBadge')}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* What this application actually controls */}
      <Card style={{ marginTop: 16 }}>
        <div
          style={{
            padding: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--surface-2)',
              border: '1px solid var(--line-faint)',
              flexShrink: 0,
            }}
          >
            <IconSonar size={17} />
          </div>

          <div>
            <b style={{ fontSize: 13 }}>
              OCEONIX application preferences
            </b>

            <div
              className="tiny muted"
              style={{
                marginTop: 3,
                lineHeight: 1.5,
              }}
            >
              These settings control the OCEONIX interface,
              detection filtering and local notification
              preferences. Physical sonar hardware calibration
              is not configured from this application.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}