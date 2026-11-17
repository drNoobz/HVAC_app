import type { Project, StoredTemplate } from './types';
import { normalizeProject } from './walls';

const EMPTY_WALL_NOTE = 'No construction material assigned. Choose one from the material library, or add a row there.';

const KEY = 'hvac-planner-state-v1';

export interface PlannerState {
  schemaVersion: 1;
  projects: Project[];
  templates: StoredTemplate[];
}

export function emptyState(): PlannerState {
  return { schemaVersion: 1, projects: [], templates: [] };
}

/** Browser storage for the standalone demo. A portal host can replace this module. No sign-in provider is wired in this stage. */
export function loadState(): PlannerState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as PlannerState;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.templates)) {
      return emptyState();
    }
    return {
      schemaVersion: 1,
      projects: parsed.projects.map(project => normalizeProject(project, EMPTY_WALL_NOTE)),
      templates: parsed.templates.map(template => ({ ...template, project: normalizeProject(template.project, EMPTY_WALL_NOTE) })),
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: PlannerState): void {
  window.localStorage.setItem(KEY, JSON.stringify({ ...state, schemaVersion: 1 }));
}
