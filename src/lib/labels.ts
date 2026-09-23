import type { AlertStatus, CaseStatus, DetectionClass, Language, RiskLevel } from '../types';
import { CLASS_META } from './mock';
import type { Category } from './mock';
import { makeT } from './i18n';

export function clsLabel(cls: DetectionClass, lang: Language): string {
  const t = makeT(lang);
  switch (cls) {
    case 'shipwreck': return t('cls.shipwreck');
    case 'pipeline': return t('cls.pipeline');
    case 'ghost_fishing_gear': return t('cls.ghost_fishing_gear');
    case 'cylinder': return t('cls.cylinder');
    case 'manta': return t('cls.manta');
    case 'airplane': return t('cls.airplane');
    case 'human': return t('cls.human');
    case 'mine': return t('cls.mine');
  }
}

export function clsShort(cls: DetectionClass): string {
  switch (cls) {
    case 'ghost_fishing_gear': return 'GFG';
    case 'mine': return 'MINE';
    default: return cls.slice(0, 4).toUpperCase();
  }
}

export function riskLabel(r: RiskLevel, lang: Language): string {
  const t = makeT(lang);
  switch (r) {
    case 'critical': return t('risk.critical');
    case 'high': return t('risk.high');
    case 'medium': return t('risk.medium');
    case 'low': return t('risk.low');
  }
}

export function riskKey(r: RiskLevel): string {
  return `risk.${r}`;
}

export function categoryLabel(c: Category, lang: Language): string {
  const t = makeT(lang);
  switch (c) {
    case 'debris': return t('cat.debris');
    case 'anomaly': return t('cat.anomaly');
    case 'infrastructure': return t('cat.infrastructure');
    case 'marine-life': return t('cat.marine-life');
    case 'safety': return t('cat.safety');
  }
}

export function categoryOf(cls: DetectionClass): Category {
  return CLASS_META[cls].category;
}

export function alertStatusLabel(s: AlertStatus, lang: Language): string {
  const t = makeT(lang);
  switch (s) {
    case 'new': return t('st.new');
    case 'unacknowledged': return t('st.unacknowledged');
    case 'pending': return t('st.pending');
    case 'assigned': return t('st.assigned');
    case 'in_progress': return t('st.in_progress');
    case 'manual_verification': return t('st.verification');
    case 'resolved': return t('st.resolved');
    case 'overdue': return t('st.overdue');
    case 'escalated': return t('st.escalated');
  }
}

export function caseStatusLabel(s: CaseStatus, lang: Language): string {
  const t = makeT(lang);
  switch (s) {
    case 'open': return t('st.open');
    case 'acknowledged': return t('st.acknowledged');
    case 'assigned': return t('st.assigned');
    case 'in_progress': return t('st.in_progress');
    case 'verification_required': return t('st.verification');
    case 'resolved': return t('st.resolved');
    case 'verified': return t('st.verified');
    case 'closed': return t('st.closed');
  }
}

export function riskBadgeClass(r: RiskLevel): string {
  if (r === 'critical') return 'b-risk-critical';
  if (r === 'high') return 'b-risk-high';
  if (r === 'medium') return 'b-risk-medium';
  return 'b-risk-low';
}

export function riskColor(r: RiskLevel): string {
  switch (r) {
    case 'critical': return 'var(--critical)';
    case 'high': return 'var(--high)';
    case 'medium': return 'var(--medium)';
    case 'low': return 'var(--low)';
  }
}

export function statusBadgeClass(s: AlertStatus | CaseStatus): string {
  const open = ['new', 'open', 'unacknowledged', 'pending'];
  const prog = ['assigned', 'in_progress', 'acknowledged'];
  const done = ['resolved', 'verified', 'closed'];
  const bad = ['overdue', 'escalated', 'manual_verification', 'verification_required'];
  if (bad.includes(s)) return 'b-risk-high';
  if (prog.includes(s)) return 'b-accent';
  if (done.includes(s)) return 'b-teal';
  if (open.includes(s)) return 'b-plain';
  return 'b-plain';
}