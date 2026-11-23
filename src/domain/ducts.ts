import { equipmentSizeM, getProduct, isSchematicOnly } from './catalog';
import { designFlow, placedPorts, portFlow } from './airUnits';
import { streamFor } from './ductCatalog';
import type { DuctEnd, DuctNode, DuctPenetration, DuctRun, DuctService, DuctView, PlacedEquipment, Project, Room, StreamDesign, SystemKind, WallFace, WallRun } from './types';
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
  { id: 'mixed', label: 'Mixed air' },
];

export const DUCT_SERVICE_LABEL: Record<DuctService, string> = {
  supply: 'Supply',
  return: 'Return',
  exhaust: 'Exhaust',
  outdoor: 'Outdoor air',
  relief: 'Relief',
  mixed: 'Mixed air',
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
  /** Existing junction. */
  nodeId?: string;
  /** Point on an existing run of the same stream: a tee is made there. */
  splitDuctId?: string;
}

export interface DuctPortHit {
  equipmentId: string;
  portId: string;
  service: DuctService;
  accepts?: DuctService[];
  direction: 'in' | 'out';
  x: number;
  y: number;
  z: number;
}

export interface DuctCrossing extends DuctPenetration {
  x: number;
  y: number;
}

export function ductEnd(point: DuctDraftPoint): DuctEnd {
  if (point.equipmentId && point.portId) return { equipmentId: point.equipmentId, portId: point.portId };
  if (point.nodeId) return { equipmentId: null, portId: null, nodeId: point.nodeId };
  return { equipmentId: null, portId: null };
}

export function isOpenEnd(end: DuctEnd): boolean {
  return !(end.equipmentId && end.portId) && !end.nodeId;
}

export function serviceMatches(port: { service: DuctService; accepts?: DuctService[] }, service: DuctService): boolean {
  return port.service === service || !!port.accepts?.includes(service);
}

/** Runs that end at a junction. */
export function nodeRuns(project: Project, nodeId: string): DuctRun[] {
  return (project.ducts ?? []).filter(run => run.start.nodeId === nodeId || run.end.nodeId === nodeId);
}

export function nearestNode(project: Project, x: number, y: number, maxM: number, systemId: string, service: DuctService): DuctNode | null {
  let best: DuctNode | null = null;
  let bestD = maxM;
  for (const node of project.ductNodes ?? []) {
    if (node.systemId !== systemId || node.service !== service) continue;
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance <= bestD) {
      best = node;
      bestD = distance;
    }
  }
  return best;
}

/** Closest point on a polyline, with the segment it falls on. */
export function projectOnPolyline(points: readonly { x: number; y: number }[], x: number, y: number): { x: number; y: number; segment: number; distance: number } | null {
  let best: { x: number; y: number; segment: number; distance: number } | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distance = Math.hypot(x - px, y - py);
    if (!best || distance < best.distance) best = { x: px, y: py, segment: i - 1, distance };
  }
  return best;
}

/** Nearest plan run of the same system and stream, for branching off it. */
export function nearestRun(project: Project, x: number, y: number, maxM: number, systemId: string, service: DuctService, skip?: string): { run: DuctRun; x: number; y: number; segment: number } | null {
  let best: { run: DuctRun; x: number; y: number; segment: number } | null = null;
  let bestD = maxM;
  for (const run of project.ducts ?? []) {
    if (run.id === skip || ductViewOf(run) !== 'plan' || run.systemId !== systemId || run.service !== service) continue;
    const hit = projectOnPolyline(run.points, x, y);
    if (!hit || hit.distance > bestD) continue;
    best = { run, x: hit.x, y: hit.y, segment: hit.segment };
    bestD = hit.distance;
  }
  return best;
}

/** Plan position of a run end: its port, its junction, or its own last point. */
export function endPosition(project: Project, run: DuctRun, which: 'start' | 'end'): { x: number; y: number } {
  const end = which === 'start' ? run.start : run.end;
  const linked = linkedPort(project, end, ductViewOf(run));
  if (linked) return linked;
  if (end.nodeId) {
    const node = (project.ductNodes ?? []).find(item => item.id === end.nodeId);
    if (node) return node;
  }
  return which === 'start' ? run.points[0] : run.points[run.points.length - 1];
}

/** Airway cross-section, m². */
export function ductAreaM2(run: Pick<DuctRun, 'shape' | 'widthM' | 'heightM'>): number {
  if (run.shape === 'rect') return run.widthM * (run.heightM ?? run.widthM);
  return (Math.PI * run.widthM * run.widthM) / 4;
}

export interface RunFlow {
  /** Air carried by the run, m³/s. Sum of the terminals beyond it. */
  flowM3s: number | null;
  /** True when an open end or a terminal without airflow sits beyond the run. */
  partial: boolean;
}

export interface SourcePortFlow {
  equipmentId: string;
  portId: string;
  /** Design airflow at the port from the unit or fan. */
  portM3s: number | null;
  /** Sum of the room terminals reached through the ducts from this port. */
  terminalsM3s: number;
  terminals: number;
  /** Placements of the terminals reached from this port. */
  terminalIds: string[];
  partial: boolean;
}

