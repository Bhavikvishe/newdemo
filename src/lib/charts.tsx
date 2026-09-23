import { useRef, useState } from 'react';
import { cx } from './ui';
import { makeT } from './i18n';
import { useStore } from './store';

interface Tip {
  x: number;
  y: number;
  html: string;
}

function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x + 12, top: tip.y - 20 }} dangerouslySetInnerHTML={{ __html: tip.html }} />
  );
}

/* ------------------------------------------------------------------ */
/*  LINE CHART                                                         */
/* ------------------------------------------------------------------ */
export interface LineSeries {
  name: string;
  color: string;
  values: number[];
  dash?: string;
}

export function calcAutoY(values: number[]): [min: number, max: number, ticks: number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min = 0;
    max = Math.max(1, values[0]);
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  return [min, max, 4];
}

export function LineChart({
  series,
  labels,
  height = 220,
  format = (v: number) => String(v),
  fill = true,
}: {
  series: LineSeries[];
  labels: string[];
  height?: number;
  format?: (v: number) => string;
  fill?: boolean;
}) {
  const { language } = useStore();
  const t = makeT(language);
  const all = series.flatMap((s) => s.values);
  const [min, max] = calcAutoY(all);
  const span = max - min || 1;
  const W = 1000;
  const H = 400;
  const padL = 52;
  const padR = 18;
  const padT = 24;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = labels.length;
  const xFor = (i: number) => padL + (i / (Math.max(1, n - 1))) * innerW;
  const yFor = (v: number) => padT + innerH - ((v - min) / span) * innerH;

  const pts = (vals: number[]) => vals.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const ticks: number[] = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) ticks.push(min + (span * i) / tickCount);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const ratio = px / rect.width;
    const i = Math.round(ratio * (n - 1));
    if (i < 0 || i >= n) return;
    const seriesHtml = series
      .map((s) => `<span style="display:flex;justify-content:space-between;gap:10px"><span style="color:${s.color}">■ ${t(s.name)}</span><b>${format(s.values[i] ?? 0)}</b></span>`)
      .join('');
    setTip({ x: e.clientX, y: e.clientY, html: `<b>${t(labels[i] ?? '')}</b>${seriesHtml}` });
    guideRef.current?.setAttribute('x', String(xFor(i)));
  };

  const guideRef = useRef<SVGLineElement>(null);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={wrapRef} style={{ width: '100%' }} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', height }} className="chart-box">
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`lcg-${si}-fg`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="var(--line-faint)" strokeWidth="1" />
              <text x={padL - 8} y={yFor(t) + 4} textAnchor="end" fontSize="12" fill="var(--ink-3)" fontFamily="var(--font-mono)">{format(Math.round(t))}</text>
            </g>
          ))}
          {series.map((s, si) => (
            <g key={si}>
              {fill && <polygon points={`${xFor(0)},${padT + innerH} ${pts(s.values)} ${xFor(n - 1)},${padT + innerH}`} fill={`url(#lcg-${si}-fg)`} />}
              <polyline points={pts(s.values)} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} strokeLinejoin="round" />
            </g>
          ))}
          {labels.map((raw, i) => {
            const l = t(raw);
            return (
              <text key={i} x={xFor(i)} y={H - 10} textAnchor="middle" fontSize="11.5" fill="var(--ink-3)" fontFamily="var(--font-mono)">
                {l.length > 9 ? `${l.slice(0, 8)}…` : l}
              </text>
            );
          })}
          <line ref={guideRef} x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0" style={{ transition: 'opacity .1s' }} />
        </svg>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BAR CHART                                                          */
