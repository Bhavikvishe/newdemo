import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_META, fmtCoordinate, fmtSize, fmtWeight, makeDetectionFromFile, pct } from '../lib/mock';
import { fetchPredictions, mapClass } from '../lib/detect';
import { WeatherReport } from '../components/Weather';
import { categoryLabel, clsLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { PageHead, Card, CardHead, Button, RiskBadge, Tag, Kv } from '../lib/ui';
import { Link } from '../lib/router';
import { IconCheck, IconUpload, IconScan, IconRefresh, IconDoc } from '../components/Icons';
import type { Detection } from '../types';

const STAGES = ['det.stage1', 'det.stage2', 'det.stage3', 'det.stage4', 'det.stage5'];

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

  const [active, setActive] = useState(false);
  const [processingIdx, setProcessingIdx] = useState(-1);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<Detection | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const run = async (file: File) => {
    const runId = ++runIdRef.current;
    setActive(true);
    setDone(false);
    setProcessingIdx(0);
    setModelLabel(null);

    const base = makeDetectionFromFile(file);
    setResult(base);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFrame(String(reader.result));
      reader.onerror = () => setFrame(renderFrame(base, { width: 720 }, language));
      reader.readAsDataURL(file);
    } else {
      setFrame(renderFrame(base, { width: 720 }, language));
    }

    let final = base;
    const preds = await fetchPredictions(file).catch(() => null);
    if (runId !== runIdRef.current) return;
    if (preds && preds.length > 0) {
      const p = preds[0];
      final = makeDetectionFromFile(file, {
        className: mapClass(p.label) ?? base.className,
        confidence: p.confidence,
        bbox: p.bbox,
      });
      setModelLabel(p.label);
      setResult(final);
    }
    store.recordDetection(final, { silent: true });
  };

  const reset = () => {
    runIdRef.current += 1;
    setActive(false);
    setDone(false);
    setProcessingIdx(-1);
    setResult(null);
    setFrame(null);
    setModelLabel(null);
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
    }, 520);
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

  return (
    <div>
      <PageHead
        kicker={t('det.title')}
        title={t('nav.detection')}
        sub={t('det.sub')}
        right={
          <Link to="batch" className="btn btn-secondary">
            <IconScan size={15} /> {t('nav.batch')}
          </Link>
        }
      />

      <div className="grid cols-12" style={{ gap: 16 }}>
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
                <IconUpload size={26} />
                <b>{t('det.drop')}</b>
                <span className="muted" style={{ fontSize: 12.5 }}>.xtf · .son · .jsf · 600 kHz</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.xtf,.son,.jsf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ''; }} />
            </>
          ) : (
            <Card solid className="h-full" style={{ padding: 18 }}>
              <CardHead kt={t('det.ktPipeline')} title={result ? clsLabel(result.className, language) : t('det.analyzing')} right={done ? <Tag kind="ai">{t('det.complete')}</Tag> : <span className="spinner" style={{ width: 16, height: 16 }} />} />
              <div className="sonimg" style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                {frame && <img src={frame} alt={t('det.sonarFrame')} width={720} height={186} style={{ width: '100%', height: 'auto', display: 'block' }} />}
                {result && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${result.boundingBox.x * 100}%`,
                      top: `${result.boundingBox.y * 100}%`,
                      width: `${result.boundingBox.width * 100}%`,
                      height: `${result.boundingBox.height * 100}%`,
                      border: '2px solid var(--accent)',
                      boxShadow: '0 0 0 9999px rgba(2,6,12,0.28)',
                    }}
                  />
                )}
                {done && result && (
                  <div className="row-between" style={{ position: 'absolute', top: 8, left: 8, right: 8 }}>
                    <span className="badge b-accent">{clsLabel(result.className, language).toUpperCase()} · {pct(result.confidence)}</span>
                    <span className="badge b-plain"><span className="dot" /> {fmtCoordinate(result.gps.latitude, result.gps.longitude)}</span>
                  </div>
                )}
              </div>
              <div className="progress thick" style={{ marginBottom: 14 }}>
                <div className="bar" style={{ width: `${prog}%`, background: done ? 'var(--teal)' : 'var(--accent)' }} />
              </div>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="tiny upper muted">{done ? t('det.pipelineComplete') : t('det.pipelineRunning')}</span>
                <b className="mono small" style={{ color: done ? 'var(--teal)' : 'var(--accent)' }}>{prog}%</b>
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
            </Card>
          )}
        </div>

        <div className="span-7">
          {!result ? (
            <Card className="h-full">
              <CardHead kt={t('det.ktAnalysis')} title={t('an.summary')} />
              <div style={{ padding: '30px 10px', color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
                {t('det.emptyHint')}
              </div>
            </Card>
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <Card>
                <CardHead
                  kt={t('an.marine')}
                  title={`${clsLabel(result.className, language)} — ${categoryLabel(meta!.category, language)}`}
                  right={<RiskBadge risk={result.riskLevel} />}
                />
                <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
                  <Tag kind="ai">{modelLabel ? t('det.tagModel', { file: 'best.pt' }) : t('det.onDevice')}</Tag>
                  {modelLabel && <Tag kind="ai">{t('det.modelOutput', { label: modelLabel.toUpperCase() })}</Tag>}
                  <Tag kind="rule">{t('det.sounding', { freq: meta!.sonarTone })}</Tag>
                  <Tag kind="rule">{t('det.bboxVerified')}</Tag>
                  <Tag kind={result.manualVerificationRequired ? 'ver' : 'rec'}>{result.manualVerificationRequired ? t('det.reqVer') : t('det.autoVerified')}</Tag>
                </div>
                <p className="muted" style={{ fontSize: 13.5, maxWidth: 560 }}>{meta!.description}</p>

                <div className="grid cols-12" style={{ marginTop: 14, gap: 8 }}>
                  <div className="span-4"><Kv k={t('common.confidence')} v={<b className="mono" style={{ color: 'var(--accent)' }}>{pct(result.confidence)}</b>} /></div>
                  <div className="span-4"><Kv k={t('det.riskScore')} v={<b className="mono">{result.riskScore}</b>} /></div>
                  <div className="span-4"><Kv k={t('det.responseWindow')} v={<b className="mono">{String(meta!.hours).padStart(2, '0')} h</b>} /></div>
                  <div className="span-6"><Kv k={t('det.estDims')} v={<b className="mono">{fmtSize(result.estimatedSize)}</b>} /></div>
                  <div className="span-6"><Kv k={t('det.estWeight')} v={<b className="mono">{fmtWeight(result.estimatedWeight)}</b>} /></div>
                  <div className="span-6"><Kv k={t('det.position')} v={<b className="mono" style={{ fontSize: 11.5 }}>{fmtCoordinate(result.gps.latitude, result.gps.longitude)}</b>} /></div>
                  <div className="span-6"><Kv k={t('det.depthCol')} v={<b className="mono">{t('det.gpsAccuracy', { n: result.gps.accuracy })}</b>} /></div>
                </div>
              </Card>

              <Card>
                <CardHead
                  kt={t('an.response')}
                  title={t('det.removalRouting')}
                  right={<span className="badge b-teal"><span className="dot" /> {t('det.routed')}</span>}
                />
                <div className="row wrap" style={{ gap: 10 }}>
                  <div className="response-block" style={{ flex: 1, minWidth: 220 }}>
                    <span className="tiny upper muted">{t('det.removalMethod')}</span>
                    <b style={{ fontSize: 13, display: 'block', marginTop: 4 }}>{meta!.removal}</b>
                    <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                      {meta!.equipment.slice(0, 3).map((e) => (
                        <span key={e} className="tag rec">{e}</span>
                      ))}
                    </div>
                  </div>
                  <div className="response-block" style={{ flex: 1, minWidth: 200 }}>
                    <span className="tiny upper muted">{t('det.respDept')}</span>
                    <b className="row" style={{ gap: 8, marginTop: 4, fontSize: 13 }}>
                      <span className="legend-dot" style={{ background: meta!.color }} />
                      {deptLabel(meta!.primary)}
                    </b>
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {meta!.category === 'marine-life'
                        ? t('det.monitorOnly')
                        : t('det.escalationLane', { dept: meta!.escalation ? deptLabel(meta!.escalation) : t('det.noEscalation') })}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 10, marginTop: 16 }}>
                  <Link to={`detail/${result.id}`} className="btn btn-primary"><IconDoc size={15} /> {t('det.inspectFull')}</Link>
                  <Button variant="secondary" onClick={reset}><IconRefresh size={15} /> {t('det.runAnother')}</Button>
                </div>
              </Card>

              <WeatherReport lat={result.gps.latitude} lng={result.gps.longitude} task={{ riskLevel: result.riskLevel, responseDeadline: result.responseDeadline }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}