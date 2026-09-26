import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import {
  CLASS_LIST,
  CLASS_META,
  DEPARTMENTS,
  deptById,
  fmtCoordinate,
  fmtDT,
  timeAgo,
  toCSV,
  toJSON,
  download,
  downloadReportPDF,
} from '../lib/mock';
import type { DetectionReportSource } from '../lib/mock';
import { fetchGebcoDepth } from '../lib/gebco';
import { clsLabel, riskLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { getCachedImage } from '../lib/detect';
import {
  PageHead,
  Card,
  CardHead,
  Button,
  RiskBadge,
  ClassBadge,
  StatusBadge,
  Select,
  EmptyState,
  Modal,
  ModalHead,
  DetectionReportActions,
} from '../lib/ui';
import { Link } from '../lib/router';
import {
  IconDoc,
  IconSearch,
  IconTrash,
  IconRefresh,
  IconDownload,
} from '../components/Icons';
import type { DepartmentId, Detection, RiskLevel } from '../types';

const CATS = [
  { id: 'all', key: 'common.all' },
  { id: 'debris', key: 'his.cat.debris' },
  { id: 'anomaly', key: 'his.cat.anomalies' },
  { id: 'infrastructure', key: 'his.cat.infrastructure' },
  { id: 'safety', key: 'his.cat.safety' },
  { id: 'marine-life', key: 'his.cat.marineLife' },
];

const OPEN_ALERT_STATUSES = [
  'new',
  'unacknowledged',
  'pending',
  'assigned',
  'in_progress',
  'manual_verification',
  'overdue',
  'escalated',
];

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) return;

      results[index] = await mapper(
        items[index],
        index,
      );
    }
  };

  const workerCount = Math.min(
    Math.max(1, limit),
    Math.max(1, items.length),
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker(),
    ),
  );

  return results;
}

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
  bathymetryRows: Record<string, string>[];
  bathymetryExportRows: Record<string, string>[];
  bathymetryHead: string[];
  bathymetryStats: [string, string][];
  oceanographyRows: Record<string, string>[];
  oceanographyHead: string[];
}

