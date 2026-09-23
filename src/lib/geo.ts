export const LAT_MIN = 6, LAT_MAX = 24, LON_MIN = 68, LON_MAX = 95;
export const W = 1000, H = 660;

export interface Pt { x: number; y: number }

export function project(lat: number, lng: number, w = W, h = H): Pt {
  const x = ((lng - LON_MIN) / (LON_MAX - LON_MIN)) * (w - 40) + 20;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (h - 40) + 20;
  return { x, y };
}

export const WEST_COAST: [number, number][] = [
  [76.3, 8.2], [75.5, 9.5], [74.8, 11.0], [74.1, 12.5], [73.8, 14.0], [73.4, 15.5],
  [72.9, 17.0], [72.5, 18.5], [72.4, 19.5], [72.6, 21.0], [72.4, 22.2],
];
export const EAST_COAST: [number, number][] = [
  [80.0, 13.0], [80.3, 14.0], [80.5, 15.5], [81.0, 16.0], [81.8, 17.5],
  [82.2, 18.8], [83.0, 19.6], [83.6, 20.5], [84.0, 21.2], [85.2, 21.5],
];
export const ANDAMAN: [number, number][] = [[92.4, 10.6], [92.8, 11.7], [93.0, 12.9]];

export function pathFrom(pts: [number, number][], w = W, h = H): string {
  return pts.map(([lng, lat], i) => {
    const { x, y } = project(lat, lng, w, h);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function toRad(d: number): number { return (d * Math.PI) / 180; }
export function toDeg(r: number): number { return (r * 180) / Math.PI; }

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function haversineNm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return haversineKm(aLat, aLng, bLat, bLng) / 1.852;
}

export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const p1 = toRad(aLat), p2 = toRad(bLat);
  const dL = toRad(bLng - aLng);
  const y = Math.sin(dL) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compass(b: number): string {
  return CARDINALS[Math.round(b / 45) % 8];
}

export interface GCPoint { lat: number; lng: number }

export function gcPoints(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  steps = 24,
): GCPoint[] {
  const f1 = toRad(aLat), l1 = toRad(aLng);
  const f2 = toRad(bLat), l2 = toRad(bLng);
  const df = f2 - f1;
  const dl = l2 - l1;
  const sinDf = Math.sin(df / 2), sinDl = Math.sin(dl / 2);
  const a = sinDf * sinDf + Math.cos(f1) * Math.cos(f2) * sinDl * sinDl;
  const delta = 2 * Math.asin(Math.sqrt(a));
  const out: GCPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    if (delta === 0) {
      out.push({ lat: aLat + (bLat - aLat) * f, lng: aLng + (bLng - aLng) * f });
      continue;
    }
    const A = Math.sin((1 - f) * delta) / Math.sin(delta);
    const B = Math.sin(f * delta) / Math.sin(delta);
    const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2);
    const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2);
    const z = A * Math.sin(f1) + B * Math.sin(f2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);
    out.push({ lat: toDeg(lat), lng: toDeg(lng) });
  }
  return out;
}

export function fmtETA(nm: number, speedKn: number): string {
  if (!speedKn || speedKn <= 0) return '—';
  const hours = nm / speedKn;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h <= 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function fmtDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function fmtDistanceNm(nm: number): string {
  return `${nm.toFixed(1)} nm`;
}