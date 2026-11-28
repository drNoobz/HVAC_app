/**
 * What the 3D view draws, as plain data: one list of pieces and labels built from the project with the same helpers
 * the Plan view uses, so the two views cannot drift apart. The 3D component only renders this list. Colours here
 * are the plan's data colours (hex); the renderer passes them through ink() / wash() for the theme.
 *
 * Every piece has a category, for the Visibility and graphics settings, the phase fade and the Layers menu.
 */
import { isUnit, placedPorts, unitSections } from './airUnits';
import { outdoorOpening, OUTSIDE_IN_COLOR, OUTSIDE_OUT_COLOR, terminalAirColor } from './airColors';
import { equipmentSizeM, getProduct } from './catalog';
import { SERVICE_COLOR } from './ductCatalog';
import { doorArc, doorHinge, doorSwingSide } from './doorSwing';
import { ductFlows, ductSizeLabel, ductViewOf, endRise, portWorld } from './ducts';
import { getLoadProduct, LOAD_CATEGORY_COLOR } from './loadCatalog';
import { loadLabel, loadPlanSize } from './loads';
import type { DuctService, Project, Room, Selection, WallFace } from './types';
import { formatArea, formatFlow } from './units';
import { fade, ink } from './theme';
import { LABEL_PRIORITY } from './viewRules';
import { outlineCentroid, polygonArea, runGeom, solidSpans, WALL_THICK_M } from './wallDraw';
import { edgePortions, facePortions, INTERFACE_COLOR, interfaceConstructionColor, MARK_COLOR, portionFill, portionInterfaceKey, roomFill } from './walls';

export type Vec3 = [number, number, number];

export type SceneCategory = 'walls' | 'floors' | 'ceilings' | 'openings' | 'equipment' | 'terminals' | 'ducts' | 'loads';

/** Which Layers row shows a category, and which phase-fade value applies to it (`stepFade` keys). */
export const SCENE_CATEGORIES: { id: SceneCategory; label: string; layer: 'spaces' | 'loads' | 'equipment' | 'ducts' }[] = [
  { id: 'walls', label: 'Walls', layer: 'spaces' },
  { id: 'floors', label: 'Floors', layer: 'spaces' },
  { id: 'ceilings', label: 'Ceilings and roofs', layer: 'spaces' },
  { id: 'openings', label: 'Doors and windows', layer: 'spaces' },
  { id: 'equipment', label: 'Equipment', layer: 'equipment' },
  { id: 'terminals', label: 'Air terminals', layer: 'equipment' },
  { id: 'ducts', label: 'Ducts', layer: 'ducts' },
  { id: 'loads', label: 'Loads', layer: 'loads' },
];

/** Building surfaces: the categories that ghost surfaces make see-through. */
export const SURFACE_CATEGORIES: readonly SceneCategory[] = ['walls', 'floors', 'ceilings', 'openings'];

interface PieceBase {
  key: string;
  category: SceneCategory;
  /** What a click selects. */
  pick: Selection;
  /** Plan data colour (hex). */
  color: string;
  /** Fills (floors, ceilings, loads) are washed in dark; everything else is inked. */
  fill?: boolean;
  /** For highlighting: the room a surface or opening belongs to, its interface stretch, its system. */
  roomId?: string;
  face?: 'floor' | 'ceiling' | 'walls';
  wallFace?: WallFace;
  edge?: number;
  interfaceKey?: string;
  systemId?: string | null;
  /** Glass and translucent leaves keep this opacity at most. */
  maxOpacity?: number;
  /** Draw crisp outline edges (boxes). */
  edges?: boolean;
  /** Painted marks (flow chevrons): flat colour, no lighting or shadow. */
  unlit?: boolean;
}

export type ScenePiece =
  | (PieceBase & { shape: 'box'; center: Vec3; size: Vec3; yaw: number })
  | (PieceBase & { shape: 'slab'; outline: { x: number; y: number }[]; z: number; depth: number })
  | (PieceBase & { shape: 'tube'; from: Vec3; to: Vec3; radius: number })
  | (PieceBase & { shape: 'beam'; from: Vec3; to: Vec3; width: number; height: number })
  | (PieceBase & { shape: 'ball'; at: Vec3; radius: number })
  | (PieceBase & { shape: 'cone'; at: Vec3; toward: Vec3; radius: number; length: number })
  | (PieceBase & { shape: 'puck'; at: Vec3; radius: number; height: number })
  | (PieceBase & { shape: 'chevron'; at: Vec3; yaw: number; width: number; length: number });

export interface SceneLabel {
  key: string;
  category: SceneCategory;
  text: string;
  detail?: string;
  at: Vec3;
  priority: number;
  /** Shown only with "Details on all items" or when its item is selected. */
  detailOnly: boolean;
  pick?: Selection;
  /** Text colour (hex data colour) for coloured tags such as OUTSIDE AIR. */
  color?: string;
}

export interface Scene3D {
  pieces: ScenePiece[];
  labels: SceneLabel[];
  /** Air types drawn, for the air key. */
  services: DuctService[];
  /** Bounding box of the rooms (or a default), for camera poses. */
  bounds: { min: Vec3; max: Vec3 };
}