/** Is this placement a leaf of the air network: a diffuser, grille, louver, roof hood, or kitchen hood? Fans and units are sources. */
function leafKind(item: PlacedEquipment): 'room' | 'outdoor' | null {
  const product = getProduct(item.catalogId);
  if (!product) return null;
  if (product.terminal) return product.terminal;
  if (product.category === 'kitchen-hood') return 'room';
  return null;
}

/**
 * Airflow on every run from the terminals. Each connected network is walked from its one unit or fan port.
 * Networks with no unit or fan, or with more than one, get no flows.
 */
export function ductFlows(project: Project): { runs: Map<string, RunFlow>; sources: SourcePortFlow[] } {
  const runs = new Map<string, RunFlow>();
  const sources: SourcePortFlow[] = [];
  const byId = new Map(project.equipment.map(item => [item.id, item]));
  const key = (run: DuctRun, which: 'start' | 'end'): string => {
    const end = which === 'start' ? run.start : run.end;
    if (end.equipmentId && end.portId && byId.has(end.equipmentId)) return `e:${end.equipmentId}:${end.portId}`;
    if (end.nodeId) return `n:${end.nodeId}`;
    return `o:${run.id}:${which}`;
  };
  const adjacency = new Map<string, { run: DuctRun; other: string }[]>();
  const link = (a: string, b: string, run: DuctRun) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)!.push({ run, other: b });
  };
  for (const run of project.ducts ?? []) {
    if (ductViewOf(run) !== 'plan') continue;
    const a = key(run, 'start');
    const b = key(run, 'end');
    link(a, b, run);
    link(b, a, run);
  }
  const seen = new Set<string>();
  for (const startKey of adjacency.keys()) {
    if (seen.has(startKey)) continue;
    const component: string[] = [];
    const queue = [startKey];
    seen.add(startKey);
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        if (!seen.has(edge.other)) {
          seen.add(edge.other);
          queue.push(edge.other);
        }
      }
    }
    const roles = new Map<string, { kind: 'source' | 'room' | 'outdoor' | 'open' | 'node'; flow: number | null; item?: PlacedEquipment; portId?: string }>();
    for (const vertex of component) {
      if (vertex.startsWith('n:')) roles.set(vertex, { kind: 'node', flow: null });
      else if (vertex.startsWith('o:')) roles.set(vertex, { kind: 'open', flow: null });
      else {
        const [, equipmentId, portId] = vertex.split(':');
        const item = byId.get(equipmentId)!;
        const leaf = leafKind(item);
        if (leaf === 'room') roles.set(vertex, { kind: 'room', flow: designFlow(item), item, portId });
        else if (leaf === 'outdoor') roles.set(vertex, { kind: 'outdoor', flow: item.designFlowM3s ?? null, item, portId });
        else roles.set(vertex, { kind: 'source', flow: portFlow(item, portId), item, portId });
      }
    }
    const sourceKeys = component.filter(vertex => roles.get(vertex)?.kind === 'source');
    if (sourceKeys.length !== 1) continue;
    const root = sourceKeys[0];
    const rootRole = roles.get(root)!;
    const outdoorOpen = component.filter(vertex => roles.get(vertex)?.kind === 'outdoor' && roles.get(vertex)!.flow == null);
    const roomCount = component.filter(vertex => roles.get(vertex)?.kind === 'room').length;
    if (outdoorOpen.length > 0 && roomCount === 0 && rootRole.flow != null) {
      for (const vertex of outdoorOpen) roles.get(vertex)!.flow = rootRole.flow / outdoorOpen.length;
    }
    const visited = new Set<string>([root]);
    const reached: string[] = [];
    const walk = (vertex: string): { flow: number; partial: boolean; terminals: number } => {
      const role = roles.get(vertex)!;
      let flow = 0;
      let partial = false;
      let terminals = 0;
      if (role.kind === 'room' || role.kind === 'outdoor') {
        if (role.flow == null) partial = true;
        else flow += role.flow;
        terminals += 1;
        if (role.item) reached.push(role.item.id);
      }
      if (role.kind === 'open') partial = true;
      for (const edge of adjacency.get(vertex) ?? []) {
        if (visited.has(edge.other)) continue;
        visited.add(edge.other);
        const below = walk(edge.other);
        runs.set(edge.run.id, { flowM3s: below.flow > 0 ? below.flow : below.partial ? null : 0, partial: below.partial });
        flow += below.flow;
        partial = partial || below.partial;
        terminals += below.terminals;
      }
      return { flow, partial, terminals };
    };
    const total = walk(root);
    sources.push({
      equipmentId: rootRole.item!.id,
      portId: rootRole.portId!,
      portM3s: rootRole.flow,
      terminalsM3s: total.flow,
      terminals: total.terminals,
      terminalIds: reached,
      partial: total.partial,
    });
  }
  return { runs, sources };
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
    for (const port of placedPorts(item)) {
      const world = portWorld(item, port, view);
      if (!world) continue;
      hits.push({ equipmentId: item.id, portId: port.id, service: port.service, accepts: port.accepts, direction: port.direction, ...world });
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
  if (!serviceMatches(hit, service)) return false;
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
  const port = item ? placedPorts(item).find(entry => entry.id === end.portId) : undefined;
  if (!item || !port) return null;
  const world = portWorld(item, port, view);
  if (!world) return null;
  return { equipmentId: item.id, portId: port.id, service: port.service, accepts: port.accepts, direction: port.direction, ...world };
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
