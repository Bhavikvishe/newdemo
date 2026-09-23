import type {
  Alert,
  AlertStatus,
  Department,
  DepartmentId,
  Detection,
  DetectionClass,
  EquipmentRequest,
  GPSPosition,
  RiskLevel,
  RoutingRule,
  SessionUser,
  Site,
  Language,
} from '../types';

import { makeT } from './i18n';

export type Category = 'debris' | 'anomaly' | 'marine-life' | 'infrastructure' | 'safety';

export interface ClassMeta {
  className: DetectionClass;
  i18nKey: string;
  category: Category;
  color: string;
  sonarTone: number;
  primary: DepartmentId;
  escalation?: DepartmentId;
  hours: number;
  equipment: string[];
  removal: string;
  riskBase: RiskLevel;
  aiModel: string;
  description: string;
}

export const CLASS_META: Record<DetectionClass, ClassMeta> = {
  shipwreck: {
    className: 'shipwreck',
    i18nKey: 'cls.shipwreck',
    category: 'anomaly',
    color: '#46c8f4',
    sonarTone: 150,
    primary: 'marine-operations',
    escalation: 'recovery-response',
    hours: 72,
    equipment: ['Survey ROV', 'Magnetometer Array', 'Lifting Barge', 'Acoustic Marker'],
    removal: 'Controlled lift & tow to salvage yard',
    riskBase: 'medium',
    aiModel: 'yolo-best.pt @ conf 0.41',
    description: 'Large submerged vessel structure with prominent acoustic shadow.',
  },
  pipeline: {
    className: 'pipeline',
    i18nKey: 'cls.pipeline',
    category: 'infrastructure',
    color: '#ff9d45',
    sonarTone: 200,
    primary: 'marine-engineering',
    escalation: 'marine-operations',
    hours: 96,
    equipment: ['Pipe Inspection ROV', 'Hydrotest Kit', 'Flange Kit', 'Cutting Tool'],
    removal: 'Inspect integrity, re-bury or cut & cap segment',
    riskBase: 'medium',
    aiModel: 'yolo-best.pt @ conf 0.38',
    description: 'Linear metallic signal with repeatable echo along heading.',
  },
  ghost_fishing_gear: {
    className: 'ghost_fishing_gear',
    i18nKey: 'cls.ghost_fishing_gear',
    category: 'debris',
    color: '#3fd8c3',
    sonarTone: 120,
    primary: 'marine-environmental',
    escalation: 'recovery-response',
    hours: 48,
    equipment: ['Net Recovery Rig', 'ROV Claw', 'Marker Buoy', 'Winch Line'],
    removal: 'Cut free & recover netting; log entangled fauna',
    riskBase: 'high',
    aiModel: 'yolo-best.pt @ conf 0.44',
    description: 'Ensnaring mesh cluster with scattered high-return points.',
  },
  cylinder: {
    className: 'cylinder',
    i18nKey: 'cls.cylinder',
    category: 'debris',
    color: '#ffd06a',
    sonarTone: 130,
    primary: 'marine-operations',
    escalation: 'marine-environmental',
    hours: 72,
    equipment: ['Lifting Bag', 'Crane Barge', 'Hazmat Skid', 'Dive Team'],
    removal: 'Positive-buoyancy lift, hazmat screening before recovery',
    riskBase: 'medium',
    aiModel: 'yolo-best.pt @ conf 0.47',
    description: 'Cylindrical object producing paired return and strong shadow.',
  },
  manta: {
    className: 'manta',
    i18nKey: 'cls.manta',
    category: 'marine-life',
    color: '#6aa6ff',
    sonarTone: 110,
    primary: 'ocean-survey',
    hours: 0,
    equipment: ['Observation Drone', 'Photogrammetry Kit', 'Passive Hydrophone'],
    removal: 'Monitoring only — no removal action',
    riskBase: 'low',
    aiModel: 'yolo-best.pt @ conf 0.52',
    description: 'Flapping motion signature; no debris-removal alert generated.',
  },
  airplane: {
    className: 'airplane',
    i18nKey: 'cls.airplane',
    category: 'anomaly',
    color: '#c79bff',
    sonarTone: 180,
    primary: 'marine-operations',
    escalation: 'recovery-response',
    hours: 48,
    equipment: ['Deep Recovery ROV', 'Recovery Sling', 'Salvage Barge'],
    removal: 'Documentation, black-box recovery, staged lift',
    riskBase: 'high',
    aiModel: 'yolo-best.pt @ conf 0.43',
    description: 'Wing-span geometry with high-confidence fuselage return.',
  },
  human: {
    className: 'human',
    i18nKey: 'cls.human',
    category: 'safety',
    color: '#ff5b63',
    sonarTone: 210,
    primary: 'search-rescue',
    escalation: 'marine-operations',
    hours: 6,
    equipment: ['Dive Team', 'Rescue Skiff', 'Emergency Beacon', 'Med Kit'],
    removal: 'Search & rescue protocol — immediate response',
    riskBase: 'critical',
    aiModel: 'yolo-best.pt @ conf 0.58',
    description: 'Biometric signature in low depth. Safety/emergency category.',
  },
};

