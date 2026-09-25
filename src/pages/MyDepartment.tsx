import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { deptById, fmtDT, remTime, OPERATORS } from '../lib/mock';
import { alertStatusLabel, clsLabel, riskLabel, statusBadgeClass } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { PageHead, Card, CardHead, Button, RiskBadge, Select, EmptyState } from '../lib/ui';
import { Link } from '../lib/router';
import { IconUser, IconCheck, IconDoc } from '../components/Icons';
import type { Alert } from '../types';

const OPEN = ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'];

const EQUIPMENT: Record<string, string[]> = {
  'marine-operations': ['ROV', 'Hydraulic grapple', 'Lift bags', 'Decontamination kit', 'Support vessel'],
  'marine-engineering': ['Scour matts', 'Diver team', 'Welding rig', 'Cement injection', 'Pipeline spool'],
  'marine-environmental': ['Ghost-gear cutter', 'Biodiversity kit', 'Water sampler', 'GPS marker buoys'],
  'search-rescue': ['SAR vessel', 'Boat lift', 'Med kit', 'Thermal drone'],
  'ocean-survey': ['AUV / towed sonar', 'Camera sled', 'Telemetry buoys', 'Sidescan sonar'],
  'recovery-response': ['Heavy lift crane', 'Salvage pontoons', 'Rigging crew', 'Explosive ordnance kit', 'Verification submersible'],
  'system-admin': ['Console access', 'Routing engine', 'Calibration tools'],
};

