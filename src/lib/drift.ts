export interface DriftForecastRequest {
  latitude: number;
  longitude: number;
  horizon_hours: number;
  timestep_minutes: number;
  source: 'auto' | 'local' | 'copernicus' | 'open_meteo';
  start_time?: string;
  grid_margin_degrees?: number;
  vector_grid_size?: number;
}

export interface DriftTrajectoryPoint {
  timestamp: string;
  latitude: number;
  longitude: number;
  uo_ms: number;
  vo_ms: number;
  speed_ms: number;
  ocean_source_timestamp?: string | null;
}

export interface DriftMilestone {
  hours: number;
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface DriftUncertaintyPoint {
  timestamp: string;
  radius_m: number;
  radius_95_m?: number;
  radius_95_km?: number;
  sigma_m?: number;
  characteristic_speed_mps?: number;
  method?: string;
}

export interface DriftCurrentVector {
  timestamp: string;
  latitude: number;
  longitude: number;
  uo_ms: number;
  vo_ms: number;
  source_timestamp?: string | null;
}

export interface DriftRetention {
  status: 'scored' | 'unscored';
  index: number | null;
  reason?: string | null;
  error?: string | null;
  components?: Record<string, number> | null;
  weights?: Record<string, number> | null;
}

export interface DriftOceanConditions {
  uo_ms?: number | null;
  vo_ms?: number | null;
  current_speed_ms?: number | null;
  temperature_c?: number | null;
  salinity_psu?: number | null;
  sea_surface_height_m?: number | null;
  mixed_layer_depth_m?: number | null;
  bottom_temperature_c?: number | null;
}

export interface DriftDataSources {
  provider?: string;
  requested_start_time?: string;
  requested_timestamps?: string[];
  actual_source_timestamps?: string[];
  [key: string]: unknown;
}

export interface DriftMlStatus {
  status: 'ACTIVE' | 'DISABLED';
  reason?: string;
  reason_code?: string;
  enabled?: boolean;
  metrics?: Record<string, unknown> | null;
  training_samples?: number | null;
  validation_samples?: number | null;
}

export interface DriftForecastResponse {
  status: 'success' | 'error';
  model: {
    primary: string;
    version: string;
    ml_residual?: string | null;
  };
  request: {
    latitude: number;
    longitude: number;
    horizon_hours: number;
    timestep_minutes: number;
    requested_start_time?: string;
  };
  trajectory: DriftTrajectoryPoint[];
  milestones: DriftMilestone[];
  uncertainty: DriftUncertaintyPoint[];
  current_vectors: DriftCurrentVector[];
  retention: DriftRetention;
  ocean_conditions: DriftOceanConditions;
  data_sources: DriftDataSources;
  ml_status: DriftMlStatus;
  warnings: string[];
  error?: string;
  code?: string;
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
  'http://127.0.0.1:5000';

export async function fetchDriftForecast(
  request: DriftForecastRequest,
): Promise<DriftForecastResponse> {
  const response = await fetch(
    `${API_BASE}/api/drift/forecast`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  );

  let payload: DriftForecastResponse;

  try {
    payload =
      (await response.json()) as DriftForecastResponse;
  } catch {
    throw new Error(
      `Forecast service returned HTTP ${response.status}.`,
    );
  }

  if (!response.ok || payload.status !== 'success') {
    throw new Error(
      payload.error ||
        `Forecast service returned HTTP ${response.status}.`,
    );
  }

  return payload;
}