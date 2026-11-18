'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { getProduct } from '@/domain/catalog';
import type { EditorTool, Opening, PlacedEquipment, Project, Room, Selection, WallFace } from '@/domain/types';
import { METERS_PER_FOOT, formatArea, formatLength, formatNumber, lengthUnit, mToLength } from '@/domain/units';
import { clampSharedEdge, moveRoomEdge, slideOpeningsTogether } from '@/domain/spanFit';
import { MARK_COLOR, WALL_FACE_IDS, roomFill, touchingRooms, wallColor } from '@/domain/walls';

const SNAP_M = 0.05;
const MIN_DRAW_M = 0.4;
const PAPER = '#f4f4f2';
const INK = '#2a2e32';
const DIM = '#0e6e66';
const SELECT = '#f6ad55';
const SELECT_FILL = 'rgba(246,173,85,0.28)';
const HAIR = 1.15;

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

function bounds(rooms: readonly Room[]): ViewBox {
  if (rooms.length === 0) return { minX: -1, minY: -1, w: 14, h: 10 };
  const pad = 3.6;
  const minX = Math.min(...rooms.map(room => room.xM)) - pad;
  const minY = Math.min(...rooms.map(room => room.yM)) - pad;
  const maxX = Math.max(...rooms.map(room => room.xM + room.lengthM)) + pad;
  const maxY = Math.max(...rooms.map(room => room.yM + room.widthM)) + pad;
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

function openingEnds(room: Room, opening: Opening): { x0: number; y0: number; x1: number; y1: number } {
  if (opening.face === 'px' || opening.face === 'nx') {
    const x = opening.face === 'px' ? room.xM + room.lengthM : room.xM;
    return { x0: x, y0: room.yM + opening.offsetM, x1: x, y1: room.yM + opening.offsetM + opening.widthM };
  }
  const y = opening.face === 'py' ? room.yM + room.widthM : room.yM;
  return { x0: room.xM + opening.offsetM, y0: y, x1: room.xM + opening.offsetM + opening.widthM, y1: y };
}

function doorwayKey(room: Room, opening: Opening): string {
  const ends = openingEnds(room, opening);
  const q = (value: number) => Math.round(value / 0.02);
  const x0 = Math.min(q(ends.x0), q(ends.x1));
  const y0 = Math.min(q(ends.y0), q(ends.y1));
  const x1 = Math.max(q(ends.x0), q(ends.x1));
  const y1 = Math.max(q(ends.y0), q(ends.y1));
  return `${x0}:${y0}:${x1}:${y1}`;
}

function doorSwing(face: WallFace): { from: number; to: number } {
  if (face === 'px') return { from: Math.PI / 2, to: Math.PI };
  if (face === 'nx') return { from: Math.PI / 2, to: 0 };
  if (face === 'py') return { from: 0, to: -Math.PI / 2 };
  return { from: 0, to: Math.PI / 2 };
}

function inward(face: WallFace): [number, number] {
  if (face === 'px') return [-1, 0];
  if (face === 'nx') return [1, 0];
  if (face === 'py') return [0, -1];
  return [0, 1];
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
  onPlace,
  onContextMenu,
  onRoomsChange,
}: {
  project: Project;
  selection: Selection;
  tool: EditorTool;
  fitToken: number;
  onSelect: (selection: Selection) => void;
  onDrawRoom: (rect: { xM: number; yM: number; lengthM: number; widthM: number }) => void;
  onPlace: (point: { xM: number; yM: number }) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
  onRoomsChange: (rooms: Room[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewBox>(() => bounds(project.rooms));
  const [pxPerM, setPxPerM] = useState(40);
  const [draft, setDraft] = useState<{ xM: number; yM: number; lengthM: number; widthM: number } | null>(null);
  const [preview, setPreview] = useState<Room[] | null>(null);
  const [gesture, setGesture] = useState<{ kind: 'wall' | 'opening'; roomId: string; face: WallFace; openingId?: string } | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const previewRef = useRef<Room[] | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<
    | { kind: 'pan' | 'draw' | 'place'; x: number; y: number; pointerX: number; pointerY: number; view: ViewBox }
    | { kind: 'wall'; edges: { id: string; face: WallFace }[]; base: Room[]; pointerX: number; pointerY: number; view: ViewBox; face: WallFace }
    | { kind: 'opening'; moves: { roomId: string; openingId: string }[]; grab: number; base: Room[]; pointerX: number; pointerY: number; view: ViewBox; face: WallFace }
    | null
  >(null);

  useEffect(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    const next = bounds(project.rooms);
    setView(rect && rect.width > 0 && rect.height > 0 ? coverView(next, rect.width / rect.height) : next);
    setDraft(null);
    previewRef.current = null;
    setPreview(null);
    setGesture(null);
    setReadout(null);
  }, [fitToken, project.id]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setPxPerM(rect.width / view.w);
      const covered = coverView(view, rect.width / rect.height);
      if (covered !== view) setView(covered);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const wx = view.minX + px * view.w;
      const wy = view.minY + (1 - py) * view.h;
      let factor = event.deltaY > 0 ? 1.12 : 0.88;
      factor = factor > 1 ? Math.min(factor, 400 / view.w, 400 / view.h) : Math.max(factor, 2 / view.w, 2 / view.h);
      const w = view.w * factor;
      const h = view.h * factor;
      setView({ minX: wx - px * w, minY: wy - (1 - py) * h, w, h });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', onWheel);
    };
  }, [view]);

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
    <div className={`plan-wrap${tool.kind === 'draw' ? ' is-draw' : ''}${tool.kind === 'place' ? ' is-place' : ''}${tool.kind === 'select' ? ' is-select' : ''}${gesture ? ' is-dragging' : ''}`}>
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
            drag.current = { kind: 'draw', x: snap(point.xM), y: snap(point.yM), pointerX: event.clientX, pointerY: event.clientY, view };
            setDraft({ xM: snap(point.xM), yM: snap(point.yM), lengthM: SNAP_M, widthM: SNAP_M });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (tool.kind === 'place') {
            drag.current = { kind: 'place', x: point.xM, y: point.yM, pointerX: event.clientX, pointerY: event.clientY, view };
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
              drag.current = { kind: 'wall', edges: [{ id: room.id, face }, ...partners], base: project.rooms, pointerX: event.clientX, pointerY: event.clientY, view, face };
              setGesture({ kind: 'wall', roomId: room.id, face });
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
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
                };
                setGesture({ kind: 'opening', roomId: room.id, face: opening.face, openingId: opening.id });
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
            }
          }
          if (hit) return;
          drag.current = { kind: 'pan', x: point.xM, y: point.yM, pointerX: event.clientX, pointerY: event.clientY, view };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const current = drag.current;
          if (!current) return;
          if (!window.getSelection()?.isCollapsed) window.getSelection()?.removeAllRanges();
          const point = toWorld(event.clientX, event.clientY);
          if (current.kind === 'pan') {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const dx = ((event.clientX - current.pointerX) / rect.width) * current.view.w;
            const dy = ((event.clientY - current.pointerY) / rect.height) * current.view.h;
            setView({ ...current.view, minX: current.view.minX - dx, minY: current.view.minY + dy });
            return;
          }
          if (current.kind === 'draw') {
            const xM = Math.min(current.x, snap(point.xM));
            const yM = Math.min(current.y, snap(point.yM));
            setDraft({ xM, yM, lengthM: Math.max(Math.abs(snap(point.xM) - current.x), SNAP_M), widthM: Math.max(Math.abs(snap(point.yM) - current.y), SNAP_M) });
            return;
          }
          if (current.kind === 'wall') {
            const raw = current.face === 'px' || current.face === 'nx' ? point.xM : point.yM;
            const next = moveEdges(current.base, current.edges, raw);
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
            const xM = Math.min(current.x, snap(point.xM));
            const yM = Math.min(current.y, snap(point.yM));
            const lengthM = Math.abs(snap(point.xM) - current.x);
            const widthM = Math.abs(snap(point.yM) - current.y);
            setDraft(null);
            if (lengthM >= MIN_DRAW_M && widthM >= MIN_DRAW_M) onDrawRoom({ xM, yM, lengthM, widthM });
            return;
          }
          if (current.kind === 'place' && moved < 6) {
            const point = toWorld(event.clientX, event.clientY);
            onPlace({ xM: snap(point.xM), yM: snap(point.yM) });
            return;
          }
          if (current.kind === 'wall' || current.kind === 'opening') {
            const next = previewRef.current ? settleDrag(current, previewRef.current, pxPerM, project.units) : null;
            showLive(null);
            setGesture(null);
            setReadout(null);
            if (moved > 3) {
              suppressClick.current = true;
              if (current.kind === 'wall') onSelect({ kind: 'surface', roomId: current.edges[0].id, face: 'walls', wallFace: current.face });
              else onSelect({ kind: 'opening', roomId: current.moves[0].roomId, id: current.moves[0].openingId });
            }
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
          {rooms.map(room => (
            <rect
              key={room.id}
              data-hit="room"
              x={room.xM}
              y={room.yM}
              width={room.lengthM}
              height={room.widthM}
              fill={room.id === highlightedRoom?.id ? SELECT_FILL : roomFill(room.use)}
              stroke="none"
              onClick={event => {
                event.stopPropagation();
                if (tool.kind !== 'select') return;
                onSelect({ kind: 'room', id: room.id });
              }}
              onContextMenu={event => openHitMenu(event, { kind: 'room', id: room.id })}
            />
          ))}
          <SheetGrid view={view} pxPerM={pxPerM} />
          <PlanWalls rooms={rooms} />
          {rooms.flatMap(room =>
            room.openings.map(opening => {
              const graphic = graphicWall(room.surfaces.walls[opening.face].constructionId);
              const gap = openingGap(room, opening, graphic.thickness);
              const ends = openingEnds(room, opening);
              const [ix, iy] = inward(opening.face);
              const swing = doorSwing(opening.face);
              const hingeX = ends.x0 + ix * (graphic.thickness / 2);
              const hingeY = ends.y0 + iy * (graphic.thickness / 2);
              const active = selection.kind === 'opening' && (selection.id === opening.id || (opening.kind === 'door' && doorwayKey(room, opening) === selectedDoorway));
              return (
                <g key={opening.id} pointerEvents="none">
                  <rect {...gap} fill={roomFill(room.use)} />
                  {showSwing(room, opening) && (
                    <g fill="none" stroke={active ? SELECT : MARK_COLOR.door} strokeWidth={active ? 2.25 : HAIR}>
                      <line x1={hingeX} y1={hingeY} x2={hingeX + ix * opening.widthM} y2={hingeY + iy * opening.widthM} vectorEffect="non-scaling-stroke" />
                      <polyline points={arcPoints(hingeX, hingeY, opening.widthM, swing.from, swing.to)} vectorEffect="non-scaling-stroke" />
                    </g>
                  )}
                  {opening.kind === 'window' && <WindowMark ends={ends} face={opening.face} active={active} />}
                </g>
              );
            })
          )}
          {rooms.flatMap(room =>
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
          {rooms.flatMap(room =>
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
          {rooms.map(room => (
            <g key={`${room.id}-label`} transform={`translate(${room.xM + room.lengthM / 2} ${room.yM + room.widthM / 2}) scale(1,-1)`} pointerEvents="none">
              <text textAnchor="middle" fontSize={font} fontWeight={500} fill={INK}>
                {room.name}
              </text>
              <text textAnchor="middle" y={font * 1.4} fontSize={font * 0.68} fill="#5e6368">
                {formatArea(room.lengthM * room.widthM, project.units)} · {formatNumber(mToLength(room.lengthM, project.units), 2)} × {formatNumber(mToLength(room.widthM, project.units), 2)} {lengthUnit(project.units)}
              </text>
            </g>
          ))}
          {project.equipment.filter(item => {
            const mount = getProduct(item.catalogId)?.mount;
            return mount !== 'ceiling' && mount !== 'roof';
          }).map(item => (
            <EquipmentMark key={item.id} item={item} active={selection.kind === 'equipment' && selection.id === item.id} onSelect={onSelect} onContextMenu={onContextMenu} tool={tool} fontM={font} />
          ))}
          {draft && (
            <rect x={draft.xM} y={draft.yM} width={draft.lengthM} height={draft.widthM} fill="rgba(14,110,102,0.08)" stroke={DIM} strokeWidth={HAIR} vectorEffect="non-scaling-stroke" />
          )}
          {highlightedRoom && (
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
          )}
          {dimRoom && selectedWall && (
            <rect
              {...wallBand(dimRoom, selectedWall, graphicWall(dimRoom.surfaces.walls[selectedWall].constructionId).thickness)}
              fill={SELECT_FILL}
              stroke={SELECT}
              strokeWidth={2.25}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {selection.kind === 'opening' && (() => {
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
          {measuredRoom && <RoomDimensions room={measuredRoom} rooms={rooms} units={project.units} fontM={font} wallFace={measuredFace} />}
          {measuredRoom && measuredOpening && <OpeningSlideDimension room={measuredRoom} opening={measuredOpening} units={project.units} fontM={font} />}
          {readout && <DragReadout x={readout.x} y={readout.y} text={readout.text} fontM={font} />}
        </g>
      </svg>
      <div className="plan-foot">
      <div className="plan-legend">
        <div><i className="swatch" style={{ background: wallColor('asm-wall-dining') }} />Exterior</div>
        <div><i className="swatch" style={{ background: wallColor('asm-wall-kitchen') }} />Service</div>
        <div><i className="swatch" style={{ background: wallColor('asm-wall-partition') }} />Partition</div>
        <div><i className="swatch" style={{ background: wallColor('asm-wall-walkin') }} />Walk-in</div>
        <div><i className="swatch" style={{ background: wallColor('asm-wall-glass') }} />Glass</div>
        <div><i className="swatch" style={{ background: wallColor(null) }} />No construction</div>
        <p>Door swing is drawn into one room. Scroll to zoom. Drag empty space to pan.</p>
      </div>
      <div className="plan-scale" aria-hidden="true">
        <i style={{ width: Math.min(scale.meters * pxPerM, 160) }} />
        <span>{scale.label}</span>
      </div>
      </div>
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

function EquipmentMark({
  item,
  active,
  tool,
  fontM,
  onSelect,
  onContextMenu,
}: {
  item: PlacedEquipment;
  active: boolean;
  tool: EditorTool;
  fontM: number;
  onSelect: (selection: Selection) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}) {
  const product = getProduct(item.catalogId);
  const length = product?.dimensions?.lengthM ?? 0.6;
  const width = product?.dimensions?.widthM ?? 0.6;
  const { name, roof } = equipmentLabel(item.catalogId);
  const label = item.quantity > 1 ? `${name} ×${item.quantity}` : name;
  const chipW = Math.max(fontM * 1.7, fontM * 0.56 * label.length);
  const chipH = fontM * 0.95;
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
        stroke={active ? SELECT : MARK_COLOR.equipment}
        strokeWidth={active ? 2.25 : HAIR}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={roof ? '0.16 0.1' : undefined}
      />
      <g transform={`translate(${item.xM} ${item.yM}) rotate(${-item.yawDeg}) scale(1,-1)`} pointerEvents="none">
        <g transform={`translate(0 ${width / 2 + chipH / 2 + fontM * 0.12})`}>
          <rect x={-chipW / 2} y={-chipH / 2} width={chipW} height={chipH} fill={PAPER} stroke="none" />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={fontM * 0.68} fill={active ? SELECT : MARK_COLOR.equipment}>
            {label}
          </text>
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

function PlanWalls({ rooms }: { rooms: readonly Room[] }) {
  const faces = rooms.flatMap(room => WALL_FACE_IDS.map(face => ({ room, face, id: room.surfaces.walls[face].constructionId, graphic: graphicWall(room.surfaces.walls[face].constructionId) })));
  return (
    <g pointerEvents="none">
      {faces.filter(item => item.graphic.role !== 'none').map(item => (
        <rect
          key={`${item.room.id}-${item.face}`}
          {...wallBand(item.room, item.face, item.graphic.thickness)}
          fill={wallColor(item.id)}
          fillOpacity={item.graphic.role === 'glass' ? 0.55 : 1}
        />
      ))}
      {faces.filter(item => item.graphic.role === 'none').map(item => {
        const line = wallLine(item.room, item.face);
        return (
          <line
            key={`${item.room.id}-${item.face}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={wallColor(null)}
            strokeWidth={HAIR}
            strokeDasharray="0.16 0.1"
            vectorEffect="non-scaling-stroke"
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
