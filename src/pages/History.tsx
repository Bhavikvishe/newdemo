import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, CLASS_META, fmtCoordinate, fmtDT, timeAgo, toCSV, download } from '../lib/mock';
import type { DetectionReportSource } from '../lib/mock';
import { clsLabel, riskLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { getCachedImage } from '../lib/detect';
import { PageHead, Card, Button, RiskBadge, ClassBadge, StatusBadge, Select, EmptyState, Modal, DetectionReportActions } from '../lib/ui';
import { Link } from '../lib/router';
import { IconDoc, IconSearch, IconTrash } from '../components/Icons';
import type { Detection, RiskLevel } from '../types';

const CATS = [
  { id: 'all', key: 'common.all' },
  { id: 'debris', key: 'his.cat.debris' },
  { id: 'anomaly', key: 'his.cat.anomalies' },
  { id: 'infrastructure', key: 'his.cat.infrastructure' },
  { id: 'safety', key: 'his.cat.safety' },
  { id: 'marine-life', key: 'his.cat.marineLife' },
];

export function HistoryPage() {
  const store = useStore();
  const { detections, alerts, language } = store;
  const t = makeT(language);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('<all>');
  const [cat, setCat] = useState('all');
  const [risk, setRisk] = useState('<all>');
  const [limit, setLimit] = useState(200);
  const [showConfirm, setShowConfirm] = useState(false);

  const framed = useMemo(() => {
    const m = new Map<string, string>();
    detections.slice(0, 40).forEach((d) => m.set(d.id, renderFrame(d, { width: 160 }, language)));
    return m;
  }, [detections, language]);

  const rows = useMemo(() => {
    return detections
      .filter((d) => {
        if (cls !== '<all>' && d.className !== cls) return false;
        if (cat !== 'all' && CLASS_META[d.className].category !== cat) return false;
        if (risk !== '<all>' && d.riskLevel !== risk) return false;
        if (q.trim()) {
          const s = q.trim().toLowerCase();
          return d.id.toLowerCase().includes(s) || d.className.includes(s) || d.department.includes(s);
        }
        return true;
      })
      .slice(0, limit);
  }, [detections, cls, cat, risk, q, limit]);

  const statusFor = (d: Detection) => alerts.find((a) => a.detectionId === d.id)?.status;

  const exportCsv = () => {
    const data = rows.map((d) => ({
      id: d.id,
      class: d.className,
      confidence: d.confidence.toFixed(3),
      risk: d.riskLevel,
      risk_score: d.riskScore,
      lat: d.gps.latitude.toFixed(5),
      lng: d.gps.longitude.toFixed(5),
      length_m: d.estimatedSize.length,
      weight_kg: `${d.estimatedWeight.min}–${d.estimatedWeight.max}`,
      department: d.department,
      detection_time: d.detectionTime,
      verified: d.verificationStatus,
    }));
    download('oceonix-history.csv', toCSV(data), 'text/csv');
    store.addToast({ kind: 'success', title: t('his.exported'), text: t('his.exportedText', { count: rows.length }) });
  };

  return (
    <div>
      <PageHead
        kicker={t('his.title')}
        title={t('nav.history')}
        sub={t('his.sub', { count: detections.length })}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Button
              variant="secondary"
              onClick={exportCsv}
              disabled={detections.length === 0}
            >
              <IconDoc size={15} /> {t('his.export')}
            </Button>
            <Button
              variant="danger"
              onClick={() => setShowConfirm(true)}
              disabled={detections.length === 0}
              title="Clear all detection history"
            >
              <IconTrash size={15} /> Clear History
            </Button>
          </div>
        }
      />

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} width={460}>
          <div style={{ padding: 22 }}>
            <h3 style={{ margin: '0 0 10px', color: 'var(--critical)' }}>Clear Detection History?</h3>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
              This will permanently delete all <b>{detections.length}</b> recorded detections and clear the active history ledger. This action cannot be undone.
            </p>
            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  store.clearDetectionHistory();
                  setShowConfirm(false);
                }}
              >
                Yes, Clear All History
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Card>
        <div className="row wrap" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-soft)', gap: 10 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {CATS.map((c) => (
              <button key={c.id} className={`chip${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{t(c.key)}</button>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 8, marginLeft: 'auto' }}>
            <Select value={cls} onChange={setCls} options={[{ value: '<all>', label: t('his.clsAll') }, ...CLASS_LIST.map((c) => ({ value: c, label: clsLabel(c, language) }))]} />
            <Select value={risk} onChange={setRisk} options={[{ value: '<all>', label: t('his.riskAll') }, ...(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((r) => ({ value: r, label: riskLabel(r, language) }))]} />
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <IconSearch size={14} style={{ color: 'var(--ink-3)' }} />
              <input className="input" placeholder={t('his.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 210 }} />
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title={t('his.emptyTitle')} desc={t('his.emptyDesc')} action={<Button variant="secondary" onClick={() => { setQ(''); setCls('<all>'); setCat('all'); setRisk('<all>'); }}>{t('his.clearFilters')}</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table tbl history-table">
              <thead>
                <tr>
                  <th>{t('his.col.detection')}</th>
                  <th>{t('his.col.object')}</th>
                  <th>{t('common.risk')}</th>
                  <th>{t('his.col.conf')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('his.col.dept')}</th>
                  <th>{t('his.col.position')}</th>
                  <th>{t('his.col.detected')}</th>
                  <th>{t('common.export')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const st = statusFor(d);
                  const reportSource: DetectionReportSource = {
                    id: d.id,
                    imageId: d.imageId,
                    createdAt: d.createdAt,
                    predictions: d.predictions ?? [],
                    detection: d,
                    status: 'completed',
                    selectedIndex: 0,
                  };
                  return (
                    <tr key={d.id}>
                      <td>
                        <Link to={`detail/${d.id}`} className="row history-detection-link" style={{ gap: 10 }}>
                          {d.imageUrl || getCachedImage(d.id) || getCachedImage(d.imageId) || framed.has(d.id) ? (
                            <img
                              className="sonimg thumb"
                              src={d.imageUrl || getCachedImage(d.id) || getCachedImage(d.imageId) || framed.get(d.id)}
                              alt=""
                              width={44}
                              height={28}
                              style={{ objectFit: 'cover', borderRadius: 4 }}
                            />
                          ) : (
                            <span style={{ width: 44 }} />
                          )}
                          <span>
                            <b className="mono" style={{ fontSize: 12 }}>{d.id}</b>
                            <div className="mono tiny muted">{timeAgo(d.detectionTime, language)}</div>
                          </span>
                        </Link>
                      </td>
                      <td><ClassBadge cls={d.className} /></td>
                      <td><RiskBadge risk={d.riskLevel} /></td>
                      <td className="mono tiny">{Math.round(d.confidence * 100)}%</td>
                      <td>{st ? <StatusBadge status={st} /> : <span className="badge b-teal">{t('his.monitor')}</span>}</td>
                      <td className="tiny">{CLASS_META[d.className].category === 'marine-life' ? t('his.oceanSurvey') : d.department.replace(/-/g, ' ')}</td>
                      <td className="mono tiny muted">{fmtCoordinate(d.gps.latitude, d.gps.longitude)}</td>
                      <td className="mono tiny muted">{fmtDT(d.detectionTime)}</td>
                      <td className="history-actions"><DetectionReportActions source={reportSource} compact /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="row-between" style={{ padding: '10px 14px', borderTop: '1px solid var(--line-faint)', color: 'var(--ink-3)', fontSize: 11.5 }}>
          <span>{t('his.pagination', { shown: rows.length, total: detections.length, limit })}</span>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 200)}>{t('his.loadMore')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}