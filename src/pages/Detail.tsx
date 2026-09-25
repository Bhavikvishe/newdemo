import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_META, deptById, fmtCoordinate, fmtDT, fmtSize, fmtWeight, pct, remTime, OPERATORS } from '../lib/mock';
import type { DetectionReportSource } from '../lib/mock';
import { alertStatusLabel, categoryLabel, clsLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { getCachedImage } from '../lib/detect';
import { PageHead, Card, CardHead, Button, RiskBadge, StatusBadge, Tag, Kv, EmptyState, DetectionReportActions } from '../lib/ui';
import { Link, matchRoute, useHashRoute } from '../lib/router';
import { IconArrowRight, IconCheck, IconDoc, IconNote } from '../components/Icons';
import { WeatherReport } from '../components/Weather';

const PROGRESS_STATUS = ['in_progress', 'resolved', 'overdue', 'escalated'];

export function DetailPage() {
  const store = useStore();
  const { user, language } = store;
  const t = makeT(language);
  const path = useHashRoute();
  const { id } = matchRoute(path);

  const det = useMemo(() => store.detections.find((d) => d.id === id), [store.detections, id]);
  const alert = useMemo(() => store.alerts.find((a) => a.detectionId === id), [store.alerts, id]);

  const [operator, setOperator] = useState('');
  const [note, setNote] = useState('');

  if (!det) {
    return (
      <div>
        <PageHead kicker={t('detail.kickerCase')} title={t('detail.notFound')} sub={t('detail.notFoundSub')} />
        <EmptyState title={t('detail.noSuchCase')} desc={t('detail.noRecordMatch', { id })} action={<Link to="history" className="btn btn-secondary">{t('detail.backToHistory')}</Link>} />
      </div>
    );
  }

  const meta = CLASS_META[det.className];
  const isMine = user?.department === det.department;
  const realImage = det.imageUrl || getCachedImage(det.id) || getCachedImage(det.imageId);
  const frame = realImage || renderFrame(det, { width: 640 }, language);
  const isHuman = det.className === 'human';
  const isMarine = meta.category === 'marine-life';

  const act = (label: string, fn: () => void) => {
    fn();
    store.addToast({ kind: 'success', title: t('detail.actionApplied'), text: label });
  };

  const operatorList = OPERATORS[det.department];
  const reportSource: DetectionReportSource = {
    id: det.id,
    imageId: det.imageId,
    createdAt: det.createdAt,
    predictions: det.predictions ?? [],
    detection: det,
    status: 'completed',
    selectedIndex: 0,
  };

  return (
    <div>
      <PageHead
        kicker={t(isMarine ? 'detail.kickerMonitor' : 'detail.kickerCase')}
        title={
          <span className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span>{clsLabel(det.className, language)}</span>
            <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 15, fontWeight: 500 }}>{det.id}</span>
          </span>
        }
        sub={`${categoryLabel(meta.category, language)} · ${pct(det.confidence)} ${t('common.confidence').toLowerCase()} · ${fmtCoordinate(det.gps.latitude, det.gps.longitude)}`}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <RiskBadge risk={det.riskLevel} />
            {alert && <StatusBadge status={alert.status} />}
            <DetectionReportActions source={reportSource} />
          </div>
        }
      />

      {alert?.interdepartmentalAid && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.12), rgba(2, 6, 12, 0.95))',
            border: '1.5px solid rgba(0, 240, 255, 0.45)',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 4px 16px rgba(0, 240, 255, 0.12)',
          }}
        >
          <div>
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span className="badge b-accent" style={{ fontSize: 10.5, fontWeight: 700 }}>
                ⚡ INTERDEPARTMENTAL MUTUAL AID ACTIVE
              </span>
              <b style={{ fontSize: 13.5 }}>
                Transferred: {deptById(alert.interdepartmentalAid.fromDepartment).name} → {deptById(alert.interdepartmentalAid.toDepartment).name}
              </b>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)' }}>
              Reassigned by System Administrator to minimize department workload and accelerate operational clearance.
              Reason: <em>{alert.interdepartmentalAid.reason}</em>
            </p>
          </div>

          <div className="row wrap" style={{ gap: 8 }}>
            <span className="badge b-plain" style={{ fontSize: 11 }}>
              Assigned Specialist: {alert.assignedOperator ?? alert.interdepartmentalAid.targetOperator}
            </span>
            <span className="tiny muted">{fmtDT(alert.interdepartmentalAid.transferredAt)}</span>
          </div>
        </div>
      )}

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-7 stack" style={{ gap: 16 }}>
          <Card>
            <CardHead
              kt={det.isRealModel ? 'REAL YOLO MODEL (best.pt)' : t('detail.sonarRecord')}
              title={t('detail.detectedObject')}
              right={
                <span className="badge b-accent">
                  {det.isRealModel
                    ? `AI · best.pt @ conf ${(det.confidence * 100).toFixed(1)}%`
                    : t('detail.aiModel', { model: meta.aiModel })}
                </span>
              }
            />
            <div
              className="sonimg"
              style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#050b14',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: 280,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  maxWidth: '100%',
                  lineHeight: 0,
                }}
              >
                <img
                  src={frame}
                  alt={t('detail.sonarFrameAlt')}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '65vh',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                  }}
                />
                {det.predictions && det.predictions.length > 0 ? (
                  det.predictions.map((p, idx) => {
                    const isNearRight = (p.bbox.x + (p.bbox.width || 0)) > 0.65;
                    const isNearTop = p.bbox.y < 0.1;
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
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${det.boundingBox.x * 100}%`,
                      top: `${det.boundingBox.y * 100}%`,
                      width: `${det.boundingBox.width * 100}%`,
                      height: `${det.boundingBox.height * 100}%`,
                      border: '2px solid var(--accent)',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        bottom: det.boundingBox.y < 0.1 ? 'auto' : '100%',
                        top: det.boundingBox.y < 0.1 ? '100%' : 'auto',
                        left: (det.boundingBox.x + det.boundingBox.width) > 0.65 ? 'auto' : 0,
                        right: (det.boundingBox.x + det.boundingBox.width) > 0.65 ? 0 : 'auto',
                        background: 'rgba(2,6,12,0.92)',
                        color: 'var(--accent)',
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: det.boundingBox.y < 0.1 ? '0 0 3px 3px' : 3,
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                        lineHeight: 'normal',
                      }}
                    >
                      {det.rawLabel || clsLabel(det.className, language)} {(det.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="row-between" style={{ position: 'absolute', top: 8, left: 8, right: 8, pointerEvents: 'none', zIndex: 10 }}>
                <span className="badge b-accent">
                  {det.isRealModel
                    ? 'REAL MODEL DETECTION'
                    : t(meta.category === 'marine-life' ? 'detail.badgeMonitoring' : 'detail.badgeDebrisAnomaly')}
                </span>
                <span className="badge b-plain">
                  {(det.rawLabel || clsLabel(det.className, language)).toUpperCase()} · {pct(det.confidence)}
                </span>
              </div>
            </div>

            {det.predictions && det.predictions.length > 1 && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0, 240, 255, 0.04)', borderRadius: 8, border: '1px solid rgba(0, 240, 255, 0.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Detected Objects ({det.predictions.length})
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {det.predictions.map((p, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        background: 'rgba(2, 6, 12, 0.8)',
                        border: '1px solid rgba(0, 220, 200, 0.4)',
                        color: 'var(--ink-1)',
                      }}
                    >
                      #{idx + 1} <b>{p.label}</b> · {(p.confidence * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isHuman && (
              <div className="card" style={{ marginTop: 12, padding: 12, borderColor: 'var(--critical)', background: 'var(--critical-dim)', color: 'var(--critical)', fontSize: 13 }}>
                <b>{t('detail.safetyCategory').toUpperCase()}</b>
                <span style={{ display: 'block', marginTop: 3 }}>{t('sfy.reply')} {t('detail.responseWindow', { hours: String(meta.hours).padStart(2, '0') })}</span>
              </div>
            )}
            {isMarine && (
              <div className="card" style={{ marginTop: 12, padding: 12, borderColor: 'var(--marine)', background: 'var(--marine-dim)', color: 'var(--marine)', fontSize: 13 }}>
                <b>{t('risk.marine').toUpperCase()}</b>
                <span style={{ display: 'block', marginTop: 3 }}>{t('detail.marineNote')}</span>
              </div>
            )}

            <div className="grid cols-12" style={{ marginTop: 16, gap: 8 }}>
              <div className="span-4"><Kv k={t('common.confidence')} v={pct(det.confidence)} mono /></div>
              <div className="span-4"><Kv k={t('detail.riskScore')} v={det.riskScore} mono /></div>
              <div className="span-4"><Kv k={t('detail.detectionTime')} v={fmtDT(det.detectionTime)} mono /></div>
              <div className="span-6"><Kv k={t('detail.estimatedSize')} v={fmtSize(det.estimatedSize)} mono /></div>
              <div className="span-6"><Kv k={t('detail.estimatedWeight')} v={fmtWeight(det.estimatedWeight)} mono /></div>
              <div className="span-6"><Kv k={t('detail.gpsPosition')} v={fmtCoordinate(det.gps.latitude, det.gps.longitude)} mono /></div>
              <div className="span-6"><Kv k={t('detail.gpsAccuracy')} v={`±${det.gps.accuracy ?? 3} m`} mono /></div>
              <div className="span-12"><Kv k={t('detail.objectNotes')} v={det.notes} /></div>
            </div>
          </Card>

          <WeatherReport lat={det.gps.latitude} lng={det.gps.longitude} task={{ riskLevel: det.riskLevel, responseDeadline: det.responseDeadline }} />

          <Card>
            <CardHead kt={t('detail.logistics')} title={t('detail.equipmentRequirements')} right={<span className="badge b-plain">{t('detail.requestedCount', { n: (alert?.equipmentRequested ?? []).length })}</span>} />
            <div className="stack" style={{ gap: 8 }}>
              {meta.equipment.map((e) => {
                const req = alert?.equipmentRequested.find((r) => r.equipment === e);
                return (
                  <div key={e} className="row-between" style={{ padding: '9px 12px', border: '1px solid var(--line-faint)', borderRadius: 10, fontSize: 13 }}>
                    <span className="row" style={{ gap: 9 }}>
                      <IconDoc size={14} style={{ color: 'var(--ink-3)' }} />
                      {e}
                    </span>
                    {req ? (
                      <span className="badge b-teal"><span className="dot" /> {req.status.toUpperCase()}</span>
                    ) : (
                      <span className="tiny muted">{t('detail.notRequested')}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {alert && isMine && !isMarine && (
              <Button variant="secondary" style={{ marginTop: 14 }} size="sm" onClick={() => act(t('detail.equipRequestSent'), () => store.requestEquipment(alert.id))}>
                {t('detail.requestFirstLine', { equipment: meta.equipment.slice(0, 2).join(' + ') })}
              </Button>
            )}
          </Card>
        </div>

        <div className="span-5 stack" style={{ gap: 16 }}>
          <Card>
            <CardHead
              kt={t('detail.routing')}
              title={t('detail.routingPath')}
              right={<span className="badge b-accent"><span className="dot" /> {t('al.routed')}</span>}
            />
            <div className="route-viz">
              <div className="rv-seg">
                <span className="rv-dot" />
                <div><b>OCEONIX AI</b><span>{t('detail.sonarDetection')} · {categoryLabel(meta.category, language)}</span></div>
              </div>
              <div className="rv-line" />
              <div className="rv-seg on">
                <span className="rv-dot" style={{ background: meta.color }} />
                <div>
                  <b>{deptById(det.department).name}</b>
                  <span>{t('detail.primary')} · {t('common.deadline')} {remTime(det.responseDeadline)}</span>
                </div>
                {isMine && <Tag kind="rule">{t('detail.yourDept')}</Tag>}
              </div>
              {meta.escalation && (
                <>
                  <div className="rv-line" />
                  <div className="rv-seg">
                    <span className="rv-dot" />
                    <div><b>{deptById(meta.escalation).name}</b><span>{t('detail.escalationLane')}</span></div>
                  </div>
                </>
              )}
            </div>
            {alert && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--line-faint)', paddingTop: 12 }}>
                <Kv k={t('detail.alertReference')} v={alert.alertId} mono />
                <Kv k={t('common.status')} v={alertStatusLabel(alert.status, language)} />
                {alert.assignedOperator && <Kv k={t('detail.operator')} v={alert.assignedOperator} />}
                {alert.acknowledgedAt && <Kv k={t('st.acknowledged')} v={fmtDT(alert.acknowledgedAt)} mono />}
                {alert.resolvedAt && <Kv k={t('st.resolved')} v={fmtDT(alert.resolvedAt)} mono />}
                {alert.verifiedAt && <Kv k={t('st.verified')} v={fmtDT(alert.verifiedAt)} mono />}
                {alert.interdepartmentalAid && (
                  <>
                    <Kv k="Mutual Aid Origin" v={deptById(alert.interdepartmentalAid.fromDepartment).name} />
                    <Kv k="Aid Justification" v={alert.interdepartmentalAid.reason} />
                  </>
                )}
              </div>
            )}
          </Card>

          {alert && !isMarine && (
            <Card>
              <CardHead kt={t('al.responses')} title={t('detail.caseActions')} />
              {isMine ? (
                <div className="stack" style={{ gap: 10 }}>
                  <ActionGrid
                    label={t('detail.ackAcceptCase')}
                    desc={t('detail.claimThisAlert')}
                    onClick={() => act(t('detail.caseAccepted'), () => store.acknowledgeAlert(alert.id, alert.assignedOperator ?? undefined))}
                    disabled={PROGRESS_STATUS.includes(alert.status)}
                    tone="accent"
                  />
                  <div className="row" style={{ gap: 8 }}>
                    <select className="select" value={operator} onChange={(e) => setOperator(e.target.value)} style={{ flex: 1 }}>
                      <option value="">{t('detail.assignOpOpt')}</option>
                      {operatorList.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <Button variant="secondary" size="sm" disabled={!operator} onClick={() => operator && act(t('detail.assignedTo', { operator }), () => store.assignOperator(alert.id, operator))}>{t('detail.assign')}</Button>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Button size="sm" variant="secondary" onClick={() => act(t('detail.markedInProgress'), () => store.setAlertStatus(alert.id, 'in_progress'))} disabled={!['assigned', 'acknowledged', 'unacknowledged', 'new'].includes(alert.status)}>
                      {t('st.in_progress')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => act(t('detail.verificationRequested'), () => store.requestVerification(alert.id))}>
                      {t('al.verify')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(t('detail.escalatedNextLane'), () => store.escalateAlert(alert.id))}>
                      {t('al.escalate')}
                    </Button>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Button size="sm" variant="danger" onClick={() => act(t('detail.markedResolved'), () => store.resolveAlert(alert.id))} disabled={alert.status === 'resolved'}>
                      {t('al.resolve')}
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => alert.status === 'resolved' ? act(t('detail.resolutionVerified'), () => store.verifyAlert(alert.id)) : act(t('detail.verifiedClosed'), () => store.verifyAlert(alert.id))} disabled={!['resolved', 'manual_verification'].includes(alert.status)}>
                      {t('al.verifyres')}
                    </Button>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input" placeholder={t('detail.addNotePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { act(t('detail.noteRecorded'), () => store.addNote(alert.id, note)); setNote(''); } }} />
                    <Button variant="secondary" size="sm" disabled={!note.trim()} onClick={() => { act(t('detail.noteRecorded'), () => store.addNote(alert.id, note)); setNote(''); }}><IconNote size={14} /></Button>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
                  {t('detail.belongsTo')}<b style={{ color: 'var(--ink-2)' }}>{deptById(det.department).name}</b>{t('detail.readOnlyHint')}
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <Link to="department" className="btn btn-secondary btn-sm"><IconArrowRight size={13} /> {t('nav.mydept')}</Link>
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHead kt={t('detail.lifecycle')} title={t('detail.timeline')} />
            {alert ? (
              <div className="timeline">
                {alert.timeline.map((ev, i) => (
                  <div key={ev.id} className={`tl-item done${i === alert.timeline.length - 1 ? ' now' : ''}`}>
                    <b>{ev.title}</b>
                    <p>{ev.description}</p>
                    <span className="tm">{fmtDT(ev.timestamp)} · {ev.actor} · {deptById(ev.department).shortName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="timeline">
                <div className="tl-item done">
                  <b>{t('detail.sonarDetRecorded')}</b>
                  <p>{t('detail.monitorLedgerEntry')}</p>
                  <span className="tm">{fmtDT(det.detectionTime)} · OCEONIX AI</span>
                </div>
                <div className="tl-item done">
                  <b>{t('detail.loggedSurvey')}</b>
                  <p>{t('detail.mantaObservation')}</p>
                  <span className="tm">{fmtDT(det.detectionTime)} · OCEONIX AI</span>
                </div>
              </div>
            )}
          </Card>

          {alert && alert.departmentNotes.length > 0 && (
            <Card>
              <CardHead kt={t('detail.internal')} title={t('detail.departmentNotes')} />
              <div className="stack" style={{ gap: 10 }}>
                {alert.departmentNotes.map((n) => (
                  <div key={n.id} className="stack" style={{ gap: 3, padding: '9px 12px', background: 'var(--line-faint)', borderRadius: 10, fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink-2)' }}>{n.content}</span>
                    <span className="row" style={{ gap: 10, color: 'var(--ink-3)', fontSize: 10.5 }}>
                      <b className="row" style={{ gap: 6 }}><IconNote size={11} /> {n.author}</b>
                      <span className="mono">{fmtDT(n.timestamp)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionGrid({ label, desc, onClick, disabled, tone }: { label: string; desc: string; onClick: () => void; disabled?: boolean; tone: string }) {
  return (
    <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'space-between', padding: '10px 14px' }} onClick={onClick} disabled={disabled} title={desc}>
      <span className="row" style={{ gap: 9 }}>
        <IconCheck size={14} style={{ color: `var(--${tone})` }} />
        <span className="stack" style={{ gap: 1, textAlign: 'left', lineHeight: 1.3 }}>
          <b style={{ fontSize: 12.5 }}>{label}</b>
          <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 400 }}>{desc}</span>
        </span>
      </span>
      <IconArrowRight size={13} style={{ color: 'var(--ink-3)' }} />
    </button>
  );
}