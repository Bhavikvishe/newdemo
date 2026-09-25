import type { DetectionClass } from '../types';

export interface ModelPrediction {
  class_id?: number;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  raw_bbox?: { x1: number; y1: number; x2: number; y2: number };
}

export interface DetectDebugInfo {
  model_path?: string;
  classes?: Record<string, string>;
  input_shape?: [number, number];
  imgsz?: number;
  conf?: number;
  iou?: number;
  raw_detections?: number;
  post_detections?: number;
}

export interface DetectResponse {
  predictions: ModelPrediction[];
  debug?: DetectDebugInfo;
}

const CLASS_ALIASES: Record<string, DetectionClass> = {
  shipwreck: 'shipwreck',
  wreck: 'shipwreck',
  sunken_ship: 'shipwreck',
  pipeline: 'pipeline',
  pipe: 'pipeline',
  ghost_fishing_gear: 'ghost_fishing_gear',
  ghost_net: 'ghost_fishing_gear',
  fishing_net: 'ghost_fishing_gear',
  net: 'ghost_fishing_gear',
  cylinder: 'cylinder',
  gas_cylinder: 'cylinder',
  manta: 'manta',
  manta_ray: 'manta',
  airplane: 'airplane',
  plane: 'airplane',
  aircraft: 'airplane',
  human: 'human',
  person: 'human',
  diver: 'human',
  swimmer: 'human',
  mine: 'mine',
  naval_mine: 'mine',
  sea_mine: 'mine',
  underwater_mine: 'mine',
};

export function mapClass(label: string): DetectionClass | null {
  const key = label.trim().toLowerCase().replace(/\s+/g, '_');
  return CLASS_ALIASES[key] ?? null;
}

export interface FetchDetectOptions {
  conf?: number;
  iou?: number;
  imgsz?: number;
  debug?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchPredictions(
  file: File,
  opts: FetchDetectOptions = {},
): Promise<DetectResponse> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const onExternalAbort = () => {
    ctrl.abort();
  };

  if (opts.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    opts.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const params = new URLSearchParams();
  if (opts.conf != null) params.set('conf', String(opts.conf));
  if (opts.iou != null) params.set('iou', String(opts.iou));
  if (opts.imgsz != null) params.set('imgsz', String(opts.imgsz));
  if (opts.debug) params.set('debug', '1');

  const queryString = params.toString() ? `?${params.toString()}` : '';

  try {
    const res = await fetch(`/api/detect${queryString}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? `detect failed with status ${res.status}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      return { predictions: data as ModelPrediction[] };
    }
    return data as DetectResponse;
  } finally {
    clearTimeout(timer);
    if (opts.signal) {
      opts.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Converts an image file to an optimized, self-contained Data URL.
 * Scales down high-resolution inputs to fit maxDim to ensure low memory
 * footprint and compatibility with storage and navigation views.
 */
export async function fileToDataUrl(file: File, maxDim = 960): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(objectUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback to FileReader if objectURL image load failed
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

export const imageCache = new Map<string, string>();

export function setCachedImage(key: string, url: string) {
  if (!key || !url) return;
  imageCache.set(key, url);
}

export function getCachedImage(key?: string): string | undefined {
  if (!key) return undefined;
  return imageCache.get(key);
}

export function clearCachedImages(): void {
  imageCache.clear();
}