import { normalizeSite } from './climate';
import { assemblyFamily, builtinAssembly, cloneLayers } from './constructionLibrary';
import { defaultAssemblyId } from './envelopeDefaults';
import { spaceUseFill } from './spaceUses';
import type { ControlPoint, DuctNode, DuctRun, LoadItem, PlantLoop, Project, Room, SurfaceAssignment, WallFace } from './types';

export const WALL_FACE_IDS: WallFace[] = ['px', 'nx', 'py', 'ny'];

/** Wall kinds in the catalogue (drag to paint a wall) and the Kind picker. Each paints its component. */
export const WALL_TYPES: { id: string; label: string; detail: string; assemblyId: string }[] = [
  { id: 'exterior', label: 'Exterior wall', detail: 'Brick veneer on steel studs, for offices, dining rooms, retail, and schools.', assemblyId: 'asm-wall-dining' },
  { id: 'kitchen', label: 'Masonry wall', detail: 'Concrete block with continuous insulation, for kitchens, back of house, service areas, and warehouses.', assemblyId: 'asm-wall-kitchen' },
  { id: 'metal-building', label: 'Metal building wall', detail: 'Pre-engineered metal wall, for factories, warehouses, and workshops.', assemblyId: 'asm-wall-metal-building' },
  { id: 'partition', label: 'Partition', detail: 'Gypsum on both sides. Use this where the wall is shared with another space.', assemblyId: 'asm-wall-partition' },
  { id: 'walk-in', label: 'Walk-in panel', detail: 'Cooler panel. Metal skins are not a separate layer.', assemblyId: 'asm-wall-walkin' },
  { id: 'freezer', label: 'Freezer panel', detail: 'Freezer panel. Swap this onto a walk-in when the box is a freezer.', assemblyId: 'asm-wall-walkin-freezer' },
  { id: 'glass', label: 'Glass wall', detail: 'Storefront or curtain wall using the published window U-0.32. Not a tested curtain wall.', assemblyId: 'asm-wall-glass' },
];

/** The wall kind a component belongs to: its own kind, else the kind of its envelope class. Empty when none fits. */
export function wallKindFor(constructionId: string | null | undefined): string {
  if (!constructionId) return '';
  const exact = WALL_TYPES.find(type => type.assemblyId === constructionId);
  if (exact) return exact.id;
  const family = assemblyFamily(constructionId);
  if (!family) return '';
  return WALL_TYPES.find(type => assemblyFamily(type.assemblyId) === family || (family === 'wood-framed' && type.id === 'exterior'))?.id ?? '';
}

/** Plan position of each face. Top of the plan is +Y. For geometry only: users see wallName(). */
export const PLAN_SIDES: Record<WallFace, { title: string; edge: 'top' | 'left' | 'right' | 'bottom' }> = {
  py: { title: 'Top', edge: 'top' },
  nx: { title: 'Left', edge: 'left' },
  px: { title: 'Right', edge: 'right' },
  ny: { title: 'Bottom', edge: 'bottom' },
};

/** Plan fill for a room, from its use (src/domain/spaceUses.ts). */
export function roomFill(use: string): string {
  return spaceUseFill(use);
}

/** Shared by the plan and the 3D view. */
export const MARK_COLOR = {
  door: '#6b5344',
  window: '#7eb0c4',
  opening: '#8aa0ae',
  equipment: '#1f4e5f',
} as const;

export function colorNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Plan and 3D colour of a wall, by envelope class. The two walk-in panels keep their own blues. */
export function wallColor(constructionId: string | null | undefined): string {
  if (!constructionId) return '#c47b12';
  if (constructionId === 'asm-wall-walkin') return '#3d6f9a';
  if (constructionId === 'asm-wall-walkin-freezer') return '#2c4d78';
  const family = assemblyFamily(constructionId);
  if (family === 'steel-framed' || family === 'wood-framed') return '#8a5a3a';
  if (family === 'mass') return '#6d4c38';
  if (family === 'metal-building') return '#6b7a34';
  if (family === 'partition') return '#8aa0a8';
  if (family === 'wall-panel') return '#3d6f9a';
  if (family === 'glazed') return '#3f8fbf';
  return '#60707a';
}

export const INTERFACE_COLOR = '#5c6d78';

export function portionFill(constructionId: string | null | undefined, kind: 'interface' | 'outside'): string {
  if (constructionId) return wallColor(constructionId);
  return kind === 'interface' ? INTERFACE_COLOR : wallColor(null);
}

/** Color for an interface that has its own stack. Null means the stretch is still unassigned. */
export function interfaceConstructionColor(assignment: SurfaceAssignment | undefined): string | null {
  if (!assignment?.constructionId && !(assignment?.layers && assignment.layers.length > 0)) return null;
  if (!assignment.constructionId) return '#60707a';
  return wallColor(assignment.constructionId);
}

const TOUCH_M = 0.08;
const PLANNING_NOTE =
  'Planning default from the construction library. The stack is copied onto this surface. Confirm the climate zone and the tested assembly before design use.';

export function wallRoleLabel(constructionId: string | null | undefined): string {
  if (!constructionId) return 'Unassigned';
  return WALL_TYPES.find(type => type.id === wallKindFor(constructionId))?.label ?? 'Custom';
}

export function blankWallAssignment(note: string): SurfaceAssignment {
  return { materialKey: null, constructionId: null, layers: [], note };
}

export function cloneWallAssignment(surface: SurfaceAssignment): SurfaceAssignment {
  return { ...surface, layers: surface.layers ? cloneLayers(surface.layers) : undefined };
}

function isAssignment(value: unknown): value is SurfaceAssignment {
  return !!value && typeof value === 'object' && 'materialKey' in value && 'note' in value;
}

