import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { AlertStatus, CaseStatus, DetectionClass, RiskLevel } from '../types';
import { alertStatusLabel, caseStatusLabel, clsLabel, riskBadgeClass, riskLabel, statusBadgeClass } from './labels';
import { CLASS_META, RISK_ORDER, downloadDetectionReport } from './mock';
import type { DetectionReportFormat, DetectionReportSource } from './mock';
import { makeT } from './i18n';
import { useStore } from './store';
import { Link } from './router';
import {
  IconAlert,
  IconCheck,
  IconChevRight,
  IconDoc,
  IconDownload,
  IconInfo,
  IconPrint,
  IconX,
} from '../components/Icons';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/*  buttons / cards                                                    */
/* ------------------------------------------------------------------ */
interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  title?: string;
  block?: boolean;
  style?: CSSProperties;
}

export function Button({ children, onClick, variant = 'secondary', size = 'md', disabled, type = 'button', className, title, block, style }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
    >
      {children}
    </button>
  );
}

export function DetectionReportActions({ source, size = 'sm', disabled = false, compact = false }: { source: DetectionReportSource; size?: ButtonProps['size']; disabled?: boolean; compact?: boolean }) {
  const { language, addToast } = useStore();
  const t = makeT(language);

  const exportReport = (format: DetectionReportFormat) => {
    try {
      const file = downloadDetectionReport(source, format, language);
      addToast({ kind: 'success', title: t('rpt.toastExport'), text: t('rpt.toastExportText', { file }) });
    } catch {
      addToast({ kind: 'alert', title: t('rpt.toastExport'), text: t('rpt.toastExportError', { file: format.toUpperCase() }) });
    }
  };

  return (
    <div className={cx('row wrap', compact && 'detection-report-actions-compact')} style={{ gap: compact ? 4 : 6 }}>
      <Button size={size} variant="secondary" onClick={() => exportReport('json')} disabled={disabled} title={t('batch.exportjson')}>
        <IconDownload size={13} /> {compact ? 'JSON' : t('batch.exportjson')}
      </Button>
      <Button size={size} variant="secondary" onClick={() => exportReport('csv')} disabled={disabled} title={t('batch.exportcsv')}>
        <IconDownload size={13} /> {compact ? 'CSV' : t('batch.exportcsv')}
      </Button>
      <Button size={size} variant="primary" onClick={() => exportReport('pdf')} disabled={disabled} title={t('rep.pdf')}>
        <IconPrint size={13} /> {compact ? 'PDF' : t('rep.pdf')}
      </Button>
    </div>
  );
}

export function Card({ children, className, hover, solid, style }: { children: ReactNode; className?: string; hover?: boolean; solid?: boolean; style?: CSSProperties }) {
  return <div className={cx('card', solid && 'solid', hover && 'card-hover', className)} style={style}>{children}</div>;
}

