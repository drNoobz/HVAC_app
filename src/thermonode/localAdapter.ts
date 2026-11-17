import type { Project, SurfaceAssignment, WallFace } from '@/domain/types';
import type { GeometryDocument } from './geometry';
import { MATERIAL_SNAPSHOT, MATERIAL_SNAPSHOT_NOTE, materialByKey } from './materials';
import {
  ADAPTER_IDENTITY,
  ADAPTER_LIMITATIONS,
  type BuildingModelV1,
  type MaterialRecordV1,
  type MaterialsResponseV1,
  type ModelIssueV1,
  type SimulationJobV1,
  type SurfaceMaterialV1,
  type ValidateModelResponseV1,
} from './contract';

const WALL_FACES: WallFace[] = ['px', 'nx', 'py', 'ny'];

function sharedWallKey(walls: Record<WallFace, SurfaceAssignment>): string | null {
  const keys = WALL_FACES.map(face => walls[face].materialKey);
  return keys.every(key => key === keys[0]) ? (keys[0] ?? null) : null;
}

const UNAVAILABLE =
  'Solver execution is not connected in stage 1. ThermoNode Lab solves thermal networks in-browser through WASM; this app does not call that solver. No job was queued.';

export function listMaterials(): MaterialsResponseV1 {
  const materials: MaterialRecordV1[] = MATERIAL_SNAPSHOT.map(item => ({
    key: item.key,
    name: item.name,
    libraryType: item.libraryType,
    plannerGroup: item.plannerGroup,
    properties: {
      k: { value: item.k, unit: 'W/(m·K)', basis: 'library-reference-constant' },
      cp: { value: item.cp, unit: 'J/(kg·K)', basis: 'library-reference-constant' },
      rho: { value: item.rho, unit: 'kg/m³', basis: 'library-reference-constant' },
    },
    emissivity: null,
    source: { repository: 'ThermoNode', file: item.sourceFile },
  }));
  return {
    apiVersion: 'v1',
    ...ADAPTER_IDENTITY,
    materials,
    limitations: [MATERIAL_SNAPSHOT_NOTE, ...ADAPTER_LIMITATIONS],
  };
}

export function projectToBuildingModel(project: Project): BuildingModelV1 {
  return {
    units: { length: 'm' },
    rooms: project.rooms.map(room => ({
      id: room.id,
      name: room.name,
      originM: { x: room.xM, y: room.yM, z: room.zM },
      sizeM: { length: room.lengthM, width: room.widthM, height: room.heightM },
      surfaces: {
        floor: room.surfaces.floor.materialKey,
        ceiling: room.surfaces.ceiling.materialKey,
        walls: sharedWallKey(room.surfaces.walls),
      },
      openings: room.openings.map(opening => ({
        id: opening.id,
        kind: opening.kind,
        face: opening.face,
        offsetM: opening.offsetM,
        widthM: opening.widthM,
        heightM: opening.heightM,
        sillM: opening.sillM,
      })),
    })),
  };
}

export function toGeometryDocument(model: BuildingModelV1): { document: GeometryDocument; surfaces: SurfaceMaterialV1[] } {
  const sketches: GeometryDocument['sketches'] = [];
  const rectangles: GeometryDocument['rectangles'] = [];
  const bodies: GeometryDocument['bodies'] = [];
  const surfaces: SurfaceMaterialV1[] = [];
  for (const room of model.rooms) {
    const sketchId = `sketch-${room.id}`;
    const rectangleId = `rect-${room.id}`;
    const bodyId = `body-${room.id}`;
    const keys = [room.surfaces.floor, room.surfaces.ceiling, room.surfaces.walls];
    const shared = keys.every(key => key && key === keys[0]) ? keys[0] : null;
    sketches.push({
      id: sketchId,
      name: room.name,
      origin: { x: room.originM.x, y: room.originM.y, z: room.originM.z },
    });
    rectangles.push({
      id: rectangleId,
      sketchId,
      x: 0,
      y: 0,
      width: room.sizeM.length,
      height: room.sizeM.width,
    });
    bodies.push({
      id: bodyId,
      name: room.name,
      ...(shared ? { material: shared } : {}),
      placement: { x: room.originM.x, y: room.originM.y, z: room.originM.z },
      shape: { kind: 'extrudedRectangle', sketchId, rectangleId, distance: room.sizeM.height },
    });
    surfaces.push(
      { bodyId, roomId: room.id, face: 'floor', materialKey: room.surfaces.floor },
      { bodyId, roomId: room.id, face: 'walls', materialKey: room.surfaces.walls },
      { bodyId, roomId: room.id, face: 'ceiling', materialKey: room.surfaces.ceiling }
    );
  }
  return {
    document: { version: 1, sketches, rectangles, lines: [], circles: [], constraints: [], bodies, faceBoundaries: [] },
    surfaces,
  };
}

