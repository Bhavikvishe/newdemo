import type { ReactNode, SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Svg({ size = 17, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** OCEONIX mark — sonar rings + coordinate core + current lines */
export function IconSonar(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 4" opacity="0.5" />
      <circle cx="12" cy="12" r="5.5" strokeDasharray="2 3" opacity="0.7" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 12 L16.5 7.5" opacity="0.9" />
      <circle cx="16.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <path d="M5 17 q3 2 6 0 t6 0" opacity="0.6" />
    </Svg>
  );
}

export function IconWave(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 9 q2.5 -3 5 0 t5 0 t5 0 t5 0" />
      <path d="M2 15 q2.5 -3 5 0 t5 0 t5 0 t5 0" opacity="0.55" />
    </Svg>
  );
}

/** depth gauge — half circle with needle */
export function IconGauge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 17 a 8 8 0 0 1 16 0" />
      <path d="M12 17 v-5" />
      <path d="M7 14 l2.4 1.2" opacity="0.6" />
      <path d="M17 14 l-2.4 1.2" opacity="0.6" />
      <path d="M9.5 17 l2.5 -4 2.5 4" strokeWidth="1.3" />
    </Svg>
  );
}

/** ocean depth sounding / bathymetry */
export function IconDepth(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 5 q2.5 -2 5 0 t5 0 t5 0 t5 0" />
      <path d="M2 19 C 6 15, 10 18, 14 16 C 18 14, 20 18, 22 17" />
      <path d="M12 5 v10" strokeDasharray="2 2" />
      <path d="M9 13 l3 3 3 -3" />
    </Svg>
  );
}

/** radar sweep */
export function IconRadar(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2 3" />
      <circle cx="12" cy="12" r="5" opacity="0.6" />
      <path d="M12 12 L17 7" />
      <circle cx="16" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5 a5 5 0 0 1 3 -1.2" opacity="0.5" />
    </Svg>
  );
}

/** navigation coordinates crosshair */
export function IconCross(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 3 v4" />
      <path d="M12 17 v4" />
      <path d="M3 12 h4" />
      <path d="M17 12 h4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21 19.5 H3 Z" strokeWidth="1.5" />
      <path d="M12 9.5 v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" opacity="0.4" />
      <path d="M7.8 12.4 l2.8 2.9 5.6 -6" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7 v5.2 l3.2 2" />
    </Svg>
  );
}

export function IconScale(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4 h16" />
      <path d="M6.5 4 v12 h11 v-12" />
      <path d="M9 7.5 l3 3.5 3 -3.5" />
      <path d="M8 16.5 h8" />
      <path d="M12 16.5 v3" />
    </Svg>
  );
}

export function IconRuler(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="9" width="15" height="6" rx="1" transform="rotate(-18 3 9)" />
      <path d="M9.5 10.5 l1 2.4 1.9 -0.8" opacity="0.8" />
    </Svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="4 3" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconMap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19 V6 l5 -2.5 6 2.5 5 -2 V16 l-5 2.5 -6 -2.5 Z" />
      <path d="M9 3.5 V16" opacity="0.6" />
      <path d="M15 6 V18.5" opacity="0.6" />
      <circle cx="18.2" cy="18.6" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15 V4" />
      <path d="M8 7.5 12 3.5 16 7.5" />
      <path d="M4 15 v4 a1.8 1.8 0 0 0 1.8 1.8 h12.4 A1.8 1.8 0 0 0 20 19 v-4" opacity="0.7" />
    </Svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 7 A2 2 0 0 1 5.5 5 h4 l2 2.5 h6.5 A2 2 0 0 1 20 9.5 V17 a2 2 0 0 1 -2 2 H5.5 a2 2 0 0 1 -2 -2 Z" />
    </Svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5.5 17.5 12 8 18.5 Z" />
    </Svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5.5 v13" />
      <path d="M15 5.5 v13" />
    </Svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 8 h8 v8 H8 Z" />
    </Svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 19 6 v5.5 c0 4.4 -3 7.4 -7 9.5 -4 -2.1 -7 -5.1 -7 -9.5 V6 Z" />
      <path d="M9 12 l2.2 2.2 4 -4.2" />
    </Svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M5 19.5 a7.2 7.2 0 0 1 14 0" />
    </Svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.6 v2.4 M12 18 v2.4 M3.6 12 h2.4 M18 12 h2.4 M6.2 6.2 7.9 7.9 M16.1 16.1 l1.7 1.7 M17.8 6.2 16.1 7.9 M7.9 16.1 6.2 17.8" />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 16 v-4.5 a6 6 0 0 1 12 0 V16 l1.5 2.5 H4.5 Z" />
      <path d="M10 20.5 a2.1 2.1 0 0 0 4 0" />
    </Svg>
  );
}

