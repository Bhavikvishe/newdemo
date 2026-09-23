import type { DetectionClass } from '../types';

export type BatchStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BatchItem {
  id: string;
  filename: string;
  path?: string;
  file?: File;
  detectionId?: string;
  className: DetectionClass;
  status: BatchStatus;
  progress: number;
  detectionCount: number;
  avgConfidence: number;
  addedAt: number;
}