/** Copies a pre-stack single wall onto every face. A saved project keeps that one choice until a face is edited. */
export function normalizeWalls(value: unknown, emptyNote: string): Record<WallFace, SurfaceAssignment> {
  if (value && typeof value === 'object') {
    const record = value as Partial<Record<WallFace, unknown>>;
    if (WALL_FACE_IDS.every(face => isAssignment(record[face]))) {
      return {
        px: cloneWallAssignment(record.px as SurfaceAssignment),
        nx: cloneWallAssignment(record.nx as SurfaceAssignment),
        py: cloneWallAssignment(record.py as SurfaceAssignment),
        ny: cloneWallAssignment(record.ny as SurfaceAssignment),
      };
    }
  }
  const shared = isAssignment(value) ? value : blankWallAssignment(emptyNote);
  return {
    px: cloneWallAssignment(shared),
    nx: cloneWallAssignment(shared),
    py: cloneWallAssignment(shared),
    ny: cloneWallAssignment(shared),
  };
}

export function repeatedWalls(assemblyId: string): Record<WallFace, SurfaceAssignment> {
  return {
    px: wallFromAssembly(assemblyId),
    nx: wallFromAssembly(assemblyId),
    py: wallFromAssembly(assemblyId),
    ny: wallFromAssembly(assemblyId),
  };
}

export function wallFromAssembly(assemblyId: string): SurfaceAssignment {
  const assembly = builtinAssembly(assemblyId);
  if (!assembly) throw new Error(`Unknown assembly ${assemblyId}`);
  return { materialKey: null, constructionId: assembly.id, layers: cloneLayers(assembly.layers), note: PLANNING_NOTE };
}

function exteriorAssemblyId(use: string): string {
  return defaultAssemblyId(use, 'wall');
}

function sharedAssemblyId(use: string): string {
  return defaultAssemblyId(use, 'shared');
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** A gap this small snaps so the facing edges become one interface. */
export const SPACE_SNAP_M = 0.3;

type SpaceBox = {
  xM: number;
  yM: number;
  lengthM: number;
  widthM: number;
  zM: number;
  heightM: number;
  outline?: readonly { x: number; y: number }[] | null;
};

type SnapEdge = {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
  outward: 1 | -1;
};

function loopOf(space: SpaceBox): { x: number; y: number }[] {
  if (space.outline && space.outline.length >= 3) return [...space.outline];
  return [
    { x: space.xM, y: space.yM },
    { x: space.xM + space.lengthM, y: space.yM },
    { x: space.xM + space.lengthM, y: space.yM + space.widthM },
    { x: space.xM, y: space.yM + space.widthM },
  ];
}

function axisEdges(space: SpaceBox): SnapEdge[] {
  const loop = loopOf(space);
  let area = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    area += a.x * b.y - b.x * a.y;
  }
  const ccw = area >= 0;
  const edges: SnapEdge[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) > 1e-6) {
      const up = dy > 0;
      edges.push({ axis: 'x', at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y), outward: (ccw ? up : !up) ? 1 : -1 });
    } else if (Math.abs(dy) < 1e-6 && Math.abs(dx) > 1e-6) {
      const right = dx > 0;
      edges.push({ axis: 'y', at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x), outward: (ccw ? !right : right) ? 1 : -1 });
    }
  }
  return edges;
}

function facingEdges(space: SpaceBox, rooms: readonly Room[], exclude: readonly string[]): SnapEdge[] {
  const edges: SnapEdge[] = [];
  for (const room of rooms) {
    if (exclude.includes(room.id)) continue;
    if (overlap(space.zM, space.zM + space.heightM, room.zM, room.zM + room.heightM) <= TOUCH_M) continue;
    edges.push(...axisEdges(room));
  }
  return edges;
}

function bestShift(moving: readonly SnapEdge[], others: readonly SnapEdge[], axis: 'x' | 'y'): number {
  let shift = 0;
  let best = SPACE_SNAP_M;
  for (const edge of moving) {
    if (edge.axis !== axis) continue;
    for (const other of others) {
      if (other.axis !== axis || other.outward === edge.outward) continue;
      const gap = other.at - edge.at;
      const abs = Math.abs(gap);
      if (abs >= best || abs < 1e-6) continue;
      if (overlap(edge.from, edge.to, other.from, other.to) <= TOUCH_M) continue;
      shift = gap;
      best = abs;
    }
  }
  return shift;
}

/** Move a space so a nearby facing wall lands on the neighbor and becomes one interface. */
export function snapSpaceDelta(space: SpaceBox, rooms: readonly Room[], excludeId?: string): { dx: number; dy: number } {
  const moving = axisEdges(space);
  const others = facingEdges(space, rooms, excludeId ? [excludeId] : []);
  return { dx: bestShift(moving, others, 'x'), dy: bestShift(moving, others, 'y') };
}

/** Pull a new corner onto a wall the pointer is already alongside. */
export function snapPointToWalls(x: number, y: number, rooms: readonly Room[], zM = 0, heightM = 3.05): { x: number; y: number } {
  const others = facingEdges({ xM: x, yM: y, lengthM: 0, widthM: 0, zM, heightM }, rooms, []);
  let dx = 0;
  let dy = 0;
  let bestX = SPACE_SNAP_M;
  let bestY = SPACE_SNAP_M;
  for (const edge of others) {
    if (edge.axis === 'x') {
      const gap = edge.at - x;
      const abs = Math.abs(gap);
      if (abs < bestX && y >= edge.from - TOUCH_M && y <= edge.to + TOUCH_M) {
        bestX = abs;
        dx = gap;
      }
    } else {
      const gap = edge.at - y;
      const abs = Math.abs(gap);
      if (abs < bestY && x >= edge.from - TOUCH_M && x <= edge.to + TOUCH_M) {
        bestY = abs;
        dy = gap;
      }
    }
  }
  return { x: x + dx, y: y + dy };
}