/* ------------------------------------------------------------------ */
export function BarChart({
  data,
  color = 'var(--accent)',
  height = 200,
  format = (v: number) => String(v),
  labelKey = 'label',
}: {
  data: { label: string; value: number; color?: string }[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
  labelKey?: string;
  $?: never;
}) {
  const { language } = useStore();
  const t = makeT(language);
  const W = 1000;
  const H = 400;
  const padL = 46;
  const padR = 14;
  const padT = 20;
  const padB = 36;
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const bw = innerW / data.length;
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  void labelKey;

  const onMove = (e: React.MouseEvent, d: { label: string; value: number }, i: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX, y: e.clientY, html: `<b>${t(d.label)}</b><span style="color:var(--accent)">${format(d.value)}</span>` });
    void i;
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={wrapRef} style={{ width: '100%' }} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', height }}>
          {[0, 0.5, 1].map((r) => {
            const y = padT + innerH - innerH * r;
            return (
              <g key={r}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--line-faint)" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="12" fill="var(--ink-3)" fontFamily="var(--font-mono)">{format(Math.round(max * r))}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const l = t(d.label);
            const h = (d.value / max) * innerH;
            const x = padL + i * bw + bw * 0.18;
            const w = bw * 0.64;
            return (
              <g
                key={i}
                onMouseMove={(e) => onMove(e, d, i)}
                style={{ cursor: 'pointer' }}
              >
                <rect x={x} y={padT + innerH - h} width={w} height={h} rx="4" fill={d.color ?? color} opacity="0.9">
                  <animate attributeName="opacity" values="0.5;0.92;0.5" dur="3s" repeatCount="indefinite" />
                </rect>
                <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-mono)">
                  {l.length > 8 ? `${l.slice(0, 7)}…` : l}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HORIZONTAL BARS                                                    */
/* ------------------------------------------------------------------ */
export function HBar({ rows, height, format }: { rows: { label: string; value: number; color?: string }[]; height?: number; format?: (v: number) => string }) {
  const { language } = useStore();
  const t = makeT(language);
  const max = Math.max(...rows.map((r) => r.value), 1);
  void height;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{t(r.label)}</span>
            <span className="mono small" style={{ color: 'var(--ink-3)' }}>{format ? format(r.value) : r.value}</span>
          </div>
          <div className="progress">
            <div className={cx('bar')} style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DONUT                                                              */
/* ------------------------------------------------------------------ */
export function Donut({
  data,
  size = 190,
  thickness = 22,
  centerTitle,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  centerValue?: string | number;
}) {
  const { language } = useStore();
  const t = makeT(language);
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="row" style={{ gap: 22, justifyContent: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-faint)" strokeWidth={thickness} />
          {data.map((d, i) => {
            const len = (d.value / total) * C;
            const off = -acc;
            acc += len;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0.5, len - 2)} ${C - len + 2}`}
                strokeDashoffset={off}
                strokeLinecap="butt"
                className={i === 0 ? undefined : undefined}
              >
                <animate attributeName="stroke-dasharray" values={`0 ${C};${Math.max(0.5, len - 2)} ${C - len + 2}`} dur="0.6s" fill="freeze" />
              </circle>
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink)" fontFamily="var(--font-display)">
          {typeof centerValue === 'string' ? t(centerValue) : centerValue}
        </text>
        {centerTitle && (
          <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="9.5" letterSpacing="1.5" fill="var(--ink-3)" fontFamily="var(--font-mono)">
            {t(centerTitle)}
          </text>
        )}
      </svg>
      <div className="stack" style={{ gap: 7, minWidth: 120 }}>
        {data.map((d, i) => (
          <div key={i} className="row" style={{ gap: 8, fontSize: 12.5 }}>
            <span className="legend-dot" style={{ background: d.color }} />
            <span style={{ color: 'var(--ink-2)' }}>{t(d.label)}</span>
            <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface DonutData {
  label: string;
  value: number;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  STACKED AREA (activity heat)                                       */
/* ------------------------------------------------------------------ */
export function ActivityChart({ buckets, height = 150 }: { buckets: { label: string; counts: number[]; color: string }[]; height?: number }) {
  const { language } = useStore();
  const t = makeT(language);
  const n = buckets[0]?.counts.length ?? 0;
  const W = 1000;
  const H = 260;
  const padL = 20;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const colW = innerW / Math.max(1, n);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const maxCol = Math.max(1, ...buckets.map((b) => Math.max(...b.counts)));

  return (
    <div style={{ position: 'relative' }}>
      <div ref={wrapRef} onMouseLeave={() => setTip(null)} style={{ width: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', height }}>
          {buckets.map((b, bi) =>
            b.counts.map((c, i) => {
              const x = padL + i * colW + colW * (bi / buckets.length) * 0.7;
              const h = (c / maxCol) * innerH;
              return (
                <rect
                  key={`${bi}-${i}`}
                  x={x}
                  y={padT + innerH - h}
                  width={colW * 0.55}
                  height={h}
                  rx="2.5"
                  fill={b.color}
                  opacity={0.25 + (c / maxCol) * 0.7}
                />
              );
            }),
          )}
          {buckets[0]?.counts.map((_, i) => (
            <text key={i} x={padL + i * colW + colW * 0.3} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">
              {t(buckets[0].label[i])}
            </text>
          ))}
        </svg>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}