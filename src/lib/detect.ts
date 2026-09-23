import type { DetectionClass } from '../types';

export interface ModelPrediction {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
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
};

export function mapClass(label: string): DetectionClass | null {
  const key = label.trim().toLowerCase().replace(/\s+/g, '_');
  return CLASS_ALIASES[key] ?? null;
}

export async function fetchPredictions(file: File, timeoutMs = 60000): Promise<ModelPrediction[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? `detect failed with status ${res.status}`);
    }
    return (await res.json()) as ModelPrediction[];
  } finally {
    clearTimeout(timer);
  }
}