export type Language = 'en' | 'hi' | 'mr';

export type Theme = 'dark' | 'light';

export type DepartmentId = 
  | 'marine-operations'
  | 'marine-engineering'
  | 'marine-environmental'
  | 'search-rescue'
  | 'ocean-survey'
  | 'recovery-response'
  | 'system-admin';

export type UserRole = 
  | 'operator'
  | 'supervisor'
  | 'manager'
  | 'admin';

export type DetectionClass = 
  | 'shipwreck'
  | 'pipeline'
  | 'ghost_fishing_gear'
  | 'cylinder'
  | 'manta'
  | 'airplane'
  | 'human';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type AlertStatus = 
  | 'new'
  | 'unacknowledged'
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'manual_verification'
  | 'resolved'
  | 'overdue'
  | 'escalated';

export type CaseStatus = 
  | 'open'
  | 'acknowledged'
  | 'assigned'
  | 'in_progress'
  | 'verification_required'
  | 'resolved'
  | 'verified'
  | 'closed';

export type ProcessingStatus = 
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MonitoringStatus = 
  | 'idle'
  | 'active'
  | 'paused'
  | 'simulation';

export interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

export interface Site {
  name: string;
  lat: number;
  lng: number;
  depth: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  normalized: boolean;
}

export interface Detection {
  id: string;
  imageId: string;
  className: DetectionClass;
  confidence: number;
  boundingBox: BoundingBox;
  gps: GPSPosition;
  estimatedSize: {
    length: number;
    width: number;
    height: number;
    unit: 'm' | 'cm';
  };
  estimatedWeight: {
    min: number;
    max: number;
    unit: 'kg' | 'ton';
    confidence: number;
  };
  riskLevel: RiskLevel;
  riskScore: number;
  priority: number;
  responseDeadline: string;
  department: DepartmentId;
  recommendedEquipment: string[];
  removalMethod: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  notes: string;
  assignedOperator?: string;
  detectionTime: string;
  createdAt: string;
  updatedAt: string;
  aiPrediction: boolean;
  estimated: boolean;
  recommended: boolean;
  manualVerificationRequired: boolean;
  source?: 'upload';
}

export interface SonarImage {
  id: string;
  filename: string;
  originalUrl: string;
  annotatedUrl?: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSize: number;
  uploadTime: string;
  processingStatus: ProcessingStatus;
  progress: number;
  detections: Detection[];
  metadata: {
    sonarType: 'side-scan' | 'multi-beam' | 'single-beam';
    frequency: number;
    range: number;
    gain: number;
    vesselSpeed: number;
    waterDepth: number;
    location: GPSPosition;
  };
}

export interface Alert {
  id: string;
  detectionId: string;
  detection: Detection;
  alertId: string;
  status: AlertStatus;
  priority: number;
  assignedDepartment: DepartmentId;
  assignedOperator?: string;
  escalationDepartment?: DepartmentId;
  escalatedAt?: string;
  acknowledgedAt?: string;
  assignedAt?: string;
  startedAt?: string;
  resolvedAt?: string;
  verifiedAt?: string;
  responseDeadline: string;
  overdue: boolean;
  timeline: AlertTimelineEvent[];
  departmentNotes: DepartmentNote[];
  equipmentRequested: EquipmentRequest[];
}

export interface AlertTimelineEvent {
  id: string;
  type: 'detection' | 'analysis' | 'verification' | 'assignment' | 'response' | 'resolution' | 'escalation' | 'note' | 'equipment_request';
  title: string;
  description: string;
  timestamp: string;
  actor: string;
  department: DepartmentId;
  metadata?: Record<string, unknown>;
}

export interface DepartmentNote {
  id: string;
  author: string;
  department: DepartmentId;
  content: string;
  timestamp: string;
  internal: boolean;
}

