import type { GeometryDocument } from './geometry';

export const THERMONODE_API_VERSION = 'v1' as const;

export const ADAPTER_IDENTITY = {
  service: 'hvac-app-thermonode-adapter',
  upstream: 'not-connected',
} as const;

export interface AdapterEnvelope {
  apiVersion: typeof THERMONODE_API_VERSION;
  service: typeof ADAPTER_IDENTITY.service;
  upstream: typeof ADAPTER_IDENTITY.upstream;
}

export interface QuantityV1<TUnit extends string> {
  value: number;
  unit: TUnit;
  basis: 'library-reference-constant';
}

export interface MaterialRecordV1 {
  key: string;
  name: string;
  libraryType: 'gas' | 'liquid' | 'solid';
  plannerGroup: 'fluid' | 'metal' | 'insulation';
  properties: {
    k: QuantityV1<'W/(m·K)'>;
    cp: QuantityV1<'J/(kg·K)'>;
    rho: QuantityV1<'kg/m³'>;
  };
  emissivity: null;
  source: {
    repository: 'ThermoNode';
    file: 'thermocore/src/library_materials_data.inc';
  };
}

export interface MaterialsResponseV1 extends AdapterEnvelope {
  materials: MaterialRecordV1[];
  limitations: string[];
}

export interface BuildingModelV1 {
  units: {
    length: 'm';
  };
  rooms: BuildingRoomV1[];
}

export interface BuildingRoomV1 {
  id: string;
  name: string;
  originM: { x: number; y: number; z: number };
  sizeM: { length: number; width: number; height: number };
  surfaces: {
    floor: string | null;
    ceiling: string | null;
    walls: string | null;
  };
  openings: BuildingOpeningV1[];
}

export interface BuildingOpeningV1 {
  id: string;
  kind: 'door' | 'window' | 'opening';
  face: 'px' | 'nx' | 'py' | 'ny';
  offsetM: number;
  widthM: number;
  heightM: number;
  sillM: number;
}

export interface ModelIssueV1 {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  subjectId?: string;
}

export interface SurfaceMaterialV1 {
  bodyId: string;
  roomId: string;
  face: 'floor' | 'ceiling' | 'walls';
  materialKey: string | null;
}

export interface ValidateModelRequestV1 {
  apiVersion: typeof THERMONODE_API_VERSION;
  model: BuildingModelV1;
}

export interface ValidateModelResponseV1 extends AdapterEnvelope {
  valid: boolean;
  solverInvoked: false;
  issues: ModelIssueV1[];
  geometryDocument: GeometryDocument;
  surfaceMaterials: SurfaceMaterialV1[];
  limitations: string[];
}

export type SimulationStatusV1 = 'unavailable' | 'queued' | 'running' | 'succeeded' | 'failed';

export interface SimulationRequestV1 {
  apiVersion: typeof THERMONODE_API_VERSION;
  model: BuildingModelV1;
  requestedAnalysis: 'steady-thermal';
}

export interface SimulationJobV1 extends AdapterEnvelope {
  accepted: false;
  jobId: string | null;
  status: SimulationStatusV1;
  solverInvoked: false;
  message: string;
  result: null;
}

export const ADAPTER_LIMITATIONS = [
  'These routes run inside the HVAC app. ThermoNode Lab does not publish this HTTP API.',
  'upstream is not-connected: the adapter does not call ThermoNode Lab, its WASM solver, or a remote ThermoNode service.',
  'GeometryDocument version 1 matches the extruded-rectangle schema in ThermoNode Lab. Openings are validated here and are not written into that document, which has no door or window entity.',
  'A ThermoNode solid has one material. Per-face assignments stay on surfaceMaterials. The body material is set only when floor, walls, and ceiling share one library key.',
  'Material numbers are reference constants from thermocore/src/library_materials_data.inc. Temperature-dependent properties are not evaluated.',
  'Equipment, catalogs, templates, and bills of materials are HVAC app data and are not part of this model.',
];

const WALL_FACES = new Set(['px', 'nx', 'py', 'ny']);
const OPENING_KINDS = new Set(['door', 'window', 'opening']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableKey(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseOpening(value: unknown): BuildingOpeningV1 | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.kind !== 'string' || typeof value.face !== 'string') return null;
  if (!OPENING_KINDS.has(value.kind) || !WALL_FACES.has(value.face)) return null;
  if (![value.offsetM, value.widthM, value.heightM, value.sillM].every(finiteNumber)) return null;
  return {
    id: value.id,
    kind: value.kind as BuildingOpeningV1['kind'],
    face: value.face as BuildingOpeningV1['face'],
    offsetM: value.offsetM as number,
    widthM: value.widthM as number,
    heightM: value.heightM as number,
    sillM: value.sillM as number,
  };
}

function parseRoom(value: unknown): BuildingRoomV1 | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (!isRecord(value.originM) || !isRecord(value.sizeM) || !isRecord(value.surfaces)) return null;
  const origin = value.originM;
  const size = value.sizeM;
  const surfaces = value.surfaces;
  if (![origin.x, origin.y, origin.z, size.length, size.width, size.height].every(finiteNumber)) return null;
  if (![surfaces.floor, surfaces.ceiling, surfaces.walls].every(nullableKey)) return null;
  if (!Array.isArray(value.openings)) return null;
  const openings: BuildingOpeningV1[] = [];
  for (const opening of value.openings) {
    const parsed = parseOpening(opening);
    if (!parsed) return null;
    openings.push(parsed);
  }
  return {
    id: value.id,
    name: value.name,
    originM: { x: origin.x as number, y: origin.y as number, z: origin.z as number },
    sizeM: { length: size.length as number, width: size.width as number, height: size.height as number },
    surfaces: {
      floor: surfaces.floor as string | null,
      ceiling: surfaces.ceiling as string | null,
      walls: surfaces.walls as string | null,
    },
    openings,
  };
}

export function parseBuildingModelV1(value: unknown): BuildingModelV1 | null {
  if (!isRecord(value) || !isRecord(value.units) || value.units.length !== 'm' || !Array.isArray(value.rooms)) return null;
  const rooms: BuildingRoomV1[] = [];
  for (const room of value.rooms) {
    const parsed = parseRoom(room);
    if (!parsed) return null;
    rooms.push(parsed);
  }
  return { units: { length: 'm' }, rooms };
}

export function parseValidateRequest(value: unknown): ValidateModelRequestV1 | null {
  if (!isRecord(value) || value.apiVersion !== 'v1') return null;
  const model = parseBuildingModelV1(value.model);
  if (!model) return null;
  return { apiVersion: 'v1', model };
}

export function parseSimulationRequest(value: unknown): SimulationRequestV1 | null {
  if (!isRecord(value) || value.apiVersion !== 'v1' || value.requestedAnalysis !== 'steady-thermal') return null;
  const model = parseBuildingModelV1(value.model);
  if (!model) return null;
  return { apiVersion: 'v1', model, requestedAnalysis: 'steady-thermal' };
}
