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
} from '../types';
import { navigate } from './router';
import {
  CLASS_META,
  sessionFor,
  deptById,
  deptColor,
} from './mock';
import { makeT } from './i18n';

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
  demoMode: true,
};

function loadPersist(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed.detections || !Array.isArray(parsed.detections)) return null;
    const real = parsed.detections.filter((d) => d.source === 'upload');
    const kept = new Set(real.map((d) => d.id));
    parsed.detections = real;
    parsed.alerts = (parsed.alerts ?? []).filter((a) => kept.has(a.detectionId));
    parsed.notifications = (parsed.notifications ?? []).filter((n) => !n.detectionId || kept.has(n.detectionId));
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
  login: (username: string, dept: DepartmentId, password?: string) => boolean;
  register: (input: SignupInput) => { ok: boolean; error?: string };
  assignTask: (alertId: string, department: DepartmentId, operator: string) => void;
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
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(shape));
    } catch {
      /* storage unavailable */
    }
  }, [user, theme, language, settings, onboardingSeen, detections, alerts, notifications, registeredUsers]);

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
    pushNotification({
      kind: 'case',
      title: t('stx.taskAssigned'),
      body: t('stx.taskAssignedNote', { operator, target }),
      dept: department,
    });
    addToast({ kind: 'success', title: t('stx.taskAssigned'), text: t('stx.taskAssignedText', { id, target, operator }) });
  }, [mutateAlert, pushNotification, addToast, user, language]);

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
    login,
    register,
    assignTask,
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
  }), [user, theme, language, settings, onboardingSeen, tourOpen, detections, alerts, notifications, toasts, registeredUsers, login, register, assignTask, logout, setTheme, setLanguage, updateSettings, saveSettings, resetSettings, addToast, dismissToast, dismissNotification, markNotificationsRead, recordDetection, acknowledgeAlert, assignOperator, requestVerification, acceptCase, setAlertStatus, requestEquipment, addNote, escalateAlert, resolveAlert, verifyAlert, completeOnboarding, openTour, closeTour, clearAll]);

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