const SHELL_M = 0.15;
const SLAB_M = 0.05;
const DRAWN_WALL_HEIGHT_M = 3.05;

type Panel = { u: number; v: number; du: number; dv: number };

function subtractPanel(panel: Panel, hole: Panel): Panel[] {
  const x0 = panel.u;
  const y0 = panel.v;
  const x1 = panel.u + panel.du;
  const y1 = panel.v + panel.dv;
  const ix0 = Math.max(x0, hole.u);
  const iy0 = Math.max(y0, hole.v);
  const ix1 = Math.min(x1, hole.u + hole.du);
  const iy1 = Math.min(y1, hole.v + hole.dv);
  if (ix1 <= ix0 + 1e-4 || iy1 <= iy0 + 1e-4) return [panel];
  const parts: Panel[] = [];
  if (iy0 > y0 + 0.01) parts.push({ u: x0, v: y0, du: x1 - x0, dv: iy0 - y0 });
  if (y1 > iy1 + 0.01) parts.push({ u: x0, v: iy1, du: x1 - x0, dv: y1 - iy1 });
  if (ix0 > x0 + 0.01) parts.push({ u: x0, v: iy0, du: ix0 - x0, dv: iy1 - iy0 });
  if (x1 > ix1 + 0.01) parts.push({ u: ix1, v: iy0, du: x1 - ix1, dv: iy1 - iy0 });
  return parts;
}

function wallPanels(span: number, height: number, openings: Room['openings']): Panel[] {
  let panels: Panel[] = [{ u: 0, v: 0, du: span, dv: height }];
  openings.forEach(opening => {
    const hole = { u: opening.offsetM, v: opening.sillM, du: opening.widthM, dv: opening.heightM };
    panels = panels.flatMap(panel => subtractPanel(panel, hole));
  });
  return panels;
}

function rectOutline(room: Room): { x: number; y: number }[] {
  return [
    { x: room.xM, y: room.yM },
    { x: room.xM + room.lengthM, y: room.yM },
    { x: room.xM + room.lengthM, y: room.yM + room.widthM },
    { x: room.xM, y: room.yM + room.widthM },
  ];
}

function insetRect(room: Room, inset: number): { x: number; y: number }[] {
  const ix = Math.min(inset, room.lengthM * 0.45);
  const iy = Math.min(inset, room.widthM * 0.45);
  return [
    { x: room.xM + ix, y: room.yM + iy },
    { x: room.xM + room.lengthM - ix, y: room.yM + iy },
    { x: room.xM + room.lengthM - ix, y: room.yM + room.widthM - iy },
    { x: room.xM + ix, y: room.yM + room.widthM - iy },
  ];
}

function surfaceColor(own: string | null, kind: 'interface' | 'outside', constructionId: string | null | undefined): string {
  return own ?? (kind === 'interface' ? INTERFACE_COLOR : portionFill(constructionId, 'outside'));
}

