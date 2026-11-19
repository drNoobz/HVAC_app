import type { Room, WallFace, WallRun, WallRunOpening } from './types';

export const DOOR_WIDTH_M = 0.9;
export const WINDOW_WIDTH_M = 1.2;
export const WALL_THICK_M = 0.15;
const REACH_M = 0.4;
const JOIN_M = 0.3;
const SNAP_M = 0.05;

export const NO_WALL_RUNS: WallRun[] = [];

export function openingWidth(kind: 'door' | 'window'): number {
  return kind === 'door' ? DOOR_WIDTH_M : WINDOW_WIDTH_M;
}

function snap(value: number): number {
  return Math.round(value / SNAP_M) * SNAP_M;
}

export type OpeningSpot = {
  roomId?: string;
  wallId?: string;
  face: WallFace;
  offsetM: number;
  widthM: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  nx?: number;
  ny?: number;
};

export type RunGeom = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  length: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
};

type Seg = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  face: WallFace;
  roomId?: string;
  wallId?: string;
  openings: { offsetM: number; widthM: number }[];
  nx?: number;
  ny?: number;
};

function roomSeg(room: Room, face: WallFace): Seg {
  const openings = room.openings.filter(opening => opening.face === face);
  if (face === 'px') {
    return { x0: room.xM + room.lengthM, y0: room.yM, x1: room.xM + room.lengthM, y1: room.yM + room.widthM, face, roomId: room.id, openings };
  }
  if (face === 'nx') {
    return { x0: room.xM, y0: room.yM, x1: room.xM, y1: room.yM + room.widthM, face, roomId: room.id, openings };
  }
  if (face === 'py') {
    return { x0: room.xM, y0: room.yM + room.widthM, x1: room.xM + room.lengthM, y1: room.yM + room.widthM, face, roomId: room.id, openings };
  }
  return { x0: room.xM, y0: room.yM, x1: room.xM + room.lengthM, y1: room.yM, face: 'ny', roomId: room.id, openings };
}

export function runGeom(run: { x0: number; y0: number; x1: number; y1: number }): RunGeom {
  const dx0 = run.x1 - run.x0;
  const dy0 = run.y1 - run.y0;
  const length = Math.hypot(dx0, dy0);
  const dx = length > 1e-6 ? dx0 / length : 1;
  const dy = length > 1e-6 ? dy0 / length : 0;
  return { x0: run.x0, y0: run.y0, x1: run.x1, y1: run.y1, length, dx, dy, nx: -dy, ny: dx };
}