export interface EquipmentRequest {
  id: string;
  equipment: string;
  quantity: number;
  status: 'requested' | 'approved' | 'dispatched' | 'delivered' | 'returned';
  requestedAt: string;
  approvedAt?: string;
  dispatchedAt?: string;
}

export interface Department {
  id: DepartmentId;
  name: string;
  shortName: string;
  description: string;
  color: string;
  icon: string;
  responsibilities: DetectionClass[];
  members: DepartmentMember[];
  status: 'online' | 'busy' | 'standby' | 'offline';
  activeOperators: number;
  openAlerts: number;
  criticalCases: number;
  inProgressCases: number;
  avgResponseTime: number;
  workload: number;
  escalationDepartment?: DepartmentId;
  routingRules: RoutingRule[];
}

export interface DepartmentMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  status: 'active' | 'away' | 'offline';
  lastActive: string;
}

export interface RoutingRule {
  id: string;
  objectClass: DetectionClass;
  riskLevel?: RiskLevel;
  primaryDepartment: DepartmentId;
  escalationDepartment?: DepartmentId;
  responseTimeHours: number;
  equipment: string[];
  autoAssign: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  department: DepartmentId;
  role: UserRole;
  name: string;
  avatar?: string;
  preferences: UserPreferences;
  lastLogin: string;
}

export interface UserPreferences {
  theme: Theme;
  language: Language;
  animations: boolean;
  reducedMotion: boolean;
  notifications: boolean;
  soundAlerts: boolean;
  compactMode: boolean;
  demoMode: boolean;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'hover' | 'none';
}

export interface DashboardStats {
  totalDetections: number;
  marineDebris: number;
  anomalies: number;
  highCriticalRisk: number;
  pendingAlerts: number;
  resolvedCases: number;
  avgResponseTime: number;
  activeMonitoringAreas: number;
  detectionsToday: number;
  alertsThisWeek: number;
  resolutionRate: number;
  departmentWorkload: Record<DepartmentId, number>;
}

export interface AnalyticsData {
  detectionTrends: TimeSeriesData[];
  objectDistribution: CategoryData[];
  riskDistribution: CategoryData[];
  confidenceDistribution: HistogramData[];
  geographicConcentration: GeoData[];
  responseTimePerformance: TimeSeriesData[];
  departmentWorkload: CategoryData[];
  equipmentRequirements: CategoryData[];
  resolvedVsPending: CategoryData[];
  detectionActivity: TimeSeriesData[];
}

export interface TimeSeriesData {
  date: string;
  value: number;
  label?: string;
}

export interface CategoryData {
  category: string;
  value: number;
  color?: string;
  label?: string;
}

export interface HistogramData {
  range: string;
  count: number;
}

export interface GeoData {
  lat: number;
  lng: number;
  count: number;
  riskLevel: RiskLevel;
  types: DetectionClass[];
}

export interface ReportConfig {
  dateRange: { start: string; end: string };
  detectionTypes: DetectionClass[];
  riskLevels: RiskLevel[];
  locations: string[];
  departments: DepartmentId[];
  statuses: CaseStatus[];
  includeMaps: boolean;
  includeCharts: boolean;
  includeStatistics: boolean;
  includeRecommendations: boolean;
  format: 'pdf' | 'csv' | 'html';
}

export interface ReportPreview {
  id: string;
  title: string;
  generatedAt: string;
  generatedBy: string;
  config: ReportConfig;
  summary: ReportSummary;
  sections: ReportSection[];
}

export interface ReportSummary {
  totalDetections: number;
  byType: Record<DetectionClass, number>;
  byRisk: Record<RiskLevel, number>;
  byDepartment: Record<DepartmentId, number>;
  avgResponseTime: number;
  resolutionRate: number;
  criticalCases: number;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'map' | 'chart' | 'table' | 'statistics' | 'recommendations';
  content: unknown;
}

