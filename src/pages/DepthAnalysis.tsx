import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { makeT } from '../lib/i18n';
import { PageHead, Card, CardHead, Button, RiskBadge, ClassBadge, Badge } from '../lib/ui';
import { IconDepth, IconDoc, IconRadar, IconPin } from '../components/Icons';
import { getCachedImage } from '../lib/detect';
import { renderFrame } from '../lib/sonar';
import { fetchGebcoDepth } from '../lib/gebco';
import type { GebcoDepthResponse } from '../lib/gebco';
import { clsLabel } from '../lib/labels';
import { fmtDT } from '../lib/mock';
import type { Detection } from '../types';

const SAMPLE_TARGETS: Detection[] = [
  {
    id: 'SAMPLE-TARGET-SHIPWRECK',
    imageId: 'mumbai_offshore_wreck_01.png',
    className: 'shipwreck',
    confidence: 0.94,
    boundingBox: { x: 0.36, y: 0.38, width: 0.32, height: 0.26, normalized: true },
    gps: { latitude: 18.905, longitude: 72.695, timestamp: new Date().toISOString() },
    estimatedSize: { length: 28.5, width: 9.2, height: 4.8, unit: 'm' },
    estimatedWeight: { min: 24000, max: 45000, unit: 'kg', confidence: 0.9 },
    riskLevel: 'medium',
    riskScore: 65,
    priority: 2,
    responseDeadline: new Date(Date.now() + 48 * 3600e3).toISOString(),
    department: 'marine-operations',
    recommendedEquipment: ['Side-scan Sonar', 'ROV Grabber'],
    removalMethod: 'In-situ historical survey and salvage marking',
    verificationStatus: 'verified',
    notes: 'Reference demo target; bathymetry is queried dynamically for the selected coordinate.',
    detectionTime: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiPrediction: true,
    estimated: true,
    recommended: true,
    source: 'upload',
    isRealModel: true,
    manualVerificationRequired: false,
    rawLabel: 'shipwreck',
  },
  {
    id: 'SAMPLE-TARGET-AIRCRAFT',
    imageId: 'fighter_airframe_shelf.png',
    className: 'airplane',
    confidence: 0.91,
    boundingBox: { x: 0.42, y: 0.32, width: 0.28, height: 0.30, normalized: true },
    gps: { latitude: 18.880, longitude: 72.580, timestamp: new Date().toISOString() },
    estimatedSize: { length: 14.2, width: 11.4, height: 3.2, unit: 'm' },
    estimatedWeight: { min: 8500, max: 14000, unit: 'kg', confidence: 0.88 },
    riskLevel: 'high',
    riskScore: 82,
    priority: 1,
    responseDeadline: new Date(Date.now() + 24 * 3600e3).toISOString(),
    department: 'search-rescue',
    recommendedEquipment: ['Multibeam Echo Sounder', 'Heavy Lift Crane'],
    removalMethod: 'Deepwater recovery sling',
    verificationStatus: 'verified',
    notes: 'Reference demo target; bathymetry is queried dynamically for the selected coordinate.',
    detectionTime: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiPrediction: true,
    estimated: true,
    recommended: true,
    source: 'upload',
    isRealModel: true,
    manualVerificationRequired: false,
    rawLabel: 'airplane',
  },
  {
    id: 'SAMPLE-TARGET-PIPELINE',
    imageId: 'trunk_pipeline_channel.png',
    className: 'pipeline',
    confidence: 0.88,
    boundingBox: { x: 0.22, y: 0.48, width: 0.58, height: 0.16, normalized: true },
    gps: { latitude: 18.840, longitude: 72.480, timestamp: new Date().toISOString() },
    estimatedSize: { length: 65.0, width: 1.8, height: 1.4, unit: 'm' },
    estimatedWeight: { min: 38000, max: 75000, unit: 'kg', confidence: 0.92 },
    riskLevel: 'critical',
    riskScore: 92,
    priority: 1,
    responseDeadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
    department: 'marine-engineering',
    recommendedEquipment: ['Sub-bottom Profiler', 'Crawler ROV'],
    removalMethod: 'Structural inspection & cathodic anode replacement',
    verificationStatus: 'verified',
    notes: 'Reference demo target; bathymetry is queried dynamically for the selected coordinate.',
    detectionTime: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiPrediction: true,
    estimated: true,
    recommended: true,
    source: 'upload',
    isRealModel: true,
    manualVerificationRequired: false,
    rawLabel: 'pipeline',
  },
];

