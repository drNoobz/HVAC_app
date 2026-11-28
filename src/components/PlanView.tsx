'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { CATALOG_MIME, equipmentSizeM, getProduct, isSchematicOnly } from '@/domain/catalog';
import { activeCatalogDrag, parseCatalogDrag, type CatalogDrag } from '@/domain/catalogDrag';
import { SERVICE_COLOR } from '@/domain/ductCatalog';
import { assemblyFamily } from '@/domain/constructionLibrary';
import { ductCrossings, ductFlows, ductSizeLabel, ductViewOf, endRise, equipmentPortHits, nearestNode, nearestPort, nearestRun, portFits, streamDesignLabel, type DuctDraftPoint } from '@/domain/ducts';
import { isUnit, SECTION_TAG, sectionSummary, unitFlows } from '@/domain/airUnits';
import { PORT_ROLE_LABEL, UNIT_STREAM_LABEL, unitLayout, type UnitComponent, type UnitLayout, type UnitStream } from '@/domain/unitNetwork';
import { LOOP_FLUID_LABEL, SENSOR_LABEL, VALVE_LABEL } from '@/domain/controls';
import { AxialFan, CentrifugalFan, CondenserSection, ControlDamper, DuctCoil, DuctFilter, HeatExchanger, Humidifier, InstrumentBubble, MixingPlenum, PlanSymbol, Valve, type PlanSymbolKind } from './hvacSymbols';
import type { ControlPoint, DuctRun, DuctService, DuctShape, EditorTool, LoadItem, Opening, PlacedEquipment, PlantLoop, Project, Room, Selection, UnitSection, WallFace, WallRun } from '@/domain/types';
import { getLoadProduct, LOAD_CATEGORY_COLOR } from '@/domain/loadCatalog';
import { LoadSymbol } from './LoadIcon';
import type { BuildStep } from '@/domain/checks';
import { isTransferGrille, outdoorOpening, OUTSIDE_IN_COLOR, OUTSIDE_OUT_COLOR, terminalAirColor } from '@/domain/airColors';
import { LABEL_ACTIVE, LABEL_PRIORITY, stepFade } from '@/domain/viewRules';
import { loadLabel, loadPlanSize } from '@/domain/loads';
import { constrainEquipmentPosition, roomAtPoint } from '@/domain/projectOps';
import { locateOpening, NO_WALL_RUNS, outlineCentroid, outlineRoomOk, pointInOutline, polygonArea, roomLoop, runGeom, runOpeningEnds, snapDrawPoint, wallAngleDeg, wallQuad, wallQuads, type DrawPoint, type OpeningSpot, type WallSnap } from '@/domain/wallDraw';
import { METERS_PER_FOOT, formatArea, formatFlow, formatLength, formatNumber, lengthUnit, mToLength } from '@/domain/units';
import { doorArc, doorHinge, doorSwingSide, doorwayKey, openingEnds } from '@/domain/doorSwing';
import { clampSharedEdge, moveRoomEdge, slideOpeningsTogether } from '@/domain/spanFit';
import { fade, ink, PLAN_COLOR, wash } from '@/domain/theme';
import { INTERFACE_COLOR, MARK_COLOR, WALL_FACE_IDS, edgePortions, facePortions, findInterface, interfaceConstructionColor, interfaceTargets, northDegrees, roomFill, snapDrawnRect, snapPointToWalls, snapSpaceDelta, snapWallEdge, touchingRooms, wallColor, type WallPortion } from '@/domain/walls';

const SNAP_M = 0.05;
const DRAG_PX = 5;
const MIN_DRAW_M = 0.4;
const PAPER = PLAN_COLOR.paper;
const INK = PLAN_COLOR.ink;
const DIM = PLAN_COLOR.dim;
const SELECT = PLAN_COLOR.select;
const SELECT_FILL = PLAN_COLOR.selectFill;
const HAIR = 1.15;

export interface PlanLayers {
  spaces: boolean;
  loads: boolean;
  equipment: boolean;
  ducts: boolean;
  piping: boolean;
  controls: boolean;
  /** Sections, valves, and duct sensors drawn inside every unit at plan scale. */
  internals: boolean;
  ductWidth: boolean;
  clearances: boolean;
  /** Flow, size, and system text on every item. Off shows it only on the selection. */
  labels: boolean;
}

export const DEFAULT_LAYERS: PlanLayers = { spaces: true, loads: true, equipment: true, ducts: true, piping: true, controls: true, internals: false, ductWidth: false, clearances: true, labels: false };

/** Inactive step labels draw smaller as well as fainter. */
function labelScale(opacity: number): number {
  return opacity >= 0.9 ? 1 : 0.68;
}

/** Which build step owns a plan hit. Null hits are empty canvas. */
function hitPhase(hit: string): BuildStep | null {
  if (hit === 'room' || hit === 'wall' || hit === 'edge' || hit === 'opening' || hit === 'interface' || hit === 'wall-run' || hit === 'wall-opening') return 'spaces';
  if (hit === 'load' || hit === 'load-rotate') return 'loads';
  if (hit === 'equipment' || hit === 'equipment-rotate' || hit === 'unit-section' || hit === 'unit-duct' || hit === 'pipe' || hit === 'sensor' || hit === 'duct') return 'systems';
  return null;
}

/** Plan label importance: where two collide, the lower one is hidden until there is room (zoom in or select it). */

function declutterLabels(svg: SVGSVGElement) {
  const labels = [...svg.querySelectorAll<SVGGraphicsElement>('[data-label]')]
    .map(element => ({ element, priority: Number(element.dataset.label) || 0, box: element.getBoundingClientRect() }))
    .filter(entry => entry.box.width > 0 && entry.box.height > 0)
    .sort((a, b) => b.priority - a.priority);
  const kept: DOMRect[] = [];
  const pad = 2;
  for (const { element, priority, box } of labels) {
    const clash = priority < LABEL_ACTIVE && kept.some(other => box.left < other.right + pad && box.right > other.left - pad && box.top < other.bottom + pad && box.bottom > other.top - pad);
    if (clash) element.setAttribute('data-declutter', 'hidden');
    else {
      element.removeAttribute('data-declutter');
      kept.push(box);
    }
  }
}

