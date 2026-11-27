import { getProduct } from './catalog';
import { designFlow, placedPorts, unitFlows, unitSections } from './airUnits';
import { isLiquidLoop, isPiped } from './controls';
import { siteMissing, siteOf } from './climate';
import { getDuctProduct, streamFor } from './ductCatalog';
import { DUCT_SERVICE_LABEL, ductAreaM2, ductFlows, ductViewOf, isOpenEnd, openPorts } from './ducts';
import { formatFlow } from './units';
import { planningIssues } from './issues';
import { getLoadProduct } from './loadCatalog';
import { hoodOver } from './loads';
import type { DuctService, Project, Selection } from './types';
import { isOccupiedUse } from './spaceUses';

export type BuildStep = 'spaces' | 'loads' | 'systems' | 'check';

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
    case 'site':
      return 'loads';
    case 'equipment':
    case 'system':
    case 'loop':
    case 'point':
    case 'section':
    case 'unit-duct':
    case 'duct':
      return 'systems';
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
      step: row.id.startsWith('hood-') ? 'systems' : 'spaces',
      severity: 'planning',
      message: row.message,
      selection: row.selection,
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  const missingSite = siteMissing(siteOf(project));
  if (project.rooms.length > 0 && missingSite.length > 0) {
    issues.push({
      id: 'site-climate',
      step: 'loads',
      severity: 'planning',
      message: `Site and climate is missing ${missingSite.join(', ')}.`,
      selection: { kind: 'site' },
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  const loads = project.loads ?? [];
  for (const room of project.rooms) {
    if (!isOccupiedUse(room.use)) continue;
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
    if (!product || item.systemId || placedPorts(item).length === 0) continue;
    issues.push({
      id: `eq-system-${item.id}`,
      step: 'systems',
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
      step: 'systems',
      severity: 'planning',
      message: `${equipmentName(project, hit.equipmentId)} ${hit.portId} port has no ${DUCT_SERVICE_LABEL[hit.service].toLowerCase()} duct.`,
      selection: { kind: 'equipment', id: item.id },
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  issues.push(...airIssues(project));
  issues.push(...controlIssues(project));
  return issues;
}

/** Coil piping and controls: loops, valves, and tags. Coil performance is left to the solver. */
function controlIssues(project: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const loops = project.plantLoops ?? [];
  const tags = new Map<string, number>();
  const count = (tag: string) => {
    const key = tag.trim().toUpperCase();
    if (key) tags.set(key, (tags.get(key) ?? 0) + 1);
  };
  for (const item of project.equipment) {
    const product = getProduct(item.catalogId);
    if (!product?.unit) continue;
    const sections = unitSections(item);
    for (const section of sections) {
      for (const valve of section.valves ?? []) count(valve.tag);
      if (section.kind !== 'cooling-coil' && section.kind !== 'heating-coil') continue;
      const name = `${section.kind === 'cooling-coil' ? 'Cooling' : 'Heating'} coil on ${product.model}`;
      const show = { kind: 'equipment' as const, id: item.id };
      // A DX coil without a loop is the unit's own refrigerant circuit, as on a packaged rooftop.
      if (isPiped(section.medium) && section.medium !== 'dx' && !section.loopId) {
        issues.push({ id: `coil-loop-${item.id}-${section.id}`, step: 'systems', severity: 'planning', message: `${name} is not piped to a plant loop.`, selection: show, fix: { kind: 'select' }, fixLabel: 'Show' });
        continue;
      }
      const loop = loops.find(entry => entry.id === section.loopId);
      if (loop && isLiquidLoop(loop) && !(section.valves ?? []).some(valve => valve.kind === 'two-way' || valve.kind === 'three-way')) {
        issues.push({ id: `coil-valve-${item.id}-${section.id}`, step: 'systems', severity: 'planning', message: `${name} has no 2-way or 3-way control valve.`, selection: show, fix: { kind: 'select' }, fixLabel: 'Show' });
      }
    }
  }
  for (const point of project.controlPoints ?? []) count(point.tag);
  for (const [tag, uses] of tags) {
    if (uses < 2) continue;
    issues.push({ id: `tag-${tag}`, step: 'systems', severity: 'warning', message: `Control tag ${tag} is used ${uses} times.`, selection: null, fix: { kind: 'select' }, fixLabel: 'Show' });
  }
  return issues;
}

const FPM = 0.00508;

/** Network checks: open ends, unit airflow against its terminals, duct velocity, and building air balance. */
function airIssues(project: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const units = project.units;
  const flows = ductFlows(project);
  for (const run of project.ducts ?? []) {
    if (ductViewOf(run) !== 'plan') continue;
    const system = project.systems.find(item => item.id === run.systemId);
    const label = system ? streamFor(system.kind, run.service)?.label ?? DUCT_SERVICE_LABEL[run.service] : DUCT_SERVICE_LABEL[run.service];
    const open = [run.start, run.end].filter(isOpenEnd).length;
    if (open > 0) {
      issues.push({
        id: `duct-open-${run.id}`,
        step: 'systems',
        severity: 'planning',
        message: `${label} duct has ${open === 2 ? 'two open ends' : 'an open end'}. End it at a terminal, a unit port, or another run.`,
        selection: { kind: 'duct', id: run.id },
        fix: { kind: 'select' },
        fixLabel: 'Show',
      });
    }
    const flow = flows.runs.get(run.id)?.flowM3s;
    const product = getDuctProduct(run.catalogId);
    if (flow != null && flow > 0) {
      const velocity = flow / ductAreaM2(run);
      if (product?.group === 'Grease' && velocity < 500 * FPM) {
        issues.push({
          id: `duct-grease-${run.id}`,
          step: 'systems',
          severity: 'warning',
          message: `Grease duct velocity is ${Math.round(velocity / FPM)} fpm. NFPA 96 asks for at least 500 fpm; use a smaller duct.`,
          selection: { kind: 'duct', id: run.id },
          fix: { kind: 'select' },
          fixLabel: 'Show',
        });
      } else if (product?.group !== 'Grease' && velocity > 2000 * FPM) {
        issues.push({
          id: `duct-fast-${run.id}`,
          step: 'systems',
          severity: 'planning',
          message: `${label} duct runs at ${Math.round(velocity / FPM)} fpm for ${formatFlow(flow, units)}. Low-pressure duct is usually kept under about 1,500–2,000 fpm.`,
          selection: { kind: 'duct', id: run.id },
          fix: { kind: 'select' },
          fixLabel: 'Show',
        });
      }
    }
  }
  for (const source of flows.sources) {
    if (source.portM3s == null || source.terminals === 0 || source.partial) continue;
    const gap = Math.abs(source.terminalsM3s - source.portM3s);
    if (gap <= source.portM3s * 0.1) continue;
    const item = project.equipment.find(entry => entry.id === source.equipmentId);
    const product = item ? getProduct(item.catalogId) : undefined;
    issues.push({
      id: `air-balance-${source.equipmentId}-${source.portId}`,
      step: 'systems',
      severity: 'warning',
      message: `${product?.model ?? 'Unit'} ${source.portId} is set to ${formatFlow(source.portM3s, units)}, but ${source.terminals === 1 ? 'its terminal takes' : `its ${source.terminals} terminals add up to`} ${formatFlow(source.terminalsM3s, units)}.`,
      selection: { kind: 'equipment', id: source.equipmentId },
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  // An exhausted restroom with no supply needs a path for its make-up air: a transfer grille in or beside the door.
  for (const room of project.rooms) {
    const inRoom = project.equipment.filter(item => item.roomId === room.id);
    const exhaust = inRoom
      .filter(item => getProduct(item.catalogId)?.category === 'bathroom-exhaust')
      .reduce((sum, item) => sum + (designFlow(item) ?? 0) * item.quantity, 0);
    if (exhaust <= 0) continue;
    const inflow = inRoom
      .filter(item => item.catalogId.startsWith('grille-transfer') || item.catalogId.startsWith('diff'))
      .reduce((sum, item) => sum + (designFlow(item) ?? 0) * item.quantity, 0);
    if (inflow >= exhaust * 0.8) continue;
    issues.push({
      id: `transfer-${room.id}`,
      step: 'systems',
      severity: 'warning',
      message: inflow > 0
        ? `${room.name} exhausts ${formatFlow(exhaust, units)} but its transfer grilles and supply pass only ${formatFlow(inflow, units)}. Add free area so the make-up air can get in with the door closed.`
        : `${room.name} exhausts ${formatFlow(exhaust, units)} with no supply and no transfer grille. A door undercut passes only about 30–50 CFM quietly; add a transfer grille in or beside the door.`,
      selection: { kind: 'room', id: room.id },
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  let outdoor = 0;
  let exhaust = 0;
  for (const item of project.equipment) {
    const product = getProduct(item.catalogId);
    if (!product) continue;
    if (product.unit) {
      const flows = unitFlows(item);
      outdoor += (flows.outdoor ?? 0) * item.quantity;
      if (unitSections(item).some(section => section.kind === 'heat-recovery')) exhaust += (flows.exhaust ?? 0) * item.quantity;
    } else if (product.category === 'exhaust-fan' || product.category === 'bathroom-exhaust') {
      exhaust += (designFlow(item) ?? 0) * item.quantity;
    }
  }
  if (exhaust > 0 && outdoor > 0 && exhaust > outdoor * 1.02) {
    issues.push({
      id: 'air-building-balance',
      step: 'systems',
      severity: 'warning',
      message: `Exhaust fans remove ${formatFlow(exhaust, units)} but units bring in only ${formatFlow(outdoor, units)} of outdoor air. The building runs negative; raise make-up or outdoor air.`,
      selection: null,
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  } else if (exhaust > 0 && outdoor > 0) {
    issues.push({
      id: 'air-building-balance',
      step: 'systems',
      severity: 'planning',
      message: `Outdoor air ${formatFlow(outdoor, units)} against exhaust ${formatFlow(exhaust, units)}: building is ${outdoor - exhaust > 0 ? `positive by ${formatFlow(outdoor - exhaust, units)}` : 'balanced'}. Planning values only.`,
      selection: null,
      fix: { kind: 'select' },
      fixLabel: 'Show',
    });
  }
  return issues;
}
