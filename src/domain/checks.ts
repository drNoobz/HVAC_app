import { catalogPorts, getProduct } from './catalog';
import { streamFor } from './ductCatalog';
import { DUCT_SERVICE_LABEL, openPorts } from './ducts';
import { planningIssues } from './issues';
import { getLoadProduct } from './loadCatalog';
import { hoodOver } from './loads';
import type { DuctService, Project, Selection } from './types';

export type BuildStep = 'spaces' | 'loads' | 'equipment' | 'ducts' | 'check';

export type CheckFix =
  | { kind: 'select' }
  | { kind: 'duct'; catalogId: string; systemId: string; service: DuctService };

export interface CheckIssue {
  id: string;
  step: Exclude<BuildStep, 'check'>;
  severity: 'error' | 'warning' | 'planning';
  message: string;
  selection: Selection | null;
  fix: CheckFix;
  fixLabel: string;
}

const PEOPLE_USES = new Set(['Dining', 'Bar', 'Kitchen', 'Hot line', 'Prep', 'Dish', 'Office']);

export function stepForSelection(selection: Selection): Exclude<BuildStep, 'check'> | null {
  switch (selection.kind) {
    case 'room':
    case 'surface':
    case 'interface':
    case 'opening':
    case 'wallRun':
    case 'wallOpening':
      return 'spaces';
    case 'load':
      return 'loads';
    case 'equipment':
    case 'system':
      return 'equipment';
    case 'duct':
      return 'ducts';
    default:
      return null;
  }
}

function equipmentName(project: Project, id: string): string {
  const item = project.equipment.find(entry => entry.id === id);
  const product = item ? getProduct(item.catalogId) : undefined;
  return product?.model ?? 'Equipment';
}

/** Planning checks grouped by build step. Geometry rows come from the ThermoNode validator. */
export function buildChecks(
  project: Project,
  geometry: { id: string; severity: 'error' | 'warning'; message: string; selection: Selection | null }[],
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const row of geometry) {
    issues.push({ ...row, step: 'spaces', fix: { kind: 'select' }, fixLabel: 'Show' });
  }
  for (const row of planningIssues(project)) {
    issues.push({
      id: row.id,
      step: row.id.startsWith('hood-') ? 'equipment' : 'spaces',
      severity: 'planning',
      message: row.message,
      selection: row.selection,
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  const loads = project.loads ?? [];
  for (const room of project.rooms) {
    if (!PEOPLE_USES.has(room.use)) continue;
    const hasPeople = loads.some(item => item.roomId === room.id && getLoadProduct(item.loadId)?.category === 'people');
    if (!hasPeople) {
      issues.push({
        id: `people-${room.id}`,
        step: 'loads',
        severity: 'planning',
        message: `${room.name} has no occupants.`,
        selection: { kind: 'room', id: room.id },
        fix: { kind: 'select' },
        fixLabel: 'Show',
      });
    }
  }
  for (const item of loads) {
    const product = getLoadProduct(item.loadId);
    if (!product) {
      issues.push({ id: `load-missing-${item.id}`, step: 'loads', severity: 'warning', message: 'A load refers to a catalog item that no longer exists.', selection: { kind: 'load', id: item.id }, fix: { kind: 'select' }, fixLabel: 'Show' });
      continue;
    }
    if (!item.roomId) {
      issues.push({ id: `load-room-${item.id}`, step: 'loads', severity: 'warning', message: `${product.name} is outside every space.`, selection: { kind: 'load', id: item.id }, fix: { kind: 'select' }, fixLabel: 'Show' });
    }
    if (product.hooded === true && product.category === 'cooking' && !hoodOver(project, item)) {
      issues.push({
        id: `load-hood-${item.id}`,
        step: 'loads',
        severity: 'warning',
        message: `${product.name} uses hooded values but is not under a hood. Convective heat, latent heat${product.fuel === 'gas' ? ', and combustion products' : ''} would enter the space.`,
        selection: { kind: 'load', id: item.id },
        fix: { kind: 'select' },
        fixLabel: 'Show',
      });
    }
  }
  for (const item of project.equipment) {
    const product = getProduct(item.catalogId);
    if (!product || item.systemId || catalogPorts(product).length === 0) continue;
    issues.push({
      id: `eq-system-${item.id}`,
      step: 'equipment',
      severity: 'planning',
      message: `${product.model} is not in a system.`,
      selection: { kind: 'equipment', id: item.id },
      fix: { kind: 'select' },
      fixLabel: 'Assign',
    });
  }
  for (const hit of openPorts(project)) {
    const item = project.equipment.find(entry => entry.id === hit.equipmentId);
    const system = item?.systemId ? project.systems.find(entry => entry.id === item.systemId) : undefined;
    if (!item || !system || !streamFor(system.kind, hit.service)) continue;
    issues.push({
      id: `port-${hit.equipmentId}-${hit.portId}`,
      step: 'ducts',
      severity: 'planning',
      message: `${equipmentName(project, hit.equipmentId)} ${hit.portId} port has no ${DUCT_SERVICE_LABEL[hit.service].toLowerCase()} duct.`,
      selection: { kind: 'equipment', id: item.id },
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  return issues;
}