export function wallAngleDeg(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(Math.round((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI));
}

function faceFromNormal(nx: number, ny: number): WallFace {
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'nx' : 'px';
  return ny >= 0 ? 'ny' : 'py';
}

function overlaps(start: number, width: number, openings: { offsetM: number; widthM: number }[]): boolean {
  return openings.some(opening => start < opening.offsetM + opening.widthM - 0.02 && start + width > opening.offsetM + 0.02);
}

function spotOn(seg: Seg, point: { xM: number; yM: number }, width: number): { dist: number; spot: OpeningSpot } | null {
  const dx0 = seg.x1 - seg.x0;
  const dy0 = seg.y1 - seg.y0;
  const len = Math.hypot(dx0, dy0);
  if (len + 0.001 < width) return null;
  const dx = dx0 / len;
  const dy = dy0 / len;
  const vx = point.xM - seg.x0;
  const vy = point.yM - seg.y0;
  const along = vx * dx + vy * dy;
  const perp = Math.abs(vx * -dy + vy * dx);
  if (perp > REACH_M) return null;
  const max = len - width;
  let start = snap(along - width / 2);
  if (start < 0) start = 0;
  if (start > max) start = max;
  if (overlaps(start, width, seg.openings)) return null;
  return {
    dist: perp,
    spot: {
      roomId: seg.roomId,
      wallId: seg.wallId,
      face: seg.face,
      offsetM: start,
      widthM: width,
      x0: seg.x0 + dx * start,
      y0: seg.y0 + dy * start,
      x1: seg.x0 + dx * (start + width),
      y1: seg.y0 + dy * (start + width),
      ...(seg.nx != null && seg.ny != null ? { nx: seg.nx, ny: seg.ny } : {}),
    },
  };
}

export function locateOpening(
  rooms: readonly Room[],
  runs: readonly WallRun[],
  point: { xM: number; yM: number },
  kind: 'door' | 'window',
): OpeningSpot | null {
  const width = openingWidth(kind);
  const found: { dist: number; spot: OpeningSpot }[] = [];
  for (const room of rooms) {
    if (room.outline && room.outline.length >= 3) continue;
    for (const face of ['px', 'nx', 'py', 'ny'] as const) {
      const hit = spotOn(roomSeg(room, face), point, width);
      if (hit) found.push(hit);
    }
  }
  for (const run of runs) {
    const geom = runGeom(run);
    const hit = spotOn(
      { x0: geom.x0, y0: geom.y0, x1: geom.x1, y1: geom.y1, face: faceFromNormal(geom.nx, geom.ny), wallId: run.id, openings: run.openings, nx: geom.nx, ny: geom.ny },
      point,
      width,
    );
    if (hit) found.push(hit);
  }
  found.sort((a, b) => a.dist - b.dist);
  return found[0]?.spot ?? null;
}

export function snapStart(x: number, y: number, rooms: readonly Room[], runs: readonly WallRun[]): { x0: number; y0: number } {
  let x0 = snap(x);
  let y0 = snap(y);
  let best = JOIN_M;
  const consider = (vx: number, vy: number) => {
    const distance = Math.hypot(vx - x, vy - y);
    if (distance < best) {
      best = distance;
      x0 = vx;
      y0 = vy;
    }
  };
  for (const room of rooms) {
    for (const vx of [room.xM, room.xM + room.lengthM]) {
      for (const vy of [room.yM, room.yM + room.widthM]) consider(vx, vy);
    }
  }
  for (const run of runs) {
    consider(run.x0, run.y0);
    consider(run.x1, run.y1);
  }
  return { x0, y0 };
}

export function snapWallEnd(x0: number, y0: number, x: number, y: number, rooms: readonly Room[], runs: readonly WallRun[]): { x1: number; y1: number } {
  let x1 = snap(x);
  let y1 = snap(y);
  let best = JOIN_M;
  const consider = (vx: number, vy: number) => {
    if (Math.hypot(vx - x0, vy - y0) < 0.02) return;
    const distance = Math.hypot(vx - x, vy - y);
    if (distance < best) {
      best = distance;
      x1 = vx;
      y1 = vy;
    }
  };
  for (const room of rooms) {
    for (const vx of [room.xM, room.xM + room.lengthM]) {
      for (const vy of [room.yM, room.yM + room.widthM]) consider(vx, vy);
    }
  }
  for (const run of runs) {
    consider(run.x0, run.y0);
    consider(run.x1, run.y1);
  }
  return { x1, y1 };
}

export function wallQuad(x0: number, y0: number, x1: number, y1: number, thick = WALL_THICK_M): string {
  const geom = runGeom({ x0, y0, x1, y1 });
  const ox = geom.nx * (thick / 2);
  const oy = geom.ny * (thick / 2);
  return `${x0 + ox},${y0 + oy} ${x1 + ox},${y1 + oy} ${x1 - ox},${y1 - oy} ${x0 - ox},${y0 - oy}`;
}

export function solidSpans(length: number, openings: { offsetM: number; widthM: number }[]): [number, number][] {
  const cuts = [...openings].sort((a, b) => a.offsetM - b.offsetM);
  const spans: [number, number][] = [];
  let cursor = 0;
  for (const opening of cuts) {
    const start = Math.max(0, Math.min(length, opening.offsetM));
    const end = Math.max(start, Math.min(length, opening.offsetM + opening.widthM));
    if (start > cursor + 0.01) spans.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < length - 0.01) spans.push([cursor, length]);
  return spans;
}

export function wallQuads(run: WallRun): string[] {
  const geom = runGeom(run);
  return solidSpans(geom.length, run.openings).map(([start, end]) => {
    const x0 = geom.x0 + geom.dx * start;
    const y0 = geom.y0 + geom.dy * start;
    const x1 = geom.x0 + geom.dx * end;
    const y1 = geom.y0 + geom.dy * end;
    return wallQuad(x0, y0, x1, y1);
  });
}

export type DrawPoint = { x: number; y: number };

export type SnapGuide = { x0: number; y0: number; x1: number; y1: number };

export type WallSnap = {
  x: number;
  y: number;
  kind: 'vertex' | 'midpoint' | 'edge' | 'align' | 'grid';
  close: boolean;
  guides: SnapGuide[];
};

export function roomLoop(room: Room): DrawPoint[] {
  if (room.outline && room.outline.length >= 3) return room.outline;
  return [
    { x: room.xM, y: room.yM },
    { x: room.xM + room.lengthM, y: room.yM },
    { x: room.xM + room.lengthM, y: room.yM + room.widthM },
    { x: room.xM, y: room.yM + room.widthM },
  ];
}

export function polygonArea(points: readonly DrawPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function outlineCentroid(points: readonly DrawPoint[]): DrawPoint {
  let sum = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    sum += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(sum) < 1e-6) {
    return {
      x: points.reduce((total, point) => total + point.x, 0) / points.length,
      y: points.reduce((total, point) => total + point.y, 0) / points.length,
    };
  }
  return { x: x / (3 * sum), y: y / (3 * sum) };
}

export function pointInOutline(points: readonly DrawPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const yi = points[i].y;
    const yj = points[j].y;
    if ((yi > y) !== (yj > y) && x < ((points[j].x - points[i].x) * (y - yi)) / (yj - yi) + points[i].x) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: DrawPoint, b: DrawPoint, c: DrawPoint, d: DrawPoint): boolean {
  const cross = (px: number, py: number, qx: number, qy: number) => px * qy - py * qx;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const cdx = d.x - c.x;
  const cdy = d.y - c.y;
  const d1 = cross(abx, aby, c.x - a.x, c.y - a.y);
  const d2 = cross(abx, aby, d.x - a.x, d.y - a.y);
  const d3 = cross(cdx, cdy, a.x - c.x, a.y - c.y);
  const d4 = cross(cdx, cdy, b.x - c.x, b.y - c.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function outlineRoomOk(points: readonly DrawPoint[]): boolean {
  if (points.length < 3 || polygonArea(points) < 0.15) return false;
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const adjacent = Math.abs(i - j) <= 1 || (i === 0 && j === count - 1);
      if (adjacent) continue;
      if (segmentsCross(points[i], points[(i + 1) % count], points[j], points[(j + 1) % count])) return false;
    }
  }
  return true;
}

function nearEdge(points: readonly DrawPoint[], x: number, y: number): boolean {
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const along = ((x - a.x) * dx + (y - a.y) * dy) / len;
    if (along < -0.02 || along > len + 0.02) continue;
    const perp = Math.abs((x - a.x) * -dy + (y - a.y) * dx) / len;
    if (perp < 0.05) return true;
  }
  return false;
}

