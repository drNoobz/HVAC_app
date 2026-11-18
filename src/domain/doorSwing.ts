import type { Opening, Project, Room, WallFace } from './types';

export type DoorHinge = 'start' | 'end';
export type DoorSwingSide = 'in' | 'out';

export function openingEnds(room: Room, opening: Pick<Opening, 'face' | 'offsetM' | 'widthM'>): { x0: number; y0: number; x1: number; y1: number } {
  if (opening.face === 'px' || opening.face === 'nx') {
    const x = opening.face === 'px' ? room.xM + room.lengthM : room.xM;
    return { x0: x, y0: room.yM + opening.offsetM, x1: x, y1: room.yM + opening.offsetM + opening.widthM };
  }
  const y = opening.face === 'py' ? room.yM + room.widthM : room.yM;
  return { x0: room.xM + opening.offsetM, y0: y, x1: room.xM + opening.offsetM + opening.widthM, y1: y };
}

export function doorwayKey(room: Room, opening: Pick<Opening, 'face' | 'offsetM' | 'widthM'>): string {
  const ends = openingEnds(room, opening);
  const q = (value: number) => Math.round(value / 0.02);
  const x0 = Math.min(q(ends.x0), q(ends.x1));
  const y0 = Math.min(q(ends.y0), q(ends.y1));
  const x1 = Math.max(q(ends.x0), q(ends.x1));
  const y1 = Math.max(q(ends.y0), q(ends.y1));
  return `${x0}:${y0}:${x1}:${y1}`;
}

export function doorCopies(rooms: readonly Room[], room: Room, opening: Opening): { room: Room; opening: Opening }[] {
  if (opening.kind !== 'door') return [{ room, opening }];
  const key = doorwayKey(room, opening);
  const copies = rooms.flatMap(other =>
    other.openings.filter(item => item.kind === 'door' && doorwayKey(other, item) === key).map(item => ({ room: other, opening: item }))
  );
  return copies.length ? copies : [{ room, opening }];
}

export function doorHinge(opening: Opening): DoorHinge {
  return opening.hinge === 'end' ? 'end' : 'start';
}

export function doorSwingSide(opening: Opening): DoorSwingSide {
  return opening.swing === 'out' ? 'out' : 'in';
}

export function hingeEnds(face: WallFace): { start: string; end: string } {
  if (face === 'px' || face === 'nx') return { start: 'Lower end', end: 'Upper end' };
  return { start: 'Left end', end: 'Right end' };
}

/** Quarter-circle from the closed leaf to the open leaf. nx/ny is the open direction. */
export function doorArc(face: WallFace, hinge: DoorHinge, side: DoorSwingSide): { nx: number; ny: number; from: number; to: number } {
  const intoX = face === 'px' ? -1 : face === 'nx' ? 1 : 0;
  const intoY = face === 'py' ? -1 : face === 'ny' ? 1 : 0;
  const nx = side === 'out' ? -intoX : intoX;
  const ny = side === 'out' ? -intoY : intoY;
  const alongX = face === 'px' || face === 'nx' ? 0 : 1;
  const alongY = face === 'px' || face === 'nx' ? 1 : 0;
  const closedX = hinge === 'end' ? -alongX : alongX;
  const closedY = hinge === 'end' ? -alongY : alongY;
  const from = Math.atan2(closedY, closedX);
  let delta = Math.atan2(ny, nx) - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return { nx, ny, from, to: from + delta };
}

function roomBeyond(rooms: readonly Room[], room: Room, opening: Opening): Room | null {
  const ends = openingEnds(room, opening);
  const arc = doorArc(opening.face, 'start', 'out');
  const x = (ends.x0 + ends.x1) / 2 + arc.nx * 0.2;
  const y = (ends.y0 + ends.y1) / 2 + arc.ny * 0.2;
  const hits = rooms.filter(
    other => other.id !== room.id && x >= other.xM && x <= other.xM + other.lengthM && y >= other.yM && y <= other.yM + other.widthM
  );
  hits.sort((a, b) => a.lengthM * a.widthM - b.lengthM * b.widthM);
  return hits[0] ?? null;
}

export function doorDirection(rooms: readonly Room[], room: Room, opening: Opening): {
  into: string;
  hinge: DoorHinge;
  face: WallFace;
  choices: { id: string; label: string }[];
} {
  const drawn = doorCopies(rooms, room, opening)[0];
  const far = roomBeyond(rooms, drawn.room, drawn.opening);
  const into = doorSwingSide(drawn.opening) === 'in' ? drawn.room.id : far ? far.id : 'outside';
  const choices = [
    { id: drawn.room.id, label: drawn.room.name },
    far && far.id !== drawn.room.id ? { id: far.id, label: far.name } : { id: 'outside', label: 'Outside' },
  ];
  return { into, hinge: doorHinge(drawn.opening), face: drawn.opening.face, choices };
}

export function setDoorDirection(project: Project, roomId: string, openingId: string, next: { into: string; hinge: DoorHinge }): Project {
  const room = project.rooms.find(item => item.id === roomId);
  const opening = room?.openings.find(item => item.id === openingId);
  if (!room || !opening || opening.kind !== 'door') return project;
  const copies = doorCopies(project.rooms, room, opening);
  const swingFor = new Map(copies.map(copy => [`${copy.room.id}:${copy.opening.id}`, next.into === copy.room.id ? 'in' : 'out'] as const));
  return {
    ...project,
    rooms: project.rooms.map(item => ({
      ...item,
      openings: item.openings.map(candidate => {
        const swing = swingFor.get(`${item.id}:${candidate.id}`);
        return swing ? { ...candidate, hinge: next.hinge, swing } : candidate;
      }),
    })),
  };
}
