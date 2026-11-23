import { catalogPorts, getProduct } from './catalog';
import { createId } from './ids';
import { addDuct, buildPlacement } from './projectOps';
import { portWorld } from './ducts';
import type { DuctService, DuctShape, PlacedEquipment, Project, StreamDesign, SystemKind } from './types';

export interface PackageMember {
  key: string;
  catalogId: string;
  /** Offset from the plan drop point, meters. */
  planOffset: { xM: number; yM: number };
  notes?: string;
}

export interface PackageDuctEnd {
  member: string;
  portId: string;
}

export interface PackageDuct {
  catalogId: string;
  service: DuctService;
  shape: DuctShape;
  widthM: number;
  heightM: number | null;
  /** Port end, or a free plan point offset from the drop, meters. */
  from: PackageDuctEnd | { x: number; y: number };
  to: PackageDuctEnd | { x: number; y: number };
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
  ducts: PackageDuct[];
}

const CFM = 0.0004719474432;

function design(flowCfm: number, dbC: number, wbC: number | null, rh: number | null): StreamDesign {
  return { flowM3s: flowCfm * CFM, dbC, wbC, rh };
}

/** Mixed-air AHU laid out on the plan, left to right from the drop point. */
export const AHU_MIXED_AIR: SystemPackage = {
  id: 'ahu-mixed-air',
  name: 'Mixed-air AHU',
  description: 'OA damper → mix → filter → supply fan → cooling coil → heating coil → SA, with RA and relief paths. Drop it on the plan and adjust the layout there.',
  systemKind: 'comfort',
  systemName: 'Mixed-air AHU',
  notes: 'Air path is drawn on the plan. Adjust inlets, outlets, and stream labels. ThermoNode solve is not wired yet.',
  members: [
    { key: 'oaDamper', catalogId: 'damper-oa', planOffset: { xM: -4, yM: 2.6 } },
    { key: 'raDamper', catalogId: 'damper-ra', planOffset: { xM: -4, yM: 1.2 } },
    { key: 'mix', catalogId: 'mix-plenum', planOffset: { xM: -2.6, yM: 2.6 } },
    { key: 'filter', catalogId: 'filter-panel', planOffset: { xM: -1.3, yM: 2.6 } },
    { key: 'fan', catalogId: 'fan-supply', planOffset: { xM: 0, yM: 2.6 } },
    { key: 'cool', catalogId: 'coil-cool', planOffset: { xM: 1.3, yM: 2.6 } },
    { key: 'heat', catalogId: 'coil-heat', planOffset: { xM: 2.6, yM: 2.6 } },
    { key: 'saSensor', catalogId: 'sensor-air', planOffset: { xM: 3.9, yM: 2.6 } },
    { key: 'relief', catalogId: 'damper-relief', planOffset: { xM: -2.6, yM: 3.7 } },
    { key: 'rtu', catalogId: 'rtu-12', planOffset: { xM: 0, yM: 0 }, notes: 'Plan footprint for the packaged unit.' },
  ],
  ducts: [
    {
      catalogId: 'esm-sw-round',
      service: 'outdoor',
      shape: 'round',
      widthM: 0.3048,
      heightM: null,
      from: { x: -5.2, y: 2.6 },
      to: { member: 'oaDamper', portId: 'in' },
      streamDesign: design(600, 35, 24, null),
    },
    {
      catalogId: 'esm-sw-round',
      service: 'outdoor',
      shape: 'round',
      widthM: 0.3048,
      heightM: null,
      from: { member: 'oaDamper', portId: 'out' },
      to: { member: 'mix', portId: 'oa' },
    },
    {
      catalogId: 'esm-sw-round',
      service: 'return',
      shape: 'round',
      widthM: 0.3556,
      heightM: null,
      from: { x: -5.2, y: 1.2 },
      to: { member: 'raDamper', portId: 'in' },
      streamDesign: design(1400, 24, null, 0.5),
    },
    {
      catalogId: 'esm-sw-round',
      service: 'return',
      shape: 'round',
      widthM: 0.3556,
      heightM: null,
      from: { member: 'raDamper', portId: 'out' },
      to: { member: 'mix', portId: 'ra' },
    },
    {
      catalogId: 'esm-sw-round',
      service: 'supply',
      shape: 'round',
      widthM: 0.4064,
      heightM: null,
      from: { member: 'mix', portId: 'out' },
      to: { member: 'filter', portId: 'in' },
      streamDesign: design(2000, 27, 20, null),
    },
    {
      catalogId: 'esm-sw-round',
      service: 'supply',
      shape: 'round',
      widthM: 0.4064,
      heightM: null,
      from: { member: 'filter', portId: 'out' },
      to: { member: 'fan', portId: 'in' },
    },
    {
      catalogId: 'esm-sw-round',
      service: 'supply',
      shape: 'round',
      widthM: 0.4064,
      heightM: null,
      from: { member: 'fan', portId: 'out' },
      to: { member: 'cool', portId: 'in' },
    },
    {
      catalogId: 'esm-sw-round',
      service: 'supply',
      shape: 'round',
      widthM: 0.4064,
      heightM: null,
      from: { member: 'cool', portId: 'out' },
      to: { member: 'heat', portId: 'in' },
      streamDesign: design(2000, 13, 12, null),
    },
    {
      catalogId: 'esm-sw-round',
      service: 'supply',
      shape: 'round',
      widthM: 0.4064,
      heightM: null,
      from: { member: 'heat', portId: 'out' },
      to: { member: 'saSensor', portId: 'in' },
    },
    {
      catalogId: 'esm-sw-round',
      service: 'supply',
      shape: 'round',
      widthM: 0.4064,
      heightM: null,
      from: { member: 'saSensor', portId: 'out' },
      to: { x: 5.2, y: 2.6 },
      streamDesign: design(2000, 15, null, null),
    },
    {
      catalogId: 'esm-sw-round',
      service: 'relief',
      shape: 'round',
      widthM: 0.3048,
      heightM: null,
      from: { x: -3.8, y: 3.7 },
      to: { member: 'relief', portId: 'in' },
      streamDesign: design(400, 27, null, null),
    },
    {
      catalogId: 'esm-sw-round',
      service: 'relief',
      shape: 'round',
      widthM: 0.3048,
      heightM: null,
      from: { member: 'relief', portId: 'out' },
      to: { x: -1.4, y: 3.7 },
    },
  ],
};