function LoadMarks({
  loads,
  selection,
  fontM,
  labels,
  onContextMenu,
}: {
  loads: readonly LoadItem[];
  selection: Selection;
  fontM: number;
  labels: boolean;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}) {
  const r = fontM * 0.85;
  return (
    <g>
      {loads.map(item => {
        const product = getLoadProduct(item.loadId);
        const active = selection.kind === 'load' && selection.id === item.id;
        const color = product ? LOAD_CATEGORY_COLOR[product.category] : '#7a7f85';
        const size = loadPlanSize(item);
        const menu = (event: ReactMouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu({ kind: 'load', id: item.id }, event.clientX, event.clientY);
        };
        if (!size) {
          return (
            <g key={item.id} data-hit="load" data-id={item.id} onContextMenu={menu}>
              {active && <circle cx={item.xM} cy={item.yM} r={r * 1.5} fill="none" stroke={ink(SELECT)} strokeWidth={2.25} vectorEffect="non-scaling-stroke" />}
              <circle cx={item.xM} cy={item.yM} r={r} fill={ink(color)} stroke={PLAN_COLOR.halo} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <g transform={`translate(${item.xM} ${item.yM}) scale(1,-1)`} pointerEvents="none">
                {product ? (
                  <g transform={`scale(${r / 16})`} color={PLAN_COLOR.halo}>
                    <g transform="translate(-12 -12)">
                      <LoadSymbol category={product.category} hair />
                    </g>
                  </g>
                ) : (
                  <text textAnchor="middle" y={fontM * 0.3} fontSize={fontM * 0.85} fontWeight={600} fill={PLAN_COLOR.halo}>?</text>
                )}
                {(labels || active) && (
                  <text data-label={active ? LABEL_ACTIVE : LABEL_PRIORITY.load} textAnchor="middle" y={r + fontM * 1.05} fontSize={fontM * 0.66} fill={ink(INK)}>
                    {loadLabel(item, product)}
                  </text>
                )}
              </g>
            </g>
          );
        }
        const length = size.lengthM;
        const width = size.widthM;
        const label = loadLabel(item, product);
        const iconM = Math.min(length, width, fontM * 1.6);
        const showIcon = Math.min(length, width) >= fontM * 1.1 && product;
        const handle = fontM * 0.9;
        return (
          <g key={item.id} transform={`rotate(${item.yawDeg} ${item.xM} ${item.yM})`} onContextMenu={menu}>
            <rect
              data-hit="load"
              data-id={item.id}
              x={item.xM - length / 2}
              y={item.yM - width / 2}
              width={length}
              height={width}
              fill={ink(color)}
              fillOpacity={active ? 0.28 : 0.16}
              stroke={ink(active ? SELECT : color)}
              strokeWidth={active ? 2.25 : HAIR}
              vectorEffect="non-scaling-stroke"
            />
            {showIcon && (
              <g transform={`translate(${item.xM} ${item.yM}) rotate(${-item.yawDeg}) scale(1,-1)`} pointerEvents="none" color={ink(active ? SELECT : color)}>
                <g transform={`scale(${iconM / 18}) translate(-12 -12)`}>
                  <LoadSymbol category={product.category} hair />
                </g>
              </g>
            )}
            {(labels || active) && (
              <g transform={`translate(${item.xM} ${item.yM + width / 2 + fontM * 0.7}) rotate(${-item.yawDeg}) scale(1,-1)`} pointerEvents="none">
                <text data-label={active ? LABEL_ACTIVE : LABEL_PRIORITY.load} textAnchor="middle" dominantBaseline="middle" fontSize={fontM * 0.62} fill={ink(active ? SELECT : color)}>
                  {label}
                </text>
              </g>
            )}
            {active && (
              <g data-hit="load-rotate" data-id={item.id} aria-label="Rotate appliance">
                <line x1={item.xM + length / 2} y1={item.yM} x2={item.xM + length / 2 + handle} y2={item.yM} stroke={ink(SELECT)} strokeWidth={HAIR} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                <circle cx={item.xM + length / 2 + handle} cy={item.yM} r={fontM * 0.48} fill={ink(PAPER)} stroke={ink(SELECT)} strokeWidth={2.25} vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

type WallRole = 'hatch' | 'service' | 'partition' | 'panel' | 'glass' | 'none';

function graphicWall(constructionId: string | null | undefined): { role: WallRole; thickness: number } {
  if (!constructionId) return { role: 'none', thickness: 0.1 };
  const family = assemblyFamily(constructionId);
  if (family === 'steel-framed' || family === 'wood-framed') return { role: 'hatch', thickness: 0.24 };
  if (family === 'mass') return { role: 'service', thickness: 0.24 };
  if (family === 'metal-building') return { role: 'service', thickness: 0.18 };
  if (family === 'wall-panel') return { role: 'panel', thickness: 0.18 };
  if (family === 'glazed') return { role: 'glass', thickness: 0.1 };
  if (constructionId === 'asm-wall-partition-cmu') return { role: 'partition', thickness: 0.2 };
  return { role: 'partition', thickness: 0.14 };
}

function wallBand(room: Room, face: WallFace, thickness: number) {
  const half = thickness / 2;
  if (face === 'px') return { x: room.xM + room.lengthM - half, y: room.yM - half, width: thickness, height: room.widthM + thickness };
  if (face === 'nx') return { x: room.xM - half, y: room.yM - half, width: thickness, height: room.widthM + thickness };
  if (face === 'py') return { x: room.xM - half, y: room.yM + room.widthM - half, width: room.lengthM + thickness, height: thickness };
  return { x: room.xM - half, y: room.yM - half, width: room.lengthM + thickness, height: thickness };
}

function openingGap(room: Room, opening: Opening, thickness: number) {
  const depth = Math.max(thickness, 0.08) + 0.02;
  if (opening.face === 'px' || opening.face === 'nx') {
    const x = (opening.face === 'px' ? room.xM + room.lengthM : room.xM) - depth / 2;
    return { x, y: room.yM + opening.offsetM, width: depth, height: opening.widthM };
  }
  const y = (opening.face === 'py' ? room.yM + room.widthM : room.yM) - depth / 2;
  return { x: room.xM + opening.offsetM, y, width: opening.widthM, height: depth };
}

interface ViewBox {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

function snap(value: number): number {
  return Math.round(value / SNAP_M) * SNAP_M;
}

/** Snap order: a matching equipment port, an existing junction, a run of the same stream (makes a tee), then the grid. */
function snapDuct(x: number, y: number, project: Project, systemId: string, service: DuctService): DuctDraftPoint {
  const port = nearestPort(project.equipment, x, y, 0.45, hit => portFits(project, hit, systemId, service));
  if (port) return { x: Number(port.x.toFixed(3)), y: Number(port.y.toFixed(3)), equipmentId: port.equipmentId, portId: port.portId };
  const node = nearestNode(project, x, y, 0.35, systemId, service);
  if (node) return { x: node.x, y: node.y, nodeId: node.id };
  const run = nearestRun(project, x, y, 0.3, systemId, service);
  if (run) return { x: Number(run.x.toFixed(3)), y: Number(run.y.toFixed(3)), splitDuctId: run.run.id };
  return { x: snap(x), y: snap(y) };
}

/** A drawn point that ends the run: a port, a junction, or a tee on another run. */
function joins(point: DuctDraftPoint): boolean {
  return !!(point.portId || point.nodeId || point.splitDuctId);
}

function sameJoin(a: DuctDraftPoint, b: DuctDraftPoint): boolean {
  if (a.portId || b.portId) return a.equipmentId === b.equipmentId && a.portId === b.portId;
  if (a.nodeId || b.nodeId) return a.nodeId === b.nodeId;
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.15;
}

function gridStep(pxPerM: number): number {
  const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const target = 32;
  let best = steps[steps.length - 1];
  let bestScore = Infinity;
  for (const step of steps) {
    const px = step * Math.max(pxPerM, 1);
    const score = Math.abs(Math.log(px / target));
    if (px >= 14 && px <= 72 && score < bestScore) {
      best = step;
      bestScore = score;
    }
  }
  return best;
}

function formatDelta(meters: number, units: Project['units']): string {
  const rounded = Math.round(mToLength(meters, units));
  const body = `${formatNumber(Math.abs(rounded), 0)} ${lengthUnit(units)}`;
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `-${body}`;
  return body;
}

function niceInt(value: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100];
  return steps.find(step => step >= value) ?? steps[steps.length - 1];
}

function dragUnitStep(pxPerM: number, units: Project['units']): number {
  const pxPerUnit = Math.max(pxPerM, 1) * (units === 'IP' ? METERS_PER_FOOT : 1);
  return niceInt(Math.max(1, 18 / pxPerUnit));
}

function quantizeMeters(meters: number, step: number, units: Project['units']): number {
  const per = units === 'IP' ? METERS_PER_FOOT : 1;
  return round3((Math.round(meters / per / step) * step) * per);
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

const WALL_TOUCH_M = 0.08;

function edgeValue(room: Room, face: WallFace): number {
  if (face === 'px') return room.xM + room.lengthM;
  if (face === 'nx') return room.xM;
  if (face === 'py') return room.yM + room.widthM;
  return room.yM;
}

function partnerFace(room: Room, face: WallFace, other: Room): WallFace | null {
  const plane = edgeValue(room, face);
  if (face === 'px' || face === 'nx') {
    const right = Math.abs(other.xM + other.lengthM - plane);
    const left = Math.abs(other.xM - plane);
    if (right > WALL_TOUCH_M && left > WALL_TOUCH_M) return null;
    return right <= left ? 'px' : 'nx';
  }
  const top = Math.abs(other.yM + other.widthM - plane);
  const bottom = Math.abs(other.yM - plane);
  if (top > WALL_TOUCH_M && bottom > WALL_TOUCH_M) return null;
  return top <= bottom ? 'py' : 'ny';
}

function shiftRoom(room: Room, dx: number, dy: number): Room {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return room;
  return {
    ...room,
    xM: room.xM + dx,
    yM: room.yM + dy,
    outline: room.outline?.map(point => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function moveEdges(base: readonly Room[], edges: { id: string; face: WallFace }[], edge: number): Room[] {
  const entries = edges.flatMap(item => {
    const room = base.find(candidate => candidate.id === item.id);
    return room ? [{ room, face: item.face }] : [];
  });
  const limited = clampSharedEdge(entries, edge);
  const byId = new Map(edges.map(item => [item.id, item.face]));
  return base.map(room => {
    const face = byId.get(room.id);
    return face ? moveRoomEdge(room, face, limited) : room;
  });
}

function openingAlong(room: Room, opening: Opening): number {
  return (opening.face === 'px' || opening.face === 'nx' ? room.yM : room.xM) + opening.offsetM;
}

function alongPoint(face: WallFace, point: { xM: number; yM: number }): number {
  return face === 'px' || face === 'nx' ? point.yM : point.xM;
}


function settleDrag(
  current:
    | { kind: 'wall'; edges: { id: string; face: WallFace }[]; base: Room[]; face: WallFace }
    | { kind: 'opening'; moves: { roomId: string; openingId: string }[]; base: Room[]; face: WallFace },
  rooms: Room[],
  pxPerM: number,
  units: Project['units'],
): Room[] {
  const step = dragUnitStep(pxPerM, units);
  if (current.kind === 'wall') {
    const before = current.base.find(room => room.id === current.edges[0].id);
    const after = rooms.find(room => room.id === current.edges[0].id);
    if (!before || !after) return rooms;
    const delta = quantizeMeters(edgeValue(after, current.face) - edgeValue(before, current.face), step, units);
    if (Math.abs(delta) < 1e-6) return current.base;
    return moveEdges(current.base, current.edges, edgeValue(before, current.face) + delta);
  }
  const move = current.moves[0];
  const beforeRoom = current.base.find(room => room.id === move.roomId);
  const before = beforeRoom?.openings.find(item => item.id === move.openingId);
  const after = rooms.find(room => room.id === move.roomId)?.openings.find(item => item.id === move.openingId);
  if (!beforeRoom || !before || !after) return rooms;
  const delta = quantizeMeters(after.offsetM - before.offsetM, step, units);
  if (Math.abs(delta) < 1e-6) return current.base;
  const origin = current.face === 'px' || current.face === 'nx' ? beforeRoom.yM : beforeRoom.xM;
  return slideOpeningsTogether(current.base, current.moves, origin + before.offsetM + delta);
}

function geometryChanged(base: readonly Room[], next: readonly Room[]): boolean {
  return next.some(room => {
    const prev = base.find(item => item.id === room.id);
    if (!prev) return true;
    if (prev.xM !== room.xM || prev.yM !== room.yM || prev.lengthM !== room.lengthM || prev.widthM !== room.widthM) return true;
    return room.openings.some(opening => prev.openings.find(item => item.id === opening.id)?.offsetM !== opening.offsetM);
  });
}

function bounds(rooms: readonly Room[], runs: readonly WallRun[] = []): ViewBox {
  const xs = [...rooms.flatMap(room => [room.xM, room.xM + room.lengthM]), ...runs.flatMap(run => [run.x0, run.x1])];
  const ys = [...rooms.flatMap(room => [room.yM, room.yM + room.widthM]), ...runs.flatMap(run => [run.y0, run.y1])];
  if (xs.length === 0 || ys.length === 0) return { minX: -1, minY: -1, w: 14, h: 10 };
  const pad = 3.6;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { minX, minY, w: Math.max(maxX - minX, 2), h: Math.max(maxY - minY, 2) };
}

function coverView(view: ViewBox, aspect: number): ViewBox {
  if (!(aspect > 0) || !(view.h > 0)) return view;
  if (Math.abs(view.w / view.h - aspect) < 1e-4) return view;
  if (view.w / view.h < aspect) {
    const w = view.h * aspect;
    return { minX: view.minX + (view.w - w) / 2, minY: view.minY, w, h: view.h };
  }
  const h = view.w / aspect;
  return { minX: view.minX, minY: view.minY + (view.h - h) / 2, w: view.w, h };
}

function wallLine(room: Room, face: WallFace): { x1: number; y1: number; x2: number; y2: number } {
  if (face === 'px') return { x1: room.xM + room.lengthM, y1: room.yM, x2: room.xM + room.lengthM, y2: room.yM + room.widthM };
  if (face === 'nx') return { x1: room.xM, y1: room.yM, x2: room.xM, y2: room.yM + room.widthM };
  if (face === 'py') return { x1: room.xM, y1: room.yM + room.widthM, x2: room.xM + room.lengthM, y2: room.yM + room.widthM };
  return { x1: room.xM, y1: room.yM, x2: room.xM + room.lengthM, y2: room.yM };
}

function arcPoints(x: number, y: number, radius: number, from: number, to: number): string {
  const steps = 16;
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = from + ((to - from) * i) / steps;
    points.push(`${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

/** The plan's north arrow: N points `degrees` clockwise from the top. The 3D view turns it with the camera. */
export function NorthGlyph({ degrees, groupRef }: { degrees: number; groupRef?: Ref<SVGGElement> }) {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" shapeRendering="geometricPrecision">
      <g ref={groupRef} transform={`rotate(${degrees} 40 40)`}>
        <circle cx="40" cy="40" r="31" fill="none" stroke={PLAN_COLOR.compass} strokeWidth="1.25" />
        <text x="40" y="24" textAnchor="middle" fontSize="13" fontWeight="650" fill={PLAN_COLOR.compass} fontFamily='"IBM Plex Sans", "Segoe UI", sans-serif'>N</text>
        <polygon points="40,28 45.5,40 40,37" fill={PLAN_COLOR.compass} />
        <polygon points="40,28 34.5,40 40,37" fill={PLAN_COLOR.compass2} />
        <polygon points="40,52 45.5,40 40,43" fill={PLAN_COLOR.paper} stroke={PLAN_COLOR.compass} strokeWidth="1.15" strokeLinejoin="round" />
        <polygon points="40,52 34.5,40 40,43" fill={PLAN_COLOR.paper} stroke={PLAN_COLOR.compass} strokeWidth="1.15" strokeLinejoin="round" />
        <path d="M12 40 H20 M60 40 H68" fill="none" stroke={PLAN_COLOR.compass} strokeWidth="1.25" />
        <circle cx="40" cy="40" r="1.6" fill={PLAN_COLOR.compass} />
      </g>
    </svg>
  );
}

function NorthMark({ degrees, onCommit }: { degrees: number; onCommit: (deg: number) => void }) {
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; pointer: number; north: number; moved: boolean; last: number } | null>(null);
  const shown = live ?? degrees;
  const pointerAngle = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    return Math.atan2(dx, -dy) * (180 / Math.PI);
  };
  return (
    <button
      type="button"
      className={live === null ? 'north-arrow' : 'north-arrow is-turning'}
      aria-label={`North, ${Math.round(shown)} degrees clockwise from the top of the plan`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, pointer: pointerAngle(event), north: degrees, moved: false, last: degrees };
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current) return;
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) >= 4) current.moved = true;
        if (!current.moved) return;
        const next = northDegrees(current.north + pointerAngle(event) - current.pointer);
        current.last = next;
        setLive(next);
      }}
      onPointerUp={event => {
        const current = drag.current;
        drag.current = null;
        setLive(null);
        if (current?.moved && Math.round(current.last) !== Math.round(degrees)) onCommit(Math.round(current.last));
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <NorthGlyph degrees={shown} />
    </button>
  );
}

function niceScale(pxPerM: number, units: Project['units']): { meters: number; label: string } {
  const target = 110 / Math.max(pxPerM, 1);
  const steps = units === 'IP' ? [1, 2, 5, 10, 20, 50, 100].map(feet => feet * 0.3048) : [0.5, 1, 2, 5, 10, 20, 50];
  const meters = steps.find(step => step >= target * 0.55) ?? steps[steps.length - 1];
  const label = units === 'IP' ? `${Math.round(meters / 0.3048)} ft` : `${meters} m`;
  return { meters, label };
}

/** Hint at the cursor while a catalogue item is dragged over the plan. */
export interface DropHint {
  text: string;
  /** The system the drop would join or extend: its labels show while dragging. */
  systemId?: string | null;
  warn?: boolean;
}

export function PlanView({
  project,
  selection,
  tool,
  locked = false,
  fitToken,
  onSelect,
  onDrawRoom,
  onDrawWalls,
  onDrawDuct,
  onCloseSpace,
  onPlaceOpening,
  onPlace,
  onContextMenu,
  onRoomsChange,
  onMoveSpace,
  onMoveEquipment,
  onRotateEquipment,
  onNorthChange,
  onPlaceLoad,
  onMoveLoad,
  onRotateLoad,
  onBeginDuct,
  describeDrop,
  onPlacePackage,
  onPaintWall,
  step,
  layers,
  expandedUnits,
  onToggleInternals,
}: {
  project: Project;
  selection: Selection;
  tool: EditorTool;
  fitToken: number;
  onSelect: (selection: Selection) => void;
  onDrawRoom: (rect: { xM: number; yM: number; lengthM: number; widthM: number }) => void;
  onDrawWalls: (lines: { x0: number; y0: number; x1: number; y1: number }[]) => void;
  onDrawDuct: (draft: {
    points: DuctDraftPoint[];
    catalogId: string;
    systemId: string;
    service: DuctService;
    shape: DuctShape;
    widthM: number;
    heightM: number | null;
  }) => void;
  onCloseSpace: (points: DrawPoint[]) => void;
  onPlaceOpening: (spot: OpeningSpot, kind: 'door' | 'window') => void;
  onPlace: (point: { xM: number; yM: number }, catalogId: string, at?: { clientX: number; clientY: number; alt?: boolean }) => string | void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
  onRoomsChange: (rooms: Room[]) => void;
  onMoveSpace: (roomId: string, dx: number, dy: number) => void;
  onMoveEquipment: (id: string, xM: number, yM: number) => void;
  onRotateEquipment: (id: string, yawDeg: number) => void;
  onNorthChange: (deg: number) => void;
  onPlaceLoad: (point: { xM: number; yM: number }, loadId: string) => string | void;
  onMoveLoad: (id: string, xM: number, yM: number) => void;
  onRotateLoad: (id: string, yawDeg: number) => void;
  /** Start a duct from a catalogue drop: the armed tool and, for a branch or a port, its first point. A string says why it can't. */
  onBeginDuct: (catalogId: string, point: { xM: number; yM: number }) => { tool: Extract<EditorTool, { kind: 'duct' }>; start: DuctDraftPoint | null } | string;
  /** What a catalogue drop here will do, shown at the cursor while dragging. */
  describeDrop?: (drag: CatalogDrag, point: { xM: number; yM: number }, alt: boolean) => DropHint | null;
  onPlacePackage: (point: { xM: number; yM: number }, packageId: string) => void;
  onPaintWall: (selection: Selection, wallTypeId: string) => void;
  step: BuildStep;
  layers: PlanLayers;
  /** Positions locked: clicks select, nothing moves by dragging, and space dimensions stay hidden. */
  locked?: boolean;
  /** Units opened one at a time (double-click), on top of the all-units internals layer. */
  expandedUnits: ReadonlySet<string>;
  onToggleInternals: (equipmentId: string) => void;
}) {
  const showDuctSize = layers.ductWidth;
  const svgRef = useRef<SVGSVGElement>(null);
  const frozenDrag = useRef(false);
  // After every render (zoom, pan, edits), hide labels that collide with more important ones.
  useLayoutEffect(() => {
    if (svgRef.current) declutterLabels(svgRef.current);
  });
  const lastUnitClick = useRef<{ id: string; t: number } | null>(null);
  const [view, setView] = useState<ViewBox>(() => bounds(project.rooms));
  const viewRef = useRef(view);
  viewRef.current = view;
  /** Width of the plan on screen, px. The scale is derived from it and the view, never stored. */
  const [svgWidth, setSvgWidth] = useState(0);
  const pxPerM = svgWidth > 0 && view.w > 0 ? svgWidth / view.w : 40;
  const [catalogOver, setCatalogOver] = useState(false);
  /** Hint at the cursor during a catalogue drag (text, and the system it would join); a note after a drop that did little. */
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [dropNote, setDropNote] = useState<{ x: number; y: number; text: string } | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const hintKey = useRef('');
  const noteTimer = useRef<number | null>(null);
  const showNote = (clientX: number, clientY: number, text: string) => {
    const box = svgRef.current?.parentElement?.parentElement?.getBoundingClientRect();
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    setDropNote({ x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0), text });
    noteTimer.current = window.setTimeout(() => setDropNote(null), 3200);
  };
  useEffect(() => () => {
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
  }, []);
  const [draft, setDraft] = useState<{ xM: number; yM: number; lengthM: number; widthM: number } | null>(null);
  const [chain, setChain] = useState<DrawPoint[] | null>(null);
  const [aim, setAim] = useState<WallSnap | null>(null);
  const [spot, setSpot] = useState<OpeningSpot | null>(null);
  const [preview, setPreview] = useState<Room[] | null>(null);
  const [movingEquipment, setMovingEquipment] = useState<{ id: string; xM: number; yM: number } | null>(null);
  const [rotatingEquipment, setRotatingEquipment] = useState<{ id: string; yawDeg: number } | null>(null);
  const [movingLoad, setMovingLoad] = useState<{ id: string; xM: number; yM: number } | null>(null);
  const [rotatingLoad, setRotatingLoad] = useState<{ id: string; yawDeg: number } | null>(null);
  const movingLoadRef = useRef<{ id: string; xM: number; yM: number } | null>(null);
  const rotatingLoadRef = useRef<{ id: string; yawDeg: number } | null>(null);
  const rotatingRef = useRef<{ id: string; yawDeg: number } | null>(null);
  const [gesture, setGesture] = useState<
    | { kind: 'wall' | 'opening'; roomId: string; face: WallFace; openingId?: string }
    | { kind: 'space'; roomId: string }
    | { kind: 'equipment'; id: string }
    | { kind: 'rotate'; id: string }
    | null
  >(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const previewRef = useRef<Room[] | null>(null);
  const movingRef = useRef<{ id: string; xM: number; yM: number } | null>(null);
  const chainRef = useRef<DrawPoint[] | null>(null);
  const [ductChain, setDuctChain] = useState<DuctDraftPoint[] | null>(null);
  const [ductAim, setDuctAim] = useState<DuctDraftPoint | null>(null);
  const ductChainRef = useRef<DuctDraftPoint[] | null>(null);
  const ductSettings = useRef<Extract<EditorTool, { kind: 'duct' }> | null>(null);
  if (tool.kind === 'duct') ductSettings.current = tool;
  const commitWalls = useRef(onDrawWalls);
  commitWalls.current = onDrawWalls;
  const commitDuct = useRef(onDrawDuct);
  commitDuct.current = onDrawDuct;
  const spotRef = useRef<OpeningSpot | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<
    | { kind: 'pan' | 'draw' | 'place' | 'stamp'; x: number; y: number; pointerX: number; pointerY: number; view: ViewBox; keepClick?: boolean }
    | { kind: 'wall'; edges: { id: string; face: WallFace }[]; base: Room[]; pointerX: number; pointerY: number; view: ViewBox; face: WallFace; armed: boolean; interfaceKey?: string }
    | { kind: 'opening'; moves: { roomId: string; openingId: string }[]; grab: number; base: Room[]; pointerX: number; pointerY: number; view: ViewBox; face: WallFace; armed: boolean }
    | { kind: 'space'; id: string; base: Room[]; grabX: number; grabY: number; pointerX: number; pointerY: number; view: ViewBox; armed: boolean }
    | { kind: 'equipment'; id: string; xM: number; yM: number; grabX: number; grabY: number; pointerX: number; pointerY: number; view: ViewBox; armed: boolean; sectionId?: string; linkId?: string }
    | { kind: 'rotate'; id: string; xM: number; yM: number; startYaw: number; startAngle: number; pointerX: number; pointerY: number; view: ViewBox }
    | { kind: 'load'; id: string; xM: number; yM: number; grabX: number; grabY: number; pointerX: number; pointerY: number; view: ViewBox; armed: boolean }
    | { kind: 'load-rotate'; id: string; xM: number; yM: number; startYaw: number; startAngle: number; pointerX: number; pointerY: number; view: ViewBox }
    | null
  >(null);
  const wallRuns = project.wallRuns ?? NO_WALL_RUNS;
  useEffect(() => {
    chainRef.current = null;
    setChain(null);
    setAim(null);
  }, [project.id]);
  useEffect(() => {
    if (tool.kind === 'wall') return;
    const points = chainRef.current;
    chainRef.current = null;
    setChain(null);
    setAim(null);
    if (!points || points.length < 2) return;
    const lines: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) >= MIN_DRAW_M) lines.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    }
    if (lines.length > 0) commitWalls.current(lines);
  }, [tool.kind]);
  useEffect(() => {
    ductChainRef.current = null;
    setDuctChain(null);
    setDuctAim(null);
  }, [project.id]);
  useEffect(() => {
    if (tool.kind === 'duct') return;
    const points = ductChainRef.current;
    const settings = ductSettings.current;
    ductChainRef.current = null;
    setDuctChain(null);
    setDuctAim(null);
    if (!settings?.systemId || !points || points.length < 2) return;
    commitDuct.current({
      points,
      catalogId: settings.catalogId,
      systemId: settings.systemId,
      service: settings.service,
      shape: settings.shape,
      widthM: settings.widthM,
      heightM: settings.heightM,
    });
  }, [tool.kind]);
  const showSpot = (next: OpeningSpot | null) => {
    const prev = spotRef.current;
    if (prev === next) return;
    if (prev && next && prev.roomId === next.roomId && prev.wallId === next.wallId && prev.face === next.face && prev.offsetM === next.offsetM && prev.widthM === next.widthM) return;
    spotRef.current = next;
    setSpot(next);
  };

  useEffect(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    const next = bounds(project.rooms, project.wallRuns ?? []);
    setView(rect && rect.width > 0 && rect.height > 0 ? coverView(next, rect.width / rect.height) : next);
    setDraft(null);
    spotRef.current = null;
    setSpot(null);
    previewRef.current = null;
    setPreview(null);
    setGesture(null);
    setReadout(null);
  }, [fitToken, project.id]);

  useEffect(() => {
    if (tool.kind === 'door' || tool.kind === 'window') return;
    if (!spotRef.current) return;
    spotRef.current = null;
    setSpot(null);
  }, [tool.kind]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const current = viewRef.current;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setSvgWidth(rect.width);
      const covered = coverView(current, rect.width / rect.height);
      if (covered !== current) setView(covered);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const current = viewRef.current;
      let dy = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= rect.height;
      // Trackpad sends many small pixel deltas; mouse wheel sends larger jumps.
      // Scale by magnitude so Mac two-finger zoom stays smooth instead of ±12% per tick.
      const intensity = 0.0016;
      let factor = Math.exp(dy * intensity);
      factor = Math.min(1.15, Math.max(1 / 1.15, factor));
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const wx = current.minX + px * current.w;
      const wy = current.minY + (1 - py) * current.h;
      factor = factor > 1 ? Math.min(factor, 400 / current.w, 400 / current.h) : Math.max(factor, 2 / current.w, 2 / current.h);
      const w = current.w * factor;
      const h = current.h * factor;
      setView({ minX: wx - px * w, minY: wy - (1 - py) * h, w, h });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', onWheel);
    };
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { xM: 0, yM: 0 };
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { xM: view.minX + px * view.w, yM: view.minY + (1 - py) * view.h };
  };

  const showLive = (rooms: Room[] | null) => {
    previewRef.current = rooms;
    setPreview(rooms);
  };
  const showEquipment = (next: { id: string; xM: number; yM: number } | null) => {
    movingRef.current = next;
    setMovingEquipment(next);
  };
  const showLoad = (next: { id: string; xM: number; yM: number } | null) => {
    movingLoadRef.current = next;
    setMovingLoad(next);
  };
  const showLoadRotate = (next: { id: string; yawDeg: number } | null) => {
    rotatingLoadRef.current = next;
    setRotatingLoad(next);
  };
  const showRotate = (next: { id: string; yawDeg: number } | null) => {
    rotatingRef.current = next;
    setRotatingEquipment(next);
  };
  const snapYaw = (deg: number) => {
    const stepped = Math.round(deg / 5) * 5;
    let normalized = ((stepped % 360) + 360) % 360;
    if (normalized > 180) normalized -= 360;
    return normalized;
  };
  const rooms = preview ?? project.rooms;
  const showSpaces = layers.spaces;
  const showSystems = step !== 'spaces';
  const fade = stepFade(step);
  const spaceText = labelScale(fade.spaces);
  const equipmentText = labelScale(fade.equipment);
  const selectedSystemId =
    selection.kind === 'system'
      ? selection.id
      : selection.kind === 'equipment'
        ? project.equipment.find(item => item.id === selection.id)?.systemId ?? null
        : selection.kind === 'duct'
          ? (project.ducts ?? []).find(run => run.id === selection.id)?.systemId ?? null
          : null;
  const shownSystemId = dropHint?.systemId ?? selectedSystemId;
  const highlightedRoom =
    selection.kind === 'room'
      ? rooms.find(room => room.id === selection.id)
      : selection.kind === 'surface' && selection.face !== 'walls'
        ? rooms.find(room => room.id === selection.roomId)
        : undefined;
  const selectedOpening = selection.kind === 'opening'
    ? rooms.flatMap(room => room.openings.filter(opening => opening.id === selection.id).map(opening => ({ room, opening })))[0]
    : undefined;
  const selectedDoorway = selectedOpening?.opening.kind === 'door' ? doorwayKey(selectedOpening.room, selectedOpening.opening) : undefined;
  const selectedWall = selection.kind === 'surface' && selection.face === 'walls' ? selection.wallFace : undefined;
  const dimRoom =
    selection.kind === 'room' || selection.kind === 'surface' || selection.kind === 'opening'
      ? rooms.find(room => room.id === (selection.kind === 'room' ? selection.id : selection.roomId))
      : undefined;
  const gestureRoom = gesture && 'roomId' in gesture ? rooms.find(room => room.id === gesture.roomId) : undefined;
  const measuredRoom = gestureRoom ?? dimRoom;
  const measuredFace = gesture?.kind === 'wall' ? gesture.face : selectedWall;
  const measuredOpening = gesture?.kind === 'opening'
    ? gestureRoom?.openings.find(opening => opening.id === gesture.openingId)
    : undefined;
  const clearanceItem = (() => {
    if (movingEquipment) {
      const base = project.equipment.find(item => item.id === movingEquipment.id);
      return base ? { ...base, xM: movingEquipment.xM, yM: movingEquipment.yM } : null;
    }
    if (rotatingEquipment) {
      const base = project.equipment.find(item => item.id === rotatingEquipment.id);
      return base ? { ...base, yawDeg: rotatingEquipment.yawDeg } : null;
    }
    if (selection.kind === 'equipment' && gesture?.kind !== 'equipment' && gesture?.kind !== 'rotate') {
      return project.equipment.find(item => item.id === selection.id) ?? null;
    }
    return null;
  })();
  const clearanceFoot = clearanceItem ? componentFootprintAabb(clearanceItem) : null;
  const clearanceRoom = clearanceItem ? roomAtPoint(rooms, clearanceItem.xM, clearanceItem.yM) : null;
  // Legend: the duct streams actually in view, drawn the way the plan draws them at this zoom.
  const viewX0 = view.minX;
  const viewX1 = view.minX + view.w;
  const viewY0 = view.minY;
  const viewY1 = view.minY + view.h;
  // Units drawn open (diagram) in view: their inner streams join the legend.
  const openUnits = showSystems
    ? project.equipment.filter(item => {
        const product = getProduct(item.catalogId);
        if (!isUnit(product)) return false;
        const size = equipmentSizeM(product);
        const reach = Math.max(size.lengthM, size.widthM) / 2;
        const inView = item.xM + reach >= viewX0 && item.xM - reach <= viewX1 && item.yM + reach >= viewY0 && item.yM - reach <= viewY1;
        return inView && (layers.internals || expandedUnits.has(item.id) || size.lengthM * pxPerM >= UNIT_DETAIL_PX);
      })
    : [];
  const openUnitInView = openUnits.length > 0;
  const legendEntries: AirKeyEntry[] = (() => {
    const found = new Map<string, AirKeyEntry>();
    // One row per kind of air: the colours no longer differ by system.
    const add = (service: DuctService, double: boolean) => {
      const group = service === 'relief' ? 'exhaust' : service;
      const prev = found.get(group);
      found.set(group, { label: AIR_KEY_LABEL[group], color: SERVICE_COLOR[group], service: group, double: double || !!prev?.double });
    };
    if (openUnits.length > 0) for (const service of ['outdoor', 'return', 'supply', 'relief'] as const) add(service, true);
    for (const run of project.ducts ?? []) {
      if (ductViewOf(run) !== 'plan' || run.points.length < 2) continue;
      const xs = run.points.map(point => point.x);
      const ys = run.points.map(point => point.y);
      if (Math.max(...xs) < viewX0 || Math.min(...xs) > viewX1 || Math.max(...ys) < viewY0 || Math.min(...ys) > viewY1) continue;
      add(run.service, run.widthM * pxPerM >= 6);
    }
    const order = (entry: AirKeyEntry) => AIR_KEY_ORDER.indexOf(entry.service);
    return [...found.values()].sort((a, b) => order(a) - order(b));
  })();
  const planEquipment = project.equipment
    .filter(item => !isSchematicOnly(getProduct(item.catalogId)))
    .map(item => {
    const before = gesture?.kind === 'space' ? project.rooms.find(room => room.id === item.roomId) : undefined;
    const after = before ? rooms.find(room => room.id === before.id) : undefined;
    const shifted = before && after ? { ...item, xM: item.xM + (after.xM - before.xM), yM: item.yM + (after.yM - before.yM) } : item;
    return movingEquipment?.id === item.id ? { ...shifted, xM: movingEquipment.xM, yM: movingEquipment.yM } : shifted;
  });
  const planLoads = (project.loads ?? []).map(item => {
    const before = gesture?.kind === 'space' ? project.rooms.find(room => room.id === item.roomId) : undefined;
    const after = before ? rooms.find(room => room.id === before.id) : undefined;
    const shifted = before && after ? { ...item, xM: item.xM + (after.xM - before.xM), yM: item.yM + (after.yM - before.yM) } : item;
    const moved = movingLoad?.id === item.id ? { ...shifted, xM: movingLoad.xM, yM: movingLoad.yM } : shifted;
    return rotatingLoad?.id === item.id ? { ...moved, yawDeg: rotatingLoad.yawDeg } : moved;
  });
  const openHitMenu = (event: ReactMouseEvent, next: Selection) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(next, event.clientX, event.clientY);
  };
  const scale = niceScale(pxPerM, project.units);
  // Screen-sized text: it grows a little as you zoom in (up to 1.4x), then holds, so labels never balloon into each other.
  const zoomBoost = Math.min(1.4, Math.max(1, 1 + (pxPerM - 40) / 250));
  const font = (12 * zoomBoost) / Math.max(pxPerM, 1e-6);
  const drawnDoorways = new Set<string>();
  const showSwing = (room: Room, opening: Opening) => {
    if (opening.kind !== 'door') return false;
    const key = doorwayKey(room, opening);
    if (drawnDoorways.has(key)) return false;
    drawnDoorways.add(key);
    return true;
  };

  return (
    <div
      className={['plan-wrap', tool.kind === 'draw' ? 'is-draw' : '', tool.kind === 'place' || tool.kind === 'load' ? 'is-place' : '', tool.kind === 'select' ? 'is-select' : '', tool.kind === 'wall' ? 'is-wall' : '', tool.kind === 'duct' ? 'is-duct' : '', tool.kind === 'door' || tool.kind === 'window' ? 'is-opening-tool' : '', gesture ? 'is-dragging' : '', gesture?.kind === 'equipment' ? 'is-moving-equipment' : '', gesture?.kind === 'rotate' ? 'is-rotating-equipment' : '', locked ? 'is-locked' : '', catalogOver ? 'is-catalog-drop' : ''].filter(Boolean).join(' ')}
      onDragEnter={event => {
        if (![...event.dataTransfer.types].includes(CATALOG_MIME)) return;
        event.preventDefault();
        setCatalogOver(true);
      }}
      onDragOver={event => {
        if (![...event.dataTransfer.types].includes(CATALOG_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        const drag = activeCatalogDrag();
        const box = event.currentTarget.getBoundingClientRect();
        if (hintRef.current) hintRef.current.style.transform = `translate(${event.clientX - box.left + 14}px, ${event.clientY - box.top + 16}px)`;
        if (!drag) return;
        const point = toWorld(event.clientX, event.clientY);
        const dropped = { xM: snap(point.xM), yM: snap(point.yM) };
        let hint: DropHint | null = null;
        if (drag.kind === 'opening' || drag.kind === 'wall') {
          const spot = locateOpening(project.rooms, wallRuns, dropped, drag.kind === 'opening' ? drag.opening : 'door');
          const onWall = drag.kind === 'wall' ? !!(wallUnderPointer(event.clientX, event.clientY) ?? spot?.roomId) : !!spot;
          hint = onWall ? null : { text: 'Drop on a wall', warn: true };
        } else {
          hint = describeDrop?.(drag, drag.kind === 'duct' ? point : dropped, event.altKey) ?? null;
        }
        const key = hint ? `${hint.text}|${hint.systemId ?? ''}|${hint.warn ? 1 : 0}` : '';
        if (key !== hintKey.current) {
          hintKey.current = key;
          setDropHint(hint);
        }
      }}
      onDragLeave={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setCatalogOver(false);
        hintKey.current = '';
        setDropHint(null);
      }}
      onDrop={event => {
        setCatalogOver(false);
        hintKey.current = '';
        setDropHint(null);
        const drag = parseCatalogDrag(event.dataTransfer.getData(CATALOG_MIME));
        if (!drag) return;
        event.preventDefault();
        const point = toWorld(event.clientX, event.clientY);
        const dropped = { xM: snap(point.xM), yM: snap(point.yM) };
        const note = (text: string | void) => {
          if (text) showNote(event.clientX, event.clientY, text);
        };
        if (drag.kind === 'equipment') {
          note(onPlace(dropped, drag.id, { clientX: event.clientX, clientY: event.clientY, alt: event.altKey }));
          return;
        }
        if (drag.kind === 'package') {
          onPlacePackage(dropped, drag.id);
          return;
        }
        if (drag.kind === 'load') {
          note(onPlaceLoad(dropped, drag.id));
          return;
        }
        if (drag.kind === 'opening') {
          const spot = locateOpening(project.rooms, wallRuns, dropped, drag.opening);
          if (spot) onPlaceOpening(spot, drag.opening);
          else note(`Drop the ${drag.opening} on a wall.`);
          return;
        }
        if (drag.kind === 'wall') {
          const spot = locateOpening(project.rooms, wallRuns, dropped, 'door');
          const target = wallUnderPointer(event.clientX, event.clientY) ?? (spot?.roomId ? { kind: 'surface' as const, roomId: spot.roomId, face: 'walls' as const, wallFace: spot.face } : null);
          if (target) onPaintWall(target, drag.id);
          else note('Drop the wall type on a wall.');
          return;
        }
        const begun = onBeginDuct(drag.id, point);
        if (typeof begun === 'string') {
          note(begun);
          return;
        }
        const armed = begun.tool;
        if (!armed.systemId) return;
        const snapped = begun.start ?? snapDuct(dropped.xM, dropped.yM, project, armed.systemId, armed.service);
        ductChainRef.current = [snapped];
        ductSettings.current = armed;
        setDuctChain([snapped]);
        setDuctAim(snapped);
      }}
    >
      <div ref={hintRef} className={`drop-hint${dropHint?.warn ? ' warn' : ''}`} hidden={!dropHint} aria-live="polite">
        {dropHint?.text}
      </div>
      {dropNote && (
        <div className="drop-hint warn is-note" role="status" style={{ transform: `translate(${dropNote.x + 14}px, ${dropNote.y + 16}px)` }}>
          {dropNote.text}
        </div>
      )}
      <div className="plan-sheet">
      <svg
        ref={svgRef}
        viewBox={`${view.minX} ${-(view.minY + view.h)} ${view.w} ${view.h}`}
        style={{ fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif' }}
        onClickCapture={event => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.stopPropagation();
          event.preventDefault();
        }}
        onMouseDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
        }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          document.documentElement.style.userSelect = 'none';
          window.getSelection()?.removeAllRanges();
          const point = toWorld(event.clientX, event.clientY);
          if (tool.kind === 'draw') {
            const start = snapPointToWalls(snap(point.xM), snap(point.yM), project.rooms);
            drag.current = { kind: 'draw', x: start.x, y: start.y, pointerX: event.clientX, pointerY: event.clientY, view };
            setDraft({ xM: start.x, yM: start.y, lengthM: SNAP_M, widthM: SNAP_M });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (tool.kind === 'wall') {
            const snapped = snapDrawPoint(point.xM, point.yM, project.rooms, wallRuns, chainRef.current ?? [], pxPerM);
            const points = chainRef.current;
            if (!points) {
              const next = [{ x: snapped.x, y: snapped.y }];
              chainRef.current = next;
              setChain(next);
              setAim(snapped);
              return;
            }
            if (snapped.close) {
              const loop = points.map(item => ({ x: Number(item.x.toFixed(3)), y: Number(item.y.toFixed(3)) }));
              if (outlineRoomOk(loop)) {
                chainRef.current = null;
                setChain(null);
                setAim(null);
                onCloseSpace(loop);
                return;
              }
            }
            const last = points[points.length - 1];
            if (Math.hypot(snapped.x - last.x, snapped.y - last.y) < MIN_DRAW_M) return;
            if (points.some(item => Math.hypot(item.x - snapped.x, item.y - snapped.y) < 0.02)) return;
            const next = [...points, { x: snapped.x, y: snapped.y }];
            chainRef.current = next;
            setChain(next);
            setAim(snapped);
            return;
          }
          if (tool.kind === 'duct' && ductChainRef.current) {
            if (!tool.systemId) return;
            const snapped = snapDuct(point.xM, point.yM, project, tool.systemId, tool.service);
            const points = ductChainRef.current;
            const last = points[points.length - 1];
            if (Math.hypot(snapped.x - last.x, snapped.y - last.y) < 0.15) return;
            const next = [...points, snapped];
            const sameStart = points.length === 1 && joins(points[0]) && sameJoin(points[0], snapped);
            if (joins(snapped) && !sameStart) {
              ductChainRef.current = null;
              setDuctChain(null);
              setDuctAim(null);
              onDrawDuct({
                points: next,
                catalogId: tool.catalogId,
                systemId: tool.systemId,
                service: tool.service,
                shape: tool.shape,
                widthM: tool.widthM,
                heightM: tool.heightM,
              });
              return;
            }
            ductChainRef.current = next;
            setDuctChain(next);
            setDuctAim(snapped);
            return;
          }
          if (tool.kind === 'duct' && !ductChainRef.current && tool.systemId) {
            const snapped = snapDuct(point.xM, point.yM, project, tool.systemId, tool.service);
            ductChainRef.current = [snapped];
            setDuctChain([snapped]);
            setDuctAim(snapped);
            return;
          }
          const target = event.target as Element;
          const hit = target.closest('[data-hit]');
          const hitKind = hit?.getAttribute('data-hit') ?? '';
          const owner = hitPhase(hitKind);
          // Locked, or an item of another phase: a click selects it (switching phase), a drag pans instead of moving it.
          frozenDrag.current = locked || (!!hit && step !== 'check' && !!owner && owner !== step);
          const frozen = frozenDrag.current;
          const selects = tool.kind === 'select' || tool.kind === 'place' || tool.kind === 'load' || tool.kind === 'door' || tool.kind === 'window';
          if (selects && hit) {
            const roomId = hit.getAttribute('data-room');
            const room = roomId ? project.rooms.find(item => item.id === roomId) : undefined;
            if (hit.getAttribute('data-hit') === 'wall' && room) {
              const face = hit.getAttribute('data-face') as WallFace;
              const partners = touchingRooms(room, face, project.rooms)
                .map(other => ({ id: other.id, face: partnerFace(room, face, other) }))
                .filter((item): item is { id: string; face: WallFace } => item.face !== null);
              drag.current = { kind: 'wall', edges: [{ id: room.id, face }, ...partners], base: project.rooms, pointerX: event.clientX, pointerY: event.clientY, view, face, armed: false };
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
            }
            if (!frozen && hit.getAttribute('data-hit') === 'equipment-rotate') {
              const id = hit.getAttribute('data-id');
              const item = id ? project.equipment.find(entry => entry.id === id) : undefined;
              if (item) {
                drag.current = {
                  kind: 'rotate',
                  id: item.id,
                  xM: item.xM,
                  yM: item.yM,
                  startYaw: item.yawDeg,
                  startAngle: (Math.atan2(point.yM - item.yM, point.xM - item.xM) * 180) / Math.PI,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  view,
                };
                setGesture({ kind: 'rotate', id: item.id });
                onSelect({ kind: 'equipment', id: item.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              return;
            }
            if (!frozen && hit.getAttribute('data-hit') === 'load-rotate') {
              const id = hit.getAttribute('data-id');
              const item = id ? (project.loads ?? []).find(entry => entry.id === id) : undefined;
              if (item) {
                drag.current = {
                  kind: 'load-rotate',
                  id: item.id,
                  xM: item.xM,
                  yM: item.yM,
                  startYaw: item.yawDeg,
                  startAngle: (Math.atan2(point.yM - item.yM, point.xM - item.xM) * 180) / Math.PI,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  view,
                };
                onSelect({ kind: 'load', id: item.id });
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              return;
            }
            if (hit.getAttribute('data-hit') === 'load') {
              const id = hit.getAttribute('data-id');
              const item = id ? (project.loads ?? []).find(entry => entry.id === id) : undefined;
              if (item) {
                drag.current = { kind: 'load', id: item.id, xM: item.xM, yM: item.yM, grabX: point.xM, grabY: point.yM, pointerX: event.clientX, pointerY: event.clientY, view, armed: false };
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              return;
            }
            if (hit.getAttribute('data-hit') === 'equipment' || hit.getAttribute('data-hit') === 'unit-section' || hit.getAttribute('data-hit') === 'unit-duct') {
              const id = hit.getAttribute('data-id');
              const sectionId = hit.getAttribute('data-section') ?? undefined;
              const linkId = hit.getAttribute('data-link') ?? undefined;
              const item = id ? project.equipment.find(entry => entry.id === id) : undefined;
              if (item) {
                drag.current = {
                  kind: 'equipment',
                  id: item.id,
                  xM: item.xM,
                  yM: item.yM,
                  grabX: point.xM,
                  grabY: point.yM,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  view,
                  armed: false,
                  sectionId,
                  linkId,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              return;
            }
            if (hit.getAttribute('data-hit') === 'room') {
              const id = hit.getAttribute('data-room');
              const moving = id ? project.rooms.find(item => item.id === id) : undefined;
              if (moving) {
                drag.current = { kind: 'space', id: moving.id, base: project.rooms, grabX: point.xM, grabY: point.yM, pointerX: event.clientX, pointerY: event.clientY, view, armed: false };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
            }
            if (hit.getAttribute('data-hit') === 'opening' && room) {
              const openingId = hit.getAttribute('data-opening');
              const opening = room.openings.find(item => item.id === openingId);
              if (opening) {
                const key = doorwayKey(room, opening);
                const pair = project.rooms.flatMap(other => other.openings.filter(item => item.id !== opening.id && item.kind === opening.kind && doorwayKey(other, item) === key).map(item => ({ roomId: other.id, openingId: item.id })))[0];
                drag.current = {
                  kind: 'opening',
                  moves: [{ roomId: room.id, openingId: opening.id }, ...(pair ? [pair] : [])],
                  grab: alongPoint(opening.face, point) - openingAlong(room, opening),
                  base: project.rooms,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  view,
                  face: opening.face,
                  armed: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
            }
            if (hit.getAttribute('data-hit') === 'interface') {
              const key = hit.getAttribute('data-key') ?? '';
              const target = findInterface(project.rooms, key);
              const side = target && target.sides.length === 1 ? target.sides[0] : undefined;
              const face = side?.anchor.startsWith('f:') ? side.anchor.slice(2) : '';
              const host = side ? project.rooms.find(item => item.id === side.roomId) : undefined;
              if (host && (face === 'px' || face === 'nx' || face === 'py' || face === 'ny')) {
                const partners = touchingRooms(host, face, project.rooms)
                  .map(other => ({ id: other.id, face: partnerFace(host, face, other) }))
                  .filter((item): item is { id: string; face: WallFace } => item.face !== null);
                drag.current = {
                  kind: 'wall',
                  edges: [{ id: host.id, face }, ...partners],
                  base: project.rooms,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  view,
                  face,
                  armed: false,
                  interfaceKey: key,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              return;
            }
          }
          if (hit) {
            // Items that select through their own click (ducts, pipes, sensors): when frozen, dragging from them pans.
            // No pointer capture, so a plain click still reaches the item.
            if (frozen) drag.current = { kind: 'pan', x: point.xM, y: point.yM, pointerX: event.clientX, pointerY: event.clientY, view, keepClick: true };
            return;
          }
          drag.current = { kind: 'pan', x: point.xM, y: point.yM, pointerX: event.clientX, pointerY: event.clientY, view };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const point = toWorld(event.clientX, event.clientY);
          const current = drag.current;
          if (!current) {
            if (tool.kind === 'door' || tool.kind === 'window') showSpot(locateOpening(project.rooms, wallRuns, point, tool.kind));
            if (tool.kind === 'wall') {
              const next = snapDrawPoint(point.xM, point.yM, project.rooms, wallRuns, chainRef.current ?? [], pxPerM);
              setAim(prev => (prev && prev.x === next.x && prev.y === next.y && prev.kind === next.kind && prev.close === next.close && prev.guides.length === next.guides.length ? prev : next));
            }
            if (tool.kind === 'duct') {
              const next = snapDuct(point.xM, point.yM, project, tool.systemId, tool.service);
              setDuctAim(prev => (prev && prev.x === next.x && prev.y === next.y && prev.portId === next.portId && prev.equipmentId === next.equipmentId ? prev : next));
            }
            return;
          }
          if (!window.getSelection()?.isCollapsed) window.getSelection()?.removeAllRanges();
          if (current.kind === 'stamp') {
            if (tool.kind === 'door' || tool.kind === 'window') showSpot(locateOpening(project.rooms, wallRuns, point, tool.kind));
            return;
          }
          if (current.kind === 'pan') {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const dx = ((event.clientX - current.pointerX) / rect.width) * current.view.w;
            const dy = ((event.clientY - current.pointerY) / rect.height) * current.view.h;
            setView({ ...current.view, minX: current.view.minX - dx, minY: current.view.minY + dy });
            return;
          }
          if (current.kind === 'draw') {
            const rect = snapDrawnRect(current.x, current.y, snap(point.xM), snap(point.yM), project.rooms);
            setDraft({ xM: rect.xM, yM: rect.yM, lengthM: Math.max(rect.lengthM, SNAP_M), widthM: Math.max(rect.widthM, SNAP_M) });
            return;
          }
          // Frozen press (locked, or another phase's item): under the drag threshold it stays a click that selects on release; past it, the canvas pans.
          if (frozenDrag.current && (current.kind === 'equipment' || current.kind === 'load' || current.kind === 'space' || current.kind === 'wall' || current.kind === 'opening')) {
            if (Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY) < DRAG_PX) return;
            const pan = { kind: 'pan' as const, x: point.xM, y: point.yM, pointerX: current.pointerX, pointerY: current.pointerY, view: current.view };
            drag.current = pan;
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const dx = ((event.clientX - pan.pointerX) / rect.width) * pan.view.w;
            const dy = ((event.clientY - pan.pointerY) / rect.height) * pan.view.h;
            setView({ ...pan.view, minX: pan.view.minX - dx, minY: pan.view.minY + dy });
            return;
          }
          if (current.kind === 'equipment') {
            if (!current.armed) {
              if (Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY) < DRAG_PX) return;
              current.armed = true;
              setGesture({ kind: 'equipment', id: current.id });
              onSelect({ kind: 'equipment', id: current.id });
            }
            const item = project.equipment.find(entry => entry.id === current.id);
            const rawX = snap(current.xM + (point.xM - current.grabX));
            const rawY = snap(current.yM + (point.yM - current.grabY));
            const placed = item
              ? constrainEquipmentPosition(project.rooms, item, rawX, rawY)
              : { xM: rawX, yM: rawY };
            showEquipment({ id: current.id, xM: placed.xM, yM: placed.yM });
            setReadout({ x: placed.xM, y: placed.yM, text: `${formatDelta(placed.xM - current.xM, project.units)} · ${formatDelta(placed.yM - current.yM, project.units)}` });
            return;
          }
          if (current.kind === 'load') {
            if (!current.armed) {
              if (Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY) < DRAG_PX) return;
              current.armed = true;
              onSelect({ kind: 'load', id: current.id });
            }
            const xM = snap(current.xM + (point.xM - current.grabX));
            const yM = snap(current.yM + (point.yM - current.grabY));
            showLoad({ id: current.id, xM, yM });
            setReadout({ x: xM, y: yM, text: `${formatDelta(xM - current.xM, project.units)} · ${formatDelta(yM - current.yM, project.units)}` });
            return;
          }
          if (current.kind === 'rotate' || current.kind === 'load-rotate') {
            const angle = (Math.atan2(point.yM - current.yM, point.xM - current.xM) * 180) / Math.PI;
            const yawDeg = snapYaw(current.startYaw + (angle - current.startAngle));
            if (current.kind === 'rotate') showRotate({ id: current.id, yawDeg });
            else showLoadRotate({ id: current.id, yawDeg });
            setReadout({ x: point.xM, y: point.yM, text: `${yawDeg}°` });
            return;
          }
          if (current.kind === 'space') {
            if (!current.armed) {
              if (Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY) < DRAG_PX) return;
              current.armed = true;
              setGesture({ kind: 'space', roomId: current.id });
              onSelect({ kind: 'room', id: current.id });
            }
            const room = current.base.find(item => item.id === current.id);
            if (!room) return;
            const gridX = snap(room.xM + (point.xM - current.grabX));
            const gridY = snap(room.yM + (point.yM - current.grabY));
            const placed = shiftRoom(room, gridX - room.xM, gridY - room.yM);
            const delta = snapSpaceDelta(placed, current.base, room.id);
            const dx = gridX + delta.dx - room.xM;
            const dy = gridY + delta.dy - room.yM;
            showLive(current.base.map(item => (item.id === current.id ? shiftRoom(item, dx, dy) : item)));
            setReadout({ x: point.xM, y: point.yM, text: `${formatDelta(dx, project.units)} · ${formatDelta(dy, project.units)}` });
            return;
          }
          if (current.kind === 'wall') {
            if (!current.armed) {
              if (Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY) < DRAG_PX) return;
              current.armed = true;
              setGesture({ kind: 'wall', roomId: current.edges[0].id, face: current.face });
            }
            const raw = current.face === 'px' || current.face === 'nx' ? point.xM : point.yM;
            const host = current.base.find(item => item.id === current.edges[0].id);
            const verticalEdge = current.face === 'px' || current.face === 'nx';
            const along0 = host ? (verticalEdge ? host.yM : host.xM) : raw;
            const along1 = host ? (verticalEdge ? host.yM + host.widthM : host.xM + host.lengthM) : raw;
            const edge = host ? snapWallEdge(current.face, raw, along0, along1, host, current.base, current.edges.map(item => item.id)) : raw;
            const next = moveEdges(current.base, current.edges, edge);
            showLive(next);
            const id = current.edges[0].id;
            const before = current.base.find(room => room.id === id);
            const after = next.find(room => room.id === id);
            if (before && after) {
              const shown = quantizeMeters(edgeValue(after, current.face) - edgeValue(before, current.face), dragUnitStep(pxPerM, project.units), project.units);
              setReadout({ x: point.xM, y: point.yM, text: formatDelta(shown, project.units) });
            }
            return;
          }
          if (current.kind === 'opening') {
            if (!current.armed) {
              if (Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY) < DRAG_PX) return;
              current.armed = true;
              setGesture({ kind: 'opening', roomId: current.moves[0].roomId, face: current.face, openingId: current.moves[0].openingId });
            }
            const worldStart = alongPoint(current.face, point) - current.grab;
            const next = slideOpeningsTogether(current.base, current.moves, worldStart);
            showLive(next);
            const move = current.moves[0];
            const before = current.base.find(room => room.id === move.roomId)?.openings.find(item => item.id === move.openingId);
            const afterRoom = next.find(room => room.id === move.roomId);
            const after = afterRoom?.openings.find(item => item.id === move.openingId);
            if (before && after) {
              const shown = quantizeMeters(after.offsetM - before.offsetM, dragUnitStep(pxPerM, project.units), project.units);
              setReadout({ x: point.xM, y: point.yM, text: formatDelta(shown, project.units) });
            }
          }
        }}
        onPointerCancel={() => {
          document.documentElement.style.userSelect = '';
          drag.current = null;
          showLive(null);
          showEquipment(null);
          showRotate(null);
          showLoad(null);
          showLoadRotate(null);
          setGesture(null);
          setReadout(null);
        }}
        onPointerUp={event => {
          document.documentElement.style.userSelect = '';
          window.getSelection()?.removeAllRanges();
          const current = drag.current;
          drag.current = null;
          if (!current) return;
          const moved = Math.hypot(event.clientX - current.pointerX, event.clientY - current.pointerY);
          if (current.kind === 'draw') {
            const point = toWorld(event.clientX, event.clientY);
            const rect = snapDrawnRect(current.x, current.y, snap(point.xM), snap(point.yM), project.rooms);
            setDraft(null);
            if (rect.lengthM >= MIN_DRAW_M && rect.widthM >= MIN_DRAW_M) onDrawRoom(rect);
            return;
          }
          if (current.kind === 'stamp') {
            const placed = spotRef.current;
            if (moved < DRAG_PX && placed && (tool.kind === 'door' || tool.kind === 'window')) {
              onPlaceOpening(placed, tool.kind);
              spotRef.current = null;
              setSpot(null);
            }
            return;
          }
          if (current.kind === 'place' && moved < 6) {
            const point = toWorld(event.clientX, event.clientY);
            if (tool.kind === 'place') onPlace({ xM: snap(point.xM), yM: snap(point.yM) }, tool.catalogId);
            if (tool.kind === 'load') onPlaceLoad({ xM: snap(point.xM), yM: snap(point.yM) }, tool.loadId);
            return;
          }
          if (current.kind === 'load') {
            const next = movingLoadRef.current;
            showLoad(null);
            setReadout(null);
            suppressClick.current = true;
            onSelect({ kind: 'load', id: current.id });
            if (current.armed && next && next.id === current.id) onMoveLoad(current.id, next.xM, next.yM);
            return;
          }
          if (current.kind === 'load-rotate') {
            const next = rotatingLoadRef.current;
            showLoadRotate(null);
            setReadout(null);
            suppressClick.current = true;
            onSelect({ kind: 'load', id: current.id });
            if (next && next.id === current.id && Math.abs(next.yawDeg - current.startYaw) > 1e-6) onRotateLoad(current.id, next.yawDeg);
            return;
          }
          if (current.kind === 'pan') {
            if (moved >= DRAG_PX) suppressClick.current = true;
            else if (!current.keepClick && tool.kind === 'select') onSelect({ kind: 'project' });
            return;
          }
          if (current.kind === 'equipment') {
            const next = movingRef.current;
            showEquipment(null);
            setGesture(null);
            setReadout(null);
            suppressClick.current = true;
            if (!current.armed) {
              // A second click on the same unit within a moment opens or closes its internals.
              const now = Date.now();
              const last = lastUnitClick.current;
              lastUnitClick.current = { id: current.id, t: now };
              const item = project.equipment.find(entry => entry.id === current.id);
              if (last && last.id === current.id && now - last.t < 380 && item && isUnit(getProduct(item.catalogId))) {
                lastUnitClick.current = null;
                onToggleInternals(current.id);
              }
            }
            onSelect(
              !current.armed && current.sectionId
                ? { kind: 'section', equipmentId: current.id, id: current.sectionId }
                : !current.armed && current.linkId
                  ? { kind: 'unit-duct', equipmentId: current.id, id: current.linkId }
                  : { kind: 'equipment', id: current.id },
            );
            if (current.armed && next && next.id === current.id) onMoveEquipment(current.id, next.xM, next.yM);
            return;
          }
          if (current.kind === 'rotate') {
            const next = rotatingRef.current;
            showRotate(null);
            setGesture(null);
            setReadout(null);
            suppressClick.current = true;
            onSelect({ kind: 'equipment', id: current.id });
            if (next && next.id === current.id && Math.abs(next.yawDeg - current.startYaw) > 1e-6) {
              onRotateEquipment(current.id, next.yawDeg);
            }
            return;
          }
          if (current.kind === 'space') {
            const before = current.base.find(room => room.id === current.id);
            const after = previewRef.current?.find(room => room.id === current.id);
            showLive(null);
            setGesture(null);
            setReadout(null);
            suppressClick.current = true;
            onSelect({ kind: 'room', id: current.id });
            if (current.armed && before && after) {
              const dx = after.xM - before.xM;
              const dy = after.yM - before.yM;
              if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) onMoveSpace(current.id, dx, dy);
            }
            return;
          }
          if (current.kind === 'wall' || current.kind === 'opening') {
            const select = () => {
              suppressClick.current = true;
              if (current.kind === 'wall') {
                if (!current.armed && current.interfaceKey) onSelect({ kind: 'interface', key: current.interfaceKey });
                else onSelect({ kind: 'surface', roomId: current.edges[0].id, face: 'walls', wallFace: current.face });
              } else onSelect({ kind: 'opening', roomId: current.moves[0].roomId, id: current.moves[0].openingId });
            };
            if (!current.armed) {
              showLive(null);
              setGesture(null);
              setReadout(null);
              select();
              return;
            }
            const next = previewRef.current ? settleDrag(current, previewRef.current, pxPerM, project.units) : null;
            showLive(null);
            setGesture(null);
            setReadout(null);
            select();
            if (next && geometryChanged(current.base, next)) {
              onRoomsChange(next.map(room => {
                const prev = current.base.find(item => item.id === room.id);
                const movedRoom = !!prev && (prev.xM !== room.xM || prev.yM !== room.yM || prev.lengthM !== room.lengthM || prev.widthM !== room.widthM || room.openings.some(opening => prev.openings.find(item => item.id === opening.id)?.offsetM !== opening.offsetM));
                return movedRoom && room.assumption ? { ...room, assumption: false } : room;
              }));
            }
          }
        }}
      >
        <g transform="scale(1,-1)">
          <g opacity={fade.spaces}>
          {rooms.map(room => {
            const shaped = (room.outline?.length ?? 0) >= 3;
            const fill = showSpaces ? (room.id === highlightedRoom?.id ? SELECT_FILL : wash(roomFill(room.use))) : 'none';
            const stroke = showSpaces ? 'none' : '#b7b7b0';
            const selectRoom = (event: ReactMouseEvent) => {
              event.stopPropagation();
              if (tool.kind !== 'select') return;
              onSelect({ kind: 'room', id: room.id });
            };
            const menu = (event: ReactMouseEvent) => openHitMenu(event, { kind: 'room', id: room.id });
            return shaped ? (
              <polygon
                key={room.id}
                data-hit="room"
                data-room={room.id}
                points={room.outline!.map(point => `${point.x},${point.y}`).join(' ')}
                fill={ink(fill)}
                stroke={ink(stroke)}
                strokeWidth={showSpaces ? 0 : HAIR}
                vectorEffect="non-scaling-stroke"
                onClick={selectRoom}
                onContextMenu={menu}
              />
            ) : (
              <rect
                key={room.id}
                data-hit="room"
                data-room={room.id}
                x={room.xM}
                y={room.yM}
                width={room.lengthM}
                height={room.widthM}
                fill={ink(fill)}
                stroke={ink(stroke)}
                strokeWidth={showSpaces ? 0 : HAIR}
                vectorEffect="non-scaling-stroke"
                onClick={selectRoom}
                onContextMenu={menu}
              />
            );
          })}
          <SheetGrid view={view} pxPerM={pxPerM} />
          {showSpaces && <PlanWalls rooms={rooms} interfaceWalls={project.interfaceWalls} />}
          {showSpaces && <DrawnWalls runs={wallRuns} selection={selection} tool={tool} onSelect={onSelect} onMenu={openHitMenu} />}
          {showSpaces && rooms.flatMap(room =>
            room.openings.map(opening => {
              const graphic = graphicWall(room.surfaces.walls[opening.face].constructionId);
              const gap = openingGap(room, opening, graphic.thickness);
              const ends = openingEnds(room, opening);
              const swing = doorArc(opening.face, doorHinge(opening), doorSwingSide(opening));
              const hingeAtEnd = doorHinge(opening) === 'end';
              const hingeX = (hingeAtEnd ? ends.x1 : ends.x0) + swing.nx * (graphic.thickness / 2);
              const hingeY = (hingeAtEnd ? ends.y1 : ends.y0) + swing.ny * (graphic.thickness / 2);
              const active = selection.kind === 'opening' && (selection.id === opening.id || (opening.kind === 'door' && doorwayKey(room, opening) === selectedDoorway));
              return (
                <g key={opening.id} pointerEvents="none">
                  <rect {...gap} fill={wash(roomFill(room.use))} />
                  {showSwing(room, opening) && (
                    <g fill="none" stroke={ink(active ? SELECT : MARK_COLOR.door)} strokeWidth={active ? 2.25 : HAIR}>
                      <line x1={hingeX} y1={hingeY} x2={hingeX + swing.nx * opening.widthM} y2={hingeY + swing.ny * opening.widthM} vectorEffect="non-scaling-stroke" />
                      <polyline points={arcPoints(hingeX, hingeY, opening.widthM, swing.from, swing.to)} vectorEffect="non-scaling-stroke" />
                    </g>
                  )}
                  {opening.kind === 'window' && <WindowMark ends={ends} face={opening.face} active={active} />}
                </g>
              );
            })
          )}
          {showSpaces && rooms.filter(room => (room.outline?.length ?? 0) >= 3).flatMap(room =>
            (room.outline ?? []).map((point, index) => {
              const next = room.outline![(index + 1) % room.outline!.length];
              return (
                <line
                  key={`${room.id}-edge-${index}-hit`}
                  data-hit="edge"
                  data-room={room.id}
                  data-edge={index}
                  x1={point.x}
                  y1={point.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="transparent"
                  strokeWidth={0.5}
                  onClick={event => {
                    event.stopPropagation();
                    if (tool.kind !== 'select') return;
                    onSelect({ kind: 'surface', roomId: room.id, face: 'walls', edge: index });
                  }}
                  onContextMenu={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect({ kind: 'surface', roomId: room.id, face: 'walls', edge: index });
                  }}
                />
              );
            })
          )}
          {showSpaces && rooms.filter(room => (room.outline?.length ?? 0) < 3).flatMap(room =>
            WALL_FACE_IDS.map(face => {
              const line = wallLine(room, face);
              return (
                <line
                  key={`${room.id}-${face}-hit`}
                  data-hit="wall"
                  data-room={room.id}
                  data-face={face}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="transparent"
                  strokeWidth={0.5}
                  onClick={event => {
                    event.stopPropagation();
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (tool.kind !== 'select') return;
                    onSelect({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face });
                  }}
                  onContextMenu={event => openHitMenu(event, { kind: 'surface', roomId: room.id, face: 'walls', wallFace: face })}
                />
              );
            })
          )}
          {showSpaces && interfaceTargets(rooms).map(target => (
            <line
              key={target.key}
              data-hit="interface"
              data-key={target.key}
              x1={target.x0}
              y1={target.y0}
              x2={target.x1}
              y2={target.y1}
              stroke="transparent"
              strokeWidth={0.5}
              onClick={event => {
                event.stopPropagation();
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (tool.kind !== 'select') return;
                onSelect({ kind: 'interface', key: target.key });
              }}
              onContextMenu={event => {
                event.preventDefault();
                event.stopPropagation();
                onSelect({ kind: 'interface', key: target.key });
              }}
            />
          ))}
          {showSpaces && rooms.flatMap(room =>
            room.openings.map(opening => {
              const ends = openingEnds(room, opening);
              return (
                <line
                  key={`${opening.id}-hit`}
                  data-hit="opening"
                  data-room={room.id}
                  data-opening={opening.id}
                  x1={ends.x0}
                  y1={ends.y0}
                  x2={ends.x1}
                  y2={ends.y1}
                  stroke="transparent"
                  strokeWidth={0.36}
                  onClick={event => {
                    event.stopPropagation();
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (tool.kind !== 'select') return;
                    onSelect({ kind: 'opening', roomId: room.id, id: opening.id });
                  }}
                  onContextMenu={event => openHitMenu(event, { kind: 'opening', roomId: room.id, id: opening.id })}
                />
              );
            })
          )}
          </g>
          {(layers.ducts || tool.kind === 'duct') && (
            <g opacity={tool.kind === 'duct' ? 1 : fade.ducts}>
              <DuctLayer project={project} selection={selection} tool={tool} fontM={font} pxPerM={pxPerM} showSize={showDuctSize} allLabels={layers.labels} systemId={shownSystemId} onSelect={onSelect} onContextMenu={onContextMenu} />
            </g>
          )}
          {layers.piping && showSystems && <g opacity={fade.equipment}><PipeLayer project={project} selection={selection} tool={tool} fontM={font} allLabels={layers.labels} onSelect={onSelect} /></g>}
          {layers.spaces && (
            <g opacity={fade.spaces}>
              {rooms.map(room => {
                const shaped = (room.outline?.length ?? 0) >= 3;
                const area = shaped ? polygonArea(room.outline ?? []) : room.lengthM * room.widthM;
                const detail = shaped
                  ? formatArea(area, project.units)
                  : `${formatArea(area, project.units)} · ${formatNumber(mToLength(room.lengthM, project.units), 2)} × ${formatNumber(mToLength(room.widthM, project.units), 2)} ${lengthUnit(project.units)}`;
                const center = spaceLabelAnchor(room, planEquipment, font, room.name, detail);
                return (
                  <g key={`${room.id}-label`} transform={`translate(${center.x} ${center.y}) scale(1,-1)`} pointerEvents="none">
                    <text data-label={highlightedRoom?.id === room.id ? LABEL_ACTIVE : LABEL_PRIORITY.room} textAnchor="middle" fontSize={font * spaceText} fontWeight={500} fill={ink(INK)}>
                      {room.name}
                    </text>
                    {(layers.labels || highlightedRoom?.id === room.id) && (
                      <text data-label={highlightedRoom?.id === room.id ? LABEL_ACTIVE : LABEL_PRIORITY.roomDetail} textAnchor="middle" y={font * 1.4 * spaceText} fontSize={font * 0.68 * spaceText} fill={ink('#5e6368')}>
                        {detail}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
          {layers.equipment && <g opacity={fade.equipment}>{planEquipment.map(item => {
            const shown = rotatingEquipment?.id === item.id ? { ...item, yawDeg: rotatingEquipment.yawDeg } : item;
            const systemIndex = shown.systemId ? project.systems.findIndex(system => system.id === shown.systemId) : -1;
            const system = systemIndex >= 0 ? project.systems[systemIndex] : undefined;
            return (
              <EquipmentMark
                key={item.id}
                item={shown}
                active={(selection.kind === 'equipment' && selection.id === item.id) || ((selection.kind === 'section' || selection.kind === 'unit-duct') && selection.equipmentId === item.id)}
                internals={showSystems && (layers.internals || expandedUnits.has(item.id) || ((selection.kind === 'section' || selection.kind === 'unit-duct') && selection.equipmentId === item.id))}
                autoOpen={showSystems}
                pxPerM={pxPerM}
                units={project.units}
                selectedSectionId={selection.kind === 'section' && selection.equipmentId === item.id ? selection.id : null}
                selectedDuctId={selection.kind === 'unit-duct' && selection.equipmentId === item.id ? selection.id : null}
                selectedPointId={selection.kind === 'point' ? selection.id : null}
                ductedPortIds={(project.ducts ?? []).flatMap(run => [run.start, run.end]).filter(end => end.equipmentId === item.id && end.portId).map(end => end.portId!)}
                points={project.controlPoints ?? NO_POINTS}
                loops={project.plantLoops ?? NO_LOOPS}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                tool={tool}
                fontM={font}
                labelScale={equipmentText}
                systemName={showSystems && (layers.labels || (shownSystemId != null && system?.id === shownSystemId)) ? system?.name : undefined}
                color={ink(showSystems ? terminalAirColor(item.catalogId) : undefined)}
                streamColor={unitStreamColor}
              />
            );
          })}</g>}
          {layers.loads && (
            <g opacity={fade.loads}>
              <LoadMarks loads={planLoads} selection={selection} fontM={font} labels={layers.labels} onContextMenu={onContextMenu} />
            </g>
          )}
          {layers.controls && showSystems && <g opacity={fade.equipment}><SensorMarks project={project} rooms={rooms} selection={selection} tool={tool} fontM={font} onSelect={onSelect} /></g>}
          {draft && (
            <rect x={draft.xM} y={draft.yM} width={draft.lengthM} height={draft.widthM} fill={PLAN_COLOR.draft} stroke={ink(DIM)} strokeWidth={HAIR} vectorEffect="non-scaling-stroke" />
          )}
          {(chain || (aim && tool.kind === 'wall')) && <ChainPreview points={chain ?? []} aim={aim} units={project.units} fontM={font} />}
          {tool.kind === 'duct' && (ductChain || ductAim) && (
            <DuctDraft points={ductChain ?? []} aim={ductAim} units={project.units} fontM={font} view={view} sizeLabel={ductSizeLabel(tool, project.units)} widthM={showDuctSize ? tool.widthM : 0} color={ink(SERVICE_COLOR[tool.service] ?? DIM)} />
          )}
          {spot && (tool.kind === 'door' || tool.kind === 'window') && <OpeningGhost spot={spot} kind={tool.kind} />}
          {highlightedRoom && ((highlightedRoom.outline?.length ?? 0) >= 3 ? (
            <polygon
              points={highlightedRoom.outline!.map(point => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={ink(SELECT)}
              strokeWidth={2.25}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : (
            <rect
              x={highlightedRoom.xM}
              y={highlightedRoom.yM}
              width={highlightedRoom.lengthM}
              height={highlightedRoom.widthM}
              fill="none"
              stroke={ink(SELECT)}
              strokeWidth={2.25}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
          {showSpaces && selection.kind === 'surface' && selection.face === 'walls' && selection.edge != null && (() => {
            const room = rooms.find(item => item.id === selection.roomId);
            const loop = room?.outline;
            if (!room || !loop || selection.edge < 0 || selection.edge >= loop.length) return null;
            const start = loop[selection.edge];
            const end = loop[(selection.edge + 1) % loop.length];
            return (
              <polygon
                points={wallQuad(start.x, start.y, end.x, end.y)}
                fill={ink(SELECT_FILL)}
                stroke={ink(SELECT)}
                strokeWidth={2.25}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}
          {showSpaces && selection.kind === 'interface' && (() => {
            const target = interfaceTargets(rooms).find(item => item.key === selection.key);
            if (!target) return null;
            return (
              <polygon
                points={wallQuad(target.x0, target.y0, target.x1, target.y1)}
                fill={ink(SELECT_FILL)}
                stroke={ink(SELECT)}
                strokeWidth={2.25}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}
          {showSpaces && !locked && dimRoom && selectedWall && (measuredRoom?.outline?.length ?? 0) < 3 && (
            <rect
              {...wallBand(dimRoom, selectedWall, graphicWall(dimRoom.surfaces.walls[selectedWall].constructionId).thickness)}
              fill={ink(SELECT_FILL)}
              stroke={ink(SELECT)}
              strokeWidth={2.25}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {showSpaces && selection.kind === 'opening' && (() => {
            const room = rooms.find(item => item.id === selection.roomId);
            const opening = room?.openings.find(item => item.id === selection.id);
            if (!room || !opening) return null;
            const graphic = graphicWall(room.surfaces.walls[opening.face].constructionId);
            return (
              <rect
                {...openingGap(room, opening, graphic.thickness)}
                fill={ink(SELECT_FILL)}
                stroke={ink(SELECT)}
                strokeWidth={2.25}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}
          {showSpaces && !locked && measuredRoom && gesture?.kind !== 'space' && (measuredRoom.outline?.length ?? 0) < 3 && <RoomDimensions room={measuredRoom} rooms={rooms} units={project.units} fontM={font} wallFace={measuredFace} />}
          {showSpaces && !locked && measuredRoom && measuredOpening && <OpeningSlideDimension room={measuredRoom} opening={measuredOpening} units={project.units} fontM={font} />}
          {layers.clearances && !locked && clearanceFoot && clearanceRoom && (
            <ClearanceDimensions foot={clearanceFoot} room={clearanceRoom} units={project.units} fontM={font} />
          )}
          {readout && <DragReadout x={readout.x} y={readout.y} text={readout.text} fontM={font} view={view} />}
        </g>
      </svg>
      <div className="plan-mark">
        <NorthMark degrees={northDegrees(project.northDeg)} onCommit={onNorthChange} />
        <div className="plan-scale">
          <span>0</span>
          <i style={{ width: Math.min(scale.meters * pxPerM, 140) }} />
          <span>{scale.label}</span>
        </div>
      </div>
      {showSystems && layers.ducts && <AirKey entries={legendEntries} mixed={openUnitInView} />}
      </div>
    </div>
  );
}

/** How to read air on the plan: line style says the stream, arrowheads say which way it moves. */
export interface AirKeyEntry {
  label: string;
  color: string;
  service: DuctService;
  /** Drawn double-line at this zoom. */
  double: boolean;
}

export const AIR_KEY_LABEL: Record<DuctService, string> = { supply: 'Supply', return: 'Return', exhaust: 'Exhaust / relief', outdoor: 'Outdoor air', relief: 'Exhaust / relief', mixed: 'Mixed air' };
export const AIR_KEY_ORDER: DuctService[] = ['supply', 'return', 'outdoor', 'exhaust', 'mixed'];

const AIR_KEY_COLLAPSED = 'hvac-air-key-collapsed';

/**
 * Key for the ducts in view: each stream in its plan colour, single- or double-line as drawn right now.
 * A compact strip in the canvas corner; it folds down to colour dots.
 */
export function AirKey({ entries, mixed }: { entries: readonly AirKeyEntry[]; mixed: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(AIR_KEY_COLLAPSED) === '1');
  }, []);
  if (entries.length === 0 && !mixed) return null;
  const double = entries.some(entry => entry.double) || mixed;
  const rows = [...entries, ...(mixed ? [{ label: 'Mixed (in unit)', color: UNIT_STREAM_FALLBACK.mixed, service: 'mixed' as DuctService, double: true }] : [])];
  const toggle = () =>
    setCollapsed(value => {
      window.localStorage.setItem(AIR_KEY_COLLAPSED, value ? '0' : '1');
      return !value;
    });
  const swatch = (color: string, dash: string | undefined, asDouble: boolean) =>
    asDouble ? (
      <svg className="air-key-swatch" viewBox="0 0 20 8" aria-hidden="true">
        <line x1="0" y1="4" x2="20" y2="4" stroke={ink(color)} strokeWidth="7" />
        <line x1="0" y1="4" x2="20" y2="4" stroke={fade(color, 0.88)} strokeWidth="4.6" />
      </svg>
    ) : (
      <svg className="air-key-swatch" viewBox="0 0 20 8" aria-hidden="true">
        <line x1="0" y1="4" x2="20" y2="4" stroke={ink(color)} strokeWidth="1.8" strokeDasharray={dash ? '4 2.5' : undefined} />
      </svg>
    );
  if (collapsed) {
    return (
      <button type="button" className="air-key is-collapsed" onClick={toggle} title="Show the air key" aria-label="Show the air key">
        {rows.map(row => (
          <i key={`${row.label}|${row.color}`} style={{ background: ink(row.color) }} />
        ))}
        <span>Key</span>
      </button>
    );
  }
  return (
    <div className="air-key" aria-label="Air key">
      {rows.map(row => (
        <span key={`${row.label}|${row.color}`}>
          {swatch(row.color, SERVICE_DASH[row.service], row.double)}
          {row.label}
        </span>
      ))}
      {[
        { label: 'Outside air in', color: OUTSIDE_IN_COLOR, points: '20,2.6 9,2.6 9,0.5 2,4 9,7.5 9,5.4 20,5.4' },
        { label: 'Outside air out', color: OUTSIDE_OUT_COLOR, points: '0,2.6 11,2.6 11,0.5 18,4 11,7.5 11,5.4 0,5.4' },
      ].map(tag => (
        <span key={tag.label}>
          <svg className="air-key-swatch" viewBox="0 0 20 8" aria-hidden="true">
            <polygon points={tag.points} fill={ink(tag.color)} />
          </svg>
          {tag.label}
        </span>
      ))}
      <span>
        <svg className="air-key-swatch" viewBox="0 0 20 8" aria-hidden="true">
          {double ? (
            <>
              <line x1="0" y1="4" x2="20" y2="4" stroke={ink('#5e6368')} strokeWidth="7" />
              <line x1="0" y1="4" x2="20" y2="4" stroke={PLAN_COLOR.halo} strokeWidth="4.6" />
              <polyline points="8.5,2 11.5,4 8.5,6" fill="none" stroke={PLAN_COLOR.ink} strokeWidth="1.1" />
            </>
          ) : (
            <>
              <line x1="0" y1="4" x2="20" y2="4" stroke={PLAN_COLOR.ink} strokeWidth="1.6" />
              <polyline points="8,1 12,4 8,7" fill="none" stroke={PLAN_COLOR.ink} strokeWidth="1.6" />
            </>
          )}
        </svg>
        Flow
      </span>
      <button type="button" className="air-key-fold" onClick={toggle} title="Fold the air key" aria-label="Fold the air key">
        ×
      </button>
    </div>
  );
}

function wallUnderPointer(clientX: number, clientY: number): Selection | null {
  const el = document.elementFromPoint(clientX, clientY);
  const edge = el?.closest('[data-edge]');
  if (edge) {
    const roomId = edge.getAttribute('data-room');
    const index = Number(edge.getAttribute('data-edge'));
    if (roomId && Number.isInteger(index) && index >= 0) return { kind: 'surface', roomId, face: 'walls', edge: index };
  }
  const wall = el?.closest('[data-hit="wall"]');
  if (wall) {
    const roomId = wall.getAttribute('data-room');
    const face = wall.getAttribute('data-face');
    if (roomId && (face === 'px' || face === 'nx' || face === 'py' || face === 'ny')) return { kind: 'surface', roomId, face: 'walls', wallFace: face };
  }
  return null;
}

function RoomDimensions({
  room,
  rooms,
  units,
  fontM,
  wallFace,
}: {
  room: Room;
  rooms: readonly Room[];
  units: Project['units'];
  fontM: number;
  wallFace?: WallFace;
}) {
  const gap = Math.max(1.15, fontM * 4);
  const outside = 0.18;
  const open = (face: WallFace) => touchingRooms(room, face, rooms).length === 0;
  const lengthBelow = wallFace === 'py' ? false : wallFace === 'ny' ? true : open('ny') || !open('py');
  const widthRight = wallFace === 'px' ? open('px') : wallFace === 'nx' ? !open('nx') : open('px') || !open('nx');
  const lengthEdge = lengthBelow ? room.yM - outside : room.yM + room.widthM + outside;
  const lengthY = lengthBelow ? room.yM - gap : room.yM + room.widthM + gap;
  const widthEdge = widthRight ? room.xM + room.lengthM + outside : room.xM - outside;
  const widthX = widthRight ? room.xM + room.lengthM + gap : room.xM - gap;
  return (
    <g pointerEvents="none" stroke={ink(DIM)} strokeWidth={HAIR}>
      <line x1={room.xM} y1={lengthEdge} x2={room.xM} y2={lengthY} vectorEffect="non-scaling-stroke" />
      <line x1={room.xM + room.lengthM} y1={lengthEdge} x2={room.xM + room.lengthM} y2={lengthY} vectorEffect="non-scaling-stroke" />
      <Dimension x1={room.xM} y1={lengthY} x2={room.xM + room.lengthM} y2={lengthY} label={formatLength(room.lengthM, units, 2)} fontM={fontM} outwardX={0} outwardY={lengthBelow ? -1 : 1} />
      <line x1={widthEdge} y1={room.yM} x2={widthX} y2={room.yM} vectorEffect="non-scaling-stroke" />
      <line x1={widthEdge} y1={room.yM + room.widthM} x2={widthX} y2={room.yM + room.widthM} vectorEffect="non-scaling-stroke" />
      <Dimension x1={widthX} y1={room.yM} x2={widthX} y2={room.yM + room.widthM} label={formatLength(room.widthM, units, 2)} fontM={fontM} outwardX={widthRight ? 1 : -1} outwardY={0} />
    </g>
  );
}

function Dimension({
  x1,
  y1,
  x2,
  y2,
  label,
  fontM,
  outwardX,
  outwardY,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  fontM: number;
  outwardX: number;
  outwardY: number;
}) {
  const midX = (x1 + x2) / 2 + outwardX * fontM * 0.15;
  const midY = (y1 + y2) / 2 + outwardY * fontM * 0.15;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const span = Math.hypot(dx, dy) || 1;
  const nx = (-dy / span) * fontM * 0.22;
  const ny = (dx / span) * fontM * 0.22;
  const vertical = Math.abs(dy) > Math.abs(dx);
  return (
    <g stroke={ink(DIM)} strokeWidth={HAIR}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} vectorEffect="non-scaling-stroke" />
      <line x1={x2 - nx} y1={y2 - ny} x2={x2 + nx} y2={y2 + ny} vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${midX} ${midY}) scale(1,-1)${vertical ? ' rotate(-90)' : ''}`}>
        <text textAnchor="middle" dominantBaseline="middle" fontSize={fontM * 0.85} fill={ink(DIM)} stroke="none">
          {label}
        </text>
      </g>
    </g>
  );
}

type FootprintAabb = { minX: number; minY: number; maxX: number; maxY: number; midX: number; midY: number };

/** Axis-aligned bounds of a length×width footprint after yaw. Reusable for future movable components. */
function componentFootprintAabb(item: { xM: number; yM: number; yawDeg: number; catalogId: string }): FootprintAabb {
  const size = equipmentSizeM(getProduct(item.catalogId));
  const rad = (item.yawDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const hx = Math.max(size.lengthM, 0.05) / 2;
  const hy = Math.max(size.widthM, 0.05) / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ] as const) {
    const x = item.xM + lx * c - ly * s;
    const y = item.yM + lx * s + ly * c;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
}

function roomAabb(room: Room): FootprintAabb {
  if ((room.outline?.length ?? 0) >= 3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of room.outline!) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return { minX, minY, maxX, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
  }
  return {
    minX: room.xM,
    minY: room.yM,
    maxX: room.xM + room.lengthM,
    maxY: room.yM + room.widthM,
    midX: room.xM + room.lengthM / 2,
    midY: room.yM + room.widthM / 2,
  };
}

function aabbOverlap(a: FootprintAabb, b: FootprintAabb, pad = 0): boolean {
  return a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minY < b.maxY + pad && a.maxY > b.minY - pad;
}

/** Prefer the room centroid; slide the label if it would sit on equipment. */
function spaceLabelAnchor(
  room: Room,
  equipment: readonly { xM: number; yM: number; yawDeg: number; catalogId: string; roomId: string | null }[],
  fontM: number,
  name: string,
  detail: string,
): { x: number; y: number } {
  const shaped = (room.outline?.length ?? 0) >= 3;
  const preferred = shaped ? outlineCentroid(room.outline ?? []) : { x: room.xM + room.lengthM / 2, y: room.yM + room.widthM / 2 };
  const obstacles = equipment
    .filter(item => item.roomId === room.id)
    .map(item => {
      const foot = componentFootprintAabb(item);
      const chip = fontM * 1.1;
      return {
        ...foot,
        minX: foot.minX - fontM * 0.15,
        minY: foot.minY - fontM * 0.15,
        maxX: foot.maxX + fontM * 0.15,
        maxY: foot.maxY + chip,
      };
    });
  if (obstacles.length === 0) return preferred;

  const labelW = Math.max(2.2, Math.max(name.length, detail.length) * fontM * 0.52);
  const labelH = fontM * 2.55;
  const bounds = roomAabb(room);
  const inset = Math.min(fontM * 0.35, Math.max(0.05, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08));
  const halfW = labelW / 2;
  const halfH = labelH / 2;

  const candidates: { x: number; y: number }[] = [preferred];
  for (const ty of [0.22, 0.5, 0.78]) {
    for (const tx of [0.22, 0.5, 0.78]) {
      candidates.push({
        x: bounds.minX + (bounds.maxX - bounds.minX) * tx,
        y: bounds.minY + (bounds.maxY - bounds.minY) * ty,
      });
    }
  }
  candidates.push(
    { x: preferred.x, y: bounds.minY + halfH + inset },
    { x: preferred.x, y: bounds.maxY - halfH - inset },
    { x: bounds.minX + halfW + inset, y: preferred.y },
    { x: bounds.maxX - halfW - inset, y: preferred.y },
  );

  let best = preferred;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (shaped && !pointInOutline(room.outline ?? [], candidate.x, candidate.y)) continue;
    const box: FootprintAabb = {
      minX: candidate.x - halfW,
      minY: candidate.y - halfH,
      maxX: candidate.x + halfW,
      maxY: candidate.y + halfH,
      midX: candidate.x,
      midY: candidate.y,
    };
    if (
      box.minX < bounds.minX + inset ||
      box.maxX > bounds.maxX - inset ||
      box.minY < bounds.minY + inset ||
      box.maxY > bounds.maxY - inset
    ) {
      continue;
    }
    let overlap = 0;
    for (const obstacle of obstacles) {
      if (!aabbOverlap(box, obstacle)) continue;
      const ox = Math.min(box.maxX, obstacle.maxX) - Math.max(box.minX, obstacle.minX);
      const oy = Math.min(box.maxY, obstacle.maxY) - Math.max(box.minY, obstacle.minY);
      overlap += Math.max(0, ox) * Math.max(0, oy);
    }
    const dx = candidate.x - preferred.x;
    const dy = candidate.y - preferred.y;
    const score = overlap * 40 + dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function ClearanceDimensions({
  foot,
  room,
  units,
  fontM,
}: {
  foot: FootprintAabb;
  room: Room;
  units: Project['units'];
  fontM: number;
}) {
  const left = foot.minX - room.xM;
  const right = room.xM + room.lengthM - foot.maxX;
  const bottom = foot.minY - room.yM;
  const top = room.yM + room.widthM - foot.maxY;
  const label = (meters: number) => formatNumber(mToLength(meters, units), meters < 1 ? 2 : 1);
  return (
    <g pointerEvents="none">
      {left > 1e-6 && (
        <Dimension x1={room.xM} y1={foot.midY} x2={foot.minX} y2={foot.midY} label={label(left)} fontM={fontM} outwardX={0} outwardY={1} />
      )}
      {right > 1e-6 && (
        <Dimension x1={foot.maxX} y1={foot.midY} x2={room.xM + room.lengthM} y2={foot.midY} label={label(right)} fontM={fontM} outwardX={0} outwardY={1} />
      )}
      {bottom > 1e-6 && (
        <Dimension x1={foot.midX} y1={room.yM} x2={foot.midX} y2={foot.minY} label={label(bottom)} fontM={fontM} outwardX={1} outwardY={0} />
      )}
      {top > 1e-6 && (
        <Dimension x1={foot.midX} y1={foot.maxY} x2={foot.midX} y2={room.yM + room.widthM} label={label(top)} fontM={fontM} outwardX={1} outwardY={0} />
      )}
    </g>
  );
}

/**
 * Plan symbol inside an item's outline (ASHRAE 134 / plan conventions). Units, hoods, and plant are drawn as their
 * true-size outline with a tag, which is how plans show them; they open into a diagram when zoomed in.
 */
function planSymbolFor(product: ReturnType<typeof getProduct>): PlanSymbolKind {
  if (!product) return 'none';
  if (product.category === 'air-terminal') {
    if (isTransferGrille(product.id)) return 'none';
    if (product.id.startsWith('diff')) return 'supply-outlet';
    if (product.id.startsWith('grille-ret')) return 'return-inlet';
    if (product.id.startsWith('grille')) return 'exhaust-inlet';
    if (product.id.startsWith('louver')) return 'louver';
    return 'roof-hood';
  }
  if (product.category === 'exhaust-fan' || product.category === 'bathroom-exhaust') return /inline|mixed-flow|propeller/i.test(product.name) ? 'axial-fan' : 'centrifugal-fan';
  return 'none';
}

function equipmentLabel(catalogId: string): { name: string; roof: boolean } {
  const product = getProduct(catalogId);
  const roof = product?.mount === 'roof';
  if (product?.category === 'kitchen-hood') return { name: 'Hood', roof };
  if (product?.category === 'air-handling') return { name: 'AHU', roof };
  if (product?.category === 'plant') return { name: /boiler/i.test(product.name) ? 'B' : /chiller/i.test(product.name) ? 'CH' : 'RACK', roof };
  if (product?.category === 'air-terminal') {
    if (isTransferGrille(product.id)) return { name: 'TG', roof };
    if (product.id.startsWith('diff')) return { name: 'SD', roof };
    if (product.id.startsWith('grille-ret')) return { name: 'RG', roof };
    if (product.id.startsWith('grille')) return { name: 'EG', roof };
    if (product.id.startsWith('louver')) return { name: product.id.endsWith('oa') ? 'OA LVR' : 'EA LVR', roof };
    return { name: product.id.includes('intake') ? 'Intake' : 'Relief', roof };
  }
  if (product?.category === 'makeup-air') return { name: 'MAU', roof };
  if (product?.category === 'energy-recovery' || /ERV|recovery/i.test(product?.name ?? '')) return { name: 'ERV', roof };
  if (product?.category === 'heating-cooling' || product?.category === 'system-equipment') {
    if (/condens/i.test(product?.name ?? '')) return { name: 'CU', roof };
    if (/mini-split|ductless/i.test(product?.name ?? '')) return { name: 'Split', roof };
    if (/rooftop|WeatherMaker|RTU/i.test(product?.name ?? '') || product?.mount === 'roof') return { name: 'RTU', roof };
    return { name: 'Unit', roof };
  }
  if (product?.category === 'exhaust-fan' || product?.category === 'bathroom-exhaust') return { name: 'Fan', roof };
  if (product?.category === 'air-path') {
    if (/mix/i.test(product.name)) return { name: 'Mix', roof: false };
    if (/filter/i.test(product.name)) return { name: 'Filter', roof: false };
    if (/cool/i.test(product.name)) return { name: 'CC', roof: false };
    if (/heat/i.test(product.name)) return { name: 'HC', roof: false };
    if (/sensor/i.test(product.name)) return { name: 'Sensor', roof: false };
    if (/relief/i.test(product.name)) return { name: 'Relief', roof: false };
    if (/return-air/i.test(product.name)) return { name: 'RA', roof: false };
    if (/outdoor-air/i.test(product.name)) return { name: 'OA', roof: false };
    if (/fan/i.test(product.name)) return { name: 'SF', roof: false };
    return { name: 'AHU', roof: false };
  }
  return { name: 'Unit', roof };
}

function DuctLayer({
  project,
  selection,
  tool,
  fontM,
  pxPerM,
  showSize,
  allLabels,
  systemId,
  onSelect,
  onContextMenu,
}: {
  project: Project;
  selection: Selection;
  tool: EditorTool;
  fontM: number;
  pxPerM: number;
  showSize: boolean;
  allLabels: boolean;
  /** Runs of this system show their flow and size. */
  systemId: string | null;
  onSelect: (selection: Selection) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}) {
  const ports = tool.kind === 'duct'
    ? equipmentPortHits(project.equipment).filter(hit => portFits(project, hit, tool.systemId, tool.service))
    : [];
  const flows = ductFlows(project).runs;
  const planRuns = (project.ducts ?? []).filter(run => ductViewOf(run) === 'plan');
  const colorOf = (run: DuctRun) => {
    return SERVICE_COLOR[run.service];
  };
  // Zoomed in far enough, ducts are drawn double-line at their true width, as on a duct plan.
  const doubled = (run: DuctRun) => run.widthM * pxPerM >= 6;
  const wallM = 1.3 / Math.max(pxPerM, 1);
  const doubleRuns = planRuns.filter(doubled).map(run => ({ run, points: extendAtJunctions(run).map(point => `${point.x},${point.y}`).join(' ') }));
  // Air leaving the building sits lowest, supply on top: a fixed order, so a crossing always reads the same way.
  const LAYER_ORDER: DuctService[] = ['exhaust', 'relief', 'outdoor', 'return', 'mixed', 'supply'];
  const doubleLayers = [...new Set(doubleRuns.map(({ run }) => `${LAYER_ORDER.indexOf(run.service)}|${run.service}|${run.systemId ?? ''}`))]
    .sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]))
    .map(key => ({ key, runs: doubleRuns.filter(({ run }) => `${LAYER_ORDER.indexOf(run.service)}|${run.service}|${run.systemId ?? ''}` === key) }));
  return (
    <g>
      {/* Duct walls: a wide stroke in the stream colour, then the inside over it, so joined runs share one outline.
          Each network (system and air type) is drawn as its own layer: where two networks cross, one passes over
          the other with its walls intact instead of the two merging into what looks like a junction. */}
      {doubleLayers.map(({ key, runs }) => (
        <g key={key} pointerEvents="none">
          {runs.map(({ run, points }) => (
            <polyline key={`w-${run.id}`} points={points} fill="none" stroke={ink(selection.kind === 'duct' && selection.id === run.id ? SELECT : colorOf(run))} strokeWidth={run.widthM + wallM * 2} strokeLinejoin="miter" strokeMiterlimit={3} />
          ))}
          {runs.map(({ run, points }) => (
            <polyline key={`i-${run.id}`} points={points} fill="none" stroke={fade(selection.kind === 'duct' && selection.id === run.id ? SELECT : colorOf(run), 0.9)} strokeWidth={run.widthM} strokeLinejoin="miter" strokeMiterlimit={3} />
          ))}
        </g>
      ))}
      {planRuns.map(run => {
        const color = colorOf(run);
        const double = doubled(run);
        const active = selection.kind === 'duct' && selection.id === run.id;
        const drawn = run.points.map(point => `${point.x},${point.y}`).join(' ');
        const crossings = ductCrossings(run.points, project.rooms, project.wallRuns ?? []);
        const label = labelSegment(run.points);
        const rise = [endRise(project, run, 'start'), endRise(project, run, 'end')];
        const design = streamDesignLabel(run.streamDesign, project.units);
        const carried = flows.get(run.id);
        const flowText = carried?.flowM3s != null && carried.flowM3s > 0 ? `${formatFlow(carried.flowM3s, project.units)}${carried.partial ? '+' : ''} · ` : '';
        const labelText = design ?? `${flowText}${ductSizeLabel(run, project.units)}`;
        const labelSize = fontM * 0.62;
        const labelHalf = labelText.length * labelSize * 0.29;
        // Too long for its segment: only the selected run keeps its label, so short stubs stay clean.
        const labelShown = !!label && (allLabels || active || (systemId != null && run.systemId === systemId)) && (active || labelHalf * 2 <= label.length - fontM * 0.6);
        const labelInside = double && run.widthM >= labelSize * 1.7;
        // Flow arrows step aside where the label sits inside the duct.
        const underLabel = (x: number, y: number) => !!label && labelShown && labelInside && Math.hypot(x - label.x, y - label.y) <= labelHalf + fontM * 0.8;
        return (
          <g key={run.id}>
            <polyline
              data-hit="duct"
              data-id={run.id}
              points={drawn}
              fill="none"
              stroke="transparent"
              strokeWidth={0.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              onClick={event => {
                event.stopPropagation();
                if (tool.kind !== 'select') return;
                onSelect({ kind: 'duct', id: run.id });
              }}
              onContextMenu={event => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu({ kind: 'duct', id: run.id }, event.clientX, event.clientY);
              }}
            />
            {showSize && !double && run.points.slice(1).map((point, index) => (
              <polygon key={`${run.id}-w-${index}`} points={wallQuad(run.points[index].x, run.points[index].y, point.x, point.y, run.widthM)} fill={ink(color)} fillOpacity={0.16} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ))}
            {!double && <polyline points={drawn} fill="none" stroke={ink(active ? SELECT : color)} strokeWidth={active ? 2.6 : 1.7} strokeDasharray={SERVICE_DASH[run.service]} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
            {carried?.toward && flowChevrons(carried.toward === 'end' ? run.points : [...run.points].reverse(), fontM, underLabel).map((chevron, index) => (
              <polyline key={`${run.id}-a-${index}`} points={chevron} fill="none" stroke={ink(active ? SELECT : color)} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ))}
            {crossings.map((hit, index) => {
              const normal = segmentNormal(run.points, hit.x, hit.y);
              if (!normal) return null;
              const tick = 0.16;
              return (
                <line
                  key={`${run.id}-x-${index}`}
                  x1={hit.x - normal.nx * tick}
                  y1={hit.y - normal.ny * tick}
                  x2={hit.x + normal.nx * tick}
                  y2={hit.y + normal.ny * tick}
                  stroke={ink(color)}
                  strokeWidth={1.6}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              );
            })}
            {label && labelShown && (() => {
              const text = labelText;
              const size = labelSize;
              const inside = labelInside;
              const offset = inside ? 0 : Math.max(fontM * 1.15, (double ? run.widthM / 2 + wallM : 0) + fontM * 0.55);
              return (
                <g transform={`translate(${label.x + label.nx * offset} ${label.y + label.ny * offset}) scale(1,-1) rotate(${label.deg})`} pointerEvents="none">
                  <text data-label={active ? LABEL_ACTIVE : LABEL_PRIORITY.duct} textAnchor="middle" dominantBaseline={inside ? 'central' : undefined} fontSize={size} fill={ink(active ? SELECT : color)} fontWeight={600}>
                    {text}
                  </text>
                </g>
              );
            })()}
            {rise.map((meters, end) => {
              if (Math.abs(meters) <= 0.05) return null;
              const point = end === 0 ? run.points[0] : run.points[run.points.length - 1];
              if (!point) return null;
              return <circle key={end} cx={point.x} cy={point.y} r={fontM * 0.4} fill={PLAN_COLOR.halo} stroke={ink(color)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" pointerEvents="none"><title>{`Riser ${formatLength(Math.abs(meters), project.units, 2)}`}</title></circle>;
            })}
          </g>
        );
      })}
      {(project.ductNodes ?? []).map(node => {
        const color = SERVICE_COLOR[node.service];
        const branches = (project.ducts ?? []).filter(run => run.start.nodeId === node.id || run.end.nodeId === node.id).length;
        const target = tool.kind === 'duct' && tool.systemId === node.systemId && tool.service === node.service;
        return (
          <circle key={node.id} data-hit="duct-node" data-id={node.id} cx={node.x} cy={node.y} r={fontM * (target ? 0.42 : 0.26)} fill={ink(color)} stroke={PLAN_COLOR.halo} strokeWidth={1.2} vectorEffect="non-scaling-stroke" pointerEvents="none">
            <title>{`Junction · ${branches} runs`}</title>
          </circle>
        );
      })}
      {ports.map(port => (
        <circle key={`${port.equipmentId}-${port.portId}`} cx={port.x} cy={port.y} r={fontM * 0.34} fill={PLAN_COLOR.halo} stroke={ink(DIM)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      ))}
    </g>
  );
}

/** A run's points with each end that meets a junction pushed out by half its width, so joins close without caps. */
function extendAtJunctions(run: DuctRun): { x: number; y: number }[] {
  const points = run.points.map(point => ({ ...point }));
  if (points.length < 2) return points;
  const push = (end: { x: number; y: number }, toward: { x: number; y: number }) => {
    const length = Math.hypot(end.x - toward.x, end.y - toward.y) || 1;
    end.x += ((end.x - toward.x) / length) * (run.widthM / 2);
    end.y += ((end.y - toward.y) / length) * (run.widthM / 2);
  };
  if (run.start.nodeId) push(points[0], points[1]);
  if (run.end.nodeId) push(points[points.length - 1], points[points.length - 2]);
  return points;
}

/** Line style per stream, so supply, return, outdoor, and exhaust read apart even in one colour. */
const SERVICE_DASH: Record<DuctService, string | undefined> = {
  supply: undefined,
  mixed: undefined,
  return: '7 4',
  outdoor: '14 4',
  exhaust: '10 3 2 3',
  relief: '10 3 2 3',
};

/** Open arrowheads along a polyline given in flow order: one per stretch of plan, always one on a short run. */
/**
 * Flow arrows spaced along a polyline, pointing toward its last point. Each arrow keeps to its own slot of the run;
 * where `avoid` says a spot is taken (a label sits there), it slides along the run to the nearest clear spot.
 */
function flowChevrons(points: readonly { x: number; y: number }[], fontM: number, avoid?: (x: number, y: number) => boolean): string[] {
  const size = fontM * 0.34;
  const spacing = fontM * 7;
  const segments: { a: { x: number; y: number }; ux: number; uy: number; length: number; from: number }[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= 1e-6) continue;
    segments.push({ a, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length, length, from: total });
    total += length;
  }
  if (total < size * 3) return [];
  const count = Math.max(1, Math.floor(total / spacing));
  const slot = total / count;
  const step = fontM * 0.4;
  const tipAt = (at: number) => {
    const segment = segments.find(entry => at <= entry.from + entry.length) ?? segments[segments.length - 1];
    const t = at - segment.from;
    return { segment, x: segment.a.x + segment.ux * (t + size / 2), y: segment.a.y + segment.uy * (t + size / 2) };
  };
  const out: string[] = [];
  for (let k = 0; k < count; k += 1) {
    const ideal = slot * (k + 0.5);
    const reach = Math.max(0, slot / 2 - size);
    let found: ReturnType<typeof tipAt> | null = null;
    for (let d = 0; d <= reach && !found; d += step) {
      for (const at of d === 0 ? [ideal] : [ideal + d, ideal - d]) {
        if (at < size || at > total - size * 1.5) continue;
        const tip = tipAt(at);
        if (!avoid || !avoid(tip.x, tip.y)) {
          found = tip;
          break;
        }
      }
    }
    if (!found) continue;
    const { segment, x: tipX, y: tipY } = found;
    const backX = tipX - segment.ux * size;
    const backY = tipY - segment.uy * size;
    out.push(`${backX - segment.uy * size * 0.7},${backY + segment.ux * size * 0.7} ${tipX},${tipY} ${backX + segment.uy * size * 0.7},${backY - segment.ux * size * 0.7}`);
  }
  return out;
}

function labelSegment(points: readonly { x: number; y: number }[]): { x: number; y: number; nx: number; ny: number; deg: number; length: number } | null {
  let best = 0;
  let found: { x: number; y: number; nx: number; ny: number; deg: number; length: number } | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= best) continue;
    best = length;
    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    if (deg > 90 || deg < -90) deg += 180;
    found = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, nx: -dy / length, ny: dx / length, deg, length };
  }
  return found;
}

function segmentNormal(points: readonly { x: number; y: number }[], x: number, y: number): { nx: number; ny: number } | null {
  let best = 0.35;
  let found: { nx: number; ny: number } | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
    const distance = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (distance > best) continue;
    const length = Math.sqrt(length2);
    best = distance;
    found = { nx: -dy / length, ny: dx / length };
  }
  return found;
}

function DuctDraft({
  points,
  aim,
  units,
  fontM,
  view,
  sizeLabel,
  widthM,
  color,
}: {
  points: DuctDraftPoint[];
  aim: DuctDraftPoint | null;
  units: Project['units'];
  fontM: number;
  view: ViewBox;
  sizeLabel: string;
  widthM: number;
  color: string;
}) {
  const last = points.length > 0 ? points[points.length - 1] : null;
  const rubber = last && aim && Math.hypot(aim.x - last.x, aim.y - last.y) > 0.05 ? aim : null;
  const mid = last && rubber ? { x: (last.x + rubber.x) / 2, y: (last.y + rubber.y) / 2 } : null;
  const length = last && rubber ? Math.hypot(rubber.x - last.x, rubber.y - last.y) : 0;
  return (
    <g pointerEvents="none">
      {widthM > 0 && points.slice(1).map((point, index) => (
        <polygon key={`band-${index}`} points={wallQuad(points[index].x, points[index].y, point.x, point.y, widthM)} fill={ink(color)} fillOpacity={0.16} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {widthM > 0 && last && rubber && (
        <polygon points={wallQuad(last.x, last.y, rubber.x, rubber.y, widthM)} fill={ink(color)} fillOpacity={0.1} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {points.length > 1 && (
        <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={ink(color)} strokeWidth={1.7} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {last && rubber && (
        <line x1={last.x} y1={last.y} x2={rubber.x} y2={rubber.y} stroke={ink(color)} strokeWidth={1.7} strokeDasharray="0.18 0.12" vectorEffect="non-scaling-stroke" />
      )}
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={0.08} fill={ink(point.portId ? color : PLAN_COLOR.halo)} stroke={ink(color)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      ))}
      {aim && <circle cx={aim.x} cy={aim.y} r={0.1} fill={ink(aim.portId ? color : PLAN_COLOR.halo)} stroke={ink(color)} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />}
      {mid && (
        <DragReadout x={mid.x} y={mid.y} view={view} fontM={fontM * 0.92} text={`${formatLength(length, units, 1)} · ${wallAngleDeg(last!.x, last!.y, rubber!.x, rubber!.y)}° · ${sizeLabel}`} />
      )}
    </g>
  );
}

function EquipmentMark({
  item,
  active,
  internals,
  autoOpen,
  pxPerM,
  units,
  selectedSectionId,
  selectedDuctId,
  ductedPortIds,
  selectedPointId,
  points,
  loops,
  tool,
  fontM,
  labelScale: textScale = 1,
  systemName,
  color,
  streamColor,
  onSelect,
  onContextMenu,
}: {
  item: PlacedEquipment;
  active: boolean;
  internals: boolean;
  /** Open the diagram on its own when the unit is large enough on screen. */
  autoOpen: boolean;
  pxPerM: number;
  units: Project['units'];
  selectedSectionId: string | null;
  selectedDuctId: string | null;
  /** Casing connections with a plan duct attached; their airflow is labelled on the duct. */
  ductedPortIds: readonly string[];
  selectedPointId: string | null;
  points: readonly ControlPoint[];
  loops: readonly PlantLoop[];
  tool: EditorTool;
  fontM: number;
  labelScale?: number;
  systemName?: string;
  color?: string;
  streamColor: (stream: UnitStream) => string;
  onSelect: (selection: Selection) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}) {
  const product = getProduct(item.catalogId);
  const { name, roof } = equipmentLabel(item.catalogId);
  const size = equipmentSizeM(product);
  const length = Math.max(size.lengthM, 0.05);
  const width = Math.max(size.widthM, 0.05);
  const label = item.quantity > 1 ? `${name} ×${item.quantity}` : name;
  const stroke = size.stated ? color ?? MARK_COLOR.equipment : '#c4a574';
  const fill = active ? SELECT_FILL : size.stated ? 'rgba(31,78,95,0.12)' : 'rgba(196,165,116,0.18)';
  const chipH = systemName ? fontM * 1.7 : fontM * 0.95;
  const planSymbol = planSymbolFor(product);
  const layout = isUnit(product) ? unitLayout(item, length, width) : null;
  const open = !!layout && layout.components.length > 0 && (internals || (autoOpen && length * pxPerM >= UNIT_DETAIL_PX));
  const showSymbol = !open && planSymbol !== 'none' && Math.min(length, width) >= fontM * 0.5;
  const opening = layout ? null : outdoorOpening(item.catalogId);
  return (
    <g
      data-hit="equipment"
      data-id={item.id}
      role="button"
      aria-label={product ? `${product.name}${roof ? ', roof' : ''}` : 'Equipment'}
      transform={`rotate(${item.yawDeg} ${item.xM} ${item.yM})`}
      onClick={event => {
        event.stopPropagation();
        if (tool.kind !== 'select') return;
        onSelect({ kind: 'equipment', id: item.id });
      }}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY);
      }}
    >
      <title>
        {product?.name ?? 'Equipment'}
        {product?.dimensions ? ` · ${product.dimensions.stated}` : ' · size not stated (0.6 m marker)'}
      </title>
      <rect
        x={item.xM - length / 2}
        y={item.yM - width / 2}
        width={length}
        height={width}
        fill={ink(open ? PLAN_COLOR.card : ink(fill))}
        stroke={ink(active ? SELECT : stroke)}
        strokeWidth={active ? 2.25 : HAIR}
        strokeDasharray={roof || open ? '4 2.5' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {open && (
        <UnitInternals
          item={item}
          layout={layout!}
          length={length}
          width={width}
          streamColor={streamColor}
          pxPerM={pxPerM}
          units={units}
          selectedSectionId={selectedSectionId}
          selectedDuctId={selectedDuctId}
          ductedPortIds={ductedPortIds}
          selectedPointId={selectedPointId}
          points={points}
          loops={loops}
          tool={tool}
          onSelect={onSelect}
        />
      )}
      {/* Transfer grille: a slotted face in the door, and an arrow through it showing which side the air goes to. */}
      {isTransferGrille(item.catalogId) && (
        <g pointerEvents="none">
          <rect x={item.xM - length / 2} y={item.yM - fontM * 0.18} width={length} height={fontM * 0.36} fill={PLAN_COLOR.halo} stroke={ink(active ? SELECT : stroke)} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {[-0.3, 0, 0.3].map(u => (
            <line key={u} x1={item.xM + u * length} y1={item.yM - fontM * 0.18} x2={item.xM + u * length} y2={item.yM + fontM * 0.18} stroke={ink(active ? SELECT : stroke)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={item.xM} y1={item.yM - fontM * 0.95} x2={item.xM} y2={item.yM + fontM * 0.75} stroke={ink(active ? SELECT : stroke)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <polyline
            points={`${item.xM - fontM * 0.28},${item.yM + fontM * 0.55} ${item.xM},${item.yM + fontM * 0.95} ${item.xM + fontM * 0.28},${item.yM + fontM * 0.55}`}
            fill="none"
            stroke={ink(active ? SELECT : stroke)}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {/* A roof hood, louver or roof fan: the tag stands straight up from it, clear of neighbours on the same wall. */}
      {opening && (
        <g transform={`rotate(${90 - item.yawDeg} ${item.xM} ${item.yM})`}>
          <OutsideAirTag
            x={item.xM + Math.abs(Math.sin((item.yawDeg * Math.PI) / 180)) * length / 2 + Math.abs(Math.cos((item.yawDeg * Math.PI) / 180)) * width / 2 + chipH}
            y={item.yM}
            face={1}
            role={opening}
            size={fontM * 0.6}
            yawDeg={90}
            detail={null}
          />
        </g>
      )}
      {!open &&
        layout?.ports
          .filter(port => (port.role === 'oa' || port.role === 'ea') && !(port.ducted && ductedPortIds.includes(getProduct(item.catalogId)?.unit?.portAt[port.role]?.id ?? '')))
          .map(port => (
            <OutsideAirTag
              key={`out-${port.role}`}
              x={item.xM + (port.face > 0 ? Math.max(port.x, length / 2) : Math.min(port.x, -length / 2))}
              y={item.yM + Math.max(-width / 2, Math.min(width / 2, port.y))}
              face={port.face}
              role={port.role as 'oa' | 'ea'}
              size={fontM * 0.6}
              yawDeg={item.yawDeg}
              detail={null}
            />
          ))}
      {showSymbol && (
        <PlanSymbol kind={planSymbol} x0={item.xM - length / 2} x1={item.xM + length / 2} y0={item.yM - width / 2} y1={item.yM + width / 2} color={ink(active ? SELECT : stroke)} />
      )}
      <g transform={`translate(${item.xM} ${isTransferGrille(item.catalogId) ? item.yM - chipH / 2 - fontM * 1.15 : item.yM + width / 2 + chipH / 2 + fontM * 0.1}) rotate(${-item.yawDeg}) scale(1,-1)`} pointerEvents="none">
        <text data-label={active ? LABEL_ACTIVE : LABEL_PRIORITY.equipment} textAnchor="middle" dominantBaseline="middle" y={systemName ? -chipH * 0.18 : 0} fontSize={fontM * 0.62 * textScale} fill={ink(active ? SELECT : stroke)}>
          {label}
        </text>
        {systemName && (
          <text data-label={active ? LABEL_ACTIVE : LABEL_PRIORITY.systemName} textAnchor="middle" dominantBaseline="middle" y={chipH * 0.28} fontSize={fontM * 0.52 * textScale} fill={ink(active ? SELECT : stroke)}>
            {systemName}
          </text>
        )}
      </g>
      {active && tool.kind === 'select' && (
        <g data-hit="equipment-rotate" data-id={item.id} aria-label="Rotate equipment">
          <line
            x1={item.xM + length / 2}
            y1={item.yM}
            x2={item.xM + length / 2 + fontM * 0.9}
            y2={item.yM}
            stroke={ink(SELECT)}
            strokeWidth={HAIR}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <circle
            cx={item.xM + length / 2 + fontM * 0.9}
            cy={item.yM}
            r={fontM * 0.48}
            fill={ink(PAPER)}
            stroke={ink(SELECT)}
            strokeWidth={2.25}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={item.xM + length / 2 + fontM * 0.9}
            cy={item.yM}
            r={fontM * 0.18}
            fill={ink(SELECT)}
            stroke="none"
            pointerEvents="none"
          />
        </g>
      )}
    </g>
  );
}

function DragReadout({ x, y, text, fontM, view }: { x: number; y: number; text: string; fontM: number; view?: ViewBox }) {
  const height = fontM * 1.35;
  const width = Math.max(fontM * 3.4, fontM * 0.62 * text.length + fontM);
  let drawX = x;
  let drawY = y;
  if (view) {
    // Prefer above and slightly aside the pointer; flip when the pill would leave the sheet.
    const margin = fontM * 1.85;
    const side = fontM * 1.25;
    const placeBelow = y > view.minY + view.h - (height + margin * 2.6);
    const placeLeft = x > view.minX + view.w - (width * 0.55 + side * 2.2);
    drawY = y + (placeBelow ? -(height / 2 + margin) : height / 2 + margin);
    drawX = x + (placeLeft ? -side : side);
  }
  return (
    <g transform={`translate(${drawX} ${drawY}) scale(1,-1)`} pointerEvents="none">
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2} fill={ink(DIM)} />
      <text textAnchor="middle" dominantBaseline="middle" fontSize={fontM * 0.78} fill={PLAN_COLOR.halo} stroke="none" fontWeight={600}>
        {text}
      </text>
    </g>
  );
}

function OpeningSlideDimension({ room, opening, units, fontM }: { room: Room; opening: Opening; units: Project['units']; fontM: number }) {
  const gap = 0.55;
  const label = formatLength(opening.offsetM, units, 2);
  if (opening.face === 'px' || opening.face === 'nx') {
    const x = edgeValue(room, opening.face) + (opening.face === 'px' ? gap : -gap);
    return <Dimension x1={x} y1={room.yM} x2={x} y2={room.yM + opening.offsetM} label={label} fontM={fontM} outwardX={opening.face === 'px' ? 1 : -1} outwardY={0} />;
  }
  const y = edgeValue(room, opening.face) + (opening.face === 'py' ? gap : -gap);
  return <Dimension x1={room.xM} y1={y} x2={room.xM + opening.offsetM} y2={y} label={label} fontM={fontM} outwardX={0} outwardY={opening.face === 'py' ? 1 : -1} />;
}

function SheetGrid({ view, pxPerM }: { view: ViewBox; pxPerM: number }) {
  const step = gridStep(pxPerM);
  const major = step * 5;
  const x0 = Math.floor(view.minX / step) * step;
  const y0 = Math.floor(view.minY / step) * step;
  const x1 = view.minX + view.w;
  const y1 = view.minY + view.h;
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (let x = x0; x <= x1 + step * 0.01; x += step) vertical.push(Number(x.toFixed(4)));
  for (let y = y0; y <= y1 + step * 0.01; y += step) horizontal.push(Number(y.toFixed(4)));
  const isMajor = (value: number) => Math.abs(value / major - Math.round(value / major)) < 1e-4;
  return (
    <g pointerEvents="none">
      {vertical.map(x => (
        <line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke={ink(isMajor(x) ? PLAN_COLOR.gridMajor : PLAN_COLOR.grid)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {horizontal.map(y => (
        <line key={`y${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke={ink(isMajor(y) ? PLAN_COLOR.gridMajor : PLAN_COLOR.grid)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

function spanLine(x1: number, y1: number, x2: number, y2: number, start: number, end: number) {
  const geom = runGeom({ x0: x1, y0: y1, x1: x2, y1: y2 });
  return {
    x1: geom.x0 + geom.dx * start,
    y1: geom.y0 + geom.dy * start,
    x2: geom.x0 + geom.dx * end,
    y2: geom.y0 + geom.dy * end,
  };
}

function WallSpan({
  x1,
  y1,
  x2,
  y2,
  portion,
  constructionId,
  thickness,
  glass,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  portion: WallPortion;
  constructionId: string | null | undefined;
  thickness: number;
  glass: boolean;
}) {
  if (portion.kind === 'interface' || portion.endM - portion.startM < 0.02) return null;
  const line = spanLine(x1, y1, x2, y2, portion.startM, portion.endM);
  if (!constructionId) {
    return <line {...line} stroke={ink(wallColor(null))} strokeWidth={HAIR} strokeDasharray="0.16 0.1" vectorEffect="non-scaling-stroke" />;
  }
  return <polygon points={wallQuad(line.x1, line.y1, line.x2, line.y2, thickness)} fill={ink(wallColor(constructionId))} fillOpacity={glass ? 0.55 : 1} />;
}

function PlanWalls({ rooms, interfaceWalls }: { rooms: readonly Room[]; interfaceWalls?: Project['interfaceWalls'] }) {
  const boxed = rooms.filter(room => (room.outline?.length ?? 0) < 3);
  const shaped = rooms.filter(room => (room.outline?.length ?? 0) >= 3);
  const faces = boxed.flatMap(room => WALL_FACE_IDS.map(face => ({ room, face, id: room.surfaces.walls[face].constructionId, graphic: graphicWall(room.surfaces.walls[face].constructionId) })));
  return (
    <g pointerEvents="none">
      {shaped.flatMap(room => {
        const loop = room.outline ?? [];
        return loop.flatMap((point, index) => {
          const next = loop[(index + 1) % loop.length];
          const constructionId = room.edgeWalls?.[index]?.constructionId;
          const graphic = graphicWall(constructionId);
          if (graphic.role !== 'none') {
            return <polygon key={`${room.id}-edge-${index}`} points={wallQuad(point.x, point.y, next.x, next.y, graphic.thickness)} fill={ink(wallColor(constructionId))} fillOpacity={graphic.role === 'glass' ? 0.55 : 1} />;
          }
          return edgePortions(room, index, rooms).map((portion, portionIndex) => (
            <WallSpan
              key={`${room.id}-edge-${index}-${portionIndex}`}
              x1={point.x}
              y1={point.y}
              x2={next.x}
              y2={next.y}
              portion={portion}
              constructionId={constructionId}
              thickness={graphic.thickness}
              glass={false}
            />
          ));
        });
      })}
      {faces.filter(item => item.graphic.role !== 'none').map(item => (
        <rect
          key={`${item.room.id}-${item.face}`}
          {...wallBand(item.room, item.face, item.graphic.thickness)}
          fill={ink(wallColor(item.id))}
          fillOpacity={item.graphic.role === 'glass' ? 0.55 : 1}
        />
      ))}
      {faces.filter(item => item.graphic.role === 'none').flatMap(item => {
        const line = wallLine(item.room, item.face);
        return facePortions(item.room, item.face, rooms).map((portion, portionIndex) => (
          <WallSpan
            key={`${item.room.id}-${item.face}-${portionIndex}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            portion={portion}
            constructionId={item.id}
            thickness={item.graphic.thickness}
            glass={item.graphic.role === 'glass'}
          />
        ));
      })}
      {interfaceTargets(rooms).map(target => {
        const assignment = interfaceWalls?.[target.key];
        const color = interfaceConstructionColor(assignment);
        const outside = target.sides.length < 2;
        if (!color) {
          if (outside) return null;
          return (
            <line
              key={`iface-${target.key}`}
              x1={target.x0}
              y1={target.y0}
              x2={target.x1}
              y2={target.y1}
              stroke={ink(INTERFACE_COLOR)}
              strokeWidth={2.6}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const graphic = graphicWall(assignment?.constructionId);
        return (
          <polygon
            key={`iface-${target.key}`}
            points={wallQuad(target.x0, target.y0, target.x1, target.y1, graphic.role === 'none' ? 0.14 : graphic.thickness)}
            fill={ink(color)}
            fillOpacity={graphic.role === 'glass' ? 0.55 : 1}
          />
        );
      })}
    </g>
  );
}

function WindowMark({
  ends,
  face,
  active,
}: {
  ends: { x0: number; y0: number; x1: number; y1: number };
  face: WallFace;
  active: boolean;
}) {
  const vertical = face === 'px' || face === 'nx';
  return (
    <g stroke={ink(active ? SELECT : MARK_COLOR.window)} strokeWidth={active ? 2.25 : HAIR} fill="none">
      {[-1, 0, 1].map(part => {
        const offset = part * 0.045;
        return (
          <line
            key={part}
            x1={ends.x0 + (vertical ? offset : 0)}
            y1={ends.y0 + (vertical ? 0 : offset)}
            x2={ends.x1 + (vertical ? offset : 0)}
            y2={ends.y1 + (vertical ? 0 : offset)}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

function DrawnWalls({
  runs,
  selection,
  tool,
  onSelect,
  onMenu,
}: {
  runs: readonly WallRun[];
  selection: Selection;
  tool: EditorTool;
  onSelect: (selection: Selection) => void;
  onMenu: (event: ReactMouseEvent, selection: Selection) => void;
}) {
  return (
    <g>
      {runs.map(run => {
        const selected = selection.kind === 'wallRun' && selection.id === run.id;
        const geom = runGeom(run);
        const selectRun = (event: ReactMouseEvent) => {
          event.stopPropagation();
          if (tool.kind !== 'select') return;
          onSelect({ kind: 'wallRun', id: run.id });
        };
        return (
          <g key={run.id}>
            {wallQuads(run).map((points, index) => (
              <polygon
                key={index}
                points={points}
                fill={ink(selected ? PLAN_COLOR.selectStrong : ink('#60707a'))}
                stroke={ink(selected ? SELECT : 'none')}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                data-hit="wall-run"
                data-id={run.id}
                onClick={selectRun}
                onContextMenu={event => onMenu(event, { kind: 'wallRun', id: run.id })}
              />
            ))}
            {run.openings.map(opening => {
              const ends = runOpeningEnds(run, opening);
              const active = selection.kind === 'wallOpening' && selection.id === opening.id;
              const from = Math.atan2(geom.dy, geom.dx);
              let delta = Math.atan2(ends.ny, ends.nx) - from;
              while (delta > Math.PI) delta -= Math.PI * 2;
              while (delta <= -Math.PI) delta += Math.PI * 2;
              return (
                <g key={opening.id} pointerEvents="none">
                  {opening.kind === 'door' && (
                    <g fill="none" stroke={ink(active ? SELECT : MARK_COLOR.door)} strokeWidth={active ? 2.25 : HAIR}>
                      <line x1={ends.x0} y1={ends.y0} x2={ends.x0 + ends.nx * opening.widthM} y2={ends.y0 + ends.ny * opening.widthM} vectorEffect="non-scaling-stroke" />
                      <polyline points={arcPoints(ends.x0, ends.y0, opening.widthM, from, from + delta)} vectorEffect="non-scaling-stroke" />
                    </g>
                  )}
                  {opening.kind === 'window' && <SlantedWindow ends={ends} active={active} />}
                </g>
              );
            })}
            <line
              data-hit="wall-run"
              data-id={run.id}
              x1={geom.x0}
              y1={geom.y0}
              x2={geom.x1}
              y2={geom.y1}
              stroke="transparent"
              strokeWidth={0.5}
              onClick={selectRun}
              onContextMenu={event => onMenu(event, { kind: 'wallRun', id: run.id })}
            />
            {run.openings.map(opening => {
              const ends = runOpeningEnds(run, opening);
              return (
                <line
                  key={`${opening.id}-hit`}
                  data-hit="wall-opening"
                  data-wall={run.id}
                  data-opening={opening.id}
                  x1={ends.x0}
                  y1={ends.y0}
                  x2={ends.x1}
                  y2={ends.y1}
                  stroke="transparent"
                  strokeWidth={0.36}
                  onClick={event => {
                    event.stopPropagation();
                    if (tool.kind !== 'select') return;
                    onSelect({ kind: 'wallOpening', wallId: run.id, id: opening.id });
                  }}
                  onContextMenu={event => onMenu(event, { kind: 'wallOpening', wallId: run.id, id: opening.id })}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function OpeningGhost({ spot, kind }: { spot: OpeningSpot; kind: 'door' | 'window' }) {
  const color = kind === 'door' ? MARK_COLOR.door : MARK_COLOR.window;
  const swing = spot.nx != null && spot.ny != null ? { nx: spot.nx, ny: spot.ny, from: 0, to: 0 } : doorArc(spot.face, 'start', 'in');
  const dx = spot.x1 - spot.x0;
  const dy = spot.y1 - spot.y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 0.12;
  const py = (dx / len) * 0.12;
  const slot = `${spot.x0 + px},${spot.y0 + py} ${spot.x1 + px},${spot.y1 + py} ${spot.x1 - px},${spot.y1 - py} ${spot.x0 - px},${spot.y0 - py}`;
  const from = spot.nx != null ? Math.atan2(dy, dx) : swing.from;
  let to = swing.to;
  if (spot.nx != null && spot.ny != null) {
    let delta = Math.atan2(spot.ny, spot.nx) - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    to = from + delta;
  }
  return (
    <g pointerEvents="none" fill="none" stroke={ink(color)} strokeWidth={2.25}>
      <polygon points={slot} fill={PLAN_COLOR.card} vectorEffect="non-scaling-stroke" />
      {kind === 'door' && (
        <>
          <line x1={spot.x0} y1={spot.y0} x2={spot.x0 + swing.nx * spot.widthM} y2={spot.y0 + swing.ny * spot.widthM} vectorEffect="non-scaling-stroke" />
          <polyline points={arcPoints(spot.x0, spot.y0, spot.widthM, from, to)} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {kind === 'window' && <SlantedWindow ends={{ ...spot, nx: -dy / len, ny: dx / len }} active={false} />}
    </g>
  );
}

function SlantedWindow({
  ends,
  active,
}: {
  ends: { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number };
  active: boolean;
}) {
  return (
    <g stroke={ink(active ? SELECT : MARK_COLOR.window)} strokeWidth={active ? 2.25 : HAIR} fill="none">
      {[-1, 0, 1].map(part => {
        const offset = part * 0.045;
        return (
          <line
            key={part}
            x1={ends.x0 + ends.nx * offset}
            y1={ends.y0 + ends.ny * offset}
            x2={ends.x1 + ends.nx * offset}
            y2={ends.y1 + ends.ny * offset}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

const GUIDE = PLAN_COLOR.guide;

function ChainPreview({
  points,
  aim,
  units,
  fontM,
}: {
  points: DrawPoint[];
  aim: WallSnap | null;
  units: Project['units'];
  fontM: number;
}) {
  const handle = fontM * 0.55;
  const last = points.length > 0 ? points[points.length - 1] : null;
  return (
    <g pointerEvents="none">
      {points.slice(1).map((point, index) => (
        <polygon key={index} points={wallQuad(points[index].x, points[index].y, point.x, point.y)} fill={PLAN_COLOR.draftStrong} stroke={ink(DIM)} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ))}
      {aim?.guides.map((guide, index) => {
        const length = Math.hypot(guide.x1 - guide.x0, guide.y1 - guide.y0);
        const midX = (guide.x0 + guide.x1) / 2;
        const midY = (guide.y0 + guide.y1) / 2;
        let textDeg = (Math.atan2(-(guide.y1 - guide.y0), guide.x1 - guide.x0) * 180) / Math.PI;
        if (textDeg > 90 || textDeg < -90) textDeg += 180;
        return (
          <g key={`guide-${index}`}>
            <line x1={guide.x0} y1={guide.y0} x2={guide.x1} y2={guide.y1} stroke={ink(GUIDE)} strokeWidth={1.25} strokeDasharray="0.18 0.12" vectorEffect="non-scaling-stroke" />
            {length > 0.2 && (
              <g transform={`translate(${midX} ${midY}) scale(1,-1) rotate(${textDeg})`}>
                <text textAnchor="middle" y={-fontM * 0.55} fontSize={fontM * 0.55} fill={ink(GUIDE)} fontWeight={600}>
                  {formatLength(length, units, 1)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {last && aim && <WallDraftCue line={{ x0: last.x, y0: last.y, x1: aim.x, y1: aim.y }} units={units} fontM={fontM} marks={false} />}
      {points.map((point, index) => (
        <rect key={`pt-${index}`} x={point.x - handle / 2} y={point.y - handle / 2} width={handle} height={handle} fill={ink(index === 0 && aim?.close ? GUIDE : PLAN_COLOR.halo)} stroke={ink(index === 0 && aim?.close ? GUIDE : DIM)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      ))}
      {aim && (
        <circle cx={aim.x} cy={aim.y} r={handle * 0.42} fill={ink(aim.kind === 'grid' ? PLAN_COLOR.halo : GUIDE)} stroke={ink(aim.close ? GUIDE : DIM)} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
}

function WallDraftCue({
  line,
  units,
  fontM,
  marks = true,
}: {
  line: { x0: number; y0: number; x1: number; y1: number };
  units: Project['units'];
  fontM: number;
  marks?: boolean;
}) {
  const geom = runGeom(line);
  if (geom.length < 0.05) return null;
  const length = formatLength(geom.length, units, 1);
  const badge = `${length} · ${wallAngleDeg(line.x0, line.y0, line.x1, line.y1)}°`;
  const handle = fontM * 0.55;
  let textDeg = (Math.atan2(-geom.dy, geom.dx) * 180) / Math.PI;
  if (textDeg > 90 || textDeg < -90) textDeg += 180;
  const midX = (geom.x0 + geom.x1) / 2;
  const midY = (geom.y0 + geom.y1) / 2;
  const side = Math.max(0.55, fontM * 1.7);
  return (
    <g pointerEvents="none">
      <polygon points={wallQuad(line.x0, line.y0, line.x1, line.y1)} fill={PLAN_COLOR.draftStrong} stroke={ink(DIM)} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {marks && [[geom.x0, geom.y0], [geom.x1, geom.y1]].map(([x, y], index) => (
        <rect key={index} x={x - handle / 2} y={y - handle / 2} width={handle} height={handle} fill={PLAN_COLOR.halo} stroke={ink(DIM)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      ))}
      <g transform={`translate(${midX} ${midY}) scale(1,-1) rotate(${textDeg})`}>
        <text textAnchor="middle" y={-fontM * 0.85} fontSize={fontM * 0.62} fill={ink(DIM)} fontWeight={600}>
          {length}
        </text>
      </g>
      <DragReadout x={midX + geom.nx * side} y={midY + geom.ny * side} text={badge} fontM={fontM * 0.92} />
    </g>
  );
}

/** Pipe colour by what the loop carries: hot red, chilled blue, refrigerant violet. */
function pipeColor(loop: PlantLoop): string {
  if (loop.fluid === 'co2' || loop.fluid === 'refrigerant') return '#7b4f9e';
  if (loop.fluid === 'steam') return '#b8432f';
  if (loop.supplyC != null && loop.supplyC >= 30) return '#c0492f';
  return '#2f6fb0';
}

/** Supply and return pipes from each loop's plant to the units whose coils it serves. Schematic routing, not a pipe layout. */
function PipeLayer({
  project,
  selection,
  tool,
  fontM,
  allLabels,
  onSelect,
}: {
  project: Project;
  selection: Selection;
  tool: EditorTool;
  fontM: number;
  allLabels: boolean;
  onSelect: (selection: Selection) => void;
}) {
  const loops = project.plantLoops ?? [];
  if (loops.length === 0) return null;
  const gap = Math.max(fontM * 0.22, 0.06);
  return (
    <g>
      {loops.map((loop, loopIndex) => {
        const plant = loop.plantEquipmentId ? project.equipment.find(item => item.id === loop.plantEquipmentId) : undefined;
        if (!plant) return null;
        // Each loop gets its own lane so pipes to the same unit sit side by side.
        const lane = (loopIndex - (loops.length - 1) / 2) * gap * 3;
        const units = project.equipment.filter(item => item.id !== plant.id && (item.sections ?? []).some(section => section.loopId === loop.id));
        const anchorOf = (unit: PlacedEquipment) => {
          const coil = (unit.sections ?? []).find(section => section.loopId === loop.id);
          return (coil && sectionAnchor(unit, coil.id)) ?? { x: unit.xM, y: unit.yM };
        };
        const active = selection.kind === 'loop' && selection.id === loop.id;
        const related = active || (selection.kind === 'equipment' && (selection.id === plant.id || units.some(item => item.id === selection.id)));
        const color = pipeColor(loop);
        const liquid = loop.fluid === 'water' || loop.fluid === 'propylene-glycol' || loop.fluid === 'ethylene-glycol';
        return (
          <g key={loop.id}>
            {units.map((unit, index) => {
              const end = anchorOf(unit);
              const corner = { x: end.x + lane, y: plant.yM };
              const path = (offset: number) => [
                { x: plant.xM, y: plant.yM + offset },
                { x: corner.x + offset * (end.x >= plant.xM ? -1 : 1), y: corner.y + offset },
                { x: corner.x + offset * (end.x >= plant.xM ? -1 : 1), y: end.y },
              ];
              const route = (offset: number) => path(offset).map(point => `${point.x},${point.y}`).join(' ');
              const supply = route(gap / 2);
              const ret = route(-gap / 2);
              // Supply runs out from the plant; on liquid loops the dashed return comes back to it.
              const arrows = [
                ...flowChevrons(path(gap / 2), fontM * 0.8),
                ...(liquid ? flowChevrons([...path(-gap / 2)].reverse(), fontM * 0.8) : []),
              ];
              const mid = { x: (plant.xM + corner.x) / 2, y: plant.yM };
              return (
                <g key={`${loop.id}-${unit.id}`}>
                  <polyline
                    data-hit="pipe"
                    data-id={loop.id}
                    points={route(0)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(gap * 3, 0.3)}
                    strokeLinejoin="round"
                    onClick={event => {
                      event.stopPropagation();
                      if (tool.kind !== 'select') return;
                      onSelect({ kind: 'loop', id: loop.id });
                    }}
                  >
                    <title>{`${loop.name} · ${LOOP_FLUID_LABEL[loop.fluid]}`}</title>
                  </polyline>
                  <polyline points={supply} fill="none" stroke={ink(active ? SELECT : color)} strokeWidth={active ? 2.2 : 1.3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" />
                  {liquid && <polyline points={ret} fill="none" stroke={ink(active ? SELECT : color)} strokeWidth={active ? 2.2 : 1.3} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" />}
                  {arrows.map((chevron, arrowIndex) => (
                    <polyline key={`a-${arrowIndex}`} points={chevron} fill="none" stroke={ink(active ? SELECT : color)} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  ))}
                  {index === 0 && (allLabels || related) && Math.abs(corner.x - plant.xM) > fontM * 4 && (
                    <g transform={`translate(${mid.x} ${mid.y + gap + fontM * 0.55}) scale(1,-1)`} pointerEvents="none">
                      <text data-label={active ? LABEL_ACTIVE : LABEL_PRIORITY.pipe} textAnchor="middle" fontSize={fontM * 0.58} fontWeight={600} fill={ink(active ? SELECT : color)}>
                        {loop.name}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Marks a unit connection open to the outdoors: a bold arrow (in for outdoor air, out for exhaust) and a solid tag,
 * drawn beyond the casing in the unit's frame so it reads the same whether the unit is drawn open or closed.
 */
function OutsideAirTag({ x, y, face, role, size, yawDeg, detail }: { x: number; y: number; face: 1 | -1; role: 'oa' | 'ea'; size: number; yawDeg: number; detail: string | null }) {
  const inward = role === 'oa';
  // One colour for air coming in, one for air going out, whatever system it belongs to.
  const color = inward ? OUTSIDE_IN_COLOR : OUTSIDE_OUT_COLOR;
  const title = 'OUTSIDE AIR';
  const gap = size * 0.35;
  const arrowLen = size * 2.6;
  const shaft = size * 0.26;
  const head = size * 0.62;
  const headLen = size * 0.95;
  const near = x + face * gap;
  const far = x + face * (gap + arrowLen);
  const tip = inward ? near : far;
  const tail = inward ? far : near;
  const dir = Math.sign(tip - tail) || 1;
  const neck = tip - dir * headLen;
  const arrow = [
    [tail, y - shaft],
    [neck, y - shaft],
    [neck, y - head],
    [tip, y],
    [neck, y + head],
    [neck, y + shaft],
    [tail, y + shaft],
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(' ');
  const lines = detail ? [title, detail] : [title];
  const wide = Math.max(title.length * size * 0.64, (detail?.length ?? 0) * size * 0.52) + size * 1.1;
  const tall = size * 1.5 + (detail ? size * 1.05 : 0);
  // The tag is drawn upright on screen, so its reach along the unit's axis depends on the unit's rotation.
  const rad = (yawDeg * Math.PI) / 180;
  const reach = Math.abs(Math.cos(rad)) * wide / 2 + Math.abs(Math.sin(rad)) * tall / 2;
  const tagX = x + face * (gap + arrowLen + size * 0.4 + reach);
  return (
    <g pointerEvents="none" data-label={LABEL_PRIORITY.outside}>
      <polygon points={arrow} fill={ink(color)} stroke={PLAN_COLOR.halo} strokeWidth={0.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${tagX} ${y}) rotate(${-yawDeg}) scale(1,-1)`}>
        <rect x={-wide / 2} y={-tall / 2} width={wide} height={tall} rx={size * 0.35} fill={ink(color)} stroke={PLAN_COLOR.halo} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {lines.map((line, index) => (
          <text
            key={line}
            textAnchor="middle"
            dominantBaseline="central"
            y={-tall / 2 + size * 0.75 + index * size * 1.05}
            fontSize={index === 0 ? size * 0.92 : size * 0.78}
            fontWeight={index === 0 ? 700 : 500}
            fill={PLAN_COLOR.halo}
          >
            {line}
          </text>
        ))}
      </g>
    </g>
  );
}

/** Room sensors as small tagged bubbles along the top of their space. Duct sensors show in the unit's airflow strip in the inspector. */
function SensorMarks({
  project,
  rooms,
  selection,
  tool,
  fontM,
  onSelect,
}: {
  project: Project;
  rooms: readonly Room[];
  selection: Selection;
  tool: EditorTool;
  fontM: number;
  onSelect: (selection: Selection) => void;
}) {
  const points = (project.controlPoints ?? []).filter(point => point.location.kind === 'room');
  if (points.length === 0) return null;
  const r = fontM * 0.95;
  const byRoom = new Map<string, typeof points>();
  for (const point of points) {
    if (point.location.kind !== 'room') continue;
    byRoom.set(point.location.roomId, [...(byRoom.get(point.location.roomId) ?? []), point]);
  }
  return (
    <g>
      {[...byRoom.entries()].map(([roomId, list]) => {
        const room = rooms.find(item => item.id === roomId);
        if (!room) return null;
        const outline = room.outline && room.outline.length >= 3 ? room.outline : null;
        const minX = outline ? Math.min(...outline.map(point => point.x)) : room.xM;
        const maxY = outline ? Math.max(...outline.map(point => point.y)) : room.yM + room.widthM;
        return list.map((point, index) => {
          const active = selection.kind === 'point' && selection.id === point.id;
          const served = point.location.kind === 'room' && point.location.equipmentId != null && selection.kind === 'equipment' && selection.id === point.location.equipmentId;
          const cx = minX + r * 1.8 + index * r * 2.4;
          const cy = maxY - r * 1.8;
          return (
            <g
              key={point.id}
              data-hit="sensor"
              data-id={point.id}
              role="button"
              aria-label={`Sensor ${point.tag}`}
              onClick={event => {
                event.stopPropagation();
                if (tool.kind !== 'select') return;
                onSelect({ kind: 'point', id: point.id });
              }}
            >
              <title>{point.tag}</title>
              {/* ISA-5.1 field-mounted transmitter: function letters over the tag. */}
              <InstrumentBubble x={cx} y={cy} r={r} sensor={point.sensor} tag={point.tag} color={ink(active || served ? SELECT : '#4a5560')} strokeWidth={active ? 2.25 : 1.2} />
            </g>
          );
        });
      })}
    </g>
  );
}

const NO_POINTS: ControlPoint[] = [];
const NO_LOOPS: PlantLoop[] = [];

/** Colour of an air stream inside a unit: the colour its duct carries outside, so the path reads through the casing. */
const UNIT_STREAM_FALLBACK: Record<UnitStream, string> = { outdoor: '#2f7d32', return: '#c47b12', mixed: '#6f6a8a', supply: '#1d4e89', exhaust: '#7a4a2b' };
const STREAM_SERVICE: Record<UnitStream, DuctService | null> = { outdoor: 'outdoor', return: 'return', mixed: null, supply: 'supply', exhaust: 'relief' };

/** Air inside a unit takes the same colour as that air in a duct, whatever the system. */
function unitStreamColor(stream: UnitStream): string {
  const service = STREAM_SERVICE[stream];
  return service ? SERVICE_COLOR[service] : UNIT_STREAM_FALLBACK[stream];
}

function rotateLocal(item: Pick<PlacedEquipment, 'xM' | 'yM' | 'yawDeg'>, x: number, y: number): { x: number; y: number } {
  const rad = (item.yawDeg * Math.PI) / 180;
  return { x: item.xM + x * Math.cos(rad) - y * Math.sin(rad), y: item.yM + x * Math.sin(rad) + y * Math.cos(rad) };
}

/** Where piping meets a section: the casing edge on the unit's −y side, level with the section. */
function sectionAnchor(item: PlacedEquipment, sectionId: string): { x: number; y: number } | null {
  const size = equipmentSizeM(getProduct(item.catalogId));
  const width = Math.max(size.widthM, 0.05);
  const component = unitLayout(item, Math.max(size.lengthM, 0.05), width).components.find(entry => entry.section.id === sectionId);
  if (!component) return null;
  return rotateLocal(item, component.x, -width / 2);
}

function sectionColor(section: UnitSection, loops: readonly PlantLoop[]): string {
  const loop = loops.find(entry => entry.id === section.loopId);
  if (loop) return pipeColor(loop);
  if (section.medium === 'co2-dx' || section.medium === 'dx') return '#7b4f9e';
  if (section.kind === 'heating-coil') return '#c0492f';
  if (section.kind === 'cooling-coil') return '#2f6fb0';
  return DIAGRAM_INK;
}


/** Unit diagrams open on their own once the unit is this long on screen. */
const UNIT_DETAIL_PX = 220;
const DIAGRAM_INK = PLAN_COLOR.ink;

/** Length of a component along its duct, as a share of the duct height. */
function componentLength(kind: UnitSection['kind']): number {
  switch (kind) {
    case 'oa-damper':
    case 'ra-damper':
    case 'exhaust-damper':
      return 0.26;
    case 'filter':
    case 'humidifier':
      return 0.3;
    case 'cooling-coil':
    case 'heating-coil':
      return 0.4;
    case 'supply-fan':
      return 0.8;
    case 'relief-fan':
      return 0.5;
    default:
      return 1;
  }
}

/** Axis-aligned rectangles that make up one internal duct, joined at corners; ends on the casing stay flush. */
function ductRects(points: readonly { x: number; y: number }[], h: number, halfLength: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const onCasing = (x: number) => Math.abs(Math.abs(x) - halfLength) < 1e-6;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const ea = onCasing(a.x) && i === 1 ? 0 : h / 2;
    const eb = onCasing(b.x) && i === points.length - 1 ? 0 : h / 2;
    if (Math.abs(a.y - b.y) < 1e-9) {
      const left = a.x < b.x ? a.x - ea : b.x - eb;
      const right = a.x < b.x ? b.x + eb : a.x + ea;
      out.push({ x: left, y: a.y - h / 2, w: right - left, h });
    } else {
      const low = Math.min(a.y, b.y) - h / 2;
      out.push({ x: a.x - h / 2, y: low, w: h, h: Math.abs(a.y - b.y) + h });
    }
  }
  return out;
}

/** Duct end at the casing: arrow-shaped, pointing the way the air moves (notched for an intake, pointed for a discharge). */
function portEnd(x: number, y: number, h: number, face: 1 | -1, inward: boolean): string {
  const d0 = h * 0.22;
  const d = h * 0.34;
  const top = y + h / 2;
  const bottom = y - h / 2;
  const pts = inward
    ? [[x, top], [x + face * (d0 + d), top], [x + face * d0, y], [x + face * (d0 + d), bottom], [x, bottom]]
    : [[x, top], [x + face * d0, top], [x + face * (d0 + d), y], [x + face * d0, bottom], [x, bottom]];
  return pts.map(([px, py]) => `${px},${py}`).join(' ');
}

/** Section symbol in its duct, from the ASHRAE 134 symbol set. */
function ComponentSymbol({ component, px, py, h, length, color, piped }: { component: UnitComponent; px: number; py: number; h: number; length: number; color: string; piped: boolean }) {
  const section = component.section;
  const span = { y0: component.y0 + (py - component.y), y1: component.y1 + (py - component.y) };
  switch (section.kind) {
    case 'oa-damper':
    case 'ra-damper':
    case 'exhaust-damper': {
      // A relief damper with no duct is a barometric (gravity) damper on the casing.
      const gravity = section.kind === 'exhaust-damper' && section.ducted === false;
      return <ControlDamper x={px} y={py} h={h} length={length} color={ink(color)} operator={gravity ? 'gravity' : 'motor'} operatorSide={component.side as 1 | -1} />;
    }
    case 'filter':
      return <DuctFilter x={px} y={py} h={h} length={length} color={ink(color)} />;
    case 'cooling-coil':
    case 'heating-coil':
      return <DuctCoil x={px} y={py} h={h} length={length} color={ink(color)} piped={piped} />;
    case 'supply-fan':
      return <CentrifugalFan x={px} y={py} h={h} color={ink(color)} dir={component.dir} />;
    case 'relief-fan':
      return <AxialFan x={px} y={py} h={h} length={length} color={ink(color)} />;
    case 'heat-recovery':
      return <HeatExchanger x={px} y0={span.y0} y1={span.y1} length={length} color={ink(color)} />;
    case 'mixing-box':
      return <MixingPlenum x={px} y0={span.y0} y1={span.y1} length={length} color={ink(color)} />;
    case 'humidifier':
      return <Humidifier x={px} y={py} h={h} length={length} color={ink(color)} />;
    case 'condenser': {
      const block = component.block;
      if (!block) return null;
      const ox = px - component.x;
      return <CondenserSection x0={ox + block.x0} x1={ox + block.x1} y0={span.y0} y1={span.y1} fans={block.fans.map(fan => ({ x: ox + fan.x, y: fan.y + (py - component.y), r: fan.r }))} color={ink(color)} />;
    }
    default:
      return null;
  }
}

/**
 * A unit opened up on the plan as a control diagram at true scale: double-line ducts with the components in them,
 * duct ends at the casing connections, coil piping and valves, and duct sensors on their probes. Every duct and
 * every component is selectable. Tags appear once they are large enough to read.
 */
function UnitInternals({
  item,
  layout,
  length,
  width,
  streamColor,
  pxPerM,
  units,
  selectedSectionId,
  selectedDuctId,
  ductedPortIds,
  selectedPointId,
  points,
  loops,
  tool,
  onSelect,
}: {
  item: PlacedEquipment;
  layout: UnitLayout;
  length: number;
  width: number;
  streamColor: (stream: UnitStream) => string;
  pxPerM: number;
  units: Project['units'];
  selectedSectionId: string | null;
  selectedDuctId: string | null;
  /** Casing connections with a plan duct attached; their airflow is labelled on the duct. */
  ductedPortIds: readonly string[];
  selectedPointId: string | null;
  points: readonly ControlPoint[];
  loops: readonly PlantLoop[];
  tool: EditorTool;
  onSelect: (selection: Selection) => void;
}) {
  const cx = item.xM;
  const cy = item.yM;
  const h = layout.ductM;
  // Diagram text grows with the unit, but stops at a comfortable screen size when zoomed far in.
  const t = Math.min(h * 0.2, 13 / Math.max(pxPerM, 1e-6));
  const readable = t * pxPerM >= 6;
  const fine = t * pxPerM >= 9;
  const upright = (x: number, y: number, children: React.ReactNode) => (
    <g transform={`translate(${x} ${y}) rotate(${-item.yawDeg}) scale(1,-1)`} pointerEvents="none">
      {children}
    </g>
  );
  const text = (x: number, y: number, value: string, size: number, fill: string, weight = 600) =>
    upright(
      x,
      y,
      <text textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight={weight} fill={ink(fill)}>
        {value}
      </text>,
    );
  const tagBox = (x: number, y: number, value: string, size: number, color: string) => {
    const w = Math.max(value.length * size * 0.62 + size * 0.8, size * 1.8);
    return upright(
      x,
      y,
      <>
        <rect x={-w / 2} y={-size * 0.75} width={w} height={size * 1.5} fill={PLAN_COLOR.halo} stroke={ink(color)} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
        <text textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={600} fill={ink(color)}>
          {value}
        </text>
      </>,
    );
  };
  const flows = unitFlows(item);
  const portFlow = (role: string) => (role === 'oa' ? flows.outdoor : role === 'ra' ? flows.return : role === 'sa' ? flows.supply : flows.exhaust);
  const allRects = layout.ducts.map(duct => ({ duct, rects: ductRects(duct.points, h, length / 2) }));
  const ends = layout.ports.map(port => ({ port, shape: portEnd(port.x, port.y, h, port.face, port.direction === 'in') }));
  const sensors = points.filter(point => point.location.kind === 'station' && point.location.equipmentId === item.id);
  const shift = (shape: string) =>
    shape
      .split(' ')
      .map(pair => {
        const [x, y] = pair.split(',').map(Number);
        return `${cx + x},${cy + y}`;
      })
      .join(' ');
  return (
    <g>
      {/* Duct walls: stroke every piece, then fill over the inside so only the outline of the joined ducts remains. */}
      <g pointerEvents="none">
        {allRects.flatMap(({ duct, rects }) => rects.map((rect, i) => <rect key={`${duct.id}-o${i}`} x={cx + rect.x} y={cy + rect.y} width={rect.w} height={rect.h} fill="none" stroke={ink(DIAGRAM_INK)} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />))}
        {ends.map(({ port, shape }) => <polygon key={`end-o-${port.role}`} points={shift(shape)} fill="none" stroke={ink(DIAGRAM_INK)} strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinejoin="miter" />)}
        {allRects.flatMap(({ duct, rects }) => rects.map((rect, i) => <rect key={`${duct.id}-f${i}`} x={cx + rect.x} y={cy + rect.y} width={rect.w} height={rect.h} fill={PLAN_COLOR.halo} />))}
        {ends.map(({ port, shape }) => <polygon key={`end-f-${port.role}`} points={shift(shape)} fill={PLAN_COLOR.halo} />)}
        {allRects.flatMap(({ duct, rects }) =>
          rects.map((rect, i) => (
            <rect key={`${duct.id}-t${i}`} x={cx + rect.x} y={cy + rect.y} width={rect.w} height={rect.h} fill={fade(duct.id === selectedDuctId ? SELECT : streamColor(duct.stream), duct.id === selectedDuctId ? 0.78 : 0.9)} />
          )),
        )}
        {ends.map(({ port, shape }) => {
          const stream: UnitStream = port.role === 'oa' ? 'outdoor' : port.role === 'ra' ? 'return' : port.role === 'sa' ? 'supply' : 'exhaust';
          return <polygon key={`end-t-${port.role}`} points={shift(shape)} fill={fade(streamColor(stream), 0.9)} />;
        })}
      </g>
      {/* Pick targets for the ducts, with one arrow each showing which way the air moves. */}
      {allRects.map(({ duct, rects }) => {
        const active = duct.id === selectedDuctId;
        const color = active ? SELECT : streamColor(duct.stream);
        let best = 0;
        let arrow: { x: number; y: number; ux: number; uy: number } | null = null;
        for (let i = 1; i < duct.points.length; i += 1) {
          const a = duct.points[i - 1];
          const b = duct.points[i];
          const run = Math.hypot(b.x - a.x, b.y - a.y);
          if (run > best) {
            best = run;
            arrow = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ux: (b.x - a.x) / run, uy: (b.y - a.y) / run };
          }
        }
        const size = Math.min(h * 0.24, best * 0.3);
        return (
          <g key={duct.id} data-hit="unit-duct" data-id={item.id} data-link={duct.id}>
            <title>{`${UNIT_STREAM_LABEL[duct.stream]} duct`}</title>
            {rects.map((rect, i) => (
              <rect key={i} x={cx + rect.x} y={cy + rect.y} width={rect.w} height={rect.h} fill="transparent" stroke={ink(active ? SELECT : 'none')} strokeWidth={active ? 1.6 : 0} vectorEffect="non-scaling-stroke" />
            ))}
            {arrow && size > 0 && (
              <polyline
                points={`${cx + arrow.x - arrow.ux * size * 0.5 - arrow.uy * size * 0.6},${cy + arrow.y - arrow.uy * size * 0.5 + arrow.ux * size * 0.6} ${cx + arrow.x + arrow.ux * size * 0.5},${cy + arrow.y + arrow.uy * size * 0.5} ${cx + arrow.x - arrow.ux * size * 0.5 + arrow.uy * size * 0.6},${cy + arrow.y - arrow.uy * size * 0.5 - arrow.ux * size * 0.6}`}
                fill="none"
                stroke={ink(color)}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
      {/* Casing connections: name and design airflow beside each duct end. */}
      {readable &&
        layout.ports.map(port => {
          const stream: UnitStream = port.role === 'oa' ? 'outdoor' : port.role === 'ra' ? 'return' : port.role === 'sa' ? 'supply' : 'exhaust';
          const color = streamColor(stream);
          const name = PORT_ROLE_LABEL[port.role].toUpperCase();
          const flow = portFlow(port.role);
          const portId = getProduct(item.catalogId)?.unit?.portAt[port.role]?.id;
          // A duct leaves this connection on the plan and carries its own airflow label.
          if (port.ducted && portId && ductedPortIds.includes(portId)) return null;
          // Where air crosses the building envelope: a solid tag and a bold arrow beyond the hood.
          if (port.role === 'oa' || port.role === 'ea') {
            return (
              <OutsideAirTag
                key={port.role}
                x={cx + port.x + port.face * h * 0.56}
                y={cy + port.y}
                face={port.face}
                role={port.role}
                size={Math.max(t * 1.1, 11.5 / Math.max(pxPerM, 1e-6))}
                yawDeg={item.yawDeg}
                detail={fine && flow != null ? formatFlow(flow, units) : null}
              />
            );
          }
          const lines = [
            { value: name, size: t, weight: 700 },
            ...(fine && flow != null ? [{ value: formatFlow(flow, units), size: t * 0.82, weight: 500 }] : []),
          ];
          // Beyond the duct end, level with the connection, so it never sits between two streams.
          const wide = Math.max(...lines.map(line => line.value.length * line.size * 0.6)) + t * 1.2;
          const x = cx + port.x + port.face * (h * 0.56 + t * 0.9 + wide / 2);
          const y = cy + port.y;
          const top = (lines.length - 1) * t * 0.575;
          return (
            <g key={port.role}>
              {lines.map((line, index) => (
                <g key={line.value}>{text(x, y + top - index * t * 1.15, line.value, line.size, color, line.weight)}</g>
              ))}
            </g>
          );
        })}
      {layout.components.map(component => {
        const section = component.section;
        const selected = section.id === selectedSectionId;
        const color = selected ? SELECT : sectionColor(section, loops);
        const px = cx + component.x;
        const py = cy + component.y;
        const spans = section.kind === 'heat-recovery' || section.kind === 'mixing-box';
        const along = spans ? Math.min(layout.pitchM * 0.6, h * 1.1) : Math.min(h * componentLength(section.kind), layout.pitchM * 0.8);
        const block = component.block;
        const hitW = block ? block.x1 - block.x0 : Math.max(along, Math.min(layout.pitchM * 0.7, h));
        const hitY0 = spans || block ? cy + component.y0 : py - h / 2;
        const hitY1 = spans || block ? cy + component.y1 : py + h / 2;
        const condenser = layout.components.find(entry => entry.block);
        const refrigerant = section.kind === 'cooling-coil' && (section.medium === 'dx' || section.medium === 'co2-dx') && condenser;
        const coil = section.kind === 'cooling-coil' || section.kind === 'heating-coil';
        const piped = coil && !!section.loopId;
        const valves = section.valves ?? [];
        const valveSize = Math.min(along * 0.5, h * 0.18);
        const damper = section.kind === 'oa-damper' || section.kind === 'ra-damper' || section.kind === 'exhaust-damper';
        const edge = component.side > 0 ? cy + (spans ? component.y1 : component.y + h / 2) : cy + (spans ? component.y0 : component.y - h / 2);
        // A damper's motor actuator sits on its label side (the other side faces the next lane), so its tag starts past it.
        const actuator = damper && !(section.kind === 'exhaust-damper' && section.ducted === false) ? h * 0.47 : 0;
        const tagY = edge + component.side * (t * 1.25 + actuator);
        const flow = section.kind === 'supply-fan' || section.kind === 'relief-fan' || damper ? section.flowM3s ?? null : null;
        return (
          <g key={section.id} data-hit="unit-section" data-id={item.id} data-section={section.id}>
            <title>{sectionSummary(section)}</title>
            <rect x={px - hitW / 2} y={hitY0} width={hitW} height={hitY1 - hitY0} fill={ink(selected ? SELECT_FILL : 'transparent')} stroke={ink(selected ? SELECT : 'none')} strokeWidth={selected ? 1.6 : 0} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            <ComponentSymbol component={component} px={px} py={py} h={h} length={along} color={ink(color)} piped={piped} />
            {/* Coil piping: supply and return stubs from the coil to the casing, valves just outside. */}
            {/* Refrigerant lines from a DX coil to the condenser. */}
            {refrigerant && (
              <g pointerEvents="none">
                {[-1, 1].map(k => (
                  <line key={k} x1={px + k * along * 0.25} y1={py - h / 2} x2={px + k * along * 0.25} y2={cy + condenser.y1} stroke={ink(color)} strokeWidth={1} strokeDasharray={k > 0 ? '3 2' : undefined} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}
            {coil && !refrigerant && (piped || valves.length > 0) && (
              <g pointerEvents="none">
                {[-1, 1].map(k => (
                  <line key={k} x1={px + k * along * 0.25} y1={py - h / 2} x2={px + k * along * 0.25} y2={cy - width / 2} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}
            {valves.map((valve, index) => {
              const vx = px + (index - (valves.length - 1) / 2) * valveSize * 3.2;
              const vy = cy - width / 2 - valveSize * 2.2;
              return (
                <g key={valve.id}>
                  <title>{`${valve.tag} · ${VALVE_LABEL[valve.kind]}`}</title>
                  <line x1={vx} y1={cy - width / 2} x2={vx} y2={vy - valveSize * 2} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <Valve x={vx} y={vy} size={valveSize} kind={valve.kind} color={ink(color)} />
                  {readable && tagBox(vx - valveSize * 2.2, vy, valve.tag || 'V', t * 0.85, color)}
                </g>
              );
            })}
            {readable && (block ? tagBox(cx + block.x0 + t * 1.6, cy + component.y1 - t * 1.1, SECTION_TAG[section.kind], t, color) : tagBox(px, tagY, SECTION_TAG[section.kind], t, color))}
            {fine &&
              block &&
              (() => {
                const note = `${block.fans.length} condenser fan${block.fans.length === 1 ? '' : 's'} · discharge up`;
                return text(cx + block.x0 + t * 3.2 + note.length * t * 0.8 * 0.29, cy + component.y1 - t * 1.5, note, t * 0.8, color, 500);
              })()}
            {fine && damper && text(px + t * 2.3, tagY, section.position ?? 'NC', t * 0.85, color, 500)}
            {fine && flow != null && text(px, tagY + component.side * t * 1.45, formatFlow(flow, units), t * 0.8, color, 500)}
          </g>
        );
      })}
      {/* Duct sensors: a probe through the wall just after their section, tag outside the duct. */}
      {sensors.map(point => {
        if (point.location.kind !== 'station') return null;
        const sectionId = point.location.sectionId;
        const component = layout.components.find(entry => entry.section.id === sectionId);
        if (!component) return null;
        const siblings = sensors.filter(entry => entry.location.kind === 'station' && entry.location.sectionId === sectionId);
        const index = siblings.indexOf(point);
        const active = point.id === selectedPointId;
        const color = active ? SELECT : '#4a5560';
        const side = component.side;
        const x = cx + component.x + component.dir * (layout.pitchM * 0.46 + index * Math.max(t * 2.6, layout.pitchM * 0.18));
        const wall = cy + component.y + side * (h / 2);
        const tip = cy + component.y + side * (h * 0.05);
        // ISA-5.1: field-mounted transmitter bubble outside the duct, sensing line through the wall.
        const r = t * 1.15;
        // Own row, beyond the section tag and its airflow, so bubbles never sit on that text.
        const tagY = wall + side * (t * 3.5 + r);
        return (
          <g
            key={point.id}
            data-hit="sensor"
            data-id={point.id}
            onClick={event => {
              event.stopPropagation();
              if (tool.kind !== 'select') return;
              onSelect({ kind: 'point', id: point.id });
            }}
          >
            <title>{`${point.tag} · ${SENSOR_LABEL[point.sensor]}`}</title>
            <line x1={x} y1={tip} x2={x} y2={tagY - side * r} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={x} cy={tip} r={h * 0.025} fill={ink(color)} />
            {readable ? <InstrumentBubble x={x} y={tagY} r={r} sensor={point.sensor} tag={point.tag} color={ink(color)} yaw={item.yawDeg} /> : <circle cx={x} cy={tagY} r={r} fill={PLAN_COLOR.halo} stroke={ink(color)} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            {/* Larger pick target than the probe itself. */}
            <rect x={x - t * 1.4} y={Math.min(tip, tagY) - t} width={t * 2.8} height={Math.abs(tagY - tip) + t * 2} fill="transparent" />
          </g>
        );
      })}
    </g>
  );
}
