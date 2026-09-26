import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { DEPARTMENTS, OPERATORS, canonicalDepartmentId } from '../lib/mock';
import { PageHead, Card, CardHead } from '../lib/ui';
import { Link } from '../lib/router';
import { IconUser, IconClock, IconScale } from '../components/Icons';
import type { DepartmentId } from '../types';

const ROLE_KEYS: Record<string, string> = {
  'marine-operations': 'dpt.role.marineOps',
  'marine-environmental': 'dpt.role.marineEnv',
  'ocean-survey': 'dpt.role.oceanSurvey',
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
  const { alerts, detections, language, user, registeredUsers } = store;
  const t = makeT(language);
  const isAdmin = user?.department === 'system-admin';

  const stats = useMemo(() => {
    const s = {} as Record<DepartmentId, { open: number; resolved: number; cases: number; crit: number }>;
    DEPARTMENTS.forEach((d) => { s[d.id] = { open: 0, resolved: 0, cases: 0, crit: 0 }; });
    alerts.forEach((a) => {
      const d = canonicalDepartmentId(a.detection.department);
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
      const dept = canonicalDepartmentId(d.department);
      m[dept] = (m[dept] ?? 0) + 1;
    });
    return m;
  }, [detections]);

  const shareByDept = useMemo(() => {
    const total = Math.max(1, detections.length);
    return Object.fromEntries(DEPARTMENTS.map((d) => [d.id, Math.round(((detected[d.id] ?? 0) / total) * 100)])) as Record<DepartmentId, number>;
  }, [detected, detections.length]);

  return (
    <div>
      <PageHead
        kicker={t('nav.departments')}
        title={t('dpt.title')}
        sub={t('dpt.sub')}
        right={
          isAdmin && (
            <div className="row wrap" style={{ gap: 8 }}>
              <Link to="admin" className="btn btn-primary">
                <IconScale size={15} /> Adjust Workload
              </Link>
            </div>
          )
        }
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
          const teammates = [...(OPERATORS[d.id] ?? []), ...registeredUsers.filter((r) => r.department === d.id).map((r) => r.name)];
          const capacity = Math.max(3, Math.min(6, teammates.length * 2 || 3));
          const loadPct = Math.round((st.open / capacity) * 100);
          const isOverloaded = d.id !== 'system-admin' && loadPct > 100;
          const isElevated = d.id !== 'system-admin' && loadPct >= 75 && !isOverloaded;
          const barColor = isOverloaded ? 'var(--critical)' : isElevated ? 'var(--amber)' : 'var(--teal)';

          return (
            <div className="span-4" key={d.id} style={{ display: 'flex' }}>
              <Card
                className="h-full"
                hover
                style={{
                  width: '100%',
                  borderColor: isOverloaded ? 'rgba(255, 60, 80, 0.45)' : undefined,
                  background: isOverloaded ? 'rgba(255, 60, 80, 0.03)' : undefined,
                }}
              >
                <CardHead
                  kt={
                    <span className="row" style={{ gap: 6 }}>
                      <span className="dot" style={{ background: d.color }} /> {t(`dept.${d.status}`)}
                    </span>
                  }
                  title={
                    <div className="row-between" style={{ width: '100%', alignItems: 'center' }}>
                      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                        <span className="legend-dot" style={{ background: d.color }} />
                        <span>{d.shortName}</span>
                      </div>
                      {isOverloaded && (
                        <span className="badge b-critical" style={{ fontSize: 9.5, fontWeight: 700 }}>
                          OVERLOADED
                        </span>
                      )}
                    </div>
                  }
                />

                <p className="tiny" style={{ color: 'var(--ink-3)', minHeight: 30, margin: '0 0 12px' }}>
                  {t(ROLE_KEYS[d.id])}
                </p>

                {/* Department Workload Bar (for operational departments) */}
                {d.id !== 'system-admin' && (
                  <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: 8 }}>
                    <div className="row-between" style={{ fontSize: 11, marginBottom: 4 }}>
                      <span className="muted">Workload Capacity</span>
                      <b style={{ color: barColor }}>
                        {st.open} / {capacity} tasks ({loadPct}%)
                      </b>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, loadPct)}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="stack" style={{ gap: 6, borderBottom: '1px dashed var(--line-faint)', paddingBottom: 12, marginBottom: 12 }}>
                  {[
                    [t('dpt.openAlerts'), String(st.open)],
                    [t('st.resolved'), String(st.resolved)],
                    [t('risk.critical'), String(st.crit)],
                    [t('dpt.detections'), `${detected[d.id] ?? 0} (${shareByDept[d.id] ?? 0}%)`],
                  ].map(([k, v]) => (
                    <div key={k} className="row-between" style={{ fontSize: 12.5 }}>
                      <span className="muted">{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>

                <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
                  <span className="badge b-plain">
                    <IconUser size={12} /> {t('dpt.operators', { n: teammates.length })}
                  </span>
                  <span className="badge b-plain">
                    <IconClock size={12} /> {t('dpt.inFlight', { n: alerts.filter((a) => a.detection.department === d.id && a.status === 'in_progress').length })}
                  </span>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <Link to="department" className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                    {t('dpt.myDeptView')}
                  </Link>

                  {isAdmin && d.id !== 'system-admin' && (
                    <Link
                      to={`admin/workload/${d.id}`}
                      className={`btn btn-sm ${isOverloaded ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        flex: 1,
                        background: isOverloaded ? 'var(--critical)' : undefined,
                        borderColor: isOverloaded ? 'var(--critical)' : undefined,
                      }}
                    >
                      <IconScale size={13} /> {isOverloaded ? 'Relieve Load' : 'Reassign Tasks'}
                    </Link>
                  )}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}