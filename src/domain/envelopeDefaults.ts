/**
 * Defaults and suggestions for construction components, and the floor finishes.
 *
 * - Templates: `defaultAssemblyId` gives the component a room of a given use starts with (the restaurant
 *   template's picks, unchanged).
 * - Pickers: `suggestFor` lists components first under "Suggested", from where the surface sits (read from the
 *   plan), the project's Construction setting, and wet or cold rooms. The reason shows on hover.
 *
 * Every choice is a planning assumption: the user confirms the actual construction.
 */
import { builtinAssembly, cloneLayers } from './constructionLibrary';
import type { BuildingConstruction, Project, Room, StackLayer } from './types';

type Face = 'floor' | 'wall' | 'shared' | 'ceiling';

/** The restaurant template's picks per room use: floor, outside wall, shared wall, ceiling. */
type UseDefaults = Record<Face, string>;

const DINING: UseDefaults = { floor: 'asm-floor-dining', wall: 'asm-wall-dining', shared: 'asm-wall-partition', ceiling: 'asm-ceiling-dining' };
const KITCHEN: UseDefaults = { floor: 'asm-floor-kitchen', wall: 'asm-wall-kitchen', shared: 'asm-wall-partition', ceiling: 'asm-ceiling-kitchen' };
const SERVICE: UseDefaults = { floor: 'asm-floor-service', wall: 'asm-wall-kitchen', shared: 'asm-wall-partition', ceiling: 'asm-ceiling-dining' };

const TEMPLATE_DEFAULTS: Record<string, UseDefaults> = {
  Dining: DINING,
  Bar: DINING,
  Office: DINING,
  Kitchen: KITCHEN,
  'Hot line': KITCHEN,
  Prep: KITCHEN,
  Dish: KITCHEN,
  Restroom: KITCHEN,
  'Walk-in': { floor: 'asm-floor-walkin', wall: 'asm-wall-walkin', shared: 'asm-wall-walkin', ceiling: 'asm-ceiling-walkin' },
  Corridor: SERVICE,
  Service: SERVICE,
  Storage: SERVICE,
  'Dry storage': SERVICE,
};

/** For uses with no row: a bare slab, a framed exterior, a partition, and a dropped ceiling. */
const FALLBACK: UseDefaults = { floor: 'asm-floor-service', wall: 'asm-wall-dining', shared: 'asm-wall-partition', ceiling: 'asm-ceiling-dining' };

/** The component a template gives a surface of a room with this use. */
export function defaultAssemblyId(use: string, face: Face): string {
  return (TEMPLATE_DEFAULTS[use] ?? FALLBACK)[face];
}

/** The building shells a project can choose, in the order the Construction picker lists them. */
export const BUILDING_CONSTRUCTIONS: { id: BuildingConstruction; label: string }[] = [
  { id: 'steel-frame', label: 'Steel frame, brick or panel cladding' },
  { id: 'concrete', label: 'Concrete, tilt-up or precast' },
  { id: 'masonry', label: 'Masonry, block or brick walls' },
  { id: 'metal-building', label: 'Metal building, pre-engineered' },
  { id: 'wood-frame', label: 'Wood frame' },
];

const CONSTRUCTION_SHORT: Record<BuildingConstruction, string> = {
  'steel-frame': 'steel frame',
  concrete: 'concrete',
  masonry: 'masonry',
  'metal-building': 'metal building',
  'wood-frame': 'wood frame',
};

export function projectConstruction(project: Pick<Project, 'construction'>): BuildingConstruction | null {
  return BUILDING_CONSTRUCTIONS.find(item => item.id === project.construction)?.id ?? null;
}

/**
 * Uses that need a particular surface whatever the building: wet rooms get tile and a washable ceiling, cold rooms
 * get insulated panels. Every other use gets no special treatment. Add generic space types here as they land.
 */
const WET_USES = new Set(['Kitchen', 'Hot line', 'Prep', 'Dish', 'Restroom']);
const COLD_USES = new Set(['Walk-in']);

/** What lies around a room, read from the plan: another space below or above, or a raised floor over nothing. */
export interface RoomSituation {
  spaceBelow: boolean;
  spaceAbove: boolean;
  /** Above ground with no space under it: a floor over a garage, crawl space or open air. */
  raised: boolean;
}

/** A space this far above or below still counts as the next floor (a plenum or a slab between them). */
const STOREY_GAP_M = 2;
const TOUCH_M = 0.3;
const MIN_OVERLAP_M2 = 0.5;

