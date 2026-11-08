import type { Project, StoredTemplate } from './types';

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
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state: PlannerState): void {
  window.localStorage.setItem(KEY, JSON.stringify({ ...state, schemaVersion: 1 }));
}