export function snapDrawnRect(
  anchorX: number,
  anchorY: number,
  cursorX: number,
  cursorY: number,
  rooms: readonly Room[],
  zM = 0,
  heightM = 3.05,
): { xM: number; yM: number; lengthM: number; widthM: number } {
  const y0 = Math.min(anchorY, cursorY);
  const y1 = Math.max(anchorY, cursorY);
  const x0 = Math.min(anchorX, cursorX);
  const x1 = Math.max(anchorX, cursorX);
  const moving: SnapEdge[] = [
    { axis: 'x', at: cursorX, from: y0, to: y1, outward: cursorX >= anchorX ? 1 : -1 },
    { axis: 'y', at: cursorY, from: x0, to: x1, outward: cursorY >= anchorY ? 1 : -1 },
  ];
  const others = facingEdges({ xM: anchorX, yM: anchorY, lengthM: 0, widthM: 0, zM, heightM }, rooms, []);
  const x = cursorX + bestShift(moving, others, 'x');
  const y = cursorY + bestShift(moving, others, 'y');
  return { xM: Math.min(anchorX, x), yM: Math.min(anchorY, y), lengthM: Math.abs(x - anchorX), widthM: Math.abs(y - anchorY) };
}

/** Snap one dragged wall onto a facing wall of a space that is not moving with it. */
export function snapWallEdge(
  face: WallFace,
  edge: number,
  along0: number,
  along1: number,
  host: { zM: number; heightM: number },
  rooms: readonly Room[],
  excludeIds: readonly string[],
): number {
  const axis = face === 'px' || face === 'nx' ? 'x' : 'y';
  const moving: SnapEdge[] = [
    {
      axis,
      at: edge,
      from: Math.min(along0, along1),
      to: Math.max(along0, along1),
      outward: face === 'px' || face === 'py' ? 1 : -1,
    },
  ];
  const others = facingEdges({ xM: 0, yM: 0, lengthM: 0, widthM: 0, zM: host.zM, heightM: host.heightM }, rooms, excludeIds);
  return edge + bestShift(moving, others, axis);
}

function wallLength(room: Room, face: WallFace): number {
  return face === 'px' || face === 'nx' ? room.widthM : room.lengthM;
}

function touchInterval(room: Room, face: WallFace, other: Room): [number, number] {
  if (face === 'px' || face === 'nx') {
    return [Math.max(room.yM, other.yM) - room.yM, Math.min(room.yM + room.widthM, other.yM + other.widthM) - room.yM];
  }
  return [Math.max(room.xM, other.xM) - room.xM, Math.min(room.xM + room.lengthM, other.xM + other.lengthM) - room.xM];
}

export type WallPortion = {
  startM: number;
  endM: number;
  kind: 'interface' | 'outside';
  names: string[];
  roomIds: string[];
  anchors: string[];
};

type EdgePoint = { x: number; y: number };

function faceSegment(room: Room, face: WallFace): [EdgePoint, EdgePoint] {
  if (face === 'px') return [{ x: room.xM + room.lengthM, y: room.yM }, { x: room.xM + room.lengthM, y: room.yM + room.widthM }];
  if (face === 'nx') return [{ x: room.xM, y: room.yM }, { x: room.xM, y: room.yM + room.widthM }];
  if (face === 'py') return [{ x: room.xM, y: room.yM + room.widthM }, { x: room.xM + room.lengthM, y: room.yM + room.widthM }];
  return [{ x: room.xM, y: room.yM }, { x: room.xM + room.lengthM, y: room.yM }];
}

function segmentOverlap(a0: EdgePoint, a1: EdgePoint, b0: EdgePoint, b1: EdgePoint): { start: number; end: number } | null {
  const abx = a1.x - a0.x;
  const aby = a1.y - a0.y;
  const length = Math.hypot(abx, aby);
  const bdx = b1.x - b0.x;
  const bdy = b1.y - b0.y;
  const other = Math.hypot(bdx, bdy);
  if (length < 1e-6 || other < 1e-6) return null;
  const ux = abx / length;
  const uy = aby / length;
  const vx = bdx / other;
  const vy = bdy / other;
  if (Math.abs(ux * vy - uy * vx) > 0.12) return null;
  const perp = (point: EdgePoint) => Math.abs((point.x - a0.x) * -uy + (point.y - a0.y) * ux);
  if (perp(b0) > TOUCH_M || perp(b1) > TOUCH_M) return null;
  const project = (point: EdgePoint) => (point.x - a0.x) * ux + (point.y - a0.y) * uy;
  const start = Math.max(0, Math.min(project(b0), project(b1)));
  const end = Math.min(length, Math.max(project(b0), project(b1)));
  if (end - start <= TOUCH_M) return null;
  return { start, end };
}

function neighborEdges(room: Room): { a: EdgePoint; b: EdgePoint; anchor: string }[] {
  if (room.outline && room.outline.length >= 3) {
    return room.outline.map((point, index) => ({
      a: point,
      b: room.outline![(index + 1) % room.outline!.length],
      anchor: `e:${index}`,
    }));
  }
  return WALL_FACE_IDS.map(face => {
    const [a, b] = faceSegment(room, face);
    return { a, b, anchor: `f:${face}` };
  });
}

