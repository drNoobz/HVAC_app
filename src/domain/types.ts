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
  /** Air changes per hour. Missing or null uses the site default. */
  infiltrationAch?: number | null;
}

export type SiteNumberKey =
  | 'latitudeDeg'
  | 'longitudeDeg'
  | 'timeZoneH'
  | 'elevationM'
  | 'heatingDbC'
  | 'coolingDbC'
  | 'coolingWbC'
  | 'coolingRangeK'
  | 'windMs'
  | 'windDirDeg'
  | 'taub'
  | 'taud'
  | 'groundC'
  | 'infiltrationAch';

/** Outdoor design conditions and indoor targets. Temperatures °C, wind m/s, elevation m. */
export interface SiteClimate {
  station: string;
  /** Weather file the imported values came from. */
  fileName: string;
  /** North positive. */
  latitudeDeg: number | null;
  /** East positive. */
  longitudeDeg: number | null;
  /** Hours from GMT. */
  timeZoneH: number | null;
  elevationM: number | null;
  /** 99.6% annual heating dry bulb. */
  heatingDbC: number | null;
  /** 0.4% annual cooling dry bulb. */
  coolingDbC: number | null;
  /** Mean coincident wet bulb at the 0.4% dry bulb. */
  coolingWbC: number | null;
  /** Mean daily dry-bulb range in the cooling month. */
  coolingRangeK: number | null;
  coolingMonth: number;
  windMs: number | null;
  /** Degrees clockwise from north. */
  windDirDeg: number | null;
  /** Clear-sky optical depths for the cooling month. */
  taub: number | null;
  taud: number | null;
  /** ASHRAE edition the optical depths come from. The air-mass exponents differ. */
  tauEdition: '2009' | '2017';
  groundC: number | null;
  groundReflectance: number;
  surfaceColor: 'dark' | 'light';
  indoorCoolC: number;
  indoorCoolRh: number;
  indoorHeatC: number;
  /** Project default air changes per hour. */
  infiltrationAch: number | null;
  sources: Partial<Record<SiteNumberKey, 'file' | 'manual'>>;
}

export interface HvacSystem {
  id: string;
  name: string;
  kind: SystemKind;
  notes: string;
}

export type DuctService = 'supply' | 'return' | 'exhaust' | 'outdoor' | 'relief';

export type DuctShape = 'round' | 'rect';

/** Open end when both ids are null. A port end names the equipment connection. */
export interface DuctEnd {
  equipmentId: string | null;
  portId: string | null;
}

/** Where a duct centerline crosses a wall. Offset is meters along that wall. */
export interface DuctPenetration {
  wallRunId?: string;
  roomId?: string;
  edge?: number;
  face?: WallFace;
  offsetM: number;
}

export interface DuctRun {
  id: string;
  /** Duct catalog product. Empty on runs saved before the duct catalog. */
  catalogId: string;
  systemId: string;
  service: DuctService;
  shape: DuctShape;
  /** Round diameter, or rectangular width, meters. */
  widthM: number;
  /** Rectangular height, meters. Null when the shape is round. */
  heightM: number | null;
  /** Elevation of the horizontal centerline, meters. */
  zM: number;
  points: { x: number; y: number }[];
  start: DuctEnd;
  end: DuctEnd;
  penetrations: DuctPenetration[];
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

/** Where an override value came from. Missing fields fall back to the catalog default. */
export type LoadValueSource = 'manufacturer' | 'manual';

/** Per-unit replacement values. Per person, per appliance, or per m² for area loads. */
export interface LoadOverride {
  source: LoadValueSource;
  sensibleW: number | null;
  latentW: number | null;
  co2Ls: number | null;
  coMgS: number | null;
  note: string;
}

/** Heat, moisture, CO2, or CO source inside a space. */
export interface LoadItem {
  id: string;
  /** Load catalog id. */
  loadId: string;
  roomId: string | null;
  /** Plan position, meters. Center of the footprint when the appliance has a size. */
  xM: number;
  yM: number;
  /** Rotation about +Z, degrees. Used when the appliance has a footprint. */
  yawDeg: number;
  /** Plan length, meters. Null when not stated. */
  lengthM: number | null;
  /** Plan depth, meters. Null when not stated. */
  widthM: number | null;
  /** Height, meters. Null when not stated. Not drawn on the plan. */
  heightM: number | null;
  /** People, appliances, or fixtures. Ignored for area loads. */
  quantity: number;
  override: LoadOverride | null;
  notes: string;
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
  ducts?: DuctRun[];
  loads?: LoadItem[];
  site?: SiteClimate;
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
  | { kind: 'site' }
  | { kind: 'room'; id: string }
  | { kind: 'surface'; roomId: string; face: SurfaceFace; wallFace?: WallFace; edge?: number }
  | { kind: 'interface'; key: string }
  | { kind: 'opening'; roomId: string; id: string }
  | { kind: 'system'; id: string }
  | { kind: 'equipment'; id: string }
  | { kind: 'wallRun'; id: string }
  | { kind: 'wallOpening'; wallId: string; id: string }
  | { kind: 'duct'; id: string }
  | { kind: 'load'; id: string };

export type EditorTool =
  | { kind: 'select' }
  | { kind: 'draw' }
  | { kind: 'wall' }
  | { kind: 'door' }
  | { kind: 'window' }
  | { kind: 'duct'; catalogId: string; systemId: string; service: DuctService; shape: DuctShape; widthM: number; heightM: number | null }
  | { kind: 'place'; catalogId: string }
  | { kind: 'load'; loadId: string };

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
