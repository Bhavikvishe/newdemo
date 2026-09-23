import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { CLASS_LIST, toCSV, toJSON, download, makeDetectionFromFile } from '../lib/mock';
import { clsLabel } from '../lib/labels';
import { renderFrame } from '../lib/sonar';
import { PageHead, Card, Button, Progress, Tag, EmptyState } from '../lib/ui';
import { Link } from '../lib/router';
import { IconFolder, IconRefresh, IconStop, IconUpload, IconX, IconDoc, IconPlay } from '../components/Icons';
import type { BatchItem, BatchStatus } from './batchTypes';

const STATUS_KEY: Record<BatchStatus, string> = { queued: 'common.queued', processing: 'common.processing', completed: 'common.completed', failed: 'common.failed', cancelled: 'batch.status.cancelled' };

function filesToItems(files: File[]): BatchItem[] {
  return files.map((f, i) => {
    const n = (i * 3) % CLASS_LIST.length;
    const cls = CLASS_LIST[n];
    const filename = f.webkitRelativePath && f.webkitRelativePath !== f.name ? f.webkitRelativePath.replace(/\//g, '/').split('/').pop()! : f.name;
    return {
      id: `bf-${Date.now()}-${i}`,
      filename,
      path: f.webkitRelativePath || f.name,
      file: f,
      className: cls,
      status: 'queued' as const,
      progress: 0,
      detectionCount: 0,
      avgConfidence: 0,
      addedAt: Date.now(),
    };
  });
}

export function BatchPage() {
  const store = useStore();
  const { language, addToast } = store;
  const t = makeT(language);
  const statusLabel = (s: BatchStatus) => t(STATUS_KEY[s]);

  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const startScan = (onlyFailed = false) => {
    if (running) return;
    const hasTarget = items.some((it) => (onlyFailed ? it.status === 'failed' : it.status === 'queued'));
    if (!hasTarget) return;
    setRunning(true);
    setItems((its) =>
      its.map((it) => {
        if (onlyFailed && it.status === 'failed') return { ...it, status: 'queued' as const, progress: 0 };
        if (!onlyFailed && it.status === 'queued') return { ...it, status: 'processing' as const, progress: 4 };
        return it;
      }),
    );
  };

  const pause = () => setRunning(false);

  const resume = () => {
    if (running) return;
    const hasProgress = items.some((it) => it.status === 'processing');
    if (hasProgress) setRunning(true);
  };

  const cancel = () => {
    setRunning(false);
    setItems((its) => its.map((it) => (it.status === 'processing' ? { ...it, status: 'cancelled' as const } : it)));
  };

  const retryFailed = () => {
    setItems((its) => its.map((it) => (it.status === 'failed' ? { ...it, status: 'queued' as const, progress: 0 } : it)));
  };

  const clearAll = () => {
    setRunning(false);
    setItems([]);
    addToast({ kind: 'info', title: t('batch.cleared.title'), text: t('batch.cleared.text') });
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length) {
      const next = filesToItems(Array.from(list));
      setItems((its) => [...its, ...next]);
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

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setItems((its) =>
        its.map((it) => {
          if (it.status !== 'processing') return it;
          const p = Math.min(100, it.progress + 6 + Math.random() * 16);
          if (p < 100) return { ...it, progress: p };
          return { ...it, status: 'completed' as const, progress: 100 };
        }),
      );
    }, 340);
    return () => clearInterval(iv);
  }, [running]);

  const recordedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    items.forEach((it) => {
      if (it.status !== 'completed' || !it.file || it.detectionId || recordedRef.current.has(it.id)) return;
      recordedRef.current.add(it.id);
      const det = makeDetectionFromFile(it.file);
      store.recordDetection(det, { silent: true });
      setItems((its) =>
        its.map((x) =>
          x.id === it.id ? { ...x, detectionId: det.id, className: det.className, detectionCount: 1, avgConfidence: det.confidence } : x,
        ),
      );
    });
  }, [items, store]);

  useEffect(() => {
    if (!running) return;
    if (items.some((it) => it.status === 'processing')) return;
    const failed = items.filter((it) => it.status === 'failed').length;
    const done_ = items.filter((it) => it.status === 'completed').length;
    addToast({
      kind: done_ > failed ? 'success' : 'alert',
      title: t('batch.finished.title'),
      text: `${t('batch.finished.text', { done: done_, failed })}${failed ? ` ${t('batch.finished.retry')}` : ''}`,
    });
    setRunning(false);
  }, [items, running, addToast]);

  const done = useMemo(
    () => ({
      total: items.length,
      completed: items.filter((i) => i.status === 'completed').length,
      failed: items.filter((i) => i.status === 'failed').length,
      processing: items.filter((i) => i.status === 'processing').length,
      objects: items.filter((i) => i.status === 'completed').reduce((s, i) => s + i.detectionCount, 0),
      avgConf: items.filter((i) => i.status === 'completed').length
        ? items.filter((i) => i.status === 'completed').reduce((s, i) => s + i.avgConfidence, 0) / items.filter((i) => i.status === 'completed').length
        : 0,
    }),
    [items],
  );

  const allDone = done.total > 0 && done.completed + done.failed === done.total && !running;

  const exportResults = (fmt: 'csv' | 'json') => {
    const data = items.filter((it) => it.status === 'completed').map((it) => ({
      file: it.path ?? it.filename,
      class: clsLabel(it.className, language),
      objects: it.detectionCount,
      avg_confidence: it.avgConfidence ? it.avgConfidence.toFixed(3) : '',
      status: it.status,
    }));
    if (fmt === 'csv') {
      download('oceonix-batch.csv', toCSV(data), 'text/csv');
      addToast({ kind: 'success', title: t('batch.exported.title'), text: t('batch.exported.csv', { file: 'oceonix-batch.csv' }) });
    } else {
      download('oceonix-batch.json', toJSON(data), 'application/json');
      addToast({ kind: 'success', title: t('batch.exported.title'), text: t('batch.exported.json', { file: 'oceonix-batch.json' }) });
    }
  };

  const frames = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((it) => m.set(it.id, renderFrame({ id: it.id, className: it.className, boundingBox: { x: 0.3, y: 0.26, width: 0.34, height: 0.32, normalized: true } }, { width: 240 }, language)));
    return m;
  }, [items, language]);

  const overall = items.length ? (items.reduce((s, it) => s + it.progress, 0) / (items.length * 100)) * 100 : 0;

  return (
    <div>
      <PageHead
        kicker={t('batch.title')}
        title={t('nav.batch')}
        sub={t('batch.sub')}
        right={
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="primary" onClick={() => startScan()} disabled={running}><IconPlay size={15} /> {t('batch.start')}</Button>
            {running ? (
              <Button variant="secondary" onClick={pause}><IconStop size={15} /> {t('batch.pause')}</Button>
            ) : (
              <Button variant="secondary" onClick={resume} disabled={!items.some((i) => i.status === 'processing')}>{t('batch.resume')}</Button>
            )}
            <Button variant="ghost" onClick={cancel}><IconStop size={15} /> {t('common.cancel')}</Button>
            <Button variant="ghost" onClick={clearAll}><IconX size={15} /> {t('batch.clear')}</Button>
          </div>
        }
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="card"><div className="tiny upper muted">{t('common.queued')}</div><b style={{ fontSize: 24 }}>{done.total}</b><span className="tiny muted">{t('batch.stat.frames')}</span></div>
        <div className="card"><div className="tiny upper muted">{t('batch.stat.processed')}</div><b style={{ fontSize: 24, color: 'var(--teal)' }}>{done.completed}</b><span className="tiny muted">{done.processing ? t('batch.stat.running', { n: done.processing }) : t('batch.stat.idle')}</span></div>
        <div className="card"><div className="tiny upper muted">{t('batch.stat.objects')}</div><b style={{ fontSize: 24, color: 'var(--accent)' }}>{done.objects}</b><span className="tiny muted">{t('batch.stat.across')}</span></div>
        <div className="card"><div className="tiny upper muted">{t('batch.stat.avgconf')}</div><b style={{ fontSize: 24 }}>{done.avgConf ? (done.avgConf * 100).toFixed(1) : '—'}%</b><span className="tiny muted">{done.failed ? t('batch.stat.failed', { n: done.failed }) : t('batch.stat.allclear')}</span></div>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="row-between" style={{ gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="tiny upper muted">{t('batch.overall')}</span>
              <b className="mono small" style={{ color: allDone ? 'var(--teal)' : 'var(--accent)' }}>{allDone ? t('batch.complete') : `${Math.round(overall)}%`}</b>
            </div>
            <Progress value={overall} tone={allDone ? 'var(--teal)' : 'var(--accent)'} />
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><IconFolder size={14} /> {t('batch.addfiles')}</Button>
            <Button size="sm" variant="secondary" onClick={openFolderPicker}><IconUpload size={14} /> {t('batch.addfolder')}</Button>
            <Button size="sm" variant="ghost" onClick={retryFailed} disabled={done.failed === 0}><IconRefresh size={14} /> {t('batch.retry')}</Button>
            {allDone && (
              <>
                <Button size="sm" variant="primary" onClick={() => exportResults('csv')}><IconDoc size={14} /> {t('batch.exportcsv')}</Button>
                <Button size="sm" variant="primary" onClick={() => exportResults('json')}><IconDoc size={14} /> {t('batch.exportjson')}</Button>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xtf,.son,.jsf,.png,.jpg,.jpeg" multiple style={{ display: 'none' }} onChange={onFiles} />
          <input ref={folderRef} type="file" style={{ display: 'none' }} onChange={onFiles} />
        </div>
      </Card>

      {items.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState
            title={t('batch.empty')}
            icon={<IconUpload size={20} />}
            action={<Button variant="primary" onClick={() => fileRef.current?.click()}><IconFolder size={15} /> {t('batch.addframes')}</Button>}
          />
        </Card>
      ) : (
        <div className="grid cols-12" style={{ marginTop: 16, gap: 14 }}>
          {items.map((it) => {
            return (
              <div key={it.id} className="span-4">
                <Card className="h-full" style={{ padding: 12 }}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <span className="mono small" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{it.filename}</span>
                    <Tag kind={it.status === 'completed' ? 'rec' : it.status === 'failed' ? 'ver' : it.status === 'processing' ? 'ai' : 'est'}>{statusLabel(it.status).toUpperCase()}</Tag>
                  </div>
                  <div className="sonimg" style={{ position: 'relative', borderRadius: 9, overflow: 'hidden' }}>
                    <img src={frames.get(it.id)} alt={it.filename} width={240} height={124} style={{ width: '100%', height: '124px', objectFit: 'cover', display: 'block', filter: it.status === 'failed' ? 'grayscale(0.6) opacity(0.55)' : undefined }} />
                    {it.status === 'completed' && (
                      <div style={{ position: 'absolute', left: '28%', top: '23%', width: '38%', height: '36%', border: '2px solid var(--accent)' }} />
                    )}
                    {it.status === 'processing' && (
                      <div className="overlay-cover" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,12,0.55)' }}>
                        <span className="spinner" />
                      </div>
                    )}
                  </div>
                  <div className="row-between" style={{ marginTop: 8, gap: 6 }}>
                    <span className="mono tiny" style={{ color: 'var(--ink-3)' }}>{it.status === 'completed' ? clsLabel(it.className, language) : '—'}</span>
                    {it.status === 'completed' && (
                      <span className="tiny" style={{ color: 'var(--ink-2)' }}>
                        {t('batch.obj', { n: it.detectionCount })} · {(it.avgConfidence * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Progress
                      value={it.progress}
                      slim
                      tone={it.status === 'failed' ? 'var(--critical)' : it.status === 'completed' ? 'var(--teal)' : 'var(--accent)'}
                    />
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    {it.status === 'completed' && it.detectionId && (
                      <Link to={`detail/${it.detectionId}`} className="btn btn-secondary btn-sm" style={{ flex: 1 }}><IconDoc size={13} /> {t('det.inspect')}</Link>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeItem(it.id)} title={t('batch.remove')}><IconX size={12} /></Button>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  function removeItem(id: string) {
    setItems((its) => its.filter((i) => i.id !== id));
  }
}