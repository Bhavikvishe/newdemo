import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { PageHead, Card, CardHead, Button } from '../lib/ui';
import {
  IconGlobe,
  IconMoon,
  IconRefresh,
  IconSonar,
} from '../components/Icons';

export function SettingsPage() {
  const store = useStore();
  const { settings, theme } = store;
  const t = makeT(store.language);

  const savePreferences = () => {
    store.saveSettings();

    store.addToast({
      kind: 'success',
      title: t('common.saved'),
      text: t('set.savedNote'),
    });
  };

  const resetPreferences = () => {
    store.resetSettings();

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
            <Button
              variant="primary"
              onClick={savePreferences}
            >
              {t('set.saveChanges')}
            </Button>

            <Button
              variant="secondary"
              onClick={resetPreferences}
            >
              {t('set.resetDefaults')}
            </Button>
          </div>
        }
      />

      {/* Appearance */}
      <Card>
        <CardHead
          kt={t('set.appearanceKt')}
          title={t('set.theme')}
        />

        <div
          className="stack"
          style={{
            gap: 18,
            paddingBottom: 4,
          }}
        >
          <div>
            <div
              className="tiny upper muted"
              style={{ marginBottom: 8 }}
            >
              {t('set.theme')}
            </div>

            <div
              className="row wrap"
              style={{ gap: 8 }}
            >
              {(['dark', 'light'] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => store.setTheme(th)}
                  className={`setting-tile${
                    theme === th ? ' on' : ''
                  }`}
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

          <div className="tiny muted">
            {t('set.prefNote')}
          </div>
        </div>
      </Card>

      {/* Notifications + Application */}
      <div
        className="grid cols-12"
        style={{
          marginTop: 16,
          gap: 16,
        }}
      >
        {/* Notifications */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t('set.notificationsKt')}
              title={t('set.notifyPrefs')}
            />

            <div
              className="stack"
              style={{ gap: 8 }}
            >
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
                      settings.notificationPreferences[
                        key
                      ]
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

            <div
              className="stack"
              style={{ gap: 10 }}
            >
              {/* Replay Tour */}
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

              {/* Clear Data */}
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

              {/* Version / Dataset */}
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
              border:
                '1px solid var(--line-faint)',
              flexShrink: 0,
            }}
          >
            <IconSonar size={17} />
          </div>

          <div>
            <b
              style={{
                fontSize: 13,
                letterSpacing: '0.03em',
              }}
            >
              ANVESHA application preferences
            </b>

            <div
              className="tiny muted"
              style={{
                marginTop: 3,
                lineHeight: 1.5,
              }}
            >
              These settings control the ANVESHA
              interface, detection filtering and local
              notification preferences. Physical sonar
              hardware calibration is not configured from
              this application.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}