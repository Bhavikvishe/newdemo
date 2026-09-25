import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_META, fmtCoordinate, fmtSize, fmtWeight, makeDetectionFromFile, pct } from '../lib/mock';
import type { DetectionReportSource } from '../lib/mock';
import { fetchPredictions, mapClass, fileToDataUrl, setCachedImage } from '../lib/detect';
import type { DetectDebugInfo, ModelPrediction } from '../lib/detect';
import { WeatherReport } from '../components/Weather';
import { categoryLabel, clsLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { PageHead, Card, CardHead, Button, RiskBadge, Tag, Kv, DetectionReportActions } from '../lib/ui';
import { Link } from '../lib/router';
import { IconCheck, IconUpload, IconScan, IconRefresh, IconDoc, IconAlert, IconInfo, IconShield } from '../components/Icons';
import type { Detection, DetectionClass } from '../types';

const STAGES = ['det.stage1', 'det.stage2', 'det.stage3', 'det.stage4', 'det.stage5'];

const CONFIDENCE_OPTIONS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50];

const DEPT_KEYS: Record<string, string> = {
  'marine-operations': 'dept.mop',
  'marine-engineering': 'dept.meng',
  'marine-environmental': 'dept.menv',
  'search-rescue': 'dept.sar',
  'ocean-survey': 'dept.survey',
  'recovery-response': 'dept.rec',
  'system-admin': 'dept.admin',
};