function portionsAlong(length: number, hits: { start: number; end: number; name: string; roomId: string; anchor: string }[]): WallPortion[] {
  const merged: { start: number; end: number; names: string[]; roomIds: string[]; anchors: string[] }[] = [];
  const ordered = hits
    .map(hit => ({ start: Math.max(0, hit.start), end: Math.min(length, hit.end), name: hit.name, roomId: hit.roomId, anchor: hit.anchor }))
    .filter(hit => hit.end - hit.start > TOUCH_M)
    .sort((a, b) => a.start - b.start);
  for (const hit of ordered) {
    const last = merged[merged.length - 1];
    const sameNeighbor = last && last.roomIds.length === 1 && last.roomIds[0] === hit.roomId && last.anchors[0] === hit.anchor;
    if (last && sameNeighbor && hit.start <= last.end + TOUCH_M) {
      last.end = Math.max(last.end, hit.end);
      if (!last.names.includes(hit.name)) last.names.push(hit.name);
    } else merged.push({ start: hit.start, end: hit.end, names: [hit.name], roomIds: [hit.roomId], anchors: [hit.anchor] });
  }
  const portions: WallPortion[] = [];
  let cursor = 0;
  const outside = (startM: number, endM: number): WallPortion => ({ startM, endM, kind: 'outside', names: [], roomIds: [], anchors: [] });
  for (const span of merged) {
    if (span.start > cursor + TOUCH_M) portions.push(outside(cursor, span.start));
    portions.push({ startM: span.start, endM: span.end, kind: 'interface', names: span.names, roomIds: span.roomIds, anchors: span.anchors });
    cursor = span.end;
  }
  if (length - cursor > TOUCH_M) portions.push(outside(cursor, length));
  if (portions.length === 0) portions.push(outside(0, length));
  return portions;
}

function portionsFor(room: Room, a0: EdgePoint, a1: EdgePoint, rooms: readonly Room[]): WallPortion[] {
  const length = Math.hypot(a1.x - a0.x, a1.y - a0.y);
  const hits: { start: number; end: number; name: string; roomId: string; anchor: string }[] = [];
  for (const other of rooms) {
    if (other.id === room.id) continue;
    if (overlap(room.zM, room.zM + room.heightM, other.zM, other.zM + other.heightM) <= TOUCH_M) continue;
    for (const edge of neighborEdges(other)) {
      const span = segmentOverlap(a0, a1, edge.a, edge.b);
      if (span) hits.push({ ...span, name: other.name || 'another space', roomId: other.id, anchor: edge.anchor });
    }
  }
  return portionsAlong(length, hits);
}

export function facePortions(room: Room, face: WallFace, rooms: readonly Room[]): WallPortion[] {
  const [start, end] = faceSegment(room, face);
  return portionsFor(room, start, end, rooms);
}

export function edgePortions(room: Room, edge: number, rooms: readonly Room[]): WallPortion[] {
  const loop = room.outline ?? [];
  const start = loop[edge];
  const end = loop[(edge + 1) % loop.length];
  if (!start || !end) return [];
  return portionsFor(room, start, end, rooms);
}

export type InterfaceSide = {
  roomId: string;
  anchor: string;
  name: string;
  startM: number;
  endM: number;
};

export type InterfaceTarget = {
  key: string;
  names: string[];
  lengthM: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sides: InterfaceSide[];
};

function spanEnds(a: EdgePoint, b: EdgePoint, start: number, end: number): { x0: number; y0: number; x1: number; y1: number; lengthM: number } {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const at = (distance: number) => ({
    x: a.x + ((b.x - a.x) * distance) / length,
    y: a.y + ((b.y - a.y) * distance) / length,
  });
  const from = at(start);
  const to = at(end);
  return { x0: from.x, y0: from.y, x1: to.x, y1: to.y, lengthM: Math.max(0, end - start) };
}

function segmentForAnchor(room: Room, anchor: string): [EdgePoint, EdgePoint] | null {
  if (anchor.startsWith('f:')) {
    const face = anchor.slice(2);
    if (face === 'px' || face === 'nx' || face === 'py' || face === 'ny') return faceSegment(room, face);
  }
  if (anchor.startsWith('e:') && room.outline && room.outline.length >= 3) {
    const index = Number(anchor.slice(2));
    const loop = room.outline;
    const start = loop[index];
    const end = loop[(index + 1) % loop.length];
    if (start && end) return [start, end];
  }
  return null;
}

function distanceAlong(a: EdgePoint, b: EdgePoint, x: number, y: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return ((x - a.x) * dx + (y - a.y) * dy) / length;
}

