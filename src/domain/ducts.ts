import { catalogPorts, equipmentSizeM, getProduct, isSchematicOnly } from './catalog';
import { streamFor } from './ductCatalog';
import type { DuctEnd, DuctPenetration, DuctRun, DuctService, DuctView, PlacedEquipment, Project, Room, StreamDesign, SystemKind, WallFace, WallRun } from './types';
import { formatFlow, formatLength, formatNumber } from './units';
import { roomLoop, type DrawPoint } from './wallDraw';

export function ductViewOf(run: Pick<DuctRun, 'view'> | undefined | null): DuctView {
  return run?.view === 'schematic' ? 'schematic' : 'plan';
}

export const DUCT_SERVICES: { id: DuctService; label: string }[] = [
  { id: 'supply', label: 'Supply' },
  { id: 'return', label: 'Return' },
  { id: 'exhaust', label: 'Exhaust' },
  { id: 'outdoor', label: 'Outdoor air' },
  { id: 'relief', label: 'Relief' },
];

export const DUCT_SERVICE_LABEL: Record<DuctService, string> = {
  supply: 'Supply',
  return: 'Return',
  exhaust: 'Exhaust',
  outdoor: 'Outdoor air',
  relief: 'Relief',
};

const SERVICES = new Set<string>(DUCT_SERVICES.map(item => item.id));

export function serviceForSystem(kind: SystemKind | undefined): DuctService {
  if (kind === 'kitchen-exhaust' || kind === 'restroom-exhaust') return 'exhaust';
  if (kind === 'makeup-air') return 'outdoor';
  return 'supply';
}

export function isDuctService(value: string): value is DuctService {
  return SERVICES.has(value);
}

export interface DuctDraftPoint {
  x: number;
  y: number;
  equipmentId?: string;
  portId?: string;
}

export interface DuctPortHit {
  equipmentId: string;
  portId: string;
  service: DuctService;
  x: number;
  y: number;
  z: number;
}

export interface DuctCrossing extends DuctPenetration {
  x: number;
  y: number;
}

export function ductEnd(point: DuctDraftPoint): DuctEnd {
  return point.equipmentId && point.portId
    ? { equipmentId: point.equipmentId, portId: point.portId }
    : { equipmentId: null, portId: null };
}

