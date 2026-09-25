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
import { getCachedImage } from '../lib/detect';
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
    filtered.forEach((a) => {
      const real =
        a.detection?.imageUrl ||
        getCachedImage(a.detection?.id) ||
        getCachedImage(a.detection?.imageId) ||
        getCachedImage(a.detectionId);
      if (real) {
        m.set(a.detectionId, real);
      } else {
        m.set(a.detectionId, renderFrame(a.detection, { width: 160 }, language));
      }
    });
    if (selected) {
      const realSel =
        selected.detection?.imageUrl ||
        getCachedImage(selected.detection?.id) ||
        getCachedImage(selected.detection?.imageId) ||
        getCachedImage(selected.detectionId);
      if (realSel) {
        m.set(`sel-${selected.detectionId}`, realSel);
      } else {
        m.set(`sel-${selected.detectionId}`, renderFrame(selected.detection, { width: 480 }, language));
      }
    }
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
          <table className="tbl">
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

        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="tbl alerts-table">
            <thead>
              <tr>
                <th style={{ width: '23%' }}>{t('al.thAlert')}</th>
                <th style={{ width: '14%' }}>{t('al.thObject')}</th>
                <th style={{ width: '10%' }}>{t('common.risk')}</th>
                <th style={{ width: '11%' }}>{t('common.status')}</th>
                <th style={{ width: '11%' }}>{t('al.thDept')}</th>
                <th style={{ width: '10%' }}>{t('al.operator')}</th>
                <th style={{ width: '11%' }}>{t('common.deadline')}</th>
                <th style={{ width: '10%' }}>{t('al.thDetected')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const d = a.detection;
                const imgSrc =
                  d.imageUrl ||
                  getCachedImage(d.id) ||
                  getCachedImage(d.imageId) ||
                  getCachedImage(a.detectionId) ||
                  frames.get(a.detectionId);

                return (
                  <tr key={a.id} onClick={() => setSelected(a)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="row" style={{ gap: 12, alignItems: 'center', minWidth: 0 }}>
                        {imgSrc ? (
                          <img
                            className="sonimg thumb alert-thumb"
                            src={imgSrc}
                            alt={clsLabel(d.className, language)}
                            style={{
                              width: 58,
                              height: 38,
                              minWidth: 58,
                              maxWidth: 58,
                              borderRadius: 6,
                              objectFit: 'cover',
                              flexShrink: 0,
                              border: '1px solid var(--line-soft)',
                              background: '#04121c',
                            }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = renderFrame(d, { width: 160 }, language);
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 58,
                              height: 38,
                              minWidth: 58,
                              maxWidth: 58,
                              borderRadius: 6,
                              background: 'var(--panel)',
                              border: '1px solid var(--line-soft)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                            <b className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{a.alertId}</b>
                            {d.isRealModel && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: 'rgba(0, 240, 255, 0.12)',
                                  color: 'var(--accent)',
                                  border: '1px solid rgba(0, 240, 255, 0.3)',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                REAL AI
                              </span>
                            )}
                          </div>
                          <div
                            className="mono tiny muted"
                            title={`Detection: ${d.id}`}
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 155,
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            {d.imageId ? d.imageId : d.id.replace('REAL-BATCH-', 'BATCH-')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><ClsTag cls={d.className} /></td>
                    <td><RiskBadge risk={d.riskLevel} label={riskLabel(d.riskLevel, language)} /></td>
                    <td><Badge tone={statusBadgeClass(a.status)} dot>{alertStatusLabel(a.status, language)}</Badge></td>
                    <td>
                      <span className="row" style={{ gap: 6, fontSize: 12.5, alignItems: 'center' }}>
                        <span className="legend-dot" style={{ background: deptById(d.department).color }} />
                        <span>{deptById(d.department).shortName}</span>
                      </span>
                    </td>
                    <td className="tiny muted">{a.assignedOperator ?? '—'}</td>
                    <td>
                      {a.status === 'resolved' ? (
                        <span className="mono tiny" style={{ color: 'var(--teal)' }}>{t('al.done')}</span>
                      ) : a.overdue || a.status === 'overdue' ? (
                        <span className="mono tiny" style={{ color: 'var(--critical)', fontWeight: 600 }}>{t('st.overdue').toUpperCase()}</span>
                      ) : (
                        <span className="mono tiny" style={{ color: remTime(a.responseDeadline).startsWith('EXPIRED') ? 'var(--critical)' : 'var(--ink-2)' }}>
                          {remTime(a.responseDeadline)}
                        </span>
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
                <div
                  className="sonimg"
                  style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#040d16',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: 220,
                  }}
                >
                  <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0 }}>
                    <img
                      src={
                        selected.detection.imageUrl ||
                        getCachedImage(selected.detection.id) ||
                        getCachedImage(selected.detection.imageId) ||
                        getCachedImage(selected.detectionId) ||
                        frames.get(`sel-${selected.detectionId}`) ||
                        frames.get(selected.detectionId)
                      }
                      alt=""
                      style={{
                        maxWidth: '100%',
                        maxHeight: '44vh',
                        width: 'auto',
                        height: 'auto',
                        display: 'block',
                        borderRadius: 8,
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = renderFrame(selected.detection, { width: 480 }, language);
                      }}
                    />
                    {selected.detection.predictions && selected.detection.predictions.length > 0 ? (
                      selected.detection.predictions.map((p, idx) => {
                        const isNearTop = p.bbox.y < 0.12;
                        const isNearRight = (p.bbox.x + (p.bbox.width || 0)) > 0.7;
                        return (
                          <div
                            key={idx}
                            style={{
                              position: 'absolute',
                              left: `${p.bbox.x * 100}%`,
                              top: `${p.bbox.y * 100}%`,
                              width: `${p.bbox.width * 100}%`,
                              height: `${p.bbox.height * 100}%`,
                              border: idx === 0 ? '2.5px solid var(--accent)' : '2px solid rgba(0, 220, 200, 0.8)',
                              background: idx === 0 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0, 220, 200, 0.05)',
                              boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                              pointerEvents: 'none',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                bottom: isNearTop ? 'auto' : '100%',
                                top: isNearTop ? '100%' : 'auto',
                                left: isNearRight ? 'auto' : 0,
                                right: isNearRight ? 0 : 'auto',
                                background: idx === 0 ? 'var(--accent)' : 'rgba(2,6,12,0.92)',
                                color: idx === 0 ? '#000' : 'var(--accent)',
                                fontWeight: 700,
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: isNearTop ? '0 0 3px 3px' : '3px 3px 0 0',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                lineHeight: 'normal',
                              }}
                            >
                              #{idx + 1} {p.label} {(p.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })
                    ) : selected.detection.boundingBox ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${selected.detection.boundingBox.x * 100}%`,
                          top: `${selected.detection.boundingBox.y * 100}%`,
                          width: `${selected.detection.boundingBox.width * 100}%`,
                          height: `${selected.detection.boundingBox.height * 100}%`,
                          border: '2.5px solid var(--accent)',
                          background: 'rgba(0, 240, 255, 0.12)',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                          pointerEvents: 'none',
                        }}
                      />
                    ) : null}
                  </div>
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