function overlapArea(a: BuildingModelV1['rooms'][number], b: BuildingModelV1['rooms'][number]): number {
  const x = Math.min(a.originM.x + a.sizeM.length, b.originM.x + b.sizeM.length) - Math.max(a.originM.x, b.originM.x);
  const y = Math.min(a.originM.y + a.sizeM.width, b.originM.y + b.sizeM.width) - Math.max(a.originM.y, b.originM.y);
  const z = Math.min(a.originM.z + a.sizeM.height, b.originM.z + b.sizeM.height) - Math.max(a.originM.z, b.originM.z);
  if (x <= 0.02 || y <= 0.02 || z <= 0.02) return 0;
  return x * y;
}

export function validateModel(model: BuildingModelV1): ValidateModelResponseV1 {
  const issues: ModelIssueV1[] = [];
  const seen = new Set<string>();
  model.rooms.forEach((room, index) => {
    if (seen.has(room.id)) {
      issues.push({ severity: 'error', code: 'duplicate-room', message: `Duplicate room id ${room.id}.`, subjectId: room.id });
    }
    seen.add(room.id);
    const size = room.sizeM;
    if (![size.length, size.width, size.height].every(value => value > 0 && value < 500)) {
      issues.push({
        severity: 'error',
        code: 'room-size',
        message: `${room.name || `Room ${index + 1}`} needs positive length, width, and height below 500 m.`,
        subjectId: room.id,
      });
    } else if (size.height < 2.1) {
      issues.push({
        severity: 'info',
        code: 'low-headroom',
        message: `${room.name} ceiling height is below 2.1 m. This is a geometry notice, not a code review.`,
        subjectId: room.id,
      });
    }
    (['floor', 'ceiling', 'walls'] as const).forEach(face => {
      const key = room.surfaces[face];
      if (!key) {
        issues.push({
          severity: 'info',
          code: 'unassigned-material',
          message: `${room.name} ${face} has no ThermoNode material.`,
          subjectId: room.id,
        });
        return;
      }
      const material = materialByKey(key);
      if (!material) {
        issues.push({
          severity: 'error',
          code: 'unknown-material',
          message: `${room.name} ${face} uses ${key}, which is not in the adapter material snapshot.`,
          subjectId: room.id,
        });
        return;
      }
      if (material.libraryType !== 'solid') {
        issues.push({
          severity: 'warning',
          code: 'fluid-surface',
          message: `${room.name} ${face} uses ${material.name}, a ${material.libraryType} in the ThermoNode library, as a surface material.`,
          subjectId: room.id,
        });
      }
    });
    const wallLength = (face: BuildingModelV1['rooms'][number]['openings'][number]['face']) =>
      face === 'px' || face === 'nx' ? room.sizeM.width : room.sizeM.length;
    room.openings.forEach(opening => {
      const span = wallLength(opening.face);
      if (opening.widthM <= 0 || opening.heightM <= 0) {
        issues.push({
          severity: 'error',
          code: 'opening-size',
          message: `${room.name} has an opening with a non-positive size.`,
          subjectId: opening.id,
        });
      }
      if (opening.offsetM < -1e-6 || opening.offsetM + opening.widthM > span + 1e-6) {
        issues.push({
          severity: 'error',
          code: 'opening-span',
          message: `${room.name} opening extends past the ${opening.face} wall.`,
          subjectId: opening.id,
        });
      }
      if (opening.sillM < -1e-6 || opening.sillM + opening.heightM > room.sizeM.height + 1e-6) {
        issues.push({
          severity: 'error',
          code: 'opening-height',
          message: `${room.name} opening extends past the ceiling or below the floor.`,
          subjectId: opening.id,
        });
      }
    });
  });
  for (let i = 0; i < model.rooms.length; i += 1) {
    for (let j = i + 1; j < model.rooms.length; j += 1) {
      const area = overlapArea(model.rooms[i], model.rooms[j]);
      if (area > 0.05) {
        issues.push({
          severity: 'warning',
          code: 'room-overlap',
          message: `${model.rooms[i].name} and ${model.rooms[j].name} overlap by about ${area.toFixed(2)} m² in plan. This is a geometry notice, not a solver result.`,
          subjectId: model.rooms[i].id,
        });
      }
    }
  }
  const mapped = toGeometryDocument(model);
  const valid = !issues.some(issue => issue.severity === 'error');
  return {
    apiVersion: 'v1',
    ...ADAPTER_IDENTITY,
    valid,
    solverInvoked: false,
    issues,
    geometryDocument: mapped.document,
    surfaceMaterials: mapped.surfaces,
    limitations: ADAPTER_LIMITATIONS,
  };
}

export function startSimulation(): SimulationJobV1 {
  return {
    apiVersion: 'v1',
    ...ADAPTER_IDENTITY,
    accepted: false,
    jobId: null,
    status: 'unavailable',
    solverInvoked: false,
    message: UNAVAILABLE,
    result: null,
  };
}

export function getSimulation(jobId: string): SimulationJobV1 {
  return {
    apiVersion: 'v1',
    ...ADAPTER_IDENTITY,
    accepted: false,
    jobId,
    status: 'unavailable',
    solverInvoked: false,
    message: `No simulation job store is connected in stage 1. ${jobId} was not found because no jobs are accepted.`,
    result: null,
  };
}
