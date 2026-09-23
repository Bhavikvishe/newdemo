import type { SessionUser } from '../types';
import type { ComponentType } from 'react';
import {
  IconActivity,
  IconAlert,
  IconBars,
  IconChart,
  IconDoc,
  IconGear,
  IconHelm,
  IconMap,
  IconPin,
  IconRadar,
  IconScan,
  IconShield,
  IconUpload,
  IconConnection,
} from './Icons';

export interface NavItem {
  id: string;
  labelKey: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
  badge?: { n: 'alerts' } | { n: 'critical' };
}

export interface NavSection {
  id: string;
  labelKey: string;
  items: NavItem[];
}

export const CLAUSE_OVERVIEW = 'overview';

export function myDeptLabel(user: SessionUser): string {
  switch (user.department) {
    case 'marine-operations': return 'My Operational Alerts';
    case 'marine-engineering': return 'Engineering Alerts';
    case 'marine-environmental': return 'Environmental Alerts';
    case 'search-rescue': return 'Emergency Alerts';
    case 'ocean-survey': return 'Survey Alerts';
    case 'recovery-response': return 'Recovery Alerts';
    case 'system-admin': return 'Admin Console';
  }
}

export function buildNav(_user: SessionUser): NavSection[] {
  const common: NavItem[] = [
    { id: 'overview', labelKey: 'nav.overview', href: 'overview', icon: IconActivity },
    { id: 'detection', labelKey: 'nav.detection', href: 'detection', icon: IconUpload },
    { id: 'batch', labelKey: 'nav.batch', href: 'batch', icon: IconScan },
    { id: 'live', labelKey: 'nav.live', href: 'live', icon: IconRadar },
    { id: 'map', labelKey: 'nav.map', href: 'map', icon: IconMap },
    { id: 'alerts', labelKey: 'nav.alerts', href: 'alerts', icon: IconAlert, badge: { n: 'alerts' } },
    { id: 'history', labelKey: 'nav.history', href: 'history', icon: IconDoc },
    { id: 'analytics', labelKey: 'nav.analytics', href: 'analytics', icon: IconChart },
    { id: 'reports', labelKey: 'nav.reports', href: 'reports', icon: IconBars },
  ];

  const responseItems: NavItem[] = [
    { id: 'mydepart', labelKey: 'nav.mydept', href: 'department', icon: IconHelm },
    { id: 'depts', labelKey: 'nav.departments', href: 'departments', icon: IconConnection },
    { id: 'settings', labelKey: 'nav.settings', href: 'settings', icon: IconGear },
  ];

  if (_user.department === 'system-admin') {
    responseItems.splice(1, 0, { id: 'admin', labelKey: 'nav.admin', href: 'admin', icon: IconShield });
  }

  const sections: NavSection[] = [
    {
      id: 'intel',
      labelKey: 'nav.intelligence',
      items: [...common.slice(0, 5), { id: 'navigate', labelKey: 'nav.navigate', href: 'navigate', icon: IconPin }],
    },
    {
      id: 'ops',
      labelKey: 'nav.main',
      items: common.slice(5, 8),
    },
    {
      id: 'resp',
      labelKey: 'nav.response_nav',
      items: responseItems,
    },
  ];

  return sections;
}