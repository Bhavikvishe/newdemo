import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Alert,
  AlertStatus,
  AppNotification,
  DepartmentId,
  Detection,
  Language,
  RegisteredUser,
  SessionUser,
  SettingsConfig,
  SignupInput,
  ToastItem,
  InterdepartmentalAidRecord,
} from '../types';
import { navigate } from './router';
import {
  CLASS_META,
  sessionFor,
  deptById,
  deptColor,
  OPERATORS,
} from './mock';
import { makeT } from './i18n';
import { clearCachedImages } from './detect';

const STORE_KEY = 'oceonix.store.v1';

interface PersistShape {
  user: SessionUser | null;
  theme: 'dark' | 'light';
  language: Language;
  settings: SettingsConfig;
  onboardingSeen: boolean;
  detections: Detection[];
  alerts: Alert[];
  notifications: AppNotification[];
  tourIntroSeen: boolean;
  registeredUsers: RegisteredUser[];
  aidHistory?: InterdepartmentalAidRecord[];
}

const DEFAULT_SETTINGS: SettingsConfig = {
  detectionConfidenceThreshold: 0.4,
  riskThresholds: { low: 20, medium: 45, high: 70, critical: 88 },
  alertResponseTimes: { critical: 6, high: 48, medium: 96, low: 240 },
  debrisClasses: ['shipwreck', 'pipeline', 'ghost_fishing_gear', 'cylinder', 'airplane'],
  departmentRules: [],
  equipmentRules: [],
  sonarCalibration: { gain: 58, range: 120, frequency: 600, tvg: 24, beamWidth: 0.7 },
  notificationPreferences: {
    email: true,
    push: true,
    sound: false,
    criticalOnly: false,
    departmentAlerts: true,
    systemAlerts: true,
    dailyDigest: false,
  },
  theme: 'dark',
  animationLevel: 'full',
  demoMode: false,
};

function loadPersist(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed.detections || !Array.isArray(parsed.detections)) return null;
    // Keep only genuine real model detections, filtering out synthetic mock/demo detections
    const real = parsed.detections.filter((d) => d.source === 'upload' && (d.isRealModel || d.id?.startsWith('REAL-') || d.id?.startsWith('BATCH-REAL-')));
    const kept = new Set(real.map((d) => d.id));
    parsed.detections = real;
    parsed.alerts = (parsed.alerts ?? []).filter((a) => kept.has(a.detectionId));
    parsed.notifications = (parsed.notifications ?? []).filter((n) => !n.detectionId || kept.has(n.detectionId));
    parsed.aidHistory = parsed.aidHistory ?? [];
    if (parsed.settings) {
      parsed.settings.demoMode = false;
    }
    return parsed;
  } catch {
    return null;
  }
}

let toastCounter = 0;
let notifCounter = 0;

interface StoreApi {
  user: SessionUser | null;
  theme: 'dark' | 'light';
  language: Language;
  settings: SettingsConfig;
  onboardingSeen: boolean;
  tourOpen: boolean;
  detections: Detection[];
  alerts: Alert[];
  notifications: AppNotification[];
  toasts: ToastItem[];
  registeredUsers: RegisteredUser[];
  aidHistory: InterdepartmentalAidRecord[];
  login: (username: string, dept: DepartmentId, password?: string) => boolean;
  register: (input: SignupInput) => { ok: boolean; error?: string };
  assignTask: (alertId: string, department: DepartmentId, operator: string) => void;
  interdepartmentalTransfer: (alertId: string, fromDept: DepartmentId, toDept: DepartmentId, targetOperator: string, reason: string) => boolean;
  autoBalanceWorkload: (targetOverloadedDept?: DepartmentId) => { transferredCount: number; summary: string };
  requestInterdepartmentalAid: (dept: DepartmentId, note?: string) => void;
  seedSurgeScenario: () => void;
  logout: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  setLanguage: (l: Language) => void;
  updateSettings: (patch: Partial<SettingsConfig>) => void;
  saveSettings: () => void;
  resetSettings: () => void;
  addToast: (t: Omit<ToastItem, 'id' | 'ts'>) => void;
  dismissToast: (id: string) => void;
  dismissNotification: (id: string) => void;
  markNotificationsRead: () => void;
  recordDetection: (det: Detection, opts?: { silent?: boolean }) => void;
  acknowledgeAlert: (id: string, operator?: string) => void;
  assignOperator: (id: string, operator: string) => void;
  requestVerification: (id: string) => void;
  acceptCase: (id: string, operator?: string) => void;
  setAlertStatus: (id: string, status: AlertStatus) => void;
  requestEquipment: (id: string) => void;
  addNote: (id: string, content: string) => void;
  escalateAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  verifyAlert: (id: string) => void;
  completeOnboarding: () => void;
  openTour: () => void;
  closeTour: () => void;
  clearAll: () => void;
  clearDetectionHistory: () => void;
}