function addRoom(pieces: ScenePiece[], labels: SceneLabel[], project: Project, room: Room): void {
  const rooms = project.rooms;
  if (room.heightM <= 0) return;
  const outline = room.outline && room.outline.length >= 3 ? room.outline : room.lengthM > 0 && room.widthM > 0 ? rectOutline(room) : null;
  if (!outline) return;
  const fill = roomFill(room.use);
  const surface = { roomId: room.id, fill: true as const };
  // Rectangular rooms' slabs stop inside their walls, so floor and wall faces never fight for the same pixels.
  const slab = room.outline && room.outline.length >= 3 ? outline : insetRect(room, SHELL_M + 0.015);
  pieces.push({ key: `${room.id}:floor`, category: 'floors', shape: 'slab', outline: slab, z: room.zM + 0.012, depth: SLAB_M, color: fill, ...surface, face: 'floor', pick: { kind: 'surface', roomId: room.id, face: 'floor' } });
  pieces.push({ key: `${room.id}:ceiling`, category: 'ceilings', shape: 'slab', outline: slab, z: room.zM + room.heightM - SLAB_M, depth: SLAB_M, color: fill, ...surface, face: 'ceiling', pick: { kind: 'surface', roomId: room.id, face: 'ceiling' } });

  if (room.outline && room.outline.length >= 3) {
    const loop = room.outline;
    for (let edge = 0; edge < loop.length; edge += 1) {
      const a = loop[edge];
      const b = loop[(edge + 1) % loop.length];
      const geom = runGeom({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      if (geom.length < 0.05) continue;
      const constructionId = room.edgeWalls?.[edge]?.constructionId;
      const spans = edgePortions(room, edge, rooms);
      const list = spans.length > 0 ? spans : [{ startM: 0, endM: geom.length, kind: 'outside' as const, names: [], roomIds: [], anchors: [] }];
      list.forEach((portion, index) => {
        const length = portion.endM - portion.startM;
        if (length < 0.05) return;
        const mid = (portion.startM + portion.endM) / 2;
        const interfaceKey = portionInterfaceKey(room, portion, { edge }, spans) ?? undefined;
        const own = interfaceKey ? interfaceConstructionColor(project.interfaceWalls?.[interfaceKey]) : null;
        // Inset the wall into its own room so two rooms' walls sit side by side, not inside each other.
        const inward = { x: -geom.dy, y: geom.dx };
        const sign = polygonArea(loop) >= 0 ? 1 : -1;
        pieces.push({
          key: `${room.id}:e${edge}:${index}`,
          category: 'walls',
          shape: 'box',
          center: [a.x + geom.dx * mid + inward.x * sign * (SHELL_M / 2), a.y + geom.dy * mid + inward.y * sign * (SHELL_M / 2), room.zM + room.heightM / 2],
          size: [length, SHELL_M, room.heightM],
          yaw: Math.atan2(geom.dy, geom.dx),
          color: surfaceColor(own, portion.kind, constructionId),
          roomId: room.id,
          face: 'walls',
          edge,
          interfaceKey,
          edges: true,
          pick: interfaceKey ? { kind: 'interface', key: interfaceKey } : { kind: 'surface', roomId: room.id, face: 'walls', edge },
        });
      });
    }
  } else {
    (['px', 'nx', 'py', 'ny'] as const).forEach(face => {
      const alongX = face === 'py' || face === 'ny';
      const span = alongX ? room.lengthM : room.widthM;
      const trim = alongX ? Math.min(SHELL_M + 0.004, Math.max(0, span / 2 - 0.02)) : 0;
      const constructionId = room.surfaces.walls[face].constructionId;
      const portions = facePortions(room, face, rooms);
      wallPanels(span, room.heightM, room.openings.filter(opening => opening.face === face)).forEach((panel, panelIndex) => {
        let u = panel.u;
        let du = panel.du;
        if (trim > 0) {
          const u0 = Math.max(panel.u, trim);
          const u1 = Math.min(panel.u + panel.du, span - trim);
          if (u1 - u0 <= 0.01) return;
          u = u0;
          du = u1 - u0;
        }
        const slices = portions.flatMap(portion => {
          const s0 = Math.max(u, portion.startM);
          const s1 = Math.min(u + du, portion.endM);
          return s1 - s0 <= 0.01 ? [] : [{ u: s0, du: s1 - s0, kind: portion.kind, portion }];
        });
        (slices.length > 0 ? slices : [{ u, du, kind: 'outside' as const, portion: undefined }]).forEach((slice, sliceIndex) => {
          const x = alongX ? room.xM + slice.u + slice.du / 2 : face === 'px' ? room.xM + room.lengthM - SHELL_M / 2 : room.xM + SHELL_M / 2;
          const y = alongX ? (face === 'py' ? room.yM + room.widthM - SHELL_M / 2 : room.yM + SHELL_M / 2) : room.yM + slice.u + slice.du / 2;
          const interfaceKey = slice.portion ? portionInterfaceKey(room, slice.portion, { wallFace: face }, portions) ?? undefined : undefined;
          const own = interfaceKey ? interfaceConstructionColor(project.interfaceWalls?.[interfaceKey]) : null;
          pieces.push({
            key: `${room.id}:${face}:${panelIndex}:${sliceIndex}`,
            category: 'walls',
            shape: 'box',
            center: [x, y, room.zM + panel.v + panel.dv / 2],
            size: alongX ? [slice.du, SHELL_M, panel.dv] : [SHELL_M, slice.du, panel.dv],
            yaw: 0,
            color: surfaceColor(own, slice.kind, constructionId),
            roomId: room.id,
            face: 'walls',
            wallFace: face,
            interfaceKey,
            edges: true,
            pick: interfaceKey ? { kind: 'interface', key: interfaceKey } : { kind: 'surface', roomId: room.id, face: 'walls', wallFace: face },
          });
        });
      });
    });
    room.openings.forEach(opening => {
      const across = opening.face === 'px' || opening.face === 'nx';
      const z = room.zM + opening.sillM + opening.heightM / 2;
      let x = across ? (opening.face === 'px' ? room.xM + room.lengthM : room.xM) : room.xM + opening.offsetM + opening.widthM / 2;
      let y = across ? room.yM + opening.offsetM + opening.widthM / 2 : opening.face === 'py' ? room.yM + room.widthM : room.yM;
      if (opening.kind === 'door') {
        const arc = doorArc(opening.face, doorHinge(opening), doorSwingSide(opening));
        x += arc.nx * (SHELL_M / 2);
        y += arc.ny * (SHELL_M / 2);
      } else {
        if (opening.face === 'px') x -= SHELL_M / 2;
        if (opening.face === 'nx') x += SHELL_M / 2;
        if (opening.face === 'py') y -= SHELL_M / 2;
        if (opening.face === 'ny') y += SHELL_M / 2;
      }
      const door = opening.kind === 'door';
      const width = Math.max(opening.widthM, 0.05) * (door ? 0.94 : 0.9);
      const depth = door ? SHELL_M * 0.5 : SHELL_M * 0.22;
      const height = Math.max(opening.heightM, 0.05) * (door ? 0.97 : 0.9);
      pieces.push({
        key: `${room.id}:open:${opening.id}`,
        category: 'openings',
        shape: 'box',
        center: [x, y, z],
        size: across ? [depth, width, height] : [width, depth, height],
        yaw: 0,
        color: opening.kind === 'window' ? MARK_COLOR.window : door ? MARK_COLOR.door : MARK_COLOR.opening,
        roomId: room.id,
        maxOpacity: door ? 1 : 0.42,
        edges: true,
        pick: { kind: 'opening', roomId: room.id, id: opening.id },
      });
    });
  }

  const center = outlineCentroid(outline);
  const area = Math.abs(polygonArea(outline));
  labels.push({
    key: `${room.id}:label`,
    category: 'floors',
    text: room.name || 'Space',
    detail: formatArea(area, project.units),
    at: [center.x, center.y, room.zM + room.heightM + 0.35],
    priority: LABEL_PRIORITY.room,
    detailOnly: false,
    pick: { kind: 'room', id: room.id },
  });
}

function addDrawnWalls(pieces: ScenePiece[], project: Project): void {
  for (const run of project.wallRuns ?? []) {
    const geom = runGeom(run);
    if (geom.length < 0.05) continue;
    const yaw = Math.atan2(geom.dy, geom.dx);
    solidSpans(geom.length, run.openings).forEach(([start, end], index) => {
      const length = end - start;
      if (length < 0.02) return;
      const mid = (start + end) / 2;
      pieces.push({
        key: `${run.id}:${index}`,
        category: 'walls',
        shape: 'box',
        center: [geom.x0 + geom.dx * mid, geom.y0 + geom.dy * mid, DRAWN_WALL_HEIGHT_M / 2],
        size: [length, WALL_THICK_M, DRAWN_WALL_HEIGHT_M],
        yaw,
        color: INTERFACE_COLOR,
        edges: true,
        pick: { kind: 'wallRun', id: run.id },
      });
    });
    for (const opening of run.openings) {
      const mid = opening.offsetM + opening.widthM / 2;
      const door = opening.kind === 'door';
      const height = door ? 2.13 : 1.2;
      pieces.push({
        key: `${run.id}:open:${opening.id}`,
        category: 'openings',
        shape: 'box',
        center: [geom.x0 + geom.dx * mid, geom.y0 + geom.dy * mid, door ? height / 2 : 0.9 + height / 2],
        size: [opening.widthM, 0.04, height],
        yaw,
        color: door ? MARK_COLOR.door : MARK_COLOR.window,
        maxOpacity: door ? 1 : 0.42,
        edges: true,
        pick: { kind: 'wallOpening', wallId: run.id, id: opening.id },
      });
    }
  }
}

/** Gap between a duct's underside and the top of the terminal hanging from it: the neck. */
const NECK_M = 0.12;

/** A ceiling terminal fed by a duct: it hangs under the duct's end on a short neck, so the two always meet. */
interface Hang {
  /** Duct centreline height and depth at the terminal. */
  z: number;
  depth: number;
  neckRadius: number;
  color: string;
  runId: string;
  systemId: string | null;
}

function ductDepth(run: { shape: string; widthM: number; heightM?: number | null }): number {
  return run.shape === 'round' ? run.widthM : run.heightM ?? run.widthM * 0.67;
}

/** Where the 3D view draws an item's underside: ceiling items just under the ceiling slab, rooftop items on the roof. */
function drawnBottom(rooms: Map<string, Room>, item: Project['equipment'][number], hang: Hang | undefined): number {
  const product = getProduct(item.catalogId);
  const size = equipmentSizeM(product);
  const room = item.roomId ? rooms.get(item.roomId) : undefined;
  if (hang) return hang.z - hang.depth / 2 - NECK_M - size.heightM;
  if (product?.mount === 'ceiling') {
    const underside = (room ? room.zM + room.heightM : item.zM + size.heightM) - SLAB_M - 0.02;
    return Math.min(item.zM, underside - size.heightM);
  }
  if (product?.mount === 'roof') return Math.max(item.zM, (room ? room.zM + room.heightM : item.zM) + 0.03);
  return item.zM;
}

/**
 * Where a duct rises into a rooftop item: its connection pulled in under the casing by the duct's radius and a
 * margin, so the riser goes up into the underside rather than up the unit's edge.
 */
function roofEntry(item: { xM: number; yM: number }, at: { x: number; y: number }, radius: number): { x: number; y: number } {
  const distance = Math.hypot(item.xM - at.x, item.yM - at.y);
  if (distance < 1e-6) return at;
  const pull = Math.min(distance, radius + 0.1);
  return { x: at.x + ((item.xM - at.x) / distance) * pull, y: at.y + ((item.yM - at.y) / distance) * pull };
}

/** Half the larger cross-section dimension of a run: how far it reaches from its centreline. */
function ductReach(run: { shape: string; widthM: number; heightM?: number | null }): number {
  return Math.max(run.widthM, ductDepth(run)) / 2;
}

function hangingTerminals(project: Project): Map<string, Hang> {
  const items = new Map(project.equipment.map(item => [item.id, item]));
  const hangs = new Map<string, Hang>();
  for (const run of project.ducts ?? []) {
    if (ductViewOf(run) !== 'plan' || run.points.length < 2) continue;
    for (const end of [run.start, run.end]) {
      const item = end.equipmentId ? items.get(end.equipmentId) : undefined;
      const product = item ? getProduct(item.catalogId) : undefined;
      if (!item || product?.category !== 'air-terminal' || product.mount !== 'ceiling' || hangs.has(item.id)) continue;
      const size = equipmentSizeM(product);
      const depth = ductDepth(run);
      const duct = run.shape === 'round' ? run.widthM / 2 : (Math.min(run.widthM, depth) / 2) * 0.8;
      hangs.set(item.id, {
        z: run.zM,
        depth,
        neckRadius: Math.max(0.04, Math.min(duct, Math.min(size.lengthM, size.widthM) * 0.3)),
        color: SERVICE_COLOR[run.service],
        runId: run.id,
        systemId: run.systemId,
      });
    }
  }
  return hangs;
}

function addEquipment(pieces: ScenePiece[], labels: SceneLabel[], project: Project, hangs: Map<string, Hang>): void {
  const ducted = new Set<string>();
  // Each ducted connection of a rooftop item: where its riser enters the underside, and the duct's reach.
  const entries = new Map<string, { at: { x: number; y: number }; reach: number }>();
  const byId = new Map(project.equipment.map(item => [item.id, item]));
  for (const run of project.ducts ?? []) {
    ([['start', run.start], ['end', run.end]] as const).forEach(([which, end]) => {
      if (!end.equipmentId || !end.portId) return;
      ducted.add(`${end.equipmentId}|${end.portId}`);
      const item = byId.get(end.equipmentId);
      if (!item || ductViewOf(run) !== 'plan' || run.points.length < 2) return;
      const point = which === 'start' ? run.points[0] : run.points[run.points.length - 1];
      entries.set(`${end.equipmentId}|${end.portId}`, { at: roofEntry(item, point, ductReach(run)), reach: ductReach(run) });
    });
  }
  const rooms = new Map(project.rooms.map(room => [room.id, room]));
  for (const item of project.equipment) {
    const product = getProduct(item.catalogId);
    const size = equipmentSizeM(product);
    // Ceiling items hang just under the ceiling slab; rooftop items sit just on the roof.
    const hang = hangs.get(item.id);
    const bottom = drawnBottom(rooms, item, hang);
    const airColor = terminalAirColor(item.catalogId);
    const terminal = product?.category === 'air-terminal';
    const color = airColor ?? (size.stated ? MARK_COLOR.equipment : MARK_COLOR.unsized);
    const pick: Selection = { kind: 'equipment', id: item.id };
    const top = bottom + size.heightM;
    const yaw = (item.yawDeg * Math.PI) / 180;
    const base = { category: terminal ? ('terminals' as const) : ('equipment' as const), yaw, color, systemId: item.systemId, pick };
    if (terminal && product?.mount === 'ceiling') {
      // A ceiling diffuser or grille: a face plate with a plenum box above it, and a darker core on its face.
      const plate = Math.min(0.04, size.heightM * 0.3);
      pieces.push({ ...base, key: `eq:${item.id}`, shape: 'box', center: [item.xM, item.yM, bottom + plate / 2], size: [size.lengthM, size.widthM, plate], edges: true });
      pieces.push({ ...base, key: `eq:${item.id}:body`, shape: 'box', center: [item.xM, item.yM, bottom + plate + (size.heightM - plate) / 2], size: [size.lengthM * 0.76, size.widthM * 0.76, size.heightM - plate], edges: true });
      pieces.push({ ...base, key: `eq:${item.id}:core`, shape: 'box', center: [item.xM, item.yM, bottom - 0.003], size: [size.lengthM * 0.56, size.widthM * 0.56, 0.006], color: fade(color, 0.45), unlit: true });
    } else {
      pieces.push({ ...base, key: `eq:${item.id}`, shape: 'box', center: [item.xM, item.yM, bottom + size.heightM / 2], size: [size.lengthM, size.widthM, size.heightM], edges: true });
    }
    if (hang) {
      // The neck: from the top of the terminal up into the duct, part of the duct run.
      pieces.push({ key: `eq:${item.id}:neck`, category: 'ducts', shape: 'tube', from: [item.xM, item.yM, top - 0.01], to: [item.xM, item.yM, hang.z], radius: hang.neckRadius, color: hang.color, systemId: hang.systemId, pick: { kind: 'duct', id: hang.runId } });
    }
    const name = product ? product.model || product.name : 'Equipment';
    labels.push({
      key: `eq:${item.id}:label`,
      category: terminal ? 'terminals' : 'equipment',
      text: item.quantity > 1 ? `${name} ×${item.quantity}` : name,
      at: [item.xM, item.yM, top + 0.3],
      priority: LABEL_PRIORITY.equipment,
      detailOnly: true,
      pick,
    });

    // Units show where each duct joins: a stub in the colour of the air at that connection.
    if (product && isUnit(product)) {
      for (const port of placedPorts(item)) {
        const world = portWorld(item, port);
        if (!world) continue;
        // A rooftop unit's ducts rise through the roof into its underside, so its collars sit under it, pulled in
        // from the edge and sized to the duct. Others: on the side at mid-height when the port is on an edge, else
        // on top.
        const onEdge = Math.max(Math.abs(port.u), Math.abs(port.v)) >= 0.95;
        const roof = product.mount === 'roof';
        const entry = entries.get(`${item.id}|${port.id}`);
        const at = roof ? entry?.at ?? roofEntry(item, world, 0.16) : world;
        const side = roof && entry ? entry.reach * 2 + 0.08 : 0.32;
        const [stubZ, stubH] = roof ? [bottom - 0.06, 0.12] : onEdge ? [bottom + size.heightM / 2, 0.24] : [top + 0.06, 0.12];
        pieces.push({
          key: `eq:${item.id}:port:${port.id}`,
          category: 'equipment',
          shape: 'box',
          center: [at.x, at.y, stubZ],
          size: [side, side, stubH],
          yaw: (item.yawDeg * Math.PI) / 180,
          color: SERVICE_COLOR[port.service],
          systemId: item.systemId,
          pick,
        });
      }
    }

    // Where air crosses the envelope: a vertical arrow, green coming in, brown going out.
    const crossings: { role: 'oa' | 'ea'; x: number; y: number }[] = [];
    const opening = outdoorOpening(item.catalogId);
    if (opening) crossings.push({ role: opening, x: item.xM, y: item.yM });
    if (product?.unit) {
      const sections = unitSections(item);
      const rad = (item.yawDeg * Math.PI) / 180;
      const at = (u: number, v: number) => {
        const lx = (u * size.lengthM) / 2;
        const ly = (v * size.widthM) / 2;
        return { x: item.xM + lx * Math.cos(rad) - ly * Math.sin(rad), y: item.yM + lx * Math.sin(rad) + ly * Math.cos(rad) };
      };
      const oa = sections.find(section => section.kind === 'oa-damper');
      if (oa && (oa.ducted === false || !ducted.has(`${item.id}|${product.unit.portAt.oa.id}`))) crossings.push({ role: 'oa', ...at(product.unit.portAt.oa.u, product.unit.portAt.oa.v) });
      const ea = sections.find(section => section.kind === 'exhaust-damper' || section.kind === 'relief-fan');
      if (ea && (ea.ducted === false || !ducted.has(`${item.id}|${product.unit.portAt.ea.id}`))) crossings.push({ role: 'ea', ...at(product.unit.portAt.ea.u, product.unit.portAt.ea.v) });
    }
    crossings.forEach((crossing, index) => {
      const inward = crossing.role === 'oa';
      const arrowColor = inward ? OUTSIDE_IN_COLOR : OUTSIDE_OUT_COLOR;
      const base = top + 0.15;
      const length = 0.9;
      // In: the arrow points down at the item. Out: it points up, away from it.
      const tail: Vec3 = [crossing.x, crossing.y, inward ? base + length : base];
      const tip: Vec3 = [crossing.x, crossing.y, inward ? base : base + length];
      pieces.push({ key: `eq:${item.id}:oa:${index}:shaft`, category: terminal ? 'terminals' : 'equipment', shape: 'tube', from: tail, to: [tip[0], tip[1], inward ? tip[2] + 0.28 : tip[2] - 0.28], radius: 0.05, color: arrowColor, pick });
      pieces.push({ key: `eq:${item.id}:oa:${index}:head`, category: terminal ? 'terminals' : 'equipment', shape: 'cone', at: tip, toward: [0, 0, inward ? -1 : 1], radius: 0.16, length: 0.3, color: arrowColor, pick });
      labels.push({
        key: `eq:${item.id}:oa:${index}:label`,
        category: terminal ? 'terminals' : 'equipment',
        text: 'OUTSIDE AIR',
        at: [crossing.x, crossing.y, base + length + 0.25],
        priority: LABEL_PRIORITY.outside,
        detailOnly: false,
        color: arrowColor,
        pick,
      });
    });
  }
}

function addDucts(pieces: ScenePiece[], labels: SceneLabel[], project: Project, services: Set<DuctService>, hangs: Map<string, Hang>): void {
  const flows = ductFlows(project).runs;
  const nodes = new Map((project.ductNodes ?? []).map(node => [node.id, node]));
  const runs = (project.ducts ?? []).filter(run => ductViewOf(run) === 'plan' && run.points.length >= 2);
  const items = new Map(project.equipment.map(item => [item.id, item]));
  const rooms = new Map(project.rooms.map(room => [room.id, room]));
  // A tee or junction sits at the height of its largest run; smaller runs rise or drop to meet it.
  const jointAt = new Map<string, { at: Vec3; radius: number; color: string; run: string; systemId: string | null }>();
  for (const run of runs) {
    for (const end of [run.start, run.end]) {
      const node = end.nodeId ? nodes.get(end.nodeId) : undefined;
      if (!node) continue;
      const radius = Math.max(run.widthM, ductDepth(run)) / 2;
      const prev = jointAt.get(node.id);
      if (!prev || prev.radius < radius) jointAt.set(node.id, { at: [node.x, node.y, run.zM], radius, color: SERVICE_COLOR[run.service], run: run.id, systemId: run.systemId });
    }
  }
  for (const run of runs) {
    services.add(run.service);
    const color = SERVICE_COLOR[run.service];
    const round = run.shape === 'round';
    const depth = ductDepth(run);
    const z = run.zM;
    const pick: Selection = { kind: 'duct', id: run.id };
    const base = { category: 'ducts' as const, color, systemId: run.systemId, pick };
    const segment = (key: string, from: Vec3, to: Vec3) => {
      if (Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) < 0.01) return;
      pieces.push(round ? { ...base, key, shape: 'tube', from, to, radius: run.widthM / 2 } : { ...base, key, shape: 'beam', from, to, width: run.widthM, height: depth, edges: true });
    };
    const joint = (key: string, at: Vec3) => {
      if (round) pieces.push({ ...base, key, shape: 'ball', at, radius: run.widthM / 2 });
      else pieces.push({ ...base, key, shape: 'box', center: at, size: [run.widthM, run.widthM, depth], yaw: 0 });
    };
    run.points.forEach((point, index) => {
      if (index > 0) {
        const prev = run.points[index - 1];
        segment(`duct:${run.id}:${index}`, [prev.x, prev.y, z], [point.x, point.y, z]);
      }
      if (index > 0 && index < run.points.length - 1) joint(`duct:${run.id}:j${index}`, [point.x, point.y, z]);
    });
    // Each end meets what it connects to: a terminal hangs from an elbow; other equipment gets a riser (through the
    // roof to a rooftop unit); a tee sits at its largest run's height.
    (['start', 'end'] as const).forEach(which => {
      const point = which === 'start' ? run.points[0] : run.points[run.points.length - 1];
      const end = which === 'start' ? run.start : run.end;
      if (end.equipmentId && hangs.get(end.equipmentId)?.runId === run.id) {
        joint(`duct:${run.id}:${which}:elbow`, [point.x, point.y, z]);
        return;
      }
      // A rooftop item: carry on under its casing, then rise into its underside where the 3D view draws it.
      const item = end.equipmentId ? items.get(end.equipmentId) : undefined;
      if (item && getProduct(item.catalogId)?.mount === 'roof') {
        const entry = roofEntry(item, point, ductReach(run));
        const top = drawnBottom(rooms, item, undefined);
        segment(`duct:${run.id}:${which}:in`, [point.x, point.y, z], [entry.x, entry.y, z]);
        joint(`duct:${run.id}:${which}:bend`, [point.x, point.y, z]);
        if (top - z > 0.03) {
          joint(`duct:${run.id}:${which}:elbow`, [entry.x, entry.y, z]);
          segment(`duct:${run.id}:${which}:riser`, [entry.x, entry.y, z], [entry.x, entry.y, top]);
        }
        return;
      }
      const node = end.nodeId ? jointAt.get(end.nodeId) : undefined;
      const rise = node ? node.at[2] - z : endRise(project, run, which);
      if (Math.abs(rise) > 0.03) {
        joint(`duct:${run.id}:${which}:elbow`, [point.x, point.y, z]);
        segment(`duct:${run.id}:${which}:riser`, [point.x, point.y, z], [point.x, point.y, z + rise]);
      }
    });

    // Flow: chevrons painted on top of the duct, pointing the way the air moves (the air key's Flow mark), about
    // one every 3 m, in a tint of the duct's own colour.
    const flow = flows.get(run.id);
    if (flow?.toward) {
      const forward = flow.toward === 'end';
      const width = Math.min(0.45, Math.max(0.12, run.widthM * 0.62));
      for (let index = 1; index < run.points.length; index += 1) {
        const a = forward ? run.points[index - 1] : run.points[index];
        const b = forward ? run.points[index] : run.points[index - 1];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < width * 3) continue;
        const count = Math.max(1, Math.floor(length / 3));
        for (let step = 0; step < count; step += 1) {
          const t = (step + 0.5) / count;
          pieces.push({
            key: `duct:${run.id}:flow:${index}:${step}`,
            category: 'ducts',
            shape: 'chevron',
            at: [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z + depth / 2 + 0.006],
            yaw: Math.atan2(b.y - a.y, b.x - a.x),
            width,
            length: width * 0.55,
            color: `color-mix(in srgb, ${ink(color)}, var(--flow-mark) 60%)`,
            unlit: true,
            systemId: run.systemId,
            pick,
          });
        }
      }
    }

    // Label on the longest stretch: airflow and size, as on the plan.
    let best = 1;
    let bestLength = 0;
    for (let index = 1; index < run.points.length; index += 1) {
      const length = Math.hypot(run.points[index].x - run.points[index - 1].x, run.points[index].y - run.points[index - 1].y);
      if (length > bestLength) {
        bestLength = length;
        best = index;
      }
    }
    const a = run.points[best - 1];
    const b = run.points[best];
    const flowText = flow?.flowM3s != null && flow.flowM3s > 0 ? `${formatFlow(flow.flowM3s, project.units)}${flow.partial ? '+' : ''} · ` : '';
    labels.push({
      key: `duct:${run.id}:label`,
      category: 'ducts',
      text: `${flowText}${ductSizeLabel(run, project.units)}`,
      at: [(a.x + b.x) / 2, (a.y + b.y) / 2, z + depth / 2 + 0.25],
      priority: LABEL_PRIORITY.duct,
      detailOnly: true,
      pick,
    });
  }
  for (const [id, joint] of jointAt) {
    pieces.push({ key: `node:${id}`, category: 'ducts', shape: 'ball', at: joint.at, radius: joint.radius * 1.04, color: joint.color, systemId: joint.systemId, pick: { kind: 'duct', id: joint.run } });
  }
}