export function DepthAnalysisPage() {
  const store = useStore();
  const { language, detections } = store;
  const t = makeT(language);

  // Filter user real uploaded detections
  const userRealDetections = useMemo(() => {
    return detections.filter(
      (d) => d.source === 'upload' || d.isRealModel || d.id?.startsWith('REAL-') || d.id?.startsWith('BATCH-')
    );
  }, [detections]);

  // Combined list of targets: session uploaded targets + reference sample targets
  const allTargets = useMemo(() => {
    if (userRealDetections.length > 0) {
      return [...userRealDetections, ...SAMPLE_TARGETS];
    }
    return SAMPLE_TARGETS;
  }, [userRealDetections]);

  // Selected detection for depth analysis
  const [selectedDet, setSelectedDet] = useState<Detection>(allTargets[0]);

  // Keep the selected target aligned with the available analyzed detections.
  useEffect(() => {
    if (!selectedDet || !allTargets.some((det) => det.id === selectedDet.id)) {
      setSelectedDet(allTargets[0]);
    }
  }, [allTargets, selectedDet]);


  // Custom manual coordinates mode
  const [isManualGps, setIsManualGps] = useState(false);
  const [manualLat, setManualLat] = useState('18.90500');
  const [manualLng, setManualLng] = useState('72.69500');

  // Transect span km (default 3.0km for clear bathymetric slope)
  const [spanKm, setSpanKm] = useState(3.0);

  // Hovered transect point for interactive inspection
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Bathymetry API state
  const [loading, setLoading] = useState(false);
  const [gebcoData, setGebcoData] = useState<GebcoDepthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active target coordinates
  const activeLat = isManualGps
    ? parseFloat(manualLat) || 18.905
    : selectedDet?.gps?.latitude ?? 18.905;
  const activeLng = isManualGps
    ? parseFloat(manualLng) || 72.695
    : selectedDet?.gps?.longitude ?? 72.695;

  // Load bathymetry whenever active coordinate or span changes
  useEffect(() => {
    let active = true;
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);

    fetchGebcoDepth(activeLat, activeLng, { spanKm, samples: 25, signal: ctrl.signal })
      .then((data) => {
        if (active) {
          setGebcoData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active && err.name !== 'AbortError') {
          setError(err.message || 'Failed to fetch bathymetry data');
          setLoading(false);
        }
      });

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [activeLat, activeLng, spanKm]);

  // Image source for currently selected detection
  const selectedImage = useMemo(() => {
    if (!selectedDet) return undefined;
    return (
      selectedDet.imageUrl ||
      getCachedImage(selectedDet.id) ||
      getCachedImage(selectedDet.imageId) ||
      renderFrame(selectedDet, { width: 440 }, language)
    );
  }, [selectedDet, language]);

  // Computed transect statistics
  const transect = gebcoData?.transect ?? [];
  const maxDepth = gebcoData ? Math.max(...transect.map((p) => p.depth_m), gebcoData.bathymetry.depth_m, 25) : 50;
  const minDepth = gebcoData ? Math.min(...transect.map((p) => p.depth_m), gebcoData.bathymetry.depth_m) : 10;
  const depthRange = Math.max(12, maxDepth - minDepth);
  const chartYMax = Math.ceil((maxDepth + depthRange * 0.25) / 10) * 10;

  // Dimensions of the target object
  const objHeight = selectedDet?.estimatedSize?.height ?? 3.5;
  const objLength = selectedDet?.estimatedSize?.length ?? 12.0;
  const currentDepth = gebcoData?.bathymetry.depth_m ?? 18.0;
  const surfaceClearance = Math.max(0, currentDepth - objHeight);

  // SVG Chart Dimensions
  const svgWidth = 860;
  const svgHeight = 320;
  const padLeft = 65;
  const padRight = 35;
  const padTop = 45;
  const padBottom = 45;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Scale functions
  const getX = (index: number) => padLeft + (index / Math.max(1, transect.length - 1)) * plotWidth;
  const getY = (depth: number) => padTop + (depth / chartYMax) * plotHeight;

  // Build SVG Path for seafloor curve
  const seabedPath = useMemo(() => {
    if (transect.length === 0) return '';
    let d = `M ${getX(0)} ${getY(transect[0].depth_m)}`;
    for (let i = 1; i < transect.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(transect[i - 1].depth_m);
      const currX = getX(i);
      const currY = getY(transect[i].depth_m);
      const cpX = (prevX + currX) / 2;
      d += ` C ${cpX} ${prevY}, ${cpX} ${currY}, ${currX} ${currY}`;
    }
    return d;
  }, [transect, chartYMax]);

  // Closed path for seabed sediment fill
  const seabedAreaPath = useMemo(() => {
    if (!seabedPath) return '';
    const lastX = getX(transect.length - 1);
    const firstX = getX(0);
    const bottomY = svgHeight - padBottom;
    return `${seabedPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [seabedPath, transect]);

  // Center target position in SVG
  const centerIdx = Math.floor(transect.length / 2);
  const targetX = transect.length > 0 ? getX(centerIdx) : padLeft + plotWidth / 2;
  const targetY = transect.length > 0 ? getY(transect[centerIdx].depth_m) : getY(currentDepth);

  // Export bathymetry as CSV
  const exportCsv = () => {
    if (!gebcoData) return;
    const rows = [
      ['Index', 'Distance_m', 'Latitude', 'Longitude', 'Elevation_m', 'Depth_m', 'Depth_ft', 'Slope_deg'],
      ...transect.map((p, idx) => [
        idx + 1,
        p.distance_m,
        p.lat,
        p.lng,
        p.elevation,
        p.depth_m,
        p.depth_ft,
        p.slope_deg,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${gebcoData.provenance.is_live ? 'gebco' : 'synthetic-bathymetry'}-${activeLat.toFixed(4)}-${activeLng.toFixed(4)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="depth-analysis-page stack" style={{ gap: 20 }}>
      <PageHead
        kicker="BATHYMETRIC INTELLIGENCE · 15 ARC-SECOND GLOBAL GRID"
        title={t('nav.depth')}
        sub="High-resolution seafloor elevation and acoustic bathymetry profiling for analyzed detections"
        right={
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <IconDepth size={20} style={{ color: 'var(--accent)' }} />

            {/* Connection Badge */}
            <span
              className="badge b-accent"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: 11.5,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: gebcoData?.provenance.is_live ? 'var(--teal)' : 'var(--accent)',
                  boxShadow: '0 0 8px currentColor',
                }}
              />
              {gebcoData?.provenance.is_live
                ? 'LIVE GEBCO BATHYMETRY'
                : 'SYNTHETIC FALLBACK — NOT GEBCO'}
            </span>

            <Button variant="secondary" onClick={exportCsv} disabled={!gebcoData}>
              <IconDoc size={14} /> Export CSV
            </Button>
          </div>
        }
      />

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(255, 60, 60, 0.1)',
            border: '1px solid var(--critical)',
            color: 'var(--critical)',
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      {gebcoData && (
        <div
          style={{
            padding: '11px 14px',
            borderRadius: 8,
            background: gebcoData.provenance.is_live
              ? 'rgba(0, 220, 170, 0.08)'
              : 'rgba(255, 170, 0, 0.10)',
            border: `1px solid ${
              gebcoData.provenance.is_live
                ? 'rgba(0, 220, 170, 0.30)'
                : 'rgba(255, 170, 0, 0.35)'
            }`,
          }}
        >
          <div
            className="row-between wrap"
            style={{ gap: 10, alignItems: 'center' }}
          >
            <div>
              <div
                className="tiny upper"
                style={{
                  color: gebcoData.provenance.is_live
                    ? 'var(--teal)'
                    : 'var(--accent)',
                  fontWeight: 800,
                }}
              >
                {gebcoData.provenance.is_live
                  ? 'LIVE DATA PROVENANCE'
                  : 'SYNTHETIC DATA PROVENANCE'}
              </div>
              <div
                className="tiny muted"
                style={{ marginTop: 3, lineHeight: 1.45 }}
              >
                Source: {gebcoData.provenance.source_name}
                {' · '}
                Dataset: {gebcoData.dataset}
                {' · '}
                {gebcoData.provenance.is_live
                  ? gebcoData.resolution
                  : 'No live GEBCO sounding was used for this result.'}
              </div>
            </div>
            {!gebcoData.provenance.is_live && (
              <span
                className="badge b-plain"
                style={{ fontWeight: 800 }}
              >
                ESTIMATE ONLY
              </span>
            )}
          </div>

          {gebcoData.provenance.warning && (
            <div
              className="tiny"
              style={{
                marginTop: 7,
                color: 'var(--ink-2)',
                lineHeight: 1.45,
              }}
            >
              {gebcoData.provenance.warning}
            </div>
          )}
        </div>
      )}

      {/* Target Selector & Analyzed Image Bar */}
      <Card style={{ padding: '16px 20px', background: 'var(--panel)' }}>
        <div className="row-between wrap" style={{ gap: 14, marginBottom: 14 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <IconRadar size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <b style={{ fontSize: 14, color: 'var(--ink)' }}>Target Undersea Image For Depth Analysis</b>
              <p className="tiny muted" style={{ margin: 0 }}>
                Select an analyzed target to inspect seafloor depth
              </p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button
              size="sm"
              variant={!isManualGps ? 'secondary' : 'outline'}
              onClick={() => setIsManualGps(false)}
            >
              Targets ({allTargets.length})
            </Button>
            <Button
              size="sm"
              variant={isManualGps ? 'primary' : 'secondary'}
              onClick={() => setIsManualGps(true)}
            >
              <IconPin size={13} /> Custom GPS
            </Button>
          </div>
        </div>

        {!isManualGps ? (
          <div>
            <div
              className="row"
              style={{
                gap: 12,
                overflowX: 'auto',
                paddingBottom: 6,
                scrollbarWidth: 'thin',
              }}
            >
              {allTargets.map((det) => {
                const isSelected = selectedDet?.id === det.id;
                const thumbSrc =
                  det.imageUrl ||
                  getCachedImage(det.id) ||
                  getCachedImage(det.imageId) ||
                  renderFrame(det, { width: 140 }, language);

                return (
                  <div
                    key={det.id}
                    onClick={() => {
                      setSelectedDet(det);
                      setIsManualGps(false);
                    }}
                    style={{
                      minWidth: 260,
                      maxWidth: 300,
                      padding: 10,
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--line-soft)',
                      background: isSelected ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--rise)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                      <img
                        src={thumbSrc}
                        alt=""
                        style={{
                          width: 58,
                          height: 44,
                          borderRadius: 6,
                          objectFit: 'cover',
                          border: '1px solid var(--line)',
                          flexShrink: 0,
                          background: '#04121c',
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row-between" style={{ gap: 4 }}>
                          <ClassBadge cls={det.className} />
                          <RiskBadge risk={det.riskLevel} />
                        </div>
                        <div
                          className="mono tiny muted"
                          title={det.imageId || det.id}
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: 4,
                          }}
                        >
                          {det.imageId ? det.imageId : det.id.replace('REAL-BATCH-', 'BATCH-')}
                        </div>
                        <div className="row-between" style={{ marginTop: 2, fontSize: 10.5 }}>
                          <span className="mono" style={{ color: 'var(--accent)' }}>
                            {det.gps ? `${det.gps.latitude.toFixed(3)}°N, ${det.gps.longitude.toFixed(3)}°E` : '18.9°N, 72.8°E'}
                          </span>
                          <span className="mono muted">{(det.confidence * 100).toFixed(0)}% conf</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="row wrap" style={{ gap: 14, alignItems: 'flex-end', padding: '8px 0' }}>
            <div>
              <label className="tiny upper muted" style={{ display: 'block', marginBottom: 4 }}>Latitude (°N)</label>
              <input
                className="input mono"
                style={{ width: 140 }}
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="18.90500"
              />
            </div>
            <div>
              <label className="tiny upper muted" style={{ display: 'block', marginBottom: 4 }}>Longitude (°E)</label>
              <input
                className="input mono"
                style={{ width: 140 }}
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="72.69500"
              />
            </div>
            <div>
              <label className="tiny upper muted" style={{ display: 'block', marginBottom: 4 }}>Transect Span</label>
              <select
                className="select mono"
                value={spanKm}
                onChange={(e) => setSpanKm(Number(e.target.value))}
                style={{ width: 140 }}
              >
                <option value={1.0}>1.0 km (Local)</option>
                <option value={3.0}>3.0 km (Standard)</option>
                <option value={5.0}>5.0 km (Shelf Slope)</option>
                <option value={10.0}>10.0 km (Deep Trench)</option>
              </select>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setManualLat('18.84000');
                setManualLng('72.48000');
                setSpanKm(5.0);
              }}
            >
              Preset: Continental Shelf Trench
            </Button>
          </div>
        )}
      </Card>

      {/* Main Analysis Grid */}
      <div className="grid cols-12" style={{ gap: 18 }}>
        {/* Left Column: Graphic Seafloor Bathymetric Transect (Span 8) */}
        <div className="span-8 stack" style={{ gap: 18 }}>
          <Card>
            <CardHead
              kt="BATHYMETRIC TRANSECT PROFILE"
              title="Seafloor Elevation & Object Placement"
              right={
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <span className="mono tiny muted">
                    Span: {spanKm} km (West → East)
                  </span>
                  {loading && <span className="mono tiny" style={{ color: 'var(--accent)' }}>Updating...</span>}
                </div>
              }
            />

            {/* Cross-Section Graphic Canvas (SVG) */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                background: 'linear-gradient(180deg, #020b14 0%, #031422 35%, #051d30 70%, #04131f 100%)',
                borderRadius: 10,
                border: '1px solid var(--line)',
                overflow: 'hidden',
                boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.6)',
              }}
            >
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                onMouseLeave={() => setHoveredPointIndex(null)}
              >
                <defs>
                  {/* Water column depth gradient */}
                  <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.18" />
                    <stop offset="30%" stopColor="#0099cc" stopOpacity="0.12" />
                    <stop offset="70%" stopColor="#003366" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#011020" stopOpacity="0.65" />
                  </linearGradient>

                  {/* Seabed sediment terrain gradient */}
                  <linearGradient id="seabedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a3d54" stopOpacity="0.95" />
                    <stop offset="25%" stopColor="#0e2333" stopOpacity="0.98" />
                    <stop offset="100%" stopColor="#050d14" stopOpacity="1" />
                  </linearGradient>

                  {/* Sonar Beam Gradient */}
                  <linearGradient id="sonarBeamGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.35" />
                    <stop offset="85%" stopColor="#00f0ff" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.28" />
                  </linearGradient>
                </defs>

                {/* Depth Y-Axis Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                  const depthVal = Math.round(ratio * chartYMax);
                  const yPos = getY(depthVal);
                  return (
                    <g key={ratio}>
                      <line
                        x1={padLeft}
                        y1={yPos}
                        x2={svgWidth - padRight}
                        y2={yPos}
                        stroke="rgba(255, 255, 255, 0.08)"
                        strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                        strokeWidth={ratio === 0 ? 1.5 : 1}
                      />
                      <text
                        x={padLeft - 8}
                        y={yPos + 4}
                        fill="var(--ink-3)"
                        fontSize="10"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {depthVal === 0 ? '0 m (Surface)' : `-${depthVal} m`}
                      </text>
                    </g>
                  );
                })}

                {/* Ocean Surface Line */}
                <line
                  x1={padLeft}
                  y1={getY(0)}
                  x2={svgWidth - padRight}
                  y2={getY(0)}
                  stroke="#00f0ff"
                  strokeWidth="2"
                  opacity="0.85"
                />

                {/* Water Column Fill */}
                <rect
                  x={padLeft}
                  y={getY(0)}
                  width={plotWidth}
                  height={plotHeight}
                  fill="url(#waterGrad)"
                />

                {/* Sonar Survey Beam Projection from Surface to Object */}
                <polygon
                  points={`${targetX - 32},${getY(0)} ${targetX + 32},${getY(0)} ${targetX + 75},${targetY} ${targetX - 75},${targetY}`}
                  fill="url(#sonarBeamGrad)"
                />
                <line
                  x1={targetX}
                  y1={getY(0)}
                  x2={targetX}
                  y2={targetY}
                  stroke="#00f0ff"
                  strokeDasharray="4 3"
                  strokeWidth="1.2"
                  opacity="0.85"
                />

                {/* Survey Vessel / Towfish on Surface */}
                <g transform={`translate(${targetX - 16}, ${getY(0) - 14})`}>
                  <polygon points="4,2 28,2 24,10 8,10" fill="#00f0ff" opacity="0.9" />
                  <rect x="12" y="-4" width="8" height="6" fill="#fff" opacity="0.8" />
                  <line x1="16" y1="-8" x2="16" y2="-4" stroke="#00f0ff" strokeWidth="1.5" />
                  <text x="16" y="-11" fill="#00f0ff" fontSize="8" textAnchor="middle" fontFamily="monospace">
                    SURVEY ROV
                  </text>
                </g>

                {/* Seabed Sediment Terrain Area */}
                {seabedAreaPath && (
                  <path d={seabedAreaPath} fill="url(#seabedGrad)" />
                )}

                {/* Seabed Bathymetric Profile Contour Line */}
                {seabedPath && (
                  <path
                    d={seabedPath}
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 6px rgba(0, 240, 255, 0.45))' }}
                  />
                )}

                {/* Target Detected Object on Seabed */}
                <g transform={`translate(${targetX}, ${targetY})`}>
                  {/* Glow footprint on seabed */}
                  <ellipse cx="0" cy="0" rx="36" ry="7" fill="rgba(0, 240, 255, 0.25)" />

                  {/* Target Object Silhouette (Shipwreck/Debris/Aircraft) */}
                  <g transform="translate(-20, -16)">
                    <rect
                      x="0"
                      y="4"
                      width="40"
                      height="12"
                      rx="2"
                      fill="var(--panel-solid)"
                      stroke="var(--accent)"
                      strokeWidth="1.8"
                    />
                    <polygon points="6,4 12,-2 28,-2 34,4" fill="var(--accent)" opacity="0.85" />
                    <line x1="20" y1="-8" x2="20" y2="-2" stroke="#fff" strokeWidth="1.5" />
                  </g>

                  {/* Depth Sounding Pin & Label */}
                  <circle cx="0" cy="0" r="3.5" fill="#fff" />
                  <line x1="0" y1="0" x2="0" y2="28" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="2 2" />
                  <g transform="translate(0, 36)">
                    <rect x="-44" y="-10" width="88" height="20" rx="4" fill="rgba(2, 10, 20, 0.9)" stroke="var(--accent)" strokeWidth="1" />
                    <text x="0" y="4" fill="#00f0ff" fontSize="11" fontWeight="700" fontFamily="monospace" textAnchor="middle">
                      -{currentDepth.toFixed(1)} m
                    </text>
                  </g>
                </g>

                {/* Surface Clearance Dimension Indicator */}
                <g transform={`translate(${targetX + 85}, ${getY(0) + 10})`}>
                  <line x1="0" y1="0" x2="0" y2={targetY - getY(0) - 20} stroke="rgba(255, 255, 255, 0.4)" strokeDasharray="3 3" />
                  <path d={`M -4 0 L 4 0 M -4 ${targetY - getY(0) - 20} L 4 ${targetY - getY(0) - 20}`} stroke="rgba(255, 255, 255, 0.5)" />
                  <text
                    x="8"
                    y={(targetY - getY(0)) / 2}
                    fill="var(--ink-2)"
                    fontSize="9.5"
                    fontFamily="monospace"
                  >
                    Clearance: {surfaceClearance.toFixed(1)}m
                  </text>
                </g>

                {/* Interactive Transect Hover Points */}
                {transect.map((pt, idx) => {
                  const pX = getX(idx);
                  const pY = getY(pt.depth_m);
                  const isHovered = hoveredPointIndex === idx;

                  return (
                    <g
                      key={idx}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPointIndex(idx)}
                    >
                      {/* Invisible wider hit area */}
                      <rect x={pX - 12} y={padTop} width="24" height={plotHeight} fill="transparent" />

                      {isHovered && (
                        <>
                          <line
                            x1={pX}
                            y1={padTop}
                            x2={pX}
                            y2={svgHeight - padBottom}
                            stroke="rgba(0, 240, 255, 0.4)"
                            strokeDasharray="2 2"
                          />
                          <circle cx={pX} cy={pY} r="5" fill="#00f0ff" stroke="#fff" strokeWidth="1.5" />
                          <g transform={`translate(${pX > svgWidth - 140 ? pX - 110 : pX + 10}, ${Math.min(svgHeight - 75, Math.max(padTop + 10, pY - 30))})`}>
                            <rect x="0" y="0" width="105" height="52" rx="4" fill="rgba(2, 12, 22, 0.95)" stroke="var(--accent)" strokeWidth="1" />
                            <text x="8" y="15" fill="#00f0ff" fontSize="10.5" fontWeight="700" fontFamily="monospace">
                              Depth: -{pt.depth_m}m
                            </text>
                            <text x="8" y="30" fill="var(--ink-2)" fontSize="9.5" fontFamily="monospace">
                              Dist: {pt.distance_m > 0 ? `+${pt.distance_m}` : pt.distance_m}m
                            </text>
                            <text x="8" y="44" fill="var(--ink-3)" fontSize="9" fontFamily="monospace">
                              Slope: {pt.slope_deg}°
                            </text>
                          </g>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* X-Axis Distance Labels */}
                <text x={padLeft} y={svgHeight - 12} fill="var(--ink-3)" fontSize="10" fontFamily="monospace">
                  -{(spanKm * 500).toFixed(0)}m (West)
                </text>
                <text x={targetX} y={svgHeight - 12} fill="var(--accent)" fontSize="10.5" fontWeight="700" fontFamily="monospace" textAnchor="middle">
                  Target (0m)
                </text>
                <text x={svgWidth - padRight} y={svgHeight - 12} fill="var(--ink-3)" fontSize="10" fontFamily="monospace" textAnchor="end">
                  +{(spanKm * 500).toFixed(0)}m (East)
                </text>
              </svg>
            </div>

            {/* Transect Key Metrics Strip */}
            <div
              className="row-between wrap"
              style={{
                padding: '12px 16px',
                background: 'var(--panel)',
                borderRadius: 8,
                marginTop: 12,
                border: '1px solid var(--line-faint)',
                gap: 12,
              }}
            >
              <div>
                <span className="tiny upper muted">
                  Point Depth ({gebcoData?.provenance.is_live ? 'GEBCO' : 'Synthetic'})
                </span>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                  -{currentDepth.toFixed(1)} m <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>({(currentDepth * 3.28084).toFixed(1)} ft)</span>
                </div>
              </div>
              <div>
                <span className="tiny upper muted">Avg Transect Depth</span>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                  -{gebcoData?.bathymetry.average_transect_depth_m ?? currentDepth} m
                </div>
              </div>
              <div>
                <span className="tiny upper muted">Seabed Gradient</span>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--teal)' }}>
                  {gebcoData?.bathymetry.seabed_gradient_deg ?? 1.2}° incline
                </div>
              </div>
              <div>
                <span className="tiny upper muted">Surface Clearance</span>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)' }}>
                  {surfaceClearance.toFixed(1)} m
                </div>
              </div>
              <div>
                <span className="tiny upper muted">Object Height</span>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                  {objHeight.toFixed(1)} m
                </div>
              </div>
            </div>
          </Card>

          {/* Graphic 2: 2D Bathymetric Spatial Elevation Grid / Relief Heatmap */}
          <Card>
            <CardHead
              kt="SPATIAL SEABED RELIEF (5x5 GRID)"
              title="2D Bathymetry Contour & Surrounding Soundings"
              right={<span className="badge b-teal">15 Arc-Sec Grid</span>}
            />

            <div className="grid cols-12" style={{ gap: 16, alignItems: 'center' }}>
              {/* Heatmap Grid Matrix */}
              <div className="span-7">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 6,
                    padding: 8,
                    background: '#020912',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                  }}
                >
                  {(gebcoData?.grid.matrix ?? []).flatMap((row, rIdx) =>
                    row.map((cell, cIdx) => {
                      const isCenter = rIdx === 2 && cIdx === 2;
                      const depthRatio = Math.min(1, Math.max(0, (cell.depth_m - minDepth) / (depthRange || 1)));

                      const bg = isCenter
                        ? 'rgba(0, 240, 255, 0.45)'
                        : `rgba(0, ${Math.round(180 - depthRatio * 120)}, ${Math.round(240 - depthRatio * 80)}, ${0.15 + depthRatio * 0.45})`;

                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          style={{
                            padding: '12px 6px',
                            textAlign: 'center',
                            borderRadius: 6,
                            background: bg,
                            border: isCenter ? '2px solid #00f0ff' : '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: isCenter ? '0 0 12px rgba(0, 240, 255, 0.6)' : 'none',
                          }}
                        >
                          <div
                            className="mono"
                            style={{
                              fontSize: 12,
                              fontWeight: isCenter ? 800 : 600,
                              color: isCenter ? '#fff' : 'var(--ink)',
                            }}
                          >
                            -{cell.depth_m.toFixed(1)}m
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: isCenter ? '#00f0ff' : 'var(--ink-3)',
                              marginTop: 2,
                            }}
                          >
                            {isCenter ? '🎯 TARGET' : `${cell.lat.toFixed(3)}N`}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Legend & Grid Context */}
              <div className="span-5 stack" style={{ gap: 12 }}>
                <p className="tiny muted" style={{ lineHeight: 1.5, margin: 0 }}>
                  The 2D spatial relief grid samples the active bathymetry source around the target coordinate within a <b>{spanKm} km</b> radius, modeling seabed slope and potential hazards for navigation and ROV approach.{' '}
                  {gebcoData?.provenance.is_live
                    ? 'Live GEBCO elevation data is being used.'
                    : 'Because the live source is unavailable, these values are synthetic estimates and are not GEBCO measurements.'}
                </p>

                <div className="stack" style={{ gap: 6 }}>
                  <div className="row-between tiny">
                    <span className="muted">Shallow (-{minDepth.toFixed(1)}m)</span>
                    <span className="muted">Deep (-{maxDepth.toFixed(1)}m)</span>
                  </div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, rgba(0, 220, 240, 0.9), rgba(0, 100, 180, 0.8), rgba(2, 20, 50, 0.95))',
                      boxShadow: '0 0 8px rgba(0, 240, 255, 0.3)',
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    background: 'var(--panel)',
                    border: '1px solid var(--line-faint)',
                    fontSize: 12,
                  }}
                >
                  <div className="row-between">
                    <span className="muted">Grid Coverage:</span>
                    <b className="mono">{(spanKm * spanKm).toFixed(2)} km²</b>
                  </div>
                  <div className="row-between" style={{ marginTop: 4 }}>
                    <span className="muted">Center GPS:</span>
                    <b className="mono">{activeLat.toFixed(4)}°N, {activeLng.toFixed(4)}°E</b>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Analyzed Image Correlation & Oceanographic Physics (Span 4) */}
        <div className="span-4 stack" style={{ gap: 18 }}>
          {/* Analyzed Image Correlation */}
          <Card>
            <CardHead
              kt="ANALYZED DETECTION IMAGE"
              title={selectedDet?.className ? clsLabel(selectedDet.className, language) : 'Active Target'}
              right={selectedDet?.isRealModel ? <Badge tone="accent">best.pt AI</Badge> : undefined}
            />

            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#030c17' }}>
              {selectedImage ? (
                <div style={{ position: 'relative', lineHeight: 0 }}>
                  <img
                    src={selectedImage}
                    alt=""
                    style={{
                      width: '100%',
                      maxHeight: 220,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  {selectedDet?.boundingBox && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${selectedDet.boundingBox.x * 100}%`,
                        top: `${selectedDet.boundingBox.y * 100}%`,
                        width: `${selectedDet.boundingBox.width * 100}%`,
                        height: `${selectedDet.boundingBox.height * 100}%`,
                        border: '2px solid var(--accent)',
                        boxShadow: '0 0 8px var(--accent)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
                  No preview image available
                </div>
              )}
            </div>

            <div className="stack" style={{ gap: 8, marginTop: 14 }}>
              <div className="row-between" style={{ fontSize: 12.5 }}>
                <span className="muted">Object Classification</span>
                <b>{selectedDet?.className ? clsLabel(selectedDet.className, language) : 'Undersea Object'}</b>
              </div>
              <div className="row-between" style={{ fontSize: 12.5 }}>
                <span className="muted">Model Confidence</span>
                <b className="mono" style={{ color: 'var(--accent)' }}>
                  {selectedDet ? `${(selectedDet.confidence * 100).toFixed(1)}%` : '—'}
                </b>
              </div>
              <div className="row-between" style={{ fontSize: 12.5 }}>
                <span className="muted">Estimated Dimensions</span>
                <b className="mono">
                  {objLength.toFixed(1)}m L × {objHeight.toFixed(1)}m H
                </b>
              </div>
              <div className="row-between" style={{ fontSize: 12.5 }}>
                <span className="muted">Detection Recorded</span>
                <span className="mono tiny muted">
                  {selectedDet?.detectionTime ? fmtDT(selectedDet.detectionTime) : 'Session Active'}
                </span>
              </div>
            </div>
          </Card>

          {/* Oceanographic & Seawater Physics Telemetry */}
          <Card>
            <CardHead
              kt="DEPTH-DERIVED SEAWATER ESTIMATES"
              title="Derived Oceanographic Properties"
            />

            <div
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                background: 'rgba(255, 170, 0, 0.08)',
                border: '1px solid rgba(255, 170, 0, 0.25)',
              }}
            >
              <div
                className="tiny upper"
                style={{ color: 'var(--accent)', fontWeight: 800 }}
              >
                DERIVED ESTIMATES — NOT DIRECT MEASUREMENTS
              </div>
              <div
                className="tiny muted"
                style={{ marginTop: 4, lineHeight: 1.45 }}
              >
                Temperature, sound speed, pressure, light penetration, and
                operational classification are calculated from the queried
                bathymetric depth in the current implementation. They are not
                direct sensor readings or independent oceanographic dataset
                measurements.
              </div>
            </div>

            <div className="stack" style={{ gap: 12 }}>
              {/* Depth Zone Banner */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(0, 240, 255, 0.08)',
                  border: '1px solid rgba(0, 240, 255, 0.25)',
                }}
              >
                <div className="tiny upper" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {gebcoData?.oceanography.zone ?? 'Epipelagic (Sunlight Zone)'}
                </div>
                <p className="tiny muted" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                  {gebcoData?.oceanography.zone_description ?? 'Ample solar illumination; high acoustic transmission stability.'}
                </p>
              </div>

              {/* Estimated water temperature */}
              <div className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-faint)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Estimated Water Temperature</div>
                  <div className="tiny muted">Depth-derived estimate</div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                  {gebcoData?.oceanography.estimated_water_temp_c ?? 22.6} °C
                </div>
              </div>

              {/* Estimated Acoustic Sound Speed */}

              <div className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-faint)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Estimated Sound Speed</div>
                  <div className="tiny muted">Depth-derived acoustic estimate</div>
                </div>
                <div className="mono" style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>
                  {gebcoData?.oceanography.sound_speed_mps ?? 1528.4} m/s
                </div>
              </div>

              {/* Hydrostatic Pressure */}
              <div className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-faint)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Hydrostatic Pressure</div>
                  <div className="tiny muted">Depth-derived ambient pressure</div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                  {gebcoData?.oceanography.hydrostatic_pressure_bar ?? 4.8} bar
                  <div className="tiny muted">({gebcoData?.oceanography.hydrostatic_pressure_psi ?? 69.6} psi)</div>
                </div>
              </div>

              {/* Light Penetration */}
              <div className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-faint)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Estimated Light Penetration</div>
                  <div className="tiny muted">Depth-derived optical estimate</div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                  {gebcoData?.oceanography.light_penetration_pct ?? 18.2}%
                </div>
              </div>

              {/* Diver / ROV Rating */}
              <div className="row-between" style={{ padding: '8px 0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Operational Capability</div>
                  <div className="tiny muted">Depth-based heuristic classification</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge b-plain" style={{ fontWeight: 600 }}>
                    {gebcoData?.oceanography.diver_classification ?? 'Advanced / Nitrox'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}