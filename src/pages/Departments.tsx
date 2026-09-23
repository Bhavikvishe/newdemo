import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { DEPARTMENTS, OPERATORS } from '../lib/mock';
import { PageHead, Card, CardHead } from '../lib/ui';
import { Link } from '../lib/router';
import { IconUser, IconClock } from '../components/Icons';
import type { DepartmentId } from '../types';

const ROLE_KEYS: Record<string, string> = {
  'marine-operations': 'dpt.role.marineOps',
  'marine-engineering': 'dpt.role.marineEng',
  'marine-environmental': 'dpt.role.marineEnv',
  'search-rescue': 'dpt.role.searchRescue',
  'ocean-survey': 'dpt.role.oceanSurvey',
  'recovery-response': 'dpt.role.recoveryResp',
  'system-admin': 'dpt.role.systemAdmin',
};

const STEPS = [
  'dpt.step.detect',
  'dpt.step.classify',
  'dpt.step.riskScore',
  'dpt.step.route',
  'dpt.step.assign',
  'dpt.step.respond',
  'dpt.step.verify',
];

export function DepartmentsPage() {
  const store = useStore();
  const { alerts, detections, language } = store;
  const t = makeT(language);

  const stats = useMemo(() => {
    const s = {} as Record<DepartmentId, { open: number; resolved: number; cases: number; crit: number }>;
    DEPARTMENTS.forEach((d) => { s[d.id] = { open: 0, resolved: 0, cases: 0, crit: 0 }; });
    alerts.forEach((a) => {
      const d = a.detection.department;
      if (!s[d]) return;
      s[d].cases++;
      if (a.status === 'resolved') s[d].resolved++;
      else s[d].open++;
      if (a.detection.riskLevel === 'critical') s[d].crit++;
    });
    return s;
  }, [alerts]);

  const detected = useMemo(() => {
    const m = {} as Record<DepartmentId, number>;
    detections.forEach((d) => {
      m[d.department] = (m[d.department] ?? 0) + 1;
    });
    return m;
  }, [detections]);

  const shareByDept = useMemo(() => {
    const total = Math.max(1, detections.length);
    return Object.fromEntries(DEPARTMENTS.map((d) => [d.id, Math.round(((detected[d.id] ?? 0) / total) * 100)])) as Record<DepartmentId, number>;
  }, [detected]);

  return (
    <div>
      <PageHead
        kicker={t('nav.departments')}
        title={t('dpt.title')}
        sub={t('dpt.sub')}
      />

      <Card style={{ marginBottom: 16 }}>
        <CardHead kt={t('dpt.ktCommand')} title={t('dpt.workflow')} />
        <div className="row wrap" style={{ gap: 8 }}>
          {STEPS.map((s, i) => (
            <div key={s} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="badge b-plain" style={{ padding: '7px 12px' }}>{t(s)}</span>
              {i < 6 && <span className="muted" style={{ fontSize: 12 }}>›</span>}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid cols-12" style={{ gap: 16 }}>
        {DEPARTMENTS.map((d) => {
          const st = stats[d.id];
          const teammates = OPERATORS[d.id] ?? [];
          return (
            <div className="span-4" key={d.id} style={{ display: 'flex' }}>
              <Card className="h-full" hover style={{ width: '100%' }}>
                <CardHead
                  kt={<span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: d.color }} /> {t(`dept.${d.status}`)}</span>}
                  title={
                    <div className="row" style={{ gap: 10 }}>
                      <span className="legend-dot" style={{ background: d.color }} />
                      <span>{d.shortName}</span>
                    </div>
                  }
                />
                <p className="tiny" style={{ color: 'var(--ink-3)', minHeight: 30, margin: '0 0 12px' }}>{t(ROLE_KEYS[d.id])}</p>
                <div className="stack" style={{ gap: 6, borderBottom: '1px dashed var(--line-faint)', paddingBottom: 12, marginBottom: 12 }}>
                  {[
                    [t('dpt.openAlerts'), String(st.open)],
                    [t('st.resolved'), String(st.resolved)],
                    [t('risk.critical'), String(st.crit)],
                    [t('dpt.detections'), `${detected[d.id] ?? 0} (${shareByDept[d.id] ?? 0}%)`],
                  ].map(([k, v]) => (
                    <div key={k} className="row-between" style={{ fontSize: 12.5 }}>
                      <span className="muted">{k}</span><b>{v}</b>
                    </div>
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
                  <span className="badge b-plain"><IconUser size={12} /> {t('dpt.operators', { n: teammates.length })}</span>
                  <span className="badge b-plain"><IconClock size={12} /> {t('dpt.inFlight', { n: alerts.filter((a) => a.detection.department === d.id && a.status === 'in_progress').length })}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Link to="department" className="btn btn-primary btn-sm" style={{ flex: 1 }}>{t('dpt.myDeptView')}</Link>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}