function addLoads(pieces: ScenePiece[], labels: SceneLabel[], project: Project): void {
  const rooms = new Map(project.rooms.map(room => [room.id, room]));
  for (const item of project.loads ?? []) {
    const product = getLoadProduct(item.loadId);
    const color = product ? LOAD_CATEGORY_COLOR[product.category] : '#7a7f85';
    const floor = (item.roomId ? rooms.get(item.roomId)?.zM : undefined) ?? 0;
    const size = loadPlanSize(item);
    const pick: Selection = { kind: 'load', id: item.id };
    let top = floor + 0.08;
    if (size) {
      const height = size.heightM ?? 0.9;
      top = floor + height;
      pieces.push({ key: `load:${item.id}`, category: 'loads', shape: 'box', center: [item.xM, item.yM, floor + SLAB_M + height / 2], size: [size.lengthM, size.widthM, height], yaw: (item.yawDeg * Math.PI) / 180, color, fill: true, edges: true, pick });
    } else {
      pieces.push({ key: `load:${item.id}`, category: 'loads', shape: 'puck', at: [item.xM, item.yM, floor + SLAB_M + 0.04], radius: 0.3, height: 0.08, color, pick });
    }
    labels.push({ key: `load:${item.id}:label`, category: 'loads', text: loadLabel(item, product), at: [item.xM, item.yM, top + 0.3], priority: LABEL_PRIORITY.load, detailOnly: true, pick });
  }
}

