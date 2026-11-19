import { getProduct, type CatalogProduct } from './catalog';
import { builtinAssembly, cloneLayers, findAssembly, type ConstructionAssembly } from './constructionLibrary';
import { createId, nowIso } from './ids';
import type {
  HvacSystem,
  Opening,
  OpeningKind,
  PlacedEquipment,
  Project,
  Room,
  SurfaceAssignment,
  SystemKind,
  WallFace,
  WallRun,
} from './types';
import { openingWidth, outlineRoomOk, pointInOutline, polygonArea } from './wallDraw';
import { blankWallAssignment, cloneWallAssignment, remapInterfaceWallKey, touchingRooms } from './walls';

export const UNASSIGNED_SURFACE = 'No construction material assigned. Choose one from the material library, or add a row there.';

export function blankSurfaces(): Room['surfaces'] {
  const surface = (): SurfaceAssignment => blankWallAssignment(UNASSIGNED_SURFACE);
  return {
    floor: surface(),
    ceiling: surface(),
    walls: {
      px: surface(),
      nx: surface(),
      py: surface(),
      ny: surface(),
    },
  };
}

function cloneSurface(surface: SurfaceAssignment): SurfaceAssignment {
  return cloneWallAssignment(surface);
}

export function setWallAssembly(
  project: Project,
  roomId: string,
  face: WallFace,
  constructionId: string | null,
  assemblies: ConstructionAssembly[]
): Project {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return project;
  const assembly = findAssembly(assemblies, constructionId);
  const next: SurfaceAssignment = assembly
    ? { materialKey: null, constructionId: assembly.id, layers: cloneLayers(assembly.layers), note: `${assembly.name}. ${assembly.notes}` }
    : blankWallAssignment(UNASSIGNED_SURFACE);
  return updateRoom(project, roomId, {
    assumption: false,
    surfaces: { ...room.surfaces, walls: { ...room.surfaces.walls, [face]: next } },
  });
}

export function setEdgeAssembly(
  project: Project,
  roomId: string,
  edge: number,
  constructionId: string | null,
  assemblies: ConstructionAssembly[],
): Project {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room?.outline || edge < 0 || edge >= room.outline.length) return project;
  const assembly = findAssembly(assemblies, constructionId);
  const next: SurfaceAssignment = assembly
    ? { materialKey: null, constructionId: assembly.id, layers: cloneLayers(assembly.layers), note: `${assembly.name}. ${assembly.notes}` }
    : blankWallAssignment(UNASSIGNED_SURFACE);
  const edgeWalls = room.outline.map((_, index) => (index === edge ? next : room.edgeWalls?.[index] ?? blankWallAssignment(UNASSIGNED_SURFACE)));
  return updateRoom(project, roomId, { assumption: false, edgeWalls });
}

export function updateInterfaceAssignment(project: Project, key: string, assignment: SurfaceAssignment): Project {
  return { ...project, interfaceWalls: { ...project.interfaceWalls, [key]: assignment } };
}

export function setInterfaceAssembly(
  project: Project,
  key: string,
  constructionId: string | null,
  assemblies: ConstructionAssembly[],
): Project {
  const assembly = findAssembly(assemblies, constructionId);
  const next: SurfaceAssignment = assembly
    ? { materialKey: null, constructionId: assembly.id, layers: cloneLayers(assembly.layers), note: `${assembly.name}. ${assembly.notes}` }
    : blankWallAssignment(UNASSIGNED_SURFACE);
  return updateInterfaceAssignment(project, key, next);
}

