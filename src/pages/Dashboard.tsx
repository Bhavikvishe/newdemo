import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import {
  CLASS_LIST,
  CLASS_META,
  DEPARTMENTS,
  SITES,
  fmtCoordinate,
  timeAgo,
  toCSV,
  download,
} from '../lib/mock';
import { clsLabel, riskColor, riskLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { getCachedImage } from '../lib/detect';
import {
  PageHead,
  Card,
  CardHead,
  Stat,
  RiskBadge,
  ClassBadge,
  Button,
  Progress,
  Tag,
} from '../lib/ui';
import {
  BarChart,
  Donut,
  LineChart,
  HBar,
} from '../lib/charts';
import { Link } from '../lib/router';
import {
  IconActivity,
  IconAlert,
  IconArrowRight,
  IconDoc,
  IconGauge,
  IconRadar,
  IconScan,
  IconWave,
} from '../components/Icons';

const OPEN_STATUS = [
  'new',
  'unacknowledged',
  'pending',
  'assigned',
  'in_progress',
  'manual_verification',
  'overdue',
  'escalated',
];

export function DashboardPage() {
  const store = useStore();
  const { detections, alerts, language } = store;
  const t = makeT(language);

  const data = useMemo(() => {
    const byClass = Object.fromEntries(
      CLASS_LIST.map((c) => [c, 0]),
    ) as Record<string, number>;

    const byRisk = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    } as Record<string, number>;

    let debris = 0;
    let anomalies = 0;
    let infrastructure = 0;

    const sites = new Set<string>();

    detections.forEach((d) => {
      byClass[d.className] += 1;
      byRisk[d.riskLevel] += 1;

      const cat = CLASS_META[d.className].category;

      if (cat === 'debris') debris += 1;
      else if (cat === 'anomaly') anomalies += 1;
      else if (cat === 'infrastructure') infrastructure += 1;

      sites.add(
        `${d.gps.latitude.toFixed(1)},${d.gps.longitude.toFixed(1)}`,
      );
    });

    const openAlerts = alerts.filter((a) =>
      OPEN_STATUS.includes(a.status),
    );

    const resolvedAlerts = alerts.filter(
      (a) => a.status === 'resolved',
    );

    const respTimes = resolvedAlerts
      .map(
        (a) =>
          (
            new Date(
              a.resolvedAt ?? a.responseDeadline,
            ).getTime() -
            new Date(
              a.detection.detectionTime,
            ).getTime()
          ) /
          3600e3,
      )
      .filter((v) => v >= 0);

    const avgResp = respTimes.length
      ? respTimes.reduce((s, v) => s + v, 0) /
        respTimes.length
      : 0;

    const now = Date.now();

    const today = detections.filter(
      (d) =>
        now -
          new Date(d.detectionTime).getTime() <
        24 * 3600e3,
    ).length;

    /*
     * 12-week detection trend
     */
    const weeks: {
      label: string;
      value: number;
    }[] = [];

    for (let w = 11; w >= 0; w--) {
      const start = new Date(
        now - w * 7 * 24 * 3600e3,
      );

      const end =
        start.getTime() + 7 * 24 * 3600e3;

      const count = detections.filter((d) => {
        const ts = new Date(
          d.detectionTime,
        ).getTime();

        return (
          ts >= start.getTime() &&
          ts < end
        );
      }).length;

      weeks.push({
        label: `${String(
          start.getDate(),
        ).padStart(2, '0')}/${String(
          start.getMonth() + 1,
        ).padStart(2, '0')}`,
        value: count,
      });
    }

    /*
     * Case status
     */
    const statusCounts = OPEN_STATUS.map(
      (s) => ({
        label: s,
        value: alerts.filter(
          (a) => a.status === s,
        ).length,
      }),
    );

    /*
     * Model confidence distribution
     *
     * <60
     * 60-69
     * 70-79
     * 80-89
     * 90+
     */
    const confBins = [0, 0, 0, 0, 0];

    detections.forEach((d) => {
      const conf = Math.floor(
        d.confidence * 100,
      );

      if (conf < 60) {
        confBins[0] += 1;
      } else if (conf < 70) {
        confBins[1] += 1;
      } else if (conf < 80) {
        confBins[2] += 1;
      } else if (conf < 90) {
        confBins[3] += 1;
      } else {
        confBins[4] += 1;
      }
    });

    /*
     * Geographic concentration
     *
     * Each detection is associated with
     * the nearest known survey site.
     */
    const bySite = new Map<
      string,
      {
        label: string;
        value: number;
        color: string;
      }
    >();

    detections.forEach((d) => {
      let site = SITES[0];
      let best = Number.POSITIVE_INFINITY;

      SITES.forEach((s) => {
        const dist =
          Math.abs(
            s.lat - d.gps.latitude,
          ) +
          Math.abs(
            s.lng - d.gps.longitude,
          );

        if (dist < best) {
          best = dist;
          site = s;
        }
      });

      const key = site.name;

      const label =
        key.split('—')[1]?.trim() ??
        key.split('–')[1]?.trim() ??
        key;

      const hit = bySite.get(key);

      if (hit) {
        hit.value += 1;
      } else {
        bySite.set(key, {
          label,
          value: 1,
          color: 'var(--accent)',
        });
      }
    });

    /*
     * Average detection → resolution
     * time for each department.
     */
    const deptResp = DEPARTMENTS.map(
      (d) => {
        const resolvedForDept =
          alerts.filter(
            (a) =>
              a.detection.department ===
                d.id &&
              a.status === 'resolved' &&
              a.resolvedAt,
          );

        const avg =
          resolvedForDept.length
            ? resolvedForDept.reduce(
                (sum, a) =>
                  sum +
                  (
                    new Date(
                      a.resolvedAt!,
                    ).getTime() -
                    new Date(
                      a.detection
                        .detectionTime,
                    ).getTime()
                  ) /
                    3600e3,
                0,
              ) /
              resolvedForDept.length
            : 0;

        return {
          label: d.shortName,
          value: +avg.toFixed(1),
          color: d.color,
        };
      },
    );

    /*
     * Recommended equipment requirements.
     */
    const eq = new Map<
      string,
      number
    >();

    detections.forEach((d) => {
      d.recommendedEquipment.forEach(
        (equipment) => {
          eq.set(
            equipment,
            (eq.get(equipment) ?? 0) + 1,
          );
        },
      );
    });

    const eqList = Array.from(
      eq.entries(),
    )
      .map(([label, value]) => ({
        label,
        value,
        color: 'var(--medium)',
      }))
      .sort(
        (a, b) => b.value - a.value,
      )
      .slice(0, 8);

    /*
     * Latest detection feed
     */
    const feed = detections.slice(0, 8);

    const frames = new Map<
      string,
      string
    >();

    feed.forEach((d) => {
      const real =
        d.imageUrl ||
        getCachedImage(d.id) ||
        getCachedImage(d.imageId);

      frames.set(
        d.id,
        real ||
          renderFrame(
            d,
            { width: 240 },
            language,
          ),
      );
    });

    /*
     * Sample sonar frames by class
     */
    const framesByClass = new Map<
      string,
      string
    >();

    CLASS_LIST.forEach((c) => {
      const sample =
        detections.find(
          (d) => d.className === c,
        ) ?? detections[0];

      if (sample) {
        framesByClass.set(
          c,
          renderFrame(
            sample,
            { width: 200 },
            language,
          ),
        );
      }
    });

    /*
     * Department open workload
     */
    const deptLoad = DEPARTMENTS.map(
      (d) => ({
        label: d.shortName,
        value: openAlerts.filter(
          (a) =>
            a.detection.department ===
            d.id,
        ).length,
        color: d.color,
      }),
    );

    return {
      total: detections.length,
      debris,
      anomalies,
      hiCrit:
        byRisk.critical +
        byRisk.high,
      infra: infrastructure,
      pending: openAlerts.length,
      resolved: resolvedAlerts.length,
      avgResp,
      areas: sites.size,
      today,

      resolutionRate:
        alerts.length
          ? Math.round(
              (resolvedAlerts.length /
                alerts.length) *
                100,
            )
          : 0,

      byClass,
      byRisk,
      weeks,
      statusCounts,
      feed,
      frames,
      framesByClass,
      deptLoad,

      confBins,

      bySite: Array.from(
        bySite.values(),
      )
        .sort(
          (a, b) =>
            b.value - a.value,
        )
        .slice(0, 10),

      deptResp,
      eqList,
    };
  }, [
    detections,
    alerts,
    language,
  ]);

  /*
   * Risk distribution
   */
  const riskDonut = (
    Object.keys(
      data.byRisk,
    ) as Array<
      'critical' |
      'high' |
      'medium' |
      'low'
    >
  ).map((k) => ({
    label: riskLabel(
      k,
      language,
    ),
    value: data.byRisk[k],
    color: riskColor(k),
  }));

  /*
   * Existing category distribution
   */
  const catBars =
    CLASS_LIST.filter(
      (c) =>
        CLASS_META[c].category !==
        'marine-life',
    ).map((c) => ({
      label: clsLabel(
        c,
        language,
      ).split(' ')[0],
      value: data.byClass[c],
      color:
        CLASS_META[c].color,
    }));

  /*
   * Object distribution
   */
  const objectDonut =
    CLASS_LIST.map((c) => ({
      label: clsLabel(
        c,
        language,
      ).split(' ')[0],
      value: data.byClass[c],
      color:
        CLASS_META[c].color,
    }));

  /*
   * Risk distribution
   */
  const riskBars = (
    [
      'critical',
      'high',
      'medium',
      'low',
    ] as const
  ).map((r) => ({
    label: riskLabel(
      r,
      language,
    ),
    value: data.byRisk[r],
    color: riskColor(r),
  }));

  /*
   * Confidence distribution
   */
  const confidenceBars = [
    {
      label: t(
        'anx.confUnder',
        { v: 60 },
      ),
      value: data.confBins[0],
      color: 'var(--ink-3)',
    },
    {
      label: t(
        'anx.confRange',
        {
          a: 60,
          b: 69,
        },
      ),
      value: data.confBins[1],
      color: 'var(--medium)',
    },
    {
      label: t(
        'anx.confRange',
        {
          a: 70,
          b: 79,
        },
      ),
      value: data.confBins[2],
      color: 'var(--high)',
    },
    {
      label: t(
        'anx.confRange',
        {
          a: 80,
          b: 89,
        },
      ),
      value: data.confBins[3],
      color: 'var(--accent)',
    },
    {
      label: t(
        'anx.confOver',
        { v: 90 },
      ),
      value: data.confBins[4],
      color: 'var(--teal)',
    },
  ];

  /*
   * Resolved vs open
   */
  const resolvedVsOpen = [
    {
      label: t('anx.resolved'),
      value: data.resolved,
      color: 'var(--teal)',
    },
    {
      label: t('anx.open'),
      value: data.pending,
      color: 'var(--high)',
    },
  ];

  return (
    <div>
      <PageHead
        kicker={t('dash.command')}
        title={t('dash.command')}
        sub={t('dash.sub')}
        right={
          <Link
            to="alerts"
            className="btn btn-secondary"
          >
            <IconAlert size={15} />{' '}
            {t('nav.alerts')}
          </Link>
        }
      />

      {/* =========================
          TOP STATISTICS
          ========================= */}
      <div
        className="stat-grid"
        style={{
          gridTemplateColumns:
            'repeat(4, 1fr)',
        }}
      >
        <Stat
          kt={t('dash.total')}
          value={data.total}
          icon={
            <IconWave size={15} />
          }
          sub={t(
            'dash.today24',
            { n: data.today },
          )}
        />

        <Stat
          kt={t('dash.debris')}
          value={data.debris}
          tone="var(--high)"
          icon={
            <IconGauge size={15} />
          }
          sub={t(
            'dash.recovered',
          )}
        />

        <Stat
          kt={t('dash.anomalies')}
          value={
            data.anomalies +
            data.infra
          }
          tone="var(--medium)"
          icon={
            <IconActivity
              size={15}
            />
          }
          sub={t(
            'dash.infraObjs',
            { n: data.infra },
          )}
        />

        <Stat
          kt={t('dash.highcrit')}
          value={data.hiCrit}
          tone="var(--critical)"
          icon={
            <IconAlert
              size={15}
            />
          }
          sub={t(
            'dash.attention',
          )}
        />

        <Stat
          kt={t('dash.pending')}
          value={data.pending}
          tone="var(--high)"
          icon={
            <IconRadar
              size={15}
            />
          }
          sub={t(
            'dash.avgRespSub',
            {
              n: data.avgResp.toFixed(
                1,
              ),
            },
          )}
        />

        <Stat
          kt={t('dash.resolved')}
          value={data.resolved}
          tone="var(--teal)"
          icon={
            <IconDoc size={15} />
          }
          sub={t(
            'dash.resolutionSub',
            {
              n: data.resolutionRate,
            },
          )}
        />

        <Stat
          kt={t('dash.resp')}
          value={data.avgResp}
          decimal={1}
          tone="var(--accent)"
          icon={
            <IconGauge
              size={15}
            />
          }
          sub={t(
            'dash.hoursToRes',
          )}
        />

        <Stat
          kt={t('dash.areas')}
          value={data.areas}
          tone="var(--marine)"
          icon={
            <IconScan size={15} />
          }
          sub={t(
            'dash.gridsActive',
          )}
        />
      </div>

      {/* =========================
          COMMAND SWEEP
          ========================= */}
      <div
        className="grid cols-12"
        style={{
          marginTop: 18,
          gap: 16,
        }}
      >
        <div className="span-4">
          <Card
            className="h-full"
            solid
          >
            <CardHead
              kt={t(
                'dash.ktSonar',
              )}
              title={t(
                'dash.commandSweep',
              )}
            />

            <div
              className="row"
              style={{
                justifyContent:
                  'center',
                padding:
                  '6px 0 16px',
              }}
            >
              <div
                className="hero-sonar"
                style={{
                  width:
                    'min(300px, 100%)',
                }}
              >
                <div
                  className="sonar-shell"
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 18,
                  }}
                >
                  <div
                    className="ring"
                    style={{
                      width: '84%',
                      aspectRatio: '1',
                    }}
                  />

                  <div
                    className="ring"
                    style={{
                      width: '60%',
                      aspectRatio: '1',
                      borderStyle:
                        'dashed',
                    }}
                  />

                  <div
                    className="ring"
                    style={{
                      width: '36%',
                      aspectRatio: '1',
                    }}
                  />

                  <div
                    className="sweep"
                    style={{
                      height: '46%',
                    }}
                  />

                  <div
                    className="blip risk-critical hit"
                    style={{
                      left: '58%',
                      top: '30%',
                    }}
                  />

                  <div
                    className="blip risk-high"
                    style={{
                      left: '72%',
                      top: '62%',
                    }}
                  />

                  <div
                    className="blip risk-medium"
                    style={{
                      left: '40%',
                      top: '38%',
                    }}
                  />

                  <div
                    className="blip risk-marine"
                    style={{
                      left: '26%',
                      top: '58%',
                      width: 5,
                      height: 5,
                    }}
                  />
                </div>

                <div
                  className="ext"
                  style={{
                    position:
                      'absolute',
                    left: 0,
                    top: '52%',
                  }}
                >
                  <span className="hd">
                    15.5 kHz
                  </span>{' '}
                  ·{' '}
                  {t(
                    'dash.sweepTag',
                    { n: '03' },
                  )}
                </div>

                <div
                  className="ext"
                  style={{
                    position:
                      'absolute',
                    right: 0,
                    top: '20%',
                  }}
                >
                  38 m
                </div>
              </div>
            </div>

            <div
              className="row"
              style={{
                gap: 8,
                justifyContent:
                  'center',
                marginBottom: 16,
              }}
            >
              <Link
                to="detection"
                className="btn btn-primary btn-sm"
              >
                <IconScan
                  size={14}
                />{' '}
                {t(
                  'dash.newDetection',
                )}
              </Link>

              <Link
                to="live"
                className="btn btn-secondary btn-sm"
              >
                <IconRadar
                  size={14}
                />{' '}
                {t(
                  'dash.goLive',
                )}
              </Link>
            </div>

            <div
              className="stack"
              style={{
                gap: 6,
              }}
            >
              {[
                [
                  t(
                    'dash.aiCore',
                  ),
                  t(
                    'dash.aiOptimal',
                  ),
                ],
                [
                  t(
                    'dash.sonarArrayRow',
                  ),
                  t(
                    'dash.sonarPaired',
                  ),
                ],
                [
                  t(
                    'dash.gpsFix',
                  ),
                  t(
                    'dash.gpsLocked',
                  ),
                ],
              ].map(
                ([k, v]) => (
                  <div
                    key={k}
                    className="row-between"
                    style={{
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        color:
                          'var(--ink-3)',
                      }}
                    >
                      {k}
                    </span>

                    <b
                      className="mono"
                      style={{
                        color:
                          'var(--teal)',
                      }}
                    >
                      {v}
                    </b>
                  </div>
                ),
              )}
            </div>
          </Card>
        </div>

        {/* Existing risk overview */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'dash.ktDist',
              )}
              title={t(
                'dash.riskdist',
              )}
              right={
                <Tag kind="ai">
                  {t(
                    'common.live',
                  )}
                </Tag>
              }
            />

            <Donut
              data={riskDonut}
              centerTitle={t(
                'dash.detections',
              ).toUpperCase()}
              centerValue={data.total}
              size={176}
            />
          </Card>
        </div>

        {/* 12-week trend */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktWindow',
              )}
              title={t(
                'dash.activity',
              )}
            />

            <LineChart
              series={[
                {
                  name: t(
                    'anx.detections',
                  ),
                  color:
                    'var(--accent)',
                  values:
                    data.weeks.map(
                      (w) =>
                        w.value,
                    ),
                },
              ]}
              labels={data.weeks.map(
                (w) =>
                  w.label,
              )}
              height={200}
            />
          </Card>
        </div>
      </div>

      {/* =========================
          MERGED ANALYTICS
          ========================= */}

      <div
        className="grid cols-12"
        style={{
          marginTop: 16,
          gap: 16,
        }}
      >
        {/* Object distribution */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktObject',
              )}
              title={t(
                'anx.object',
              )}
            />

            <Donut
              data={objectDonut}
              size={168}
              centerTitle={t(
                'anx.total',
              )}
              centerValue={
                data.total
              }
            />
          </Card>
        </div>

        {/* Risk */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktSeverity',
              )}
              title={t(
                'anx.risk',
              )}
            />

            <BarChart
              data={riskBars}
              height={190}
            />
          </Card>
        </div>

        {/* Confidence */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktModel',
              )}
              title={t(
                'anx.conf',
              )}
            />

            <BarChart
              data={
                confidenceBars
              }
              height={190}
            />
          </Card>
        </div>
      </div>

      <div
        className="grid cols-12"
        style={{
          marginTop: 16,
          gap: 16,
        }}
      >
        {/* Resolved / open */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktOutcome',
              )}
              title={t(
                'anx.rvp',
              )}
            />

            <Donut
              data={
                resolvedVsOpen
              }
              centerTitle={t(
                'anx.cases',
              )}
              centerValue={
                data.resolved +
                data.pending
              }
              size={168}
            />
          </Card>
        </div>

        {/* Geographic concentration */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktGrid',
              )}
              title={t(
                'anx.geo',
              )}
            />

            <HBar
              rows={data.bySite}
            />
          </Card>
        </div>

        {/* Response performance */}
        <div className="span-4">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktDepartment',
              )}
              title={t(
                'anx.resp',
              )}
            />

            <HBar
              rows={
                data.deptResp
              }
              format={(v) =>
                t(
                  'anx.hours',
                  { v },
                )
              }
            />

            <div
              className="tiny muted"
              style={{
                marginTop: 8,
              }}
            >
              {t(
                'anx.avgNote',
              )}
            </div>
          </Card>
        </div>
      </div>

      <div
        className="grid cols-12"
        style={{
          marginTop: 16,
          gap: 16,
        }}
      >
        {/* Department workload */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktLoad',
              )}
              title={t(
                'anx.deptload',
              )}
            />

            <HBar
              rows={
                data.deptLoad
              }
            />
          </Card>
        </div>

        {/* Equipment requirements */}
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t(
                'anx.ktLogistics',
              )}
              title={t(
                'anx.equip',
              )}
            />

            <HBar
              rows={data.eqList}
            />
          </Card>
        </div>
      </div>

      {/* =========================
          EXISTING DASHBOARD
          ========================= */}

      <div
        className="grid cols-12"
        style={{
          marginTop: 16,
          gap: 16,
        }}
      >
        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t(
                'dash.ktCatHist',
              )}
              title={t(
                'dash.cathist',
              )}
            />

            <BarChart
              data={catBars}
              height={190}
            />
          </Card>
        </div>

        <div className="span-6">
          <Card className="h-full">
            <CardHead
              kt={t(
                'dash.ktRespStat',
              )}
              title={t(
                'dash.respstat',
              )}
            />

            <div
              className="stack"
              style={{
                gap: 12,
                padding:
                  '4px 2px',
              }}
            >
              {data.statusCounts
                .filter(
                  (s) =>
                    s.value > 0,
                )
                .map((s) => (
                  <div
                    key={
                      s.label
                    }
                  >
                    <div
                      className="row-between"
                      style={{
                        marginBottom: 5,
                      }}
                    >
                      <span
                        className="row"
                        style={{
                          gap: 8,
                          fontSize: 12.5,
                        }}
                      >
                        <span
                          className="legend-dot"
                          style={{
                            background:
                              s.label ===
                              'resolved'
                                ? 'var(--teal)'
                                : s.label ===
                                    'overdue'
                                  ? 'var(--critical)'
                                  : s.label ===
                                      'in_progress'
                                    ? 'var(--accent)'
                                    : 'var(--ink-3)',
                          }}
                        />

                        {t(
                          'st.' +
                            s.label,
                        )}
                      </span>

                      <b className="mono small">
                        {s.value}
                      </b>
                    </div>

                    <Progress
                      value={
                        (s.value /
                          Math.max(
                            1,
                            data.pending +
                              data.resolved,
                          )) *
                        100
                      }
                      tone={
                        s.label ===
                        'resolved'
                          ? 'var(--teal)'
                          : s.label ===
                              'overdue'
                            ? 'var(--critical)'
                            : s.label ===
                                'in_progress'
                              ? 'var(--accent)'
                              : 'var(--ink-3)'
                      }
                    />
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>

      {/* =========================
          LATEST INTELLIGENCE
          ========================= */}

      <div
        className="grid cols-12"
        style={{
          marginTop: 16,
          gap: 16,
        }}
      >
        <div className="span-7">
          <Card className="h-full">
            <CardHead
              kt={t(
                'dash.ktFeed',
              )}
              title={t(
                'dash.feed',
              )}
              right={
                <div
                  className="row"
                  style={{
                    gap: 8,
                  }}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const rows =
                        detections.map(
                          (d) => ({
                            id: d.id,
                            class:
                              d.className,
                            confidence:
                              d.confidence.toFixed(
                                3,
                              ),
                            risk:
                              d.riskLevel,
                            lat: d.gps.latitude.toFixed(
                              5,
                            ),
                            lng: d.gps.longitude.toFixed(
                              5,
                            ),
                            time:
                              d.detectionTime,
                            dept:
                              d.department,
                          }),
                        );

                      download(
                        'oceonix-detections.csv',
                        toCSV(rows),
                        'text/csv',
                      );
                    }}
                  >
                    {t(
                      'dash.exportCsv',
                    )}
                  </Button>

                  <Link
                    to="history"
                    className="btn btn-ghost btn-sm"
                    style={{
                      textDecoration:
                        'none',
                    }}
                  >
                    {t(
                      'dash.viewAll',
                    )}{' '}
                    <IconArrowRight
                      size={13}
                    />
                  </Link>
                </div>
              }
            />

            <div
              className="stack"
              style={{
                gap: 4,
              }}
            >
              {data.feed.map(
                (d) => {
                  const meta =
                    CLASS_META[
                      d.className
                    ];

                  const alert =
                    alerts.find(
                      (a) =>
                        a.detectionId ===
                        d.id,
                    );

                  return (
                    <Link
                      key={d.id}
                      to={`detail/${d.id}`}
                      className="feed-row"
                    >
                      <img
                        className="sonimg thumb alert-thumb"
                        src={data.frames.get(
                          d.id,
                        )}
                        alt=""
                        width={64}
                        height={40}
                        style={{
                          width: 64,
                          height: 40,
                          objectFit:
                            'cover',
                        }}
                        onError={(
                          e,
                        ) => {
                          (
                            e.currentTarget as HTMLImageElement
                          ).src =
                            renderFrame(
                              d,
                              {
                                width: 240,
                              },
                              language,
                            );
                        }}
                      />

                      <div
                        style={{
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <div
                          className="row-between"
                          style={{
                            gap: 8,
                          }}
                        >
                          <ClassBadge
                            cls={
                              d.className
                            }
                          />

                          <RiskBadge
                            risk={
                              d.riskLevel
                            }
                          />
                        </div>

                        <div
                          className="row-between"
                          style={{
                            marginTop: 3,
                            gap: 8,
                          }}
                        >
                          <span
                            className="mono tiny"
                            style={{
                              color:
                                'var(--ink-3)',
                            }}
                          >
                            {meta.color
                              ? fmtCoordinate(
                                  d.gps
                                    .latitude,
                                  d.gps
                                    .longitude,
                                )
                              : ''}{' '}
                            ·{' '}
                            {t(
                              'dash.conf',
                              {
                                pct: (
                                  d.confidence *
                                  100
                                ).toFixed(
                                  1,
                                ),
                              },
                            )}
                          </span>

                          <span className="mono tiny muted">
                            {timeAgo(
                              d.detectionTime,
                              language,
                            )}
                          </span>
                        </div>
                      </div>

                      {alert?.status ===
                        'resolved' && (
                        <span className="badge b-teal">
                          <span className="dot" />{' '}
                          {t(
                            'st.resolved',
                          ).toUpperCase()}
                        </span>
                      )}
                    </Link>
                  );
                },
              )}
            </div>
          </Card>
        </div>

        {/* Department workload */}
        <div className="span-5">
          <Card className="h-full">
            <CardHead
              kt={t(
                'dash.ktDeptLoad',
              )}
              title={t(
                'dash.deptLoad',
              )}
            />

            <HBar
              rows={
                data.deptLoad
              }
            />

            <div
              style={{
                marginTop: 14,
                borderTop:
                  '1px solid var(--line-faint)',
                paddingTop: 12,
              }}
            >
              <div
                className="row"
                style={{
                  gap: 8,
                }}
              >
                <Link
                  to="departments"
                  className="btn btn-secondary btn-sm"
                >
                  <IconActivity
                    size={14}
                  />{' '}
                  {t(
                    'dash.deptDir',
                  )}
                </Link>

                <Link
                  to="department"
                  className="btn btn-ghost btn-sm"
                >
                  {t(
                    'dash.myDept',
                  )}{' '}
                  <IconArrowRight
                    size={13}
                  />
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}