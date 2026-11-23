import { unitFlows, unitSections } from './airUnits';
import { humidityRatioRh, humidityRatioWb, pressureKpa, saturationKpa } from './climate';
import type { AirState, DesignSeason, PlacedEquipment, SiteClimate, UnitSection, UnitSectionKind } from './types';

/** Where a station value came from. */
export type StateSource = 'entered' | 'site' | 'calculated' | 'carried';

/** Resolved condition at a station. Humidity ratio is kg/kg; null when not known. */
export interface Psy {
  dbC: number;
  w: number | null;
  source: StateSource;
}

/** Sections on the outdoor, return, and exhaust branches. Everything else is on the supply path after mixing. */
export const BRANCH_KINDS: UnitSectionKind[] = ['oa-damper', 'ra-damper', 'exhaust-damper', 'relief-fan'];

export function isBranch(section: UnitSection): boolean {
  return BRANCH_KINDS.includes(section.kind);
}

/** Wet bulb from dry bulb and humidity ratio. Bisection on ASHRAE Eq. 33. */
export function wetBulbC(dbC: number, w: number, pKpa: number): number {
  let lo = -40;
  let hi = dbC;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (humidityRatioWb(dbC, mid, pKpa) > w) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Relative humidity, 0–1, from dry bulb and humidity ratio. */
export function relativeHumidity(dbC: number, w: number, pKpa: number): number {
  const pw = (w * pKpa) / (0.621945 + w);
  return Math.min(1, Math.max(0, pw / saturationKpa(dbC)));
}

/** An entered condition as dry bulb and humidity ratio. Wet bulb wins over RH when both are given. */
export function fromEntered(state: AirState | undefined | null, pKpa: number, source: StateSource = 'entered'): Psy | null {
  if (!state || state.dbC == null) return null;
  let w: number | null = null;
  if (state.wbC != null && state.wbC <= state.dbC) w = humidityRatioWb(state.dbC, state.wbC, pKpa);
  else if (state.rh != null) w = humidityRatioRh(state.dbC, state.rh * 100, pKpa);
  return { dbC: state.dbC, w: w != null && w >= 0 ? w : null, source };
}

/** Adiabatic mix of two streams by volume flow (planning: equal density). */
export function mix(a: Psy, qa: number, b: Psy, qb: number): Psy {
  const total = qa + qb;
  if (!(total > 0)) return { ...a, source: 'calculated' };
  const dbC = (a.dbC * qa + b.dbC * qb) / total;
  const w = a.w != null && b.w != null ? (a.w * qa + b.w * qb) / total : null;
  return { dbC, w, source: 'calculated' };
}

/** Outdoor design condition for the season from the site. */
export function siteOutdoor(site: SiteClimate, season: DesignSeason): AirState | null {
  if (season === 'cooling') return site.coolingDbC == null ? null : { dbC: site.coolingDbC, wbC: site.coolingWbC, rh: null };
  return site.heatingDbC == null ? null : { dbC: site.heatingDbC, wbC: null, rh: null };
}

/** Indoor target for the season from the site, used as the return condition. */
export function siteIndoor(site: SiteClimate, season: DesignSeason): AirState {
  if (season === 'cooling') return { dbC: site.indoorCoolC, wbC: null, rh: site.indoorCoolRh / 100 };
  return { dbC: site.indoorHeatC, wbC: null, rh: null };
}

export interface UnitStations {
  outdoor: Psy | null;
  ret: Psy | null;
  /** Air entering the first supply-path section. */
  entering: Psy | null;
  /** Air leaving each section, by section id. Branch sections show their branch condition. */
  leaving: Map<string, Psy | null>;
  supply: Psy | null;
  /** True when return air mixes back into the supply path. Heat-recovery units without a mixing box send it all to exhaust. */
  recirculates: boolean;
  pKpa: number;
}

/** Does return air rejoin the supply path? */
export function recirculates(sections: UnitSection[]): boolean {
  const hasReturn = sections.some(section => section.kind === 'ra-damper' || section.kind === 'mixing-box');
  if (!hasReturn) return false;
  return sections.some(section => section.kind === 'mixing-box') || !sections.some(section => section.kind === 'heat-recovery');
}

/**
 * Conditions through a unit for one design season. Outdoor and return come from the entered damper condition,
 * else the site. Mixed air is calculated from the outdoor and recirculated flows. Each supply-path section passes
 * its entering air on unless a leaving condition is entered.
 */
export function unitStations(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>, site: SiteClimate, season: DesignSeason): UnitStations {
  const pKpa = pressureKpa(site.elevationM);
  const sections = unitSections(item);
  const flows = unitFlows(item);
  const oaSection = sections.find(section => section.kind === 'oa-damper');
  const raSection = sections.find(section => section.kind === 'ra-damper');
  const outdoor = oaSection
    ? fromEntered(oaSection.states?.[season], pKpa) ?? fromEntered(siteOutdoor(site, season), pKpa, 'site')
    : null;
  const ret = raSection || sections.some(section => section.kind === 'mixing-box')
    ? fromEntered(raSection?.states?.[season], pKpa) ?? fromEntered(siteIndoor(site, season), pKpa, 'site')
    : null;
  const leaving = new Map<string, Psy | null>();
  for (const section of sections) {
    if (section.kind === 'oa-damper') leaving.set(section.id, outdoor);
    else if (isBranch(section)) leaving.set(section.id, ret);
  }
  let entering: Psy | null = null;
  const supplyFlow = flows.supply ?? 0;
  const oaFlow = Math.min(flows.outdoor ?? 0, supplyFlow);
  const recirc = recirculates(sections);
  if (outdoor && ret && recirc) entering = mix(outdoor, oaFlow, ret, Math.max(0, supplyFlow - oaFlow));
  else entering = outdoor ?? (recirc ? ret : null);
  let current = entering;
  for (const section of sections) {
    if (isBranch(section)) continue;
    const entered = fromEntered(section.states?.[season], pKpa);
    if (entered) current = entered;
    else if (current) current = { ...current, source: section.kind === 'mixing-box' ? 'calculated' : 'carried' };
    leaving.set(section.id, current);
  }
  return { outdoor, ret, entering, leaving, supply: current, recirculates: recirc, pKpa };
}

/** Display parts of a condition in project units: dry bulb, then wet bulb and RH when the humidity is known. */
export function stateParts(state: Psy, pKpa: number, units: 'SI' | 'IP'): { db: string; wb: string | null; rh: string | null } {
  const temp = (c: number) => (units === 'IP' ? `${(c * 1.8 + 32).toFixed(1)}°F` : `${c.toFixed(1)}°C`);
  if (state.w == null) return { db: `${temp(state.dbC)} DB`, wb: null, rh: null };
  return {
    db: `${temp(state.dbC)} DB`,
    wb: `${temp(wetBulbC(state.dbC, state.w, pKpa))} WB`,
    rh: `${Math.round(relativeHumidity(state.dbC, state.w, pKpa) * 100)}% RH`,
  };
}