export function outlinesOverlap(a: readonly DrawPoint[], b: readonly DrawPoint[]): boolean {
  const countA = a.length;
  const countB = b.length;
  for (let i = 0; i < countA; i += 1) {
    for (let j = 0; j < countB; j += 1) {
      if (segmentsCross(a[i], a[(i + 1) % countA], b[j], b[(j + 1) % countB])) return true;
    }
  }
  const inside = (point: DrawPoint, loop: readonly DrawPoint[]) => pointInOutline(loop, point.x, point.y) && !nearEdge(loop, point.x, point.y);
  return a.some(point => inside(point, b)) || b.some(point => inside(point, a));
}

export function snapDrawPoint(
  x: number,
  y: number,
  rooms: readonly Room[],
  runs: readonly WallRun[],
  chain: readonly DrawPoint[],
  pxPerM: number,
): WallSnap {
  const reach = Math.max(12 / Math.max(pxPerM, 1), 0.08);
  const marks: { x: number; y: number; role: 'vertex' | 'mid' | 'start' }[] = [];
  const edges: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    if (Math.hypot(x1 - x0, y1 - y0) < 0.05) return;
    edges.push({ x0, y0, x1, y1 });
    marks.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, role: 'mid' });
  };
  for (const room of rooms) {
    const loop = roomLoop(room);
    loop.forEach((point, index) => {
      marks.push({ ...point, role: 'vertex' });
      const next = loop[(index + 1) % loop.length];
      addEdge(point.x, point.y, next.x, next.y);
    });
  }
  for (const run of runs) {
    marks.push({ x: run.x0, y: run.y0, role: 'vertex' }, { x: run.x1, y: run.y1, role: 'vertex' });
    addEdge(run.x0, run.y0, run.x1, run.y1);
  }
  chain.forEach((point, index) => {
    marks.push({ ...point, role: index === 0 && chain.length >= 3 ? 'start' : 'vertex' });
    if (index > 0) addEdge(chain[index - 1].x, chain[index - 1].y, point.x, point.y);
  });
  const origin = chain.length > 0 ? chain[chain.length - 1] : null;
  const away = (px: number, py: number) => !origin || Math.hypot(px - origin.x, py - origin.y) > 0.02;
  const guidesFor = (px: number, py: number): SnapGuide[] => {
    const guides: SnapGuide[] = [];
    let bestX: { x: number; y: number } | null = null;
    let bestY: { x: number; y: number } | null = null;
    let dx = Infinity;
    let dy = Infinity;
    for (const mark of marks) {
      if (Math.hypot(mark.x - px, mark.y - py) < 0.05) continue;
      if (Math.abs(mark.x - px) < 0.03 && Math.abs(mark.y - py) > 0.2 && Math.abs(mark.y - py) < dx) {
        dx = Math.abs(mark.y - py);
        bestX = mark;
      }
      if (Math.abs(mark.y - py) < 0.03 && Math.abs(mark.x - px) > 0.2 && Math.abs(mark.x - px) < dy) {
        dy = Math.abs(mark.x - px);
        bestY = mark;
      }
    }
    if (bestX) guides.push({ x0: px, y0: bestX.y, x1: px, y1: py });
    if (bestY) guides.push({ x0: bestY.x, y0: py, x1: px, y1: py });
    return guides;
  };
  const hit = (px: number, py: number, kind: WallSnap['kind'], close: boolean): WallSnap => ({
    x: px,
    y: py,
    kind,
    close,
    guides: guidesFor(px, py),
  });
  let best = reach;
  let chosen: WallSnap | null = null;
  for (const mark of marks) {
    if (mark.role === 'mid' || !away(mark.x, mark.y)) continue;
    const distance = Math.hypot(mark.x - x, mark.y - y);
    if (distance < best) {
      best = distance;
      chosen = hit(mark.x, mark.y, 'vertex', mark.role === 'start');
    }
  }
  if (chosen) return chosen;
  best = reach;
  for (const mark of marks) {
    if (mark.role !== 'mid' || !away(mark.x, mark.y)) continue;
    const distance = Math.hypot(mark.x - x, mark.y - y);
    if (distance < best) {
      best = distance;
      chosen = hit(mark.x, mark.y, 'midpoint', false);
    }
  }
  if (chosen) return chosen;
  best = reach;
  for (const edge of edges) {
    const dx = edge.x1 - edge.x0;
    const dy = edge.y1 - edge.y0;
    const len = Math.hypot(dx, dy);
    const along = ((x - edge.x0) * dx + (y - edge.y0) * dy) / (len * len);
    if (along <= 0.02 || along >= 0.98) continue;
    const px = edge.x0 + dx * along;
    const py = edge.y0 + dy * along;
    const distance = Math.hypot(px - x, py - y);
    if (distance < best && away(px, py)) {
      best = distance;
      chosen = hit(px, py, 'edge', false);
    }
  }
  if (chosen) return chosen;
  let snapX: number | null = null;
  let snapY: number | null = null;
  let axisX = reach;
  let axisY = reach;
  for (const mark of marks) {
    if (mark.role === 'mid') continue;
    const dx = Math.abs(mark.x - x);
    const dy = Math.abs(mark.y - y);
    if (dx < axisX) {
      axisX = dx;
      snapX = mark.x;
    }
    if (dy < axisY) {
      axisY = dy;
      snapY = mark.y;
    }
  }
  if (snapX !== null || snapY !== null) {
    const px = snapX ?? snap(x);
    const py = snapY ?? snap(y);
    if (away(px, py)) return hit(px, py, 'align', false);
  }
  return { x: snap(x), y: snap(y), kind: 'grid', close: false, guides: [] };
}

export function runOpeningEnds(run: WallRun, opening: Pick<WallRunOpening, 'offsetM' | 'widthM'>): { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; face: WallFace } {
  const geom = runGeom(run);
  return {
    x0: geom.x0 + geom.dx * opening.offsetM,
    y0: geom.y0 + geom.dy * opening.offsetM,
    x1: geom.x0 + geom.dx * (opening.offsetM + opening.widthM),
    y1: geom.y0 + geom.dy * (opening.offsetM + opening.widthM),
    nx: geom.nx,
    ny: geom.ny,
    face: faceFromNormal(geom.nx, geom.ny),
  };
}
