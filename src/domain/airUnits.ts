import { catalogPorts, getProduct, type CatalogPort, type CatalogProduct, type UnitPortRole } from './catalog';
import { createId } from './ids';
import type { CoilMedium, DuctService, PlacedEquipment, UnitSection, UnitSectionKind } from './types';

export const SECTION_LABEL: Record<UnitSectionKind, string> = {
  'oa-damper': 'Outdoor-air damper',
  'ra-damper': 'Return-air damper',
  'exhaust-damper': 'Exhaust / relief damper',
  'relief-fan': 'Exhaust (relief) fan',
  'mixing-box': 'Mixing box',
  filter: 'Filter',
  'heat-recovery': 'Heat recovery core',
  'supply-fan': 'Supply fan',
  'cooling-coil': 'Cooling coil',
  'heating-coil': 'Heating coil',
  humidifier: 'Humidifier',
};

/** Short tag drawn inside the unit footprint. */
export const SECTION_TAG: Record<UnitSectionKind, string> = {
  'oa-damper': 'OA',
  'ra-damper': 'RA',
  'exhaust-damper': 'EA',
  'relief-fan': 'EF',
  'mixing-box': 'MB',
  filter: 'F',
  'heat-recovery': 'HR',
  'supply-fan': 'SF',
  'cooling-coil': 'CC',
  'heating-coil': 'HC',
  humidifier: 'H',
};

export const SECTION_KINDS: UnitSectionKind[] = [
  'oa-damper',
  'exhaust-damper',
  'relief-fan',
  'ra-damper',
  'mixing-box',
  'filter',
  'heat-recovery',
  'supply-fan',
  'cooling-coil',
  'heating-coil',
  'humidifier',
];

export const COIL_MEDIUM_LABEL: Record<CoilMedium, string> = {
  dx: 'DX refrigerant',
  'co2-dx': 'CO₂ (R-744) DX',
  'chilled-water': 'Chilled water',
  'hot-water': 'Hot water',
  glycol: 'Glycol',
  steam: 'Steam',
  gas: 'Gas-fired',
  electric: 'Electric',
};

export const COOLING_MEDIA: CoilMedium[] = ['dx', 'co2-dx', 'chilled-water', 'glycol'];
export const HEATING_MEDIA: CoilMedium[] = ['hot-water', 'glycol', 'steam', 'gas', 'electric'];

const ROLE_SERVICE: Record<UnitPortRole, { service: DuctService; direction: 'in' | 'out'; accepts?: DuctService[] }> = {
  oa: { service: 'outdoor', direction: 'in' },
  ra: { service: 'return', direction: 'in' },
  sa: { service: 'supply', direction: 'out' },
  ea: { service: 'exhaust', direction: 'out', accepts: ['relief'] },
};

export function isUnit(product: CatalogProduct | undefined | null): boolean {
  return !!product?.unit;
}

export function newSection(kind: UnitSectionKind): UnitSection {
  const section: UnitSection = { id: createId('sec'), kind };
  if (kind === 'oa-damper' || kind === 'exhaust-damper') {
    section.position = 'NC';
    section.ducted = true;
  }
  if (kind === 'ra-damper') {
    section.position = 'NO';
    section.ducted = true;
  }
  if (kind === 'cooling-coil') section.medium = 'dx';
  if (kind === 'heating-coil') section.medium = 'hot-water';
  return section;
}

/** Sections in airflow order. A placement without its own list uses the catalog default. */
export function unitSections(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>): UnitSection[] {
  if (item.sections) return item.sections;
  const spec = getProduct(item.catalogId)?.unit;
  if (!spec) return [];
  return spec.sections.map((section, index) => ({ ...section, id: `default-${index}` }));
}

/** Copy of the catalog default with real ids, for a new placement. */
export function defaultSections(product: CatalogProduct): UnitSection[] | undefined {
  return product.unit?.sections.map(section => ({ ...section, id: createId('sec') }));
}

function first(sections: UnitSection[], kind: UnitSectionKind): UnitSection | undefined {
  return sections.find(section => section.kind === kind);
}

