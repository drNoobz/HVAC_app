/**
 * Space uses for the Use picker, grouped the way ASHRAE 62.1 Table 6-1 and IMC Table 403.3.1.1 group occupancy
 * categories, so the list covers every building type and not only restaurants.
 *
 * Names are short and plain; the restaurant names (Dining, Hot line, Walk-in…) are kept exactly, because saved
 * projects and the templates use them. Each use carries the few facts the app reads today:
 * - occupied: people are expected, so Check asks for occupants;
 * - wet: tile floor and a washable ceiling are suggested;
 * - cold: insulated panels are suggested.
 * Ventilation rates per category come with the space types in docs/proposals/user-built-spaces-loads-systems.md.
 */
import type { BuildingType } from './types';

export interface SpaceUse {
  name: string;
  occupied?: boolean;
  wet?: boolean;
  cold?: boolean;
  /** Plan fill. Missing uses the group's. */
  fill?: string;
}

export interface SpaceUseGroup {
  id: string;
  label: string;
  /** Plan fill for uses in this group that have none of their own. */
  fill: string;
  uses: SpaceUse[];
}

export const SPACE_USE_GROUPS: SpaceUseGroup[] = [
  {
    id: 'office',
    label: 'Office',
    fill: '#d9e7dc',
    uses: [
      { name: 'Office', occupied: true },
      { name: 'Conference room', occupied: true },
      { name: 'Reception', occupied: true },
      { name: 'Break room', occupied: true },
      { name: 'Copy and print', occupied: true },
      { name: 'Server room', fill: '#dfe5ea' },
    ],
  },
  {
    id: 'retail',
    label: 'Retail',
    fill: '#f2dde3',
    uses: [
      { name: 'Sales floor', occupied: true },
      { name: 'Checkout', occupied: true },
      { name: 'Fitting rooms', occupied: true },
      { name: 'Mall common area', occupied: true },
      { name: 'Stockroom', fill: '#e5e3d4' },
    ],
  },
  {
    id: 'food',
    label: 'Food and beverage',
    fill: '#f3e4c4',
    uses: [
      { name: 'Dining', occupied: true, fill: '#f3e4c4' },
      { name: 'Bar', occupied: true, fill: '#ead7b4' },
      { name: 'Cafeteria', occupied: true, fill: '#f3e4c4' },
      { name: 'Kitchen', occupied: true, wet: true, fill: '#f3cfc2' },
      { name: 'Hot line', occupied: true, wet: true, fill: '#f0c0ae' },
      { name: 'Prep', occupied: true, wet: true, fill: '#f6ddd2' },
      { name: 'Dish', occupied: true, wet: true, fill: '#d5e4ea' },
      { name: 'Walk-in', cold: true, fill: '#d2e2f2' },
      { name: 'Dry storage', fill: '#e5e3d4' },
    ],
  },
  {
    id: 'education',
    label: 'Education',
    fill: '#dbe3f4',
    uses: [
      { name: 'Classroom', occupied: true },
      { name: 'Lecture hall', occupied: true },
      { name: 'Science lab', occupied: true, wet: true },
      { name: 'Library', occupied: true },
      { name: 'Daycare', occupied: true },
    ],
  },
  {
    id: 'assembly',
    label: 'Assembly and recreation',
    fill: '#e9dcf0',
    uses: [
      { name: 'Auditorium', occupied: true },
      { name: 'Cinema', occupied: true },
      { name: 'Lobby', occupied: true },
      { name: 'Gym', occupied: true },
      { name: 'Spectator seating', occupied: true },
      { name: 'Place of worship', occupied: true },
      { name: 'Museum or gallery', occupied: true },
    ],
  },
  {
    id: 'lodging',
    label: 'Lodging and healthcare',
    fill: '#d8ecec',
    uses: [
      { name: 'Hotel room', occupied: true },
      { name: 'Dormitory', occupied: true },
      { name: 'Exam room', occupied: true },
      { name: 'Waiting room', occupied: true },
    ],
  },
  {
    id: 'industrial',
    label: 'Industrial and storage',
    fill: '#e3e1d2',
    uses: [
      { name: 'Manufacturing', occupied: true },
      { name: 'Workshop', occupied: true },
      { name: 'Warehouse' },
      { name: 'Loading dock' },
      { name: 'Cold storage', cold: true, fill: '#d2e2f2' },
    ],
  },
  {
    id: 'shared',
    label: 'Shared and support',
    fill: '#e6eaec',
    uses: [
      { name: 'Corridor', fill: '#e6eaec' },
      { name: 'Restroom', wet: true, fill: '#e2dff2' },
      { name: 'Locker and shower', wet: true, fill: '#e2dff2' },
      { name: 'Janitor closet', wet: true },
      { name: 'Storage', fill: '#e5e3d4' },
      { name: 'Service', fill: '#e6eaec' },
      { name: 'Mechanical room', fill: '#e1e4e8' },
      { name: 'Electrical room', fill: '#e1e4e8' },
      { name: 'Stair', fill: '#e6eaec' },
    ],
  },
];

/** Picker values outside the groups: the first entry for a new room, and a catch-all. */
export const UNASSIGNED_USE = 'Unassigned';
export const OTHER_USE = 'Other';

const BY_NAME = new Map(SPACE_USE_GROUPS.flatMap(group => group.uses.map(use => [use.name, { use, group }] as const)));

export function findSpaceUse(name: string): SpaceUse | undefined {
  return BY_NAME.get(name)?.use;
}

export function isOccupiedUse(name: string): boolean {
  return Boolean(findSpaceUse(name)?.occupied);
}

export function isWetUse(name: string): boolean {
  return Boolean(findSpaceUse(name)?.wet);
}

export function isColdUse(name: string): boolean {
  return Boolean(findSpaceUse(name)?.cold);
}

/** Plan fill for a use: its own, else its group's. Unknown uses get a neutral grey-blue. */
export function spaceUseFill(name: string): string {
  const hit = BY_NAME.get(name);
  return hit ? (hit.use.fill ?? hit.group.fill) : '#e4ebf0';
}

const GROUP_FIRST: Partial<Record<BuildingType, string>> = { restaurant: 'food', commercial: 'office' };

/** Groups in picker order: the one that matches the project's building type first. */
export function spaceUseGroupsFor(buildingType: BuildingType): SpaceUseGroup[] {
  const first = GROUP_FIRST[buildingType];
  if (!first) return SPACE_USE_GROUPS;
  return [...SPACE_USE_GROUPS.filter(group => group.id === first), ...SPACE_USE_GROUPS.filter(group => group.id !== first)];
}
