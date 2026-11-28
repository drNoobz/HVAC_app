/**
 * Names for systems the app creates: what the system does, then the spaces it serves, e.g.
 * "Heating and cooling · Open office" or "Restroom exhaust · Restroom A, Restroom B". A system marked `autoName`
 * follows its equipment: the name changes as it grows into other spaces. Typing a name in the inspector turns that
 * off for good; clearing the name turns it back on. Systems from a project template keep their written names.
 */
import { roomAtPoint } from './projectOps';
import { SYSTEM_KINDS, type HvacSystem, type Project } from './types';

/** Spaces named in a system's name before the rest fold into "+n". */
const ROOMS_IN_NAME = 2;

/** The name a system gets from its kind and the spaces its equipment is in. Without equipment, the kind alone. */
export function autoSystemName(project: Project, system: HvacSystem): string {
  const kind = SYSTEM_KINDS.find(item => item.id === system.kind)?.label ?? 'System';
  const members = project.equipment.filter(item => item.systemId === system.id);
  // Spaces the terminals are in say best what a system serves; a fan or unit alone (a hood, a rooftop unit not yet
  // ducted) names the space it sits in or over.
  const terminals = members.filter(item => item.catalogId.startsWith('diff') || item.catalogId.startsWith('grille'));
  const placed = terminals.length > 0 ? terminals : members;
  const ids = new Set<string>();
  for (const item of placed) {
    const room = item.roomId ? project.rooms.find(candidate => candidate.id === item.roomId) : roomAtPoint(project.rooms, item.xM, item.yM);
    if (room) ids.add(room.id);
  }
  const rooms = project.rooms.filter(room => ids.has(room.id)).map(room => room.name);
  if (rooms.length === 0) return kind;
  const shown = rooms.slice(0, ROOMS_IN_NAME).join(', ');
  return rooms.length > ROOMS_IN_NAME ? `${kind} · ${shown} +${rooms.length - ROOMS_IN_NAME}` : `${kind} · ${shown}`;
}

/**
 * Bring every `autoName` system's name up to date, numbering a name another system already has ("… 2"). Returns the
 * same project when no name changed.
 */
export function refreshSystemNames(project: Project): Project {
  if (!project.systems.some(system => system.autoName)) return project;
  const taken = new Set(project.systems.filter(system => !system.autoName).map(system => system.name));
  let changed = false;
  const systems = project.systems.map(system => {
    if (!system.autoName) return system;
    const base = autoSystemName(project, system);
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base} ${n}`;
    taken.add(name);
    if (name === system.name) return system;
    changed = true;
    return { ...system, name };
  });
  return changed ? { ...project, systems } : project;
}
