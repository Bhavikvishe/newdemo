import { xEn as adminEn, xHi as adminHi, xMr as adminMr } from './admin';
import { xEn as alertsEn, xHi as alertsHi, xMr as alertsMr } from './alerts';
import { xEn as batchEn, xHi as batchHi, xMr as batchMr } from './batch';
import { xHi as baseHi } from './basehi';
import { xMr as baseMr } from './basemr';
import { xEn as chartsEn, xHi as chartsHi, xMr as chartsMr } from './charts';
import { xEn as dashboardEn, xHi as dashboardHi, xMr as dashboardMr } from './dashboard';
import { xEn as departmentsEn, xHi as departmentsHi, xMr as departmentsMr } from './departments';
import { xEn as detailEn, xHi as detailHi, xMr as detailMr } from './detail';
import { xEn as detectionEn, xHi as detectionHi, xMr as detectionMr } from './detection';
import { xEn as historyEn, xHi as historyHi, xMr as historyMr } from './history';
import { xEn as landingEn, xHi as landingHi, xMr as landingMr } from './landing';
import { xEn as loginEn, xHi as loginHi, xMr as loginMr } from './login';
import { xEn as mapEn, xHi as mapHi, xMr as mapMr } from './map';
import { xEn as mydeptEn, xHi as mydeptHi, xMr as mydeptMr } from './mydept';
import { xEn as onboardingEn, xHi as onboardingHi, xMr as onboardingMr } from './onboarding';
import { xEn as settingsEn, xHi as settingsHi, xMr as settingsMr } from './settings';
import { xEn as shellEn, xHi as shellHi, xMr as shellMr } from './shell';
import { xEn as sonarEn, xHi as sonarHi, xMr as sonarMr } from './sonar';
import { xEn as storeEn, xHi as storeHi, xMr as storeMr } from './store';
import { xEn as uiEn, xHi as uiHi, xMr as uiMr } from './ui';
import { xEn as weatherEn, xHi as weatherHi, xMr as weatherMr } from './weather';

export const xEn: Record<string, string> = {
  ...adminEn,
  ...alertsEn,
  ...batchEn,
  ...chartsEn,
  ...dashboardEn,
  ...departmentsEn,
  ...detailEn,
  ...detectionEn,
  ...historyEn,
  ...landingEn,
  ...loginEn,
  ...mapEn,
  ...mydeptEn,
  ...onboardingEn,
  ...settingsEn,
  ...shellEn,
  ...sonarEn,
  ...storeEn,
  ...uiEn,
  ...weatherEn,
};

export const xHi: Record<string, string> = {
  ...baseHi,
  ...adminHi,
  ...alertsHi,
  ...batchHi,
  ...chartsHi,
  ...dashboardHi,
  ...departmentsHi,
  ...detailHi,
  ...detectionHi,
  ...historyHi,
  ...landingHi,
  ...loginHi,
  ...mapHi,
  ...mydeptHi,
  ...onboardingHi,
  ...settingsHi,
  ...shellHi,
  ...sonarHi,
  ...storeHi,
  ...uiHi,
  ...weatherHi,
};

export const xMr: Record<string, string> = {
  ...baseMr,
  ...adminMr,
  ...alertsMr,
  ...batchMr,
  ...chartsMr,
  ...dashboardMr,
  ...departmentsMr,
  ...detailMr,
  ...detectionMr,
  ...historyMr,
  ...landingMr,
  ...loginMr,
  ...mapMr,
  ...mydeptMr,
  ...onboardingMr,
  ...settingsMr,
  ...shellMr,
  ...sonarMr,
  ...storeMr,
  ...uiMr,
  ...weatherMr,
};