export function HistoryPage() {
  const store = useStore();
  const { detections, alerts, language } = store;
  const t = makeT(language);

  // ---------------------------------------------------------------------------
  // Detection history state
  // ---------------------------------------------------------------------------

  const [q, setQ] = useState('');
  const [cls, setCls] = useState('<all>');
  const [cat, setCat] = useState('all');
  const [risk, setRisk] = useState('<all>');
  const [limit, setLimit] = useState(200);
  const [showConfirm, setShowConfirm] = useState(false);

  // ---------------------------------------------------------------------------
  // Report state
  // ---------------------------------------------------------------------------

  const [reportWindow, setReportWindow] = useState('last7');
  const [deptFilter, setDeptFilter] =
    useState<DepartmentId | 'all'>('all');
  const [reports, setReports] = useState<Report[]>([]);
  const [openReport, setOpenReport] = useState<Report | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // ---------------------------------------------------------------------------
  // History helpers
  // ---------------------------------------------------------------------------

  const framed = useMemo(() => {
    const m = new Map<string, string>();

    detections
      .slice(0, 40)
      .forEach((d) =>
        m.set(
          d.id,
          renderFrame(
            d,
            { width: 160 },
            language,
          ),
        ),
      );

    return m;
  }, [detections, language]);

  const rows = useMemo(() => {
    return detections
      .filter((d) => {
        if (
          cls !== '<all>' &&
          d.className !== cls
        ) {
          return false;
        }

        if (
          cat !== 'all' &&
          CLASS_META[d.className].category !== cat
        ) {
          return false;
        }

        if (
          risk !== '<all>' &&
          d.riskLevel !== risk
        ) {
          return false;
        }

        if (q.trim()) {
          const s = q.trim().toLowerCase();

          return (
            d.id.toLowerCase().includes(s) ||
            d.className.includes(s) ||
            d.department.includes(s)
          );
        }

        return true;
      })
      .slice(0, limit);
  }, [
    detections,
    cls,
    cat,
    risk,
    q,
    limit,
  ]);

  const statusFor = (d: Detection) =>
    alerts.find(
      (a) => a.detectionId === d.id,
    )?.status;

  const exportHistoryCsv = () => {
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

    download(
      'oceonix-history.csv',
      toCSV(data),
      'text/csv',
    );

    store.addToast({
      kind: 'success',
      title: t('his.exported'),
      text: t('his.exportedText', {
        count: rows.length,
      }),
    });
  };

  // ---------------------------------------------------------------------------
  // Report helpers
  // ---------------------------------------------------------------------------

  const reportDetections = useMemo(() => {
    const hours =
      reportWindow === 'last24'
        ? 24
        : reportWindow === 'last7'
          ? 7 * 24
          : reportWindow === 'last30'
            ? 30 * 24
            : 90 * 24;

    const cutoff =
      Date.now() - hours * 3600e3;

    return detections.filter(
      (d) =>
        new Date(d.detectionTime).getTime() >=
          cutoff &&
        (deptFilter === 'all' ||
          d.department === deptFilter),
    );
  }, [
    detections,
    reportWindow,
    deptFilter,
  ]);

  const generateReport = async () => {
    if (generatingReport) return;

    setGeneratingReport(true);

    try {
      const byClass = Object.fromEntries(
        CLASS_LIST.map((c) => [c, 0]),
      ) as Record<string, number>;

      const byRisk = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      } as Record<string, number>;

      reportDetections.forEach((d) => {
        byClass[d.className] += 1;
        byRisk[d.riskLevel] += 1;
      });

      const openAlerts = alerts.filter(
        (a) =>
          OPEN_ALERT_STATUSES.includes(a.status) &&
          (deptFilter === 'all' ||
            a.detection.department === deptFilter),
      );

      const resolved = alerts.filter(
        (a) =>
          a.status === 'resolved' &&
          (deptFilter === 'all' ||
            a.detection.department === deptFilter),
      );

      const windowLabel =
        reportWindow === 'last24'
          ? t('rpt.win24')
          : reportWindow === 'last7'
            ? t('rpt.win7')
            : reportWindow === 'last30'
              ? t('rpt.win30')
              : t('rpt.win90');

      const deptLabel =
        deptFilter === 'all'
          ? t('rpt.allDepts')
          : deptById(deptFilter).name;

      const heads = [
        t('rpt.col.objectClass'),
        t('rpt.col.count'),
        t('common.risk'),
        t('rpt.col.avgConf'),
        t('rpt.col.topRegion'),
      ];

      const maxHits = Math.max(
        ...Object.values(byClass),
        0,
      );

      const topClass = CLASS_LIST.find(
        (c) => byClass[c] === maxHits,
      );

      /*
       * Depth Analysis is a report-time enrichment. Detection records keep
       * their original GPS coordinates; the report asks the GEBCO service
       * for bathymetry at those coordinates and stores the complete returned
       * provenance so live data is never confused with the synthetic fallback.
       */
      const bathymetryResponses =
        await mapConcurrent(
          reportDetections,
          4,
          async (d) => {
            try {
              return await fetchGebcoDepth(
                d.gps.latitude,
                d.gps.longitude,
                {
                  spanKm: 1.2,
                  samples: 11,
                },
              );
            } catch {
              return null;
            }
          },
        );

      const depthRecords = reportDetections.map(
        (d, index) => {
          const result = bathymetryResponses[index];
          const b = result?.bathymetry;
          const o = result?.oceanography;
          const p = result?.provenance;

          return {
            detection_id: d.id,
            object_class: d.className,
            object_label: clsLabel(
              d.className,
              language,
            ),
            risk: d.riskLevel,
            confidence: `${(
              d.confidence * 100
            ).toFixed(1)}%`,
            latitude: d.gps.latitude.toFixed(5),
            longitude: d.gps.longitude.toFixed(5),
            depth_m:
              b?.depth_m !== undefined
                ? b.depth_m.toFixed(1)
                : '—',
            depth_ft:
              b?.depth_ft !== undefined
                ? b.depth_ft.toFixed(1)
                : '—',
            elevation_m:
              b?.elevation_m !== undefined
                ? b.elevation_m.toFixed(1)
                : '—',
            average_transect_depth_m:
              b?.average_transect_depth_m !==
              undefined
                ? b.average_transect_depth_m.toFixed(1)
                : '—',
            min_depth_m:
              b?.min_depth_m !== undefined
                ? b.min_depth_m.toFixed(1)
                : '—',
            max_depth_m:
              b?.max_depth_m !== undefined
                ? b.max_depth_m.toFixed(1)
                : '—',
            seabed_gradient_deg:
              b?.seabed_gradient_deg !==
              undefined
                ? b.seabed_gradient_deg.toFixed(1)
                : '—',
            ocean_zone: o?.zone ?? '—',
            zone_description:
              o?.zone_description ?? '—',
            estimated_water_temp_c:
              o?.estimated_water_temp_c !==
              undefined
                ? o.estimated_water_temp_c.toFixed(1)
                : '—',
            sound_speed_mps:
              o?.sound_speed_mps !==
              undefined
                ? o.sound_speed_mps.toFixed(1)
                : '—',
            sound_speed_fps:
              o?.sound_speed_fps !==
              undefined
                ? o.sound_speed_fps.toFixed(1)
                : '—',
            hydrostatic_pressure_bar:
              o?.hydrostatic_pressure_bar !==
              undefined
                ? o.hydrostatic_pressure_bar.toFixed(2)
                : '—',
            hydrostatic_pressure_psi:
              o?.hydrostatic_pressure_psi !==
              undefined
                ? o.hydrostatic_pressure_psi.toFixed(1)
                : '—',
            light_penetration_pct:
              o?.light_penetration_pct !==
              undefined
                ? o.light_penetration_pct.toFixed(1)
                : '—',
            diver_classification:
              o?.diver_classification ?? '—',
            dataset: result?.dataset ?? '—',
            source:
              p?.source_name ??
              result?.source ??
              'Unavailable',
            source_type: p?.source_type ?? 'unavailable',
            is_live:
              p?.is_live === true
                ? 'true'
                : 'false',
            is_synthetic:
              p?.is_synthetic === true
                ? 'true'
                : 'false',
            provenance_warning:
              p?.warning ?? '',
            queried_at:
              result?.queried_at ?? '',
          };
        },
      );

      const validDepthRecords = depthRecords.filter(
        (record) => record.depth_m !== '—',
      );

      const liveCount = depthRecords.filter(
        (record) => record.is_live === 'true',
      ).length;

      const syntheticCount = depthRecords.filter(
        (record) => record.is_synthetic === 'true',
      ).length;

      const depthValues = validDepthRecords.map(
        (record) => Number(record.depth_m),
      );
      const gradientValues = validDepthRecords.map(
        (record) =>
          Number(record.seabed_gradient_deg),
      );

      const averageDepth = depthValues.length
        ? depthValues.reduce(
            (sum, value) => sum + value,
            0,
          ) / depthValues.length
        : null;

      const minDepth = depthValues.length
        ? Math.min(...depthValues)
        : null;

      const maxDepth = depthValues.length
        ? Math.max(...depthValues)
        : null;

      const averageGradient =
        gradientValues.length
          ? gradientValues.reduce(
              (sum, value) => sum + value,
              0,
            ) / gradientValues.length
          : null;

      const bathymetryHead = [
        'Detection',
        'Object',
        'GPS',
        'Depth',
        'Gradient',
        'Zone',
        'Source',
      ];

      const bathymetryRows =
        depthRecords.map((record) => ({
          Detection: record.detection_id,
          Object: record.object_label,
          GPS:
            record.latitude === '—'
              ? '—'
              : fmtCoordinate(
                  Number(record.latitude),
                  Number(record.longitude),
                ),
          Depth:
            record.depth_m === '—'
              ? '—'
              : `${record.depth_m} m`,
          Gradient:
            record.seabed_gradient_deg === '—'
              ? '—'
              : `${record.seabed_gradient_deg}°`,
          Zone: record.ocean_zone,
          Source:
            record.source_type ===
            'live'
              ? 'Live GEBCO'
              : record.source_type ===
                  'synthetic_fallback'
                ? 'Synthetic fallback'
                : 'Unavailable',
        }));

      const oceanographyHead = [
        'Detection',
        'Zone',
        'Est. temp.',
        'Sound speed',
        'Pressure',
        'Light',
        'Diver / ROV',
      ];

      const oceanographyRows =
        depthRecords.map((record) => ({
          Detection: record.detection_id,
          Zone: record.ocean_zone,
          'Est. temp.':
            record.estimated_water_temp_c ===
            '—'
              ? '—'
              : `${record.estimated_water_temp_c} °C`,
          'Sound speed':
            record.sound_speed_mps ===
            '—'
              ? '—'
              : `${record.sound_speed_mps} m/s`,
          Pressure:
            record.hydrostatic_pressure_bar ===
            '—'
              ? '—'
              : `${record.hydrostatic_pressure_bar} bar`,
          Light:
            record.light_penetration_pct ===
            '—'
              ? '—'
              : `${record.light_penetration_pct}%`,
          'Diver / ROV':
            record.diver_classification,
        }));

      const bathymetryStats: [string, string][] = [
        [
          'Positions analysed',
          String(depthRecords.length),
        ],
        [
          'Live GEBCO results',
          String(liveCount),
        ],
        [
          'Synthetic fallback results',
          String(syntheticCount),
        ],
        [
          'Mean depth',
          averageDepth !== null
            ? `${averageDepth.toFixed(1)} m`
            : '—',
        ],
        [
          'Depth range',
          minDepth !== null &&
          maxDepth !== null
            ? `${minDepth.toFixed(1)}–${maxDepth.toFixed(1)} m`
            : '—',
        ],
        [
          'Mean seabed gradient',
          averageGradient !== null
            ? `${averageGradient.toFixed(1)}°`
            : '—',
        ],
      ];

      const report: Report = {
        id: `RP-${new Date()
          .getTime()
          .toString(36)
          .toUpperCase()}`,

        title: t('rpt.cohortTitle'),

        window: windowLabel,

        dept: deptLabel,

        createdAt:
          new Date().toISOString(),

        stats: [
          [
            t('rpt.statGenerated'),
            fmtDT(
              new Date().toISOString(),
            ),
          ],
          [
            t('rpt.statWindow'),
            windowLabel,
          ],
          [
            t('common.department'),
            deptLabel,
          ],
          [
            t('rpt.statDetections'),
            String(
              reportDetections.length,
            ),
          ],
          [
            t('rpt.statOpenAlerts'),
            String(openAlerts.length),
          ],
          [
            t('st.resolved'),
            String(resolved.length),
          ],
          [
            t('rpt.statCritical'),
            String(byRisk.critical),
          ],
          [
            t('rpt.statHigh'),
            String(byRisk.high),
          ],
          [
            'Bathymetry positions',
            String(depthRecords.length),
          ],
          [
            'Live GEBCO',
            String(liveCount),
          ],
          [
            'Synthetic fallback',
            String(syntheticCount),
          ],
          [
            'Mean depth',
            averageDepth !== null
              ? `${averageDepth.toFixed(1)} m`
              : '—',
          ],
          [
            'Depth range',
            minDepth !== null &&
            maxDepth !== null
              ? `${minDepth.toFixed(1)}–${maxDepth.toFixed(1)} m`
              : '—',
          ],
          [
            'Mean seabed gradient',
            averageGradient !== null
              ? `${averageGradient.toFixed(1)}°`
              : '—',
          ],
        ],

        head: heads,

        rows: CLASS_LIST.map((c) => {
          const classDetections =
            reportDetections.filter(
              (d) =>
                d.className === c,
            );

          const avg =
            classDetections.length
              ? (
                  (classDetections.reduce(
                    (sum, d) =>
                      sum + d.confidence,
                    0,
                  ) /
                    classDetections.length) *
                  100
                ).toFixed(1)
              : '—';

          return {
            [heads[0]]:
              clsLabel(c, language),

            [heads[1]]:
              String(
                classDetections.length,
              ),

            [heads[2]]:
              riskLabel(
                CLASS_META[c].riskBase,
                language,
              ),

            [heads[3]]:
              `${avg}%`,

            [heads[4]]:
              deptById(
                classDetections[0]
                  ?.department ??
                  'marine-operations',
              ).shortName,
          };
        }).filter(
          (row) =>
            row[heads[1]] !== '0',
        ),

        body: [
          t('rpt.bodyIntro'),

          t('rpt.bodyObjectDist', {
            n: reportDetections.length,
            c: Object.values(
              byClass,
            ).filter(Boolean).length,
          }),

          t('rpt.bodyRiskPosture', {
            crit: byRisk.critical,
            high: byRisk.high,
            med: byRisk.medium,
            low: byRisk.low,
          }),

          t('rpt.bodyResponseState', {
            open: openAlerts.length,
            resolved: resolved.length,
          }),

          t('rpt.bodyClassFindings', {
            cls: topClass
              ? clsLabel(
                  topClass,
                  language,
                )
              : '—',
            n: maxHits,
          }),

          `BATHYMETRY: ${depthRecords.length} detection position(s) enriched with bathymetry; ${liveCount} live GEBCO result(s) and ${syntheticCount} synthetic fallback result(s).`,

          averageDepth !== null
            ? `DEPTH: Mean reported depth ${averageDepth.toFixed(1)} m across ${validDepthRecords.length} valid bathymetry result(s), with a range of ${minDepth?.toFixed(1)}–${maxDepth?.toFixed(1)} m.`
            : 'DEPTH: No bathymetry depth values were available for this report.',

          'NOTE: Water temperature, sound speed, hydrostatic pressure, light penetration and diver classification are depth-derived estimates in the bathymetry response; they are not direct sensor measurements.',
        ],

        bathymetryRows,
        bathymetryExportRows:
          depthRecords,
        bathymetryHead,
        bathymetryStats,
        oceanographyRows,
        oceanographyHead,
      };

      setReports((prev) => [
        report,
        ...prev,
      ]);

      setOpenReport(report);

      store.addToast({
        kind: 'success',
        title: t('rpt.toastGen'),
        text: t(
          'rpt.toastGenText',
          { id: report.id },
        ),
      });
    } catch {
      store.addToast({
        kind: 'alert',
        title: t('common.failed'),
        text: 'The report could not be generated. Please try again.',
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  const exportReport = (
    report: Report,
    format: 'csv' | 'json' | 'pdf',
  ) => {
    try {
      if (format === 'csv') {
        download(
          `${report.id}.csv`,
          toCSV(
            report.bathymetryExportRows,
          ),
          'text/csv',
        );
      } else if (format === 'json') {
        download(
          `${report.id}.json`,
          toJSON({
            id: report.id,
            title: report.title,
            window: report.window,
            department: report.dept,
            generated_at:
              report.createdAt,
            stats:
              Object.fromEntries(
                report.stats,
              ),
            findings: report.body,
            class_summary: {
              columns: report.head,
              data: report.rows,
            },
            bathymetry_analysis: {
              summary:
                Object.fromEntries(
                  report.bathymetryStats,
                ),
              columns:
                report.bathymetryHead,
              preview:
                report.bathymetryRows,
              records:
                report.bathymetryExportRows,
            },
          }),
          'application/json',
        );
      } else {
        downloadReportPDF({
          id: report.id,
          title: `${report.title} · Bathymetry`,
          window: report.window,
          department: report.dept,
          generatedAt: fmtDT(
            report.createdAt,
          ),
          metadata: [
            t('rpt.pdfId', {
              id: report.id,
            }),
            t('rpt.pdfWindow', {
              window: report.window,
            }),
            t('rpt.pdfDepartment', {
              dept: report.dept,
            }),
            t('rpt.pdfGenerated', {
              date: fmtDT(
                report.createdAt,
              ),
            }),
            'Bathymetry provenance is included per position.',
          ],
          stats: report.stats,
          findings: report.body,
          columns: report.head,
          rows: report.rows,
          secondaryColumns:
            report.bathymetryHead,
          secondaryRows:
            report.bathymetryRows,
          secondaryLabel:
            'Bathymetry Analysis & Provenance',
          tertiaryColumns:
            report.oceanographyHead,
          tertiaryRows:
            report.oceanographyRows,
          tertiaryLabel:
            'Derived Oceanographic Estimates',
          orientation: 'landscape',
          labels: {
            keyMetrics:
              t('rpt.pdfKeyMetrics'),
            findings:
              t('rpt.pdfFindings'),
            dataTable:
              t('rpt.pdfDataTable'),
          },
        });
      }

      store.addToast({
        kind: 'success',
        title: t('rpt.toastExport'),
        text: t(
          'rpt.toastExportText',
          {
            file: `${report.id}.${format}`,
          },
        ),
      });
    } catch {
      store.addToast({
        kind: 'alert',
        title: t('common.failed'),
        text: t(
          'rpt.toastExportError',
          {
            file: `${report.id}.${format}`,
          },
        ),
      });
    }
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  return (
    <div>
      <PageHead
        kicker={t('his.title')}
        title={t('nav.history')}
        sub={t('his.sub', {
          count: detections.length,
        })}
        right={
          <div
            className="row wrap"
            style={{ gap: 8 }}
          >
            <Button
              variant="primary"
              onClick={generateReport}
              disabled={generatingReport}
            >
              <IconRefresh size={15} />
              {generatingReport
                ? 'Building report…'
                : t('rpt.generate')}
            </Button>

            <Button
              variant="secondary"
              onClick={
                exportHistoryCsv
              }
              disabled={
                detections.length === 0
              }
            >
              <IconDoc size={15} />
              {t('his.export')}
            </Button>

            <Button
              variant="danger"
              onClick={() =>
                setShowConfirm(true)
              }
              disabled={
                detections.length === 0
              }
            >
              <IconTrash size={15} />
              Clear History
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------------- */}
      {/* Clear history confirmation                                          */}
      {/* ------------------------------------------------------------------- */}

      {showConfirm && (
        <Modal
          onClose={() =>
            setShowConfirm(false)
          }
          width={460}
        >
          <div style={{ padding: 22 }}>
            <h3
              style={{
                margin:
                  '0 0 10px',
                color:
                  'var(--critical)',
              }}
            >
              Clear Detection History?
            </h3>

            <p
              className="muted"
              style={{
                fontSize: 13.5,
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              This will permanently
              delete all{' '}
              <b>{detections.length}</b>{' '}
              recorded detections and
              clear the active history
              ledger. This action cannot
              be undone.
            </p>

            <div
              className="row"
              style={{
                gap: 10,
                justifyContent:
                  'flex-end',
              }}
            >
              <Button
                variant="secondary"
                onClick={() =>
                  setShowConfirm(false)
                }
              >
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

      {/* ------------------------------------------------------------------- */}
      {/* Detection history                                                   */}
      {/* ------------------------------------------------------------------- */}

      <Card>
        <div
          className="row wrap"
          style={{
            padding:
              '12px 14px',
            borderBottom:
              '1px solid var(--line-soft)',
            gap: 10,
          }}
        >
          <div
            className="row wrap"
            style={{ gap: 6 }}
          >
            {CATS.map((c) => (
              <button
                key={c.id}
                className={`chip${
                  cat === c.id
                    ? ' on'
                    : ''
                }`}
                onClick={() =>
                  setCat(c.id)
                }
              >
                {t(c.key)}
              </button>
            ))}
          </div>

          <div
            className="row wrap"
            style={{
              gap: 8,
              marginLeft: 'auto',
            }}
          >
            <Select
              value={cls}
              onChange={setCls}
              options={[
                {
                  value: '<all>',
                  label: t(
                    'his.clsAll',
                  ),
                },
                ...CLASS_LIST.map(
                  (c) => ({
                    value: c,
                    label: clsLabel(
                      c,
                      language,
                    ),
                  }),
                ),
              ]}
            />

            <Select
              value={risk}
              onChange={setRisk}
              options={[
                {
                  value: '<all>',
                  label: t(
                    'his.riskAll',
                  ),
                },
                ...(
                  [
                    'critical',
                    'high',
                    'medium',
                    'low',
                  ] as RiskLevel[]
                ).map((r) => ({
                  value: r,
                  label: riskLabel(
                    r,
                    language,
                  ),
                })),
              ]}
            />

            <div
              className="row"
              style={{
                gap: 6,
                alignItems:
                  'center',
              }}
            >
              <IconSearch
                size={14}
                style={{
                  color:
                    'var(--ink-3)',
                }}
              />

              <input
                className="input"
                placeholder={t(
                  'his.searchPh',
                )}
                value={q}
                onChange={(e) =>
                  setQ(e.target.value)
                }
                style={{
                  width: 210,
                }}
              />
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={t(
              'his.emptyTitle',
            )}
            desc={t(
              'his.emptyDesc',
            )}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQ('');
                  setCls('<all>');
                  setCat('all');
                  setRisk('<all>');
                }}
              >
                {t(
                  'his.clearFilters',
                )}
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table tbl history-table">
              <thead>
                <tr>
                  <th>
                    {t(
                      'his.col.detection',
                    )}
                  </th>
                  <th>
                    {t(
                      'his.col.object',
                    )}
                  </th>
                  <th>
                    {t(
                      'common.risk',
                    )}
                  </th>
                  <th>
                    {t(
                      'his.col.conf',
                    )}
                  </th>
                  <th>
                    {t(
                      'common.status',
                    )}
                  </th>
                  <th>
                    {t(
                      'his.col.dept',
                    )}
                  </th>
                  <th>
                    {t(
                      'his.col.position',
                    )}
                  </th>
                  <th>
                    {t(
                      'his.col.detected',
                    )}
                  </th>
                  <th>
                    {t(
                      'common.export',
                    )}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((d) => {
                  const st =
                    statusFor(d);

                  const reportSource: DetectionReportSource =
                    {
                      id: d.id,
                      imageId:
                        d.imageId,
                      createdAt:
                        d.createdAt,
                      predictions:
                        d.predictions ??
                        [],
                      detection: d,
                      status:
                        'completed',
                      selectedIndex: 0,
                    };

                  const image =
                    d.imageUrl ||
                    getCachedImage(
                      d.id,
                    ) ||
                    getCachedImage(
                      d.imageId,
                    ) ||
                    framed.get(d.id);

                  return (
                    <tr key={d.id}>
                      <td>
                        <Link
                          to={`detail/${d.id}`}
                          className="row history-detection-link"
                          style={{
                            gap: 10,
                          }}
                        >
                          {image ? (
                            <img
                              className="sonimg thumb"
                              src={image}
                              alt=""
                              width={44}
                              height={28}
                              style={{
                                objectFit:
                                  'cover',
                                borderRadius: 4,
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                width: 44,
                              }}
                            />
                          )}

                          <span>
                            <b
                              className="mono"
                              style={{
                                fontSize: 12,
                              }}
                            >
                              {d.id}
                            </b>

                            <div className="mono tiny muted">
                              {timeAgo(
                                d.detectionTime,
                                language,
                              )}
                            </div>
                          </span>
                        </Link>
                      </td>

                      <td>
                        <ClassBadge
                          cls={d.className}
                        />
                      </td>

                      <td>
                        <RiskBadge
                          risk={
                            d.riskLevel
                          }
                        />
                      </td>

                      <td className="mono tiny">
                        {Math.round(
                          d.confidence *
                            100,
                        )}
                        %
                      </td>

                      <td>
                        {st ? (
                          <StatusBadge
                            status={st}
                          />
                        ) : (
                          <span className="badge b-teal">
                            {t(
                              'his.monitor',
                            )}
                          </span>
                        )}
                      </td>

                      <td className="tiny">
                        {CLASS_META[
                          d.className
                        ].category ===
                        'marine-life'
                          ? t(
                              'his.oceanSurvey',
                            )
                          : d.department.replace(
                              /-/g,
                              ' ',
                            )}
                      </td>

                      <td className="mono tiny muted">
                        {fmtCoordinate(
                          d.gps
                            .latitude,
                          d.gps
                            .longitude,
                        )}
                      </td>

                      <td className="mono tiny muted">
                        {fmtDT(
                          d.detectionTime,
                        )}
                      </td>

                      <td className="history-actions">
                        <DetectionReportActions
                          source={
                            reportSource
                          }
                          compact
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="row-between"
          style={{
            padding:
              '10px 14px',
            borderTop:
              '1px solid var(--line-faint)',
            color:
              'var(--ink-3)',
            fontSize: 11.5,
          }}
        >
          <span>
            {t(
              'his.pagination',
              {
                shown:
                  rows.length,
                total:
                  detections.length,
                limit,
              },
            )}
          </span>

          <div
            className="row"
            style={{ gap: 8 }}
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setLimit(
                  limit + 200,
                )
              }
            >
              {t(
                'his.loadMore',
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------- */}
      {/* Reports                                                            */}
      {/* ------------------------------------------------------------------- */}

      <div style={{ marginTop: 18 }}>
        <Card>
          <CardHead
            kt={t(
              'rpt.ktBuilder',
            )}
            title={t(
              'rpt.parameters',
            )}
          />

          <div
            className="grid cols-12"
            style={{ gap: 16 }}
          >
            <div className="span-4">
              <div
                className="tiny upper muted"
                style={{
                  marginBottom: 6,
                }}
              >
                {t(
                  'rpt.timeWindow',
                )}
              </div>

              <div
                className="row wrap"
                style={{ gap: 6 }}
              >
                {[
                  ['last24', '24h'],
                  ['last7', '7d'],
                  ['last30', '30d'],
                  ['last90', '90d'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`chip${
                      reportWindow ===
                      value
                        ? ' on'
                        : ''
                    }`}
                    onClick={() =>
                      setReportWindow(
                        value,
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="span-4">
              <div
                className="tiny upper muted"
                style={{
                  marginBottom: 6,
                }}
              >
                {t(
                  'rpt.deptScope',
                )}
              </div>

              <Select
                value={deptFilter}
                onChange={(value) =>
                  setDeptFilter(
                    value as
                      | DepartmentId
                      | 'all',
                  )
                }
                options={[
                  {
                    value: 'all',
                    label: t(
                      'rpt.allDepts',
                    ),
                  },
                  ...DEPARTMENTS.map(
                    (d) => ({
                      value: d.id,
                      label:
                        d.shortName,
                    }),
                  ),
                ]}
              />
            </div>

            <div
              className="span-4"
              style={{
                display: 'flex',
                alignItems:
                  'flex-end',
              }}
            >
              <Button
                variant="primary"
                block
                onClick={
                  generateReport
                }
                disabled={generatingReport}
              >
                <IconRefresh
                  size={15}
                />
                {generatingReport
                  ? 'Enriching bathymetry…'
                  : t(
                      'rpt.generateNow',
                    )}
              </Button>
            </div>
          </div>

          <div
            className="tiny muted"
            style={{
              marginTop: 12,
            }}
          >
            {t(
              'rpt.builderHint',
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Generated reports                                                  */}
      {/* ------------------------------------------------------------------- */}

      <div style={{ marginTop: 18 }}>
        <Card>
          <CardHead
            kt={t(
              'rpt.ktHistory',
            )}
            title={t(
              'rpt.generatedReports',
            )}
          />

          {reports.length === 0 ? (
            <EmptyState
              title={t(
                'rpt.emptyTitle',
              )}
              desc={t(
                'rpt.emptyDesc',
              )}
            />
          ) : (
            <div
              className="stack"
              style={{ gap: 8 }}
            >
              {reports
                .slice(0, 10)
                .map((report) => (
                  <div
                    key={report.id}
                    className="row-between"
                    style={{
                      gap: 8,
                      padding: 10,
                      border:
                        '1px solid var(--line-faint)',
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <b
                        className="mono"
                        style={{
                          fontSize: 12,
                        }}
                      >
                        {report.id}
                      </b>

                      <div
                        className="tiny muted"
                        style={{
                          marginTop: 2,
                        }}
                      >
                        {report.title}
                        {' · '}
                        {report.window}
                        {' · '}
                        {report.dept}
                      </div>

                      <div className="mono tiny muted">
                        {fmtDT(
                          report.createdAt,
                        )}
                      </div>
                    </div>

                    <div
                      className="row wrap"
                      style={{
                        gap: 6,
                      }}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setOpenReport(
                            report,
                          )
                        }
                      >
                        {t(
                          'common.open',
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          exportReport(
                            report,
                            'csv',
                          )
                        }
                      >
                        CSV
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          exportReport(
                            report,
                            'json',
                          )
                        }
                      >
                        JSON
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        title={t(
                          'rep.pdf',
                        )}
                        onClick={() =>
                          exportReport(
                            report,
                            'pdf',
                          )
                        }
                      >
                        <IconDownload
                          size={13}
                        />
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Report preview                                                     */}
      {/* ------------------------------------------------------------------- */}

      {openReport && (
        <Modal
          onClose={() =>
            setOpenReport(null)
          }
          width={720}
        >
          <div
            style={{
              padding:
                '26px 30px',
            }}
          >
            <ModalHead
              kt={t(
                'rpt.ktReport',
                {
                  window:
                    openReport.window,
                },
              )}
              title={
                openReport.title
              }
              onClose={() =>
                setOpenReport(
                  null,
                )
              }
            />

            <div
              className="stack"
              style={{
                gap: 10,
                marginBottom: 18,
              }}
            >
              {openReport.stats.map(
                ([key, value]) => (
                  <div
                    key={key}
                    className="row-between"
                    style={{
                      padding:
                        '6px 0',
                      borderBottom:
                        '1px dashed var(--line-faint)',
                      fontSize: 12.5,
                    }}
                  >
                    <span className="muted">
                      {key}
                    </span>

                    <b className="mono">
                      {value}
                    </b>
                  </div>
                ),
              )}
            </div>

            <div
              style={{
                padding: 14,
                border:
                  '1px solid var(--accent-line)',
                borderRadius: 10,
                fontFamily:
                  'var(--font-mono)',
                fontSize: 11.5,
                lineHeight: 1.7,
                color:
                  'var(--ink-2)',
                marginBottom: 16,
              }}
            >
              {openReport.body.map(
                (line, i) => (
                  <div
                    key={i}
                    style={
                      line.startsWith(
                        'OBJECT',
                      ) ||
                      line.startsWith(
                        'RISK',
                      ) ||
                      line.startsWith(
                        'RESPONSE',
                      ) ||
                      line.startsWith(
                        'CLASS',
                      )
                        ? {
                            marginTop: 8,
                            color:
                              'var(--accent)',
                          }
                        : undefined
                    }
                  >
                    {line}
                  </div>
                ),
              )}
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {openReport.head.map(
                      (head) => (
                        <th key={head}>
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>

                <tbody>
                  {openReport.rows.map(
                    (row, i) => (
                      <tr key={i}>
                        {openReport.head.map(
                          (head) => (
                            <td key={head}>
                              {row[head]}
                            </td>
                          ),
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 20,
                marginBottom: 8,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Bathymetry Analysis &amp; Provenance
            </div>

            <div
              className="tiny muted"
              style={{
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Depth values are queried at each detection GPS position.
              Live GEBCO results and synthetic fallback results are
              explicitly identified in the export.
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {openReport.bathymetryHead.map(
                      (head) => (
                        <th key={head}>
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>

                <tbody>
                  {openReport.bathymetryRows.map(
                    (row, i) => (
                      <tr key={i}>
                        {openReport.bathymetryHead.map(
                          (head) => (
                            <td key={head}>
                              {row[head]}
                            </td>
                          ),
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 20,
                marginBottom: 8,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Derived Oceanographic Estimates
            </div>

            <div
              className="tiny muted"
              style={{
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Temperature, sound speed, pressure, light penetration and
              diver classification are calculated from the reported depth;
              they are estimates, not direct sensor observations.
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {openReport.oceanographyHead.map(
                      (head) => (
                        <th key={head}>
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>

                <tbody>
                  {openReport.oceanographyRows.map(
                    (row, i) => (
                      <tr key={i}>
                        {openReport.oceanographyHead.map(
                          (head) => (
                            <td key={head}>
                              {row[head]}
                            </td>
                          ),
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div
              className="row"
              style={{
                gap: 8,
                marginTop: 16,
              }}
            >
              <Button
                variant="primary"
                onClick={() =>
                  exportReport(
                    openReport,
                    'csv',
                  )
                }
              >
                <IconDoc
                  size={15}
                />
                {t(
                  'rep.csv',
                )}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  exportReport(
                    openReport,
                    'json',
                  )
                }
              >
                JSON
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  exportReport(
                    openReport,
                    'pdf',
                  )
                }
              >
                <IconDownload
                  size={15}
                />
                {t(
                  'rep.pdf',
                )}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  setOpenReport(
                    null,
                  )
                }
              >
                {t(
                  'common.close',
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <div
        className="row wrap"
        style={{
          marginTop: 16,
          gap: 8,
        }}
      >
        {CLASS_LIST.map((c) => (
          <span
            key={c}
            className="badge b-plain"
          >
            <span
              className="legend-dot"
              style={{
                background:
                  CLASS_META[c].color,
              }}
            />
            {clsLabel(
              c,
              language,
            )}
          </span>
        ))}
      </div>
    </div>
  );
}