/**
 * Rules the Plan view and the 3D view share, so the two read the same way: how much each layer recedes in each build
 * phase, and which labels win when two overlap.
 */
import type { BuildStep } from './checks';

/** Opacity of each layer in a phase. Layers outside the active phase stay visible and clickable but recede. */
export function stepFade(step: BuildStep): { spaces: number; loads: number; equipment: number; ducts: number } {
  if (step === 'spaces') return { spaces: 1, loads: 0.16, equipment: 0.16, ducts: 0.12 };
  if (step === 'loads') return { spaces: 0.4, loads: 1, equipment: 0.16, ducts: 0.12 };
  if (step === 'systems') return { spaces: 0.4, loads: 0.16, equipment: 1, ducts: 1 };
  return { spaces: 1, loads: 1, equipment: 1, ducts: 1 };
}

/** Label priorities: on overlap the lower one hides. */
export const LABEL_PRIORITY = {
  /** Where air crosses the envelope: wins over duct and equipment labels, gives way to room names. */
  outside: 85,
  room: 90,
  duct: 70,
  equipment: 60,
  pipe: 55,
  roomDetail: 40,
  systemName: 30,
  load: 20,
} as const;

/** Labels of the selected item, room under the pointer, etc. Never hidden. */
export const LABEL_ACTIVE = 1000;