export interface LiveMonitorState {
  status: MonitoringStatus;
  scanDepth: number;
  signalStrength: number;
  detectedObjects: number;
  activeAlerts: number;
  gpsPosition: GPSPosition;
  systemHealth: SystemHealth;
  scanInterval: number;
  detectionSensitivity: number;
  alertThreshold: RiskLevel;
  sweepAngle: number;
  incomingDetections: LiveDetection[];
}

export interface LiveDetection {
  id: string;
  className: DetectionClass;
  confidence: number;
  bearing: number;
  range: number;
  depth: number;
  timestamp: string;
  riskLevel: RiskLevel;
}

export interface WeatherDay {
  date: string;
  waveMax: number;
  wavePeriodMax: number;
  waveDirection: number | null;
  windMaxKmh: number;
  windGustsKmh: number;
  precipProb: number;
  precipSum: number;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  rating: 'GOOD' | 'CAUTION' | 'POOR';
}

export interface RegionWeather {
  lat: number;
  lng: number;
  region: string;
  fetchedAt: string;
  current: {
    waveHeight: number | null;
    wavePeriod: number | null;
    waveDirection: number | null;
    windSpeedKmh: number | null;
    windDirectionDeg: number | null;
    tempC: number | null;
    weatherCode: number | null;
  };
  days: WeatherDay[];
}

export interface SystemHealth {
  cpu: number;
  memory: number;
  storage: number;
  network: number;
  sonar: 'optimal' | 'degraded' | 'offline';
  gps: 'optimal' | 'degraded' | 'offline';
  ai: 'optimal' | 'degraded' | 'offline';
}

export interface BatchScanItem {
  id: string;
  imageId: string;
  filename: string;
  thumbnailUrl: string;
  status: ProcessingStatus;
  progress: number;
  detectionCount: number;
  avgConfidence: number;
  resultStatus: 'pending' | 'success' | 'failed' | 'partial';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface SettingsConfig {
  detectionConfidenceThreshold: number;
  riskThresholds: Record<RiskLevel, number>;
  alertResponseTimes: Record<RiskLevel, number>;
  debrisClasses: DetectionClass[];
  departmentRules: RoutingRule[];
  equipmentRules: EquipmentRule[];
  sonarCalibration: SonarCalibration;
  notificationPreferences: NotificationPreferences;
  theme: Theme;
  animationLevel: 'full' | 'reduced' | 'none';
  demoMode: boolean;
}

export interface EquipmentRule {
  department: DepartmentId;
  equipment: string[];
  maxQuantity: number;
  autoApprove: boolean;
}

export interface SonarCalibration {
  gain: number;
  range: number;
  frequency: number;
  tvg: number;
  beamWidth: number;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sound: boolean;
  criticalOnly: boolean;
  departmentAlerts: boolean;
  systemAlerts: boolean;
  dailyDigest: boolean;
}

export interface TranslationKeys {
  [key: string]: string;
}

export interface Translations {
  [lang: string]: TranslationKeys;
}

export type NotificationKind = 'alert' | 'case' | 'system' | 'escalation' | 'equipment' | 'notice';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  dept?: DepartmentId;
  detectionId?: string;
  alertId?: string;
  ts: string;
  unread: boolean;
}

export interface SessionUser {
  username: string;
  name: string;
  department: DepartmentId;
  role: UserRole;
  departmentLabel: string;
  departmentIdLabel: string;
  color: string;
}

export interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string;
  department: DepartmentId;
  role: UserRole;
  createdAt: string;
}

export interface SignupInput {
  name: string;
  email: string;
  username: string;
  password: string;
  department: DepartmentId;
}

export interface ToastItem {
  id: string;
  kind: 'info' | 'alert' | 'critical' | 'success' | 'case';
  title: string;
  text: string;
  action?: { label: string; href: string };
  ts: number;
}

export interface TourStepDef {
  id: string;
  key: string;
  descKey: string;
  route: string;
  target: string;
  position: 'top' | 'bottom';
}