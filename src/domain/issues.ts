import { getProduct } from './catalog';
import type { Project, Room, Selection } from './types';
import { outlinesOverlap, roomLoop } from './wallDraw';
import { PLAN_SIDES, WALL_FACE_IDS, edgePortions, interfaceTargets, portionSummary, wallPlaceLabel, wallRelation, type InterfaceTarget } from './walls';

export interface PlanningIssue {
  id: string;
  message: string;
  selection: Selection;
}

const TOUCH_M = 0.08;

function footprintsOverlap(a: Room, b: Room): boolean {
  const x = Math.min(a.xM + a.lengthM, b.xM + b.lengthM) - Math.max(a.xM, b.xM);
  const y = Math.min(a.yM + a.widthM, b.yM + b.widthM) - Math.max(a.yM, b.yM);
  const z = Math.min(a.zM + a.heightM, b.zM + b.heightM) - Math.max(a.zM, b.zM);
  return x > TOUCH_M && y > TOUCH_M && z > TOUCH_M;
}

function hasStack(constructionId: string | null | undefined, layers: { materialId: string }[] | undefined): boolean {
  return Boolean(constructionId) || Boolean(layers && layers.length > 0);
}

function anchorPhrase(anchor: string): string {
  if (anchor.startsWith('f:')) {
    const face = anchor.slice(2);
    if (face === 'px' || face === 'nx' || face === 'py' || face === 'ny') return `${PLAN_SIDES[face].title.toLowerCase()} wall`;
  }
  if (anchor.startsWith('e:')) {
    const index = Number(anchor.slice(2));
    if (Number.isInteger(index) && index >= 0) return `wall ${index + 1}`;
  }
  return 'wall';
}

function covers(targets: readonly InterfaceTarget[], roomId: string, anchor: string): boolean {
  return targets.some(target => target.sides.some(side => side.roomId === roomId && side.anchor === anchor));
}

/** Plain-language planning checks. These are not a code review and they do not size equipment. */
export function planningIssues(project: Project): PlanningIssue[] {
  const issues: PlanningIssue[] = [];
  const rooms = project.rooms;
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const shaped = (rooms[i].outline?.length ?? 0) >= 3 || (rooms[j].outline?.length ?? 0) >= 3;
      const z = Math.min(rooms[i].zM + rooms[i].heightM, rooms[j].zM + rooms[j].heightM) - Math.max(rooms[i].zM, rooms[j].zM);
      if (shaped ? z <= TOUCH_M || !outlinesOverlap(roomLoop(rooms[i]), roomLoop(rooms[j])) : !footprintsOverlap(rooms[i], rooms[j])) continue;
      issues.push({
        id: `overlap-${rooms[i].id}-${rooms[j].id}`,
        message: `${rooms[i].name} overlaps ${rooms[j].name}.`,
        selection: { kind: 'room', id: rooms[i].id },
      });
    }
  }
  for (const room of rooms) {
    const access = room.openings.some(opening => opening.kind === 'door' || opening.kind === 'opening');
    if (!access) {
      issues.push({
        id: `access-${room.id}`,
        message: `${room.name} has no door or passage.`,
        selection: { kind: 'room', id: room.id },
      });
    }
    if (room.use === 'Kitchen' || room.use === 'Hot line') {
      const hood = project.equipment.some(item => item.roomId === room.id && getProduct(item.catalogId)?.category === 'kitchen-hood');
      if (!hood) {
        issues.push({
          id: `hood-${room.id}`,
          message: `${room.name} has no hood.`,
          selection: { kind: 'room', id: room.id },
        });
      }
    }
    const targets = interfaceTargets(rooms);
    for (const target of targets) {
      const host = target.sides[0];
      if (!host || host.roomId !== room.id) continue;
      const assignment = project.interfaceWalls?.[target.key];
      if (hasStack(assignment?.constructionId, assignment?.layers)) continue;
      const other = target.sides[1]?.name || 'outside air';
      issues.push({
        id: `iface-${target.key}`,
        message: `${host.name} ${anchorPhrase(host.anchor)} interface with ${other} has no construction.`,
        selection: { kind: 'interface', key: target.key },
      });
    }
    if (room.outline && room.outline.length >= 3) {
      room.outline.forEach((_, index) => {
        if (covers(targets, room.id, `e:${index}`)) return;
        const assignment = room.edgeWalls?.[index];
        if (!hasStack(assignment?.constructionId, assignment?.layers)) {
          issues.push({
            id: `wall-${room.id}-e${index}`,
            message: `${room.name} wall ${index + 1} is ${portionSummary(edgePortions(room, index, rooms)).toLowerCase()} and has no construction.`,
            selection: { kind: 'surface', roomId: room.id, face: 'walls', edge: index },
          });
        }
      });
    } else {
      for (const face of WALL_FACE_IDS) {
        if (covers(targets, room.id, `f:${face}`)) continue;
        const assignment = room.surfaces.walls[face];
        if (!hasStack(assignment.constructionId, assignment.layers)) {
          issues.push({
            id: `wall-${room.id}-${face}`,
            message: `${room.name} ${PLAN_SIDES[face].title.toLowerCase()} wall is ${wallRelation(room, face, rooms).toLowerCase()} and has no construction.`,
            selection: { kind: 'surface', roomId: room.id, face: 'walls', wallFace: face },
          });
        }
      }
    }
    for (const opening of room.openings) {
      if (!hasStack(opening.constructionId, opening.layers)) {
        issues.push({
          id: `opening-stack-${opening.id}`,
          message: `${room.name} ${opening.kind} on the ${PLAN_SIDES[opening.face].title.toLowerCase()} wall has no construction.`,
          selection: { kind: 'opening', roomId: room.id, id: opening.id },
        });
      }
      const span = opening.face === 'px' || opening.face === 'nx' ? room.widthM : room.lengthM;
      if (opening.offsetM < -TOUCH_M || opening.offsetM + opening.widthM > span + TOUCH_M) {
        const side = wallPlaceLabel(room, opening.face, rooms).split(' · ')[0].toLowerCase();
        issues.push({
          id: `past-${opening.id}`,
          message: `${room.name} ${opening.kind} extends past the ${side} wall.`,
          selection: { kind: 'opening', roomId: room.id, id: opening.id },
        });
      }
    }
  }
  return issues;
}
