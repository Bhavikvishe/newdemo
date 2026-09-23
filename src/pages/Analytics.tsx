import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, CLASS_META, DEPARTMENTS, SITES } from '../lib/mock';
import { clsLabel, riskColor, riskLabel } from '../lib/labels';
import { PageHead, Card, CardHead } from '../lib/ui';
import { BarChart, Donut, HBar, LineChart } from '../lib/charts';
import { Link } from '../lib/router';
import { IconArrowRight } from '../components/Icons';

const OPEN = ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'];

export function AnalyticsPage() {
  const store = useStore();
  const { detections, alerts, language } = store;
  const t = makeT(language);

  const data = useMemo(() => {
    const byClass = Object.fromEntries(CLASS_LIST.map((c) => [c, 0])) as Record<string, number>;
    const byRisk = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
    const confBins = [0, 0, 0, 0, 0];
    detections.forEach((d) => {
      byClass[d.className] += 1;
      byRisk[d.riskLevel] += 1;
      const conf = Math.floor(d.confidence * 100);
      if (conf < 60) confBins[0]++;
      else if (conf < 70) confBins[1]++;
      else if (conf < 80) confBins[2]++;
      else if (conf < 90) confBins[3]++;
      else confBins[4]++;
    });

    const now = Date.now();
    const weeks: { label: string; value: number }[] = [];
    for (let w = 11; w >= 0; w--) {
      const start = new Date(now - w * 7 * 24 * 3600e3);
      const end = start.getTime() + 7 * 24 * 3600e3;
      const count = detections.filter((d) => {
        const ts = new Date(d.detectionTime).getTime();
        return ts >= start.getTime() && ts < end;
      }).length;
      weeks.push({ label: `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`, value: count });
    }

    const open = alerts.filter((a) => OPEN.includes(a.status));
    const resolved = alerts.filter((a) => a.status === 'resolved');

    const bySite = new Map<string, { label: string; value: number; color: string }>();
    detections.forEach((d) => {
      let site = SITES[0];
      let best = 1;
      SITES.forEach((s) => {
        const dist = Math.abs(s.lat - d.gps.latitude) + Math.abs(s.lng - d.gps.longitude);
        if (dist < best) { best = dist; site = s; }
      });
      const key = site.name;
      const hit = bySite.get(key);
      if (hit) hit.value++;
      else bySite.set(key, { label: key.split('—')[1]?.trim() ?? key.split('–')[1]?.trim() ?? key, value: 1, color: 'var(--accent)' });
    });

    const deptResp = DEPARTMENTS.map((d) => {
      const rs = alerts.filter((a) => a.detection.department === d.id && a.status === 'resolved' && a.resolvedAt);
      const avg = rs.length ? rs.reduce((s, a) => s + (new Date(a.resolvedAt!).getTime() - new Date(a.detection.detectionTime).getTime()) / 3600e3, 0) / rs.length : 0;
      return { label: d.shortName, value: +avg.toFixed(1), color: d.color };
    });

    const eq = new Map<string, number>();
    detections.forEach((d) => d.recommendedEquipment.forEach((e) => eq.set(e, (eq.get(e) ?? 0) + 1)));
    const eqList = Array.from(eq.entries())
      .map(([k, v]) => ({ label: k, value: v, color: 'var(--medium)' }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return { byClass, byRisk, confBins, weeks, bySite: Array.from(bySite.values()).sort((a, b) => b.value - a.value).slice(0, 10), deptResp, eqList, open, resolved };
  }, [detections, alerts]);

  const resolvedVsPending = [
    { label: t('anx.resolved'), value: data.resolved.length, color: 'var(--teal)' },
    { label: t('anx.open'), value: data.open.length, color: 'var(--high)' },
  ];

  return (
    <div>
      <PageHead
        kicker={t('nav.analytics')}
        title={t('anx.head')}
        sub={t('anx.sub')}
        right={<Link to="reports" className="btn btn-secondary"><IconArrowRight size={15} /> {t('anx.generate')}</Link>}
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
        <div className="span-8">
          <Card className="h-full">
            <CardHead kt={t('anx.ktWindow')} title={t('anx.trend')} />
            <LineChart series={[{ name: t('anx.detections'), color: 'var(--accent)', values: data.weeks.map((w) => w.value) }]} labels={data.weeks.map((w) => w.label)} height={240} />
          </Card>
        </div>
        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('anx.ktOutcome')} title={t('anx.rvp')} />
            <Donut data={resolvedVsPending} centerTitle={t('anx.cases')} centerValue={data.open.length + data.resolved.length} size={180} />
          </Card>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('anx.ktObject')} title={t('anx.object')} />
            <Donut data={CLASS_LIST.map((c) => ({ label: clsLabel(c, language).split(' ')[0], value: data.byClass[c], color: CLASS_META[c].color }))} size={170} centerTitle={t('anx.total')} centerValue={detections.length} />
          </Card>
        </div>
        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('anx.ktSeverity')} title={t('anx.risk')} />
            <BarChart data={(['critical', 'high', 'medium', 'low'] as const).map((r) => ({ label: riskLabel(r, language), value: data.byRisk[r], color: riskColor(r) }))} height={220} />
          </Card>
        </div>
        <div className="span-4">
          <Card className="h-full">
            <CardHead kt={t('anx.ktModel')} title={t('anx.conf')} />
            <BarChart data={[
              { label: t('anx.confUnder', { v: 60 }), value: data.confBins[0], color: 'var(--ink-3)' },
              { label: t('anx.confRange', { a: 60, b: 69 }), value: data.confBins[1], color: 'var(--medium)' },
              { label: t('anx.confRange', { a: 70, b: 79 }), value: data.confBins[2], color: 'var(--high)' },
              { label: t('anx.confRange', { a: 80, b: 89 }), value: data.confBins[3], color: 'var(--accent)' },
              { label: t('anx.confOver', { v: 90 }), value: data.confBins[4], color: 'var(--teal)' },
            ]} height={220} />
          </Card>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('anx.ktGrid')} title={t('anx.geo')} />
            <HBar rows={data.bySite} />
          </Card>
        </div>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('anx.ktDepartment')} title={t('anx.resp')} />
            <HBar rows={data.deptResp} format={(v) => t('anx.hours', { v })} />
            <div className="tiny muted" style={{ marginTop: 10 }}>{t('anx.avgNote')}</div>
          </Card>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginTop: 16, gap: 16 }}>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('anx.ktLoad')} title={t('anx.deptload')} />
            <HBar rows={DEPARTMENTS.map((d) => ({
              label: d.shortName,
              value: data.open.filter((a) => a.detection.department === d.id).length,
              color: d.color,
            }))} />
          </Card>
        </div>
        <div className="span-6">
          <Card className="h-full">
            <CardHead kt={t('anx.ktLogistics')} title={t('anx.equip')} />
            <HBar rows={data.eqList} />
          </Card>
        </div>
      </div>
    </div>
  );
}