export function CardHead({ kt, title, right }: { kt?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-title">
      <div>
        {kt && <span className="kt">{kt}</span>}
        <h3>{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function PageHead({ kicker, title, sub, right }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head row-between wrap">
      <div style={{ minWidth: 0 }}>
        {kicker && <div className="tiny upper muted" style={{ fontFamily: 'var(--font-mono)', marginBottom: 6 }}>{kicker}</div>}
        <h1>{title}</h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
      {right && <div className="row wrap">{right}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  badges / tags                                                      */
/* ------------------------------------------------------------------ */
export function Badge({ children, tone = 'b-plain', dot }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return (
    <span className={cx('badge', tone)}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function RiskBadge({ risk, label }: { risk: RiskLevel; label?: string }) {
  const { language } = useStore();
  const text = label ?? riskLabel(risk, language);
  return (
    <Badge tone={riskBadgeClass(risk)} dot>
      {text}
    </Badge>
  );
}

export function StatusBadge({ status, caseMode }: { status: AlertStatus | CaseStatus; caseMode?: boolean }) {
  const { language } = useStore();
  const label = caseMode ? caseStatusLabel(status as CaseStatus, language) : alertStatusLabel(status as AlertStatus, language);
  return <Badge tone={statusBadgeClass(status)} dot>{label}</Badge>;
}

export function ClassBadge({ cls }: { cls: DetectionClass }) {
  const { language } = useStore();
  const t = makeT(language);
  const meta = CLASS_META[cls];
  return (
    <span className="row" style={{ gap: 7, fontSize: 13, minWidth: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: meta.color, flex: 'none' }} />
      <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clsLabel(cls, language)}</span>
      {meta.category === 'marine-life' && <span className="tag ml">{t('cat.marine-life')}</span>}
      {meta.category === 'safety' && <span className="tag safety">{t('uic.safety')}</span>}
    </span>
  );
}

export function Tag({ children, kind = 'est' }: { children: ReactNode; kind?: 'ai' | 'est' | 'rec' | 'ver' | 'rule' | 'ml' | 'safety' }) {
  return <span className={cx('tag', kind)}>{children}</span>;
}

export function Kv({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={cx('v', mono && 'mono')}>{v}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  animated counter & stat                                            */
/* ------------------------------------------------------------------ */
export function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const delta = target - start;
    if (delta === 0) {
      setVal(target);
      prev.current = target;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + delta * eased;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function Counter({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const v = useCountUp(value);
  return <>{v.toFixed(decimals)}</>;
}

export function Stat({ kt, value, sub, icon, tone = 'var(--accent)', decimal }: { kt: string; value: number; sub?: ReactNode; icon?: ReactNode; tone?: string; decimal?: number }) {
  return (
    <div className="stat">
      <div className="s-kt">
        <span>{kt}</span>
        {icon && <span className="s-icon" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{icon}</span>}
      </div>
      <div className="s-val" style={{ color: tone }}>
        <Counter value={value} decimals={decimal} />
      </div>
      {sub && <div className="s-sub">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  progress, tabs, segmented                                          */
/* ------------------------------------------------------------------ */
export function Progress({ value, tone, slim }: { value: number; tone?: string; slim?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('progress', slim && 'slim')}>
      <div className="bar" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

export function Tabs({ items, active, onChange }: { items: { id: string; label: ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={active === it.id} className={cx('tab', active === it.id && 'on')} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function ChipGroup({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label?: string }) {
  const toggle = (o: string) => {
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  };
  return (
    <div role="group" aria-label={label}>
      <div className="chip-group">
        {options.map((o) => (
          <button key={o} type="button" className={cx('chip', value.includes(o) && 'on')} onClick={() => toggle(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  forms                                                              */
/* ------------------------------------------------------------------ */
export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('row-between', disabled && '')} style={{ gap: 10, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {hint && <div className="tiny muted">{hint}</div>}
      </div>
      <span className="switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="tk" />
      </span>
    </label>
  );
}

export function Slider({ min, max, step = 1, value, onChange, format }: { min: number; max: number; step?: number; value: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <input className="slider-input" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="mono small" style={{ width: 64, textAlign: 'right', color: 'var(--accent)' }}>{format ? format(value) : value}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  modal / drawer                                                     */
/* ------------------------------------------------------------------ */
export function Modal({ children, onClose, headless, width }: { children: ReactNode; onClose: () => void; headless?: boolean; width?: number | string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className={cx('modal', headless && 'headless')} style={width ? { width: typeof width === 'number' ? `min(${width}px, 100%)` : width } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalHead({ title, onClose, kt }: { title: ReactNode; onClose: () => void; kt?: string }) {
  const { language } = useStore();
  const t = makeT(language);
  return (
    <div className="row-between m-head" style={{ marginBottom: 16 }}>
      <div>
        {kt && <div className="tiny upper muted">{kt}</div>}
        <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
      </div>
      <button className="m-close" onClick={onClose} aria-label={t('common.close')}><IconX /></button>
    </div>
  );
}

export function Drawer({ children, onClose, foot, slim }: { children: ReactNode; onClose: () => void; foot?: ReactNode; slim?: boolean }) {
  const { language } = useStore();
  const t = makeT(language);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="overlay" style={{ background: 'rgba(2,6,12,0.4)' }} onClick={onClose} />
      <div className={cx('drawer', slim && 'slim')} role="dialog" aria-modal="true">
        <div className="d-head">
          <span className="tiny upper muted">{t('uic.caseInspection')}</span>
          <button className="m-close" onClick={onClose} aria-label={t('common.close')}><IconX /></button>
        </div>
        <div className="d-body">{children}</div>
        {foot && <div className="d-foot">{foot}</div>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  tooltip                                                            */
/* ------------------------------------------------------------------ */
export function Tooltip({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <span className="tip-wrap" tabIndex={0}>
      {children}
      <span className="tip">{text}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  empty / loading                                                    */
/* ------------------------------------------------------------------ */
export function EmptyState({ title, desc, icon, action }: { title: string; desc?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 20px' }}>
      <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
        <span className="s-icon" style={{ width: 44, height: 44, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--line-faint)', color: 'var(--ink-3)' }}>
          {icon ?? <IconInfo size={20} />}
        </span>
      </div>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h3>
      {desc && <p className="muted" style={{ maxWidth: 420, margin: '0 auto 18px', fontSize: 13.5 }}>{desc}</p>}
      {action}
    </div>
  );
}

export function LoadingBlock({ text }: { text?: string }) {
  const { language } = useStore();
  const t = makeT(language);
  return (
    <div className="loading-block">
      <span className="spinner" />
      <span>{text ?? t('uic.loading')}</span>
    </div>
  );
}

export function Skeleton({ w, h, m }: { w?: number | string; h?: number; m?: number }) {
  return <div className="skeleton" style={{ width: w ?? '100%', height: h ?? 14, margin: m ?? 4 }} />;
}

/* ------------------------------------------------------------------ */
/*  reveal on scroll                                                   */
/* ------------------------------------------------------------------ */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      });
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx('reveal', inView && 'in', className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  toasts                                                             */
/* ------------------------------------------------------------------ */
export function ToastStack() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', t.kind === 'alert' && 't-critical')} onClick={() => dismissToast(t.id)}>
          <span className="t-icon" style={iconTone(t.kind)}>
            {toastIcon(t.kind)}
          </span>
          <div className="t-body">
            <div className="t-title">{t.title}</div>
            <div className="t-text">{t.text}</div>
            {t.action && (
              <div style={{ marginTop: 6 }}>
                <Link to={t.action.href} className="t-link" onNavigate={() => dismissToast(t.id)}>
                  {t.action.label} →
                </Link>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function iconTone(kind: string): CSSProperties {
  switch (kind) {
    case 'alert':
      return { background: 'var(--critical-dim)', color: 'var(--critical)' };
    case 'critical':
      return { background: 'var(--critical-dim)', color: 'var(--critical)' };
    case 'success':
      return { background: 'var(--low-dim)', color: 'var(--low)' };
    default:
      return { background: 'var(--accent-dim)', color: 'var(--accent)' };
  }
}

function toastIcon(kind: string) {
  switch (kind) {
    case 'alert':
    case 'critical':
      return <IconAlert size={16} />;
    case 'success':
      return <IconCheck size={16} />;
    case 'case':
      return <IconDoc size={16} />;
    default:
      return <IconInfo size={16} />;
  }
}

/* ------------------------------------------------------------------ */
/*  misc helpers                                                       */
/* ------------------------------------------------------------------ */
export function RiskDot({ risk }: { risk: RiskLevel }) {
  const meta = RISK_ORDER.includes(risk)
    ? risk === 'critical'
      ? 'var(--critical)'
      : risk === 'high'
        ? 'var(--high)'
        : risk === 'medium'
          ? 'var(--medium)'
          : 'var(--low)'
    : 'var(--accent)';
  return <span className="legend-dot" style={{ background: meta }} />;
}

export function IconLink({ to, children, className, onNavigate }: { to: string; children: ReactNode; className?: string; onNavigate?: () => void }) {
  return (
    <Link to={to} className={cx('row', className)} onNavigate={onNavigate}>
      {children}
    </Link>
  );
}

export function useClock(interval = 1000): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setT(Date.now()), interval);
    return () => window.clearInterval(i);
  }, [interval]);
  return t;
}

export function Select({ value, onChange, options, id, className, style }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string; className?: string; style?: CSSProperties }) {
  const uid = useId();
  return (
    <select id={id ?? uid} className={cx('select', className)} style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function ScrollLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = () => {
    document.querySelector(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <a className={className} onClick={onClick} style={{ cursor: 'pointer' }}>
      {children}
    </a>
  );
}

export function Breadcrumb({ parts }: { parts: { label: string; href?: string }[] }) {
  return (
    <div className="tb-bread">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">▸</span>}
          {p.href ? <Link to={p.href}>{p.label}</Link> : <span className="here">{p.label}</span>}
        </span>
      ))}
    </div>
  );
}

export function Caret({ open }: { open: boolean }) {
  return (
    <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}>
      <IconChevRight size={14} />
    </span>
  );
}