import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface GisMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  radius?: number;
  count?: number;
  pulse?: boolean;
  label?: string;
  selected?: boolean;
  focus?: boolean;
  onClick?: () => void;
}

export interface GisRoute {
  points: [number, number][];
  color?: string;
  dashed?: boolean;
}

interface GeoOceanMapProps {
  markers?: GisMarker[];
  route?: GisRoute;
  fitPts?: [number, number][];
  fitKey?: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
  children?: ReactNode;
  connectingLabel?: string;
}

const ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function GeoOceanMap({
  markers = [],
  route,
  fitPts,
  fitKey,
  className = '',
  style,
  fallback,
  children,
  connectingLabel,
}: GeoOceanMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const fitRef = useRef<string>('');
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
      maxZoom: 18,
      minZoom: 4,
    });
    mapRef.current = map;

    let loaded = 0;
    let failed = 0;
    const tiles = L.tileLayer(ESRI_URL, {
      className: 'gis-tiles',
      attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
      maxZoom: 18,
    });
    tiles.on('load', () => setOnline(true));
    tiles.on('tileload', () => {
      loaded += 1;
      setOnline(true);
    });
    tiles.on('tileerror', () => {
      failed += 1;
      if (loaded === 0 && failed >= 3) setOnline(false);
    });
    tiles.addTo(map);

    const fallbackTimer = window.setTimeout(() => {
      if (loaded === 0) setOnline(false);
    }, 7000);

    if (fitKey) fitRef.current = fitKey;
    if (fitPts && fitPts.length === 2) map.fitBounds(L.latLngBounds(fitPts), { padding: [28, 28], maxZoom: 8 });
    else map.setView([15, 82], 6);

    const invalidate = () => {
      if (host.offsetWidth > 0 && host.offsetHeight > 0) map.invalidateSize();
    };
    const raf = window.requestAnimationFrame(invalidate);
    window.addEventListener('resize', invalidate);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('resize', invalidate);
      window.cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
      groupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !online) return;

    if (groupRef.current) {
      groupRef.current.remove();
      groupRef.current = null;
    }
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;

    markers.forEach((m) => {
      const r = m.radius ?? Math.min(26, 8 + Math.sqrt(m.count ?? 1) * 4.5);
      let icon: L.DivIcon;
      if (m.pulse) {
        const label = m.label ? `<span class="gis-label">${esc(m.label)}</span>` : '';
        icon = L.divIcon({
          className: 'gis-divicon',
          html: `<div class="gis-pulse" style="--c:${m.color}"><span class="gis-ring"></span><span class="gis-ring two"></span><span class="gis-dot"></span>${label}</div>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23],
        });
      } else {
        const sel = m.selected ? ' sel' : '';
        const foc = m.focus ? ' focus' : '';
        const inner = m.count != null ? `<span class="gis-count">${m.count}</span>` : '';
        icon = L.divIcon({
          className: 'gis-divicon',
          html: `<div class="gis-cluster${sel}${foc}" style="--c:${m.color};--r:${(r * 2).toFixed(1)}px">${inner}</div>`,
          iconSize: [r * 2, r * 2],
          iconAnchor: [r, r],
        });
      }
      const marker = L.marker([m.lat, m.lng], { icon });
      if (m.onClick) marker.on('click', m.onClick);
      marker.addTo(group);
    });

    if (route && route.points.length > 1) {
      L.polyline(route.points as L.LatLngExpression[], {
        color: route.color ?? 'var(--accent)',
        weight: 2,
        opacity: 0.9,
        dashArray: route.dashed ? '8 6' : undefined,
      }).addTo(group);
    }
  }, [online, markers, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !online) return;
    if (fitKey && fitKey !== fitRef.current) {
      fitRef.current = fitKey;
      if (fitPts && fitPts.length === 2) map.fitBounds(L.latLngBounds(fitPts), { padding: [28, 28], maxZoom: 8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, online]);

  return (
    <div className={`map-shell geo ${className}`} style={{ overflow: 'hidden', ...style }}>
      {online === null && <div className="gis-connecting">{connectingLabel ?? 'Connecting…'}</div>}
      <div className="gis-map" ref={hostRef} style={{ display: online === false ? 'none' : undefined }} />
      {online === false && fallback}
      {children}
    </div>
  );
}