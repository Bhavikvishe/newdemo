import type { Detection, DetectionClass, Language } from '../types';
import { CLASS_META } from './mock';
import { clsLabel } from './labels';
import { makeT } from './i18n';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function frameSeed(key: string): () => number {
  return lcg(hashStr(key));
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  cls: DetectionClass,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = 'rgba(210,232,240,0.92)';
  ctx.strokeStyle = 'rgba(210,232,240,0.92)';
  switch (cls) {
    case 'shipwreck': {
      ctx.fillRect(x, y + h * 0.32, w, h * 0.5);
      ctx.fillRect(x + w * 0.28, y, w * 0.22, h * 0.36);
      ctx.fillRect(x + w * 0.62, y + h * 0.08, w * 0.18, h * 0.3);
      ctx.fillRect(x + w * 0.85, y + h * 0.24, w * 0.12, h * 0.56);
      ctx.fillRect(x + w * 0.4, y + h * 0.3, w * 0.08, h * 0.5);
      break;
    }
    case 'pipeline': {
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.6);
      ctx.lineTo(x + w * 0.96, y + h * 0.2);
      ctx.lineWidth = Math.max(3, h * 0.16);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'ghost_fishing_gear': {
      for (let i = 0; i < 6; i++) {
        const gx = x + w * ((i % 3) * 0.33 + 0.08);
        const gy = y + h * (Math.floor(i / 3) * 0.5 + 0.12);
        ctx.strokeStyle = 'rgba(200,235,244,0.85)';
        ctx.beginPath();
        ctx.arc(gx, gy, h * 0.13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineTo(gx + w * 0.2, gy + h * 0.1);
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + w * (0.08 + i * 0.18), y + h * (0.5 + (i % 2) * 0.18), w * 0.1, h * 0.05);
      }
      break;
    }
    case 'cylinder': {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.42, h * 0.34, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y + h * 0.5, w, h * 0.18);
      ctx.globalAlpha = 1;
      break;
    }
    case 'manta': {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.08);
      ctx.quadraticCurveTo(x + w * 0.98, y + h * 0.42, x + w * 0.62, y + h * 0.96);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.7, x + w * 0.38, y + h * 0.96);
      ctx.quadraticCurveTo(x + w * 0.02, y + h * 0.42, x + w * 0.5, y + h * 0.08);
      ctx.fill();
      break;
    }
    case 'airplane': {
      ctx.fillRect(x, y + h * 0.38, w, h * 0.24);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y + h * 0.28);
      ctx.lineTo(x + w * 0.8, y + h * 0.28);
      ctx.lineTo(x + w * 0.72, y + h * 0.5);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.42, x + w * 0.28, y + h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, y + h * 0.16, w * 0.1, h * 0.66);
      ctx.globalAlpha = 1;
      break;
    }
    case 'human': {
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.2, w * 0.16, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + w * 0.36, y + h * 0.38, w * 0.28, h * 0.6);
      break;
    }
  }
}

export interface FrameOpts {
  width?: number;
  height?: number;
  watermark?: boolean;
}

export const FRAME_W = 720;
export const FRAME_H = 360;