export function polylineLength(points: readonly { x: number; y: number }[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

export function ductSizeLabel(run: Pick<DuctRun, 'shape' | 'widthM' | 'heightM'>, units: Project['units']): string {
  if (run.shape === 'rect') return `${formatLength(run.widthM, units, 2)} × ${formatLength(run.heightM ?? run.widthM, units, 2)}`;
  return `ø ${formatLength(run.widthM, units, 2)}`;
}

export function portWorld(
  item: PlacedEquipment,
  port: { u: number; v: number },
  view: DuctView = 'plan',
): { x: number; y: number; z: number } | null {
  const product = getProduct(item.catalogId);
  if (!product) return null;
  const size = equipmentSizeM(product);
  if (view === 'schematic') {
    const origin = item.schematic;
    if (!origin) return null;
    return {
      x: origin.x + port.u * size.lengthM / 2,
      y: origin.y + port.v * size.widthM / 2,
      z: item.zM + size.heightM,
    };
  }
  if (isSchematicOnly(product)) return null;
  const rad = (item.yawDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = port.u * size.lengthM / 2;
  const ly = port.v * size.widthM / 2;
  return {
    x: item.xM + lx * c - ly * s,
    y: item.yM + lx * s + ly * c,
    z: item.zM + size.heightM,
  };
}

export function equipmentPortHits(equipment: readonly PlacedEquipment[], view: DuctView = 'plan'): DuctPortHit[] {
  const hits: DuctPortHit[] = [];
  for (const item of equipment) {
    const product = getProduct(item.catalogId);
    if (!product) continue;
    if (view === 'plan' && isSchematicOnly(product)) continue;
    if (view === 'schematic' && !item.schematic) continue;
    for (const port of catalogPorts(product)) {
      const world = portWorld(item, port, view);
      if (!world) continue;
      hits.push({ equipmentId: item.id, portId: port.id, service: port.service, ...world });
    }
  }
  return hits;
}

/** Ports with no duct run attached in the given view. */
export function openPorts(project: Project, view: DuctView = 'plan'): DuctPortHit[] {
  const used = new Set<string>();
  for (const run of project.ducts ?? []) {
    if (ductViewOf(run) !== view) continue;
    for (const end of [run.start, run.end]) if (end.equipmentId && end.portId) used.add(`${end.equipmentId}:${end.portId}`);
  }
  return equipmentPortHits(project.equipment, view).filter(hit => !used.has(`${hit.equipmentId}:${hit.portId}`));
}

export function streamDesignLabel(design: StreamDesign | undefined | null, units: Project['units']): string | null {
  if (!design) return null;
  const bits: string[] = [];
  if (design.flowM3s != null) bits.push(formatFlow(design.flowM3s, units));
  if (design.dbC != null) bits.push(`${formatNumber(design.dbC, 1)}°C DB`);
  if (design.wbC != null) bits.push(`${formatNumber(design.wbC, 1)}°C WB`);
  if (design.rh != null) bits.push(`${formatNumber(design.rh * 100, 0)}% RH`);
  return bits.length > 0 ? bits.join(' · ') : null;
}

export function portFits(project: Project, hit: DuctPortHit, systemId: string, service: DuctService): boolean {
  if (hit.service !== service) return false;
  const item = project.equipment.find(entry => entry.id === hit.equipmentId);
  const system = project.systems.find(entry => entry.id === systemId);
  if (!item || !system || !streamFor(system.kind, service)) return false;
  return !item.systemId || item.systemId === systemId;
}

export function nearestPort(
  equipment: readonly PlacedEquipment[],
  x: number,
  y: number,
  maxM: number,
  allow: (hit: DuctPortHit) => boolean = () => true,
  view: DuctView = 'plan',
): DuctPortHit | null {
  let best: DuctPortHit | null = null;
  let bestD = maxM;
  for (const hit of equipmentPortHits(equipment, view)) {
    if (!allow(hit)) continue;
    const distance = Math.hypot(hit.x - x, hit.y - y);
    if (distance <= bestD) {
      best = hit;
      bestD = distance;
    }
  }
  return best;
}

export function linkedPort(project: Project, end: DuctEnd, view: DuctView = 'plan'): DuctPortHit | null {
  if (!end.equipmentId || !end.portId) return null;
  const item = project.equipment.find(entry => entry.id === end.equipmentId);
  const product = item ? getProduct(item.catalogId) : undefined;
  const port = product ? catalogPorts(product).find(entry => entry.id === end.portId) : undefined;
  if (!item || !port) return null;
  const world = portWorld(item, port, view);
  if (!world) return null;
  return { equipmentId: item.id, portId: port.id, service: port.service, ...world };
}

export function ductElevation(project: Project, start: DuctEnd, end: DuctEnd): number {
  const linked = linkedPort(project, start) ?? linkedPort(project, end);
  return Number((linked?.z ?? 2.7).toFixed(3));
}

export function endRise(project: Project, run: DuctRun, which: 'start' | 'end'): number {
  const linked = linkedPort(project, which === 'start' ? run.start : run.end, ductViewOf(run));
  if (!linked) return 0;
  return linked.z - run.zM;
}

function segmentHit(
  a: DrawPoint,
  b: DrawPoint,
  c: DrawPoint,
  d: DrawPoint,
): { u: number; x: number; y: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 0.04 || t >= 0.96 || u <= 0.04 || u >= 0.96) return null;
  return { u, x: a.x + t * rx, y: a.y + t * ry };
}

const BOX_FACES: WallFace[] = ['ny', 'px', 'py', 'nx'];

export function ductCrossings(points: readonly DrawPoint[], rooms: readonly Room[], wallRuns: readonly WallRun[]): DuctCrossing[] {
  const hits: DuctCrossing[] = [];
  const nearWall = (x: number, y: number) => hits.some(hit => hit.wallRunId && Math.hypot(hit.x - x, hit.y - y) < 0.2);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    for (const run of wallRuns) {
      const hit = segmentHit(a, b, { x: run.x0, y: run.y0 }, { x: run.x1, y: run.y1 });
      if (!hit) continue;
      const length = Math.hypot(run.x1 - run.x0, run.y1 - run.y0);
      hits.push({ x: hit.x, y: hit.y, wallRunId: run.id, offsetM: Number((hit.u * length).toFixed(3)) });
    }
    for (const room of rooms) {
      const loop = roomLoop(room);
      const boxed = (room.outline?.length ?? 0) < 3;
      for (let edge = 0; edge < loop.length; edge += 1) {
        const c = loop[edge];
        const d = loop[(edge + 1) % loop.length];
        const hit = segmentHit(a, b, c, d);
        if (!hit || nearWall(hit.x, hit.y)) continue;
        const length = Math.hypot(d.x - c.x, d.y - c.y);
        hits.push({
          x: hit.x,
          y: hit.y,
          roomId: room.id,
          edge,
          face: boxed ? BOX_FACES[edge] : undefined,
          offsetM: Number((hit.u * length).toFixed(3)),
        });
      }
    }
  }
  return hits;
}

export function sealDuct(run: DuctRun, project: Project): DuctRun {
  if (ductViewOf(run) === 'schematic') {
    return { ...run, view: 'schematic', penetrations: [] };
  }
  const crossings = ductCrossings(run.points, project.rooms, project.wallRuns ?? []);
  return {
    ...run,
    view: run.view ?? 'plan',
    penetrations: crossings.map(({ x: _x, y: _y, ...penetration }) => penetration),
  };
}

export function samePort(point: DuctDraftPoint, hit: DuctPortHit | null): boolean {
  return !!hit && point.equipmentId === hit.equipmentId && point.portId === hit.portId;
}
