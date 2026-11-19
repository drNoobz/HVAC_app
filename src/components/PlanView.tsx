'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { getProduct } from '@/domain/catalog';
import type { EditorTool, Opening, PlacedEquipment, Project, Room, Selection, WallFace, WallRun } from '@/domain/types';
import { locateOpening, NO_WALL_RUNS, outlineCentroid, outlineRoomOk, polygonArea, roomLoop, runGeom, runOpeningEnds, snapDrawPoint, wallAngleDeg, wallQuad, wallQuads, type DrawPoint, type OpeningSpot, type WallSnap } from '@/domain/wallDraw';
import { METERS_PER_FOOT, formatArea, formatLength, formatNumber, lengthUnit, mToLength } from '@/domain/units';
import { doorArc, doorHinge, doorSwingSide, doorwayKey, openingEnds } from '@/domain/doorSwing';
import { clampSharedEdge, moveRoomEdge, slideOpeningsTogether } from '@/domain/spanFit';
import { INTERFACE_COLOR, MARK_COLOR, WALL_FACE_IDS, edgePortions, facePortions, findInterface, interfaceConstructionColor, interfaceTargets, northDegrees, roomFill, snapDrawnRect, snapPointToWalls, snapSpaceDelta, snapWallEdge, touchingRooms, wallColor, type WallPortion } from '@/domain/walls';

const SNAP_M = 0.05;
const DRAG_PX = 5;
const MIN_DRAW_M = 0.4;
const PAPER = '#f4f4f2';
const INK = '#2a2e32';
const DIM = '#0e6e66';
const SELECT = '#f6ad55';
const SELECT_FILL = 'rgba(246,173,85,0.28)';
const HAIR = 1.15;
const SYSTEM_COLORS = ['#1f4e5f', '#8a3d2f', '#245c3a', '#3d4a8a', '#8a5a12', '#6b3d6e'];

type WallRole = 'hatch' | 'service' | 'partition' | 'panel' | 'glass' | 'none';

