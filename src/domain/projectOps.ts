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
} from './types';
import { blankWallAssignment, cloneWallAssignment } from './walls';

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

export function buildDimensionedRoom(count: number): Room {
  const column = count;
  return buildDrawnRoom({ xM: column * 4.5, yM: 0, lengthM: 4, widthM: 3 }, count);
}

export function addOpening(room: Room, kind: OpeningKind, face?: WallFace): Room {
  const assembly = kind === 'window' ? builtinAssembly('asm-window-dining') : kind === 'door' ? builtinAssembly('asm-door-restaurant') : undefined;
  const host = face ?? (kind === 'window' ? 'ny' : 'px');
  const opening: Opening =
    kind === 'window'
      ? { id: createId('open'), kind, face: host, offsetM: 0.4, widthM: 1.2, heightM: 1.2, sillM: 0.9, constructionId: assembly?.id ?? null, layers: assembly ? cloneLayers(assembly.layers) : [] }
      : {
          id: createId('open'),
          kind,
          face: host,
          offsetM: 0.3,
          widthM: kind === 'door' ? 0.9 : 1,
          heightM: 2.13,
          sillM: 0,
          constructionId: assembly?.id ?? null,
          layers: assembly ? cloneLayers(assembly.layers) : [],
        };
  return { ...room, openings: [...room.openings, opening] };
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
  const hits = rooms.filter(
    room => xM >= room.xM && xM <= room.xM + room.lengthM && yM >= room.yM && yM <= room.yM + room.widthM
  );
  hits.sort((a, b) => a.lengthM * a.widthM - b.lengthM * b.widthM);
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
