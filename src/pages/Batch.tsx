import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_META, toCSV, toJSON, download, downloadBatchReportPDF, makeDetectionFromFile } from '../lib/mock';
import type { DetectionReportSource } from '../lib/mock';
import { fetchPredictions, mapClass, fileToDataUrl, setCachedImage } from '../lib/detect';
import { clsLabel } from '../lib/labels';
import { PageHead, Card, Button, Progress, Tag, EmptyState, DetectionReportActions } from '../lib/ui';
import { Link } from '../lib/router';
import {
  IconFolder,
  IconRefresh,
  IconStop,
  IconUpload,
  IconX,
  IconDoc,
  IconDownload,
  IconPlay,
  IconShield,
  IconAlert,
} from '../components/Icons';
import type { BatchItem, BatchStatus } from './batchTypes';
import type { Detection, DetectionClass } from '../types';

const STATUS_KEY: Record<BatchStatus, string> = {
  queued: 'common.queued',
  processing: 'common.processing',
  completed: 'common.completed',
  failed: 'common.failed',
  cancelled: 'batch.status.cancelled',
};

const CONFIDENCE_OPTIONS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50];

function filesToItems(files: File[]): BatchItem[] {
  return files.map((f, i) => {
    const filename =
      f.webkitRelativePath && f.webkitRelativePath !== f.name
        ? f.webkitRelativePath.replace(/\//g, '/').split('/').pop()!
        : f.name;

    const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined;
    if (previewUrl) {
      setCachedImage(filename, previewUrl);
      setCachedImage(f.name, previewUrl);
    }
    if (f.type.startsWith('image/')) {
      fileToDataUrl(f).then((dataUrl) => {
        if (dataUrl) {
          setCachedImage(filename, dataUrl);
          setCachedImage(f.name, dataUrl);
        }
      }).catch(() => {});
    }

    return {
      id: `bf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      filename,
      path: f.webkitRelativePath || f.name,
      file: f,
      previewUrl,
      status: 'queued' as const,
      progress: 0,
      detectionCount: 0,
      avgConfidence: 0,
      predictions: [],
      addedAt: Date.now(),
    };
  });
}

export function BatchPage() {
  const store = useStore();
  const { language, addToast } = store;
  const t = makeT(language);
  const statusLabel = (s: BatchStatus) => t(STATUS_KEY[s]);

  const [demoMode, setDemoMode] = useState(false);
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);

  const itemsRef = useRef<BatchItem[]>(items);
  itemsRef.current = items;

  const confThresholdRef = useRef(confThreshold);
  confThresholdRef.current = confThreshold;

  const demoModeRef = useRef(demoMode);
  demoModeRef.current = demoMode;

  const runningRef = useRef(false);
  runningRef.current = running;

  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isWorkerRunningRef = useRef(false);

  const toggleMode = () => {
    const next = !demoMode;
    setDemoMode(next);
    store.updateSettings({ demoMode: next });
  };

  // Clean up on component unmount only
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      itemsRef.current.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      });
    };
  }, []);

  const updateItem = (id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => {
      const updated = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
      itemsRef.current = updated;
      return updated;
    });
  };

  // -------------------------------------------------------------
  // Real Batch Inference Worker Loop (Imperative, Rock Solid)
  // -------------------------------------------------------------
  const runQueueWorker = async () => {
    if (isWorkerRunningRef.current) return;
    isWorkerRunningRef.current = true;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setRunning(true);
    runningRef.current = true;

    try {
      while (runningRef.current && !ctrl.signal.aborted) {
        const nextItem = itemsRef.current.find((it) => it.status === 'queued');
        if (!nextItem) {
          break;
        }

        const targetId = nextItem.id;
        const targetFile = nextItem.file;
        const targetFilename = nextItem.filename;

        // 1. Mark target item as processing
        updateItem(targetId, { status: 'processing', progress: 25, error: undefined });

        if (!runningRef.current || ctrl.signal.aborted) break;

        if (demoModeRef.current) {
          // Simulated Demo Mode path
          await new Promise((r) => setTimeout(r, 600));
          if (!runningRef.current || ctrl.signal.aborted) break;

          if (targetFile) {
            const det = makeDetectionFromFile(targetFile);
            store.recordDetection(det, { silent: true });
            updateItem(targetId, {
              status: 'completed',
              progress: 100,
              detectionId: det.id,
              className: det.className,
              rawLabel: det.className,
              detectionCount: 1,
              avgConfidence: det.confidence,
              predictions: [
                {
                  class_id: 0,
                  label: det.className,
                  confidence: det.confidence,
                  bbox: det.boundingBox,
                },
              ],
            });
          }
          continue;
        }

        // REAL MODEL MODE: Call POST /api/detect with the actual image bytes
        try {
          if (!targetFile) throw new Error('File object missing');

          updateItem(targetId, { progress: 50 });

          const resp = await fetchPredictions(targetFile, {
            conf: confThresholdRef.current,
            debug: true,
            signal: ctrl.signal,
          });

          if (!runningRef.current || ctrl.signal.aborted) break;

          const preds = resp.predictions || [];
          const detCount = preds.length;
          const avgConf = detCount > 0 ? preds.reduce((sum, p) => sum + p.confidence, 0) / detCount : 0;
          const primaryPred = preds[0];
          const primaryMapped: DetectionClass | undefined = primaryPred
            ? (mapClass(primaryPred.label) ?? 'shipwreck')
            : undefined;

          let createdDetectionId: string | undefined = undefined;

          // If real objects found, record a primary Detection entity in store
          if (detCount > 0 && primaryPred && primaryMapped) {
            const meta = CLASS_META[primaryMapped];
            const dataUrl = await fileToDataUrl(targetFile);
            const imageSrc = dataUrl || nextItem.previewUrl;
            const detId = `REAL-BATCH-${Date.now()}-${targetId}`;

            if (imageSrc) {
              setCachedImage(detId, imageSrc);
              setCachedImage(targetFilename, imageSrc);
            }

            const realDet: Detection = {
              id: detId,
              imageId: targetFilename,
              imageUrl: imageSrc,
              className: primaryMapped,
              confidence: primaryPred.confidence,
              boundingBox: { ...primaryPred.bbox, normalized: true },
              gps: {
                latitude: 18.922 + (primaryPred.bbox.x - 0.5) * 0.05,
                longitude: 72.834 + (primaryPred.bbox.y - 0.5) * 0.05,
                accuracy: 3,
                timestamp: new Date().toISOString(),
              },
              estimatedSize: {
                length: +(primaryPred.bbox.width * 25).toFixed(1),
                width: +(primaryPred.bbox.height * 12).toFixed(1),
                height: +(primaryPred.bbox.height * 6).toFixed(1),
                unit: 'm',
              },
              estimatedWeight: {
                min: Math.round(primaryPred.bbox.width * 1200),
                max: Math.round(primaryPred.bbox.width * 3000),
                unit: 'kg',
                confidence: primaryPred.confidence,
              },
              riskLevel: meta ? meta.riskBase : 'high',
              riskScore: meta?.riskBase === 'critical' ? 95 : meta?.riskBase === 'high' ? 80 : 55,
              priority: meta?.riskBase === 'critical' ? 1 : 2,
              responseDeadline: new Date(Date.now() + (meta?.hours ?? 48) * 3600e3).toISOString(),
              department: meta ? meta.primary : 'marine-operations',
              recommendedEquipment: meta ? meta.equipment : ['Survey ROV'],
              removalMethod: meta ? meta.removal : 'Standard marine salvage',
              verificationStatus: 'pending',
              notes: `Batch scan: ${detCount} objects found via best.pt (conf threshold ${confThresholdRef.current.toFixed(2)})`,
              detectionTime: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              aiPrediction: true,
              estimated: true,
              recommended: true,
              source: 'upload',
              manualVerificationRequired: primaryPred.confidence < 0.5,
              isRealModel: true,
              rawLabel: primaryPred.label,
              predictions: preds.map((p) => ({
                class_id: p.class_id,
                label: p.label,
                confidence: p.confidence,
                bbox: { ...p.bbox, normalized: true },
                raw_bbox: p.raw_bbox,
              })),
            };
            store.recordDetection(realDet, { silent: true });
            createdDetectionId = realDet.id;
          }

          updateItem(targetId, {
            status: 'completed',
            progress: 100,
            detectionId: createdDetectionId,
            className: primaryMapped,
            rawLabel: primaryPred?.label,
            detectionCount: detCount,
            avgConfidence: avgConf,
            predictions: preds,
          });
        } catch (err: unknown) {
          if (!runningRef.current || ctrl.signal.aborted) break;
          const errMsg = err instanceof Error ? err.message : String(err);
          updateItem(targetId, {
            status: 'failed',
            progress: 0,
            error: errMsg,
          });
        }
      }
    } finally {
      isWorkerRunningRef.current = false;
      if (!ctrl.signal.aborted) {
        setRunning(false);
        runningRef.current = false;
        abortRef.current = null;

        const hasPending = itemsRef.current.some((it) => it.status === 'queued' || it.status === 'processing');
        if (!hasPending && itemsRef.current.length > 0) {
          const completedCount = itemsRef.current.filter((it) => it.status === 'completed').length;
          const failedCount = itemsRef.current.filter((it) => it.status === 'failed').length;
          addToast({
            kind: failedCount === 0 ? 'success' : 'alert',
            title: t('batch.finished.title'),
            text: `${t('batch.finished.text', { done: completedCount, failed: failedCount })}${failedCount ? ` ${t('batch.finished.retry')}` : ''}`,
          });
        }
      }
    }
  };

  const startScan = (onlyFailed = false) => {
    if (runningRef.current) return;
    const hasTarget = itemsRef.current.some((it) =>
      onlyFailed
        ? it.status === 'failed'
        : it.status === 'queued' || it.status === 'processing' || it.status === 'cancelled',
    );
    if (!hasTarget) return;

    setItems((prev) => {
      const updated = prev.map((it) => {
        if (onlyFailed && it.status === 'failed') {
          return { ...it, status: 'queued' as const, progress: 0, error: undefined };
        }
        if (!onlyFailed && (it.status === 'processing' || it.status === 'cancelled')) {
          return { ...it, status: 'queued' as const, progress: 0, error: undefined };
        }
        return it;
      });
      itemsRef.current = updated;
      return updated;
    });

    runQueueWorker();
  };

  const pause = () => {
    setRunning(false);
    runningRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setItems((prev) => {
      const updated = prev.map((it) =>
        it.status === 'processing' ? { ...it, status: 'queued' as const, progress: 0 } : it,
      );
      itemsRef.current = updated;
      return updated;
    });
  };

  const resume = () => {
    if (runningRef.current) return;
    const hasPending = itemsRef.current.some(
      (i) => i.status === 'queued' || i.status === 'processing' || i.status === 'cancelled',
    );
    if (!hasPending) return;

    setItems((prev) => {
      const updated = prev.map((it) =>
        it.status === 'processing' || it.status === 'cancelled'
          ? { ...it, status: 'queued' as const, progress: 0 }
          : it,
      );
      itemsRef.current = updated;
      return updated;
    });

    runQueueWorker();
  };

  const cancel = () => {
    setRunning(false);
    runningRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setItems((prev) => {
      const updated = prev.map((it) =>
        it.status === 'processing' ? { ...it, status: 'cancelled' as const, progress: 0 } : it,
      );
      itemsRef.current = updated;
      return updated;
    });
  };

  const retryFailed = () => {
    if (runningRef.current) return;
    setItems((prev) => {
      const updated = prev.map((it) =>
        it.status === 'failed' ? { ...it, status: 'queued' as const, progress: 0, error: undefined } : it,
      );
      itemsRef.current = updated;
      return updated;
    });
    runQueueWorker();
  };

  const clearAll = () => {
    setRunning(false);
    runningRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    itemsRef.current.forEach((it) => {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    });
    itemsRef.current = [];
    setItems([]);
    addToast({ kind: 'info', title: t('batch.cleared.title'), text: t('batch.cleared.text') });
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length) {
      const next = filesToItems(Array.from(list));
      setItems((its) => {
        const updated = [...its, ...next];
        itemsRef.current = updated;
        return updated;
      });
      addToast({ kind: 'success', title: t('batch.added.title', { n: next.length }), text: t('batch.added.text') });
    }
    e.target.value = '';
  };

  const openFolderPicker = () => {
    const el = folderRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
    el.setAttribute('multiple', '');
    el.click();
  };

  // -------------------------------------------------------------
  // Real Batch Statistics
  // -------------------------------------------------------------
  const stats = useMemo(() => {
    const completedItems = items.filter((i) => i.status === 'completed');
    const failedItems = items.filter((i) => i.status === 'failed');
    const processingItems = items.filter((i) => i.status === 'processing');

    // Total actual detected objects across all completed images
    const totalObjects = completedItems.reduce((sum, it) => sum + it.predictions.length, 0);

    // Collect all predictions from completed items
    const allPreds = completedItems.flatMap((it) => it.predictions);

    // Mean confidence across all detected objects
    const overallAvgConf =
      allPreds.length > 0 ? allPreds.reduce((sum, p) => sum + p.confidence, 0) / allPreds.length : null;

    return {
      total: items.length,
      completed: completedItems.length,
      failed: failedItems.length,
      processing: processingItems.length,
      objects: totalObjects,
      avgConf: overallAvgConf,
    };
  }, [items]);

  const allDone = stats.total > 0 && stats.completed + stats.failed === stats.total && !running;

  // -------------------------------------------------------------
  // Export REAL Results (CSV & JSON)
  // -------------------------------------------------------------
  const exportResults = (fmt: 'csv' | 'json' | 'pdf') => {
    if (fmt === 'csv') {
      const rows: Record<string, string | number | undefined>[] = [];
      items.forEach((it) => {
        if (it.status === 'completed') {
          if (it.predictions.length === 0) {
            rows.push({
              filename: it.path ?? it.filename,
              status: 'completed',
              objects_found: 0,
              class_name: 'None',
              class_id: '',
              confidence: '',
              x1: '',
              y1: '',
              x2: '',
              y2: '',
            });
          } else {
            it.predictions.forEach((p) => {
              rows.push({
                filename: it.path ?? it.filename,
                status: 'completed',
                objects_found: it.predictions.length,
                class_name: p.label,
                class_id: p.class_id ?? '',
                confidence: p.confidence.toFixed(4),
                x1: p.raw_bbox?.x1 ?? (p.bbox.x).toFixed(4),
                y1: p.raw_bbox?.y1 ?? (p.bbox.y).toFixed(4),
                x2: p.raw_bbox?.x2 ?? (p.bbox.x + p.bbox.width).toFixed(4),
                y2: p.raw_bbox?.y2 ?? (p.bbox.y + p.bbox.height).toFixed(4),
              });
            });
          }
        } else if (it.status === 'failed') {
          rows.push({
            filename: it.path ?? it.filename,
            status: 'failed',
            objects_found: 0,
            class_name: it.error || 'error',
            class_id: '',
            confidence: '',
            x1: '',
            y1: '',
            x2: '',
            y2: '',
          });
        }
      });
      download('oceonix-real-batch.csv', toCSV(rows), 'text/csv');
      addToast({
        kind: 'success',
        title: t('batch.exported.title'),
        text: t('batch.exported.csv', { file: 'oceonix-real-batch.csv' }),
      });
    } else if (fmt === 'json') {
      const jsonData = items.map((it) => ({
        filename: it.path ?? it.filename,
        status: it.status,
        error: it.error,
        detectionCount: it.detectionCount,
        avgConfidence: it.avgConfidence,
        predictions: it.predictions,
      }));
      download('oceonix-real-batch.json', toJSON(jsonData), 'application/json');
      addToast({
        kind: 'success',
        title: t('batch.exported.title'),
        text: t('batch.exported.json', { file: 'oceonix-real-batch.json' }),
      });
    } else {
      try {
        const file = downloadBatchReportPDF(items, language);
        addToast({
          kind: 'success',
          title: t('batch.exported.title'),
          text: t('batch.exported.pdf', { file }),
        });
      } catch {
        addToast({
          kind: 'alert',
          title: t('common.failed'),
          text: t('rpt.toastExportError', { file: 'oceonix-real-batch.pdf' }),
        });
      }
    }
  };

  const overall = items.length ? (items.reduce((s, it) => s + it.progress, 0) / (items.length * 100)) * 100 : 0;

  return (
    <div>
      <PageHead
        kicker={t('batch.title')}
        title={t('nav.batch')}
        sub={demoMode ? 'Batch Scan (Demo Mode / Simulated Mock Detections)' : 'Batch Scan (Real AI Model: best.pt)'}
        right={
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            {/* Mode Switcher */}
            <button
              onClick={toggleMode}
              className={`btn btn-sm ${demoMode ? 'btn-secondary' : 'btn-primary'}`}
              title="Toggle between Real AI Model inference and Simulated Demo Mode"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconShield size={14} />
              <span>{demoMode ? '⚠️ Switch to Real AI Model' : '✓ Real Model (best.pt)'}</span>
            </button>

            {/* Threshold Selector */}
            <div className="row" style={{ alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <span className="muted">Conf:</span>
              <select
                className="select"
                style={{ padding: '4px 8px', fontSize: 12.5 }}
                value={confThreshold}
                onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
              >
                {CONFIDENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <Button variant="primary" size="sm" onClick={() => startScan()} disabled={running}>
              <IconPlay size={14} /> {t('batch.start')}
            </Button>
            {running ? (
              <Button variant="secondary" size="sm" onClick={pause}>
                <IconStop size={14} /> {t('batch.pause')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={resume}
                disabled={!items.some((i) => i.status === 'queued' || i.status === 'processing' || i.status === 'cancelled')}
              >
                {t('batch.resume')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={cancel} disabled={!running}>
              <IconStop size={14} /> {t('common.cancel')}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={items.length === 0}>
              <IconX size={14} /> {t('batch.clear')}
            </Button>
          </div>
        }
      />

      {demoMode && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: 8,
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            color: '#fef08a',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconAlert size={20} />
            <div>
              <strong style={{ display: 'block', marginBottom: 2 }}>Simulation Mode Active (Mock Data)</strong>
              <span>Batch scans in this mode run offline random simulations and do <em>not</em> send frames to the trained <code>best.pt</code> model.</span>
            </div>
          </div>
          <button
            onClick={toggleMode}
            className="btn btn-sm btn-primary"
            style={{ whiteSpace: 'nowrap' }}
          >
            Switch to Real AI Model (best.pt)
          </button>
        </div>
      )}

      {/* Real Statistics Grid */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="card">
          <div className="tiny upper muted">{t('common.queued')}</div>
          <b style={{ fontSize: 24 }}>{stats.total}</b>
          <span className="tiny muted">{t('batch.stat.frames')}</span>
        </div>
        <div className="card">
          <div className="tiny upper muted">{t('batch.stat.processed')}</div>
          <b style={{ fontSize: 24, color: 'var(--teal)' }}>{stats.completed}</b>
          <span className="tiny muted">
            {stats.processing ? t('batch.stat.running', { n: stats.processing }) : t('batch.stat.idle')}
          </span>
        </div>
        <div className="card">
          <div className="tiny upper muted">Real Objects Found</div>
          <b style={{ fontSize: 24, color: 'var(--accent)' }}>{stats.objects}</b>
          <span className="tiny muted">across {stats.completed} scanned images</span>
        </div>
        <div className="card">
          <div className="tiny upper muted">Avg Confidence</div>
          <b style={{ fontSize: 24 }}>
            {stats.avgConf !== null ? `${(stats.avgConf * 100).toFixed(1)}%` : 'N/A'}
          </b>
          <span className="tiny muted">
            {stats.failed ? t('batch.stat.failed', { n: stats.failed }) : `${stats.objects} real detections`}
          </span>
        </div>
      </div>

      {/* Progress & Upload Actions Bar */}
      <Card style={{ marginTop: 16 }}>
        <div className="row-between" style={{ gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="tiny upper muted">
                {demoMode ? 'Batch Progress (Simulated)' : `Batch Progress (best.pt · Conf: ${confThreshold.toFixed(2)})`}
              </span>
              <b className="mono small" style={{ color: allDone ? 'var(--teal)' : 'var(--accent)' }}>
                {allDone ? t('batch.complete') : `${Math.round(overall)}%`}
              </b>
            </div>
            <Progress value={overall} tone={allDone ? 'var(--teal)' : 'var(--accent)'} />
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <IconFolder size={14} /> {t('batch.addfiles')}
            </Button>
            <Button size="sm" variant="secondary" onClick={openFolderPicker}>
              <IconUpload size={14} /> {t('batch.addfolder')}
            </Button>
            <Button size="sm" variant="ghost" onClick={retryFailed} disabled={stats.failed === 0}>
              <IconRefresh size={14} /> {t('batch.retry')}
            </Button>
            {allDone && (
              <>
                <Button size="sm" variant="primary" onClick={() => exportResults('csv')}>
                  <IconDoc size={14} /> {t('batch.exportcsv')}
                </Button>
                <Button size="sm" variant="primary" onClick={() => exportResults('json')}>
                  <IconDoc size={14} /> {t('batch.exportjson')}
                </Button>
                <Button size="sm" variant="primary" onClick={() => exportResults('pdf')}>
                  <IconDownload size={14} /> {t('batch.exportpdf')}
                </Button>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xtf,.son,.jsf,.png,.jpg,.jpeg,.bmp,.tif"
            multiple
            style={{ display: 'none' }}
            onChange={onFiles}
          />
          <input ref={folderRef} type="file" style={{ display: 'none' }} onChange={onFiles} />
        </div>
      </Card>

      {/* Batch Cards Grid */}
      {items.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState
            title={t('batch.empty')}
            icon={<IconUpload size={20} />}
            action={
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                <IconFolder size={15} /> {t('batch.addframes')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid cols-12" style={{ marginTop: 16, gap: 14 }}>
          {items.map((it) => {
            const reportDetection = it.detectionId ? store.detections.find((detection) => detection.id === it.detectionId) : undefined;
            const reportSource: DetectionReportSource = {
              id: it.detectionId ?? it.id,
              imageId: it.filename,
              createdAt: reportDetection?.createdAt ?? new Date(it.addedAt).toISOString(),
              predictions: it.predictions,
              detection: reportDetection,
              status: 'completed',
              selectedIndex: 0,
              confidenceThreshold: confThreshold,
            };
            return (
              <div key={it.id} className="span-4">
                <Card className="h-full" style={{ padding: 12 }}>
                  {/* Card Header */}
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <span
                      className="mono small"
                      style={{
                        color: 'var(--ink-2)',
                        fontWeight: 600,
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={it.filename}
                    >
                      {it.filename}
                    </span>
                    <Tag
                      kind={
                        it.status === 'completed'
                          ? it.detectionCount > 0
                            ? 'rec'
                            : 'rule'
                          : it.status === 'failed'
                            ? 'ver'
                            : it.status === 'processing'
                              ? 'ai'
                              : 'est'
                      }
                    >
                      {statusLabel(it.status).toUpperCase()}
                    </Tag>
                  </div>

                  {/* Real Image Preview & All Real Bounding Boxes */}
                  <div
                    className="sonimg"
                    style={{
                      position: 'relative',
                      borderRadius: 9,
                      overflow: 'hidden',
                      height: 140,
                      background: '#050b14',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {it.previewUrl ? (
                      <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0, maxWidth: '100%', maxHeight: 140 }}>
                        <img
                          src={it.previewUrl}
                          alt={it.filename}
                          style={{
                            maxWidth: '100%',
                            maxHeight: 140,
                            width: 'auto',
                            height: 'auto',
                            display: 'block',
                            filter: it.status === 'failed' ? 'grayscale(0.6) opacity(0.55)' : undefined,
                          }}
                        />

                        {/* Overlay real bounding boxes for all detections */}
                        {it.status === 'completed' &&
                          it.predictions.map((p, idx) => {
                            const isNearRight = (p.bbox.x + (p.bbox.width || 0)) > 0.65;
                            const isNearTop = p.bbox.y < 0.12;
                            return (
                              <div
                                key={idx}
                                style={{
                                  position: 'absolute',
                                  left: `${p.bbox.x * 100}%`,
                                  top: `${p.bbox.y * 100}%`,
                                  width: `${p.bbox.width * 100}%`,
                                  height: `${p.bbox.height * 100}%`,
                                  border: '2px solid var(--accent)',
                                  boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                                  pointerEvents: 'none',
                                }}
                              >
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: isNearTop ? 'auto' : '100%',
                                    top: isNearTop ? '100%' : 'auto',
                                    left: isNearRight ? 'auto' : 0,
                                    right: isNearRight ? 0 : 'auto',
                                    background: 'rgba(2,6,12,0.88)',
                                    color: 'var(--accent)',
                                    fontSize: 9,
                                    padding: '1px 3px',
                                    borderRadius: isNearTop ? '0 0 2px 2px' : 2,
                                    whiteSpace: 'nowrap',
                                    fontFamily: 'monospace',
                                    lineHeight: 'normal',
                                  }}
                                >
                                  {p.label} {(p.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '140px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--ink-4)',
                          color: 'var(--ink-3)',
                          fontSize: 12,
                        }}
                      >
                        {it.filename}
                      </div>
                    )}

                    {/* Processing Spinner Overlay */}
                    {it.status === 'processing' && (
                      <div
                        className="overlay-cover"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(2,6,12,0.65)',
                        }}
                      >
                        <span className="spinner" />
                      </div>
                    )}
                  </div>

                  {/* Card Info & Status */}
                  <div className="row-between" style={{ marginTop: 8, gap: 6, fontSize: 12 }}>
                    {it.status === 'completed' ? (
                      it.detectionCount > 0 ? (
                        <>
                          <span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                            {it.rawLabel || (it.className ? clsLabel(it.className, language) : 'Object')}
                          </span>
                          <span className="mono" style={{ color: 'var(--ink-2)' }}>
                            {it.detectionCount} found · {(it.avgConfidence * 100).toFixed(1)}%
                          </span>
                        </>
                      ) : (
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          0 objects detected (@ {confThreshold.toFixed(2)})
                        </span>
                      )
                    ) : it.status === 'processing' ? (
                      <span className="mono tiny" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        Scanning frame...
                      </span>
                    ) : it.status === 'failed' ? (
                      <span className="mono tiny" style={{ color: 'var(--critical)' }}>
                        <IconAlert size={12} /> {it.error ? it.error.slice(0, 32) : 'Inference error'}
                      </span>
                    ) : it.status === 'cancelled' ? (
                      <span className="muted tiny">Scan cancelled</span>
                    ) : (
                      <span className="muted tiny">Awaiting scan</span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginTop: 8 }}>
                    <Progress
                      value={it.progress}
                      slim
                      tone={
                        it.status === 'failed'
                          ? 'var(--critical)'
                          : it.status === 'completed'
                            ? 'var(--teal)'
                            : 'var(--accent)'
                      }
                    />
                  </div>

                  {/* Card Actions */}
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    {it.status === 'completed' && it.detectionId && (
                      <Link to={`detail/${it.detectionId}`} className="btn btn-secondary btn-sm" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}>
                        <IconDoc size={12} /> {t('det.inspect')}
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeItem(it.id)}
                      title={t('batch.remove')}
                      style={{ padding: '4px 8px' }}
                    >
                      <IconX size={12} />
                    </Button>
                  </div>
                  {it.status === 'completed' && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-faint)' }}>
                      <DetectionReportActions source={reportSource} />
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  function removeItem(id: string) {
    const it = items.find((i) => i.id === id);
    if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
    setItems((its) => its.filter((i) => i.id !== id));
  }
}