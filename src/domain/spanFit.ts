import type { Room, WallFace } from './types';

/** A run that must stay on one wall. Openings use this. Later wall-mounted items can too. */
export interface SpanItem {
  id: string;
  offsetM: number;
  widthM: number;
}

const MIN_ROOM_M = 0.4;
const EPS = 1e-4;

function round3(value: number): number {
  return Number(value.toFixed(3));
}

export function requiredSpan(items: readonly SpanItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.widthM), 0);
}

/** Slide items so each lies fully on the span, in order, without overlapping. Null when they cannot fit. */
export function placeOnSpan(items: readonly SpanItem[], spanM: number): SpanItem[] | null {
  if (items.length === 0) return [];
  const span = Math.max(0, spanM);
  const placed = [...items]
    .map(item => ({ ...item, widthM: Math.max(0, item.widthM) }))
    .sort((a, b) => a.offsetM - b.offsetM || a.id.localeCompare(b.id));
  if (requiredSpan(placed) > span + EPS) return null;
  let cursor = 0;
  for (const item of placed) {
    item.offsetM = Math.max(cursor, Math.min(item.offsetM, span - item.widthM));
    cursor = item.offsetM + item.widthM;
  }
  if (cursor > span + EPS) {
    let end = span;
    for (let index = placed.length - 1; index >= 0; index -= 1) {
      placed[index].offsetM = Math.min(placed[index].offsetM, end - placed[index].widthM);
      end = placed[index].offsetM;
    }
  }
  return placed.map(item => ({ ...item, offsetM: round3(Math.max(0, item.offsetM)) }));
}

/** Nearest offset for one item that stays on the span and clear of the others. */
export function placeBeside(preferredM: number, widthM: number, spanM: number, obstacles: readonly SpanItem[]): number | null {
  const width = Math.max(0, widthM);
  const span = Math.max(0, spanM);
  if (width > span + EPS) return null;
  const blocks = [...obstacles].sort((a, b) => a.offsetM - b.offsetM);
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const block of blocks) {
    const start = Math.min(span, Math.max(0, block.offsetM));
    const end = Math.min(span, Math.max(start, block.offsetM + Math.max(0, block.widthM)));
    if (start - cursor >= width - EPS) gaps.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (span - cursor >= width - EPS) gaps.push({ start: cursor, end: span });
  let best: number | null = null;
  let bestDist = Infinity;
  for (const gap of gaps) {
    const start = Math.min(Math.max(preferredM, gap.start), gap.end - width);
    const dist = Math.abs(start - preferredM);
    if (dist < bestDist - EPS) {
      best = start;
      bestDist = dist;
    }
  }
  return best === null ? null : round3(best);
}

function axisOf(face: WallFace): 'x' | 'y' {
  return face === 'px' || face === 'nx' ? 'x' : 'y';
}

function facesOn(axis: 'x' | 'y'): readonly WallFace[] {
  return axis === 'x' ? ['py', 'ny'] : ['px', 'nx'];
}

export function openingsRequiredSpan(room: Room, axis: 'x' | 'y'): number {
  let min = MIN_ROOM_M;
  for (const face of facesOn(axis)) {
    min = Math.max(min, requiredSpan(room.openings.filter(opening => opening.face === face)));
  }
  return min;
}

function fitAxis(room: Room, axis: 'x' | 'y', originDelta: number): Room {
  const span = axis === 'x' ? room.lengthM : room.widthM;
  let openings = room.openings.map(opening => {
    const along = facesOn(axis).includes(opening.face);
    return along ? { ...opening, offsetM: opening.offsetM - originDelta } : opening;
  });
  for (const face of facesOn(axis)) {
    const placed = placeOnSpan(
      openings.filter(opening => opening.face === face),
      span,
    );
    if (!placed) continue;
    const offsets = new Map(placed.map(item => [item.id, item.offsetM]));
    openings = openings.map(opening => {
      const offsetM = offsets.get(opening.id);
      return offsetM === undefined ? opening : { ...opening, offsetM };
    });
  }
  if (openings.every((opening, index) => opening.offsetM === room.openings[index].offsetM)) return room;
  return { ...room, openings };
}