export function roomSituation(room: Room, rooms: Room[]): RoomSituation {
  const top = room.zM + room.heightM;
  const overlaps = (other: Room) => {
    const dx = Math.min(room.xM + room.lengthM, other.xM + other.lengthM) - Math.max(room.xM, other.xM);
    const dy = Math.min(room.yM + room.widthM, other.yM + other.widthM) - Math.max(room.yM, other.yM);
    return dx > 0 && dy > 0 && dx * dy >= MIN_OVERLAP_M2;
  };
  const others = rooms.filter(other => other.id !== room.id && overlaps(other));
  const spaceBelow = others.some(other => {
    const otherTop = other.zM + other.heightM;
    return otherTop <= room.zM + TOUCH_M && otherTop >= room.zM - STOREY_GAP_M;
  });
  const spaceAbove = others.some(other => other.zM >= top - TOUCH_M && other.zM <= top + STOREY_GAP_M);
  return { spaceBelow, spaceAbove, raised: !spaceBelow && room.zM > TOUCH_M };
}

export interface Suggestion {
  /** The picker group's label. */
  label: string;
  /** Why these are suggested, shown on hover: where the surface sits and how the building is built. */
  reason: string;
  ids: string[];
}

type SurfaceKind = 'floor' | 'ceiling' | 'outside-wall' | 'shared-wall';

const OUTSIDE_WALLS: Record<BuildingConstruction | 'unset', string[]> = {
  'steel-frame': ['asm-wall-dining', 'asm-wall-glass'],
  concrete: ['asm-wall-precast', 'asm-wall-glass'],
  masonry: ['asm-wall-kitchen', 'asm-wall-glass'],
  'metal-building': ['asm-wall-metal-building', 'asm-wall-imp'],
  'wood-frame': ['asm-wall-wood-stud', 'asm-wall-glass'],
  unset: ['asm-wall-dining', 'asm-wall-kitchen', 'asm-wall-precast', 'asm-wall-wood-stud', 'asm-wall-metal-building', 'asm-wall-glass'],
};

const TOP_CEILINGS: Record<BuildingConstruction | 'unset', string[]> = {
  'steel-frame': ['asm-ceiling-dining', 'asm-roof-flat'],
  concrete: ['asm-roof-flat', 'asm-ceiling-dining'],
  masonry: ['asm-ceiling-dining', 'asm-roof-flat'],
  'metal-building': ['asm-roof-metal-building', 'asm-ceiling-tile-metal'],
  'wood-frame': ['asm-ceiling-attic'],
  unset: ['asm-ceiling-dining', 'asm-roof-flat', 'asm-ceiling-tile-metal', 'asm-ceiling-attic'],
};

/**
 * Components to list first in a picker, worked out from where the surface sits (ground floor or upper floor, top
 * floor or a space above, outside or shared wall), the project's construction, and wet or cold rooms. Null when
 * nothing narrows the list (doors and windows).
 */
export function suggestFor(
  kind: SurfaceKind,
  context: { use: string; construction: BuildingConstruction | null; situation: RoomSituation }
): Suggestion | null {
  const { use, construction, situation } = context;
  const wet = WET_USES.has(use);
  const cold = COLD_USES.has(use);
  const shell = construction ?? 'unset';
  const reasons: string[] = [];
  let ids: string[] = [];
  if (kind === 'floor') {
    if (situation.spaceBelow) {
      reasons.push('Space below');
      ids = construction === 'wood-frame' ? ['asm-floor-wood-joist', 'asm-floor-deck'] : ['asm-floor-deck', 'asm-floor-wood-joist'];
    } else if (situation.raised) {
      reasons.push('Raised, nothing below');
      ids = ['asm-floor-over-unconditioned', construction === 'wood-frame' ? 'asm-floor-wood-joist' : 'asm-floor-deck'];
    } else {
      reasons.push('Ground floor');
      const heavy = construction === 'concrete' || construction === 'metal-building';
      ids = wet ? ['asm-floor-kitchen', 'asm-floor-service'] : heavy ? ['asm-floor-slab-6', 'asm-floor-service'] : ['asm-floor-service', 'asm-floor-slab-6'];
    }
    if (cold) ids = ['asm-floor-walkin', ...ids];
  } else if (kind === 'ceiling') {
    if (situation.spaceAbove) {
      reasons.push('Space above');
      ids = ['asm-ceiling-tile-floor'];
    } else {
      reasons.push('Top floor');
      ids = TOP_CEILINGS[shell];
      if (wet) ids = [construction === 'wood-frame' ? 'asm-ceiling-attic' : 'asm-ceiling-kitchen', ...ids];
    }
    if (cold) ids = ['asm-ceiling-walkin', 'asm-ceiling-walkin-freezer', ...ids];
  } else if (kind === 'outside-wall') {
    reasons.push('Outside wall');
    ids = OUTSIDE_WALLS[shell];
    if (cold) ids = ['asm-wall-walkin', 'asm-wall-walkin-freezer', ...ids];
  } else {
    reasons.push('Shared wall');
    ids = construction === 'masonry' || construction === 'concrete' ? ['asm-wall-partition-cmu', 'asm-wall-partition', 'asm-wall-partition-acoustic'] : ['asm-wall-partition', 'asm-wall-partition-acoustic', 'asm-wall-partition-cmu'];
    if (cold) ids = ['asm-wall-walkin', 'asm-wall-walkin-freezer', ...ids];
  }
  // Name the construction only where it changed the list.
  const shellMatters = kind === 'outside-wall' || (kind === 'ceiling' && !situation.spaceAbove) || kind === 'floor' || (kind === 'shared-wall' && (construction === 'masonry' || construction === 'concrete'));
  if (construction && shellMatters) reasons.push(CONSTRUCTION_SHORT[construction]);
  if (wet && kind !== 'outside-wall' && kind !== 'shared-wall') reasons.push('wet room');
  if (cold) reasons.push('cold room');
  const unique = [...new Set(ids)];
  return unique.length > 0 ? { label: 'Suggested', reason: reasons.join(' · '), ids: unique } : null;
}

