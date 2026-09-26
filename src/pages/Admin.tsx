import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { DEPARTMENTS, OPERATORS, canonicalDepartmentId, deptById, fmtDT, remTime } from '../lib/mock';
import { alertStatusLabel, clsLabel, riskLabel, statusBadgeClass } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Select, RiskBadge, EmptyState } from '../lib/ui';
import { Link } from '../lib/router';
import { IconUser, IconCheck, IconDoc, IconClock, IconHelm, IconScale, IconRescue } from '../components/Icons';
import type { Alert, DepartmentId, Language, DepartmentWorkloadInfo } from '../types';

const OPEN = ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'];

const OPERATIONAL_DEPTS: DepartmentId[] = [
  'marine-operations',
  'marine-environmental',
  'ocean-survey',
];

export function AdminPage() {
  const store = useStore();
  const { alerts, registeredUsers, language, aidHistory } = store;
  const t = makeT(language);

  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned' | 'overdue' | 'aided'>('all');

  // Unified assignment / transfer state
  const [taskId, setTaskId] = useState('');
  const [dept, setDept] = useState<DepartmentId>('marine-operations');
  const [operator, setOperator] = useState('');

  const openAlerts = useMemo(() => alerts.filter((a) => OPEN.includes(a.status)), [alerts]);
  const unassigned = useMemo(() => openAlerts.filter((a) => !a.assignedOperator), [openAlerts]);

  // Selected task metadata
  const selectedAlert = useMemo(() => {
    return openAlerts.find((a) => a.alertId === taskId || a.id === taskId);
  }, [openAlerts, taskId]);

  const isReassigning = selectedAlert && canonicalDepartmentId(selectedAlert.detection.department) !== canonicalDepartmentId(dept);

  // Department Workloads Calculation
  const deptWorkloads = useMemo<DepartmentWorkloadInfo[]>(() => {
    return OPERATIONAL_DEPTS.map((dId) => {
      const d = deptById(dId);
      const dAlerts = openAlerts.filter((a) => canonicalDepartmentId(a.detection.department) === dId);
      const inProg = dAlerts.filter((a) => a.status === 'in_progress').length;
      const crit = dAlerts.filter((a) => a.detection.riskLevel === 'critical').length;
      const od = dAlerts.filter((a) => a.status === 'overdue').length;
      const rosterList = [...(OPERATORS[dId] ?? []), ...registeredUsers.filter((r) => r.department === dId).map((r) => r.name)];
      const capacity = Math.max(3, Math.min(6, rosterList.length * 2 || 3));
      const loadPct = Math.round((dAlerts.length / capacity) * 100);
      const status: 'optimal' | 'elevated' | 'overloaded' =
        loadPct > 100 ? 'overloaded' : loadPct >= 75 ? 'elevated' : 'optimal';
      return {
        departmentId: dId,
        name: d.name,
        shortName: d.shortName,
        color: d.color,
        openTasks: dAlerts.length,
        inProgressTasks: inProg,
        criticalTasks: crit,
        overdueTasks: od,
        rosterSize: rosterList.length,
        capacityLimit: capacity,
        loadPercentage: loadPct,
        status,
        isHelperEligible: loadPct < 70,
        requiresHelp: status === 'overloaded' || dAlerts.length >= 4,
      };
    });
  }, [openAlerts, registeredUsers]);

  const overloadedDepts = useMemo(() => deptWorkloads.filter((d) => d.status === 'overloaded'), [deptWorkloads]);

  // Target Department Roster
  const roster = useMemo(() => {
    const base = OPERATORS[dept] ?? [];
    const reg = registeredUsers.filter((r) => canonicalDepartmentId(r.department) === canonicalDepartmentId(dept)).map((r) => r.name);
    const seen = new Set<string>();
    return [...base, ...reg].filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  }, [dept, registeredUsers]);

  // Unified Assign or Transfer Handler
  const handleAssignOrReassign = () => {
    if (!taskId || !selectedAlert) return;
    if (isReassigning) {
      // Interdepartmental Transfer to relieve source department workload
      const targetOp = operator || roster[0] || 'Duty Specialist';
      store.interdepartmentalTransfer(
        selectedAlert.id,
        selectedAlert.detection.department,
        dept,
        targetOp,
        'Manual workload adjustment'
      );
      setTaskId('');
      setOperator('');
    } else {
      // Standard operator assignment
      if (!operator) return;
      store.assignTask(selectedAlert.id, dept, operator);
      setTaskId('');
      setOperator('');
    }
  };

  // Manual workload adjustment is performed only from the explicit Adjust Workload controls.

  // Ledger Filter
  const filterLabels: Record<string, string> = {
    all: t('common.all'),
    assigned: t('st.assigned'),
    unassigned: t('adm.unassigned'),
    overdue: t('st.overdue'),
    aided: '⚡ Mutual Aid',
  };

  const ledger = useMemo(() => {
    const rows = [...alerts].sort((a, b) => (a.detection.detectionTime < b.detection.detectionTime ? 1 : -1));
    switch (filter) {
      case 'assigned': return rows.filter((a) => a.assignedOperator);
      case 'unassigned': return rows.filter((a) => !a.assignedOperator && OPEN.includes(a.status));
      case 'overdue': return rows.filter((a) => a.status === 'overdue');
      case 'aided': return rows.filter((a) => !!a.interdepartmentalAid);
      default: return rows;
    }
  }, [alerts, filter]);

  return (
    <div>
      <PageHead
        kicker={`${t('nav.admin')} · system-admin`}
        title={t('nav.admin')}
        sub="Operations command console: review department workloads and manually transfer open debris cases between operational departments."
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Link to="admin" className="btn btn-primary" title="Manually adjust workload by transferring an open case">
              <IconScale size={14} /> Adjust Workload
            </Link>
            <Link to="departments" className="btn btn-secondary">
              <IconHelm size={15} /> {t('nav.departments')}
            </Link>
          </div>
        }
      />

      {/* 4 Summary Stat Cards */}
      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-3">
          <Card className="h-full solid" style={{ padding: 14 }}>
            <div className="tiny upper muted">{t('adm.openTasks')}</div>
            <b className="stat-num">{openAlerts.length}</b>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Across {OPERATIONAL_DEPTS.length} departments
            </div>
          </Card>
        </div>

        <div className="span-3">
          <Card className="h-full solid" style={{ padding: 14 }}>
            <div className="tiny upper muted">Department Workload</div>
            {overloadedDepts.length > 0 ? (
              <>
                <b className="stat-num" style={{ color: 'var(--critical)' }}>
                  {overloadedDepts.length} Busy
                </b>
                <div className="tiny muted" style={{ marginTop: 4, color: 'var(--critical)' }}>
                  {overloadedDepts.map((d) => d.shortName).join(', ')} need aid
                </div>
              </>
            ) : (
              <>
                <b className="stat-num" style={{ color: 'var(--teal)' }}>
                  Balanced
                </b>
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  All units within capacity
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="span-3">
          <Card className="h-full solid" style={{ padding: 14 }}>
            <div className="tiny upper muted">{t('adm.unassigned')}</div>
            <b className="stat-num" style={{ color: 'var(--medium)' }}>
              {unassigned.length}
            </b>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Awaiting operator assignment
            </div>
          </Card>
        </div>

        <div className="span-3">
          <Card className="h-full solid" style={{ padding: 14 }}>
            <div className="tiny upper muted">Interdepartmental Aid</div>
            <b className="stat-num" style={{ color: 'var(--accent)' }}>
              {aidHistory.length}
            </b>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Cases reassigned to minimize load
            </div>
          </Card>
        </div>
      </div>

      {/* Action Bar: Assign Operator OR Reassign Department */}
      <Card style={{ marginTop: 16 }}>
        <CardHead
          kt="WORKLOAD MANAGEMENT & ASSIGNMENT"
          title="Adjust Workload or Assign Specialist"
          right={
            <span className="tiny upper muted">
              <IconClock size={12} /> Live Command Authority
            </span>
          }
        />

        <div className="row wrap" style={{ gap: 8 }}>
          {/* 1. Select Case */}
          <Select
            value={taskId}
            onChange={(id) => {
              setTaskId(id);
              const found = openAlerts.find((a) => a.alertId === id || a.id === id);
              if (found) {
                setDept(canonicalDepartmentId(found.detection.department));
                setOperator(found.assignedOperator ?? '');
              }
            }}
            className="grow"
            options={[
              { value: '', label: 'Select task to assign or reassign...' },
              ...openAlerts.map((a) => {
                const dName = deptById(a.detection.department).shortName;
                const cName = clsLabel(a.detection.className, language).split(' ')[0];
                const opName = a.assignedOperator ? `(${a.assignedOperator})` : 'Unassigned';
                return {
                  value: a.alertId,
                  label: `${a.alertId} · ${cName} · ${dName} · ${opName}`,
                };
              }),
            ]}
          />

          {/* 2. Destination Department */}
          <Select
            value={dept}
            onChange={(v) => {
              setDept(v as DepartmentId);
              setOperator('');
            }}
            options={DEPARTMENTS.filter((d) => d.id !== 'system-admin').map((d) => {
              const count = openAlerts.filter((a) => canonicalDepartmentId(a.detection.department) === d.id).length;
              return {
                value: d.id,
                label: `${d.shortName} (${count} active tasks)`,
              };
            })}
          />

          {/* 3. Specialist */}
          <Select
            value={operator}
            onChange={setOperator}
            className="grow"
            options={[
              { value: '', label: isReassigning ? 'Auto-assign available specialist' : 'Select specialist...' },
              ...roster.map((o) => ({ value: o, label: o })),
            ]}
          />

          {/* 4. Action Button */}
          <Button
            variant="primary"
            disabled={!taskId}
            onClick={handleAssignOrReassign}
            style={{ minWidth: 160 }}
          >
            {isReassigning ? (
              <>
                <IconRescue size={15} /> Adjust Workload → {deptById(dept).shortName}
              </>
            ) : (
              <>
                <IconUser size={15} /> Assign Specialist
              </>
            )}
          </Button>
        </div>

        <div className="row-between" style={{ marginTop: 10, fontSize: 12 }}>
          <span className="muted">
            {isReassigning ? (
              <span style={{ color: 'var(--accent)' }}>
                ⚡ Interdepartmental transfer: Moving task from <b>{deptById(selectedAlert!.detection.department).shortName}</b> to <b>{deptById(dept).shortName}</b> to minimize workload.
              </span>
            ) : (
              roster.length === 0
                ? t('adm.noMembers', { dept: deptById(dept).shortName })
                : t('adm.membersAvail', { n: roster.length, dept: deptById(dept).name })
            )}
          </span>

          {aidHistory.length > 0 && (
            <span className="tiny muted">
              {aidHistory.length} mutual aid transfers recorded
            </span>
          )}
        </div>
      </Card>

      {/* Main Grid: Left = Task Ledger, Right = Department Workloads */}
      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        {/* Left Column (8 cols): Task Assignment & Operations Ledger */}
        <div className="span-8">
          <Card className="h-full">
            <CardHead
              kt={t('adm.ktCommandChain')}
              title={t('adm.assignmentLedger')}
              right={
                <div className="row wrap" style={{ gap: 6 }}>
                  {(['all', 'assigned', 'unassigned', 'overdue', 'aided'] as const).map((f) => (
                    <button
                      key={f}
                      className={`chip${filter === f ? ' on' : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {filterLabels[f]}
                    </button>
                  ))}
                </div>
              }
            />

            {ledger.length === 0 ? (
              <EmptyState title={t('adm.noCasesTitle')} desc={t('adm.noCasesDesc')} />
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {ledger.map((a) => (
                  <TaskRow
                    key={a.id}
                    alert={a}
                    language={language}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (4 cols): Department Workload & Mutual Aid Status */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt="FLEET CAPACITY & AID"
              title="Department Workloads"
            />

            <div className="stack" style={{ gap: 10 }}>
              {deptWorkloads.map((dw) => {
                const isOverloaded = dw.status === 'overloaded';
                const isElevated = dw.status === 'elevated';
                const barColor = isOverloaded ? 'var(--critical)' : isElevated ? 'var(--amber)' : 'var(--teal)';

                return (
                  <div
                    key={dw.departmentId}
                    style={{
                      border: isOverloaded ? '1px solid rgba(255, 60, 80, 0.4)' : '1px solid var(--line-faint)',
                      borderRadius: 10,
                      padding: 10,
                      background: isOverloaded ? 'rgba(255, 60, 80, 0.04)' : 'rgba(5, 11, 20, 0.4)',
                    }}
                  >
                    <div className="row-between" style={{ marginBottom: 6 }}>
                      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <span className="legend-dot" style={{ background: dw.color }} />
                        <b style={{ fontSize: 12.5 }}>{dw.shortName}</b>
                      </span>

                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <span
                          className={`badge ${isOverloaded ? 'b-critical' : isElevated ? 'b-plain' : 'b-teal'}`}
                          style={{ fontSize: 9.5, padding: '1px 5px', fontWeight: 700 }}
                        >
                          {dw.openTasks} {dw.openTasks === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                    </div>

                    {/* Compact Workload Progress Bar */}
                    <div
                      style={{
                        width: '100%',
                        height: 4,
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: 2,
                        overflow: 'hidden',
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, dw.loadPercentage)}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 2,
                        }}
                      />
                    </div>

                    {/* Department Specialist Tags */}
                    <div className="row wrap" style={{ gap: 4 }}>
                      {(OPERATORS[dw.departmentId] ?? []).slice(0, 3).map((m) => (
                        <span key={m} className="tag rec" style={{ fontSize: 10, padding: '1px 5px' }}>
                          <IconUser size={9} /> {m}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent Mutual Aid Transfers Ledger */}
            {aidHistory.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-faint)' }}>
                <div className="tiny upper muted" style={{ marginBottom: 8, fontWeight: 600 }}>
                  Recent Mutual Aid Transfers
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  {aidHistory.slice(0, 3).map((rec) => (
                    <div
                      key={rec.id}
                      style={{
                        fontSize: 11,
                        padding: '6px 8px',
                        background: 'rgba(0, 240, 255, 0.04)',
                        border: '1px solid rgba(0, 240, 255, 0.15)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        <b className="mono">{rec.alertId}</b>: {deptById(rec.fromDepartment).shortName} → {deptById(rec.toDepartment).shortName}
                      </span>
                      <span className="tiny muted">{rec.targetOperator}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  alert,
  language,
}: {
  alert: Alert;
  language: Language;
}) {
  const a = alert;
  const t = makeT(language);
  const overflow = a.status !== 'resolved' && (!a.responseDeadline || remTime(a.responseDeadline).startsWith('EXPIRED'));
  const routed = !!a.assignedOperator && !!a.assignedAt;
  const isTransferred = !!a.interdepartmentalAid;

  return (
    <div className="row" style={{ gap: 10, padding: 10, border: '1px solid var(--line-faint)', borderRadius: 12, alignItems: 'center' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
          <b className="mono" style={{ fontSize: 12 }}>{a.alertId}</b>
          <span className="badge b-plain" style={{ fontSize: 10.5 }}>{clsLabel(a.detection.className, language).split(' ')[0]}</span>
          <RiskBadge risk={a.detection.riskLevel} label={riskLabel(a.detection.riskLevel, language)} />
          {isTransferred && (
            <span
              className="badge b-accent"
              style={{ fontSize: 9.5, padding: '1px 5px', fontWeight: 700 }}
              title={`Transferred from ${deptById(a.interdepartmentalAid!.fromDepartment).name} to relieve workload`}
            >
              ⚡ Aided: {deptById(a.interdepartmentalAid!.fromDepartment).shortName} → {deptById(a.interdepartmentalAid!.toDepartment).shortName}
            </span>
          )}
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 4, fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span className="row" style={{ gap: 5, alignItems: 'center' }}>
            <span className="legend-dot" style={{ background: deptById(a.detection.department).color }} />
            <b>{deptById(a.detection.department).shortName}</b>
          </span>
          <span>{t('adm.opp')}: <b style={{ color: 'var(--ink-2)' }}>{a.assignedOperator ?? t('adm.unassigned')}</b></span>
          <span className={overflow ? 'ct' : ''}>
            {a.status !== 'resolved' ? remTime(a.responseDeadline) : t('st.closed')} · {fmtDT(a.detection.detectionTime)}
          </span>
        </div>
      </div>

      {/* Row Actions: Status + Open Button */}
      <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
        <span className={`badge ${statusBadgeClass(a.status)}`} style={{ fontSize: 10.5 }}>
          <span className="dot" /> {alertStatusLabel(a.status, language)}
        </span>

        <Link to={`detail/${a.detectionId}`} className="btn btn-ghost btn-sm" style={{ padding: '3px 8px' }}>
          {t('common.open')} <IconDoc size={13} />
        </Link>

        {routed && !isTransferred && (
          <span className="badge b-accent" style={{ fontSize: 9.5 }}>
            <IconCheck size={10} /> {t('adm.routed')}
          </span>
        )}
      </div>
    </div>
  );
}