/** Move one wall. Openings on the resized span slide so they stay on the wall. The span will not shrink below what they need. */
export function moveRoomEdge(room: Room, face: WallFace, edge: number): Room {
  const axis = axisOf(face);
  const minSpan = openingsRequiredSpan(room, axis);
  if (face === 'px') return fitAxis({ ...room, lengthM: round3(Math.max(minSpan, edge - room.xM)) }, 'x', 0);
  if (face === 'nx') {
    const right = room.xM + room.lengthM;
    const xM = round3(Math.min(edge, right - minSpan));
    return fitAxis({ ...room, xM, lengthM: round3(right - xM) }, 'x', xM - room.xM);
  }
  if (face === 'py') return fitAxis({ ...room, widthM: round3(Math.max(minSpan, edge - room.yM)) }, 'y', 0);
  const top = room.yM + room.widthM;
  const yM = round3(Math.min(edge, top - minSpan));
  return fitAxis({ ...room, yM, widthM: round3(top - yM) }, 'y', yM - room.yM);
}

/** Keep a shared edge where every room can still hold its doors and windows. */
export function clampSharedEdge(entries: readonly { room: Room; face: WallFace }[], edge: number): number {
  if (entries.length === 0) return edge;
  let low = -Infinity;
  let high = Infinity;
  for (const { room, face } of entries) {
    const minSpan = openingsRequiredSpan(room, axisOf(face));
    if (face === 'px') low = Math.max(low, room.xM + minSpan);
    else if (face === 'nx') high = Math.min(high, room.xM + room.lengthM - minSpan);
    else if (face === 'py') low = Math.max(low, room.yM + minSpan);
    else high = Math.min(high, room.yM + room.widthM - minSpan);
  }
  if (!(low <= high)) {
    const first = entries[0];
    if (first.face === 'px') return first.room.xM + first.room.lengthM;
    if (first.face === 'nx') return first.room.xM;
    if (first.face === 'py') return first.room.yM + first.room.widthM;
    return first.room.yM;
  }
  return Math.min(high, Math.max(low, edge));
}

/** Change a room's length or width from the inspector. The minimum corner stays put. */
export function resizeSpan(room: Room, axis: 'x' | 'y', spanM: number): Room {
  const span = round3(Math.max(openingsRequiredSpan(room, axis), spanM));
  return fitAxis(axis === 'x' ? { ...room, lengthM: span } : { ...room, widthM: span }, axis, 0);
}

export function slideOpeningOffset(room: Room, openingId: string, offsetM: number): number {
  const opening = room.openings.find(item => item.id === openingId);
  if (!opening) return offsetM;
  const span = opening.face === 'px' || opening.face === 'nx' ? room.widthM : room.lengthM;
  const obstacles = room.openings.filter(item => item.id !== openingId && item.face === opening.face);
  return placeBeside(offsetM, opening.widthM, span, obstacles) ?? opening.offsetM;
}

/** Move one opening, or a shared pair, to the same world position if both walls can hold it. */
export function slideOpeningsTogether(
  rooms: readonly Room[],
  moves: readonly { roomId: string; openingId: string }[],
  worldStart: number,
): Room[] {
  const located = moves.flatMap(move => {
    const room = rooms.find(item => item.id === move.roomId);
    const opening = room?.openings.find(item => item.id === move.openingId);
    if (!room || !opening) return [];
    const origin = opening.face === 'px' || opening.face === 'nx' ? room.yM : room.xM;
    return [{ room, opening, origin }];
  });
  if (located.length === 0) return [...rooms];
  let chosen = worldStart;
  for (let pass = 0; pass < located.length + 1; pass += 1) {
    for (const item of located) chosen = item.origin + slideOpeningOffset(item.room, item.opening.id, chosen - item.origin);
  }
  const fits = located.every(item => Math.abs(slideOpeningOffset(item.room, item.opening.id, chosen - item.origin) - round3(chosen - item.origin)) < 0.002);
  if (!fits) return [...rooms];
  return rooms.map(room => {
    const item = located.find(entry => entry.room.id === room.id);
    if (!item) return room;
    const offsetM = round3(chosen - item.origin);
    if (offsetM === item.opening.offsetM) return room;
    return { ...room, openings: room.openings.map(opening => (opening.id === item.opening.id ? { ...opening, offsetM } : opening)) };
  });
}