export const SYSTEM_PACKAGES: SystemPackage[] = [AHU_MIXED_AIR];

const BY_ID = new Map(SYSTEM_PACKAGES.map(item => [item.id, item]));

export function getSystemPackage(id: string): SystemPackage | undefined {
  return BY_ID.get(id);
}

function memberPortPoint(
  item: PlacedEquipment,
  portId: string,
): { x: number; y: number; equipmentId: string; portId: string } | null {
  const product = getProduct(item.catalogId);
  const port = product ? catalogPorts(product).find(entry => entry.id === portId) : undefined;
  if (!product || !port) return null;
  const world = portWorld(item, port, 'plan');
  if (!world) return null;
  return { x: world.x, y: world.y, equipmentId: item.id, portId: port.id };
}

/** Drop a pre-wired system package onto the plan. Creates the system, equipment, and plan ducts. */
export function applySystemPackage(
  project: Project,
  packageId: string,
  drop: { xM: number; yM: number },
): Project {
  const pack = getSystemPackage(packageId);
  if (!pack) return project;
  const systemId = createId('sys');
  const system = {
    id: systemId,
    name: pack.systemName,
    kind: pack.systemKind,
    notes: pack.notes,
  };
  const byKey = new Map<string, PlacedEquipment>();
  const equipment: PlacedEquipment[] = [];
  for (const member of pack.members) {
    const product = getProduct(member.catalogId);
    if (!product) continue;
    const plan = { xM: drop.xM + member.planOffset.xM, yM: drop.yM + member.planOffset.yM };
    const room =
      project.rooms.find(
        entry =>
          plan.xM >= entry.xM &&
          plan.xM <= entry.xM + entry.lengthM &&
          plan.yM >= entry.yM &&
          plan.yM <= entry.yM + entry.widthM,
      ) ?? null;
    const item = buildPlacement(product, room, plan, null);
    item.systemId = systemId;
    item.notes = member.notes ?? '';
    item.assumption = true;
    byKey.set(member.key, item);
    equipment.push(item);
  }
  let next: Project = {
    ...project,
    systems: [...project.systems, system],
    equipment: [...project.equipment, ...equipment],
  };
  const resolveEnd = (
    end: PackageDuct['from'],
  ): { x: number; y: number; equipmentId?: string; portId?: string } | null => {
    if ('x' in end) return { x: drop.xM + end.x, y: drop.yM + end.y };
    const item = byKey.get(end.member);
    if (!item) return null;
    return memberPortPoint(item, end.portId);
  };
  for (const duct of pack.ducts) {
    const start = resolveEnd(duct.from);
    const end = resolveEnd(duct.to);
    if (!start || !end) continue;
    next = addDuct(next, {
      catalogId: duct.catalogId,
      systemId,
      service: duct.service,
      shape: duct.shape,
      widthM: duct.widthM,
      heightM: duct.heightM,
      points: [start, end],
      view: 'plan',
      streamDesign: duct.streamDesign,
    });
  }
  return next;
}
