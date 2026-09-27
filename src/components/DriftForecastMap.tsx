import {
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import type {
  DriftCurrentVector,
  DriftMilestone,
  DriftTrajectoryPoint,
  DriftUncertaintyPoint,
} from '../lib/drift';

interface DriftForecastMapProps {
  start?: {
    latitude: number;
    longitude: number;
  } | null;
  trajectory: DriftTrajectoryPoint[];
  milestones: DriftMilestone[];
  uncertainty: DriftUncertaintyPoint[];
  currentVectors: DriftCurrentVector[];
  animationIndex: number | null;
  onSelectLocation: (
    latitude: number,
    longitude: number,
  ) => void;
  height?: number;
}

const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function arrowIcon(
  angle: number,
): L.DivIcon {
  return L.divIcon({
    className: 'gis-divicon',
    html: `
      <div
        style="
          width:28px;
          height:28px;
          display:flex;
          align-items:center;
          justify-content:center;
          transform:rotate(${angle}deg);
          transform-origin:center;
          filter:drop-shadow(0 1px 3px rgba(0,0,0,.75));
        "
      >
        <span
          style="
            display:block;
            width:0;
            height:0;
            border-left:5px solid transparent;
            border-right:5px solid transparent;
            border-bottom:17px solid #6fe7ff;
          "
        ></span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function pointIcon(
  color: string,
  label: string,
): L.DivIcon {
  return L.divIcon({
    className: 'gis-divicon',
    html: `
      <div
        style="
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:4px;
          transform:translateY(-4px);
        "
      >
        <div
          style="
            width:13px;
            height:13px;
            border-radius:50%;
            background:${color};
            border:2px solid #fff;
            box-shadow:
              0 0 0 4px rgba(0,0,0,.25),
              0 0 14px ${color};
          "
        ></div>

        <span
          style="
            font-family:var(--font-mono);
            font-size:9px;
            letter-spacing:.08em;
            white-space:nowrap;
            color:#fff;
            text-shadow:0 1px 4px #000;
          "
        >${label}</span>
      </div>
    `,
    iconSize: [70, 45],
    iconAnchor: [35, 22],
  });
}

export function DriftForecastMap({
  start,
  trajectory,
  milestones,
  uncertainty,
  currentVectors,
  animationIndex,
  onSelectLocation,
  height = 620,
}: DriftForecastMapProps) {
  const hostRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  /*
   * Static forecast layers:
   * trajectory
   * start point
   * milestones
   * current vectors
   */
  const staticLayersRef =
    useRef<L.LayerGroup | null>(null);

  /*
   * Animation-only layers:
   * moving forecast point
   * uncertainty circle
   */
  const animationLayersRef =
    useRef<L.LayerGroup | null>(null);

  const clickHandlerRef =
    useRef(onSelectLocation);

  /*
   * Prevent repeated automatic viewport fitting.
   *
   * The map should fit the newly generated forecast once,
   * but NEVER during animation.
   */
  const lastForecastSignatureRef =
    useRef<string>('');

  useEffect(() => {
    clickHandlerRef.current =
      onSelectLocation;
  }, [onSelectLocation]);

  /*
   * ---------------------------------------------------------
   * CREATE MAP ONCE
   * ---------------------------------------------------------
   */
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    if (mapRef.current) {
      return;
    }

    const map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 18,
    });

    mapRef.current = map;

    const tiles = L.tileLayer(
      ESRI_URL,
      {
        attribution:
          '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        maxZoom: 18,
        className: 'gis-tiles',
      },
    );

    tiles.addTo(map);

    /*
     * Default view only.
     *
     * We intentionally do NOT depend on animationIndex here.
     */
    map.setView(
      [
        start?.latitude ?? 18.8,
        start?.longitude ?? 72.7,
      ],
      start ? 7 : 5,
    );

    map.on('click', (event) => {
      clickHandlerRef.current(
        event.latlng.lat,
        event.latlng.lng,
      );
    });

    const resize = () => {
      map.invalidateSize();
    };

    window.addEventListener(
      'resize',
      resize,
    );

    const raf =
      window.requestAnimationFrame(resize);

    return () => {
      window.removeEventListener(
        'resize',
        resize,
      );

      window.cancelAnimationFrame(raf);

      map.remove();

      mapRef.current = null;
      staticLayersRef.current = null;
      animationLayersRef.current = null;
      lastForecastSignatureRef.current = '';
    };
    // IMPORTANT:
    // The Leaflet map is created only once.
    // Do not add animationIndex, trajectory, etc. here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * ---------------------------------------------------------
   * MOVE TO NEW START LOCATION WHEN THERE IS NO FORECAST
   * ---------------------------------------------------------
   *
   * This allows clicking/selecting a new origin without
   * destroying the Leaflet map.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !start) {
      return;
    }

    if (trajectory.length > 1) {
      return;
    }

    map.setView(
      [
        start.latitude,
        start.longitude,
      ],
      Math.max(map.getZoom(), 7),
      {
        animate: true,
        duration: 0.35,
      },
    );
  }, [
    start,
    trajectory.length,
  ]);

  /*
   * ---------------------------------------------------------
   * STATIC FORECAST LAYERS
   * ---------------------------------------------------------
   *
   * This effect intentionally DOES NOT depend on
   * animationIndex.
   *
   * Therefore playing the animation cannot trigger
   * fitBounds().
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    /*
     * Remove previous static forecast layers.
     */
    if (staticLayersRef.current) {
      staticLayersRef.current.remove();
    }

    const group =
      L.layerGroup().addTo(map);

    staticLayersRef.current = group;

    /*
     * -------------------------------------------------------
     * TRAJECTORY
     * -------------------------------------------------------
     */
    if (trajectory.length > 1) {
      const route =
        trajectory.map(
          (point) =>
            [
              point.latitude,
              point.longitude,
            ] as [number, number],
        );

      L.polyline(
        route,
        {
          color: '#55d6e8',
          weight: 3,
          opacity: 0.92,
        },
      ).addTo(group);
    }

    /*
     * -------------------------------------------------------
     * START
     * -------------------------------------------------------
     */
    if (start) {
      L.marker(
        [
          start.latitude,
          start.longitude,
        ],
        {
          icon: pointIcon(
            '#ffffff',
            'START',
          ),
        },
      ).addTo(group);
    }

    /*
     * -------------------------------------------------------
     * 24H / 48H / 72H MILESTONES
     * -------------------------------------------------------
     */
    milestones.forEach(
      (milestone) => {
        L.marker(
          [
            milestone.latitude,
            milestone.longitude,
          ],
          {
            icon: pointIcon(
              '#4de1a8',
              `${milestone.hours}H`,
            ),
          },
        )
          .bindPopup(
            `
              <b>${milestone.hours}-hour forecast</b><br/>
              ${milestone.latitude.toFixed(5)},
              ${milestone.longitude.toFixed(5)}<br/>
              <span style="font-family:monospace">
                ${new Date(
                  milestone.timestamp,
                ).toISOString()}
              </span>
            `,
          )
          .addTo(group);
      },
    );

    /*
     * -------------------------------------------------------
     * CURRENT VECTORS
     * -------------------------------------------------------
     *
     * Backend already downsamples them.
     * Frontend additionally limits visual density.
     */
    const vectorCount =
      currentVectors.length;

    const vectorStep =
      vectorCount <= 20
        ? 1
        : vectorCount <= 50
          ? 2
          : 4;

    currentVectors.forEach(
      (vector, index) => {
        if (
          index % vectorStep !== 0 &&
          index !== vectorCount - 1
        ) {
          return;
        }

        const angle =
          Math.atan2(
            vector.uo_ms,
            vector.vo_ms,
          ) *
          (180 / Math.PI);

        L.marker(
          [
            vector.latitude,
            vector.longitude,
          ],
          {
            icon: arrowIcon(angle),
            interactive: false,
          },
        ).addTo(group);
      },
    );

    /*
     * -------------------------------------------------------
     * FIT MAP ONLY WHEN A NEW FORECAST ARRIVES
     * -------------------------------------------------------
     *
     * The signature changes when the actual forecast
     * trajectory changes.
     *
     * animationIndex is deliberately excluded.
     */
    if (trajectory.length > 1) {
      const first =
        trajectory[0];

      const last =
        trajectory[
          trajectory.length - 1
        ];

      const signature = [
        trajectory.length,
        first.latitude.toFixed(6),
        first.longitude.toFixed(6),
        last.latitude.toFixed(6),
        last.longitude.toFixed(6),
      ].join('|');

      if (
        lastForecastSignatureRef.current !==
        signature
      ) {
        const bounds =
          L.latLngBounds(
            trajectory.map(
              (point) => [
                point.latitude,
                point.longitude,
              ] as [number, number],
            ),
          );

        /*
         * This happens ONCE for the forecast.
         *
         * It is NOT executed when animationIndex changes.
         */
        map.fitBounds(
          bounds,
          {
            padding: [35, 35],
            maxZoom: 9,
            animate: true,
            duration: 0.6,
          },
        );

        lastForecastSignatureRef.current =
          signature;
      }
    } else {
      /*
       * No active forecast.
       * Reset the signature so the next forecast
       * gets a fresh fitBounds().
       */
      lastForecastSignatureRef.current =
        '';
    }
  }, [
    start,
    trajectory,
    milestones,
    currentVectors,
  ]);

  /*
   * ---------------------------------------------------------
   * ANIMATION LAYERS
   * ---------------------------------------------------------
   *
   * This is the only effect that changes every animation
   * frame.
   *
   * IMPORTANT:
   * There is NO map.setView().
   * There is NO map.fitBounds().
   *
   * Therefore the viewport remains completely stable.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    /*
     * Clear only animation layers.
     *
     * Static trajectory/vector/milestone layers stay untouched.
     */
    if (animationLayersRef.current) {
      animationLayersRef.current.remove();
    }

    const group =
      L.layerGroup().addTo(map);

    animationLayersRef.current =
      group;

    /*
     * No active animation frame.
     */
    if (
      animationIndex == null ||
      !trajectory[animationIndex]
    ) {
      return;
    }

    const current =
      trajectory[animationIndex];

    /*
     * -------------------------------------------------------
     * MOVING FORECAST POSITION
     * -------------------------------------------------------
     */
    L.circleMarker(
      [
        current.latitude,
        current.longitude,
      ],
      {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ffcf66',
        fillOpacity: 1,
      },
    )
      .bindPopup(
        `
          <b>Forecast position</b><br/>
          ${current.latitude.toFixed(5)},
          ${current.longitude.toFixed(5)}<br/>
          Current:
          ${current.speed_ms.toFixed(3)} m/s
        `,
      )
      .addTo(group);

    /*
     * -------------------------------------------------------
     * UNCERTAINTY
     * -------------------------------------------------------
     */
    const uncertaintyPoint =
      uncertainty[animationIndex];

    if (uncertaintyPoint) {
      const radius =
        uncertaintyPoint.radius_95_m ??
        uncertaintyPoint.radius_m;

      if (
        Number.isFinite(radius) &&
        radius > 0
      ) {
        L.circle(
          [
            current.latitude,
            current.longitude,
          ],
          {
            radius,
            color: '#ffcf66',
            weight: 1.5,
            dashArray: '6 5',
            fillColor: '#ffcf66',
            fillOpacity: 0.08,
          },
        ).addTo(group);
      }
    }

    /*
     * Cleanup happens when the next animation frame arrives.
     */
    return () => {
      group.remove();
    };
  }, [
    animationIndex,
    trajectory,
    uncertainty,
  ]);

  const style: CSSProperties = {
    height,
    minHeight: 420,
  };

  return (
    <div
      className="map-shell geo"
      style={{
        ...style,
        aspectRatio: 'auto',
      }}
    >
      <div
        ref={hostRef}
        className="gis-map"
      />

      <div
        style={{
          position: 'absolute',
          left: 14,
          top: 14,
          zIndex: 700,
          background:
            'color-mix(in srgb, var(--panel-solid) 88%, transparent)',
          border:
            '1px solid var(--line-soft)',
          borderRadius: 9,
          padding: '8px 11px',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '.08em',
          color: 'var(--ink-2)',
          pointerEvents: 'none',
        }}
      >
        CLICK MAP TO SET FORECAST ORIGIN
      </div>

      <div
        style={{
          position: 'absolute',
          right: 14,
          bottom: 14,
          zIndex: 700,
          background:
            'color-mix(in srgb, var(--panel-solid) 90%, transparent)',
          border:
            '1px solid var(--line-soft)',
          borderRadius: 10,
          padding: 10,
          fontSize: 10.5,
          color: 'var(--ink-2)',
          display: 'grid',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#fff',
              marginRight: 7,
            }}
          />
          Start
        </span>

        <span>
          <i
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#4de1a8',
              marginRight: 7,
            }}
          />
          Milestone
        </span>

        <span>
          <i
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ffcf66',
              marginRight: 7,
            }}
          />
          Forecast / uncertainty
        </span>

        <span>
          <i
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              marginRight: 7,
              color: '#6fe7ff',
            }}
          >
            ↑
          </i>
          Current vector
        </span>
      </div>
    </div>
  );
}