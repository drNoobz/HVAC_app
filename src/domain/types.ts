export type BuildingType = 'restaurant' | 'commercial' | 'residential' | 'other';

export type UnitSystem = 'SI' | 'IP';

export type SurfaceFace = 'floor' | 'ceiling' | 'walls';

export type OpeningKind = 'door' | 'window' | 'opening';

/** Wall faces of a room box. +X/−X/+Y/−Y. Floor and ceiling are not opening hosts. */
export type WallFace = 'px' | 'nx' | 'py' | 'ny';

export type SystemKind =
  | 'kitchen-exhaust'
  | 'makeup-air'
  | 'comfort'
  | 'restroom-exhaust'
  | 'ventilation'
  | 'other';

/** One layer in a floor, wall, ceiling, roof, window, or door stack. */
export interface StackLayer {
  materialId: string;
  /** Null uses the library thickness for that material. */
  thicknessMm: number | null;
  /** Where this layer sits, such as "Outside veneer" or "Room side". */
  place: string;
}

export interface SurfaceAssignment {
  /** ThermoNode library id kept for the adapter. The material picker does not write this. */
  materialKey: string | null;
  /** Construction component id. Missing on projects saved before the construction library. */
  constructionId?: string | null;
  /** Layers in stack order. Missing on older projects; the component id still resolves a stack. */
  layers?: StackLayer[];
  note: string;
}

export interface Opening {
  id: string;
  kind: OpeningKind;
  face: WallFace;
  /** Distance along the wall from the minimum X or Y corner, meters. */
  offsetM: number;
  widthM: number;
  heightM: number;
  sillM: number;
  /** Construction component id for a door or window. A plain opening has none. */
  constructionId?: string | null;
  layers?: StackLayer[];
}

export interface Room {
  id: string;
  name: string;
  use: string;
  xM: number;
  yM: number;
  zM: number;
  /** Size along +X, meters. */
  lengthM: number;
  /** Size along +Y, meters. */
  widthM: number;
  /** Size along +Z, meters. */
  heightM: number;
  surfaces: Record<SurfaceFace, SurfaceAssignment>;
  openings: Opening[];
  /** True when the room came from a template or sample and has not been confirmed. */
  assumption: boolean;
}

export interface HvacSystem {
  id: string;
  name: string;
  kind: SystemKind;
  notes: string;
}

export interface PlacedEquipment {
  id: string;
  catalogId: string;
  roomId: string | null;
  systemId: string | null;
  /** Footprint center, meters. */
  xM: number;
  yM: number;
  /** Bottom of the footprint, meters. */
  zM: number;
  /** Rotation about +Z, degrees. */
  yawDeg: number;
  quantity: number;
  notes: string;
  assumption: boolean;
}

export interface ProjectOrigin {
  kind: 'blank' | 'template' | 'sample' | 'custom-template';
  templateId?: string;
  label: string;
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  location: string;
  buildingType: BuildingType;
  subtype: string;
  units: UnitSystem;
  details: string;
  createdFrom: ProjectOrigin;
  rooms: Room[];
  systems: HvacSystem[];
  equipment: PlacedEquipment[];
  /** Stage 1 projects stay preliminary. Solver sizing is not available. */
  preliminary: true;
  createdAt: string;
  updatedAt: string;
}

export interface StoredTemplate {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  project: Project;
}

export type Selection =
  | { kind: 'project' }
  | { kind: 'room'; id: string }
  | { kind: 'surface'; roomId: string; face: SurfaceFace; wallFace?: WallFace }
  | { kind: 'opening'; roomId: string; id: string }
  | { kind: 'system'; id: string }
  | { kind: 'equipment'; id: string };

export type EditorTool = { kind: 'select' } | { kind: 'draw' } | { kind: 'place'; catalogId: string };

export const BUILDING_TYPES: { id: BuildingType; label: string }[] = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'residential', label: 'Residential' },
  { id: 'other', label: 'Other' },
];

export const ROOM_USES = [
  'Unassigned',
  'Dining',
  'Bar',
  'Kitchen',
  'Hot line',
  'Prep',
  'Dish',
  'Walk-in',
  'Restroom',
  'Corridor',
  'Storage',
  'Dry storage',
  'Office',
  'Service',
  'Other',
] as const;

export const SYSTEM_KINDS: { id: SystemKind; label: string }[] = [
  { id: 'kitchen-exhaust', label: 'Kitchen exhaust' },
  { id: 'makeup-air', label: 'Make-up air' },
  { id: 'comfort', label: 'Heating and cooling' },
  { id: 'restroom-exhaust', label: 'Restroom exhaust' },
  { id: 'ventilation', label: 'Ventilation' },
  { id: 'other', label: 'Other' },
];

export const SURFACE_FACES: { id: SurfaceFace; label: string }[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'walls', label: 'Walls' },
  { id: 'ceiling', label: 'Ceiling' },
];

export const WALL_FACES: { id: WallFace; label: string }[] = [
  { id: 'px', label: '+X wall' },
  { id: 'nx', label: '−X wall' },
  { id: 'py', label: '+Y wall' },
  { id: 'ny', label: '−Y wall' },
];

export const DISCLAIMER =
  'Preliminary planning information. Selections are not sized or checked by a thermal solver, and they are not a code-compliant design. Values marked assumption or not stated need confirmation.';
