import { getProduct } from './catalog';
import { placedPorts } from './airUnits';
import { getDuctProduct } from './ductCatalog';
import { portWorld } from './ducts';
import { createId } from './ids';
import { addDuct, buildPlacement, roomAtPoint } from './projectOps';
import type { DuctNode, DuctService, DuctShape, PlacedEquipment, Project, StreamDesign, SystemKind, UnitSection } from './types';

export interface PackageMember {
  key: string;
  catalogId: string;
  /** Offset from the plan drop point, meters. */
  planOffset: { xM: number; yM: number };
  yawDeg?: number;
  notes?: string;
  /** Terminal, hood, or fan design airflow, CFM. */
  designCfm?: number;
  /** Replaces the catalog default sections of a unit. */
  sections?: Omit<UnitSection, 'id'>[];
}

/** Junction offset from the drop point, meters. */
export interface PackageNode {
  key: string;
  service: DuctService;
  x: number;
  y: number;
}

export type PackageRef = { member: string; portId: string } | { node: string } | { x: number; y: number };

export interface PackageDuct {
  catalogId: string;
  service: DuctService;
  shape: DuctShape;
  /** Round diameter or rectangular width, inches. */
  widthIn: number;
  /** Rectangular height, inches. */
  heightIn?: number;
  from: PackageRef;
  to: PackageRef;
  /** Bends between the ends, offsets from the drop point, meters. */
  via?: { x: number; y: number }[];
  streamDesign?: StreamDesign;
}

export interface SystemPackage {
  id: string;
  name: string;
  description: string;
  systemKind: SystemKind;
  systemName: string;
  notes: string;
  members: PackageMember[];
  nodes: PackageNode[];
  ducts: PackageDuct[];
}

const INCH = 0.0254;
const CFM = 0.0004719474432;

function round(service: DuctService, widthIn: number, from: PackageRef, to: PackageRef, via?: { x: number; y: number }[]): PackageDuct {
  return { catalogId: 'esm-sw-round', service, shape: 'round', widthIn, from, to, via };
}

function rect(service: DuctService, widthIn: number, heightIn: number, from: PackageRef, to: PackageRef, via?: { x: number; y: number }[]): PackageDuct {
  return { catalogId: 'smacna-rect-galv', service, shape: 'rect', widthIn, heightIn, from, to, via };
}

const port = (member: string, portId: string): PackageRef => ({ member, portId });
const node = (key: string): PackageRef => ({ node: key });

/**
 * Packaged rooftop over the space it serves. 3,750 CFM supply trunk with three tees feeding six diffusers,
 * and a 3,000 CFM return main to three grilles. Trunk sizes step down at each tee to hold about 1,200–1,450 fpm.
 */
