/**
 * Visibility and graphics for the 3D view, as in Revit: each category can be hidden or made see-through, building
 * surfaces can be ghosted, and layers outside the active phase recede (the Plan view's phase fade). Stored in this
 * browser, not in the project.
 */
import type { BuildStep } from './checks';
import { SCENE_CATEGORIES, SURFACE_CATEGORIES, type SceneCategory } from './scene3d';
import { stepFade } from './viewRules';

export interface CategoryGraphics {
  visible: boolean;
  /** 0 is solid, 100 is invisible. */
  transparency: number;
}

export interface View3DSettings {
  /** Layers outside the active phase recede, as on the plan. */
  fadeByPhase: boolean;
  /** Walls, floors, ceilings and openings drawn see-through, to look at the equipment inside. */
  ghostSurfaces: boolean;
  /** Sun shadows, as Revit's Shadows switch. */
  shadows: boolean;
  categories: Record<SceneCategory, CategoryGraphics>;
}

export const VIEW3D_STORAGE_KEY = 'hvac-3d-view';

/** Ghost surfaces keep building surfaces at most this opaque. */
export const GHOST_OPACITY = 0.22;

export function defaultView3D(): View3DSettings {
  const categories = {} as Record<SceneCategory, CategoryGraphics>;
  for (const entry of SCENE_CATEGORIES) categories[entry.id] = { visible: true, transparency: 0 };
  return { fadeByPhase: true, ghostSurfaces: false, shadows: true, categories };
}

export function loadView3D(): View3DSettings {
  const base = defaultView3D();
  if (typeof window === 'undefined') return base;
  try {
    const raw = JSON.parse(window.localStorage.getItem(VIEW3D_STORAGE_KEY) ?? 'null') as Partial<View3DSettings> | null;
    if (!raw || typeof raw !== 'object') return base;
    const categories = { ...base.categories };
    for (const entry of SCENE_CATEGORIES) {
      const saved = raw.categories?.[entry.id];
      if (!saved) continue;
      categories[entry.id] = {
        visible: saved.visible !== false,
        transparency: Math.max(0, Math.min(100, Math.round(Number(saved.transparency) || 0))),
      };
    }
    return { fadeByPhase: raw.fadeByPhase !== false, ghostSurfaces: raw.ghostSurfaces === true, shadows: raw.shadows !== false, categories };
  } catch {
    return base;
  }
}

export function saveView3D(settings: View3DSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VIEW3D_STORAGE_KEY, JSON.stringify(settings));
}

/** The Layers rows (plan layers) that a category needs switched on. */
export interface LayerSwitches {
  spaces: boolean;
  loads: boolean;
  equipment: boolean;
  ducts: boolean;
}

/** How opaque a category is drawn right now; 0 means it is not drawn at all. */
export function categoryOpacity(settings: View3DSettings, category: SceneCategory, step: BuildStep, layers: LayerSwitches): number {
  const entry = SCENE_CATEGORIES.find(item => item.id === category);
  const graphics = settings.categories[category];
  if (!entry || !graphics.visible || !layers[entry.layer]) return 0;
  let opacity = 1 - graphics.transparency / 100;
  if (settings.fadeByPhase) {
    const fade = stepFade(step)[entry.layer];
    // Ceilings sit between the eye and the ductwork, so when the spaces recede they recede twice as far.
    opacity *= category === 'ceilings' && fade < 1 ? fade / 2 : fade;
  }
  if (settings.ghostSurfaces && SURFACE_CATEGORIES.includes(category)) opacity = Math.min(opacity, GHOST_OPACITY);
  return Math.max(0, Math.min(1, opacity));
}
