export type BuildingType = 'restaurant' | 'commercial' | 'residential' | 'other';

export type UnitSystem = 'SI' | 'IP';

export type SurfaceFace = 'floor' | 'ceiling' | 'walls';

export type OpeningKind = 'door' | 'window' | 'opening';

/** Wall faces of a room box. On the plan, px is right, nx is left, py is top, ny is bottom. */
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
  /** Hinge at the minimum X or Y end of the opening, or the other end. Missing means the minimum end. */
  hinge?: 'start' | 'end';
  /** Leaf swings into this room, or out of it. Missing means into this room. */
  swing?: 'in' | 'out';
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
  surfaces: {
    floor: SurfaceAssignment;
    ceiling: SurfaceAssignment;
    /** One stack per face. Older projects stored a single shared wall and are copied onto all four faces when opened. */
    walls: Record<WallFace, SurfaceAssignment>;
  };
  openings: Opening[];
  /** Closed plan boundary. Missing means the axis-aligned box. */
  outline?: { x: number; y: number }[];
  /** One stack per outline edge, in the same order. Missing entries are unassigned. */
  edgeWalls?: SurfaceAssignment[];
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

export interface WallRunOpening {
  id: string;
  kind: 'door' | 'window';
  offsetM: number;
  widthM: number;
  heightM: number;
  sillM: number;
}

export interface WallRun {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  openings: WallRunOpening[];
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  location: string;
  buildingType: BuildingType;
  subtype: string;
  units: UnitSystem;
  /** Degrees clockwise from the top of the plan. Omitted or 0 means up is north. */
  northDeg?: number;
  details: string;
  createdFrom: ProjectOrigin;
  rooms: Room[];
  systems: HvacSystem[];
  equipment: PlacedEquipment[];
  wallRuns?: WallRun[];
  /** One stack per interface stretch, shared or outside air. The adapter checks the envelope and does not write these stacks into GeometryDocument. */
  interfaceWalls?: Record<string, SurfaceAssignment>;
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
  | { kind: 'surface'; roomId: string; face: SurfaceFace; wallFace?: WallFace; edge?: number }
  | { kind: 'interface'; key: string }
  | { kind: 'opening'; roomId: string; id: string }
  | { kind: 'system'; id: string }
  | { kind: 'equipment'; id: string }
  | { kind: 'wallRun'; id: string }
  | { kind: 'wallOpening'; wallId: string; id: string };

export type EditorTool =
  | { kind: 'select' }
  | { kind: 'draw' }
  | { kind: 'wall' }
  | { kind: 'door' }
  | { kind: 'window' }
  | { kind: 'place'; catalogId: string };

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
  { id: 'px', label: 'Right wall' },
  { id: 'nx', label: 'Left wall' },
  { id: 'py', label: 'Top wall' },
  { id: 'ny', label: 'Bottom wall' },
];

export const DISCLAIMER =
  'Preliminary planning information. Selections are not sized or checked by a thermal solver, and they are not a code-compliant design. Values marked assumption or not stated need confirmation.';