export const RTU_DUCTED: SystemPackage = {
  id: 'rtu-ducted',
  name: 'Rooftop unit, ducted supply and return',
  description: '12.5 ton RTU with economizer. Supply trunk → 3 tees → 6 ceiling diffusers; return main → 3 grilles. Drop it over the space it serves.',
  systemKind: 'comfort',
  systemName: 'Rooftop comfort',
  notes: 'Economizer hood and barometric relief are on the unit. Supply is 3,750 CFM; return is supply less minimum outdoor air. Terminal airflows are planning values.',
  members: [
    { key: 'rtu', catalogId: 'rtu-12', planOffset: { xM: 0, yM: 0 } },
    { key: 'd1a', catalogId: 'diff-sq-24', planOffset: { xM: 2.3, yM: 2.0 }, designCfm: 625 },
    { key: 'd1b', catalogId: 'diff-sq-24', planOffset: { xM: 2.3, yM: -2.0 }, designCfm: 625 },
    { key: 'd2a', catalogId: 'diff-sq-24', planOffset: { xM: 4.5, yM: 2.0 }, designCfm: 625 },
    { key: 'd2b', catalogId: 'diff-sq-24', planOffset: { xM: 4.5, yM: -2.0 }, designCfm: 625 },
    { key: 'd3a', catalogId: 'diff-sq-24', planOffset: { xM: 6.7, yM: 2.0 }, designCfm: 625 },
    { key: 'd3b', catalogId: 'diff-sq-24', planOffset: { xM: 6.7, yM: -2.0 }, designCfm: 625 },
    { key: 'r1a', catalogId: 'grille-ret-24', planOffset: { xM: -2.3, yM: 2.0 }, designCfm: 1000 },
    { key: 'r1b', catalogId: 'grille-ret-24', planOffset: { xM: -2.3, yM: -2.0 }, designCfm: 1000 },
    { key: 'r2', catalogId: 'grille-ret-24', planOffset: { xM: -3.8, yM: 0 }, designCfm: 1000 },
  ],
  nodes: [
    { key: 's1', service: 'supply', x: 2.3, y: 0 },
    { key: 's2', service: 'supply', x: 4.5, y: 0 },
    { key: 's3', service: 'supply', x: 6.7, y: 0 },
    { key: 'r1', service: 'return', x: -2.3, y: 0 },
  ],
  ducts: [
    round('supply', 22, port('rtu', 'supply'), node('s1')),
    round('supply', 18, node('s1'), node('s2')),
    round('supply', 14, node('s2'), node('s3')),
    round('supply', 10, node('s1'), port('d1a', 'neck')),
    round('supply', 10, node('s1'), port('d1b', 'neck')),
    round('supply', 10, node('s2'), port('d2a', 'neck')),
    round('supply', 10, node('s2'), port('d2b', 'neck')),
    round('supply', 10, node('s3'), port('d3a', 'neck')),
    round('supply', 10, node('s3'), port('d3b', 'neck')),
    round('return', 20, port('rtu', 'return'), node('r1')),
    round('return', 14, node('r1'), port('r1a', 'collar')),
    round('return', 14, node('r1'), port('r1b', 'collar')),
    round('return', 14, node('r1'), port('r2', 'collar')),
  ],
};

/**
 * Indoor AHU from a process diagram: 5,000 CFM fresh air (NC), evacuation fan and NC exhaust damper,
 * 25,000 CFM return through an NO damper, 30,000 CFM supply fan, CO₂ DX cooling coil, 50% propylene glycol heating coil.
 * Distribution mains leave as open stubs to route to the zones.
 */
export const AHU_ECONOMIZER: SystemPackage = {
  id: 'ahu-economizer-co2-glycol',
  name: 'AHU, economizer with exhaust fan, CO₂ cooling, glycol heating',
  description: '30,000 CFM mixed-air AHU: OA louver → NC damper; return → NO damper; evacuation fan → NC damper → exhaust louver; CO₂ DX coil and glycol coil. Supply and return mains end as stubs to route.',
  systemKind: 'comfort',
  systemName: 'AHU-1',
  notes: 'Fresh air 5,000 CFM at 93 °F DB / 73 °F WB summer, -20 °F winter. Return 25,000 CFM at 50 °F / 60% RH. Cooling coil leaving 33.0 °F DB; heating coil leaving 53.7 °F DB in winter. Sensors and valves are listed on the sections until controls are modeled.',
  members: [
    { key: 'ahu', catalogId: 'ahu-csaa-66', planOffset: { xM: 0, yM: 0 } },
    { key: 'oaLouver', catalogId: 'louver-oa', planOffset: { xM: -7.5, yM: 1.0 }, yawDeg: 90, designCfm: 5000 },
    { key: 'eaLouver', catalogId: 'louver-ea', planOffset: { xM: -7.5, yM: -1.0 }, yawDeg: 90 },
  ],
  nodes: [],
  ducts: [
    rect('outdoor', 30, 24, port('oaLouver', 'collar'), port('ahu', 'oa')),
    rect('exhaust', 30, 24, port('ahu', 'ea'), port('eaLouver', 'collar'), [{ x: -6.2, y: 0 }, { x: -6.2, y: -1.0 }]),
    rect('return', 72, 30, { x: -5.6, y: -4.0 }, port('ahu', 'ra'), [{ x: -5.6, y: -1.005 }]),
    rect('supply', 72, 36, port('ahu', 'sa'), { x: 8.5, y: 0 }),
  ],
};