const Ctx = createContext<StoreApi | null>(null);

function applySettingsMerge(current: SettingsConfig, patch: Partial<SettingsConfig>): SettingsConfig {
  return { ...current, ...patch, riskThresholds: patch.riskThresholds ?? current.riskThresholds, alertResponseTimes: patch.alertResponseTimes ?? current.alertResponseTimes, sonarCalibration: patch.sonarCalibration ?? current.sonarCalibration, notificationPreferences: patch.notificationPreferences ?? current.notificationPreferences, departmentRules: patch.departmentRules ?? current.departmentRules, equipmentRules: patch.equipmentRules ?? current.equipmentRules, debrisClasses: patch.debrisClasses ?? current.debrisClasses };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const persisted = useRef<PersistShape | null>(loadPersist());

  const [user, setUser] = useState<SessionUser | null>(persisted.current?.user ?? null);
  const [theme, setTheme] = useState<'dark' | 'light'>(persisted.current?.theme ?? 'dark');
  const [language, setLanguage] = useState<Language>(persisted.current?.language ?? 'en');
  const [settings, setSettings] = useState<SettingsConfig>(persisted.current?.settings ?? DEFAULT_SETTINGS);
  const [onboardingSeen, setOnboardingSeen] = useState(persisted.current?.onboardingSeen ?? false);
  const [tourOpen, setTourOpen] = useState(false);
  const [detections, setDetections] = useState<Detection[]>(persisted.current?.detections ?? []);
  const [alerts, setAlerts] = useState<Alert[]>(persisted.current?.alerts ?? []);
  const [notifications, setNotifications] = useState<AppNotification[]>(persisted.current?.notifications ?? []);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>(persisted.current?.registeredUsers ?? []);
  const [aidHistory, setAidHistory] = useState<InterdepartmentalAidRecord[]>(persisted.current?.aidHistory ?? []);

  const t = makeT(language);

  const save = useCallback(() => {
    const shape: PersistShape = {
      user,
      theme,
      language,
      settings,
      onboardingSeen,
      detections,
      alerts,
      notifications,
      tourIntroSeen: true,
      registeredUsers,
      aidHistory,
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(shape));
    } catch {
      /* storage unavailable */
    }
  }, [user, theme, language, settings, onboardingSeen, detections, alerts, notifications, registeredUsers, aidHistory]);

  useEffect(() => {
    save();
  }, [save]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<ToastItem, 'id' | 'ts'>) => {
    toastCounter += 1;
    const id = `toast-${toastCounter}`;
    setToasts((ts) => [...ts.slice(-4), { ...t, id, ts: Date.now() }]);
    window.setTimeout(() => dismissToast(id), 9000);
  }, [dismissToast]);

  const pushNotification = useCallback((n: Omit<AppNotification, 'id' | 'ts' | 'unread'>) => {
    notifCounter += 1;
    const item: AppNotification = { ...n, id: `ntf-${notifCounter}`, ts: new Date().toISOString(), unread: true };
    setNotifications((ns) => [item, ...ns].slice(0, 40));
    return item;
  }, []);

  const login = useCallback((username: string, dept: DepartmentId, password = '') => {
    const account = registeredUsers.find(
      (r) => r.username.toLowerCase() === username.trim().toLowerCase() || r.email.toLowerCase() === username.trim().toLowerCase(),
    );
    if (account) {
      if (account.department !== dept) {
        addToast({ kind: 'alert', title: t('stx.loginRejected'), text: t('stx.loginRejectedText', { dept: deptName(account.department) }) });
        return false;
      }
      if (account.password !== password) {
        addToast({ kind: 'alert', title: t('stx.invalidCredentials'), text: t('stx.invalidCredentialsText') });
        return false;
      }
    }
    setUser(sessionFor(dept, account ? account.username : username));
    navigate('overview');
    addToast({ kind: 'success', title: t('stx.authSuccess'), text: t('stx.authSuccessText') });
    return true;
  }, [registeredUsers, addToast, language]);

  const register = useCallback((input: SignupInput) => {
    const name = input.name.trim();
    const email = input.email.trim();
    const username = input.username.trim();
    if (!name || !email || !username || !input.password) {
      return { ok: false, error: t('stx.allFieldsRequired') };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: t('stx.invalidEmail') };
    }
    if (input.password.length < 6) {
      return { ok: false, error: t('stx.passwordTooShort') };
    }
    if (registeredUsers.some((r) => r.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: t('stx.usernameTaken') };
    }
    if (registeredUsers.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: t('stx.emailExists') };
    }
    const account: RegisteredUser = {
      id: `usr-${Date.now()}`,
      name,
      email,
      username,
      password: input.password,
      department: input.department,
      role: input.department === 'system-admin' ? 'admin' : 'operator',
      createdAt: new Date().toISOString(),
    };
    setRegisteredUsers((rs) => [...rs, account]);
    addToast({ kind: 'success', title: t('stx.accountCreated'), text: t('stx.accountCreatedText', { name, dept: deptName(input.department) }) });
    return { ok: true };
  }, [registeredUsers, addToast, language]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORE_KEY);
    setUser(null);
    navigate('login');
    addToast({ kind: 'info', title: t('stx.sessionEnded'), text: t('stx.sessionEndedText') });
  }, [addToast, language]);

  const recordDetection = useCallback((det: Detection, opts: { silent?: boolean } = {}) => {
    const meta = CLASS_META[det.className];
    const isHuman = det.className === 'human';
    const isMarine = meta.category === 'marine-life';

    setDetections((ds) => [det, ...ds]);

    if (!isMarine) {
      const alertId = `AL-${Math.floor(900 + Math.random() * 900)}`;
      const alert: Alert = {
        id: alertId,
        alertId,
        detectionId: det.id,
        detection: det,
        status: 'new',
        priority: det.priority,
        assignedDepartment: det.department,
        escalationDepartment: meta.escalation,
        responseDeadline: det.responseDeadline,
        overdue: false,
        timeline: [
          {
            id: `tl-${det.id}-0`,
            type: 'detection',
            title: t('stx.tlDetection'),
            description: t('stx.tlDetectionDesc'),
            timestamp: det.detectionTime,
            actor: 'OCEONIX AI',
            department: det.department,
          },
          {
            id: `tl-${det.id}-1`,
            type: 'analysis',
            title: t('stx.tlAnalysis'),
            description: t('stx.tlAnalysisDesc', { desc: meta.description, pct: (det.confidence * 100).toFixed(1) }),
            timestamp: det.detectionTime,
            actor: 'OCEONIX AI',
            department: det.department,
          },
          {
            id: `tl-${det.id}-2`,
            type: 'assignment',
            title: t('stx.tlRouted'),
            description: t('stx.tlRoutedDesc', { dept: deptById(det.department).name }),
            timestamp: det.detectionTime,
            actor: 'OCEONIX AI',
            department: det.department,
          },
        ],
        departmentNotes: [],
        equipmentRequested: [],
      };
      setAlerts((as) => [alert, ...as]);
      pushNotification({
        kind: isHuman ? 'alert' : 'alert',
        title: isHuman ? t('stx.emergencyNotif') : t('stx.newDetectionNotif', { cls: t(`cls.${det.className}`) }),
        body: isHuman
          ? t('stx.safetyBody')
          : t('stx.detectBody', {
              pct: (det.confidence * 100).toFixed(1),
              risk: t(`risk.${det.riskLevel}`),
              dept: deptById(det.department).name,
            }),
        dept: det.department,
        detectionId: det.id,
        alertId: alert.id,
      });
      if (!opts.silent) {
        addToast({
          kind: isHuman ? 'critical' : 'alert',
          title: isHuman ? t('stx.emergencyToast') : t('stx.priorityToast', { risk: t(`risk.${det.riskLevel}`) }),
          text: t('stx.toastText', {
            dept: deptById(det.department).shortName,
            pct: (det.confidence * 100).toFixed(1),
            deadline: det.responseDeadline,
          }),
          action: { label: t('stx.viewAlert'), href: `alerts/${alert.id}` },
        });
      }
    } else {
      pushNotification({
        kind: 'notice',
        title: t('stx.marineLifeObserved'),
        body: t('stx.marineLifeObservedBody'),
        dept: 'ocean-survey',
        detectionId: det.id,
      });
      if (!opts.silent) {
        addToast({ kind: 'case', title: t('stx.marineObservation'), text: t('stx.marineObservationText'), action: { label: t('stx.view'), href: `detail/${det.id}` } });
      }
    }
  }, [addToast, pushNotification, language]);

  const mutateAlert = useCallback((id: string, fn: (a: Alert) => Alert) => {
    setAlerts((as) => as.map((a) => (a.id === id ? fn(a) : a)));
  }, []);

  const pushTimeline = (alert: Alert, type: Alert['timeline'][number]['type'], title: string, description: string, actor: string) => ({
    id: `tl-${alert.id}-${alert.timeline.length}`,
    type,
    title,
    description,
    timestamp: new Date().toISOString(),
    actor,
    department: alert.detection.department,
  });

  const acknowledgeAlert = useCallback((id: string, operator?: string) => {
    mutateAlert(id, (a) => ({
      ...a,
      status: 'assigned',
      acknowledgedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
      assignedOperator: operator,
      timeline: [...a.timeline, pushTimeline(a, 'assignment', 'Operator assignment', `Alert acknowledged${operator ? ` by ${operator}` : ''}. Case accepted.`, operator ?? 'Department Operator')],
    }));
  }, [mutateAlert]);

  const assignOperator = useCallback((id: string, operator: string) => {
    mutateAlert(id, (a) => ({
      ...a,
      assignedOperator: operator,
      status: a.status === 'new' || a.status === 'unacknowledged' ? 'assigned' : a.status,
      assignedAt: new Date().toISOString(),
      timeline: [...a.timeline, pushTimeline(a, 'assignment', 'Operator assignment', `Assigned operator: ${operator}.`, 'Department Manager')],
    }));
  }, [mutateAlert]);

  const assignTask = useCallback((id: string, department: DepartmentId, operator: string) => {
    const target = deptById(department).shortName;
    mutateAlert(id, (a) => ({
      ...a,
      assignedDepartment: department,
      assignedOperator: operator,
      status: a.status === 'resolved' ? a.status : 'assigned',
      assignedAt: new Date().toISOString(),
      detection: { ...a.detection, department },
      timeline: [...a.timeline, pushTimeline(a, 'assignment', 'System admin assignment', `Task assigned to ${target} — operator ${operator}.`, user?.name ?? 'System Admin')],
    }));
    setDetections((ds) => ds.map((d) => (d.id === id ? { ...d, department } : d)));
    pushNotification({
      kind: 'case',
      title: t('stx.taskAssigned'),
      body: t('stx.taskAssignedNote', { operator, target }),
      dept: department,
    });
    addToast({ kind: 'success', title: t('stx.taskAssigned'), text: t('stx.taskAssignedText', { id, target, operator }) });
  }, [mutateAlert, pushNotification, addToast, user, language]);

  const interdepartmentalTransfer = useCallback((
    alertId: string,
    fromDept: DepartmentId,
    toDept: DepartmentId,
    targetOperator: string,
    reason: string
  ) => {
    const fromName = deptById(fromDept).shortName;
    const toName = deptById(toDept).shortName;
    const nowIso = new Date().toISOString();
    let affectedDetId = '';

    mutateAlert(alertId, (a) => {
      affectedDetId = a.detectionId;
      return {
        ...a,
        assignedDepartment: toDept,
        assignedOperator: targetOperator,
        status: a.status === 'resolved' ? a.status : 'assigned',
        assignedAt: nowIso,
        reassignedFromDepartment: fromDept,
        interdepartmentalAid: {
          fromDepartment: fromDept,
          toDepartment: toDept,
          transferredAt: nowIso,
          transferredBy: user?.name ?? 'System Administrator',
          reason: reason || 'Workload minimization and mutual aid redistribution',
          targetOperator,
        },
        detection: {
          ...a.detection,
          department: toDept,
        },
        timeline: [
          ...a.timeline,
          {
            id: `tl-${a.id}-${a.timeline.length}`,
            type: 'interdepartmental_transfer',
            title: `Interdepartmental Aid: ${fromName} → ${toName}`,
            description: `Transferred to relieve ${fromName} workload. Assigned to ${targetOperator}. Reason: ${reason || 'Mutual aid capacity balancing'}.`,
            timestamp: nowIso,
            actor: user?.name ?? 'System Administrator',
            department: toDept,
            metadata: { fromDepartment: fromDept, toDepartment: toDept, operator: targetOperator, reason },
          },
        ],
      };
    });

    if (affectedDetId) {
      setDetections((ds) =>
        ds.map((d) => (d.id === affectedDetId ? { ...d, department: toDept } : d))
      );
    }

    const record: InterdepartmentalAidRecord = {
      id: `aid-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      alertId,
      detectionId: affectedDetId,
      fromDepartment: fromDept,
      toDepartment: toDept,
      targetOperator,
      reason: reason || 'Workload minimization and mutual aid redistribution',
      timestamp: nowIso,
      transferredBy: user?.name ?? 'System Administrator',
      status: 'active',
      reductionSummary: `Workload transferred from ${fromName} to ${toName}`,
    };

    setAidHistory((prev) => [record, ...prev]);

    pushNotification({
      kind: 'notice',
      title: `⚡ Mutual Aid Transferred: ${alertId}`,
      body: `Workload transferred from ${fromName} to ${toName} (${targetOperator}). Overload reduced.`,
      dept: toDept,
      alertId,
    });

    addToast({
      kind: 'success',
      title: 'Interdepartmental Aid Dispatched',
      text: `${alertId} transferred from ${fromName} to ${toName} (${targetOperator}) to minimize workload.`,
    });

    return true;
  }, [mutateAlert, pushNotification, addToast, user]);

  const autoBalanceWorkload = useCallback((targetOverloadedDept?: DepartmentId) => {
    const OPEN_STATUSES = ['new', 'unacknowledged', 'pending', 'assigned', 'in_progress', 'manual_verification', 'overdue', 'escalated'];
    const activeAlerts = alerts.filter((a) => OPEN_STATUSES.includes(a.status));
    const deptLoads: Record<DepartmentId, number> = {
      'marine-operations': 0,
      'marine-engineering': 0,
      'marine-environmental': 0,
      'search-rescue': 0,
      'ocean-survey': 0,
      'recovery-response': 0,
      'system-admin': 0,
    };
    activeAlerts.forEach((a) => {
      deptLoads[a.detection.department] = (deptLoads[a.detection.department] ?? 0) + 1;
    });

    const operationalDepts: DepartmentId[] = [
      'marine-operations',
      'marine-engineering',
      'marine-environmental',
      'search-rescue',
      'ocean-survey',
      'recovery-response',
    ];

    let overloaded = targetOverloadedDept;
    if (!overloaded) {
      const sorted = [...operationalDepts].sort((a, b) => deptLoads[b] - deptLoads[a]);
      if (sorted.length > 0 && deptLoads[sorted[0]] >= 2) {
        overloaded = sorted[0];
      }
    }

    if (!overloaded || deptLoads[overloaded] <= 1) {
      addToast({
        kind: 'info',
        title: 'Fleet Already Balanced',
        text: 'Department workloads are within optimal capacity. No critical overloads detected.',
      });
      return { transferredCount: 0, summary: 'Workloads already balanced.' };
    }

    const candidates = activeAlerts.filter(
      (a) => a.detection.department === overloaded && (!a.assignedOperator || a.status !== 'in_progress')
    );
    const pool = candidates.length > 0 ? candidates : activeAlerts.filter((a) => a.detection.department === overloaded);
    const countToMove = Math.min(pool.length, Math.max(1, Math.floor(deptLoads[overloaded] / 2)));
    const toMoveList = pool.slice(0, countToMove);

    if (toMoveList.length === 0) {
      addToast({
        kind: 'info',
        title: 'No Transferable Tasks',
        text: `All open tasks in ${deptById(overloaded).shortName} are actively in field operations.`,
      });
      return { transferredCount: 0, summary: 'No transferable tasks available.' };
    }

    const helperCandidates = operationalDepts
      .filter((d) => d !== overloaded)
      .sort((a, b) => deptLoads[a] - deptLoads[b]);

    let transferred = 0;
    toMoveList.forEach((alert, idx) => {
      const helperDept = helperCandidates[idx % helperCandidates.length];
      const availableOps = [...(OPERATORS[helperDept] ?? []), ...registeredUsers.filter((r) => r.department === helperDept).map((r) => r.name)];
      const targetOp = availableOps[0] ?? 'Duty Officer';
      interdepartmentalTransfer(
        alert.id,
        overloaded!,
        helperDept,
        targetOp,
        `Automated fleet rebalancing to relieve ${deptById(overloaded!).shortName} surge`
      );
      deptLoads[overloaded!] -= 1;
      deptLoads[helperDept] += 1;
      transferred += 1;
    });

    addToast({
      kind: 'success',
      title: 'Fleet Workload Rebalanced',
      text: `Successfully redistributed ${transferred} tasks from ${deptById(overloaded).shortName} to relieve department overload.`,
    });

    return {
      transferredCount: transferred,
      summary: `Redistributed ${transferred} tasks to minimize workload.`,
    };
  }, [alerts, registeredUsers, interdepartmentalTransfer, addToast]);

  const requestInterdepartmentalAid = useCallback((dept: DepartmentId, note?: string) => {
    const deptInfo = deptById(dept);
    pushNotification({
      kind: 'alert',
      title: `⚡ Mutual Aid Requested: ${deptInfo.shortName}`,
      body: `${deptInfo.name} has requested interdepartmental assistance due to elevated workload (${note || 'Surge backlog'}).`,
      dept: 'system-admin',
    });
    addToast({
      kind: 'alert',
      title: 'Interdepartmental Aid Requested',
      text: `Request for mutual aid dispatched to System Administrator. Workload rebalancing queued.`,
    });
  }, [pushNotification, addToast]);

  const seedSurgeScenario = useCallback(() => {
    const surgeDetections: Detection[] = [
      {
        id: `SURGE-DET-01`,
        imageId: 'ghost_net_cluster_alpha.png',
        className: 'ghost_fishing_gear',
        confidence: 0.88,
        boundingBox: { x: 0.25, y: 0.35, width: 0.45, height: 0.35, normalized: true },
        gps: { latitude: 18.9413, longitude: 72.8495, accuracy: 2, timestamp: new Date().toISOString() },
        estimatedSize: { length: 12.5, width: 6.2, height: 2.1, unit: 'm' },
        estimatedWeight: { min: 850, max: 2200, unit: 'kg', confidence: 0.88 },
        riskLevel: 'high',
        riskScore: 82,
        priority: 2,
        responseDeadline: new Date(Date.now() + 24 * 3600e3).toISOString(),
        department: 'marine-environmental',
        recommendedEquipment: ['Net Recovery Rig', 'ROV Claw', 'Marker Buoy'],
        removalMethod: 'Cut free & recover netting; log entangled fauna',
        verificationStatus: 'pending',
        notes: 'Dense ghost fishing gear cluster threatening marine sanctuary corridor.',
        detectionTime: new Date(Date.now() - 3600e3 * 2).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiPrediction: true,
        estimated: true,
        recommended: true,
        source: 'upload',
        manualVerificationRequired: false,
        isRealModel: true,
        rawLabel: 'ghost_fishing_gear',
      },
      {
        id: `SURGE-DET-02`,
        imageId: 'trawl_debris_beta.png',
        className: 'ghost_fishing_gear',
        confidence: 0.79,
        boundingBox: { x: 0.15, y: 0.2, width: 0.35, height: 0.4, normalized: true },
        gps: { latitude: 18.9321, longitude: 72.8612, accuracy: 3, timestamp: new Date().toISOString() },
        estimatedSize: { length: 8.0, width: 4.5, height: 1.8, unit: 'm' },
        estimatedWeight: { min: 450, max: 1200, unit: 'kg', confidence: 0.79 },
        riskLevel: 'medium',
        riskScore: 68,
        priority: 3,
        responseDeadline: new Date(Date.now() + 36 * 3600e3).toISOString(),
        department: 'marine-environmental',
        recommendedEquipment: ['Salvage Winch', 'Debris Container'],
        removalMethod: 'Surface tow and barge collection',
        verificationStatus: 'pending',
        notes: 'Abandoned gillnet entanglement drifting near shipping channel.',
        detectionTime: new Date(Date.now() - 3600e3 * 3).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiPrediction: true,
        estimated: true,
        recommended: true,
        source: 'upload',
        manualVerificationRequired: false,
        isRealModel: true,
        rawLabel: 'ghost_fishing_gear',
      },
      {
        id: `SURGE-DET-03`,
        imageId: 'plastic_debris_gamma.png',
        className: 'cylinder',
        confidence: 0.74,
        boundingBox: { x: 0.4, y: 0.4, width: 0.25, height: 0.3, normalized: true },
        gps: { latitude: 18.9189, longitude: 72.8254, accuracy: 2, timestamp: new Date().toISOString() },
        estimatedSize: { length: 3.2, width: 1.4, height: 1.4, unit: 'm' },
        estimatedWeight: { min: 280, max: 650, unit: 'kg', confidence: 0.74 },
        riskLevel: 'medium',
        riskScore: 60,
        priority: 3,
        responseDeadline: new Date(Date.now() + 48 * 3600e3).toISOString(),
        department: 'marine-environmental',
        recommendedEquipment: ['ROV Clamping Arm', 'Lifting Sling'],
        removalMethod: 'Mechanical crane lift into waste repository',
        verificationStatus: 'pending',
        notes: 'Corroded industrial cylinder emitting particulate debris plume.',
        detectionTime: new Date(Date.now() - 3600e3 * 5).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiPrediction: true,
        estimated: true,
        recommended: true,
        source: 'upload',
        manualVerificationRequired: false,
        isRealModel: true,
        rawLabel: 'cylinder',
      },
      {
        id: `SURGE-DET-04`,
        imageId: 'monofilament_net_delta.png',
        className: 'ghost_fishing_gear',
        confidence: 0.84,
        boundingBox: { x: 0.3, y: 0.25, width: 0.4, height: 0.45, normalized: true },
        gps: { latitude: 18.9554, longitude: 72.8721, accuracy: 2, timestamp: new Date().toISOString() },
        estimatedSize: { length: 15.0, width: 7.0, height: 3.0, unit: 'm' },
        estimatedWeight: { min: 1100, max: 3100, unit: 'kg', confidence: 0.84 },
        riskLevel: 'critical',
        riskScore: 92,
        priority: 1,
        responseDeadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
        department: 'marine-environmental',
        recommendedEquipment: ['Heavy Net Cutter', 'Diver Support Craft'],
        removalMethod: 'Multi-vessel coordinated haul and containment',
        verificationStatus: 'pending',
        notes: 'Critical large-scale net fouling near coral restoration sector.',
        detectionTime: new Date(Date.now() - 3600e3 * 1).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiPrediction: true,
        estimated: true,
        recommended: true,
        source: 'upload',
        manualVerificationRequired: false,
        isRealModel: true,
        rawLabel: 'ghost_fishing_gear',
      },
      {
        id: `SURGE-DET-05`,
        imageId: 'sunken_debris_epsilon.png',
        className: 'shipwreck',
        confidence: 0.81,
        boundingBox: { x: 0.2, y: 0.3, width: 0.5, height: 0.4, normalized: true },
        gps: { latitude: 18.905, longitude: 72.812, accuracy: 3, timestamp: new Date().toISOString() },
        estimatedSize: { length: 22.0, width: 8.5, height: 5.0, unit: 'm' },
        estimatedWeight: { min: 8000, max: 15000, unit: 'kg', confidence: 0.81 },
        riskLevel: 'high',
        riskScore: 78,
        priority: 2,
        responseDeadline: new Date(Date.now() + 40 * 3600e3).toISOString(),
        department: 'marine-operations',
        recommendedEquipment: ['Heavy Salvage Crane', 'Survey ROV'],
        removalMethod: 'Controlled structural tethering and salvage clearance',
        verificationStatus: 'pending',
        notes: 'Submerged wooden barge hull obstructing navigation line.',
        detectionTime: new Date(Date.now() - 3600e3 * 6).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiPrediction: true,
        estimated: true,
        recommended: true,
        source: 'upload',
        manualVerificationRequired: false,
        isRealModel: true,
        rawLabel: 'shipwreck',
      },
    ];

    const surgeAlerts: Alert[] = surgeDetections.map((det, i) => {
      const alertId = `AL-SRG${i + 1}`;
      return {
        id: alertId,
        alertId,
        detectionId: det.id,
        detection: det,
        status: (i === 0 ? 'new' : i === 1 ? 'unacknowledged' : i === 2 ? 'pending' : i === 3 ? 'new' : 'assigned') as AlertStatus,
        priority: det.priority,
        assignedDepartment: det.department,
        assignedOperator: i === 4 ? 'Capt. Verma' : undefined,
        escalationDepartment: det.department === 'marine-environmental' ? 'recovery-response' : 'marine-operations',
        responseDeadline: det.responseDeadline,
        overdue: false,
        timeline: [
          {
            id: `tl-${det.id}-0`,
            type: 'detection',
            title: 'Sonar Detection Triggered',
            description: `Real acoustic return confirmed. ${det.rawLabel} detected.`,
            timestamp: det.detectionTime,
            actor: 'OCEONIX AI',
            department: det.department,
          },
          {
            id: `tl-${det.id}-1`,
            type: 'assignment',
            title: 'Initial Department Routing',
            description: `Routed to ${deptById(det.department).name}.`,
            timestamp: det.detectionTime,
            actor: 'OCEONIX AI',
            department: det.department,
          },
        ],
        departmentNotes: [],
        equipmentRequested: [],
      };
    });

    setDetections((prev) => [...surgeDetections, ...prev.filter((p) => !p.id.startsWith('SURGE-'))]);
    setAlerts((prev) => [...surgeAlerts, ...prev.filter((a) => !a.id.startsWith('AL-SRG'))]);

    addToast({
      kind: 'alert',
      title: 'Operational Surge Simulated',
      text: 'Marine Environmental Operations is at 160% capacity (4 open cases). Mutual aid balancing ready.',
    });
  }, [addToast]);

  const requestVerification = useCallback((id: string) => {
    mutateAlert(id, (a) => ({
      ...a,
      status: 'manual_verification',
      timeline: [...a.timeline, pushTimeline(a, 'verification', 'Verification requested', 'Manual verification requested for this detection.', 'OCEONIX AI')],
    }));
  }, [mutateAlert]);

  const acceptCase = useCallback((id: string, operator?: string) => {
    acknowledgeAlert(id, operator);
  }, [acknowledgeAlert]);

  const setAlertStatus = useCallback((id: string, status: AlertStatus) => {
    mutateAlert(id, (a) => ({
      ...a,
      status,
      timeline: [...a.timeline, pushTimeline(a, 'note', 'Status changed', `Case status set to ${status.replace(/_/g, ' ')}.`, 'Department Operator')],
    }));
  }, [mutateAlert]);

  const requestEquipment = useCallback((id: string) => {
    mutateAlert(id, (a) => {
      const eqs = a.detection.recommendedEquipment.slice(0, 2).map((eq, i) => ({
        id: `eq-${a.id}-${i}`,
        equipment: eq,
        quantity: 1,
        status: 'requested' as const,
        requestedAt: new Date().toISOString(),
      }));
      return {
        ...a,
        equipmentRequested: [...(a.equipmentRequested ?? []), ...eqs],
        timeline: [...a.timeline, pushTimeline(a, 'equipment_request', 'Equipment requested', `${eqs.map((e) => e.equipment).join(', ')} requested from logistics.`, 'Department Logistics')],
      };
    });
  }, [mutateAlert]);

  const addNote = useCallback((id: string, content: string) => {
    if (!content.trim()) return;
    const author = user?.name ?? 'Operator';
    mutateAlert(id, (a) => ({
      ...a,
      departmentNotes: [...a.departmentNotes, { id: `dn-${a.id}-${a.departmentNotes.length}`, author, department: a.detection.department, content, timestamp: new Date().toISOString(), internal: true }],
      timeline: [...a.timeline, pushTimeline(a, 'note', 'Department note added', content, author)],
    }));
  }, [mutateAlert, user]);

  const escalateAlert = useCallback((id: string) => {
    mutateAlert(id, (a) => {
      const target = a.escalationDepartment ?? a.detection.department;
      return {
        ...a,
        status: 'escalated',
        escalationDepartment: target,
        escalatedAt: new Date().toISOString(),
        timeline: [...a.timeline, pushTimeline(a, 'escalation', 'Escalated', `Forwarded to ${deptById(target).name}.`, 'Escalation Engine')],
      };
    });
  }, [mutateAlert]);

  const resolveAlert = useCallback((id: string) => {
    mutateAlert(id, (a) => ({
      ...a,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      timeline: [...a.timeline, pushTimeline(a, 'resolution', 'Case resolved', 'Field response complete. Awaiting confirmation.', 'Field Coordinator')],
    }));
  }, [mutateAlert]);

  const verifyAlert = useCallback((id: string) => {
    mutateAlert(id, (a) => ({
      ...a,
      status: 'resolved',
      verifiedAt: new Date().toISOString(),
      timeline: [...a.timeline, pushTimeline(a, 'verification', 'Resolution verified', 'Post-recovery imagery accepted. Case closed.', 'Verifier')],
    }));
  }, [mutateAlert]);

  const updateSettings = useCallback((patch: Partial<SettingsConfig>) => {
    setSettings((s) => applySettingsMerge(s, patch));
  }, []);

  const saveSettings = useCallback(() => {
    addToast({ kind: 'success', title: t('stx.settingsSaved'), text: t('stx.settingsSavedText') });
  }, [addToast, language]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    addToast({ kind: 'info', title: t('stx.settingsReset'), text: t('stx.settingsResetText') });
  }, [addToast, language]);

  const completeOnboarding = useCallback(() => setOnboardingSeen(true), []);
  const openTour = useCallback(() => setTourOpen(true), []);
  const closeTour = useCallback(() => setTourOpen(false), []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications((ns) => ns.map((n) => ({ ...n, unread: false })));
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORE_KEY);
    window.location.reload();
  }, []);

  const clearDetectionHistory = useCallback(() => {
    setDetections([]);
    setAlerts([]);
    setAidHistory([]);
    clearCachedImages();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistShape;
        parsed.detections = [];
        parsed.alerts = [];
        parsed.aidHistory = [];
        parsed.notifications = [];
        localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
      }
    } catch {
      // ignore
    }
    addToast({
      kind: 'success',
      title: 'Detection History Cleared',
      text: 'All detection records and associated alerts have been cleared.',
    });
  }, [addToast]);

  const api = useMemo<StoreApi>(() => ({
    user,
    theme,
    language,
    settings,
    onboardingSeen,
    tourOpen,
    detections,
    alerts,
    notifications,
    toasts,
    registeredUsers,
    aidHistory,
    login,
    register,
    assignTask,
    interdepartmentalTransfer,
    autoBalanceWorkload,
    requestInterdepartmentalAid,
    seedSurgeScenario,
    logout,
    setTheme,
    setLanguage,
    updateSettings,
    saveSettings,
    resetSettings,
    addToast,
    dismissToast,
    dismissNotification,
    markNotificationsRead,
    recordDetection,
    acknowledgeAlert,
    assignOperator,
    requestVerification,
    acceptCase,
    setAlertStatus,
    requestEquipment,
    addNote,
    escalateAlert,
    resolveAlert,
    verifyAlert,
    completeOnboarding,
    openTour,
    closeTour,
    clearAll,
    clearDetectionHistory,
  }), [user, theme, language, settings, onboardingSeen, tourOpen, detections, alerts, notifications, toasts, registeredUsers, aidHistory, login, register, assignTask, interdepartmentalTransfer, autoBalanceWorkload, requestInterdepartmentalAid, seedSurgeScenario, logout, setTheme, setLanguage, updateSettings, saveSettings, resetSettings, addToast, dismissToast, dismissNotification, markNotificationsRead, recordDetection, acknowledgeAlert, assignOperator, requestVerification, acceptCase, setAlertStatus, requestEquipment, addNote, escalateAlert, resolveAlert, verifyAlert, completeOnboarding, openTour, closeTour, clearAll, clearDetectionHistory]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreApi {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}

export function deptName(id: DepartmentId): string {
  return deptById(id).name;
}

export function deptShort(id: DepartmentId): string {
  return deptById(id).shortName;
}

export function deptTone(id: DepartmentId): string {
  return deptColor(id);
}