export function IconBars(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 7 h8 M5 12 h14 M5 17 h10" strokeWidth="2" />
    </Svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20 V4" opacity="0.4" />
      <path d="M4 16.5 h16" opacity="0.4" />
      <path d="M6.5 15 10 9.5 13 12 17.5 5.5" />
      <circle cx="17.5" cy="5.5" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconDoc(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3.5 h7 L18.5 8 v12 h-11.5 Z" />
      <path d="M14 3.5 V8 h4.5" opacity="0.7" />
      <path d="M9.5 13 h5.5 M9.5 16 h4" opacity="0.7" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </Svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6 18 18 M18 6 6 18" />
    </Svg>
  );
}

export function IconChevDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconChevRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12 h15 M13 6 l6 6-6 6" />
    </Svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 v15 M6 13 l6 6 6-6" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3 v2 M12 19 v2 M3 12 h2 M19 12 h2 M5.6 5.6 7 7 M17 17 l1.4 1.4 M18.4 5.6 17 7 M7 17 5.6 18.4" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5 A7.5 7.5 0 0 1 9.5 4 a6 6 0 1 0 10.5 10.5 Z" />
    </Svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12 h17 M12 3.5 a13 13 0 0 1 0 17 M12 3.5 a13 13 0 0 0 0 17" />
      <path d="M6 17.5 q3 -2 6 0 t6 0" opacity="0.5" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4 h4.5 a1.5 1.5 0 0 1 1.5 1.5 v13 a1.5 1.5 0 0 1 -1.5 1.5 H14" />
      <path d="m9.5 7.5 -4.5 4.5 4.5 4.5 M5 12 h9" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.5 h16 M4 12 h16 M4 17.5 h16" strokeWidth="1.8" />
    </Svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 4 8.5 12 13.5 20 8.5 Z" />
      <path d="M4 13 12 18 20 13" opacity="0.6" />
    </Svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5 h16 l-6 7 v6 l-4 2 v-8 Z" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 8 A8 8 0 1 0 20 14" />
      <path d="M19 3.5 V8 H14.5" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 v10 M8 10.5 12 14.5 16 10.5" />
      <path d="M4 17 v2 a1.5 1.5 0 0 0 1.5 1.5 h13 A1.5 1.5 0 0 0 20 19 v-2" opacity="0.7" />
    </Svg>
  );
}

export function IconPrint(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 8 V4 h10 v4" />
      <path d="M7 16 H5 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 A1.5 1.5 0 0 1 5 10 h14 a1.5 1.5 0 0 1 1.5 1.5 v3 A1.5 1.5 0 0 1 19 16 h-2" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </Svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12 S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12 Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

export function IconNote(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4 h9 l5 5 v11 H5 Z" opacity="0.4" />
      <path d="M14 4 v5 h5" />
      <path d="M8 12 h8 M8 15 h5" />
    </Svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11 v5.5" />
      <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 21 V4.5" />
      <path d="M6 5 h11 l-2.5 3.2 2.5 3.3 H6" />
    </Svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7 v10 L12 21 4 17 V7 Z" opacity="0.55" />
      <path d="M12 12.6 V21 M4 7 l8 4 8 -4" />
    </Svg>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12 h3 l2.5 -6 4 12 2.5 -6 H20" />
    </Svg>
  );
}

export function IconHelm(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2 3" />
      <path d="M12 12 L19 5" />
      <path d="M12 12 5.5 6" opacity="0.6" />
      <path d="M12 12 6.5 18" opacity="0.4" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21 S5 14.5 5 9.5 a7 7 0 0 1 14 0 C19 14.5 12 21 12 21 Z" />
      <circle cx="12" cy="9.5" r="2.6" />
    </Svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <path d="M14 4 h6 v6 h-6 Z" opacity="0.6" />
      <path d="M4 14 h6 v6 H4 Z" opacity="0.6" />
      <path d="M14 14 h3 M20 14 h0.01 M14 17 h2.5 M19.6 17 v3 M17 20 h-3" />
    </Svg>
  );
}

export function IconFish(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12 c5 -3.5 9 -3.5 15 0 -6 3.5 -10 3.5 -15 0 Z" />
      <path d="M14.5 12 19.5 8 v8 Z" opacity="0.6" />
      <circle cx="7" cy="11" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconRescue(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 19 6 v5.5 c0 4.1 -2.8 7 -7 9 -4.2 -2 -7 -4.9 -7 -9 V6 Z" opacity="0.45" />
      <path d="M12 10.5 9.5 8 15 8 Z" />
      <path d="M12 10.5 V14 M9.5 12.2 12 14 14.5 12.2" strokeWidth="1.5" />
    </Svg>
  );
}

export function IconConnection(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M8.4 12 h7.2 M14 9.5 c2.6 0 2.6 -3.5 0 -3.5 M10 15c-2.6 0-2.6 3.5 0 3.5" opacity="0.7" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="10.5" width="12" height="9" rx="2" />
      <path d="M8.5 10.5 V8 a3.5 3.5 0 0 1 7 0 v2.5" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** sonar scan frame with leading edge */
export function IconScan(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" opacity="0.6" />
      <path d="M6 8.5 H18 M6 12 H18 M6 15.5 h8" opacity="0.45" />
      <path d="M6 18.5 C 9 14 12 14 15 12.5" />
      <circle cx="15" cy="12.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </Svg>
  );
}