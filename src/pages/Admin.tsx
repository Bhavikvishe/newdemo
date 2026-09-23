import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { DEPARTMENTS, OPERATORS, deptById, fmtDT, remTime } from '../lib/mock';
import { alertStatusLabel, clsLabel, riskLabel, statusBadgeClass } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Select, RiskBadge, EmptyState } from '../lib/ui';
import { Link } from '../lib/router';
import { IconUser, IconCheck, IconDoc, IconClock, IconHelm } from '../components/Icons';
import type { Alert, DepartmentId, Language } from '../types';

const OPEN = ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'];

export function AdminPage() {
  const store = useStore();
  const { alerts, registeredUsers, language } = store;
  const t = makeT(language);
  const filterLabels: Record<string, string> = { all: t('common.all'), assigned: t('st.assigned'), unassigned: t('adm.unassigned'), overdue: t('st.overdue') };

  const [taskId, setTaskId] = useState('');
  const [dept, setDept] = useState<DepartmentId>('marine-operations');
  const [operator, setOperator] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned' | 'overdue'>('all');

  const openAlerts = useMemo(() => alerts.filter((a) => OPEN.includes(a.status)), [alerts]);
  const unassigned = useMemo(() => openAlerts.filter((a) => !a.assignedOperator), [openAlerts]);
  const overdue = useMemo(() => openAlerts.filter((a) => a.status === 'overdue'), [openAlerts]);
  const inProgress = useMemo(() => openAlerts.filter((a) => a.status === 'in_progress'), [openAlerts]);

  const roster = useMemo(() => {
    const base = OPERATORS[dept] ?? [];
    const reg = registeredUsers.filter((r) => r.department === dept).map((r) => r.name);
    const seen = new Set<string>();
    return [...base, ...reg].filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  }, [dept, registeredUsers]);

  const ledger = useMemo(() => {
    const rows = [...alerts].sort((a, b) => (a.detection.detectionTime < b.detection.detectionTime ? 1 : -1));
    switch (filter) {
      case 'assigned': return rows.filter((a) => a.assignedOperator);
      case 'unassigned': return rows.filter((a) => !a.assignedOperator && OPEN.includes(a.status));
      case 'overdue': return rows.filter((a) => a.status === 'overdue');
      default: return rows;
    }
  }, [alerts, filter]);

  const assignments = useMemo(() => {
    const m = new Map<DepartmentId, { assigned: number; unassigned: number }>();
    DEPARTMENTS.forEach((d) => m.set(d.id, { assigned: 0, unassigned: 0 }));
    openAlerts.forEach((a) => {
      const entry = m.get(a.detection.department) ?? { assigned: 0, unassigned: 0 };
      if (a.assignedOperator) entry.assigned++;
      else entry.unassigned++;
      m.set(a.detection.department, entry);
    });
    return m;
  }, [openAlerts]);

  const assign = () => {
    if (!taskId || !operator) return;
    store.assignTask(taskId, dept, operator);
    setTaskId('');
    setOperator('');
  };

  return (
    <div>
      <PageHead
        kicker={`${t('nav.admin')} · system-admin`}
        title={t('nav.admin')}
        sub={t('adm.sub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Link to="departments" className="btn btn-secondary"><IconHelm size={15} /> {t('nav.departments')}</Link>
          </div>
        }
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('adm.openTasks')}</div>
          <b className="stat-num">{openAlerts.length}</b>
        </Card></div>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('adm.unassigned')}</div>
          <b className="stat-num" style={{ color: 'var(--medium)' }}>{unassigned.length}</b>
        </Card></div>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('adm.inProgress')}</div>
          <b className="stat-num" style={{ color: 'var(--accent)' }}>{inProgress.length}</b>
        </Card></div>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('st.overdue')}</div>
          <b className="stat-num" style={{ color: 'var(--critical)' }}>{overdue.length}</b>
        </Card></div>
      </div>

      <Card style={{ marginTop: 16 }}>
        <CardHead kt={t('adm.ktPriorityAction')} title={t('adm.assignFlow')}
          right={<span className="tiny upper muted"><IconClock size={12} /> {t('adm.liveLedger')}</span>} />
        <div className="row wrap" style={{ gap: 8 }}>
          <Select
            value={taskId}
            onChange={setTaskId}
            className="grow"
            options={[
              { value: '', label: t('adm.selectOpenTask') },
              ...openAlerts.map((a) => ({
                value: a.alertId,
                label: `${a.alertId} · ${clsLabel(a.detection.className, language).split(' ')[0]} · ${deptById(a.detection.department).shortName}${a.assignedOperator ? ` → ${a.assignedOperator}` : ` · ${t('adm.unassigned')}`}`,
              })),
            ]}
          />
          <Select
            value={dept}
            onChange={(v) => { setDept(v as DepartmentId); setOperator(''); }}
            options={DEPARTMENTS.filter((d) => d.id !== 'system-admin').map((d) => ({ value: d.id, label: d.shortName }))}
          />
          <Select
            value={operator}
            onChange={setOperator}
            className="grow"
            options={[{ value: '', label: t('adm.memberOpt') }, ...roster.map((o) => ({ value: o, label: o }))]}
          />
          <Button variant="primary" disabled={!taskId || !operator} onClick={assign}>
            <IconUser size={15} /> {t('adm.assignTask')}
          </Button>
        </div>
        <div className="tiny muted" style={{ marginTop: 10 }}>
          {roster.length === 0 ? t('adm.noMembers', { dept: deptById(dept).shortName }) : t('adm.membersAvail', { n: roster.length, dept: deptById(dept).name })}
        </div>
      </Card>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-8">
          <Card className="h-full">
            <CardHead
              kt={t('adm.ktCommandChain')}
              title={t('adm.assignmentLedger')}
              right={
                <div className="row" style={{ gap: 6 }}>
                  {(['all', 'assigned', 'unassigned', 'overdue'] as const).map((f) => (
                    <button key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{filterLabels[f]}</button>
                  ))}
                </div>
              }
            />
            {ledger.length === 0 ? (
              <EmptyState title={t('adm.noCasesTitle')} desc={t('adm.noCasesDesc')} />
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {ledger.map((a) => (
                  <TaskRow key={a.id} alert={a} language={language} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('adm.ktRoster')} title={t('adm.deptsAndMembers')} />
            <div className="stack" style={{ gap: 10 }}>
              {DEPARTMENTS.filter((d) => d.id !== 'system-admin').map((d) => {
                const members = [...(OPERATORS[d.id] ?? []), ...registeredUsers.filter((r) => r.department === d.id).map((r) => r.name)];
                const load = assignments.get(d.id);
                return (
                  <div key={d.id} style={{ border: '1px solid var(--line-faint)', borderRadius: 12, padding: 10 }}>
                    <div className="row-between" style={{ marginBottom: 6 }}>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="legend-dot" style={{ background: d.color }} />
                        <b style={{ fontSize: 12.5 }}>{d.shortName}</b>
                      </span>
                      <span className="badge b-plain" style={{ fontSize: 10 }}>
                        {t('adm.deptLoad', { a: load?.assigned ?? 0, u: load?.unassigned ?? 0 })}
                      </span>
                    </div>
                    <div className="row wrap" style={{ gap: 5 }}>
                      {members.length === 0 ? (
                        <span className="tiny muted">{t('adm.noMembersShort')}</span>
                      ) : (
                        members.map((m) => (
                          <span key={m} className="tag rec"><IconUser size={10} /> {m}</span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>
              {t('adm.registered', { n: registeredUsers.length })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ alert, language }: { alert: Alert; language: Language }) {
  const a = alert;
  const t = makeT(language);
  const overflow = a.status !== 'resolved' && (!a.responseDeadline || remTime(a.responseDeadline).startsWith('EXPIRED'));
  const routed = !!a.assignedOperator && !!a.assignedAt;
  return (
    <div className="row" style={{ gap: 12, padding: 10, border: '1px solid var(--line-faint)', borderRadius: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="mono" style={{ fontSize: 12 }}>{a.alertId}</b>
          <span className="badge b-plain" style={{ fontSize: 10.5 }}>{clsLabel(a.detection.className, language).split(' ')[0]}</span>
          <RiskBadge risk={a.detection.riskLevel} label={riskLabel(a.detection.riskLevel, language)} />
        </div>
        <div className="row" style={{ gap: 10, marginTop: 3, fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span className="row" style={{ gap: 5 }}>
            <span className="legend-dot" style={{ background: deptById(a.detection.department).color }} />
            {deptById(a.detection.department).shortName}
          </span>
          <span>{t('adm.opp')}: <b style={{ color: 'var(--ink-2)' }}>{a.assignedOperator ?? t('adm.unassigned')}</b></span>
          <span className={overflow ? 'ct' : ''}>{a.status !== 'resolved' ? remTime(a.responseDeadline) : t('st.closed')} · {fmtDT(a.detection.detectionTime)}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className={`badge ${statusBadgeClass(a.status)}`}><span className="dot" /> {alertStatusLabel(a.status, language)}</span>
        <Link to={`detail/${a.detectionId}`} className="btn btn-ghost btn-sm">{t('common.open')} <IconDoc size={13} /></Link>
      </div>
      {routed && (
        <span className="badge b-accent"><IconCheck size={11} /> {t('adm.routed')}</span>
      )}
    </div>
  );
}