/** Everything the 3D view draws for a project. */
export function buildScene(project: Project): Scene3D {
  const pieces: ScenePiece[] = [];
  const labels: SceneLabel[] = [];
  const services = new Set<DuctService>();
  for (const room of project.rooms) addRoom(pieces, labels, project, room);
  addDrawnWalls(pieces, project);
  const hangs = hangingTerminals(project);
  addEquipment(pieces, labels, project, hangs);
  addDucts(pieces, labels, project, services, hangs);
  addLoads(pieces, labels, project);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const room of project.rooms) {
    const outline = room.outline && room.outline.length >= 3 ? room.outline : rectOutline(room);
    for (const point of outline) {
      min[0] = Math.min(min[0], point.x);
      min[1] = Math.min(min[1], point.y);
      max[0] = Math.max(max[0], point.x);
      max[1] = Math.max(max[1], point.y);
    }
    min[2] = Math.min(min[2], room.zM);
    max[2] = Math.max(max[2], room.zM + room.heightM);
  }
  const bounds = Number.isFinite(min[0]) ? { min, max } : { min: [0, 0, 0] as Vec3, max: [8, 8, 3] as Vec3 };
  return { pieces, labels, services: [...services], bounds };
}

/** Does a piece belong to the selection, so it is highlighted? A selected room lights up its surfaces and openings. */
export function pieceSelected(piece: Pick<PieceBase, 'pick' | 'roomId' | 'face' | 'wallFace' | 'edge' | 'interfaceKey' | 'systemId'>, selection: Selection): boolean {
  if (selection.kind === 'interface') return piece.interfaceKey === selection.key;
  if (selection.kind === 'room') return piece.roomId === selection.id;
  if (selection.kind === 'system') return piece.systemId === selection.id;
  if (selection.kind === 'surface') {
    if (piece.roomId !== selection.roomId || piece.face !== selection.face) return false;
    if (selection.face !== 'walls') return true;
    if (selection.edge != null || piece.edge != null) return selection.edge === piece.edge;
    return !selection.wallFace || !piece.wallFace || selection.wallFace === piece.wallFace;
  }
  const pick = piece.pick;
  if (pick.kind !== selection.kind) return false;
  if ((pick.kind === 'equipment' || pick.kind === 'duct' || pick.kind === 'load' || pick.kind === 'wallRun') && 'id' in selection) return pick.id === selection.id;
  if (pick.kind === 'opening' && selection.kind === 'opening') return pick.id === selection.id && pick.roomId === selection.roomId;
  if (pick.kind === 'wallOpening' && selection.kind === 'wallOpening') return pick.id === selection.id;
  return false;
}