export function renderFrame(det: Pick<Detection, 'id' | 'className' | 'boundingBox'>, opts: FrameOpts = {}, lang: Language = 'en'): string {
  const key = `${det.id}:${opts.width ?? FRAME_W}:${lang}`;
  const hit = frameCache.get(key);
  if (hit) return hit;

  const w = opts.width ?? FRAME_W;
  const h = opts.height ?? Math.round(w * (FRAME_H / FRAME_W));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rnd = frameSeed(det.id);
  const imgData = ctx.createImageData(w, h);

  const lut: number[] = [];
  for (let i = 0; i < 256; i++) lut.push(i);

  for (let y = 0; y < h; y++) {
    const near = 30 + 26 * Math.sin(y * 0.085) + 10 * Math.sin(y * 0.4);
    const dist = 34 + 30 * Math.sin(y * 0.23 + 1.3) + 22 * Math.sin(y * 0.13);
    for (let x = 0; x < w; x++) {
      const n = rnd();
      let v = 22 + n * 26;
      v += Math.sin(x * 0.5 + y * 0.11) * 4;
      v += Math.sin((x + y) * 0.021) * 3.5;
      const stripe = Math.sin((x + y * 0.5) * 0.14);
      if (stripe > 0.86) v += 8 * rnd();
      v += near * (1 - y / h) * 0.0016 + dist * (y / h) * 0.002;
      const i = (y * w + x) * 4;
      const c = Math.max(8, Math.min(235, v));
      imgData.data[i] = c * 0.92;
      imgData.data[i + 1] = c * 0.98;
      imgData.data[i + 2] = c;
      imgData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const bb = det.boundingBox;
  const bx = bb.x * w;
  const by = bb.y * h;
  const bw = bb.width * w;
  const bh = bb.height * h;

  // acoustic shadow
  ctx.fillStyle = 'rgba(4,10,14,0.9)';
  ctx.beginPath();
  ctx.moveTo(bx + bw, by + bh * 0.1);
  ctx.lineTo(bx + bw + bw * 1.5, by + bh * 0.45);
  ctx.lineTo(bx + bw + bw * 1.5, by + bh);
  ctx.lineTo(bx + bw, by + bh);
  ctx.closePath();
  ctx.fill();

  // object highlight
  ctx.globalCompositeOperation = 'lighter';
  drawSilhouette(ctx, det.className, bx, by, bw, bh);
  ctx.globalCompositeOperation = 'source-over';

  // towfish nadir line
  ctx.fillStyle = 'rgba(120,180,205,0.12)';
  ctx.fillRect(Math.floor(w / 2) - 1, 0, 2, h);

  // side ticks + range numbers
  ctx.font = `${Math.max(8, Math.round(w * 0.012))}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = 'rgba(140,190,210,0.5)';
  ctx.textBaseline = 'top';
  const kmarkers = ['50m', '40m', '30m', '20m', '10m'];
  for (let i = 0; i < 5; i++) {
    const yy = Math.round((i / 4) * h);
    ctx.fillRect(0, yy, 8, Math.max(1, Math.round(h * 0.006)));
    ctx.fillRect(w - 8, yy, 8, Math.max(1, Math.round(h * 0.006)));
    ctx.fillText(kmarkers[i], 12, yy + 2);
    ctx.textAlign = 'right';
    ctx.fillText(kmarkers[i], w - 12, yy + 2);
    ctx.textAlign = 'left';
  }

  if (opts.watermark) {
    const t = makeT(lang);
    ctx.fillStyle = 'rgba(70,200,244,0.5)';
    ctx.font = `600 ${Math.max(9, Math.round(w * 0.014))}px "IBM Plex Mono", monospace`;
    ctx.fillText(t('snr.watermark', { swath: (w / 1000).toFixed(2) }), 12, 12);
  }

  const url = canvas.toDataURL('image/png');
  frameCache.set(key, url);
  return url;
}

export function renderAnnotated(det: Pick<Detection, 'id' | 'className' | 'boundingBox' | 'confidence'>, opts: FrameOpts = {}, lang: Language = 'en'): string {
  const key = `ann:${det.id}:${opts.width ?? FRAME_W}:${lang}`;
  const hit = frameCache.get(key);
  if (hit) return hit;

  const base = renderFrame(det, opts, lang);
  const w = opts.width ?? FRAME_W;
  const h = opts.height ?? Math.round(w * (FRAME_H / FRAME_W));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = new Image();
  img.src = base;
  ctx.drawImage(img, 0, 0);
  const meta = CLASS_META[det.className];
  const bb = det.boundingBox;
  const lw = Math.max(2, Math.round(w * 0.006));
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = lw;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(bb.x * w, bb.y * h, bb.width * w, bb.height * h);
  ctx.setLineDash([]);

  const label = `${clsLabel(det.className, lang).toUpperCase()}  ${(det.confidence * 100).toFixed(1)}%`;
  ctx.font = `700 ${Math.max(10, Math.round(h * 0.055))}px "IBM Plex Mono", monospace`;
  const tw = ctx.measureText(label).width;
  const pad = Math.round(h * 0.02);
  const ly = bb.y * h - (lw + pad);
  const topY = Math.max(0, ly - Math.max(10, Math.round(h * 0.055)) - pad);
  ctx.fillStyle = 'rgba(3,10,16,0.82)';
  ctx.fillRect(bb.x * w, topY, tw + pad * 2, Math.max(10, Math.round(h * 0.055)) + pad * 2);
  ctx.strokeStyle = meta.color;
  ctx.strokeRect(bb.x * w, topY, tw + pad * 2, Math.max(10, Math.round(h * 0.055)) + pad * 2);

  ctx.fillStyle = meta.color;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bb.x * w + pad, topY + Math.max(10, Math.round(h * 0.055)) / 2 + pad * 0.6);

  // corner coordinates
  ctx.fillStyle = 'rgba(140,190,210,0.55)';
  ctx.font = `${Math.max(8, Math.round(h * 0.045))}px "IBM Plex Mono", monospace`;
  ctx.fillText(`X${(bb.x).toFixed(2)} Y${(bb.y).toFixed(2)}`, 12, h - 18);

  const url = canvas.toDataURL('image/png');
  frameCache.set(key, url);
  return url;
}

const frameCache = new Map<string, string>();

export function clearFrameCache() {
  frameCache.clear();
}

export interface Buildable {
  id: string;
  className: DetectionClass;
}

export function makeSampleFrame(className: DetectionClass, seed: string, lang: Language = 'en'): string {
  const det = {
    id: `sample-${seed}-${className}`,
    className,
    boundingBox: {
      x: 0.32,
      y: 0.3,
      width: 0.34,
      height: 0.38,
      normalized: true,
    },
  };
  return renderAnnotated({ ...det, confidence: 0.87 }, {}, lang);
}