/** The suggestion for one face of a room in a project. `shared` is for walls: true when another space is behind it. */
export function suggestForRoom(project: Project, room: Room, face: 'floor' | 'ceiling' | 'wall', shared = false): Suggestion | null {
  const kind: SurfaceKind = face === 'wall' ? (shared ? 'shared-wall' : 'outside-wall') : face;
  return suggestFor(kind, { use: room.use, construction: projectConstruction(project), situation: roomSituation(room, project.rooms) });
}

/** Finishes that can go on top of a floor. Floors run top to bottom, so the finish is the first layer. */
export const FLOOR_FINISHES: { id: string; label: string; materialId: string | null }[] = [
  { id: 'none', label: 'None (sealed or polished concrete)', materialId: null },
  { id: 'carpet', label: 'Carpet', materialId: 'floor-carpet-fibrous' },
  { id: 'tile', label: 'Ceramic or quarry tile', materialId: 'floor-tile' },
  { id: 'resilient', label: 'Vinyl, VCT, linoleum, or rubber', materialId: 'floor-resilient-tile' },
  { id: 'hardwood', label: 'Hardwood', materialId: 'floor-hardwood-34' },
];

const FINISH_MATERIALS = new Set(FLOOR_FINISHES.flatMap(item => (item.materialId ? [item.materialId] : [])));

/** Floors whose top can take a finish: not an insulated panel. */
export function acceptsFloorFinish(constructionId: string | null | undefined): boolean {
  const family = constructionId ? builtinAssembly(constructionId)?.family : undefined;
  return family !== 'floor-panel';
}

export function floorFinishOf(layers: StackLayer[]): string {
  const top = layers[0]?.materialId;
  return FLOOR_FINISHES.find(item => item.materialId && item.materialId === top)?.id ?? 'none';
}

/** The floor's layers with the top finish swapped, added, or removed. */
export function withFloorFinish(layers: StackLayer[], finishId: string): StackLayer[] {
  const below = layers.length > 0 && FINISH_MATERIALS.has(layers[0].materialId) ? layers.slice(1) : layers;
  const finish = FLOOR_FINISHES.find(item => item.id === finishId);
  return finish?.materialId ? [{ materialId: finish.materialId, thicknessMm: null, place: 'Finish' }, ...cloneLayers(below)] : cloneLayers(below);
}

/**
 * The built-in floor that matches these layers exactly, if one exists, so that picking tile on "Slab on grade 4 in"
 * shows "Slab on grade 4 in, tile" instead of a floor named for another finish.
 */
export function matchingFloorAssembly(layers: StackLayer[], candidates: { id: string; category: string; layers: StackLayer[] }[]): string | null {
  const key = (items: StackLayer[]) => items.map(layer => `${layer.materialId}@${layer.thicknessMm ?? ''}`).join('|');
  const target = key(layers);
  return candidates.find(item => item.category === 'floor' && key(item.layers) === target)?.id ?? null;
}