/** Which air connections the sections need. Undducted dampers are hoods on the casing and need no duct. */
export function unitRoles(sections: UnitSection[]): UnitPortRole[] {
  const roles: UnitPortRole[] = [];
  const oa = first(sections, 'oa-damper');
  if (oa && oa.ducted !== false) roles.push('oa');
  if (first(sections, 'ra-damper') || first(sections, 'mixing-box')) roles.push('ra');
  const ea = first(sections, 'exhaust-damper');
  if ((ea && ea.ducted !== false) || (!ea && first(sections, 'relief-fan'))) roles.push('ea');
  if (first(sections, 'supply-fan')) roles.push('sa');
  return roles;
}

/** Connections of one placement. Units derive them from their sections; everything else uses the catalog. */
export function placedPorts(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>): CatalogPort[] {
  const product = getProduct(item.catalogId);
  if (!product) return [];
  if (!product.unit) return catalogPorts(product);
  const sections = unitSections(item);
  return unitRoles(sections).map(role => {
    const at = product.unit!.portAt[role];
    const kind = ROLE_SERVICE[role];
    return { id: at.id, service: kind.service, direction: kind.direction, ...(kind.accepts ? { accepts: kind.accepts } : {}), u: at.u, v: at.v };
  });
}

export function portRole(item: Pick<PlacedEquipment, 'catalogId'>, portId: string): UnitPortRole | null {
  const spec = getProduct(item.catalogId)?.unit;
  if (!spec) return null;
  const entry = (Object.keys(spec.portAt) as UnitPortRole[]).find(role => spec.portAt[role].id === portId);
  return entry ?? null;
}

export interface UnitFlows {
  supply: number | null;
  outdoor: number | null;
  exhaust: number | null;
  /** Air entering the return connection: supply − outdoor + exhaust. */
  return: number | null;
}

/** Design airflows at the unit connections, from the fan and damper sections. */
export function unitFlows(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>): UnitFlows {
  const sections = unitSections(item);
  const product = getProduct(item.catalogId);
  const fan = first(sections, 'supply-fan');
  const supply = fan ? (fan.flowM3s ?? product?.airflow?.valueM3s ?? null) : null;
  const outdoor = first(sections, 'oa-damper')?.flowM3s ?? null;
  const relief = first(sections, 'relief-fan')?.flowM3s ?? first(sections, 'exhaust-damper')?.flowM3s ?? null;
  const hasRecirc = !!(first(sections, 'ra-damper') || first(sections, 'mixing-box'));
  let ret: number | null = null;
  if (hasRecirc && supply != null) ret = Math.max(0, supply - (outdoor ?? 0) + (relief ?? 0));
  if (first(sections, 'heat-recovery') && relief != null) ret = relief;
  return { supply, outdoor, exhaust: relief, return: ret };
}

/** Design airflow at one connection of a placement, m³/s. */
export function portFlow(item: PlacedEquipment, portId: string): number | null {
  const product = getProduct(item.catalogId);
  if (!product) return null;
  if (product.unit) {
    const role = portRole(item, portId);
    const flows = unitFlows(item);
    if (role === 'sa') return flows.supply;
    if (role === 'oa') return flows.outdoor;
    if (role === 'ea') return flows.exhaust;
    if (role === 'ra') return flows.return;
    return null;
  }
  return designFlow(item);
}

/** Terminal, hood, or fan airflow: the placement value, else the catalog airflow. */
export function designFlow(item: Pick<PlacedEquipment, 'catalogId' | 'designFlowM3s' | 'quantity'>): number | null {
  if (item.designFlowM3s != null) return item.designFlowM3s;
  return getProduct(item.catalogId)?.airflow?.valueM3s ?? null;
}

/** One-line description of a section for lists and tooltips. */
export function sectionSummary(section: UnitSection): string {
  const bits = [SECTION_LABEL[section.kind]];
  if (section.position) bits.push(section.position);
  if (section.medium) bits.push(COIL_MEDIUM_LABEL[section.medium]);
  if (section.ducted === false) bits.push('on casing');
  return bits.join(' · ');
}