export function MyDepartmentPage() {
  const store = useStore();
  const { user, alerts, language, registeredUsers } = store;
  const t = makeT(language);
  const me = user?.department ?? 'marine-operations';
  const [status, setStatus] = useState('open');
  const [operator, setOperator] = useState('');
  const [opAlert, setOpAlert] = useState<Alert | null>(null);

  const view = useMemo(
    () =>
      alerts.filter(
        (a) =>
          a.detection.department === me &&
          (status === 'open' ? OPEN.includes(a.status) : status === 'resolved' ? a.status === 'resolved' : true)
      ),
    [alerts, me, status]
  );

  const myOpen = alerts.filter((a) => a.detection.department === me && OPEN.includes(a.status));
  const myCrit = myOpen.filter((a) => a.detection.riskLevel === 'critical').length;
  const myRes = alerts.filter((a) => a.detection.department === me && a.status === 'resolved').length;

  const roster = useMemo(() => {
    const base = OPERATORS[me] ?? [];
    const reg = registeredUsers.filter((r) => r.department === me).map((r) => r.name);
    const seen = new Set<string>();
    return [...base, ...reg].filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  }, [me, registeredUsers]);

  // Workload and capacity metrics
  const capacity = Math.max(3, Math.min(6, roster.length * 2 || 3));
  const loadPct = Math.round((myOpen.length / capacity) * 100);
  const isOverloaded = loadPct > 100;

  // Mutual Aid tracking
  const aidedOut = useMemo(() => alerts.filter((a) => a.reassignedFromDepartment === me), [alerts, me]);
  const aidedIn = useMemo(() => alerts.filter((a) => a.detection.department === me && a.interdepartmentalAid), [alerts, me]);

  const frames = useMemo(() => {
    const m = new Map<string, string>();
    view.slice(0, 8).forEach((a) => m.set(a.detectionId, renderFrame(a.detection, { width: 120 }, language)));
    return m;
  }, [view, language]);

  return (
    <div>
      <PageHead
        kicker={`${t('nav.mydept')} · ${deptById(me).id.replace(/-/g, ' ')}`}
        title={deptById(me).name}
        sub={t('my.deptSub', { dept: deptById(me).shortName })}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="badge b-accent"><span className="dot" /> {t('dept.' + deptById(me).status)}</span>
            <Link to="alerts" className="btn btn-secondary"><IconDoc size={15} /> {t('my.alertConsole')}</Link>
          </div>
        }
      />

      {/* High Workload Notice & Simple Help Request */}
      {isOverloaded && (
        <div
          style={{
            background: 'rgba(255, 60, 80, 0.08)',
            border: '1px solid rgba(255, 60, 80, 0.3)',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 13,
          }}
        >
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="badge b-critical" style={{ fontSize: 10, fontWeight: 700 }}>
              HIGH WORKLOAD ({loadPct}%)
            </span>
            <span>
              Department queue is high ({myOpen.length} active tasks). Request assistance from other units.
            </span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => store.requestInterdepartmentalAid(me)}
          >
            🤝 Request Department Help
          </Button>
        </div>
      )}

      {/* Clean 4 Stat Cards */}
      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('my.openCases')}</div>
          <b className="stat-num">{myOpen.length}</b>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {loadPct}% safe capacity ({capacity})
          </div>
        </Card></div>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('risk.critical')}</div>
          <b className="stat-num" style={{ color: 'var(--critical)' }}>{myCrit}</b>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            Immediate response required
          </div>
        </Card></div>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('st.resolved')}</div>
          <b className="stat-num" style={{ color: 'var(--teal)' }}>{myRes}</b>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {aidedIn.length > 0 ? `${aidedIn.length} aided by other units` : 'Successfully resolved'}
          </div>
        </Card></div>
        <div className="span-3"><Card className="h-full solid" style={{ padding: 14 }}>
          <div className="tiny upper muted">{t('my.operators')}</div>
          <b className="stat-num">{roster.length}</b>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            Active department personnel
          </div>
        </Card></div>
      </div>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-8">
          <Card className="h-full">
            <CardHead
              kt={t('my.ktActiveCases')}
              title={t('my.deptWorkload')}
              right={
                <div className="row" style={{ gap: 6 }}>
                  <button className={`chip${status === 'open' ? ' on' : ''}`} onClick={() => setStatus('open')}>{t('st.open')}</button>
                  <button className={`chip${status === 'resolved' ? ' on' : ''}`} onClick={() => setStatus('resolved')}>{t('st.resolved')}</button>
                </div>
              }
            />
            {view.length === 0 ? (
              <EmptyState title={t('my.allClear')} desc={t('my.noCasesMatch')} />
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {view.map((a) => {
                  const overflow = a.status !== 'resolved' && (!a.responseDeadline || remTime(a.responseDeadline).startsWith('EXPIRED'));
                  const isAided = !!a.interdepartmentalAid;
                  return (
                    <div key={a.id} className="row" style={{ gap: 12, padding: 10, border: '1px solid var(--line-faint)', borderRadius: 12 }}>
                      {frames.get(a.detectionId) && <img className="sonimg thumb" src={frames.get(a.detectionId)} alt="" width={54} height={34} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <b className="mono" style={{ fontSize: 12 }}>{a.alertId}</b>
                          <span className="badge b-plain" style={{ fontSize: 10.5 }}>{clsLabel(a.detection.className, language).split(' ')[0]}</span>
                          <RiskBadge risk={a.detection.riskLevel} label={riskLabel(a.detection.riskLevel, language)} />
                          {isAided && (
                            <span className="badge b-accent" style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px' }}>
                              ⚡ AID: From {deptById(a.interdepartmentalAid!.fromDepartment).shortName}
                            </span>
                          )}
                        </div>
                        <div className="row" style={{ gap: 10, marginTop: 3, fontSize: 11.5, color: 'var(--ink-3)' }}>
                          <span className="mono">{t('my.confShort')} {Math.round(a.detection.confidence * 100)}%</span>
                          <span>{t('my.assignedTo', { name: a.assignedOperator ?? t('my.unassigned') })}</span>
                          <span className={overflow ? 'ct' : ''}>{a.status !== 'resolved' ? remTime(a.responseDeadline) : t('st.closed')} / {fmtDT(a.detection.detectionTime)}</span>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <span className={`badge ${statusBadgeClass(a.status)}`}><span className="dot" /> {alertStatusLabel(a.status, language)}</span>
                        {a.status === 'unacknowledged' || a.status === 'new' ? (
                          <Button size="sm" variant="primary" onClick={() => store.acknowledgeAlert(a.id)}><IconCheck size={13} /> {t('my.accept')}</Button>
                        ) : a.status === 'resolved' ? (
                          <Link to={`detail/${a.detectionId}`} className="btn btn-ghost btn-sm">{t('my.review')}</Link>
                        ) : (
                          <Link to={`detail/${a.detectionId}`} className="btn btn-secondary btn-sm">{t('st.open')} <IconDoc size={13} /></Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('my.roster')} title={t('my.myTeam')} />
            <div className="stack" style={{ gap: 6 }}>
              {roster.map((name, i) => (
                <div key={name} className="row-between" style={{ padding: '8px 10px', border: '1px solid var(--line-faint)', borderRadius: 10 }}>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="legend-dot" style={{ background: i % 2 ? 'var(--accent)' : 'var(--teal)' }} />
                    <b style={{ fontSize: 12.5 }}>{name}</b>
                  </span>
                  <span className="badge b-plain" style={{ fontSize: 10 }}>{t('my.field')}</span>
                </div>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>{t('my.rosterHint')}</div>
          </Card>

          {/* Relieved Cases Section (Transferred out to help this department) */}
          {aidedOut.length > 0 && (
            <Card className="h-full" style={{ marginTop: 16 }}>
              <CardHead
                kt="MUTUAL AID RELIEF"
                title="Relieved by Other Units"
                right={<span className="badge b-teal">{aidedOut.length} Active</span>}
              />
              <p className="tiny muted" style={{ margin: '0 0 10px' }}>
                Cases originally assigned to {deptById(me).shortName} that were reassigned by System Administration to other units to reduce workload.
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {aidedOut.map((a) => (
                  <div key={a.id} className="row-between" style={{ padding: '7px 10px', border: '1px solid var(--line-faint)', borderRadius: 8, fontSize: 11.5 }}>
                    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <b className="mono">{a.alertId}</b>
                      <span>→ {deptById(a.detection.department).shortName}</span>
                    </span>
                    <span className="badge b-plain" style={{ fontSize: 10 }}>
                      {a.assignedOperator ?? 'Assisted'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="h-full" style={{ marginTop: 16 }}>
            <CardHead kt={t('my.onSite')} title={t('my.equipAndAssets')} />
            <div className="row wrap" style={{ gap: 6 }}>
              {(EQUIPMENT[me] ?? []).map((e) => (
                <span key={e} className="tag rec">{e}</span>
              ))}
            </div>
            <div className="row-between" style={{ marginTop: 12 }}>
              <span className="tiny muted">{t('my.onCall')}</span>
              <span className="badge b-accent"><span className="dot" /> {t('my.ready')}</span>
            </div>
          </Card>
        </div>
      </div>

      <Card style={{ marginTop: 16 }}>
        <CardHead kt={t('my.quickAction')} title={t('my.assignOpenCase')} />
        <div className="row wrap" style={{ gap: 8 }}>
          <Select
            value={opAlert?.alertId ?? ''}
            onChange={(v) => setOpAlert(alerts.find((a) => a.alertId === v) ?? null)}
            options={[{ value: '', label: t('my.selectOpenCase') }, ...myOpen.map((a) => ({ value: a.alertId, label: `${a.alertId} · ${clsLabel(a.detection.className, language).split(' ')[0]}` }))]}
          />
          <Select
            value={operator}
            onChange={setOperator}
            options={[{ value: '', label: t('my.operatorOpt') }, ...roster.map((o) => ({ value: o, label: o }))]}
          />
          <Button variant="primary" disabled={!opAlert || !operator} onClick={() => { if (opAlert && operator) { store.assignOperator(opAlert.id, operator); store.addToast({ kind: 'success', title: t('my.operatorAssigned'), text: t('my.assignedText', { operator, alertId: opAlert.alertId }) }); setOperator(''); setOpAlert(null); } }}>
            <IconUser size={15} /> {t('my.assign')}
          </Button>
        </div>
      </Card>
    </div>
  );
}