export function createBlankProject(): Project {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    id: createId('prj'),
    name: 'Untitled project',
    location: '',
    buildingType: 'restaurant',
    subtype: '',
    units: 'IP',
    details: '',
    createdFrom: { kind: 'blank', label: 'Blank project' },
    rooms: [],
    systems: [],
    equipment: [],
    wallRuns: [],
    preliminary: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function cloneProject(source: Project, overrides?: Partial<Project>): Project {
  const roomIds = new Map<string, string>();
  const systemIds = new Map<string, string>();
  const rooms = source.rooms.map(room => {
    const id = createId('room');
    roomIds.set(room.id, id);
    return {
      ...room,
      id,
      surfaces: {
        floor: cloneSurface(room.surfaces.floor),
        walls: {
          px: cloneSurface(room.surfaces.walls.px),
          nx: cloneSurface(room.surfaces.walls.nx),
          py: cloneSurface(room.surfaces.walls.py),
          ny: cloneSurface(room.surfaces.walls.ny),
        },
        ceiling: cloneSurface(room.surfaces.ceiling),
      },
      openings: room.openings.map(opening => ({ ...opening, id: createId('open') })),
    };
  });
  const systems = source.systems.map(system => {
    const id = createId('sys');
    systemIds.set(system.id, id);
    return { ...system, id };
  });
  const equipment = source.equipment.map(item => ({
    ...item,
    id: createId('eq'),
    roomId: item.roomId ? (roomIds.get(item.roomId) ?? null) : null,
    systemId: item.systemId ? (systemIds.get(item.systemId) ?? null) : null,
  }));
  const timestamp = nowIso();
  return {
    ...source,
    ...overrides,
    id: createId('prj'),
    rooms,
    systems,
    equipment,
    wallRuns: (source.wallRuns ?? []).map(run => ({
      ...run,
      id: createId('wall'),
      openings: run.openings.map(opening => ({ ...opening, id: createId('open') })),
    })),
    interfaceWalls: source.interfaceWalls
      ? Object.fromEntries(
          Object.entries(source.interfaceWalls).flatMap(([key, assignment]) => {
            const next = remapInterfaceWallKey(key, roomIds);
            return next ? [[next, cloneWallAssignment(assignment)]] : [];
          }),
        )
      : undefined,
    preliminary: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildDrawnRoom(origin: { xM: number; yM: number; lengthM: number; widthM: number }, index: number): Room {
  return {
    id: createId('room'),
    name: `Space ${index + 1}`,
    use: 'Unassigned',
    xM: origin.xM,
    yM: origin.yM,
    zM: 0,
    lengthM: origin.lengthM,
    widthM: origin.widthM,
    heightM: 3.05,
    surfaces: blankSurfaces(),
    openings: [],
    assumption: false,
  };
}

export function buildOutlineRoom(points: { x: number; y: number }[], index: number): Room | null {
  const outline = points.map(point => ({ x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)) }));
  if (!outlineRoomOk(outline)) return null;
  const xs = outline.map(point => point.x);
  const ys = outline.map(point => point.y);
  const xM = Math.min(...xs);
  const yM = Math.min(...ys);
  return {
    ...buildDrawnRoom(
      { xM, yM, lengthM: Number((Math.max(...xs) - xM).toFixed(3)), widthM: Number((Math.max(...ys) - yM).toFixed(3)) },
      index,
    ),
    outline,
  };
}

export function buildDimensionedRoom(count: number): Room {
  const column = count;
  return buildDrawnRoom({ xM: column * 4.5, yM: 0, lengthM: 4, widthM: 3 }, count);
}

export function addOpening(room: Room, kind: OpeningKind, face?: WallFace, offsetM?: number): Room {
  const assembly = kind === 'window' ? builtinAssembly('asm-window-dining') : kind === 'door' ? builtinAssembly('asm-door-restaurant') : undefined;
  const host = face ?? (kind === 'window' ? 'ny' : 'px');
  const opening: Opening =
    kind === 'window'
      ? { id: createId('open'), kind, face: host, offsetM: offsetM ?? 0.4, widthM: 1.2, heightM: 1.2, sillM: 0.9, constructionId: assembly?.id ?? null, layers: assembly ? cloneLayers(assembly.layers) : [] }
      : {
          id: createId('open'),
          kind,
          face: host,
          offsetM: offsetM ?? 0.3,
          widthM: kind === 'door' ? 0.9 : 1,
          heightM: 2.13,
          sillM: 0,
          constructionId: assembly?.id ?? null,
          layers: assembly ? cloneLayers(assembly.layers) : [],
        };
  return { ...room, openings: [...room.openings, opening] };
}

const TOUCH_M = 0.08;

function partnerFace(room: Room, face: WallFace, other: Room): WallFace | null {
  const plane = face === 'px' ? room.xM + room.lengthM : face === 'nx' ? room.xM : face === 'py' ? room.yM + room.widthM : room.yM;
  if (face === 'px' || face === 'nx') {
    const right = Math.abs(other.xM + other.lengthM - plane);
    const left = Math.abs(other.xM - plane);
    if (right > TOUCH_M && left > TOUCH_M) return null;
    return right <= left ? 'px' : 'nx';
  }
  const top = Math.abs(other.yM + other.widthM - plane);
  const bottom = Math.abs(other.yM - plane);
  if (top > TOUCH_M && bottom > TOUCH_M) return null;
  return top <= bottom ? 'py' : 'ny';
}

function openingOverlaps(start: number, width: number, openings: { offsetM: number; widthM: number; face?: WallFace }[], face?: WallFace): boolean {
  return openings.some(opening => (face === undefined || opening.face === face) && start < opening.offsetM + opening.widthM - 0.02 && start + width > opening.offsetM + 0.02);
}

export function placeOpeningOnRoom(project: Project, roomId: string, kind: 'door' | 'window', face: WallFace, offsetM: number): Project {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return project;
  const width = openingWidth(kind);
  const span = face === 'px' || face === 'nx' ? room.widthM : room.lengthM;
  if (offsetM < -0.02 || offsetM + width > span + 0.02) return project;
  if (openingOverlaps(offsetM, width, room.openings, face)) return project;
  let rooms = project.rooms.map(item => (item.id === roomId ? addOpening(item, kind, face, offsetM) : item));
  const hostStart = (face === 'px' || face === 'nx' ? room.yM : room.xM) + offsetM;
  for (const other of touchingRooms(room, face, project.rooms)) {
    const shared = partnerFace(room, face, other);
    if (!shared) continue;
    const origin = shared === 'px' || shared === 'nx' ? other.yM : other.xM;
    const otherSpan = shared === 'px' || shared === 'nx' ? other.widthM : other.lengthM;
    const partnerOffset = Number((hostStart - origin).toFixed(3));
    if (partnerOffset < -0.05 || partnerOffset + width > otherSpan + 0.05) continue;
    if (openingOverlaps(partnerOffset, width, other.openings, shared)) continue;
    rooms = rooms.map(item => (item.id === other.id ? addOpening(item, kind, shared, partnerOffset) : item));
  }
  return { ...project, rooms };
}

export function addWallRun(project: Project, line: { x0: number; y0: number; x1: number; y1: number }): Project {
  const x0 = Number(line.x0.toFixed(3));
  const y0 = Number(line.y0.toFixed(3));
  const x1 = Number(line.x1.toFixed(3));
  const y1 = Number(line.y1.toFixed(3));
  if (Math.hypot(x1 - x0, y1 - y0) < 0.4) return project;
  const run: WallRun = { id: createId('wall'), x0, y0, x1, y1, openings: [] };
  return { ...project, wallRuns: [...(project.wallRuns ?? []), run] };
}

export function addWallRunOpening(project: Project, wallId: string, kind: 'door' | 'window', offsetM: number): Project {
  const run = (project.wallRuns ?? []).find(item => item.id === wallId);
  if (!run) return project;
  const width = openingWidth(kind);
  const length = Math.hypot(run.x1 - run.x0, run.y1 - run.y0);
  if (offsetM < -0.02 || offsetM + width > length + 0.02) return project;
  if (openingOverlaps(offsetM, width, run.openings)) return project;
  return {
    ...project,
    wallRuns: (project.wallRuns ?? []).map(item =>
      item.id === wallId
        ? {
            ...item,
            openings: [
              ...item.openings,
              {
                id: createId('open'),
                kind,
                offsetM,
                widthM: width,
                heightM: kind === 'door' ? 2.13 : 1.2,
                sillM: kind === 'door' ? 0 : 0.9,
              },
            ],
          }
        : item,
    ),
  };
}

export function removeWallRun(project: Project, id: string): Project {
  return { ...project, wallRuns: (project.wallRuns ?? []).filter(run => run.id !== id) };
}

export function removeWallRunOpening(project: Project, wallId: string, id: string): Project {
  return {
    ...project,
    wallRuns: (project.wallRuns ?? []).map(run => (run.id === wallId ? { ...run, openings: run.openings.filter(opening => opening.id !== id) } : run)),
  };
}

export function translateRoom(room: Room, dx: number, dy: number): Room {
  const outline = room.outline?.map(point => ({ x: Number((point.x + dx).toFixed(3)), y: Number((point.y + dy).toFixed(3)) }));
  return {
    ...room,
    xM: Number((room.xM + dx).toFixed(3)),
    yM: Number((room.yM + dy).toFixed(3)),
    ...(outline ? { outline } : {}),
    assumption: false,
  };
}

export function updateRoom(project: Project, roomId: string, patch: Partial<Room>): Project {
  return {
    ...project,
    rooms: project.rooms.map(room => (room.id === roomId ? { ...room, ...patch } : room)),
  };
}

export function removeRoom(project: Project, roomId: string): Project {
  return {
    ...project,
    rooms: project.rooms.filter(room => room.id !== roomId),
    equipment: project.equipment.map(item => (item.roomId === roomId ? { ...item, roomId: null } : item)),
  };
}

export function duplicateRoom(project: Project, roomId: string): Project {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return project;
  const copy: Room = {
    ...room,
    id: createId('room'),
    name: `${room.name} copy`,
    xM: room.xM + 0.5,
    yM: room.yM + 0.5,
    surfaces: {
      floor: cloneSurface(room.surfaces.floor),
      walls: {
        px: cloneSurface(room.surfaces.walls.px),
        nx: cloneSurface(room.surfaces.walls.nx),
        py: cloneSurface(room.surfaces.walls.py),
        ny: cloneSurface(room.surfaces.walls.ny),
      },
      ceiling: cloneSurface(room.surfaces.ceiling),
    },
    openings: room.openings.map(opening => ({ ...opening, id: createId('open'), layers: opening.layers ? cloneLayers(opening.layers) : undefined })),
    outline: room.outline?.map(point => ({ x: Number((point.x + 0.5).toFixed(3)), y: Number((point.y + 0.5).toFixed(3)) })),
    edgeWalls: room.edgeWalls?.map(item => cloneWallAssignment(item)),
  };
  return { ...project, rooms: [...project.rooms, copy] };
}

export function placementZ(room: Room | null, product: CatalogProduct): number {
  const height = product.dimensions?.heightM ?? 0.6;
  if (!room || product.mount === 'grade') return room?.zM ?? 0;
  if (product.mount === 'ceiling') return room.zM + Math.max(0, room.heightM - height);
  return room.zM + room.heightM;
}

export function roomAtPoint(rooms: readonly Room[], xM: number, yM: number): Room | null {
  const hits = rooms.filter(room => {
    if (room.outline && room.outline.length >= 3) return pointInOutline(room.outline, xM, yM);
    return xM >= room.xM && xM <= room.xM + room.lengthM && yM >= room.yM && yM <= room.yM + room.widthM;
  });
  hits.sort((a, b) => (a.outline ? polygonArea(a.outline) : a.lengthM * a.widthM) - (b.outline ? polygonArea(b.outline) : b.lengthM * b.widthM));
  return hits[0] ?? null;
}

export function buildPlacement(
  product: CatalogProduct,
  room: Room | null,
  point: { xM: number; yM: number }
): PlacedEquipment {
  return {
    id: createId('eq'),
    catalogId: product.id,
    roomId: room?.id ?? null,
    systemId: null,
    xM: point.xM,
    yM: point.yM,
    zM: placementZ(room, product),
    yawDeg: 0,
    quantity: 1,
    notes: '',
    assumption: true,
  };
}

export function updateEquipment(project: Project, id: string, patch: Partial<PlacedEquipment>): Project {
  return {
    ...project,
    equipment: project.equipment.map(item => (item.id === id ? { ...item, ...patch } : item)),
  };
}

export function assignEquipmentRoom(project: Project, id: string, roomId: string | null): Project {
  const item = project.equipment.find(entry => entry.id === id);
  const product = item ? getProduct(item.catalogId) : undefined;
  const room = roomId ? (project.rooms.find(entry => entry.id === roomId) ?? null) : null;
  const patch: Partial<PlacedEquipment> = { roomId };
  if (item && product) patch.zM = placementZ(room, product);
  return updateEquipment(project, id, patch);
}

export function duplicateEquipment(project: Project, id: string): Project {
  const item = project.equipment.find(entry => entry.id === id);
  if (!item) return project;
  return {
    ...project,
    equipment: [...project.equipment, { ...item, id: createId('eq'), xM: item.xM + 0.5 }],
  };
}

export function removeEquipment(project: Project, id: string): Project {
  return { ...project, equipment: project.equipment.filter(item => item.id !== id) };
}

export function addSystem(project: Project, kind: SystemKind = 'other'): Project {
  const system: HvacSystem = { id: createId('sys'), name: 'New system', kind, notes: '' };
  return { ...project, systems: [...project.systems, system] };
}

export function updateSystem(project: Project, id: string, patch: Partial<HvacSystem>): Project {
  return {
    ...project,
    systems: project.systems.map(system => (system.id === id ? { ...system, ...patch } : system)),
  };
}

export function removeSystem(project: Project, id: string): Project {
  return {
    ...project,
    systems: project.systems.filter(system => system.id !== id),
    equipment: project.equipment.map(item => (item.systemId === id ? { ...item, systemId: null } : item)),
  };
}

export function footprintOutsideRoom(item: PlacedEquipment, room: Room | undefined): boolean {
  if (!room) return false;
  return item.xM < room.xM || item.xM > room.xM + room.lengthM || item.yM < room.yM || item.yM > room.yM + room.widthM;
}
