import { builtinAssembly, cloneLayers } from './constructionLibrary';
import type { Project, Room, SurfaceAssignment, WallFace } from './types';

export const WALL_FACE_IDS: WallFace[] = ['px', 'nx', 'py', 'ny'];

export const WALL_TYPES: { id: string; label: string; detail: string; assemblyId: string }[] = [
  { id: 'exterior', label: 'Exterior wall', detail: 'Brick and studs, for a dining, bar, or office wall on the outside.', assemblyId: 'asm-wall-dining' },
  { id: 'kitchen', label: 'Service wall', detail: 'Masonry, for a kitchen, restroom, storage, or corridor wall on the outside.', assemblyId: 'asm-wall-kitchen' },
  { id: 'partition', label: 'Partition', detail: 'Gypsum on both sides. Use this where the wall is shared with another room.', assemblyId: 'asm-wall-partition' },
  { id: 'walk-in', label: 'Walk-in panel', detail: 'Cooler panel. Metal skins are not a separate layer.', assemblyId: 'asm-wall-walkin' },
  { id: 'freezer', label: 'Freezer panel', detail: 'Freezer panel. Swap this onto a walk-in when the box is a freezer.', assemblyId: 'asm-wall-walkin-freezer' },
  { id: 'glass', label: 'Storefront glass', detail: 'Glazed wall using the published window U-0.32. Not a tested curtain wall.', assemblyId: 'asm-wall-glass' },
];

/** Plan position of each face. Top of the plan is +Y. */
export const PLAN_SIDES: Record<WallFace, { title: string; edge: 'top' | 'left' | 'right' | 'bottom' }> = {
  py: { title: 'Top', edge: 'top' },
  nx: { title: 'Left', edge: 'left' },
  px: { title: 'Right', edge: 'right' },
  ny: { title: 'Bottom', edge: 'bottom' },
};

const ROLE_LABEL: Record<string, string> = {
  'asm-wall-dining': 'Exterior wall',
  'asm-wall-kitchen': 'Service wall',
  'asm-wall-partition': 'Partition',
  'asm-wall-walkin': 'Walk-in panel',
  'asm-wall-walkin-freezer': 'Freezer panel',
  'asm-wall-glass': 'Storefront glass',
};

const ROOM_FILL: Record<string, string> = {
  Dining: '#f3e4c4',
  Bar: '#ead7b4',
  Kitchen: '#f3cfc2',
  'Hot line': '#f0c0ae',
  Prep: '#f6ddd2',
  Dish: '#d5e4ea',
  'Walk-in': '#d2e2f2',
  Restroom: '#e2dff2',
  Corridor: '#e6eaec',
  Storage: '#e5e3d4',
  'Dry storage': '#e5e3d4',
  Office: '#d9e7dc',
  Service: '#e6eaec',
};

export function roomFill(use: string): string {
  return ROOM_FILL[use] ?? '#e4ebf0';
}

export function wallColor(constructionId: string | null | undefined): string {
  if (constructionId === 'asm-wall-dining') return '#8a5a3a';
  if (constructionId === 'asm-wall-kitchen') return '#6d4c38';
  if (constructionId === 'asm-wall-partition') return '#8aa0a8';
  if (constructionId === 'asm-wall-walkin') return '#3d6f9a';
  if (constructionId === 'asm-wall-walkin-freezer') return '#2c4d78';
  if (constructionId === 'asm-wall-glass') return '#3f8fbf';
  if (!constructionId) return '#c47b12';
  return '#60707a';
}

const SERVICE_USES = new Set(['Kitchen', 'Hot line', 'Prep', 'Dish', 'Restroom', 'Storage', 'Dry storage', 'Corridor', 'Service']);
const TOUCH_M = 0.08;
const PLANNING_NOTE =
  'Planning default from the restaurant construction library. The stack is copied onto this surface. Confirm the climate zone and the tested assembly before design use.';

export function wallRoleLabel(constructionId: string | null | undefined): string {
  if (!constructionId) return 'Unassigned';
  return ROLE_LABEL[constructionId] ?? 'Custom';
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
  if (use === 'Walk-in') return 'asm-wall-walkin';
  if (SERVICE_USES.has(use)) return 'asm-wall-kitchen';
  return 'asm-wall-dining';
}

function sharedAssemblyId(use: string): string {
  return use === 'Walk-in' ? 'asm-wall-walkin' : 'asm-wall-partition';
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
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

function facesTouch(room: Room, face: WallFace, other: Room): boolean {
  if (overlap(room.zM, room.zM + room.heightM, other.zM, other.zM + other.heightM) <= TOUCH_M) return false;
  if (face === 'px' || face === 'nx') {
    if (overlap(room.yM, room.yM + room.widthM, other.yM, other.yM + other.widthM) <= TOUCH_M) return false;
    const plane = face === 'px' ? room.xM + room.lengthM : room.xM;
    return Math.abs(other.xM - plane) <= TOUCH_M || Math.abs(other.xM + other.lengthM - plane) <= TOUCH_M;
  }
  if (overlap(room.xM, room.xM + room.lengthM, other.xM, other.xM + other.lengthM) <= TOUCH_M) return false;
  const plane = face === 'py' ? room.yM + room.widthM : room.yM;
  return Math.abs(other.yM - plane) <= TOUCH_M || Math.abs(other.yM + other.widthM - plane) <= TOUCH_M;
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

/** True when neighboring rooms cover this face from end to end. A partial touch still uses one stack. */
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

export function wallRelation(room: Room, face: WallFace, rooms: readonly Room[]): string {
  const others = touchingRooms(room, face, rooms);
  if (others.length === 0) return 'Outside';
  const names = others.map(item => item.name || 'another room').join(', ');
  return wallFullyShared(room, face, rooms) ? `Shared with ${names}` : `Partly shared with ${names}`;
}

export function wallPlaceLabel(room: Room, face: WallFace, rooms: readonly Room[]): string {
  return `${PLAN_SIDES[face].title} · ${wallRelation(room, face, rooms)}`;
}

export function normalizeProject(project: Project, emptyNote: string): Project {
  return {
    ...project,
    rooms: project.rooms.map(room => ({
      ...room,
      surfaces: {
        floor: room.surfaces.floor,
        ceiling: room.surfaces.ceiling,
        walls: normalizeWalls(room.surfaces.walls, emptyNote),
      },
    })),
  };
}
