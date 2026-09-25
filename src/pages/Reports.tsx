import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, CLASS_META, DEPARTMENTS, deptById, fmtDT, toCSV, toJSON, download, downloadReportPDF } from '../lib/mock';
import { clsLabel, riskLabel } from '../lib/labels';
import { PageHead, Card, CardHead, Button, Modal, ModalHead, Select, Tag, EmptyState } from '../lib/ui';
import { IconDoc, IconDownload, IconRefresh } from '../components/Icons';
import type { DepartmentId } from '../types';

interface Report {
  id: string;
  title: string;
  window: string;
  dept: string;
  createdAt: string;
  body: string[];
  stats: [string, string][];
  rows: Record<string, string>[];
  head: string[];
}

export function ReportsPage() {
  const store = useStore();
  const { detections, alerts, language } = store;
  const t = makeT(language);
  const [window, setWindow] = useState('last7');
  const [deptFilter, setDeptFilter] = useState<DepartmentId | 'all'>('all');
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState<Report | null>(null);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - (window === 'last24' ? 24 : window === 'last7' ? 7 : window === 'last30' ? 30 : 90) * 3600e3;
    return detections.filter((d) => new Date(d.detectionTime).getTime() >= cutoff && (deptFilter === 'all' || d.department === deptFilter));
  }, [detections, window, deptFilter]);

  const genReport = () => {
    const byClass = Object.fromEntries(CLASS_LIST.map((c) => [c, 0])) as Record<string, number>;
    const byRisk = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
    filtered.forEach((d) => {
      byClass[d.className] += 1;
      byRisk[d.riskLevel] += 1;
    });
    const openAlerts = alerts.filter((a) => ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'].includes(a.status) && (deptFilter === 'all' || a.detection.department === deptFilter));
    const resolved = alerts.filter((a) => a.status === 'resolved' && (deptFilter === 'all' || a.detection.department === deptFilter));

    const windowLabel = window === 'last24' ? t('rpt.win24') : window === 'last7' ? t('rpt.win7') : window === 'last30' ? t('rpt.win30') : t('rpt.win90');
    const deptLabel = deptFilter === 'all' ? t('rpt.allDepts') : deptById(deptFilter).name;
    const heads = [t('rpt.col.objectClass'), t('rpt.col.count'), t('common.risk'), t('rpt.col.avgConf'), t('rpt.col.topRegion')];
    const maxHits = Math.max(...Object.values(byClass));
    const topClass = CLASS_LIST.find((c) => byClass[c] === maxHits);

    const r: Report = {
      id: `RP-${new Date().getTime().toString(36).toUpperCase()}`,
      title: t('rpt.cohortTitle'),
      window: windowLabel,
      dept: deptLabel,
      createdAt: new Date().toISOString(),
      stats: [
        [t('rpt.statGenerated'), fmtDT(new Date().toISOString())],
        [t('rpt.statWindow'), windowLabel],
        [t('common.department'), deptLabel],
        [t('rpt.statDetections'), String(filtered.length)],
        [t('rpt.statOpenAlerts'), String(openAlerts.length)],
        [t('st.resolved'), String(resolved.length)],
        [t('rpt.statCritical'), String(byRisk.critical)],
        [t('rpt.statHigh'), String(byRisk.high)],
      ],
      head: heads,
      rows: CLASS_LIST.map((c) => {
        const ds = filtered.filter((d) => d.className === c);
        const avg = ds.length ? (ds.reduce((s, d) => s + d.confidence, 0) / ds.length * 100).toFixed(1) : '—';
        return { [heads[0]]: clsLabel(c, language), [heads[1]]: String(ds.length), [heads[2]]: riskLabel(CLASS_META[c].riskBase, language), [heads[3]]: `${avg}%`, [heads[4]]: deptById(ds[0]?.department ?? 'marine-operations').shortName };
      })
        .filter((row) => row[heads[1]] !== '0'),
      body: [
        t('rpt.bodyIntro'),
        t('rpt.bodyObjectDist', { n: filtered.length, c: Object.values(byClass).filter(Boolean).length }),
        t('rpt.bodyRiskPosture', { crit: byRisk.critical, high: byRisk.high, med: byRisk.medium, low: byRisk.low }),
        t('rpt.bodyResponseState', { open: openAlerts.length, resolved: resolved.length }),
        t('rpt.bodyClassFindings', { cls: topClass ? clsLabel(topClass, language) : '—', n: maxHits }),
      ],
    };
    setReports((prev) => [r, ...prev]);
    store.addToast({ kind: 'success', title: t('rpt.toastGen'), text: t('rpt.toastGenText', { id: r.id }) });
    setOpen(r);
  };

  const exportReport = (r: Report, fmt: 'csv' | 'json' | 'pdf') => {
    try {
      if (fmt === 'csv') {
        download(`${r.id}.csv`, toCSV(r.rows), 'text/csv');
      } else if (fmt === 'json') {
        download(`${r.id}.json`, toJSON({
          id: r.id,
          title: r.title,
          window: r.window,
          department: r.dept,
          generated_at: r.createdAt,
          stats: Object.fromEntries(r.stats),
          findings: r.body,
          data: r.rows,
        }), 'application/json');
      } else {
        downloadReportPDF({
          id: r.id,
          title: r.title,
          window: r.window,
          department: r.dept,
          generatedAt: fmtDT(r.createdAt),
          metadata: [
            t('rpt.pdfId', { id: r.id }),
            t('rpt.pdfWindow', { window: r.window }),
            t('rpt.pdfDepartment', { dept: r.dept }),
            t('rpt.pdfGenerated', { date: fmtDT(r.createdAt) }),
          ],
          stats: r.stats,
          findings: r.body,
          columns: r.head,
          rows: r.rows,
          labels: {
            keyMetrics: t('rpt.pdfKeyMetrics'),
            findings: t('rpt.pdfFindings'),
            dataTable: t('rpt.pdfDataTable'),
          },
        });
      }
      store.addToast({ kind: 'success', title: t('rpt.toastExport'), text: t('rpt.toastExportText', { file: `${r.id}.${fmt}` }) });
    } catch {
      store.addToast({ kind: 'alert', title: t('common.failed'), text: t('rpt.toastExportError', { file: `${r.id}.${fmt}` }) });
    }
  };

  return (
    <div>
      <PageHead
        kicker={t('rep.title')}
        title={t('nav.reports')}
        sub={t('rpt.sub')}
        right={<Button variant="primary" onClick={genReport}><IconRefresh size={15} /> {t('rpt.generate')}</Button>}
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('rpt.ktSnapshot')} title={t('rpt.snapshot')} />
            <div className="stack" style={{ gap: 10 }}>
              {[
                [t('rpt.statTotal'), String(detections.length)],
                [t('rpt.statOpenAlerts'), String(alerts.filter((a) => ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'].includes(a.status)).length)],
                [t('st.resolved'), String(alerts.filter((a) => a.status === 'resolved').length)],
                [t('rpt.statDepartments'), String(DEPARTMENTS.length)],
              ].map(([k, v]) => (
                <div key={k} className="row-between" style={{ padding: '9px 12px', border: '1px solid var(--line-faint)', borderRadius: 10 }}>
                  <span className="tiny muted">{k}</span><b>{v}</b>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('rpt.ktBuilder')} title={t('rpt.parameters')} />
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <div className="tiny upper muted" style={{ marginBottom: 6 }}>{t('rpt.timeWindow')}</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {[['last24', '24h'], ['last7', '7d'], ['last30', '30d'], ['last90', '90d']].map(([v, l]) => (
                    <button key={v} className={`chip${window === v ? ' on' : ''}`} onClick={() => setWindow(v)}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="tiny upper muted" style={{ marginBottom: 6 }}>{t('rpt.deptScope')}</div>
                <Select value={deptFilter} onChange={(v) => setDeptFilter(v as DepartmentId | 'all')} options={[
                  { value: 'all', label: t('rpt.allDepts') },
                  ...DEPARTMENTS.map((d) => ({ value: d.id, label: d.shortName })),
                ]} />
              </div>
              <Button variant="primary" onClick={genReport}><IconDoc size={15} /> {t('rpt.generateNow')}</Button>
              <div className="tiny muted">{t('rpt.builderHint')}</div>
            </div>
          </Card>
        </div>

        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('rpt.ktHistory')} title={t('rpt.generatedReports')} />
            {reports.length === 0 ? (
              <EmptyState title={t('rpt.emptyTitle')} desc={t('rpt.emptyDesc')} />
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {reports.slice(0, 10).map((r) => (
                  <div key={r.id} className="row-between" style={{ gap: 8, padding: 10, border: '1px solid var(--line-faint)', borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <b className="mono" style={{ fontSize: 12 }}>{r.id}</b>
                      <div className="tiny muted" style={{ marginTop: 2 }}>{r.title} · {r.window} · {r.dept}</div>
                      <div className="mono tiny muted">{fmtDT(r.createdAt)}</div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <Button size="sm" variant="ghost" onClick={() => setOpen(r)}>{t('common.open')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => exportReport(r, 'csv')}>CSV</Button>
                      <Button size="sm" variant="ghost" onClick={() => exportReport(r, 'json')}>JSON</Button>
                      <Button size="sm" variant="ghost" title={t('rep.pdf')} onClick={() => exportReport(r, 'pdf')}><IconDownload size={13} /> PDF</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {open && (
        <Modal onClose={() => setOpen(null)} width={720}>
          <div style={{ padding: '26px 30px' }}>
            <ModalHead kt={t('rpt.ktReport', { window: open.window })} title={open.title} onClose={() => setOpen(null)} />
            <div className="stack" style={{ gap: 10, marginBottom: 18 }}>
              {open.stats.map(([k, v]) => (
                <div key={k} className="row-between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-faint)', fontSize: 12.5 }}>
                  <span className="muted">{k}</span><b className="mono">{v}</b>
                </div>
              ))}
            </div>
            <div className="ploy" style={{ padding: 14, border: '1px solid var(--accent-line)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7, color: 'var(--ink-2)', marginBottom: 16 }}>
              {open.body.map((line, i) => (
                <div key={i} style={line.startsWith('OBJECT') || line.startsWith('RISK') || line.startsWith('RESPONSE') || line.startsWith('CLASS') ? { marginTop: 8, color: 'var(--accent)' } : undefined}>{line}</div>
              ))}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{open.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {open.rows.map((r, i) => (
                    <tr key={i}>{open.head.map((h) => <td key={h}>{r[h]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <Button variant="primary" onClick={() => exportReport(open, 'csv')}><IconDoc size={15} /> {t('rep.csv')}</Button>
              <Button variant="secondary" onClick={() => exportReport(open, 'json')}>JSON</Button>
              <Button variant="secondary" onClick={() => exportReport(open, 'pdf')}><IconDownload size={15} /> {t('rep.pdf')}</Button>
              <Button variant="secondary" onClick={() => setOpen(null)}>{t('common.close')}</Button>
            </div>
          </div>
        </Modal>
      )}

      <div className="row wrap" style={{ marginTop: 16, gap: 8 }}>
        {CLASS_LIST.map((c) => (
          <Tag key={c} kind="est"><span className="legend-dot" style={{ background: CLASS_META[c].color }} /> {clsLabel(c, language)}</Tag>
        ))}
      </div>
    </div>
  );
}