function graphicWall(constructionId: string | null | undefined): { role: WallRole; thickness: number } {
  if (constructionId === 'asm-wall-dining') return { role: 'hatch', thickness: 0.24 };
  if (constructionId === 'asm-wall-kitchen') return { role: 'service', thickness: 0.24 };
  if (constructionId === 'asm-wall-walkin' || constructionId === 'asm-wall-walkin-freezer') return { role: 'panel', thickness: 0.18 };
  if (constructionId === 'asm-wall-glass') return { role: 'glass', thickness: 0.1 };
  if (!constructionId) return { role: 'none', thickness: 0.1 };
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

function clampSpan(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
}

function dragReadoutPoint(face: WallFace, edge: number, along: number, inset: number): { x: number; y: number } {
  if (face === 'px') return { x: edge - inset, y: along };
  if (face === 'nx') return { x: edge + inset, y: along };
  if (face === 'py') return { x: along, y: edge - inset };
  return { x: along, y: edge + inset };
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
      <svg viewBox="0 0 80 80" aria-hidden="true" shapeRendering="geometricPrecision">
        <g transform={`rotate(${shown} 40 40)`}>
          <circle cx="40" cy="40" r="31" fill="none" stroke="#1c1f22" strokeWidth="1.25" />
          <text x="40" y="24" textAnchor="middle" fontSize="13" fontWeight="650" fill="#1c1f22" fontFamily='"IBM Plex Sans", "Segoe UI", sans-serif'>N</text>
          <polygon points="40,28 45.5,40 40,37" fill="#1c1f22" />
          <polygon points="40,28 34.5,40 40,37" fill="#5e686c" />
          <polygon points="40,52 45.5,40 40,43" fill="#f4f4f2" stroke="#1c1f22" strokeWidth="1.15" strokeLinejoin="round" />
          <polygon points="40,52 34.5,40 40,43" fill="#f4f4f2" stroke="#1c1f22" strokeWidth="1.15" strokeLinejoin="round" />
          <path d="M12 40 H20 M60 40 H68" fill="none" stroke="#1c1f22" strokeWidth="1.25" />
          <circle cx="40" cy="40" r="1.6" fill="#1c1f22" />
        </g>
      </svg>
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

export function PlanView({
  project,
  selection,
  tool,
  fitToken,
  onSelect,
  onDrawRoom,
  onDrawWalls,
  onCloseSpace,
  onPlaceOpening,
  onPlace,
  onContextMenu,
  onRoomsChange,
  onMoveSpace,
  onNorthChange,
  sheet,
}: {
  project: Project;
  selection: Selection;
  tool: EditorTool;
  fitToken: number;
  onSelect: (selection: Selection) => void;
  onDrawRoom: (rect: { xM: number; yM: number; lengthM: number; widthM: number }) => void;
  onDrawWalls: (lines: { x0: number; y0: number; x1: number; y1: number }[]) => void;
  onCloseSpace: (points: DrawPoint[]) => void;
  onPlaceOpening: (spot: OpeningSpot, kind: 'door' | 'window') => void;
  onPlace: (point: { xM: number; yM: number }) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
  onRoomsChange: (rooms: Room[]) => void;
  onMoveSpace: (roomId: string, dx: number, dy: number) => void;
  onNorthChange: (deg: number) => void;
  sheet: 'all' | 'spaces' | 'systems';
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewBox>(() => bounds(project.rooms));
  const viewRef = useRef(view);
  viewRef.current = view;
  const [pxPerM, setPxPerM] = useState(40);
  const [draft, setDraft] = useState<{ xM: number; yM: number; lengthM: number; widthM: number } | null>(null);
  const [chain, setChain] = useState<DrawPoint[] | null>(null);
  const [aim, setAim] = useState<WallSnap | null>(null);
  const [spot, setSpot] = useState<OpeningSpot | null>(null);
  const [preview, setPreview] = useState<Room[] | null>(null);
  const [gesture, setGesture] = useState<
    | { kind: 'wall' | 'opening'; roomId: string; face: WallFace; openingId?: string }
    | { kind: 'space'; roomId: string }
    | null
  >(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const previewRef = useRef<Room[] | null>(null);
  const chainRef = useRef<DrawPoint[] | null>(null);
  const commitWalls = useRef(onDrawWalls);
  commitWalls.current = onDrawWalls;
  const spotRef = useRef<OpeningSpot | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<
    | { kind: 'pan' | 'draw' | 'place' | 'stamp'; x: number; y: number; pointerX: number; pointerY: number; view: ViewBox }
    | { kind: 'wall'; edges: { id: string; face: WallFace }[]; base: Room[]; pointerX: number; pointerY: number; view: ViewBox; face: WallFace; armed: boolean; interfaceKey?: string }
    | { kind: 'opening'; moves: { roomId: string; openingId: string }[]; grab: number; base: Room[]; pointerX: number; pointerY: number; view: ViewBox; face: WallFace; armed: boolean }
    | { kind: 'space'; id: string; base: Room[]; grabX: number; grabY: number; pointerX: number; pointerY: number; view: ViewBox; armed: boolean }
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
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0) setPxPerM(rect.width / view.w);
  }, [view]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const current = viewRef.current;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setPxPerM(rect.width / current.w);
      const covered = coverView(current, rect.width / rect.height);
      if (covered !== current) setView(covered);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const current = viewRef.current;
      let dy = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= rect.height;
      // Trackpad sends many small pixel deltas; mouse wheel sends larger jumps.
      // Scale by magnitude so Mac two-finger zoom stays smooth instead of ±12% per tick.
      const intensity = event.ctrlKey || event.metaKey ? 0.01 : 0.0016;
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
  const rooms = preview ?? project.rooms;
  const showSpaces = sheet !== 'systems';
  const showSystems = sheet !== 'spaces';
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
  const gestureRoom = gesture ? rooms.find(room => room.id === gesture.roomId) : undefined;
  const measuredRoom = gestureRoom ?? dimRoom;
  const measuredFace = gesture?.kind === 'wall' ? gesture.face : selectedWall;
  const measuredOpening = gesture?.kind === 'opening'
    ? gestureRoom?.openings.find(opening => opening.id === gesture.openingId)
    : undefined;
  const openHitMenu = (event: ReactMouseEvent, next: Selection) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(next, event.clientX, event.clientY);
  };
  const scale = niceScale(pxPerM, project.units);
  const font = Math.max(12 / Math.max(pxPerM, 1), 0.18);
  const drawnDoorways = new Set<string>();
  const showSwing = (room: Room, opening: Opening) => {
    if (opening.kind !== 'door') return false;
    const key = doorwayKey(room, opening);
    if (drawnDoorways.has(key)) return false;
    drawnDoorways.add(key);
    return true;
  };

  return (
    <div className={['plan-wrap', tool.kind === 'draw' ? 'is-draw' : '', tool.kind === 'place' ? 'is-place' : '', tool.kind === 'select' ? 'is-select' : '', tool.kind === 'wall' ? 'is-wall' : '', tool.kind === 'door' || tool.kind === 'window' ? 'is-opening-tool' : '', gesture ? 'is-dragging' : ''].filter(Boolean).join(' ')}>
      <div className="plan-sheet">
      <svg
        ref={svgRef}
        viewBox={`${view.minX} ${-(view.minY + view.h)} ${view.w} ${view.h}`}
        style={{ fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif' }}
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
          if (tool.kind === 'place') {
            drag.current = { kind: 'place', x: point.xM, y: point.yM, pointerX: event.clientX, pointerY: event.clientY, view };
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
          if (tool.kind === 'door' || tool.kind === 'window') {
            drag.current = { kind: 'stamp', x: point.xM, y: point.yM, pointerX: event.clientX, pointerY: event.clientY, view };
            showSpot(locateOpening(project.rooms, wallRuns, point, tool.kind));
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          const target = event.target as Element;
          const hit = target.closest('[data-hit]');
          if (tool.kind === 'select' && hit) {
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
          if (hit) return;
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
              const vertical = current.face === 'px' || current.face === 'nx';
              const along = clampSpan(vertical ? point.yM : point.xM, vertical ? after.yM : after.xM, vertical ? after.yM + after.widthM : after.xM + after.lengthM);
              const pos = dragReadoutPoint(current.face, edgeValue(after, current.face), along, Math.max(0.45, font * 2.2));
              const shown = quantizeMeters(edgeValue(after, current.face) - edgeValue(before, current.face), dragUnitStep(pxPerM, project.units), project.units);
              setReadout({ ...pos, text: formatDelta(shown, project.units) });
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
            if (before && after && afterRoom) {
              const vertical = current.face === 'px' || current.face === 'nx';
              const along = clampSpan(vertical ? point.yM : point.xM, vertical ? afterRoom.yM : afterRoom.xM, vertical ? afterRoom.yM + afterRoom.widthM : afterRoom.xM + afterRoom.lengthM);
              const pos = dragReadoutPoint(current.face, edgeValue(afterRoom, current.face), along, Math.max(0.45, font * 2.2));
              const shown = quantizeMeters(after.offsetM - before.offsetM, dragUnitStep(pxPerM, project.units), project.units);
              setReadout({ ...pos, text: formatDelta(shown, project.units) });
            }
          }
        }}
        onPointerCancel={() => {
          document.documentElement.style.userSelect = '';
          drag.current = null;
          showLive(null);
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
            onPlace({ xM: snap(point.xM), yM: snap(point.yM) });
            return;
          }
          if (current.kind === 'pan') {
            if (moved < DRAG_PX && tool.kind === 'select') onSelect({ kind: 'project' });
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
          {rooms.map(room => {
            const shaped = (room.outline?.length ?? 0) >= 3;
            const fill = showSpaces ? (room.id === highlightedRoom?.id ? SELECT_FILL : roomFill(room.use)) : 'none';
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
                fill={fill}
                stroke={stroke}
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
                fill={fill}
                stroke={stroke}
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
                  <rect {...gap} fill={roomFill(room.use)} />
                  {showSwing(room, opening) && (
                    <g fill="none" stroke={active ? SELECT : MARK_COLOR.door} strokeWidth={active ? 2.25 : HAIR}>
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
          {showSpaces && rooms.map(room => {
            const shaped = (room.outline?.length ?? 0) >= 3;
            const center = shaped ? outlineCentroid(room.outline ?? []) : { x: room.xM + room.lengthM / 2, y: room.yM + room.widthM / 2 };
            const area = shaped ? polygonArea(room.outline ?? []) : room.lengthM * room.widthM;
            return (
              <g key={`${room.id}-label`} transform={`translate(${center.x} ${center.y}) scale(1,-1)`} pointerEvents="none">
                <text textAnchor="middle" fontSize={font} fontWeight={500} fill={INK}>
                  {room.name}
                </text>
                <text textAnchor="middle" y={font * 1.4} fontSize={font * 0.68} fill="#5e6368">
                  {shaped
                    ? formatArea(area, project.units)
                    : `${formatArea(area, project.units)} · ${formatNumber(mToLength(room.lengthM, project.units), 2)} × ${formatNumber(mToLength(room.widthM, project.units), 2)} ${lengthUnit(project.units)}`}
                </text>
              </g>
            );
          })}
          {showSystems && <SystemLinks project={project} />}
          {project.equipment.filter(item => {
            if (showSystems) return true;
            const mount = getProduct(item.catalogId)?.mount;
            return mount !== 'ceiling' && mount !== 'roof';
          }).map(item => {
            const before = gesture?.kind === 'space' ? project.rooms.find(room => room.id === item.roomId) : undefined;
            const after = before ? rooms.find(room => room.id === before.id) : undefined;
            const placed = before && after ? { ...item, xM: item.xM + (after.xM - before.xM), yM: item.yM + (after.yM - before.yM) } : item;
            const systemIndex = placed.systemId ? project.systems.findIndex(system => system.id === placed.systemId) : -1;
            const system = systemIndex >= 0 ? project.systems[systemIndex] : undefined;
            return (
              <EquipmentMark
                key={item.id}
                item={placed}
                active={selection.kind === 'equipment' && selection.id === item.id}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                tool={tool}
                fontM={font}
                systemName={showSystems ? system?.name : undefined}
                color={showSystems && system ? SYSTEM_COLORS[systemIndex % SYSTEM_COLORS.length] : undefined}
              />
            );
          })}
          {draft && (
            <rect x={draft.xM} y={draft.yM} width={draft.lengthM} height={draft.widthM} fill="rgba(14,110,102,0.08)" stroke={DIM} strokeWidth={HAIR} vectorEffect="non-scaling-stroke" />
          )}
          {(chain || (aim && tool.kind === 'wall')) && <ChainPreview points={chain ?? []} aim={aim} units={project.units} fontM={font} />}
          {spot && (tool.kind === 'door' || tool.kind === 'window') && <OpeningGhost spot={spot} kind={tool.kind} />}
          {highlightedRoom && ((highlightedRoom.outline?.length ?? 0) >= 3 ? (
            <polygon
              points={highlightedRoom.outline!.map(point => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={SELECT}
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
              stroke={SELECT}
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
                fill={SELECT_FILL}
                stroke={SELECT}
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
                fill={SELECT_FILL}
                stroke={SELECT}
                strokeWidth={2.25}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}
          {showSpaces && dimRoom && selectedWall && (measuredRoom?.outline?.length ?? 0) < 3 && (
            <rect
              {...wallBand(dimRoom, selectedWall, graphicWall(dimRoom.surfaces.walls[selectedWall].constructionId).thickness)}
              fill={SELECT_FILL}
              stroke={SELECT}
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
                fill={SELECT_FILL}
                stroke={SELECT}
                strokeWidth={2.25}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}
          {showSpaces && measuredRoom && gesture?.kind !== 'space' && (measuredRoom.outline?.length ?? 0) < 3 && <RoomDimensions room={measuredRoom} rooms={rooms} units={project.units} fontM={font} wallFace={measuredFace} />}
          {showSpaces && measuredRoom && measuredOpening && <OpeningSlideDimension room={measuredRoom} opening={measuredOpening} units={project.units} fontM={font} />}
          {readout && <DragReadout x={readout.x} y={readout.y} text={readout.text} fontM={font} />}
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
      </div>
      {showSpaces && (
      <div className="plan-foot">
      <div className="plan-legend">
            <div><i className="swatch" style={{ background: wallColor('asm-wall-dining') }} />Exterior</div>
            <div><i className="swatch" style={{ background: wallColor('asm-wall-kitchen') }} />Service</div>
            <div><i className="swatch" style={{ background: wallColor('asm-wall-partition') }} />Partition</div>
            <div><i className="swatch" style={{ background: wallColor('asm-wall-walkin') }} />Walk-in</div>
            <div><i className="swatch" style={{ background: wallColor('asm-wall-glass') }} />Glass</div>
            <div><i className="swatch" style={{ background: INTERFACE_COLOR }} />Interface</div>
            <div><i className="swatch" style={{ background: wallColor(null) }} />No construction</div>
      </div>
      </div>
      )}
    </div>
  );
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
    <g pointerEvents="none" stroke={DIM} strokeWidth={HAIR}>
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
  const maskW = Math.max(fontM * 2.2, fontM * 0.58 * label.length);
  const vertical = Math.abs(dy) > Math.abs(dx);
  return (
    <g stroke={DIM} strokeWidth={HAIR}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} vectorEffect="non-scaling-stroke" />
      <line x1={x2 - nx} y1={y2 - ny} x2={x2 + nx} y2={y2 + ny} vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${midX} ${midY}) scale(1,-1)${vertical ? ' rotate(-90)' : ''}`}>
        <rect x={-maskW / 2} y={-fontM * 0.55} width={maskW} height={fontM * 1.1} fill={PAPER} stroke="none" />
        <text textAnchor="middle" dominantBaseline="middle" fontSize={fontM * 0.85} fill={DIM} stroke="none">
          {label}
        </text>
      </g>
    </g>
  );
}

function equipmentLabel(catalogId: string): { name: string; roof: boolean } {
  const product = getProduct(catalogId);
  const roof = product?.mount === 'roof';
  if (product?.category === 'kitchen-hood') return { name: 'Hood', roof };
  if (product?.category === 'makeup-air') return { name: 'MAU', roof };
  if (product?.category === 'energy-recovery') return { name: 'ERV', roof };
  if (product?.category === 'heating-cooling') return { name: roof ? 'RTU' : 'CU', roof };
  if (product?.category === 'exhaust-fan' || product?.category === 'bathroom-exhaust') return { name: 'Fan', roof };
  return { name: 'Unit', roof };
}

function SystemLinks({ project }: { project: Project }) {
  return (
    <g pointerEvents="none" fill="none" strokeWidth={HAIR} vectorEffect="non-scaling-stroke">
      {project.systems.map((system, index) => {
        const members = project.equipment.filter(item => item.systemId === system.id);
        if (members.length < 2) return null;
        const ordered = [...members].sort((a, b) => a.xM - b.xM || a.yM - b.yM);
        const color = SYSTEM_COLORS[index % SYSTEM_COLORS.length];
        return <polyline key={system.id} points={ordered.map(item => `${item.xM},${item.yM}`).join(' ')} stroke={color} vectorEffect="non-scaling-stroke" />;
      })}
    </g>
  );
}

function EquipmentMark({
  item,
  active,
  tool,
  fontM,
  systemName,
  color,
  onSelect,
  onContextMenu,
}: {
  item: PlacedEquipment;
  active: boolean;
  tool: EditorTool;
  fontM: number;
  systemName?: string;
  color?: string;
  onSelect: (selection: Selection) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}) {
  const product = getProduct(item.catalogId);
  const length = product?.dimensions?.lengthM ?? 0.6;
  const width = product?.dimensions?.widthM ?? 0.6;
  const { name, roof } = equipmentLabel(item.catalogId);
  const label = item.quantity > 1 ? `${name} ×${item.quantity}` : name;
  const stroke = color ?? MARK_COLOR.equipment;
  const chipW = Math.max(fontM * 1.7, fontM * 0.56 * Math.max(label.length, systemName?.length ?? 0));
  const chipH = systemName ? fontM * 1.7 : fontM * 0.95;
  const hitW = Math.max(length, chipW);
  const tail = chipH + fontM * 0.2;
  return (
    <g
      data-hit="equipment"
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
      <title>{product?.name ?? 'Equipment'}</title>
      <rect x={item.xM - hitW / 2} y={item.yM - width / 2 - tail} width={hitW} height={width + tail} fill="transparent" />
      <rect
        x={item.xM - length / 2}
        y={item.yM - width / 2}
        width={length}
        height={width}
        fill={active ? SELECT_FILL : 'none'}
        stroke={active ? SELECT : stroke}
        strokeWidth={active ? 2.25 : HAIR}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={roof ? '0.16 0.1' : undefined}
      />
      <g transform={`translate(${item.xM} ${item.yM}) rotate(${-item.yawDeg}) scale(1,-1)`} pointerEvents="none">
        <g transform={`translate(0 ${width / 2 + chipH / 2 + fontM * 0.12})`}>
          <rect x={-chipW / 2} y={-chipH / 2} width={chipW} height={chipH} fill={PAPER} stroke="none" />
          <text textAnchor="middle" dominantBaseline="middle" y={systemName ? -chipH * 0.18 : 0} fontSize={fontM * 0.62} fill={active ? SELECT : stroke}>
            {label}
          </text>
          {systemName && (
            <text textAnchor="middle" dominantBaseline="middle" y={chipH * 0.28} fontSize={fontM * 0.52} fill={active ? SELECT : stroke}>
              {systemName}
            </text>
          )}
        </g>
      </g>
    </g>
  );
}

function DragReadout({ x, y, text, fontM }: { x: number; y: number; text: string; fontM: number }) {
  const height = fontM * 1.35;
  const width = Math.max(fontM * 3.4, fontM * 0.62 * text.length + fontM);
  return (
    <g transform={`translate(${x} ${y}) scale(1,-1)`} pointerEvents="none">
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2} fill={DIM} />
      <text textAnchor="middle" dominantBaseline="middle" fontSize={fontM * 0.78} fill="#fff" stroke="none" fontWeight={600}>
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
        <line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke={isMajor(x) ? '#d0d0ca' : '#e4e4de'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {horizontal.map(y => (
        <line key={`y${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke={isMajor(y) ? '#d0d0ca' : '#e4e4de'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
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
    return <line {...line} stroke={wallColor(null)} strokeWidth={HAIR} strokeDasharray="0.16 0.1" vectorEffect="non-scaling-stroke" />;
  }
  return <polygon points={wallQuad(line.x1, line.y1, line.x2, line.y2, thickness)} fill={wallColor(constructionId)} fillOpacity={glass ? 0.55 : 1} />;
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
            return <polygon key={`${room.id}-edge-${index}`} points={wallQuad(point.x, point.y, next.x, next.y, graphic.thickness)} fill={wallColor(constructionId)} fillOpacity={graphic.role === 'glass' ? 0.55 : 1} />;
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
          fill={wallColor(item.id)}
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
              stroke={INTERFACE_COLOR}
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
            fill={color}
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
    <g stroke={active ? SELECT : MARK_COLOR.window} strokeWidth={active ? 2.25 : HAIR} fill="none">
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
                fill={selected ? '#d9843f' : '#60707a'}
                stroke={selected ? SELECT : 'none'}
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
                    <g fill="none" stroke={active ? SELECT : MARK_COLOR.door} strokeWidth={active ? 2.25 : HAIR}>
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
    <g pointerEvents="none" fill="none" stroke={color} strokeWidth={2.25}>
      <polygon points={slot} fill="rgba(255,255,255,0.72)" vectorEffect="non-scaling-stroke" />
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
    <g stroke={active ? SELECT : MARK_COLOR.window} strokeWidth={active ? 2.25 : HAIR} fill="none">
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

const GUIDE = '#c43b6a';

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
  const handle = Math.max(fontM * 0.55, 0.12);
  const last = points.length > 0 ? points[points.length - 1] : null;
  return (
    <g pointerEvents="none">
      {points.slice(1).map((point, index) => (
        <polygon key={index} points={wallQuad(points[index].x, points[index].y, point.x, point.y)} fill="rgba(14,110,102,0.16)" stroke={DIM} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ))}
      {aim?.guides.map((guide, index) => {
        const length = Math.hypot(guide.x1 - guide.x0, guide.y1 - guide.y0);
        const midX = (guide.x0 + guide.x1) / 2;
        const midY = (guide.y0 + guide.y1) / 2;
        let textDeg = (Math.atan2(-(guide.y1 - guide.y0), guide.x1 - guide.x0) * 180) / Math.PI;
        if (textDeg > 90 || textDeg < -90) textDeg += 180;
        return (
          <g key={`guide-${index}`}>
            <line x1={guide.x0} y1={guide.y0} x2={guide.x1} y2={guide.y1} stroke={GUIDE} strokeWidth={1.25} strokeDasharray="0.18 0.12" vectorEffect="non-scaling-stroke" />
            {length > 0.2 && (
              <g transform={`translate(${midX} ${midY}) scale(1,-1) rotate(${textDeg})`}>
                <text textAnchor="middle" y={-fontM * 0.55} fontSize={fontM * 0.55} fill={GUIDE} fontWeight={600}>
                  {formatLength(length, units, 1)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {last && aim && <WallDraftCue line={{ x0: last.x, y0: last.y, x1: aim.x, y1: aim.y }} units={units} fontM={fontM} marks={false} />}
      {points.map((point, index) => (
        <rect key={`pt-${index}`} x={point.x - handle / 2} y={point.y - handle / 2} width={handle} height={handle} fill={index === 0 && aim?.close ? GUIDE : '#fff'} stroke={index === 0 && aim?.close ? GUIDE : DIM} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      ))}
      {aim && (
        <circle cx={aim.x} cy={aim.y} r={handle * 0.42} fill={aim.kind === 'grid' ? '#fff' : GUIDE} stroke={aim.close ? GUIDE : DIM} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
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
  const handle = Math.max(fontM * 0.55, 0.12);
  let textDeg = (Math.atan2(-geom.dy, geom.dx) * 180) / Math.PI;
  if (textDeg > 90 || textDeg < -90) textDeg += 180;
  const midX = (geom.x0 + geom.x1) / 2;
  const midY = (geom.y0 + geom.y1) / 2;
  const side = Math.max(0.55, fontM * 1.7);
  return (
    <g pointerEvents="none">
      <polygon points={wallQuad(line.x0, line.y0, line.x1, line.y1)} fill="rgba(14,110,102,0.16)" stroke={DIM} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {marks && [[geom.x0, geom.y0], [geom.x1, geom.y1]].map(([x, y], index) => (
        <rect key={index} x={x - handle / 2} y={y - handle / 2} width={handle} height={handle} fill="#fff" stroke={DIM} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      ))}
      <g transform={`translate(${midX} ${midY}) scale(1,-1) rotate(${textDeg})`}>
        <text textAnchor="middle" y={-fontM * 0.85} fontSize={fontM * 0.62} fill={DIM} fontWeight={600}>
          {length}
        </text>
      </g>
      <DragReadout x={midX + geom.nx * side} y={midY + geom.ny * side} text={badge} fontM={fontM * 0.92} />
    </g>
  );
}