export const CLASS_LIST: DetectionClass[] = [
  'shipwreck',
  'pipeline',
  'ghost_fishing_gear',
  'cylinder',
  'manta',
  'airplane',
  'human',
];

export const RISK_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

export const classListByCat = (cat: Category): DetectionClass[] =>
  CLASS_LIST.filter((c) => CLASS_META[c].category === cat);

const U = (d: DepartmentId, name: string, short: string, _idLabel: string, color: string, status: Department['status']) =>
  ({
    id: d,
    name,
    shortName: short,
    description: '',
    color,
    icon: d,
    responsibilities: [],
    members: [],
    status,
    activeOperators: 0,
    openAlerts: 0,
    criticalCases: 0,
    inProgressCases: 0,
    avgResponseTime: 0,
    workload: 0,
    routingRules: [],
  }) as Department;

export const DEPARTMENTS: Department[] = [
  U('marine-operations', 'Marine Operations', 'MOP', 'MOP-01', '#46c8f4', 'online'),
  U('marine-engineering', 'Marine Engineering', 'MEG', 'MEG-02', '#ff9d45', 'online'),
  U('marine-environmental', 'Marine Environmental Operations', 'ENV', 'ENV-03', '#3fd8c3', 'busy'),
  U('search-rescue', 'Search & Rescue / Safety', 'SAR', 'SAR-04', '#ff5b63', 'standby'),
  U('ocean-survey', 'Ocean Survey & Monitoring', 'SRV', 'SRV-05', '#6aa6ff', 'standby'),
  U('recovery-response', 'Recovery & Response Team', 'RRT', 'RRT-06', '#c79bff', 'online'),
  U('system-admin', 'System Administrator', 'SYS', 'SYS-AD', '#e6e9ef', 'online'),
];

export const deptById = (id: DepartmentId) => DEPARTMENTS.find((d) => d.id === id)!;
export const deptColor = (id: DepartmentId) => deptById(id).color;

export const OPERATORS: Record<DepartmentId, string[]> = {
  'marine-operations': ['A. Fernandes', 'R. Kadam', 'S. Iyer', 'N. Shaikh'],
  'marine-engineering': ['V. Kulkarni', 'D. Nair', 'P. Joshi'],
  'marine-environmental': ['M. Patil', "L. D'Silva", 'T. Rao'],
  'search-rescue': ['K. Mehta', 'J. Quadros', 'S. Pawar'],
  'ocean-survey': ['G. Banerjee', 'H. Prakash', 'A. Varma'],
  'recovery-response': ['R. Gaikwad', 'B. Halder', 'C. Mascarenhas'],
  'system-admin': ['SysAdmin'],
};

/* ------------------------------------------------------------------ */
/*  seeded random                                                      */
/* ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260911);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + rnd() * (max - min);
const nint = (min: number, max: number) => Math.floor(between(min, max + 1));

function toISO(d: Date) {
  return d.toISOString();
}

export const SITES: Site[] = [
  { name: 'Arabian Sea — Mumbai shelf', lat: 19.08, lng: 72.47, depth: 32 },
  { name: 'Panvel — Thane Creek', lat: 18.97, lng: 72.96, depth: 18 },
  { name: 'Gateway — Mumbai Harbour', lat: 18.89, lng: 72.83, depth: 24 },
  { name: 'Uran Channel', lat: 18.85, lng: 72.92, depth: 15 },
  { name: 'Alibag offshore', lat: 18.6, lng: 72.98, depth: 27 },
  { name: 'Koliwada shoal', lat: 18.71, lng: 72.81, depth: 21 },
  { name: 'Vasai Creek', lat: 19.32, lng: 72.78, depth: 12 },
  { name: 'Dahanu shelf', lat: 19.75, lng: 72.58, depth: 40 },
  { name: 'Kochi approach', lat: 9.94, lng: 76.18, depth: 55 },
  { name: 'Vizag shelf', lat: 17.51, lng: 83.4, depth: 64 },
  { name: 'Goa bank', lat: 15.42, lng: 73.62, depth: 38 },
  { name: 'Andaman rise', lat: 11.62, lng: 92.75, depth: 260 },
  { name: 'Ratnagiri deep', lat: 16.98, lng: 72.1, depth: 120 },
  { name: 'Gulf of Khambhat', lat: 21.6, lng: 72.5, depth: 14 },
];

function pickSite(seed: number) {
  return SITES[seed % SITES.length];
}

/* ------------------------------------------------------------------ */
/*  detection factory                                                  */
/* ------------------------------------------------------------------ */
let detCounter = 3000 + nint(1, 900);