export function interfacePairKey(roomId: string, anchor: string, otherId: string, otherAnchor: string): string {
  const left = `${roomId}@${anchor}`;
  const right = `${otherId}@${otherAnchor}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function neighborRef(portion: WallPortion | undefined): string | null {
  if (!portion || portion.kind !== 'interface' || !portion.roomIds[0] || !portion.anchors[0]) return null;
  return `${portion.roomIds[0]}@${portion.anchors[0]}`;
}

/** Neighbor identities that bound each outside stretch. Repeated bounds get ~0, ~1. Meters are not included. */
function outsideTokens(portions: readonly WallPortion[]): string[] {
  const raw = portions.map((portion, index) => {
    if (portion.kind !== 'outside') return '';
    let prev: WallPortion | undefined;
    let next: WallPortion | undefined;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (portions[i].kind === 'interface') {
        prev = portions[i];
        break;
      }
    }
    for (let i = index + 1; i < portions.length; i += 1) {
      if (portions[i].kind === 'interface') {
        next = portions[i];
        break;
      }
    }
    const prevRef = neighborRef(prev);
    const nextRef = neighborRef(next);
    if (!prevRef && !nextRef) return 'face';
    if (!prevRef && nextRef) return `before:${nextRef}`;
    if (prevRef && !nextRef) return `after:${prevRef}`;
    return `between:${prevRef}+${nextRef}`;
  });
  const totals = new Map<string, number>();
  raw.forEach(token => {
    if (token) totals.set(token, (totals.get(token) ?? 0) + 1);
  });
  const seen = new Map<string, number>();
  return raw.map(token => {
    if (!token || (totals.get(token) ?? 0) < 2) return token;
    const n = seen.get(token) ?? 0;
    seen.set(token, n + 1);
    return `${token}~${n}`;
  });
}

export function outsideAirKey(roomId: string, anchor: string, token: string): string {
  return `${roomId}@${anchor}|out:${token}`;
}

export function isOutsideInterfaceKey(key: string): boolean {
  const pipe = key.indexOf('|');
  return pipe > 0 && key.startsWith('out:', pipe + 1);
}

function keysForPortions(roomId: string, anchor: string, portions: readonly WallPortion[]): (string | null)[] {
  const tokens = outsideTokens(portions);
  return portions.map((portion, index) => {
    if (portion.kind === 'interface' && portion.roomIds[0] && portion.anchors[0]) {
      return interfacePairKey(roomId, anchor, portion.roomIds[0], portion.anchors[0]);
    }
    const token = tokens[index];
    if (portion.kind === 'outside' && token) return outsideAirKey(roomId, anchor, token);
    return null;
  });
}

export function portionInterfaceKey(
  room: Room,
  portion: WallPortion,
  anchor: { wallFace?: WallFace; edge?: number },
  portions?: readonly WallPortion[],
): string | null {
  const host = anchor.edge != null ? `e:${anchor.edge}` : anchor.wallFace ? `f:${anchor.wallFace}` : null;
  if (!host) return null;
  const list = portions && portions.length > 0 ? portions : [portion];
  const index = list.indexOf(portion);
  const at =
    index >= 0
      ? index
      : list.findIndex(item => item.kind === portion.kind && item.startM === portion.startM && item.endM === portion.endM && item.anchors[0] === portion.anchors[0]);
  if (at < 0) return null;
  return keysForPortions(room.id, host, list)[at] ?? null;
}

export function interfaceTargets(rooms: readonly Room[]): InterfaceTarget[] {
  const targets: InterfaceTarget[] = [];
  const seen = new Set<string>();
  const addShared = (room: Room, hostAnchor: string, portion: WallPortion, span: ReturnType<typeof spanEnds>, key: string) => {
    const otherId = portion.roomIds[0];
    const otherAnchor = portion.anchors[0];
    if (portion.kind !== 'interface' || !otherId || !otherAnchor) return;
    if (seen.has(key)) return;
    seen.add(key);
    const other = rooms.find(item => item.id === otherId);
    const otherEdge = other ? segmentForAnchor(other, otherAnchor) : null;
    const otherDistances = otherEdge
      ? [distanceAlong(otherEdge[0], otherEdge[1], span.x0, span.y0), distanceAlong(otherEdge[0], otherEdge[1], span.x1, span.y1)]
      : [0, span.lengthM];
    const sides = [
      { roomId: room.id, anchor: hostAnchor, name: room.name || 'Space', startM: portion.startM, endM: portion.endM },
      {
        roomId: otherId,
        anchor: otherAnchor,
        name: other?.name || portion.names[0] || 'Space',
        startM: Math.min(otherDistances[0], otherDistances[1]),
        endM: Math.max(otherDistances[0], otherDistances[1]),
      },
    ];
    targets.push({ key, names: sides.map(side => side.name), lengthM: span.lengthM, x0: span.x0, y0: span.y0, x1: span.x1, y1: span.y1, sides });
  };
  const addOutside = (room: Room, hostAnchor: string, portion: WallPortion, span: ReturnType<typeof spanEnds>, key: string) => {
    if (portion.kind !== 'outside' || seen.has(key)) return;
    seen.add(key);
    const name = room.name || 'Space';
    targets.push({
      key,
      names: [name, 'Outside'],
      lengthM: span.lengthM,
      x0: span.x0,
      y0: span.y0,
      x1: span.x1,
      y1: span.y1,
      sides: [{ roomId: room.id, anchor: hostAnchor, name, startM: portion.startM, endM: portion.endM }],
    });
  };
  const visit = (room: Room, hostAnchor: string, portions: WallPortion[], a: EdgePoint, b: EdgePoint) => {
    const keys = keysForPortions(room.id, hostAnchor, portions);
    portions.forEach((portion, index) => {
      const key = keys[index];
      if (!key) return;
      const span = spanEnds(a, b, portion.startM, portion.endM);
      if (portion.kind === 'outside') addOutside(room, hostAnchor, portion, span, key);
      else addShared(room, hostAnchor, portion, span, key);
    });
  };
  for (const room of rooms) {
    if (room.outline && room.outline.length >= 3) {
      room.outline.forEach((point, index) => {
        const next = room.outline![(index + 1) % room.outline!.length];
        visit(room, `e:${index}`, edgePortions(room, index, rooms), point, next);
      });
    } else {
      for (const face of WALL_FACE_IDS) {
        const [start, end] = faceSegment(room, face);
        visit(room, `f:${face}`, facePortions(room, face, rooms), start, end);
      }
    }
  }
  return targets;
}

export function findInterface(rooms: readonly Room[], key: string): InterfaceTarget | null {
  return interfaceTargets(rooms).find(target => target.key === key) ?? null;
}

export function interfaceForOpening(
  room: Room,
  opening: { face: WallFace; offsetM: number; widthM: number },
  rooms: readonly Room[],
): InterfaceTarget | null {
  const anchor = `f:${opening.face}`;
  const mid = opening.offsetM + opening.widthM / 2;
  return (
    interfaceTargets(rooms).find(target =>
      target.sides.some(side => side.roomId === room.id && side.anchor === anchor && mid >= side.startM - 0.02 && mid <= side.endM + 0.02),
    ) ?? null
  );
}

function facesTouch(room: Room, face: WallFace, other: Room): boolean {
  return facePortions(room, face, [room, other]).some(portion => portion.kind === 'interface');
}

export function separateSharedWalls(rooms: Room[]): Room[] {
  return rooms.map(room => ({
    ...room,
    surfaces: {
      ...room.surfaces,
      walls: {
        px: wallFromAssembly(wallAssemblyFor(room, 'px', rooms)),
        nx: wallFromAssembly(wallAssemblyFor(room, 'nx', rooms)),
        py: wallFromAssembly(wallAssemblyFor(room, 'py', rooms)),
        ny: wallFromAssembly(wallAssemblyFor(room, 'ny', rooms)),
      },
    },
  }));
}

function wallAssemblyFor(room: Room, face: WallFace, rooms: readonly Room[]): string {
  const shared = rooms.some(other => other.id !== room.id && facesTouch(room, face, other));
  return shared ? sharedAssemblyId(room.use) : exteriorAssemblyId(room.use);
}

export function touchingRooms(room: Room, face: WallFace, rooms: readonly Room[]): Room[] {
  return rooms.filter(other => other.id !== room.id && facesTouch(room, face, other));
}

/** True when neighboring spaces cover this face from end to end. */
export function wallFullyShared(room: Room, face: WallFace, rooms: readonly Room[]): boolean {
  const intervals = touchingRooms(room, face, rooms)
    .map(other => touchInterval(room, face, other))
    .sort((a, b) => a[0] - b[0]);
  if (intervals.length === 0) return false;
  let end = 0;
  for (const [start, stop] of intervals) {
    if (start > end + TOUCH_M) return false;
    end = Math.max(end, stop);
  }
  return end >= wallLength(room, face) - TOUCH_M;
}

export function portionSummary(portions: readonly WallPortion[]): string {
  const names = [...new Set(portions.flatMap(portion => portion.names))];
  if (names.length === 0) return 'An interface with outside air';
  const partial = portions.some(portion => portion.kind === 'outside');
  return partial ? `Partly an interface with ${names.join(', ')}` : `Interface with ${names.join(', ')}`;
}

export function wallRelation(room: Room, face: WallFace, rooms: readonly Room[]): string {
  return portionSummary(facePortions(room, face, rooms));
}

/** Compass points, clockwise from north. */
const COMPASS_POINTS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'] as const;

/**
 * The compass point an outward direction on the plan faces. Plan up is +Y. `northDeg` is the project's North
 * setting: where north points, in degrees clockwise from up. Turning north renames every wall.
 */
export function compassPoint(dx: number, dy: number, northDeg: number): (typeof COMPASS_POINTS)[number] {
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const azimuth = (((bearing - northDegrees(northDeg)) % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(azimuth / 45) % 8];
}

const FACE_NORMAL: Record<WallFace, [number, number]> = { px: [1, 0], nx: [-1, 0], py: [0, 1], ny: [0, -1] };

/** Outward direction of one edge of a drawn room, whichever way its corners were drawn. */
function edgeNormal(loop: readonly { x: number; y: number }[], edge: number): [number, number] {
  let twiceArea = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  const a = loop[edge];
  const b = loop[(edge + 1) % loop.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Counter-clockwise corners have the outside on the right of each edge.
  return twiceArea >= 0 ? [dy, -dx] : [-dy, dx];
}

/** A wall of a room: one of the four faces of a box room, or one edge of a drawn room. */
export type WallRef = { face: WallFace } | { edge: number };

function wallPortionsOf(room: Room, wall: WallRef, rooms: readonly Room[]): WallPortion[] {
  return 'face' in wall ? facePortions(room, wall.face, rooms) : edgePortions(room, wall.edge, rooms);
}

function neighbourNames(portions: readonly WallPortion[]): { names: string[]; outside: boolean } {
  return { names: [...new Set(portions.flatMap(portion => portion.names))], outside: portions.length === 0 || portions.some(portion => portion.kind === 'outside') };
}

/** Name before numbering: "Wall to Kitchen" when other spaces cover it (two at most), else its compass point. */
function baseWallName(room: Room, wall: WallRef, rooms: readonly Room[], northDeg: number): string {
  const { names, outside } = neighbourNames(wallPortionsOf(room, wall, rooms));
  if (!outside && names.length > 0 && names.length <= 2) return `Wall to ${names.join(' and ')}`;
  const [dx, dy] = 'face' in wall ? FACE_NORMAL[wall.face] : edgeNormal(room.outline ?? [], wall.edge);
  return `${compassPoint(dx, dy, northDeg)} wall`;
}

/** Every wall of a room, in plan order, as references. */
export function roomWalls(room: Room): WallRef[] {
  const loop = room.outline ?? [];
  return loop.length >= 3 ? loop.map((_, edge) => ({ edge })) : WALL_FACE_IDS.map(face => ({ face }));
}

/**
 * How people name a wall: outside walls by the way they face ("North wall"), walls shared with one or two spaces
 * by the space behind them ("Wall to Kitchen"). Two walls of a room with the same name are numbered ("North wall 2").
 */
export function wallName(room: Room, wall: WallRef, rooms: readonly Room[], northDeg: number | undefined): string {
  const north = northDegrees(northDeg);
  const all = roomWalls(room);
  const names = all.map(item => baseWallName(room, item, rooms, north));
  const index = all.findIndex(item => ('face' in item && 'face' in wall ? item.face === wall.face : 'edge' in item && 'edge' in wall && item.edge === wall.edge));
  if (index < 0) return baseWallName(room, wall, rooms, north);
  const name = names[index];
  const same = names.map((item, position) => (item === name ? position : -1)).filter(position => position >= 0);
  return same.length > 1 ? `${name} ${same.indexOf(index) + 1}` : name;
}

/** "wall to Kitchen", "north wall": for the middle of a sentence. */
export function wallNameInText(room: Room, wall: WallRef, rooms: readonly Room[], northDeg: number | undefined): string {
  const name = wallName(room, wall, rooms, northDeg);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** A wall's name and what is behind it, for pickers and hover text: "East wall · outside", "North wall · partly to Storage". */
export function wallPlaceLabel(room: Room, face: WallFace, rooms: readonly Room[], northDeg: number | undefined): string {
  const name = wallName(room, { face }, rooms, northDeg);
  const { names, outside } = neighbourNames(facePortions(room, face, rooms));
  if (names.length === 0) return `${name} · outside`;
  if (!outside && name.startsWith('Wall to ')) return name;
  return `${name} · ${outside ? 'partly to' : 'to'} ${names.join(', ')}`;
}

function remapRef(ref: string, roomIds: Map<string, string>): string | null {
  const at = ref.indexOf('@');
  if (at <= 0) return null;
  const roomId = roomIds.get(ref.slice(0, at));
  if (!roomId) return null;
  return `${roomId}@${ref.slice(at + 1)}`;
}

function remapOutsideToken(token: string, roomIds: Map<string, string>): string | null {
  const tilde = token.lastIndexOf('~');
  const suffix = tilde >= 0 && /^\d+$/.test(token.slice(tilde + 1)) ? token.slice(tilde) : '';
  const body = suffix ? token.slice(0, token.length - suffix.length) : token;
  if (body === 'face') return `face${suffix}`;
  const colon = body.indexOf(':');
  if (colon <= 0) return null;
  const kind = body.slice(0, colon);
  const rest = body.slice(colon + 1);
  if (kind === 'before' || kind === 'after') {
    const ref = remapRef(rest, roomIds);
    return ref ? `${kind}:${ref}${suffix}` : null;
  }
  if (kind !== 'between') return null;
  const plus = rest.indexOf('+');
  if (plus <= 0) return null;
  const left = remapRef(rest.slice(0, plus), roomIds);
  const right = remapRef(rest.slice(plus + 1), roomIds);
  if (!left || !right) return null;
  return `between:${left}+${right}${suffix}`;
}

/** Keeps interface stacks when a project is copied. Outside-air keys stay on the same edge. */
export function remapInterfaceWallKey(key: string, roomIds: Map<string, string>): string | null {
  const pipe = key.indexOf('|');
  if (pipe <= 0) return null;
  const left = remapRef(key.slice(0, pipe), roomIds);
  if (!left) return null;
  const right = key.slice(pipe + 1);
  if (right.startsWith('out:')) {
    const token = remapOutsideToken(right.slice(4), roomIds);
    return token ? `${left}|out:${token}` : null;
  }
  const other = remapRef(right, roomIds);
  if (!other) return null;
  return left < other ? `${left}|${other}` : `${other}|${left}`;
}

function cleanOutline(outline: Room['outline']): Room['outline'] | undefined {
  if (!Array.isArray(outline) || outline.length < 3) return undefined;
  const points = outline
    .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  return points.length >= 3 ? points : undefined;
}

function normalizeStreamDesign(value: DuctRun['streamDesign']): DuctRun['streamDesign'] {
  if (!value || typeof value !== 'object') return undefined;
  const flowM3s = finiteOrNull(value.flowM3s);
  const dbC = finiteOrNull(value.dbC);
  const wbC = finiteOrNull(value.wbC);
  const rh = finiteOrNull(value.rh);
  if (flowM3s == null && dbC == null && wbC == null && rh == null) return undefined;
  return { flowM3s, dbC, wbC, rh };
}

function normalizePlantLoops(value: Project['plantLoops']): PlantLoop[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(loop => {
    if (!loop || typeof loop.id !== 'string' || typeof loop.fluid !== 'string') return [];
    return [{
      id: loop.id,
      name: typeof loop.name === 'string' ? loop.name : 'Loop',
      fluid: loop.fluid,
      glycolFraction: finiteOrNull(loop.glycolFraction),
      supplyC: finiteOrNull(loop.supplyC),
      returnC: finiteOrNull(loop.returnC),
      plantEquipmentId: typeof loop.plantEquipmentId === 'string' ? loop.plantEquipmentId : null,
      notes: typeof loop.notes === 'string' ? loop.notes : '',
    }];
  });
}

function normalizeControlPoints(value: Project['controlPoints'], equipmentIds: Set<string>, roomIds: Set<string>): ControlPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(point => {
    if (!point || typeof point.id !== 'string' || typeof point.sensor !== 'string' || !point.location) return [];
    const location = point.location;
    if (location.kind === 'station' && !equipmentIds.has(location.equipmentId)) return [];
    if (location.kind === 'room' && !roomIds.has(location.roomId)) return [];
    return [{ ...point, tag: typeof point.tag === 'string' ? point.tag : '' }];
  });
}

function normalizeDuctNodes(value: Project['ductNodes']): DuctNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(node => {
    if (!node || typeof node.id !== 'string' || typeof node.systemId !== 'string') return [];
    const x = Number(node.x);
    const y = Number(node.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ id: node.id, systemId: node.systemId, service: node.service ?? 'supply', x, y }];
  });
}

function normalizeDucts(value: Project['ducts'], nodeIds: Set<string>): DuctRun[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(run => {
    if (!run || typeof run.id !== 'string' || typeof run.systemId !== 'string') return [];
    const points = (run.points ?? [])
      .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) return [];
    const service = run.service === 'return' || run.service === 'exhaust' || run.service === 'outdoor' || run.service === 'relief' || run.service === 'mixed' ? run.service : 'supply';
    const shape = run.shape === 'rect' ? 'rect' : 'round';
    const end = (item: DuctRun['start'] | undefined): DuctRun['start'] => ({
      equipmentId: typeof item?.equipmentId === 'string' ? item.equipmentId : null,
      portId: typeof item?.portId === 'string' ? item.portId : null,
      ...(typeof item?.nodeId === 'string' && nodeIds.has(item.nodeId) ? { nodeId: item.nodeId } : {}),
    });
    const streamDesign = normalizeStreamDesign(run.streamDesign);
    return [{
      id: run.id,
      catalogId: typeof run.catalogId === 'string' ? run.catalogId : '',
      systemId: run.systemId,
      service,
      shape,
      widthM: Number(run.widthM) > 0.05 ? Number(run.widthM) : 0.3,
      heightM: shape === 'rect' && Number(run.heightM) > 0.05 ? Number(run.heightM) : null,
      zM: Number.isFinite(run.zM) ? run.zM : 2.7,
      points,
      start: end(run.start),
      end: end(run.end),
      penetrations: Array.isArray(run.penetrations) ? run.penetrations : [],
      view: run.view === 'schematic' ? 'schematic' : 'plan',
      ...(streamDesign ? { streamDesign } : {}),
    }];
  });
}

function normalizeEquipment(value: Project['equipment']): Project['equipment'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.catalogId !== 'string') return [];
    const schematic =
      item.schematic && Number.isFinite(item.schematic.x) && Number.isFinite(item.schematic.y)
        ? { x: Number(item.schematic.x), y: Number(item.schematic.y) }
        : null;
    const sections = Array.isArray(item.sections)
      ? item.sections.filter(section => section && typeof section.id === 'string' && typeof section.kind === 'string')
      : undefined;
    const designFlowM3s = finiteOrNull(item.designFlowM3s);
    return [{
      ...item,
      schematic,
      sections,
      designFlowM3s: designFlowM3s != null && designFlowM3s > 0 ? designFlowM3s : null,
    }];
  });
}

function finiteOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeLoads(value: Project['loads']): LoadItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.loadId !== 'string') return [];
    const override = item.override && typeof item.override === 'object'
      ? {
          source: item.override.source === 'manufacturer' ? ('manufacturer' as const) : ('manual' as const),
          sensibleW: finiteOrNull(item.override.sensibleW),
          latentW: finiteOrNull(item.override.latentW),
          co2Ls: finiteOrNull(item.override.co2Ls),
          coMgS: finiteOrNull(item.override.coMgS),
          note: typeof item.override.note === 'string' ? item.override.note : '',
        }
      : null;
    return [{
      id: item.id,
      loadId: item.loadId,
      roomId: typeof item.roomId === 'string' ? item.roomId : null,
      xM: finiteOrNull(item.xM) ?? 0,
      yM: finiteOrNull(item.yM) ?? 0,
      yawDeg: Number.isFinite(item.yawDeg) ? item.yawDeg : 0,
      lengthM: finiteOrNull(item.lengthM) != null && finiteOrNull(item.lengthM)! >= 0.05 ? finiteOrNull(item.lengthM) : null,
      widthM: finiteOrNull(item.widthM) != null && finiteOrNull(item.widthM)! >= 0.05 ? finiteOrNull(item.widthM) : null,
      heightM: finiteOrNull(item.heightM) != null && finiteOrNull(item.heightM)! >= 0.05 ? finiteOrNull(item.heightM) : null,
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      override,
      notes: typeof item.notes === 'string' ? item.notes : '',
    }];
  });
}

/** 0 means the top of the plan is north. The result is degrees clockwise, in 0–360. */
export function northDegrees(value: unknown): number {
  const deg = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function normalizeProject(project: Project, emptyNote: string): Project {
  const northDeg = northDegrees(project.northDeg);
  const ductNodes = normalizeDuctNodes(project.ductNodes);
  const nodeIds = new Set(ductNodes.map(node => node.id));
  return {
    ...project,
    northDeg: northDeg === 0 ? undefined : northDeg,
    rooms: project.rooms.map(room => {
      const outline = cleanOutline(room.outline);
      const edgeWalls = outline?.map((_, index) => {
        const item = room.edgeWalls?.[index];
        return isAssignment(item) ? cloneWallAssignment(item) : blankWallAssignment(emptyNote);
      });
      const ach = finiteOrNull(room.infiltrationAch);
      return {
        ...room,
        infiltrationAch: ach != null && ach >= 0 ? ach : null,
        ...(outline ? { outline, edgeWalls } : { outline: undefined, edgeWalls: undefined }),
        surfaces: {
          floor: room.surfaces.floor,
          ceiling: room.surfaces.ceiling,
          walls: normalizeWalls(room.surfaces.walls, emptyNote),
        },
      };
    }),
    wallRuns: Array.isArray(project.wallRuns) ? project.wallRuns.map(run => ({ ...run, openings: run.openings ?? [] })) : [],
    equipment: normalizeEquipment(project.equipment),
    ducts: normalizeDucts(project.ducts, nodeIds),
    ductNodes,
    plantLoops: normalizePlantLoops(project.plantLoops),
    controlPoints: normalizeControlPoints(
      project.controlPoints,
      new Set((project.equipment ?? []).map(item => item?.id)),
      new Set(project.rooms.map(room => room.id)),
    ),
    loads: normalizeLoads(project.loads),
    site: normalizeSite(project.site),
    interfaceWalls: normalizeInterfaceWalls(project.interfaceWalls),
  };
}

function normalizeInterfaceWalls(value: Project['interfaceWalls']): Project['interfaceWalls'] {
  if (!value || typeof value !== 'object') return undefined;
  const next: Record<string, SurfaceAssignment> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.includes('|') && isAssignment(item)) next[key] = cloneWallAssignment(item);
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