export function DetectionPage() {
  const store = useStore();
  const { language } = store;
  const t = makeT(language);
  const deptLabel = (id: string) => t(DEPT_KEYS[id] ?? id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [demoMode, setDemoMode] = useState(false);
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [active, setActive] = useState(false);
  const [processingIdx, setProcessingIdx] = useState(-1);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<Detection | null>(null);
  const [allDetections, setAllDetections] = useState<ModelPrediction[]>([]);
  const [selectedPredIdx, setSelectedPredIdx] = useState(0);
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noObjects, setNoObjects] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DetectDebugInfo | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const runIdRef = useRef(0);

  const selectPrediction = (idx: number) => {
    if (!allDetections[idx]) return;
    setSelectedPredIdx(idx);
    const p = allDetections[idx];
    setResult((prev) => {
      if (!prev) return prev;
      const mappedClass = mapClass(p.label) ?? 'shipwreck';
      const meta = CLASS_META[mappedClass];
      return {
        ...prev,
        className: mappedClass,
        rawLabel: p.label,
        confidence: p.confidence,
        boundingBox: { ...p.bbox, normalized: true },
        inferenceDetails: {
          ...prev.inferenceDetails,
          rawBbox: p.raw_bbox,
        },
        estimatedSize: {
          length: +(p.bbox.width * 25).toFixed(1),
          width: +(p.bbox.height * 12).toFixed(1),
          height: +(p.bbox.height * 6).toFixed(1),
          unit: 'm',
        },
        estimatedWeight: {
          min: Math.round(p.bbox.width * 1200),
          max: Math.round(p.bbox.width * 3000),
          unit: 'kg',
          confidence: p.confidence,
        },
        riskLevel: meta ? meta.riskBase : 'high',
        riskScore: meta?.riskBase === 'critical' ? 95 : meta?.riskBase === 'high' ? 80 : 55,
        department: meta ? meta.primary : 'marine-operations',
        recommendedEquipment: meta ? meta.equipment : ['Survey ROV'],
        removalMethod: meta ? meta.removal : 'Standard marine salvage',
        notes: `Real model detection: ${p.label} (conf: ${(p.confidence * 100).toFixed(1)}%) via best.pt`,
      };
    });
  };

  const toggleMode = () => {
    const next = !demoMode;
    setDemoMode(next);
    store.updateSettings({ demoMode: next });
    if (currentFile) {
      run(currentFile, confThreshold, next);
    }
  };

  const run = async (file: File, overrideConf?: number, overrideDemoMode?: boolean) => {
    const runId = ++runIdRef.current;
    const activeConf = overrideConf ?? confThreshold;
    const isDemo = overrideDemoMode !== undefined ? overrideDemoMode : demoMode;

    setCurrentFile(file);
    setActive(true);
    setDone(false);
    setError(null);
    setNoObjects(false);
    setResult(null);
    setAllDetections([]);
    setDebugInfo(null);
    setProcessingIdx(0);

    // Load file into frame preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFrame(String(reader.result));
      reader.onerror = () => setFrame(null);
      reader.readAsDataURL(file);
    } else {
      setFrame(null);
    }

    if (isDemo) {
      // -------------------------------------------------------------
      // DEMO MODE: explicitly simulated/synthetic detections for offline testing
      // -------------------------------------------------------------
      const base = makeDetectionFromFile(file);
      base.isRealModel = false;
      base.notes = `Simulated offline demo test (synthetic generation)`;
      setResult(base);
      if (!file.type.startsWith('image/')) {
        setFrame(renderFrame(base, { width: 720 }, language));
      }
      return;
    }

    // -------------------------------------------------------------
    // REAL MODEL MODE: Strictly use trained model (best.pt) output
    // -------------------------------------------------------------
    try {
      const resp = await fetchPredictions(file, {
        conf: activeConf,
        debug: true,
      });

      if (runId !== runIdRef.current) return;

      if (resp.debug) {
        setDebugInfo(resp.debug);
      }

      const preds = resp.predictions || [];
      setAllDetections(preds);
      setSelectedPredIdx(0);

      if (preds.length === 0) {
        setNoObjects(true);
        setDone(true);
        setProcessingIdx(-1);
        return;
      }

      // We have real predictions from best.pt
      const p = preds[0];
      const mappedClass: DetectionClass = mapClass(p.label) ?? 'shipwreck';
      const meta = CLASS_META[mappedClass];
      const dataUrl = await fileToDataUrl(file);
      const detId = `REAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      if (dataUrl) {
        setCachedImage(detId, dataUrl);
        setCachedImage(file.name, dataUrl);
      }

      const realDet: Detection = {
        id: detId,
        imageId: file.name,
        imageUrl: dataUrl,
        className: mappedClass,
        confidence: p.confidence, // EXACT prediction confidence, never altered or scaled
        boundingBox: {
          x: p.bbox.x,
          y: p.bbox.y,
          width: p.bbox.width,
          height: p.bbox.height,
          normalized: true,
        },
        predictions: preds.map((pr) => ({
          class_id: pr.class_id,
          label: pr.label,
          confidence: pr.confidence,
          bbox: { ...pr.bbox, normalized: true },
          raw_bbox: pr.raw_bbox,
        })),
        gps: {
          latitude: 18.922 + (p.bbox.x - 0.5) * 0.05,
          longitude: 72.834 + (p.bbox.y - 0.5) * 0.05,
          accuracy: 3,
          timestamp: new Date().toISOString(),
        },
        estimatedSize: {
          length: +(p.bbox.width * 25).toFixed(1),
          width: +(p.bbox.height * 12).toFixed(1),
          height: +(p.bbox.height * 6).toFixed(1),
          unit: 'm',
        },
        estimatedWeight: {
          min: Math.round(p.bbox.width * 1200),
          max: Math.round(p.bbox.width * 3000),
          unit: 'kg',
          confidence: p.confidence,
        },
        riskLevel: meta ? meta.riskBase : 'high',
        riskScore: meta?.riskBase === 'critical' ? 95 : meta?.riskBase === 'high' ? 80 : 55,
        priority: meta?.riskBase === 'critical' ? 1 : 2,
        responseDeadline: new Date(Date.now() + (meta?.hours ?? 48) * 3600e3).toISOString(),
        department: meta ? meta.primary : 'marine-operations',
        recommendedEquipment: meta ? meta.equipment : ['Survey ROV'],
        removalMethod: meta ? meta.removal : 'Standard marine salvage',
        verificationStatus: 'pending',
        notes: `Real model detection: ${p.label} (conf: ${(p.confidence * 100).toFixed(1)}%) via best.pt`,
        detectionTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiPrediction: true,
        estimated: true,
        recommended: true,
        source: 'upload',
        manualVerificationRequired: p.confidence < 0.5,
        isRealModel: true,
        rawLabel: p.label,
        inferenceDetails: {
          conf: activeConf,
          imgsz: resp.debug?.imgsz ?? 640,
          iou: resp.debug?.iou ?? 0.7,
          modelPath: resp.debug?.model_path ?? 'E:\\newdemo\\best.pt',
          rawBbox: p.raw_bbox,
        },
      };

      setResult(realDet);
      store.recordDetection(realDet, { silent: true });
    } catch (err: unknown) {
      if (runId !== runIdRef.current) return;
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setDone(true);
      setProcessingIdx(-1);
    }
  };

  const reScanWithThreshold = (newConf: number) => {
    setConfThreshold(newConf);
    if (currentFile) {
      run(currentFile, newConf);
    }
  };

  const reset = () => {
    runIdRef.current += 1;
    setActive(false);
    setDone(false);
    setError(null);
    setNoObjects(false);
    setProcessingIdx(-1);
    setResult(null);
    setAllDetections([]);
    setSelectedPredIdx(0);
    setFrame(null);
    setDebugInfo(null);
    setCurrentFile(null);
  };

  useEffect(() => {
    if (processingIdx < 0 || processingIdx >= STAGES.length) return;
    const timer = window.setTimeout(() => {
      if (processingIdx === STAGES.length - 1) {
        setDone(true);
        setProcessingIdx(-1);
      } else {
        setProcessingIdx((i) => i + 1);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [processingIdx]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) run(file);
  };

  const prog = useMemo(() => {
    if (!active) return 0;
    if (done) return 100;
    return Math.round(((processingIdx + 1) / STAGES.length) * 100);
  }, [active, done, processingIdx]);

  const meta = result ? CLASS_META[result.className] : null;
  const reportSource: DetectionReportSource | null = done && result
    ? {
        id: result.id,
        imageId: currentFile?.name ?? result.imageId,
        createdAt: result.createdAt,
        predictions: allDetections.length > 0 ? allDetections : result.predictions ?? [],
        detection: result,
        status: 'completed',
        selectedIndex: selectedPredIdx,
        confidenceThreshold: confThreshold,
      }
    : null;
  const noObjectReportSource: DetectionReportSource | null = noObjects && currentFile
    ? {
        id: currentFile.name,
        imageId: currentFile.name,
        createdAt: new Date().toISOString(),
        predictions: [],
        status: 'completed',
        confidenceThreshold: confThreshold,
      }
    : null;

  return (
    <div>
      <PageHead
        kicker={t('det.title')}
        title={t('nav.detection')}
        sub={demoMode ? 'Demo Mode (Simulated Mock Detections)' : 'Real AI Model Inference (best.pt) · 6 Classes'}
        right={
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
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
                onChange={(e) => reScanWithThreshold(parseFloat(e.target.value))}
              >
                {CONFIDENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <Link to="batch" className="btn btn-secondary btn-sm">
              <IconScan size={14} /> {t('nav.batch')}
            </Link>
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
              <span>Detections in this mode are randomly generated synthetic simulations for offline UI testing and do <em>not</em> reflect inferences from the trained <code>best.pt</code> model.</span>
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

      <div className="grid cols-12" style={{ gap: 16 }}>
        {/* Left Column: Dropzone / Sonar Preview & Pipeline */}
        <div className="span-5">
          {!active ? (
            <>
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <IconUpload size={28} />
                <b>{t('det.drop')}</b>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {demoMode ? 'Demo Mode Active — Simulated Pipeline' : 'Real Model Inference (best.pt) · 6 Classes'}
                </span>
                <span className="tiny upper muted" style={{ marginTop: 4 }}>
                  Threshold: {confThreshold.toFixed(2)} · .jpg · .png · .tif · .xtf
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.xtf,.son,.jsf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) run(f);
                  e.target.value = '';
                }}
              />
            </>
          ) : (
            <Card solid className="h-full" style={{ padding: 18 }}>
              <CardHead
                kt={demoMode ? 'SIMULATED DEMO (MOCK)' : 'ULTRALYTICS YOLO INFERENCE'}
                title={
                  error
                    ? 'Inference Error'
                    : noObjects
                      ? 'No Objects Detected'
                      : result
                        ? clsLabel(result.className, language)
                        : t('det.analyzing')
                }
                right={
                  done ? (
                    <Tag kind={error ? 'ver' : demoMode ? 'rule' : 'ai'}>
                      {error ? 'Failed' : demoMode ? 'Simulated Demo' : 'Real Model (best.pt)'}
                    </Tag>
                  ) : (
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                  )
                }
              />

              <div
                className="sonimg"
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  overflow: 'hidden',
                  marginBottom: 14,
                  background: '#050b14',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: 220,
                }}
              >
                {frame ? (
                  <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0 }}>
                    <img
                      src={frame}
                      alt={t('det.sonarFrame')}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '65vh',
                        width: 'auto',
                        height: 'auto',
                        display: 'block',
                      }}
                    />

                    {/* Overlaid Real Bounding Boxes for ALL detections */}
                    {allDetections.length > 0 ? (
                      allDetections.map((p, idx) => {
                        const isSelected = idx === selectedPredIdx;
                        const isNearRight = (p.bbox.x + (p.bbox.width || 0)) > 0.65;
                        const isNearTop = p.bbox.y < 0.1;
                        return (
                          <div
                            key={idx}
                            onClick={() => selectPrediction(idx)}
                            style={{
                              position: 'absolute',
                              left: `${p.bbox.x * 100}%`,
                              top: `${p.bbox.y * 100}%`,
                              width: `${p.bbox.width * 100}%`,
                              height: `${p.bbox.height * 100}%`,
                              border: isSelected ? '2.5px solid var(--accent)' : '2px solid rgba(0, 220, 200, 0.75)',
                              background: isSelected ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0, 220, 200, 0.05)',
                              boxShadow: isSelected
                                ? '0 0 12px rgba(0, 240, 255, 0.5), 0 0 0 1px rgba(0,0,0,0.8)'
                                : '0 0 0 1px rgba(0,0,0,0.6)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              zIndex: isSelected ? 10 : 3,
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                bottom: isNearTop ? 'auto' : '100%',
                                top: isNearTop ? '100%' : 'auto',
                                left: isNearRight ? 'auto' : 0,
                                right: isNearRight ? 0 : 'auto',
                                background: isSelected ? 'var(--accent)' : 'rgba(2,6,12,0.92)',
                                color: isSelected ? '#000' : 'var(--accent)',
                                fontWeight: 700,
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: isNearTop ? '0 0 3px 3px' : '3px 3px 0 0',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                lineHeight: 'normal',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                              }}
                            >
                              #{idx + 1} {p.label} {(p.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      result && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${result.boundingBox.x * 100}%`,
                            top: `${result.boundingBox.y * 100}%`,
                            width: `${result.boundingBox.width * 100}%`,
                            height: `${result.boundingBox.height * 100}%`,
                            border: '2px solid var(--accent)',
                            boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                            pointerEvents: 'none',
                          }}
                        />
                      )
                    )}
                  </div>
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink-4)', color: 'var(--ink-2)' }}>
                    No visual frame
                  </div>
                )}

                {done && result && (
                  <div className="row-between" style={{ position: 'absolute', top: 8, left: 8, right: 8, pointerEvents: 'none', zIndex: 12 }}>
                    <span className="badge b-accent">
                      {allDetections.length > 1
                        ? `${allDetections.length} OBJECTS DETECTED · #${selectedPredIdx + 1} ACTIVE`
                        : `${(result.rawLabel || clsLabel(result.className, language)).toUpperCase()} · ${pct(result.confidence)}`}
                    </span>
                    <span className="badge b-plain">
                      <span className="dot" /> {fmtCoordinate(result.gps.latitude, result.gps.longitude)}
                    </span>
                  </div>
                )}
              </div>

              <div className="progress thick" style={{ marginBottom: 14 }}>
                <div
                  className="bar"
                  style={{
                    width: `${prog}%`,
                    background: error ? 'var(--critical)' : done ? 'var(--teal)' : 'var(--accent)',
                  }}
                />
              </div>

              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="tiny upper muted">
                  {error
                    ? 'Inference Terminated'
                    : done
                      ? t('det.pipelineComplete')
                      : t('det.pipelineRunning')}
                </span>
                <b className="mono small" style={{ color: error ? 'var(--critical)' : done ? 'var(--teal)' : 'var(--accent)' }}>
                  {prog}%
                </b>
              </div>

              <div className="stack" style={{ gap: 6 }}>
                {STAGES.map((s, i) => {
                  const st = i < processingIdx || done ? 'done' : i === processingIdx ? 'now' : 'todo';
                  return (
                    <div key={s} className={`stage-row ${st}`}>
                      {st === 'done' ? <IconCheck size={13} /> : <span className="st-dot" />}
                      <span>{t(s)}</span>
                      {st === 'now' && <span className="spinner" style={{ width: 12, height: 12 }} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 14 }}>
                <Button variant="secondary" onClick={reset} style={{ width: '100%' }}>
                  <IconRefresh size={14} /> Scan Another File
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Real Detection Details & Separation of Model Output vs Derived */}
        <div className="span-7">
          {error ? (
            <Card className="h-full">
              <CardHead kt="INFERENCE ERROR" title="Model Inference Failed" />
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ color: 'var(--critical)', marginBottom: 12 }}>
                  <IconAlert size={36} />
                </div>
                <h4 style={{ color: 'var(--critical)', marginBottom: 8 }}>{error}</h4>
                <p className="muted" style={{ fontSize: 13, maxWidth: 480, margin: '0 auto 18px' }}>
                  The backend inference server encountered an issue or is unreachable. Ensure the Python API is running:
                </p>
                <pre
                  style={{
                    background: 'var(--ink-4)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    display: 'inline-block',
                    textAlign: 'left',
                    color: 'var(--ink-1)',
                  }}
                >
                  .venv\Scripts\python.exe server/app.py
                </pre>
                <div style={{ marginTop: 20 }}>
                  <Button variant="primary" onClick={() => currentFile && run(currentFile)}>
                    <IconRefresh size={14} /> Retry Inference
                  </Button>
                </div>
              </div>
            </Card>
          ) : noObjects ? (
            <Card className="h-full">
              <CardHead kt="ZERO DETECTIONS" title="No Objects Found" />
              <div style={{ padding: 28, textAlign: 'center' }}>
                <div style={{ color: 'var(--accent)', marginBottom: 12 }}>
                  <IconInfo size={36} />
                </div>
                <h4 style={{ marginBottom: 8 }}>No detections above confidence {confThreshold.toFixed(2)}</h4>
                <p className="muted" style={{ fontSize: 13, maxWidth: 480, margin: '0 auto 16px' }}>
                  The model did not find any objects in this frame matching the trained classes at threshold {confThreshold.toFixed(2)}.
                  Real model mode never fabricates fake detections.
                </p>
                {noObjectReportSource && <DetectionReportActions source={noObjectReportSource} />}
                <div className="row wrap center" style={{ gap: 8, justifyContent: 'center', marginTop: 14 }}>
                  <span className="tiny upper muted">Try lowering threshold:</span>
                  {[0.10, 0.15, 0.20].map((th) => (
                    <button
                      key={th}
                      className="btn btn-sm btn-secondary"
                      onClick={() => reScanWithThreshold(th)}
                    >
                      Scan @ {th.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          ) : !result ? (
            <Card className="h-full">
              <CardHead kt={t('det.ktAnalysis')} title={t('an.summary')} />
              <div style={{ padding: '40px 16px', color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
                <p>{t('det.emptyHint')}</p>
                <div style={{ marginTop: 12, fontSize: 12 }} className="muted">
                  Model: <b>best.pt</b> (Classes: shipwreck, pipeline, ghost_fishing_gear, cylinder, airplane, mine)
                </div>
              </div>
            </Card>
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              {/* SECTION 1: MODEL OUTPUT (RAW NEURAL NETWORK PREDICTION) */}
              <Card>
                <CardHead
                  kt={result.isRealModel ? 'MODEL OUTPUT (RAW INFERENCE)' : 'SIMULATED DEMO (RANDOM MOCK DATA)'}
                  title={
                    allDetections.length > 1
                      ? `${allDetections.length} OBJECTS FOUND — #${selectedPredIdx + 1}: ${(result.rawLabel || clsLabel(result.className, language)).toUpperCase()} (${pct(result.confidence)})`
                      : `${(result.rawLabel || clsLabel(result.className, language)).toUpperCase()} — ${pct(result.confidence)}`
                  }
                  right={
                    <Tag kind={result.isRealModel ? 'ai' : 'rule'}>
                      {result.isRealModel ? 'Real AI Prediction (best.pt)' : 'Simulated Demo (Not Real AI)'}
                    </Tag>
                  }
                />

                <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
                  <Tag kind={result.isRealModel ? 'ai' : 'rule'}>
                    {result.isRealModel ? 'Model: best.pt' : 'Engine: Synthetic Mock (No AI)'}
                  </Tag>
                  <Tag kind={result.isRealModel ? 'ai' : 'rule'}>Total Detections: {allDetections.length || 1}</Tag>
                  <Tag kind="rule">Active Conf: {(result.confidence * 100).toFixed(2)}%</Tag>
                  <Tag kind="rule">Conf Threshold: {confThreshold.toFixed(2)}</Tag>
                </div>

                {/* Multi-object selection switcher */}
                {allDetections.length > 1 && (
                  <div style={{ marginBottom: 14, background: 'var(--ink-4)', padding: 12, borderRadius: 8 }}>
                    <div className="row-between" style={{ marginBottom: 8 }}>
                      <span className="tiny upper muted" style={{ fontWeight: 600 }}>
                        All {allDetections.length} Objects Detected in Frame:
                      </span>
                      <span className="tiny muted">Click to switch active object details</span>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {allDetections.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`btn btn-sm ${selectedPredIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            fontSize: 11.5,
                            padding: '4px 10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                          onClick={() => selectPrediction(idx)}
                        >
                          <span className="mono" style={{ opacity: 0.8 }}>#{idx + 1}</span>
                          <b>{p.label}</b>
                          <span className="mono" style={{ opacity: 0.9 }}>{(p.confidence * 100).toFixed(1)}%</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid cols-12" style={{ gap: 8, background: 'var(--ink-4)', padding: 12, borderRadius: 8 }}>
                  <div className="span-4">
                    <Kv k="RAW CLASS LABEL" v={<b className="mono" style={{ color: 'var(--accent)' }}>{result.rawLabel || result.className}</b>} />
                  </div>
                  <div className="span-4">
                    <Kv k="RAW CONFIDENCE" v={<b className="mono" style={{ color: 'var(--teal)' }}>{result.confidence.toFixed(4)} ({pct(result.confidence)})</b>} />
                  </div>
                  <div className="span-4">
                    <Kv k="INFERENCE RES" v={<b className="mono">640 x 640</b>} />
                  </div>
                  <div className="span-6">
                    <Kv
                      k="NORMALIZED BBOX (X, Y, W, H)"
                      v={
                        <span className="mono" style={{ fontSize: 11.5 }}>
                          [{result.boundingBox.x}, {result.boundingBox.y}, {result.boundingBox.width}, {result.boundingBox.height}]
                        </span>
                      }
                    />
                  </div>
                  <div className="span-6">
                    <Kv
                      k="PIXEL BBOX [X1, Y1, X2, Y2]"
                      v={
                        <span className="mono" style={{ fontSize: 11.5 }}>
                          {result.inferenceDetails?.rawBbox
                            ? `[${result.inferenceDetails.rawBbox.x1}, ${result.inferenceDetails.rawBbox.y1}, ${result.inferenceDetails.rawBbox.x2}, ${result.inferenceDetails.rawBbox.y2}]`
                            : 'Normalized coordinates'}
                        </span>
                      }
                    />
                  </div>
                </div>
              </Card>

              {/* SECTION 2: DERIVED / ESTIMATED INTELLIGENCE */}
              <Card>
                <CardHead
                  kt="DERIVED / ESTIMATED DATA"
                  title={`${clsLabel(result.className, language)} — ${categoryLabel(meta ? meta.category : 'anomaly', language)}`}
                  right={<RiskBadge risk={result.riskLevel} />}
                />

                <p className="muted" style={{ fontSize: 13, maxWidth: 560, marginBottom: 12 }}>
                  {meta?.description}
                </p>

                <div className="grid cols-12" style={{ gap: 8 }}>
                  <div className="span-4">
                    <Kv k={t('det.riskScore')} v={<b className="mono">{result.riskScore} / 100</b>} />
                  </div>
                  <div className="span-4">
                    <Kv k={t('det.responseWindow')} v={<b className="mono">{String(meta?.hours ?? 48).padStart(2, '0')} h</b>} />
                  </div>
                  <div className="span-4">
                    <Kv k="VERIFICATION" v={<Tag kind={result.manualVerificationRequired ? 'ver' : 'rec'}>{result.manualVerificationRequired ? 'Manual Req.' : 'Auto Confirmed'}</Tag>} />
                  </div>
                  <div className="span-6">
                    <Kv k={t('det.estDims')} v={<b className="mono">{fmtSize(result.estimatedSize)}</b>} />
                  </div>
                  <div className="span-6">
                    <Kv k={t('det.estWeight')} v={<b className="mono">{fmtWeight(result.estimatedWeight)}</b>} />
                  </div>
                  <div className="span-6">
                    <Kv k={t('det.position')} v={<b className="mono" style={{ fontSize: 11.5 }}>{fmtCoordinate(result.gps.latitude, result.gps.longitude)}</b>} />
                  </div>
                  <div className="span-6">
                    <Kv k={t('det.depthCol')} v={<b className="mono">{t('det.gpsAccuracy', { n: result.gps.accuracy })}</b>} />
                  </div>
                </div>

                <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div className="row wrap" style={{ gap: 10 }}>
                    <div className="response-block" style={{ flex: 1, minWidth: 200 }}>
                      <span className="tiny upper muted">{t('det.removalMethod')}</span>
                      <b style={{ fontSize: 12.5, display: 'block', marginTop: 4 }}>{meta?.removal}</b>
                      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                        {meta?.equipment.slice(0, 3).map((e) => (
                          <span key={e} className="tag rec">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="response-block" style={{ flex: 1, minWidth: 180 }}>
                      <span className="tiny upper muted">{t('det.respDept')}</span>
                      <b className="row" style={{ gap: 8, marginTop: 4, fontSize: 12.5 }}>
                        <span className="legend-dot" style={{ background: meta?.color }} />
                        {deptLabel(meta?.primary ?? 'marine-operations')}
                      </b>
                    </div>
                  </div>
                </div>

                <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
                  <Link to={`detail/${result.id}`} className="btn btn-primary btn-sm">
                    <IconDoc size={14} /> {t('det.inspectFull')}
                  </Link>
                  <Button variant="secondary" onClick={reset} style={{ padding: '6px 12px', fontSize: 12 }}>
                    <IconRefresh size={14} /> {t('det.runAnother')}
                  </Button>
                  {reportSource && <DetectionReportActions source={reportSource} />}
                </div>
              </Card>

              {/* SECTION 3: DEBUG TELEMETRY (if available) */}
              {debugInfo && (
                <Card>
                  <CardHead kt="DEBUG TELEMETRY" title="YOLO Diagnostics" />
                  <div className="grid cols-12" style={{ gap: 8, fontSize: 12 }}>
                    <div className="span-6">
                      <Kv k="MODEL PATH" v={<span className="mono" style={{ fontSize: 11 }}>{debugInfo.model_path}</span>} />
                    </div>
                    <div className="span-6">
                      <Kv k="INPUT DIMENSIONS" v={<span className="mono">{debugInfo.input_shape?.join(' x ')}</span>} />
                    </div>
                    <div className="span-4">
                      <Kv k="RAW DETECTIONS" v={<b className="mono">{debugInfo.raw_detections}</b>} />
                    </div>
                    <div className="span-4">
                      <Kv k="FILTERED DETECTIONS" v={<b className="mono">{debugInfo.post_detections}</b>} />
                    </div>
                    <div className="span-4">
                      <Kv k="INFERENCE PARAMS" v={<span className="mono">conf={debugInfo.conf}, iou={debugInfo.iou}</span>} />
                    </div>
                  </div>
                </Card>
              )}

              <WeatherReport
                lat={result.gps.latitude}
                lng={result.gps.longitude}
                task={{ riskLevel: result.riskLevel, responseDeadline: result.responseDeadline }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}