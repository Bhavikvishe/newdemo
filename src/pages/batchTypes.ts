import type { DetectionClass } from '../types';
import type { ModelPrediction } from '../lib/detect';

export type BatchStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BatchItem {
  id: string;
  filename: string;
  path?: string;
  file?: File;
  previewUrl?: string;
  detectionId?: string;
  className?: DetectionClass;
  rawLabel?: string;
  status: BatchStatus;
  progress: number;
  detectionCount: number;
  avgConfidence: number;
  predictions: ModelPrediction[];
  error?: string;
  addedAt: number;
}