export const SYSTEM_PACKAGES: SystemPackage[] = [RTU_DUCTED, AHU_ECONOMIZER];

const BY_ID = new Map(SYSTEM_PACKAGES.map(item => [item.id, item]));

export function getSystemPackage(id: string): SystemPackage | undefined {
  return BY_ID.get(id);
}

function memberPortPoint(item: PlacedEquipment, portId: string): { x: number; y: number; equipmentId: string; portId: string } | null {
  const found = placedPorts(item).find(entry => entry.id === portId);
  if (!found) return null;
  const world = portWorld(item, found, 'plan');
  if (!world) return null;
  return { x: world.x, y: world.y, equipmentId: item.id, portId: found.id };
}

/** Drop a pre-wired system onto the plan: the system, its unit and terminals, junctions, and sized ducts. */
export function applySystemPackage(project: Project, packageId: string, drop: { xM: number; yM: number }): Project {
  const pack = getSystemPackage(packageId);
  if (!pack) return project;
  const systemId = createId('sys');
  const byKey = new Map<string, PlacedEquipment>();
  const equipment: PlacedEquipment[] = [];
  for (const member of pack.members) {
    const product = getProduct(member.catalogId);
    if (!product) continue;
    const plan = { xM: drop.xM + member.planOffset.xM, yM: drop.yM + member.planOffset.yM };
    const item = buildPlacement(product, roomAtPoint(project.rooms, plan.xM, plan.yM), plan, null);
    item.systemId = systemId;
    item.yawDeg = member.yawDeg ?? 0;
    item.notes = member.notes ?? '';
    item.assumption = true;
    if (member.designCfm != null) item.designFlowM3s = member.designCfm * CFM;
    if (member.sections) item.sections = member.sections.map(section => ({ ...section, id: createId('sec') }));
    byKey.set(member.key, item);
    equipment.push(item);
  }
  const nodes = new Map<string, DuctNode>();
  for (const entry of pack.nodes) {
    nodes.set(entry.key, { id: createId('node'), systemId, service: entry.service, x: drop.xM + entry.x, y: drop.yM + entry.y });
  }
  let next: Project = {
    ...project,
    systems: [...project.systems, { id: systemId, name: pack.systemName, kind: pack.systemKind, notes: pack.notes }],
    equipment: [...project.equipment, ...equipment],
    ductNodes: [...(project.ductNodes ?? []), ...nodes.values()],
  };
  const resolve = (ref: PackageRef): { x: number; y: number; equipmentId?: string; portId?: string; nodeId?: string } | null => {
    if ('node' in ref) {
      const found = nodes.get(ref.node);
      return found ? { x: found.x, y: found.y, nodeId: found.id } : null;
    }
    if ('member' in ref) {
      const item = byKey.get(ref.member);
      return item ? memberPortPoint(item, ref.portId) : null;
    }
    return { x: drop.xM + ref.x, y: drop.yM + ref.y };
  };
  for (const duct of pack.ducts) {
    const start = resolve(duct.from);
    const end = resolve(duct.to);
    if (!start || !end) continue;
    const via = (duct.via ?? []).map(point => ({ x: drop.xM + point.x, y: drop.yM + point.y }));
    const product = getDuctProduct(duct.catalogId);
    const size = product?.sizes?.find(entry => entry.id === String(duct.widthIn));
    next = addDuct(next, {
      catalogId: duct.catalogId,
      systemId,
      service: duct.service,
      shape: duct.shape,
      widthM: size?.widthM ?? duct.widthIn * INCH,
      heightM: duct.heightIn != null ? duct.heightIn * INCH : null,
      points: [start, ...via, end],
      view: 'plan',
      streamDesign: duct.streamDesign,
    });
  }
  return next;
}
