import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import {
  buildRoutingRules,
  CLASS_META,
  deptById,
  fmtDT,
  fmtSize,
  fmtWeight,
  remTime,
  OPERATORS,
  DEPARTMENTS,
} from '../lib/mock';
import { alertStatusLabel, clsLabel, riskLabel, statusBadgeClass } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { PageHead, Card, CardHead, Button, Badge, RiskBadge, Modal, ModalHead, Tag, Select } from '../lib/ui';
import { Link } from '../lib/router';
import { IconCheck, IconDoc } from '../components/Icons';
import type { Alert, AlertStatus, DepartmentId, DetectionClass } from '../types';

const OPEN = ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'];

export function AlertsPage() {
  const store = useStore();
  const { language, alerts, user } = store;
  const t = makeT(language);
  const [filter, setFilter] = useState<AlertStatus | 'all' | 'open'>('all');
  const [deptFilter, setDeptFilter] = useState<DepartmentId | 'all' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Alert | null>(null);
  const [operator, setOperator] = useState('');

  const FILTERS: { id: AlertStatus | 'all' | 'open'; label: string }[] = [
    { id: 'all', label: t('common.all') },
    { id: 'open', label: t('st.open') },
    { id: 'new', label: t('st.new') },
    { id: 'unacknowledged', label: t('st.unacknowledged') },
    { id: 'assigned', label: t('st.assigned') },
    { id: 'in_progress', label: t('st.in_progress') },
    { id: 'manual_verification', label: t('al.filtVerification') },
    { id: 'overdue', label: t('st.overdue') },
    { id: 'escalated', label: t('st.escalated') },
    { id: 'resolved', label: t('st.resolved') },
  ];

  const ClsTag = ({ cls }: { cls: DetectionClass }) => {
    const meta = CLASS_META[cls];
    return (
      <span className="row" style={{ gap: 7, fontSize: 13, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: meta.color, flex: 'none' }} />
        <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clsLabel(cls, language)}</span>
        {meta.category === 'marine-life' && <span className="tag ml">{t('risk.marine')}</span>}
        {meta.category === 'safety' && <span className="tag safety">{t('al.safetyTag')}</span>}
      </span>
    );
  };

  const filtered = useMemo(() => {
    return alerts
      .filter((a) => {
        if (filter === 'open') return OPEN.includes(a.status);
        if (filter !== 'all' && a.status !== filter) return false;
        return true;
      })
      .filter((a) => {
        if (deptFilter === 'mine') return a.detection.department === user?.department;
        if (deptFilter !== 'all') return a.detection.department === deptFilter;
        return true;
      })
      .filter((a) => {
        if (!search.trim()) return true;
        const q = search.trim().toUpperCase();
        return a.alertId.includes(q) || a.detectionId.includes(q) || a.detection.className.includes(q.toLowerCase());
      })
      .sort((a, b) => {
        const open = (x: Alert) => OPEN.includes(x.status) ? 0 : 1;
        if (open(a) !== open(b)) return open(a) - open(b);
        return a.priority - b.priority || (a.detection.detectionTime < b.detection.detectionTime ? 1 : -1);
      });
  }, [alerts, filter, deptFilter, search, user]);

  const counts = useMemo(() => {
    const c = {} as Record<string, number>;
    alerts.forEach((a) => { c[a.status] = (c[a.status] ?? 0) + 1; });
    return c;
  }, [alerts]);

  const rules = useMemo(() => buildRoutingRules(), []);

  const frames = useMemo(() => {
    const m = new Map<string, string>();
    filtered.slice(0, 30).forEach((a) => m.set(a.detectionId, renderFrame(a.detection, { width: 160 }, language)));
    if (selected) m.set(selected.detectionId, renderFrame(selected.detection, { width: 320 }, language));
    return m;
  }, [filtered, selected, language]);

  const act = (label: string, fn: () => void) => {
    fn();
    store.addToast({ kind: 'success', title: t('al.toastUpdated'), text: label });
    if (selected) {
      const next = store.alerts.find((a) => a.id === selected.id);
      if (next) setSelected(next);
    }
  };

  const selOp = selected ? OPERATORS[selected.detection.department] : [];

  return (
    <div>
      <PageHead
        kicker={t('al.title')}
        title={t('nav.alerts')}
        sub={t('al.sub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Link to="department" className="btn btn-secondary"><IconDoc size={15} /> {t('al.myDept')}</Link>
          </div>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <CardHead kt={t('al.ktRouting')} title={t('al.routingRules')} right={<span className="badge b-accent"><span className="dot" /> {t('al.auto')}</span>} />
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('al.thObjectClass')}</th><th>{t('al.thRiskBase')}</th><th>{t('al.thPrimaryDept')}</th><th>{t('al.escalation')}</th><th>{t('common.deadline')}</th><th>{t('al.thFields')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td><ClsTag cls={r.objectClass} /></td>
                  <td><RiskBadge risk={CLASS_META[r.objectClass].riskBase} label={riskLabel(CLASS_META[r.objectClass].riskBase, language)} /></td>
                  <td><span className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="legend-dot" style={{ background: deptById(r.primaryDepartment).color }} />{deptById(r.primaryDepartment).shortName}</span></td>
                  <td className="tiny muted">{r.escalationDepartment ? deptById(r.escalationDepartment).shortName : '—'}</td>
                  <td className="mono tiny">{r.responseTimeHours}h</td>
                  <td><div className="row wrap" style={{ gap: 6 }}>{r.equipment.slice(0, 2).map((e) => <span key={e} className="tag rec">{e}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 16 }}>
        {FILTERS.slice(1).map((f) => (
          <button key={f.id} className="card card-hover" style={{ padding: 12, textAlign: 'left', cursor: 'pointer', background: 'var(--panel)' }} onClick={() => setFilter(f.id as AlertStatus)}>
            <div className="tiny upper muted">{f.label}</div>
            <b style={{ fontSize: 22 }}>{f.id === 'open' ? alerts.filter((a) => OPEN.includes(a.status)).length : counts[f.id] ?? 0}</b>
          </button>
        ))}
      </div>

      <Card>
        <div className="row wrap" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', gap: 10 }}>
          <div className="row wrap" style={{ gap: 6, flex: 1 }}>
            {FILTERS.map((f) => (
              <button key={f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Select
              value={deptFilter}
              onChange={(v) => setDeptFilter(v as DepartmentId | 'all' | 'mine')}
              options={[
                { value: 'all', label: t('al.deptAll') },
                { value: 'mine', label: t('al.deptMine') },
                ...DEPARTMENTS.filter((d) => d.id !== 'system-admin').map((d) => ({ value: d.id, label: d.shortName })),
              ]}
            />
            <input className="input" placeholder={t('al.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('al.thAlert')}</th>
                <th>{t('al.thObject')}</th>
                <th>{t('common.risk')}</th>
                <th>{t('common.status')}</th>
                <th>{t('al.thDept')}</th>
                <th>{t('al.operator')}</th>
                <th>{t('common.deadline')}</th>
                <th>{t('al.thDetected')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const d = a.detection;
                return (
                  <tr key={a.id} onClick={() => setSelected(a)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        {frames.get(a.detectionId) && <img className="sonimg thumb" src={frames.get(a.detectionId)} alt="" width={40} height={26} />}
                        <div>
                          <b className="mono" style={{ fontSize: 12 }}>{a.alertId}</b>
                          <div className="mono tiny muted">{d.id}</div>
                        </div>
                      </div>
                    </td>
                    <td><ClsTag cls={d.className} /></td>
                    <td><RiskBadge risk={d.riskLevel} label={riskLabel(d.riskLevel, language)} /></td>
                    <td><Badge tone={statusBadgeClass(a.status)} dot>{alertStatusLabel(a.status, language)}</Badge></td>
                    <td><span className="row" style={{ gap: 6, fontSize: 12 }}><span className="legend-dot" style={{ background: CLASS_META[d.className].color }} />{deptById(d.department).shortName}</span></td>
                    <td className="tiny">{a.assignedOperator ?? '—'}</td>
                    <td>
                      {a.status === 'resolved' ? (
                        <span className="mono tiny" style={{ color: 'var(--teal)' }}>{t('al.done')}</span>
                      ) : a.overdue || a.status === 'overdue' ? (
                        <span className="mono tiny" style={{ color: 'var(--critical)' }}>{t('st.overdue').toUpperCase()}</span>
                      ) : (
                        <span className="mono tiny" style={{ color: remTime(a.responseDeadline).startsWith('EXPIRED') ? 'var(--critical)' : 'var(--ink-2)' }}>{remTime(a.responseDeadline)}</span>
                      )}
                    </td>
                    <td className="mono tiny muted">{fmtDT(d.detectionTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{t('al.empty')}</div>
          )}
        </div>
        <div className="row-between" style={{ padding: '10px 14px', borderTop: '1px solid var(--line-faint)', color: 'var(--ink-3)', fontSize: 11.5 }}>
          <span>{t('al.shown', { n: filtered.length })}</span>
          <span className="mono">{t('al.escHint')}</span>
        </div>
      </Card>

      {selected && (
        <Modal onClose={() => setSelected(null)} width={880}>
          <div style={{ padding: '22px 26px' }}>
            <ModalHead kt={t('al.ktDetail')} title={`${selected.alertId} · ${clsLabel(selected.detection.className, language)}`} onClose={() => setSelected(null)} />
            <div className="grid cols-12" style={{ gap: 16 }}>
              <div className="span-7 stack" style={{ gap: 14 }}>
                <div className="sonimg" style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
                  {frames.get(selected.detectionId) && <img src={frames.get(selected.detectionId)} alt="" width={320} height={146} style={{ width: '100%', height: 'auto', display: 'block' }} />}
                  <div style={{ position: 'absolute', left: `${selected.detection.boundingBox.x * 100}%`, top: `${selected.detection.boundingBox.y * 100}%`, width: `${selected.detection.boundingBox.width * 100}%`, height: `${selected.detection.boundingBox.height * 100}%`, border: '2px solid var(--accent)' }} />
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Tag kind="ai">{t('al.confTag', { pct: Math.round(selected.detection.confidence * 100) })}</Tag>
                  <Tag kind="rule">{fmtSize(selected.detection.estimatedSize)}</Tag>
                  <Tag kind="est">{fmtWeight(selected.detection.estimatedWeight)}</Tag>
                  <Tag kind="rec">{t('al.recTag', { dept: deptById(selected.detection.department).shortName })}</Tag>
                </div>
                <div>
                  <div className="tiny upper muted" style={{ marginBottom: 8 }}>{t('al.lifecycle')}</div>
                  <div className="timeline" style={{ maxHeight: 300, overflow: 'auto' }}>
                    {selected.timeline.map((ev, i) => (
                      <div key={ev.id} className={`tl-item done${i === selected.timeline.length - 1 ? ' now' : ''}`}>
                        <b>{ev.title}</b>
                        <p>{ev.description}</p>
                        <span className="tm">{fmtDT(ev.timestamp)} · {ev.actor} · {deptById(ev.department).shortName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="span-5 stack" style={{ gap: 14 }}>
                <Card style={{ padding: 14 }}>
                  <div className="row-between" style={{ marginBottom: 10 }}>
                    <RiskBadge risk={selected.detection.riskLevel} label={riskLabel(selected.detection.riskLevel, language)} />
                    <Badge tone={statusBadgeClass(selected.status)} dot>{alertStatusLabel(selected.status, language)}</Badge>
                  </div>
                  <div className="stack" style={{ gap: 4 }}>
                    {[
                      [t('al.assignedDept'), deptById(selected.detection.department).name],
                      [t('al.escalation'), selected.escalationDepartment ? deptById(selected.escalationDepartment).name : '—'],
                      [t('al.operator'), selected.assignedOperator ?? t('al.unassigned')],
                      [t('common.deadline'), remTime(selected.responseDeadline)],
                    ].map(([k, v]) => (
                      <div key={k} className="row-between" style={{ fontSize: 12.5 }}>
                        <span className="muted">{k}</span>
                        <b style={{ textAlign: 'right', maxWidth: 200 }}>{v}</b>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card style={{ padding: 14 }}>
                  <div className="tiny upper muted" style={{ marginBottom: 8 }}>{t('al.responseActions')}</div>
                  <div className="stack" style={{ gap: 8 }}>
                    <Button size="sm" disabled={['assigned', 'in_progress', 'resolved', 'overdue', 'escalated'].includes(selected.status)} onClick={() => act(t('al.toastAck'), () => store.acknowledgeAlert(selected.id))}>
                      <IconCheck size={13} /> {t('al.ackAccept')}
                    </Button>
                    <div className="row" style={{ gap: 8 }}>
                      <select className="select" value={operator} onChange={(e) => setOperator(e.target.value)} style={{ flex: 1 }}>
                        <option value="">{t('al.assignOp')}</option>
                        {selOp.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <Button size="sm" variant="secondary" disabled={!operator} onClick={() => operator && act(t('al.assignedTo', { operator }), () => store.assignOperator(selected.id, operator))}>{t('al.assign')}</Button>
                    </div>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <Button size="sm" variant="secondary" onClick={() => act(t('al.toastProgress'), () => store.setAlertStatus(selected.id, 'in_progress'))}>{t('al.btnProgress')}</Button>
                      <Button size="sm" variant="secondary" onClick={() => act(t('al.toastVerify'), () => store.requestVerification(selected.id))}>{t('al.btnVerify')}</Button>
                      <Button size="sm" variant="outline" onClick={() => act(t('st.escalated'), () => store.escalateAlert(selected.id))}>{t('al.escalate')}</Button>
                    </div>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <Button size="sm" variant="danger" onClick={() => act(t('al.toastResolved'), () => store.resolveAlert(selected.id))}>{t('al.btnResolve')}</Button>
                      <Button size="sm" variant="primary" disabled={!['resolved', 'manual_verification'].includes(selected.status)} onClick={() => act(t('al.toastResVerified'), () => store.verifyAlert(selected.id))}>{t('al.verifyres')}</Button>
                    </div>
                    <Link to={`detail/${selected.detectionId}`} className="btn btn-secondary btn-sm">{t('al.openCase')} <IconDoc size={13} /></Link>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}