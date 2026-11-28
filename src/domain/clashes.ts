/**
 * Clash detection on the 3D scene: duct against duct, and duct through equipment it does not serve.
 *
 * It works on the pieces `buildScene()` draws, so it sees what the 3D view shows: duct heights, risers, hanging
 * terminals and rooftop collars. Each duct segment is a capsule (a round duct, or a rectangular one taken at half its
 * larger side); each piece of equipment is its box. Runs that meet at a node or at a port are joined on purpose and
 * never reported against each other, and a duct is never reported against equipment it connects to.
 *
 * A clash here means the drawn shapes overlap. It is a layout check, not a clearance or code check.
 */
import { buildScene, type Scene3D, type Vec3 } from './scene3d';
import type { DuctRun, Project } from './types';

export interface DuctClash {
  kind: 'duct' | 'equipment';
  /** The duct that clashes. */
  runId: string;
  /** The other duct, or the equipment the duct passes through. */
  otherId: string;
  /** A point in the overlap (world metres). */
  at: Vec3;
  /** How far the shapes overlap, metres. */
  overlapM: number;
}

/** Overlaps smaller than this are drawing noise at joints, not clashes. */
const TOLERANCE_M = 0.01;

interface Segment { runId: string; a: Vec3; b: Vec3; r: number }

const sub = (u: Vec3, v: Vec3): Vec3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Closest points between two segments: the distance and the midpoint between them. */
function segmentGap(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): { distance: number; at: Vec3 } {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-12 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1 = lerp(p1, q1, s);
  const c2 = lerp(p2, q2, t);
  const w = sub(c1, c2);
  return { distance: Math.sqrt(dot(w, w)), at: lerp(c1, c2, 0.5) };
}

/** Where a run ends: a node, or an equipment port. Two runs that share one are joined. */
function endKeys(run: DuctRun): string[] {
  return [run.start, run.end].flatMap(end =>
    end.nodeId ? [`n:${end.nodeId}`] : end.equipmentId ? [`e:${end.equipmentId}|${end.portId ?? ''}`] : [],
  );
}

export function findClashes(project: Project, scene: Scene3D): DuctClash[] {
  const runs = new Map((project.ducts ?? []).map(run => [run.id, run]));
  const ends = new Map([...runs.values()].map(run => [run.id, endKeys(run)]));
  const serves = new Map<string, Set<string>>();
  for (const run of runs.values()) {
    for (const end of [run.start, run.end]) {
      if (!end.equipmentId) continue;
      if (!serves.has(end.equipmentId)) serves.set(end.equipmentId, new Set());
      serves.get(end.equipmentId)!.add(run.id);
    }
  }
  const joined = (a: string, b: string) => {
    const other = ends.get(b) ?? [];
    return (ends.get(a) ?? []).some(key => other.includes(key));
  };

  const segments: Segment[] = [];
  for (const piece of scene.pieces) {
    if (piece.pick?.kind !== 'duct' || !runs.has(piece.pick.id)) continue;
    if (piece.shape === 'tube') segments.push({ runId: piece.pick.id, a: piece.from, b: piece.to, r: piece.radius });
    else if (piece.shape === 'beam') segments.push({ runId: piece.pick.id, a: piece.from, b: piece.to, r: Math.max(piece.width, piece.height) / 2 });
  }

  const clashes: DuctClash[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const one = segments[i];
      const two = segments[j];
      if (one.runId === two.runId || joined(one.runId, two.runId)) continue;
      const pair = [one.runId, two.runId].sort().join('|');
      if (seen.has(pair)) continue;
      const gap = segmentGap(one.a, one.b, two.a, two.b);
      const overlap = one.r + two.r - gap.distance;
      if (overlap <= TOLERANCE_M) continue;
      seen.add(pair);
      clashes.push({ kind: 'duct', runId: one.runId, otherId: two.runId, at: gap.at, overlapM: overlap });
    }
  }

  // Ducts through equipment: test points along each segment against the equipment's box, grown by the duct radius.
  for (const piece of scene.pieces) {
    if (piece.shape !== 'box' || piece.pick?.kind !== 'equipment') continue;
    if (piece.key.endsWith(':core')) continue;
    const equipmentId = piece.pick.id;
    const cos = Math.cos(-piece.yaw);
    const sin = Math.sin(-piece.yaw);
    const halfDiagonal = Math.sqrt(dot(piece.size, piece.size)) / 2;
    for (const segment of segments) {
      if (serves.get(equipmentId)?.has(segment.runId)) continue;
      const pair = `${segment.runId}|${equipmentId}`;
      if (seen.has(pair)) continue;
      // Quick reject: the segment never comes within the box's bounding sphere.
      if (segmentGap(segment.a, segment.b, piece.center, piece.center).distance > halfDiagonal + segment.r) continue;
      const length = Math.sqrt(dot(sub(segment.b, segment.a), sub(segment.b, segment.a)));
      const steps = Math.max(2, Math.ceil(length / 0.05));
      for (let k = 0; k <= steps; k += 1) {
        const point = lerp(segment.a, segment.b, k / steps);
        const dx = point[0] - piece.center[0];
        const dy = point[1] - piece.center[1];
        const local = [Math.abs(dx * cos - dy * sin), Math.abs(dx * sin + dy * cos), Math.abs(point[2] - piece.center[2])];
        const reach = [piece.size[0] / 2 + segment.r, piece.size[1] / 2 + segment.r, piece.size[2] / 2 + segment.r];
        const overlap = Math.min(reach[0] - local[0], reach[1] - local[1], reach[2] - local[2]);
        if (overlap > TOLERANCE_M) {
          seen.add(pair);
          clashes.push({ kind: 'equipment', runId: segment.runId, otherId: equipmentId, at: point, overlapM: overlap });
          break;
        }
      }
    }
  }
  return clashes;
}

/** Every clash in the project, from its 3D scene. */
export function projectClashes(project: Project): DuctClash[] {
  if ((project.ducts ?? []).length === 0) return [];
  return findClashes(project, buildScene(project));
}

function depthM(run: DuctRun): number {
  return run.shape === 'round' ? run.widthM : run.heightM ?? run.widthM * 0.67;
}

/**
 * Which duct of a duct clash hops under the other: the shallower one, then the narrower one. It is the cheaper one
 * to move, and the larger main keeps its height under the ceiling.
 */
export function clashHopper(project: Project, clash: DuctClash): { runId: string; otherId: string } {
  const a = (project.ducts ?? []).find(run => run.id === clash.runId);
  const b = (project.ducts ?? []).find(run => run.id === clash.otherId);
  if (!a || !b) return { runId: clash.runId, otherId: clash.otherId };
  const smaller = depthM(b) < depthM(a) - 0.002 || (Math.abs(depthM(b) - depthM(a)) <= 0.002 && b.widthM < a.widthM - 0.002);
  return smaller ? { runId: b.id, otherId: a.id } : { runId: a.id, otherId: b.id };
}