export function fmtCoordinate(lat: number, lng: number): string {
  const la = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${la}, ${lo}`;
}

export function makeDetection(opts: {
  className?: DetectionClass;
  iso?: string;
  site?: Site;
  risk?: RiskLevel;
  tag?: string;
  rng?: () => number;
  imageId?: string;
  source?: 'upload';
} = {}): Detection {
  const r = opts.rng ?? rnd;
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const between = (min: number, max: number) => min + r() * (max - min);
  const nint = (min: number, max: number) => Math.floor(between(min, max + 1));
  const className = opts.className ?? pick(CLASS_LIST);
  const meta = CLASS_META[className];
  const site = opts.site ?? pickSite(nint(0, SITES.length - 1));
  const iso = opts.iso ?? toISO(new Date(Date.now() - between(0, 6) * 3600e3));
  const gps: GPSPosition = {
    latitude: site.lat + between(-0.06, 0.06),
    longitude: site.lng + between(-0.05, 0.05),
    accuracy: nint(2, 6),
    timestamp: iso,
  };

  detCounter += 1;
  const seq = String(detCounter).padStart(4, '0');
  const id = `OCX-${new Date(iso).getFullYear()}-${seq}`;

  const risk =
    opts.risk ??
    (meta.riskBase === 'medium'
      ? (['medium', 'medium', 'high', 'low'] as RiskLevel[])[nint(0, 3)]
      : meta.riskBase);

  const hours = meta.hours || 24;
  const deadline = toISO(new Date(new Date(iso).getTime() + hours * 3600e3));

  const dimScale = className === 'human' ? 1 : className === 'manta' ? 2.4 : 1;
  const length = +(between(1.4, 24) * dimScale).toFixed(1);
  const width = +(length * between(0.28, 0.5)).toFixed(1);
  const height = +(length * between(0.15, 0.34)).toFixed(1);

  const estWeight = className === 'airplane' ? nint(9000, 30000) : className === 'shipwreck' ? nint(4000, 48000) : className === 'pipeline' ? nint(900, 4200) : className === 'human' ? nint(45, 90) : nint(40, 640);
  const unit = 'kg';
  const wMin = Math.max(10, Math.round(estWeight * between(0.82, 0.95)));
  const wMax = Math.round(estWeight * between(1.05, 1.28));

  const confidence = +(between(0.58, 0.97)).toFixed(3);
  const bbox = {
    x: +(between(0.2, 0.68)).toFixed(2),
    y: +(between(0.18, 0.62)).toFixed(2),
    width: +(between(0.12, 0.42)).toFixed(2),
    height: +(between(0.1, 0.34)).toFixed(2),
    normalized: true,
  };

  const riskScore =
    risk === 'critical'
      ? nint(88, 98)
      : risk === 'high'
        ? nint(72, 87)
        : risk === 'medium'
          ? nint(45, 71)
          : nint(18, 44);

  return {
    id,
    imageId: opts.imageId ?? `son-${id.toLowerCase()}`,
    className,
    confidence,
    boundingBox: bbox,
    gps,
    estimatedSize: { length, width, height, unit: 'm' },
    estimatedWeight: { min: wMin, max: wMax, unit, confidence: +(between(0.66, 0.9)).toFixed(2) },
    riskLevel: risk,
    riskScore,
    priority: risk === 'critical' ? 1 : risk === 'high' ? 2 : risk === 'medium' ? 3 : 4,
    responseDeadline: deadline,
    department: meta.primary,
    recommendedEquipment: meta.equipment,
    removalMethod: meta.removal,
    verificationStatus: 'pending',
    notes: meta.description,
    assignedOperator: undefined,
    detectionTime: iso,
    createdAt: iso,
    updatedAt: iso,
    aiPrediction: true,
    estimated: true,
    recommended: true,
    source: opts.source,
    manualVerificationRequired: risk === 'critical' || risk === 'high' ? true : false,
  };
}

export function createRandomDetection(className?: DetectionClass, site?: Site): Detection {
  return makeDetection({ className, site });
}

function hashFileKey(file: File): number {
  const key = `${file.name}:${file.size}:${file.lastModified}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeDetectionFromFile(
  file: File,
  opts: {
    className?: DetectionClass;
    confidence?: number;
    bbox?: { x: number; y: number; width: number; height: number };
  } = {},
): Detection {
  const iso = new Date(file.lastModified || Date.now()).toISOString();
  const det = makeDetection({
    className: opts.className,
    iso,
    rng: mulberry32(hashFileKey(file)),
    imageId: file.name,
    source: 'upload',
  });
  if (opts.confidence != null) det.confidence = opts.confidence;
  if (opts.bbox) det.boundingBox = { ...det.boundingBox, ...opts.bbox, normalized: true };
  return det;
}

/* ------------------------------------------------------------------ */
/*  timeline + alerts                                                  */
/* ------------------------------------------------------------------ */
function alertTimeline(det: Detection, status: AlertStatus) {
  const ev = (type: string, title: string, description: string, min: number, actor: string, department: DepartmentId, extra: Record<string, unknown> = {}) => ({
    id: `tl-${det.id}-${min}`,
    type,
    title,
    description,
    timestamp: toISO(new Date(new Date(det.detectionTime).getTime() + min * 60000)),
    actor,
    department,
    ...extra,
  } as Alert['timeline'][number]);

  const meta = CLASS_META[det.className];
  const rows: Alert['timeline'][] = [];

  rows.push([
    ev('detection', 'Sonar detection recorded', `Side-scan frame confirmed ${meta.description}`, 0, 'OCEONIX AI', det.department, { meta: det.detectionTime }),
    ev('analysis', 'Marine intelligence analysis', `Class ${det.className.toUpperCase()} at conf ${(det.confidence * 100).toFixed(1)}%.`, 2, 'OCEONIX AI', det.department),
    ev('verification', 'Confidence verification', det.confidence > 0.8 ? 'Auto-verified above threshold.' : 'Manual verification requested.', 5, 'OCEONIX AI', det.department),
    ev('assignment', 'Alert routed', `Routed to ${meta.primary} by routing rule.`, 7, 'Routing Engine', det.department),
    ev('note', 'Department notified', `Inbox notification pushed to ${meta.primary} operators.`, 8, 'Routing Engine', det.department),
  ]);

  if (['acknowledged', 'assigned', 'in_progress', 'manual_verification', 'resolved', 'escalated', 'overdue'].includes(status)) {
    rows.push([
      ev('assignment', 'Operator assignment', `Case acknowledged and assigned to operator.`, 42, pick(OPERATORS[det.className === 'human' ? 'search-rescue' : meta.primary] ?? OPERATORS[meta.primary]), det.department),
    ]);
  }
  if (['resolved'].includes(status)) {
    rows.push([ev('note', 'Notes recorded', 'Verifier: imagery confirmed. Field log archived.', 430, 'Verifier', det.department)]);
  }
  if (['in_progress', 'resolved', 'escalated', 'manual_verification'].includes(status)) {
    rows.push([ev('response', 'Field response started', `Scheduled ${det.removalMethod.toLowerCase()}.`, 140, 'Field Coordinator', det.department)]);
  }
  if (['in_progress', 'escalated', 'manual_verification'].includes(status)) {
    rows.push([ev('equipment_request', 'Equipment dispatched', `${det.recommendedEquipment.slice(0, 2).join(' + ')} en route.`, 260, 'Logistics', det.department)]);
  }
  if (status === 'overdue' || status === 'escalated') {
    rows.push([
      ev('escalation', 'Escalation workflow', `Response budget exceeded. Escalated to ${meta.escalation ?? det.department}.`, 300, 'Escalation Engine', det.department),
    ]);
  }
  if (status === 'resolved') {
    rows.push([
      ev('resolution', 'Case resolved', `Recovery complete. ${det.removalMethod}.`, 420, 'Field Coordinator', det.department),
      ev('verification', 'Resolution verified', 'Post-recovery imagery logged and accepted.', 460, 'Verifier', det.department),
    ]);
  }
  return rows.flat();
}

let alertCounter = 200;

function makeAlert(det: Detection, status: AlertStatus): Alert {
  alertCounter += 1;
  const id = `AL-${alertCounter}`;
  const meta = CLASS_META[det.className];
  const open = new Date(det.detectionTime).getTime();
  const deadlineMs = open + meta.hours * 3600e3;
  const overdue = (status === 'new' || status === 'unacknowledged' || status === 'assigned' || status === 'in_progress') && Date.now() > deadlineMs;
  const finalStatus: AlertStatus = overdue ? 'overdue' : status;

  return {
    id,
    alertId: id,
    detectionId: det.id,
    detection: det,
    status: finalStatus,
    priority: det.priority,
    assignedDepartment: det.department,
    assignedOperator: ['assigned', 'in_progress', 'resolved'].includes(finalStatus) ? pick(OPERATORS[meta.primary] ?? OPERATORS['marine-operations']) : undefined,
    escalationDepartment: meta.escalation,
    escalatedAt: finalStatus === 'escalated' ? toISO(new Date(open + 300 * 60000)) : undefined,
    acknowledgedAt: ['assigned', 'in_progress', 'resolved', 'overdue'].includes(finalStatus) ? toISO(new Date(open + 40 * 60000)) : undefined,
    assignedAt: ['assigned', 'in_progress', 'resolved'].includes(finalStatus) ? toISO(new Date(open + 45 * 60000)) : undefined,
    startedAt: ['in_progress', 'resolved'].includes(finalStatus) ? toISO(new Date(open + 140 * 60000)) : undefined,
    resolvedAt: finalStatus === 'resolved' ? toISO(new Date(open + 420 * 60000)) : undefined,
    verifiedAt: finalStatus === 'resolved' ? toISO(new Date(open + 460 * 60000)) : undefined,
    responseDeadline: det.responseDeadline,
    overdue,
    timeline: alertTimeline(det, finalStatus),
    departmentNotes: [],
    equipmentRequested: [],
  };
}

function eqRequest(det: Detection, status: string): EquipmentRequest[] {
  if (!['assigned', 'in_progress', 'resolved', 'overdue'].includes(status)) return [];
  const ts = (min: number) => toISO(new Date(new Date(det.detectionTime).getTime() + min * 60000));
  return det.recommendedEquipment.slice(0, 2).map((eq, i) => ({
    id: `eq-${det.id}-${i}`,
    equipment: eq,
    quantity: 1,
    status: status === 'resolved' ? 'returned' : status === 'in_progress' ? 'dispatched' : 'approved',
    requestedAt: ts(260),
    approvedAt: ts(275),
    dispatchedAt: status === 'resolved' || status === 'in_progress' ? ts(290) : undefined,
  }));
}

export interface SeedData {
  detections: Detection[];
  alerts: Alert[];
  generatedAt: string;
}

export function generateSeedData(): SeedData {
  const plan: { cls: DetectionClass; count: number }[] = [
    { cls: 'shipwreck', count: 9 },
    { cls: 'pipeline', count: 7 },
    { cls: 'ghost_fishing_gear', count: 10 },
    { cls: 'cylinder', count: 9 },
    { cls: 'manta', count: 6 },
    { cls: 'airplane', count: 5 },
    { cls: 'human', count: 4 },
  ];

  const now = Date.now();
  const detections: Detection[] = [];
  let idx = 0;

  plan.forEach((p, pi) => {
    for (let i = 0; i < p.count; i++) {
      const ageDays = now - idx * (1000 * 3600 * 24 * (p.count > 4 ? 4.2 : 7.5));
      const iso = toISO(new Date(ageDays - between(0, 24) * 3600e3));
      const site = pickSite(pi * 3 + i * 2 + 1);
      const classRiskPool: RiskLevel[] =
        p.cls === 'ghost_fishing_gear' ? ['high', 'medium', 'high', 'critical'] :
        p.cls === 'airplane' ? ['high', 'medium', 'critical'] :
        p.cls === 'human' ? ['critical', 'high'] :
        p.cls === 'manta' ? ['low'] :
        p.cls === 'pipeline' ? ['medium', 'high', 'medium'] : ['medium', 'low', 'medium', 'high'];
      const det = makeDetection({
        className: p.cls,
        iso,
        site,
        risk: classRiskPool[idx % classRiskPool.length],
      });
      detections.push(det);
      idx++;
    }
  });

  detections.sort((a, b) => (a.detectionTime < b.detectionTime ? 1 : -1));

  const alerts: Alert[] = [];
  detections.forEach((det, i) => {
    const meta = CLASS_META[det.className];
    if (meta.category === 'marine-life') return;

    const ageH = (now - new Date(det.detectionTime).getTime()) / 3600e3;
    let status: AlertStatus;
    if (ageH < 10) status = ['new', 'unacknowledged', 'new'][i % 3] as AlertStatus;
    else if (ageH < 40) status = ['assigned', 'in_progress', 'unacknowledged'][i % 3] as AlertStatus;
    else if (det.className === 'human') status = 'resolved';
    else status = i % 4 === 0 ? 'in_progress' : i % 5 === 0 ? 'overdue' : 'resolved';

    const alert = makeAlert(det, status);
    alert.equipmentRequested = eqRequest(det, status);
    if (alert.equipmentRequested.length) {
      alert.timeline.push({
        id: `tl-${det.id}-eq`,
        type: 'equipment_request',
        title: 'Equipment request',
        description: `${alert.equipmentRequested.map((e) => e.equipment).join(', ')} requested by department.`,
        timestamp: toISO(new Date(new Date(det.detectionTime).getTime() + 260 * 60000)),
        actor: 'Department Logistics',
        department: det.department,
      });
    }
    alerts.push(alert);
  });

  return { detections, alerts, generatedAt: toISO(new Date(now)) };
}

/* ------------------------------------------------------------------ */
/*  formatting helpers                                                 */
/* ------------------------------------------------------------------ */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDT(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeAgo(iso: string, lang: Language = 'en'): string {
  const t = makeT(lang);
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('time.justNow');
  if (m < 60) return t('time.minAgo', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hrAgo', { h });
  const d = Math.floor(h / 24);
  if (d < 30) return t('time.dayAgo', { d });
  return fmtDT(iso);
}

export function deadlineIn(hours: number): string {
  if (hours <= 0) return 'EXPIRED';
  if (hours < 48) return `${hours}h remaining`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h remaining`;
}

export function remTime(deadline: string): string {
  const h = (new Date(deadline).getTime() - Date.now()) / 3600e3;
  return deadlineIn(Math.floor(h));
}

export function fmtWeight(w: { min: number; max: number; unit: string }): string {
  if (w.max >= 1000) {
    return `${(w.min / 1000).toFixed(1)}–${(w.max / 1000).toFixed(1)} t`;
  }
  return `${w.min}–${w.max} kg`;
}

export function fmtSize(s: { length: number; width: number; height: number; unit: string }): string {
  return `${s.length.toFixed(1)} × ${s.width.toFixed(1)} × ${s.height.toFixed(1)} ${s.unit}`;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toCSV(rows: Record<string, string | number | undefined>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function downloadPDF(html: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.print();
}

export function download(name: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function sessionFor(dept: DepartmentId, username: string): SessionUser {
  const d = deptById(dept);
  return {
    username,
    name: username,
    department: dept,
    role: d.id === 'system-admin' ? 'admin' : 'manager',
    departmentLabel: d.name,
    departmentIdLabel: d.shortName + (d.id === 'system-admin' ? '-AD' : ''),
    color: d.color,
  };
}

export const NOTIFICATION_TEMPLATES = {
  ghost: {
    title: 'New high-priority alert',
    body: 'Ghost fishing gear detected — 87.4% confidence, HIGH risk.',
  },
  shipwreck: {
    title: 'New shipwreck detection',
    body: 'Requires verification before routing.',
  },
  human: {
    title: 'Emergency — person detected',
    body: 'Safety category. Immediate response required.',
  },
};

export function escalationDept(det: Detection): DepartmentId {
  return CLASS_META[det.className].escalation ?? det.department;
}

export function buildRoutingRules(): RoutingRule[] {
  return CLASS_LIST.filter((c) => CLASS_META[c].category !== 'marine-life').map((c) => {
    const m = CLASS_META[c];
    return {
      id: `rr-${c}`,
      objectClass: c,
      primaryDepartment: m.primary,
      escalationDepartment: m.escalation,
      responseTimeHours: m.hours,
      equipment: m.equipment,
      autoAssign: c === 'human',
    };
  });
}

export function departmentWorkload(alerts: Alert[]): Record<DepartmentId, number> {
  const out = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, 0])) as Record<DepartmentId, number>;
  alerts.forEach((a) => {
    out[a.detection.department] += 1;
  });
  return out;
}